import { useState } from 'react';
import Icon from '../components/Icon';
import { UP_DATA } from '../data';

const SITE = 'https://up-technologies.fr';

function articleUrl(slug) {
  // Le site officiel utilise une URL en /YYYY/MM/DD/slug/, mais /?p=… ou /actualites/
  // marchent comme fallback. On pointe vers la rubrique blog où l'article est listé.
  return `${SITE}/actualites/`;
}

export default function Actualites() {
  const items = UP_DATA.actualites;
  const [filter, setFilter] = useState('Tous');
  const tags = ['Tous', ...Array.from(new Set(items.map(i => i.tag)))];
  const list = filter === 'Tous' ? items : items.filter(i => i.tag === filter);
  const [feature, ...rest] = list;

  return (
    <section className="n-section" id="actualites">
      <div className="container n-head">
        <div className="n-head-row">
          <div>
            <div className="kicker">Actualités · journal de bord</div>
            <h2 className="display">L'année <em>en mouvement.</em></h2>
            <p className="lead">
              Certifications, ouvertures d'agence, événements, projets phares —
              les temps forts d'Up Technologies depuis 2022.
            </p>
          </div>
          <div className="n-filters">
            {tags.map(t => (
              <button key={t} className={`n-filter ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {feature && (
        <div className="container">
          <a href={articleUrl(feature.slug)} target="_blank" rel="noopener noreferrer" className="n-feature">
            <div className="n-feature-img">
              <div className="n-pattern p-0"/>
              <span className="n-feature-tag">{feature.tag}</span>
              <span className="n-feature-edition">Édition #{items.length}</span>
            </div>
            <div className="n-feature-body">
              <div className="n-feature-meta">
                <span>À LA UNE</span>
                <span>·</span>
                <span>{feature.date}</span>
              </div>
              <h3 className="n-feature-title">{feature.title}</h3>
              <p>{feature.excerpt}</p>
              <span className="n-feature-cta">Lire sur up-technologies.fr <Icon name="arrow" size={18}/></span>
            </div>
          </a>
        </div>
      )}

      <div className="container">
        <div className="n-grid">
          {rest.map((n, i) => (
            <a className="n-card" key={i + 1} href={articleUrl(n.slug)} target="_blank" rel="noopener noreferrer">
              <div className="n-card-img">
                <div className={`n-pattern p-${(i + 1) % 4}`}/>
              </div>
              <div className="n-card-body">
                <div className="n-card-meta">
                  <span className="n-card-tag">{n.tag}</span>
                  <span>{n.date}</span>
                </div>
                <h3>{n.title}</h3>
                <p>{n.excerpt}</p>
                <span className="n-card-arrow">↗</span>
              </div>
            </a>
          ))}
        </div>

        <div className="n-foot">
          <a className="btn btn-ghost" href={`${SITE}/actualites/`} target="_blank" rel="noopener noreferrer">
            Toutes les actualités sur up-technologies.fr <Icon name="arrow" size={14}/>
          </a>
        </div>
      </div>
    </section>
  );
}
