import { useState, useEffect } from 'react';
import { useAdmin } from './AdminContext';

export function AdminToolbar() {
  const { auth, editMode, setEditMode, dirty, saving, savedAt, save, discard, logout, error } = useAdmin();
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (savedAt) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [savedAt]);

  // Préviens avant de quitter la page si dirty.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!auth.authenticated || !editMode) return null;

  return (
    <div className="admin-toolbar" role="toolbar" aria-label="Barre d'édition admin">
      <div className="admin-toolbar-left">
        <span className="admin-toolbar-status">
          <span className="admin-toolbar-dot" data-state={dirty ? 'dirty' : 'clean'} />
          {saving ? 'Sauvegarde…' :
           dirty ? 'Modifications non sauvegardées' :
           justSaved ? 'Sauvegardé ✓' : 'Mode édition'}
        </span>
        {error && <span className="admin-toolbar-error">⚠ {error}</span>}
      </div>
      <div className="admin-toolbar-right">
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          onClick={discard}
          disabled={!dirty || saving}
          title="Annuler les modifications non sauvegardées"
        >Annuler</button>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={save}
          disabled={!dirty || saving}
        >{saving ? '…' : 'Enregistrer'}</button>
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          onClick={() => setEditMode(false)}
          title="Quitter le mode édition"
        >Aperçu</button>
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          onClick={logout}
          title="Se déconnecter"
        >Déconnexion</button>
      </div>
    </div>
  );
}

export function AdminLoginModal() {
  const { showLogin, setShowLogin, login } = useAdmin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!showLogin) {
      setErr(null);
      setUsername('');
      setPassword('');
    }
  }, [showLogin]);

  if (!showLogin) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await login(username.trim(), password);
    setBusy(false);
    if (!r.ok) setErr(r.error || 'Identifiants invalides');
  };

  return (
    <div className="admin-modal-backdrop" onClick={() => setShowLogin(false)}>
      <form
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <header className="admin-modal-head">
          <strong>Espace administrateur</strong>
          <button
            type="button"
            className="admin-modal-close"
            onClick={() => setShowLogin(false)}
            aria-label="Fermer"
          >×</button>
        </header>
        <p className="admin-modal-intro">
          Connectez-vous pour modifier le contenu du site.
        </p>
        <label className="admin-field">
          <span>Identifiant</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="admin-field">
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </label>
        {err && <div className="admin-form-error">{err}</div>}
        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowLogin(false)}>
            Annuler
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Bouton flottant "+" pour ajouter un item dans une liste, ou "×" pour retirer.
 * Affiché uniquement en mode admin.
 */
export function ListControls({ path, index, template, onAdd, onRemove }) {
  const { content, setField, editMode, auth } = useAdmin();
  if (!editMode || !auth.authenticated) return null;

  const arr = path ? (getPath(content, path) || []) : null;

  const handleAdd = () => {
    if (typeof onAdd === 'function') {
      onAdd();
      return;
    }
    if (!path) return;
    const next = Array.isArray(arr) ? [...arr] : [];
    const item = typeof template === 'function' ? template() : structuredClone(template || {});
    if (typeof index === 'number') next.splice(index + 1, 0, item);
    else next.push(item);
    setField(path, next);
  };

  const handleRemove = () => {
    if (typeof onRemove === 'function') {
      onRemove();
      return;
    }
    if (!path || typeof index !== 'number' || !Array.isArray(arr)) return;
    const next = arr.filter((_, i) => i !== index);
    setField(path, next);
  };

  return (
    <span className="admin-list-controls" aria-hidden="false">
      <button type="button" className="admin-list-btn" onClick={handleAdd} title="Ajouter">+</button>
      {typeof index === 'number' && (
        <button type="button" className="admin-list-btn admin-list-btn-danger" onClick={handleRemove} title="Supprimer">×</button>
      )}
    </span>
  );
}

function getPath(obj, path) {
  if (!obj) return undefined;
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[/^\d+$/.test(p) ? Number(p) : p];
  }
  return cur;
}
