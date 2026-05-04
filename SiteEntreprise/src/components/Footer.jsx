import UpLogo from './UpLogo';
import Icon from './Icon';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <UpLogo color="#fff" textColor="rgba(255,255,255,0.7)" size={1.1}/>
            <p className="footer-tag">Conseil en ingénierie spécialisé en électronique, informatique embarquée et systèmes mécatroniques. 6 agences en France.</p>
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
            <h4>Qualité</h4>
            <ul>
              <li><a href="#">Politique Qualité</a></li>
              <li><a href="#">Code de conduite</a></li>
              <li><a href="#">Politique RGPD</a></li>
              <li><a href="#">Mentions légales</a></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li><a href="mailto:contact@up-technologies.fr">contact@up-technologies.fr</a></li>
              <li><a href="#">LinkedIn</a></li>
              <li><a href="#">Intranet</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Up Technologies</span>
          <div className="footer-social">
            <a href="#"><Icon name="linkedin" size={16}/></a>
            <a href="mailto:contact@up-technologies.fr"><Icon name="mail" size={16}/></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
