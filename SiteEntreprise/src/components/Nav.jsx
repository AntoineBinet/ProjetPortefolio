import UpLogo from './UpLogo';
import Icon from './Icon';
import { useAdmin, useContent } from '../admin/AdminContext';

export default function Nav({ active, onNav, dark }) {
  const data = useContent();
  const { auth, editMode, setEditMode, setShowLogin, loaded } = useAdmin();

  const links = data.navLinks || [
    { id: 'home',       label: "What's Up ?" },
    { id: 'activites',  label: 'Activité' },
    { id: 'carriere',   label: 'Carrière' },
    { id: 'agences',    label: 'Nos Agences' },
    { id: 'actualites', label: 'Actualités' },
  ];

  const lockTitle = !loaded
    ? 'Vérification de la session…'
    : !auth.authenticated
      ? 'Espace administrateur — connexion'
      : editMode
        ? 'Quitter le mode édition'
        : auth.source === 'portfolio'
          ? 'Activer le mode édition (session portefolio)'
          : 'Activer le mode édition';

  const onLockClick = (e) => {
    e.preventDefault();
    if (!loaded) return;  // évite la race condition (clic avant que /auth/me réponde)
    if (auth.authenticated) {
      setEditMode(!editMode);
    } else {
      setShowLogin(true);
    }
  };

  const lockClass = [
    'nav-icon-btn',
    !loaded ? 'is-admin-loading' : '',
    auth.authenticated ? 'is-admin-loggedin' : '',
    editMode ? 'is-admin-on' : '',
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
        ><Icon name="lock" size={16}/></button>
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
