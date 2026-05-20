import UpLogo from './UpLogo';
import Icon from './Icon';
import { useContent } from '../admin/AdminContext';
import { Editable, EditableLink, NavGuardLink } from '../admin/Editable';

export default function Footer() {
  const c = useContent();
  const docs = c.documents || [];
  const contact = c.contact || {};
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <UpLogo dark size={1.2}/>
            <Editable as="p" className="footer-tag" path="footer.tag" multiline />
            <EditableLink path="contact.siteOriginal" href={contact.siteOriginal || '#'} target="_blank" rel="noopener noreferrer" className="footer-original">
              <Editable path="footer.originalLabel" /> <Icon name="arrow" size={12}/>
            </EditableLink>
          </div>
          <div>
            <h4>Site</h4>
            <ul>
              <li><NavGuardLink href="#home">What's Up ?</NavGuardLink></li>
              <li><NavGuardLink href="#activites">Activité</NavGuardLink></li>
              <li><NavGuardLink href="#carriere">Carrière</NavGuardLink></li>
              <li><NavGuardLink href="#agences">Nos Agences</NavGuardLink></li>
              <li><NavGuardLink href="#actualites">Actualités</NavGuardLink></li>
              <li><NavGuardLink href="/site-entreprise/pack-logo.html" target="_blank" rel="noopener noreferrer">Logo</NavGuardLink></li>
            </ul>
          </div>
          <div>
            <h4>Documents</h4>
            <ul>
              {docs.slice(0, 5).map((d, i) => (
                <li key={i}>
                  <EditableLink path={`documents.${i}.url`} href={d.url} target="_blank" rel="noopener noreferrer">
                    <Editable path={`documents.${i}.label`} />
                  </EditableLink>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li>
                <EditableLink path="contact.emailHref" href={`mailto:${contact.email || ''}`}>
                  <Editable path="contact.email" />
                </EditableLink>
              </li>
              <li>
                <EditableLink path="contact.telHref" href={contact.telHref || '#'}>
                  <Editable path="contact.tel" />
                </EditableLink>
              </li>
              <li>
                <EditableLink path="contact.linkedin" href={contact.linkedin || '#'} target="_blank" rel="noopener noreferrer">
                  LinkedIn
                </EditableLink>
              </li>
              <li>
                <EditableLink path="contact.intranet" href={contact.intranet || '#'} target="_blank" rel="noopener noreferrer">
                  Espace intranet
                </EditableLink>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <Editable as="span" path="footer.copyright" />
          <div className="footer-social">
            <EditableLink path="contact.linkedin" href={contact.linkedin || '#'} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <Icon name="linkedin" size={16}/>
            </EditableLink>
            <EditableLink path="contact.emailHref" href={`mailto:${contact.email || ''}`} aria-label="Email">
              <Icon name="mail" size={16}/>
            </EditableLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
