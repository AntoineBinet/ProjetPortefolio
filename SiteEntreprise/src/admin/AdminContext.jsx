import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { UP_DATA } from '../data';

const AdminContext = createContext(null);

const API = '/site-entreprise/api';

function deepClone(o) {
  if (typeof structuredClone === 'function') return structuredClone(o);
  return JSON.parse(JSON.stringify(o));
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    const key = /^\d+$/.test(p) ? Number(p) : p;
    cur = cur[key];
  }
  return cur;
}

function deepMerge(base, override) {
  if (override == null) return base;
  if (base == null) return override;
  if (Array.isArray(override)) return override;          // arrays replace
  if (typeof base !== 'object' || typeof override !== 'object') return override;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    out[k] = deepMerge(base[k], override[k]);
  }
  return out;
}

function setByPath(obj, path, value) {
  const parts = String(path).split('.').filter(Boolean);
  if (parts.length === 0) return value;
  const next = deepClone(obj || {});
  let cur = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (cur[k] == null) cur[k] = (/^\d+$/.test(parts[i + 1]) ? [] : {});
    cur = cur[k];
  }
  const last = parts[parts.length - 1];
  cur[/^\d+$/.test(last) ? Number(last) : last] = value;
  return next;
}

export function AdminProvider({ children }) {
  const [content, setContent] = useState(UP_DATA);
  const [loaded, setLoaded] = useState(false);
  const [auth, setAuth] = useState({ authenticated: false, user: null, source: null });
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [error, setError] = useState(null);
  const lastSavedRef = useRef(null);

  // Charge le contenu et le statut auth au démarrage.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${API}/content`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${API}/auth/me`, { credentials: 'include' })
        .then(r => r.json())
        .catch(() => ({ authenticated: false })),
    ]).then(([c, a]) => {
      if (cancelled) return;
      if (c && typeof c === 'object') {
        // Deep merge avec les défauts pour rester robuste si content.json est
        // partiel ou corrompu (ex. clé manquante après un schéma plus récent).
        const merged = deepMerge(UP_DATA, c);
        setContent(merged);
        lastSavedRef.current = merged;
      } else {
        lastSavedRef.current = UP_DATA;
      }
      setAuth(a || { authenticated: false, user: null, source: null });
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const setField = useCallback((path, value) => {
    setContent(prev => {
      const next = setByPath(prev, path, value);
      setDirty(true);
      return next;
    });
  }, []);

  const setFields = useCallback((updates) => {
    // updates : array de [path, value]
    setContent(prev => {
      let next = prev;
      for (const [p, v] of updates) next = setByPath(next, p, v);
      setDirty(true);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API}/content`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        setDirty(false);
        setSavedAt(Date.now());
        lastSavedRef.current = content;
        return { ok: true };
      }
      setError(data.error || `Erreur ${r.status}`);
      return { ok: false, error: data.error };
    } catch (e) {
      setError(e.message || 'Erreur réseau');
      return { ok: false, error: e.message };
    } finally {
      setSaving(false);
    }
  }, [content]);

  const discard = useCallback(() => {
    if (lastSavedRef.current) setContent(lastSavedRef.current);
    setDirty(false);
  }, []);

  const login = useCallback(async (username, password) => {
    setError(null);
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        setAuth({ authenticated: true, user: data.user || username, source: data.source || 'site' });
        setShowLogin(false);
        setEditMode(true);
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Identifiants invalides' };
    } catch (e) {
      return { ok: false, error: e.message || 'Erreur réseau' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    // On re-fetch /api/auth/me : si la session Portfolio est encore là, on
    // reste admin via "portfolio". Sinon, l'auth retombe à false.
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
      const me = await r.json().catch(() => ({ authenticated: false }));
      setAuth(me);
    } catch {
      setAuth({ authenticated: false, user: null, source: null });
    }
    setEditMode(false);
  }, []);

  // ---- User management ----

  const apiUsers = useCallback(async (path = '', init = {}) => {
    const r = await fetch(`${API}/admin/users${path}`, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok && data.ok !== false, status: r.status, data };
  }, []);

  const fetchUsers = useCallback(async () => apiUsers(''), [apiUsers]);

  const createUser = useCallback(async (username, password) =>
    apiUsers('', { method: 'POST', body: JSON.stringify({ username, password }) }),
  [apiUsers]);

  const updateUser = useCallback(async (username, { password, newUsername } = {}) =>
    apiUsers(`/${encodeURIComponent(username)}`, {
      method: 'POST',
      body: JSON.stringify({
        ...(password ? { password } : {}),
        ...(newUsername ? { new_username: newUsername } : {}),
      }),
    }),
  [apiUsers]);

  const deleteUser = useCallback(async (username) =>
    apiUsers(`/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  [apiUsers]);

  const uploadImage = useCallback(async (file) => {
    if (!file) return { ok: false, error: 'Aucun fichier' };
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${API}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) return { ok: true, url: data.url };
      return { ok: false, error: data.error || `Erreur ${r.status}` };
    } catch (e) {
      return { ok: false, error: e.message || 'Erreur réseau' };
    }
  }, []);

  const [showUsers, setShowUsers] = useState(false);

  const value = useMemo(() => ({
    content, loaded,
    auth, editMode, setEditMode,
    dirty, saving, savedAt, error,
    setField, setFields, save, discard,
    login, logout, uploadImage,
    showLogin, setShowLogin,
    showUsers, setShowUsers,
    fetchUsers, createUser, updateUser, deleteUser,
    get: (path) => getByPath(content, path),
  }), [content, loaded, auth, editMode, dirty, saving, savedAt, error,
       setField, setFields, save, discard, login, logout, uploadImage,
       showLogin, showUsers,
       fetchUsers, createUser, updateUser, deleteUser]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside <AdminProvider>');
  return ctx;
}

export function useContent() {
  return useAdmin().content;
}

export function useEditable() {
  const { editMode, auth } = useAdmin();
  return editMode && auth.authenticated;
}

export { getByPath };
