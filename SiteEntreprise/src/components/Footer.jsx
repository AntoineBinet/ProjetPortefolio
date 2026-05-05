import UpLogo from './UpLogo';
import Icon from './Icon';
import { useContent } from '../admin/AdminContext';
import { Editable } from '../admin/Editable';

export default function Footer() {
  const c = useContent();
  const docs = c.documents || [];
  const contact = c.contact || {};
  const f = c.footer || {};
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <UpLogo dark size={1.2}/>
            <Editable as="p" className="footer-tag" path="footer.tag" multiline />
            <a className="footer-original" href={contact.siteOriginal || '#'} target="_blank" rel="noopener noreferrer">
              <Editable path="footer.originalLabel" /> <Icon name="arrow" size={12}/>
            </a>
          </div>
          <div>
            <h4>Site</h4>
            <ul>
              <li><a href="#home">What's Up ?</a></li>
              <li><a href="#activites">Activité</a></li>
              <li><a href="#carriere">Carrière</a></li>
              <li><a href="#agences">Nos Agences</a></li>
              <li><a href="#actualites">Actualités</a></li>
            </ul>
          </div>
          <div>
            <h4>Documents</h4>
            <ul>
              {docs.slice(0, 4).map((d, i) => (
                <li key={i}>
                  <a href={d.url} target="_blank" rel="noopener noreferrer">{d.label}</a>
                </li>
              ))}
              {docs[5] && (
                <li>
                  <a href={docs[5].url} target="_blank" rel="noopener noreferrer">Charte RGPD</a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li><a href={`mailto:${contact.email || ''}`}><Editable path="contact.email" /></a></li>
              <li><a href={contact.telHref || '#'}><Editable path="contact.tel" /></a></li>
              <li><a href={contact.linkedin || '#'} target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
              <li><a href={contact.intranet || '#'} target="_blank" rel="noopener noreferrer">Espace intranet</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <Editable as="span" path="footer.copyright" />
          <div className="footer-social">
            <a href={contact.linkedin || '#'} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <Icon name="linkedin" size={16}/>
            </a>
            <a href={`mailto:${contact.email || ''}`} aria-label="Email">
              <Icon name="mail" size={16}/>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
