import UpLogo from './UpLogo';
import Icon from './Icon';
import { useAdmin, useContent } from '../admin/AdminContext';

export default function Nav({ active, onNav, dark }) {
  const data = useContent();
  const {
    auth, editMode, setEditMode, setShowLogin, loaded,
    dirty, saving, exitEditMode,
  } = useAdmin();

  const links = data.navLinks || [
    { id: 'home',       label: "What's Up ?" },
    { id: 'activites',  label: 'Activité' },
    { id: 'carriere',   label: 'Carrière' },
    { id: 'agences',    label: 'Nos Agences' },
    { id: 'actualites', label: 'Actualités' },
  ];

  const lockTitle = !loaded
    ? 'Vérification de la session…'
    : editMode
      ? (dirty
          ? 'Verrouiller : enregistrer les modifications et quitter le mode édition'
          : 'Verrouiller : quitter le mode édition')
      : 'Activer le mode édition (mot de passe requis)';

  const onLockClick = async (e) => {
    e.preventDefault();
    if (!loaded || saving) return;
    if (editMode) {
      // Cadenas refermé : sauve si nécessaire puis sort du mode édition
      await exitEditMode();
      return;
    }
    // Toujours redemander le mot de passe avant d'entrer en mode édition,
    // même si la session est déjà authentifiée — évite les activations accidentelles.
    setShowLogin(true);
  };

  const lockClass = [
    'nav-icon-btn',
    !loaded ? 'is-admin-loading' : '',
    auth.authenticated ? 'is-admin-loggedin' : '',
    editMode ? 'is-admin-on' : '',
    dirty ? 'is-admin-dirty' : '',
  ].filter(Boolean).join(' ');

  return (
    <nav className={`nav ${dark ? 'is-dark' : ''}`}>
      <a href="#home" onClick={e => { e.preventDefault(); onNav('home'); }} className="nav-brand">
        <UpLogo dark={dark} size={1} />
      </a>
      <div className="nav-links">
        {links.map(l => (
          <a key={l.id} href={`#${l.id}`}
            className={`nav-link ${active === l.id ? 'active' : ''}`}
            onClick={e => { e.preventDefault(); onNav(l.id); }}>
            {l.label}
          </a>
        ))}
      </div>
      <div className="nav-icons">
        <button
          type="button"
          className={lockClass}
          onClick={onLockClick}
          title={lockTitle}
          aria-label={lockTitle}
          style={{ position: 'relative' }}
        ><Icon name={editMode ? 'unlock' : 'lock'} size={16}/></button>
        <a className="nav-icon-btn"
           href={data.contact?.linkedin || '#'}
           target="_blank" rel="noopener noreferrer"
           title="LinkedIn"
           aria-label="Page LinkedIn"
        ><Icon name="linkedin" size={16}/></a>
        <a className="nav-icon-btn"
           href={`mailto:${data.contact?.email || ''}`}
           title="Nous écrire"
           aria-label="Envoyer un email"
        ><Icon name="mail" size={16}/></a>
      </div>
    </nav>
  );
}
