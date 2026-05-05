import { useEffect, useState, useCallback } from 'react';
import { useAdmin } from './AdminContext';

export function UsersModal() {
  const {
    showUsers, setShowUsers,
    fetchUsers, createUser, updateUser, deleteUser,
    auth,
  } = useAdmin();

  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);  // username being edited
  const [newPassword, setNewPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPass, setCreatePass] = useState('');
  const [busyAction, setBusyAction] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok, status, data } = await fetchUsers();
    if (ok) {
      setUsers(data.users || []);
      setCurrentUser(data.current_user);
    } else {
      setError(data.error || `Erreur ${status}`);
    }
    setLoading(false);
  }, [fetchUsers]);

  useEffect(() => {
    if (showUsers) reload();
  }, [showUsers, reload]);

  useEffect(() => {
    if (!showUsers) {
      setEditingUser(null);
      setNewPassword('');
      setNewUsername('');
      setCreateName('');
      setCreatePass('');
      setError(null);
    }
  }, [showUsers]);

  if (!showUsers) return null;

  const onCreate = async (e) => {
    e.preventDefault();
    setBusyAction('create');
    setError(null);
    const { ok, data } = await createUser(createName.trim(), createPass);
    setBusyAction(null);
    if (!ok) { setError(data.error || 'Erreur'); return; }
    setCreateName('');
    setCreatePass('');
    reload();
  };

  const onSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    const updates = {};
    if (newPassword) updates.password = newPassword;
    if (newUsername && newUsername !== editingUser) updates.newUsername = newUsername.trim();
    if (Object.keys(updates).length === 0) {
      setEditingUser(null);
      return;
    }
    setBusyAction(`edit-${editingUser}`);
    setError(null);
    const { ok, data } = await updateUser(editingUser, updates);
    setBusyAction(null);
    if (!ok) { setError(data.error || 'Erreur'); return; }
    setEditingUser(null);
    setNewPassword('');
    setNewUsername('');
    reload();
  };

  const onDelete = async (username) => {
    if (!confirm(`Supprimer définitivement l'utilisateur "${username}" ?`)) return;
    setBusyAction(`del-${username}`);
    setError(null);
    const { ok, data } = await deleteUser(username);
    setBusyAction(null);
    if (!ok) { setError(data.error || 'Erreur'); return; }
    reload();
  };

  return (
    <div className="admin-modal-backdrop" onClick={() => setShowUsers(false)}>
      <div
        className="admin-modal admin-modal-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Gestion des utilisateurs"
      >
        <header className="admin-modal-head">
          <strong>Utilisateurs Up Technologies</strong>
          <button
            type="button"
            className="admin-modal-close"
            onClick={() => setShowUsers(false)}
            aria-label="Fermer"
          >×</button>
        </header>
        <p className="admin-modal-intro">
          Comptes admin propres au site démo (séparés de ceux du portefolio).
          {auth.source === 'portfolio' && (
            <>
              {' '}Vous êtes actuellement connecté via la session du portefolio
              — vous pouvez créer un compte dédié au site démo ci-dessous.
            </>
          )}
        </p>

        {error && <div className="admin-form-error">{error}</div>}

        <div className="admin-users-list">
          {loading && users.length === 0 && (
            <div className="admin-users-empty">Chargement…</div>
          )}
          {users.map(u => {
            const isMe = u.username === currentUser;
            const isEditing = editingUser === u.username;
            return (
              <div key={u.id} className={`admin-users-row ${isEditing ? 'is-editing' : ''}`}>
                {!isEditing ? (
                  <>
                    <div className="admin-users-name">
                      {u.username}
                      {isMe && <span className="admin-users-badge">vous</span>}
                    </div>
                    <div className="admin-users-meta">
                      Créé le {String(u.created_at).slice(0, 10)}
                    </div>
                    <div className="admin-users-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost"
                        onClick={() => {
                          setEditingUser(u.username);
                          setNewUsername(u.username);
                          setNewPassword('');
                        }}
                      >Modifier</button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger"
                        onClick={() => onDelete(u.username)}
                        disabled={users.length <= 1 || busyAction === `del-${u.username}`}
                        title={users.length <= 1 ? "Impossible de supprimer le dernier compte" : ''}
                      >{busyAction === `del-${u.username}` ? '…' : 'Supprimer'}</button>
                    </div>
                  </>
                ) : (
                  <form className="admin-users-edit" onSubmit={onSaveEdit}>
                    <label className="admin-field">
                      <span>Identifiant</span>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value)}
                        autoFocus
                      />
                    </label>
                    <label className="admin-field">
                      <span>Nouveau mot de passe (laisser vide pour ne pas changer)</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </label>
                    <div className="admin-modal-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost"
                        onClick={() => { setEditingUser(null); setNewPassword(''); setNewUsername(''); }}
                      >Annuler</button>
                      <button
                        type="submit"
                        className="admin-btn admin-btn-primary"
                        disabled={busyAction === `edit-${u.username}`}
                      >{busyAction === `edit-${u.username}` ? '…' : 'Enregistrer'}</button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>

        <details className="admin-users-create">
          <summary>+ Ajouter un utilisateur</summary>
          <form onSubmit={onCreate}>
            <label className="admin-field">
              <span>Identifiant</span>
              <input
                type="text"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="ex. client"
                required
              />
            </label>
            <label className="admin-field">
              <span>Mot de passe (min 4 caractères)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={createPass}
                onChange={e => setCreatePass(e.target.value)}
                required
                minLength={4}
              />
            </label>
            <div className="admin-modal-actions">
              <button
                type="submit"
                className="admin-btn admin-btn-primary"
                disabled={busyAction === 'create'}
              >{busyAction === 'create' ? 'Création…' : 'Créer'}</button>
            </div>
          </form>
        </details>

        <footer className="admin-modal-foot">
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => setShowUsers(false)}
          >Fermer</button>
        </footer>
      </div>
    </div>
  );
}
