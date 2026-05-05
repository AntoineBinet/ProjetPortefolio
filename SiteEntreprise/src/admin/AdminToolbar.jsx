import { useState, useEffect } from 'react';
import { useAdmin } from './AdminContext';

export function AdminToolbar() {
  const {
    auth, editMode, exitEditMode,
    dirty, saving, savedAt, save, discard, logout, error,
    setShowChangePassword,
  } = useAdmin();
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
        <span className="admin-toolbar-hint">
          Astuce — clique sur le cadenas en haut à droite pour valider et quitter le mode édition.
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
          onClick={() => setShowChangePassword(true)}
          title="Changer le mot de passe admin"
        >Mot de passe</button>
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          onClick={exitEditMode}
          title="Sauvegarder et quitter le mode édition"
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
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!showLogin) {
      setErr(null);
      setPassword('');
    }
  }, [showLogin]);

  if (!showLogin) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await login(password);
    setBusy(false);
    if (!r.ok) setErr(r.error || 'Mot de passe incorrect');
  };

  return (
    <div className="admin-modal-backdrop" onClick={() => setShowLogin(false)}>
      <form
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <header className="admin-modal-head">
          <strong>Mode édition — Up Technologies</strong>
          <button
            type="button"
            className="admin-modal-close"
            onClick={() => setShowLogin(false)}
            aria-label="Fermer"
          >×</button>
        </header>
        <p className="admin-modal-intro">
          Entre le mot de passe admin pour déverrouiller le mode édition.
          Par défaut : <code>admin</code> (à changer immédiatement après la première connexion).
        </p>
        <label className="admin-field">
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {err && <div className="admin-form-error">{err}</div>}
        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowLogin(false)}>
            Annuler
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
            {busy ? 'Vérification…' : 'Déverrouiller'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ChangePasswordModal() {
  const { showChangePassword, setShowChangePassword, changePassword, auth } = useAdmin();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!showChangePassword) {
      setErr(null);
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } else if (auth.must_change_password) {
      // Pré-remplit l'ancien mot de passe au défaut quand c'est le premier
      // changement obligatoire.
      setOldPwd('admin');
    }
  }, [showChangePassword, auth.must_change_password]);

  if (!showChangePassword) return null;

  const forced = auth.must_change_password;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (newPwd.length < 4) {
      setErr('Mot de passe trop court (min 4 caractères)');
      return;
    }
    if (newPwd !== confirmPwd) {
      setErr('Les mots de passe ne correspondent pas');
      return;
    }
    setBusy(true);
    const r = await changePassword(oldPwd, newPwd);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || 'Erreur');
      return;
    }
    setShowChangePassword(false);
  };

  const onBackdropClick = () => {
    if (forced) return; // pas dismissible si premier changement
    setShowChangePassword(false);
  };

  return (
    <div className="admin-modal-backdrop" onClick={onBackdropClick}>
      <form
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <header className="admin-modal-head">
          <strong>{forced ? 'Sécuriser le compte admin' : 'Changer le mot de passe'}</strong>
          {!forced && (
            <button
              type="button"
              className="admin-modal-close"
              onClick={() => setShowChangePassword(false)}
              aria-label="Fermer"
            >×</button>
          )}
        </header>
        <p className="admin-modal-intro">
          {forced
            ? <>Tu utilises encore le mot de passe par défaut <code>admin</code>. Choisis-en un nouveau avant de continuer.</>
            : 'Le mot de passe est partagé pour le mode édition Up Technologies (un seul compte).'}
        </p>
        {!forced && (
          <label className="admin-field">
            <span>Mot de passe actuel</span>
            <input
              type="password"
              autoComplete="current-password"
              value={oldPwd}
              onChange={e => setOldPwd(e.target.value)}
              required
            />
          </label>
        )}
        <label className="admin-field">
          <span>Nouveau mot de passe (min 4)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            autoFocus={forced}
            required
            minLength={4}
          />
        </label>
        <label className="admin-field">
          <span>Confirmer</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)}
            required
            minLength={4}
          />
        </label>
        {err && <div className="admin-form-error">{err}</div>}
        <div className="admin-modal-actions">
          {!forced && (
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowChangePassword(false)}>
              Annuler
            </button>
          )}
          <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
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
