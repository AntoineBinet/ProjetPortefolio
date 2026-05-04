import { useState } from 'react';
import Icon from '../components/Icon';
import { UP_DATA } from '../data';

const minLat = 42.3, maxLat = 51.4, minLng = -5.5, maxLng = 8.5;

function project(lat, lng) {
  return {
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: ((maxLat - lat) / (maxLat - minLat)) * 100,
  };
}

export default function Agences() {
  const [hover, setHover] = useState(0);
  const data = UP_DATA.agences;
  const a = data[hover];
  const yearsActive = 2026 - a.founded;

  return (
    <section className="g-section" id="agences">
      <div className="container g-head">
        <div className="kicker">Implantations</div>
        <h2 className="display">
          6 agences. <em>Un seul fuseau.</em>
        </h2>
      </div>

      <div className="g-stage">
        <div className="g-map">
          <div className="g-map-grid"/>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="g-svg">
            <path
              d="M 28 6 L 38 8 L 46 4 L 58 8 L 68 6 L 76 14 L 82 22 L 88 32 L 90 42 L 86 52 L 92 62 L 88 74 L 78 82 L 70 92 L 60 96 L 52 92 L 42 96 L 32 88 L 22 80 L 14 70 L 8 58 L 4 46 L 6 34 L 12 22 L 20 12 Z"
              fill="rgba(239,136,39,0.04)"
              stroke="rgba(239,136,39,0.35)"
              strokeWidth="0.25"
              strokeDasharray="0.6 0.6"
            />
            {data.map((d, i) => {
              if (i === hover) return null;
              const p1 = project(a.lat, a.lng);
              const p2 = project(d.lat, d.lng);
              return (
                <line key={`l-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke="rgba(239,136,39,0.4)" strokeWidth="0.25" strokeDasharray="0.4 0.4"/>
              );
            })}
            {data.map((d, i) => {
              const p = project(d.lat, d.lng);
              const isActive = i === hover;
              return (
                <g key={d.ville} onClick={() => setHover(i)} style={{ cursor: 'pointer' }}>
                  {isActive && <circle cx={p.x} cy={p.y} r="6" fill="rgba(239,136,39,0.15)" className="g-pulse"/>}
                  {isActive && <circle cx={p.x} cy={p.y} r="3" fill="rgba(239,136,39,0.3)"/>}
                  <circle cx={p.x} cy={p.y} r={isActive ? 1.4 : 0.9} fill="#EF8827"/>
                  <text x={p.x + 1.8} y={p.y + 0.8} fontSize={isActive ? 2.3 : 1.8}
                    fill={isActive ? '#11202A' : '#55606E'}
                    fontFamily="Inter" fontWeight={isActive ? 600 : 400}>
                    {d.ville}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="g-info-overlay">
            <div className="g-info-num">N°{String(hover + 1).padStart(2, '0')}</div>
            <h3 className="g-info-city">{a.ville}</h3>
            <div className="g-info-meta">
              <div><span>Adresse</span><strong>{a.adresse}</strong></div>
              <div><span>Ouverture</span><strong>{a.founded} <em>· {yearsActive} ans</em></strong></div>
              <div><span>Coordonnées</span><strong>{a.lat.toFixed(3)}°N · {a.lng.toFixed(3)}°E</strong></div>
            </div>
          </div>
        </div>
        <aside className="g-aside">
          <div className="g-aside-head">
            <span className="kicker">Liste</span>
            <span className="g-aside-count">06</span>
          </div>
          <div className="g-list">
            {data.map((d, i) => (
              <button
                key={d.ville}
                className={`g-row ${i === hover ? 'active' : ''}`}
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              >
                <span className="g-row-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="g-row-ville">{d.ville}</span>
                <span className="g-row-year">{d.founded}</span>
                <span className="g-row-arrow"><Icon name="arrow" size={14}/></span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div className="container">
        <div className="g-contact" id="contact">
          <div>
            <div className="kicker kicker-orange-on-dark">Contact</div>
            <h3>Une question, un projet ?<br/><em>Écrivez-nous.</em></h3>
          </div>
          <div className="g-contact-actions">
            <a className="g-contact-link" href="mailto:contact@up-technologies.fr">
              <span>Mail</span>
              <strong>contact@up-technologies.fr</strong>
            </a>
            <a className="g-contact-link" href="#">
              <span>LinkedIn</span>
              <strong>/company/up-technologies</strong>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
