import UpLogo from './UpLogo';
import Icon from './Icon';
import { UP_DATA } from '../data';

export default function Footer() {
  const docs = UP_DATA.documents;
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <UpLogo color="#fff" textColor="rgba(255,255,255,0.7)" size={1.1}/>
            <p className="footer-tag">
              Conseil en ingénierie spécialisé en électronique, informatique embarquée
              et systèmes mécatroniques. 6 agences en France.
            </p>
            <a className="footer-original" href={UP_DATA.contact.siteOriginal} target="_blank" rel="noopener noreferrer">
              Site officiel · up-technologies.fr <Icon name="arrow" size={12}/>
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
              <li>
                <a href={docs[5].url} target="_blank" rel="noopener noreferrer">Charte RGPD</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li><a href={`mailto:${UP_DATA.contact.email}`}>{UP_DATA.contact.email}</a></li>
              <li><a href={UP_DATA.contact.telHref}>{UP_DATA.contact.tel}</a></li>
              <li><a href={UP_DATA.contact.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
              <li><a href={UP_DATA.contact.intranet} target="_blank" rel="noopener noreferrer">Espace intranet</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Up Technologies — Tous droits réservés</span>
          <div className="footer-social">
            <a href={UP_DATA.contact.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <Icon name="linkedin" size={16}/>
            </a>
            <a href={`mailto:${UP_DATA.contact.email}`} aria-label="Email">
              <Icon name="mail" size={16}/>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
