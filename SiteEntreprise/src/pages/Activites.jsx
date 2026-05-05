import { useState } from 'react';
import Icon from '../components/Icon';
import { UP_DATA } from '../data';
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

export default function Activites() {
  const [active, setActive] = useState(0);
  const [activeMetier, setActiveMetier] = useState(null);
  const sectors = UP_DATA.secteurs;
  const c = UP_DATA.sectorContent[sectors[active].key];
  const photo = sectorPhoto[sectors[active].key];
  const metiers = UP_DATA.metiers;
  const metierFocus = activeMetier !== null ? metiers[activeMetier] : null;

  return (
    <section className="a-section" id="activites">
      <div className="container a-head">
        <div className="kicker">Activités · 7 métiers · 5 secteurs</div>
        <h2 className="display">
          Les <em>domaines</em> dans<br/>lesquels nous apportons<br/>notre expertise.
        </h2>
        <p className="lead">
          Bureau d'études et conseil en ingénierie&nbsp;: Up Technologies couvre la chaîne complète
          de l'électronique, de l'informatique embarquée et des systèmes mécatroniques —
          en assistance technique, en forfait/workpackage ou en innovation.
        </p>
      </div>

      {/* Bloc "Notre intervention" — 3 modes (PDF §7.1) */}
      <div className="container a-intervention">
        {UP_DATA.intervention.map((it, i) => (
          <article className="a-int-card" key={i} style={{ '--i': i }}>
            <div className="a-int-icon"><Icon name={it.icon} size={28} stroke="#EF8827"/></div>
            <div className="a-int-num">{String(i + 1).padStart(2, '0')} / 03</div>
            <h3>{it.title}</h3>
            <p>{it.text}</p>
          </article>
        ))}
      </div>

      <div className="container">
        <div
          className={`a-orbit ${metierFocus ? 'a-orbit--focus' : ''}`}
          onMouseLeave={() => setActiveMetier(null)}
        >
          <div className={`a-orbit-core ${metierFocus ? 'a-orbit-core--detail' : ''}`}>
            <div className="a-orbit-core-idle" aria-hidden={!!metierFocus}>
              <span className="a-orbit-eyebrow">7 métiers</span>
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
                    {String(activeMetier + 1).padStart(2, '0')} / 07
                  </div>
                  <h3 className="a-orbit-detail-title">{metierFocus.name}</h3>
                  <p className="a-orbit-detail-desc">{metierFocus.description}</p>
                  <ul className="a-orbit-detail-list">
                    {metierFocus.examples.map((ex, i) => (
                      <li key={ex} style={{ '--d': `${0.08 + i * 0.05}s` }}>
                        <span className="a-orbit-detail-bullet"/>{ex}
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
                key={m.name}
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

        {/* Mobile : grid d'expandable cards (l'orbit serait illisible) */}
        <div className="a-metiers-grid">
          {metiers.map((m, i) => (
            <details key={m.name} className="a-metier-card" style={{ '--d': `${i * 0.05}s` }}>
              <summary>
                <span className="a-metier-card-icon"><Icon name={m.icon} size={18} stroke="#EF8827"/></span>
                <span className="a-metier-card-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="a-metier-card-name">{m.name}</span>
                <span className="a-metier-card-chev" aria-hidden="true">+</span>
              </summary>
              <div className="a-metier-card-body">
                <p>{m.description}</p>
                <ul>
                  {m.examples.map((ex) => (
                    <li key={ex}><span className="a-orbit-detail-bullet"/>{ex}</li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="a-split-wrap">
        <div className="container a-split">
          <aside className="a-split-aside">
            <div className="kicker">Secteurs</div>
            <h3 className="a-split-title">5 industries que<br/>nous comprenons<br/>de l'intérieur.</h3>
            <div className="a-tabs">
              {sectors.map((s, i) => (
                <button key={s.key} className={`a-tab ${i === active ? 'active' : ''}`} onClick={() => setActive(i)}>
                  <span className="a-tab-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="a-tab-label">{s.label}</span>
                  <span className="a-tab-line"/>
                </button>
              ))}
            </div>
            <p className="a-split-tagline">{sectors[active].tagline}</p>
          </aside>
          <div className="a-split-main">
            <div className="a-vis">
              <div className="a-vis-inner" key={active}>
                {photo && (
                  <img src={photo} alt={sectors[active].label} className="a-vis-photo"/>
                )}
                <div className="a-vis-bg" />
                <div className="a-vis-kpi">
                  <span className="a-vis-num">{c.kpi}</span>
                  <span className="a-vis-num-label">{c.kpiLabel}</span>
                </div>
                <span className="a-vis-mono">{'/* ' + sectors[active].label + ' */'}</span>
              </div>
            </div>
            <div className="a-cols" key={`cols-${active}`}>
              <div>
                <div className="a-col-title">Produits & systèmes</div>
                <ul className="a-col-list">
                  {c.products.map((p, i) => (
                    <li key={i} style={{ '--d': `${i * 0.06}s` }}>
                      <span className="a-bullet"/>{p}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="a-col-title">Activités</div>
                <ul className="a-col-list">
                  {c.activities.map((p, i) => (
                    <li key={i} style={{ '--d': `${i * 0.06}s` }}>
                      <span className="a-bullet a-bullet-fill"/>{p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
