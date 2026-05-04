import UpLogo from './UpLogo';
import Icon from './Icon';

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
      <a href="#home" onClick={e => { e.preventDefault(); onNav('home'); }}>
        <UpLogo color={dark ? '#fff' : '#EF8827'} textColor={dark ? '#fff' : '#11202A'} size={1} />
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
        <a className="nav-icon-btn" href="#" title="Intranet"><Icon name="lock" size={16}/></a>
        <a className="nav-icon-btn" href="#"><Icon name="search" size={16}/></a>
        <a className="nav-icon-btn" href="#"><Icon name="linkedin" size={16}/></a>
        <a className="nav-icon-btn" href="mailto:contact@up-technologies.fr"><Icon name="mail" size={16}/></a>
      </div>
    </nav>
  );
}
