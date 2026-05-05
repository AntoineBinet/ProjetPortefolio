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
  const sectors = UP_DATA.secteurs;
  const c = UP_DATA.sectorContent[sectors[active].key];
  const photo = sectorPhoto[sectors[active].key];

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
        <div className="a-orbit">
          <div className="a-orbit-core">
            <div className="a-orbit-core-inner">
              <span className="a-orbit-eyebrow">7 métiers</span>
              <span className="a-orbit-label">Ingénierie<br/>complète</span>
            </div>
          </div>
          <div className="a-orbit-ring r1" />
          <div className="a-orbit-ring r2" />
          {UP_DATA.metiers.map((m, i, arr) => {
            const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
            const radius = i % 2 === 0 ? 38 : 46;
            const x = 50 + Math.cos(angle) * radius;
            const y = 50 + Math.sin(angle) * radius;
            return (
              <div key={m} className="a-orbit-chip" style={{ left: `${x}%`, top: `${y}%`, '--d': `${i * 0.08}s` }}>
                <span className="a-orbit-dot"/>
                {m}
              </div>
            );
          })}
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
