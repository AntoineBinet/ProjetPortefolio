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
  if (Array.isArray(override)) return override;
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
  // auth = { authenticated, must_change_password }
  const [auth, setAuth] = useState({ authenticated: false, must_change_password: false });
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
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
        .catch(() => ({ authenticated: false, must_change_password: false })),
    ]).then(([c, a]) => {
      if (cancelled) return;
      if (c && typeof c === 'object') {
        const merged = deepMerge(UP_DATA, c);
        setContent(merged);
        lastSavedRef.current = merged;
      } else {
        lastSavedRef.current = UP_DATA;
      }
      setAuth(a || { authenticated: false, must_change_password: false });
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

  const login = useCallback(async (password) => {
    setError(null);
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        setAuth({
          authenticated: true,
          must_change_password: !!data.must_change_password,
        });
        setShowLogin(false);
        setEditMode(true);
        if (data.must_change_password) {
          setShowChangePassword(true);
        }
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Mot de passe incorrect' };
    } catch (e) {
      return { ok: false, error: e.message || 'Erreur réseau' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    setAuth({ authenticated: false, must_change_password: false });
    setEditMode(false);
  }, []);

  const changePassword = useCallback(async (oldPassword, newPassword) => {
    try {
      const r = await fetch(`${API}/auth/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        setAuth({
          authenticated: true,
          must_change_password: !!data.must_change_password,
        });
        return { ok: true };
      }
      return { ok: false, error: data.error || `Erreur ${r.status}` };
    } catch (e) {
      return { ok: false, error: e.message || 'Erreur réseau' };
    }
  }, []);

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

  // Toggle édition → si on quitte le mode édition avec dirty, on sauve d'abord.
  const exitEditMode = useCallback(async () => {
    if (dirty && !saving) {
      const r = await save();
      if (!r.ok) return r;
    }
    setEditMode(false);
    return { ok: true };
  }, [dirty, saving, save]);

  const value = useMemo(() => ({
    content, loaded,
    auth, editMode, setEditMode,
    dirty, saving, savedAt, error,
    setField, setFields, save, discard, exitEditMode,
    login, logout, changePassword, uploadImage,
    showLogin, setShowLogin,
    showChangePassword, setShowChangePassword,
    get: (path) => getByPath(content, path),
  }), [content, loaded, auth, editMode, dirty, saving, savedAt, error,
       setField, setFields, save, discard, exitEditMode,
       login, logout, changePassword, uploadImage,
       showLogin, showChangePassword]);

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
