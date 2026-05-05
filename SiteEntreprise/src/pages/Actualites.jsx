import { useState } from 'react';
import Icon from '../components/Icon';
import { useContent } from '../admin/AdminContext';
import { Editable, EditableImage, EditableLink } from '../admin/Editable';
import { ListControls } from '../admin/AdminToolbar';
import medaille from '../assets/post-medaille.png';
import electronique from '../assets/post-electronique.png';
import defi from '../assets/post-power-up-defi.png';
import certif2x from '../assets/post-2-fois-certif.png';
import env from '../assets/post-objectifs-env.jpg';
import sophia from '../assets/post-nice-sophia.png';
import noel from '../assets/post-noel-2023.png';
import grenoble from '../assets/post-grenoble.png';
import sido from '../assets/post-sido.jpg';
import powerup from '../assets/post-power-up-grandit.png';

const covers = { medaille, electronique, defi, certif2x, env, sophia, noel, grenoble, sido, powerup };

const SITE = 'https://up-technologies.fr';

const articleTemplate = () => ({
  slug: `article-${Date.now()}`,
  cover: 'medaille',
  tag: 'À la une',
  date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
  title: 'Nouveau titre',
  excerpt: 'Description courte de l\'article — clique pour modifier.',
  url: SITE + '/actualites/',
});

export default function Actualites() {
  const c = useContent();
  const items = c.actualites || [];
  const [filter, setFilter] = useState('Tous');
  const tags = ['Tous', ...Array.from(new Set(items.map(i => i.tag).filter(Boolean)))];
  const list = filter === 'Tous' ? items : items.filter(i => i.tag === filter);
  const [feature, ...rest] = list;
  // index original utile pour les paths Editable
  const indexOf = (slug) => items.findIndex(it => it.slug === slug);
  const articleHref = (n) => n.url || `${SITE}/actualites/`;

  return (
    <section className="n-section" id="actualites">
      <div className="container n-head">
        <div className="n-head-row">
          <div>
            <Editable as="div" className="kicker" path="actualitesIntro.kicker" />
            <Editable as="h2" className="display" path="actualitesIntro.titleHtml" html />
            <Editable as="p" className="lead" path="actualitesIntro.lead" multiline />
          </div>
          <div className="n-filters">
            {tags.map(t => (
              <button key={t} className={`n-filter ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {feature && (() => {
        const fi = indexOf(feature.slug);
        return (
          <div className="container">
            <div className="n-feature-wrap">
              <EditableLink
                path={`actualites.${fi}.url`}
                href={articleHref(feature)}
                target="_blank"
                rel="noopener noreferrer"
                className="n-feature"
              >
                <div className="n-feature-img">
                  {covers[feature.cover] && (
                    <EditableImage src={covers[feature.cover]} alt={feature.title} className="n-feature-photo" path={`actualites.${fi}.image`} />
                  )}
                  <Editable as="span" className="n-feature-tag" path={`actualites.${fi}.tag`} />
                  <span className="n-feature-edition">Édition #{items.length}</span>
                </div>
                <div className="n-feature-body">
                  <div className="n-feature-meta">
                    <span>À LA UNE</span>
                    <span>·</span>
                    <Editable as="span" path={`actualites.${fi}.date`} />
                  </div>
                  <Editable as="h3" className="n-feature-title" path={`actualites.${fi}.title`} />
                  <Editable as="p" path={`actualites.${fi}.excerpt`} multiline />
                  <span className="n-feature-cta">Lire <Icon name="arrow" size={18}/></span>
                </div>
              </EditableLink>
              <ListControls path="actualites" index={fi} template={articleTemplate} />
            </div>
          </div>
        );
      })()}

      <div className="container">
        <div className="n-grid">
          {rest.map((n) => {
            const i = indexOf(n.slug);
            return (
              <div className="n-card-wrap" key={n.slug}>
                <EditableLink
                  path={`actualites.${i}.url`}
                  href={articleHref(n)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="n-card"
                >
                  <div className="n-card-img">
                    {covers[n.cover] ? (
                      <EditableImage src={covers[n.cover]} alt={n.title} className="n-card-photo" path={`actualites.${i}.image`} />
                    ) : (
                      <div className={`n-pattern p-${(i + 1) % 4}`}/>
                    )}
                  </div>
                  <div className="n-card-body">
                    <div className="n-card-meta">
                      <Editable as="span" className="n-card-tag" path={`actualites.${i}.tag`} />
                      <Editable as="span" path={`actualites.${i}.date`} />
                    </div>
                    <Editable as="h3" path={`actualites.${i}.title`} />
                    <Editable as="p" path={`actualites.${i}.excerpt`} multiline />
                    <span className="n-card-arrow">↗</span>
                  </div>
                </EditableLink>
                <ListControls path="actualites" index={i} template={articleTemplate} />
              </div>
            );
          })}
          <div className="n-card-add-wrap">
            <ListControls path="actualites" template={articleTemplate} />
          </div>
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
