import UpLogo from './UpLogo';
import Icon from './Icon';
import { UP_DATA } from '../data';

const links = [
  { id: 'home', label: "What's Up ?" },
  { id: 'activites', label: 'Activité' },
  { id: 'carriere', label: 'Carrière' },
  { id: 'agences', label: 'Nos Agences' },
  { id: 'actualites', label: 'Actualités' },
];

export default function Nav({ active, onNav, dark }) {
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
        <a className="nav-icon-btn"
           href={UP_DATA.contact.intranet}
           target="_blank" rel="noopener noreferrer"
           title="Espace intranet"
           aria-label="Espace intranet"
        ><Icon name="lock" size={16}/></a>
        <a className="nav-icon-btn"
           href={UP_DATA.contact.linkedin}
           target="_blank" rel="noopener noreferrer"
           title="LinkedIn"
           aria-label="Page LinkedIn"
        ><Icon name="linkedin" size={16}/></a>
        <a className="nav-icon-btn"
           href={`mailto:${UP_DATA.contact.email}`}
           title="Nous écrire"
           aria-label="Envoyer un email"
        ><Icon name="mail" size={16}/></a>
      </div>
    </nav>
  );
}
