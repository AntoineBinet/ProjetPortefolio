import { useState } from 'react';
import Icon from '../components/Icon';
import { UP_DATA } from '../data';

const sectorContent = {
  transport: { kpi: '14', kpiLabel: 'projets ADAS depuis 2020', products: ['Véhicules autonomes', 'ADAS / vision', 'Trains, métros, tramways', 'Carrosserie & châssis'], activities: ['Architecture système', 'Validation routière', 'Sûreté de fonctionnement', 'Management de projet'] },
  energie: { kpi: '6', kpiLabel: 'opérateurs réseau partenaires', products: ['Smart grids', 'Réseaux de distribution', 'Stockage', 'Bornes de recharge'], activities: ['Analyse fonctionnelle', 'Supervision', 'Cybersécurité OT', 'Mise en service'] },
  sante: { kpi: 'IEC', kpiLabel: '62304 · 60601 · ISO 13485', products: ['Dispositifs médicaux', 'Imagerie', 'Systèmes perfusion', 'Implants connectés'], activities: ['Industrialisation (scale-up)', 'Conformité IEC 62304', 'Validation clinique', 'Risk management'] },
  aero: { kpi: 'DO-178C', kpiLabel: 'niveau A · DO-254 niveau A', products: ['Avionique', 'Commandes de vol', 'Drones', 'Systèmes de mission'], activities: ['Logiciel embarqué DO-178C', 'Architecture matérielle', 'V&V', 'Support en série'] },
  industrie: { kpi: '40+', kpiLabel: 'lignes industrielles déployées', products: ['Lignes automatisées', 'Robotique', 'Vision industrielle', 'IoT industriel'], activities: ['Implantation des systèmes', 'Programmation API', 'MES / SCADA', 'Maintenance prédictive'] },
};

export default function Activites() {
  const [active, setActive] = useState(0);
  const sectors = UP_DATA.secteurs;
  const c = sectorContent[sectors[active].key];

  return (
    <section className="a-section" id="activites">
      <div className="container a-head">
        <div className="kicker">Activité · 8 métiers · 5 secteurs</div>
        <h2 className="display">
          Les <em>domaines</em> où<br/>nous apportons<br/>notre expertise.
        </h2>
      </div>

      <div className="container">
        <div className="a-orbit">
          <div className="a-orbit-core">
            <div className="a-orbit-core-inner">
              <span className="a-orbit-eyebrow">8 métiers</span>
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
          </aside>
          <div className="a-split-main">
            <div className="a-vis">
              <div className="a-vis-inner" key={active}>
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
