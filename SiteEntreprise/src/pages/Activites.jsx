import { useState } from 'react';
import Icon from '../components/Icon';
import IconPicker from '../components/IconPicker';
import { useContent, useAdmin } from '../admin/AdminContext';
import { Editable, EditableImage } from '../admin/Editable';
import { ListControls } from '../admin/AdminToolbar';
import sectorAuto from '../assets/sector-auto.png';
import sectorAero from '../assets/sector-aero.png';
import sectorEnergie from '../assets/sector-energie.jpg';
import sectorFerro from '../assets/sector-ferro.jpg';
import sectorSante from '../assets/sector-sante.jpg';

const sectorPhoto = {
  auto: sectorAuto,
  aero: sectorAero,
  energie: sectorEnergie,
  ferro: sectorFerro,
  sante: sectorSante,
};

const interventionTemplate = () => ({ icon: 'compass', title: 'Nouvelle phase', text: 'Description de la phase.' });
const metierTemplate = () => ({ icon: 'cpu', name: 'Nouveau métier', description: 'Description du métier.', examples: ['Exemple 1'] });
const secteurTemplate = () => ({ key: `secteur-${Date.now()}`, label: 'Secteur', tagline: 'Description du secteur.' });

export default function Activites() {
  const c = useContent();
  const { setField } = useAdmin();
  const sectors = c.secteurs || [];
  const sectorContent = c.sectorContent || {};
  const metiers = c.metiers || [];
  const intervention = c.intervention || [];
  const intro = c.activitesIntro || {};

  const [active, setActive] = useState(0);
  const [activeMetier, setActiveMetier] = useState(null);

  const currentSector = sectors[active] || {};
  const currentSectorContent = sectorContent[currentSector.key] || { kpi: '', kpiLabel: '', products: [], activities: [] };
  const photo = sectorPhoto[currentSector.key];
  const metierFocus = activeMetier !== null ? metiers[activeMetier] : null;

  return (
    <section className="a-section" id="activites">
      <div className="container a-head">
        <Editable as="div" className="kicker" path="activitesIntro.kicker" />
        <Editable as="h2" className="display" path="activitesIntro.titleHtml" html />
        <Editable as="p" className="lead" path="activitesIntro.lead" multiline />
      </div>

      <div className="container a-intervention">
        {intervention.map((it, i) => (
          <article className="a-int-card" key={i} style={{ '--i': i }}>
            <div className="a-int-icon"><IconPicker path={`intervention.${i}.icon`} size={28} stroke="#EF8827"/></div>
            <div className="a-int-num">{String(i + 1).padStart(2, '0')} / 0{intervention.length}</div>
            <Editable as="h3" path={`intervention.${i}.title`} />
            <Editable as="p" path={`intervention.${i}.text`} multiline />
            <ListControls path="intervention" index={i} template={interventionTemplate} />
          </article>
        ))}
        <div className="a-int-add"><ListControls path="intervention" template={interventionTemplate} /></div>
      </div>

      <div className="container">
        <div
          className={`a-orbit ${metierFocus ? 'a-orbit--focus' : ''}`}
          onMouseLeave={() => setActiveMetier(null)}
        >
          <div className={`a-orbit-core ${metierFocus ? 'a-orbit-core--detail' : ''}`}>
            <div className="a-orbit-core-idle" aria-hidden={!!metierFocus}>
              <span className="a-orbit-eyebrow">{metiers.length} métiers</span>
              <span className="a-orbit-label">Ingénierie<br/>complète</span>
              <span className="a-orbit-hint">Survolez un métier</span>
            </div>
            <div className="a-orbit-core-detail-inner" aria-hidden={!metierFocus}>
              {metierFocus && (
                <>
                  <div className="a-orbit-detail-icon">
                    <Icon name={metierFocus.icon} size={26} stroke="#EF8827"/>
                  </div>
                  <div className="a-orbit-detail-num">
                    {String(activeMetier + 1).padStart(2, '0')} / {String(metiers.length).padStart(2, '0')}
                  </div>
                  <Editable as="h3" className="a-orbit-detail-title" path={`metiers.${activeMetier}.name`} />
                  <Editable as="p" className="a-orbit-detail-desc" path={`metiers.${activeMetier}.description`} multiline />
                  <ul className="a-orbit-detail-list">
                    {(metierFocus.examples || []).map((ex, i) => (
                      <li key={i} style={{ '--d': `${0.08 + i * 0.05}s` }}>
                        <span className="a-orbit-detail-bullet"/>
                        <Editable path={`metiers.${activeMetier}.examples.${i}`} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          <div className="a-orbit-ring r1" />
          <div className="a-orbit-ring r2" />
          {metiers.map((m, i, arr) => {
            const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
            const radius = i % 2 === 0 ? 44 : 52;
            const x = 50 + Math.cos(angle) * radius;
            const y = 50 + Math.sin(angle) * radius;
            const isActive = activeMetier === i;
            return (
              <button
                key={`${m.name}-${i}`}
                type="button"
                className={`a-orbit-chip ${isActive ? 'a-orbit-chip--active' : ''} ${activeMetier !== null && !isActive ? 'a-orbit-chip--dim' : ''}`}
                style={{ left: `${x}%`, top: `${y}%`, '--d': `${i * 0.08}s` }}
                onMouseEnter={() => setActiveMetier(i)}
                onFocus={() => setActiveMetier(i)}
                onBlur={() => setActiveMetier(null)}
                aria-label={`Métier : ${m.name}`}
              >
                <span className="a-orbit-chip-icon">
                  <Icon name={m.icon} size={14}/>
                </span>
                <span className="a-orbit-chip-label">{m.name}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile : grid d'expandable cards */}
        <div className="a-metiers-grid">
          {metiers.map((m, i) => (
            <details key={`${m.name}-${i}`} className="a-metier-card" style={{ '--d': `${i * 0.05}s` }}>
              <summary>
                <span className="a-metier-card-icon"><IconPicker path={`metiers.${i}.icon`} size={18} stroke="#EF8827"/></span>
                <span className="a-metier-card-num">{String(i + 1).padStart(2, '0')}</span>
                <Editable as="span" className="a-metier-card-name" path={`metiers.${i}.name`} />
                <span className="a-metier-card-chev" aria-hidden="true">+</span>
              </summary>
              <div className="a-metier-card-body">
                <Editable as="p" path={`metiers.${i}.description`} multiline />
                <ul>
                  {(m.examples || []).map((ex, j) => (
                    <li key={j}>
                      <span className="a-orbit-detail-bullet"/>
                      <Editable path={`metiers.${i}.examples.${j}`} />
                      <ListControls path={`metiers.${i}.examples`} index={j} template={() => 'Nouvel exemple'} />
                    </li>
                  ))}
                  <li><ListControls path={`metiers.${i}.examples`} template={() => 'Nouvel exemple'} /></li>
                </ul>
                <div className="a-metier-card-foot"><ListControls path="metiers" index={i} template={metierTemplate} /></div>
              </div>
            </details>
          ))}
          <div className="a-metier-add"><ListControls path="metiers" template={metierTemplate} /></div>
        </div>
      </div>

      <div className="a-split-wrap">
        <div className="container a-split">
          <aside className="a-split-aside">
            <div className="kicker">Secteurs</div>
            <Editable as="h3" className="a-split-title" path="activitesIntro.splitTitleHtml" html />
            <div className="a-tabs">
              {sectors.map((s, i) => (
                <div key={`${s.key}-${i}`} className="a-tab-wrap">
                  <button className={`a-tab ${i === active ? 'active' : ''}`} onClick={() => setActive(i)}>
                    <span className="a-tab-num">{String(i + 1).padStart(2, '0')}</span>
                    <Editable as="span" className="a-tab-label" path={`secteurs.${i}.label`} />
                    <span className="a-tab-line"/>
                  </button>
                  <ListControls path="secteurs" index={i} template={secteurTemplate} />
                </div>
              ))}
              <ListControls path="secteurs" template={secteurTemplate} />
            </div>
            <Editable as="p" className="a-split-tagline" path={`secteurs.${active}.tagline`} />
          </aside>
          <div className="a-split-main">
            <div className="a-vis">
              <div className="a-vis-inner" key={active}>
                {photo && (
                  <EditableImage
                    src={photo}
                    alt={currentSector.label}
                    className="a-vis-photo"
                    path={`sectorPhoto.${currentSector.key}`}
                  />
                )}
                <div className="a-vis-bg" />
                <div className="a-vis-kpi">
                  <Editable as="span" className="a-vis-num" path={`sectorContent.${currentSector.key}.kpi`} />
                  <Editable as="span" className="a-vis-num-label" path={`sectorContent.${currentSector.key}.kpiLabel`} />
                </div>
                <span className="a-vis-mono">{'/* ' + currentSector.label + ' */'}</span>
              </div>
            </div>
            <div className="a-cols" key={`cols-${active}`}>
              <div>
                <div className="a-col-title">Produits & systèmes</div>
                <ul className="a-col-list">
                  {(currentSectorContent.products || []).map((p, i) => (
                    <li key={i} style={{ '--d': `${i * 0.06}s` }}>
                      <span className="a-bullet"/>
                      <Editable path={`sectorContent.${currentSector.key}.products.${i}`} />
                      <ListControls path={`sectorContent.${currentSector.key}.products`} index={i} template={() => 'Nouveau produit'} />
                    </li>
                  ))}
                  <li><ListControls path={`sectorContent.${currentSector.key}.products`} template={() => 'Nouveau produit'} /></li>
                </ul>
              </div>
              <div>
                <div className="a-col-title">Activités</div>
                <ul className="a-col-list">
                  {(currentSectorContent.activities || []).map((p, i) => (
                    <li key={i} style={{ '--d': `${i * 0.06}s` }}>
                      <span className="a-bullet a-bullet-fill"/>
                      <Editable path={`sectorContent.${currentSector.key}.activities.${i}`} />
                      <ListControls path={`sectorContent.${currentSector.key}.activities`} index={i} template={() => 'Nouvelle activité'} />
                    </li>
                  ))}
                  <li><ListControls path={`sectorContent.${currentSector.key}.activities`} template={() => 'Nouvelle activité'} /></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
