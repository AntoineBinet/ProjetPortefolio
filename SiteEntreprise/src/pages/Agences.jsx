import { useState } from 'react';
import Icon from '../components/Icon';
import { useContent } from '../admin/AdminContext';
import { Editable, EditableImage } from '../admin/Editable';
import agency1 from '../assets/agency-1.jpg';
import agency2 from '../assets/agency-2.jpg';
import agency3 from '../assets/agency-3.png';
import agency4 from '../assets/agency-4.jpg';
import agency5 from '../assets/agency-5.jpg';
import agency6 from '../assets/agency-6.jpg';

const agencyPhotos = [agency1, agency2, agency3, agency4, agency5, agency6];

const minLat = 41.5, maxLat = 50.0, minLng = 1.0, maxLng = 8.0;

function project(lat, lng) {
  return {
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: ((maxLat - lat) / (maxLat - minLat)) * 100,
  };
}

function formatCoord(value, posLabel, negLabel) {
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? posLabel : negLabel}`;
}

export default function Agences() {
  const c = useContent();
  const data = c.agences || [];
  const contact = c.contact || {};
  const [hover, setHover] = useState(0);
  const safeHover = Math.min(hover, Math.max(0, data.length - 1));
  const a = data[safeHover];
  const yearsActive = a ? (2026 - a.founded) : 0;

  if (!a) {
    return (
      <section className="g-section" id="agences">
        <div className="container g-head">
          <div className="kicker">Implantations</div>
          <p>Aucune agence configurée.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="g-section" id="agences">
      <div className="container g-head">
        <Editable as="div" className="kicker" path="agencesIntro.kicker" />
        <Editable as="h2" className="display" path="agencesIntro.titleHtml" html />
        <Editable as="p" className="lead" path="agencesIntro.lead" multiline />
      </div>

      <div className="container g-cards">
        {data.map((d, i) => (
          <button
            key={`card-${d.ville}-${i}`}
            type="button"
            className={`g-card ${i === safeHover ? 'is-active' : ''}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i)}
          >
            <div className="g-card-img">
              <EditableImage src={agencyPhotos[i]} alt={`Agence ${d.ville}`} path={`agences.${i}.photo`} />
            </div>
            <div className="g-card-body">
              <span className="g-card-num">N°{String(i + 1).padStart(2, '0')}</span>
              <Editable as="h3" path={`agences.${i}.ville`} />
              <p>
                <Editable path={`agences.${i}.adresse`} /><br/>
                <Editable path={`agences.${i}.cp`} /> <Editable path={`agences.${i}.pays`} />
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="g-stage">
        <div className="g-map">
          <div className="g-map-grid"/>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="g-svg">
            {data.map((d, i) => {
              if (i === safeHover) return null;
              const p1 = project(a.lat, a.lng);
              const p2 = project(d.lat, d.lng);
              return (
                <line key={`l-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke="rgba(239,136,39,0.22)" strokeWidth="0.18" strokeDasharray="0.5 0.7"/>
              );
            })}
            {data.map((d, i) => {
              const p = project(d.lat, d.lng);
              const isActive = i === safeHover;
              const labelRight = p.x < 75;
              return (
                <g key={`${d.ville}-${i}`} onClick={() => setHover(i)} style={{ cursor: 'pointer' }}>
                  {isActive && <circle cx={p.x} cy={p.y} r="5" fill="rgba(239,136,39,0.14)" className="g-pulse"/>}
                  {isActive && <circle cx={p.x} cy={p.y} r="2.4" fill="rgba(239,136,39,0.28)"/>}
                  <circle cx={p.x} cy={p.y} r={isActive ? 1.2 : 0.75} fill="#EF8827"/>
                  <text
                    x={labelRight ? p.x + 1.6 : p.x - 1.6}
                    y={p.y + 0.7}
                    textAnchor={labelRight ? 'start' : 'end'}
                    fontSize={isActive ? 2.1 : 1.7}
                    fill={isActive ? '#11202A' : '#55606E'}
                    fontFamily="Inter"
                    fontWeight={isActive ? 600 : 400}
                  >
                    {d.ville}
                  </text>
                  {isActive && (
                    <text
                      x={labelRight ? p.x + 1.6 : p.x - 1.6}
                      y={p.y - 1.3}
                      textAnchor={labelRight ? 'start' : 'end'}
                      fontSize={1.2}
                      fill="#EF8827"
                      fontFamily="JetBrains Mono, monospace"
                      letterSpacing="0.04em"
                    >
                      {formatCoord(d.lat, 'N', 'S')} · {formatCoord(d.lng, 'E', 'O')}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="g-map-corners">
            <span className="g-map-corner g-map-corner--tl"/>
            <span className="g-map-corner g-map-corner--tr"/>
            <span className="g-map-corner g-map-corner--bl"/>
            <span className="g-map-corner g-map-corner--br"/>
          </div>
          <div className="g-info-overlay">
            <div className="g-info-num">N°{String(safeHover + 1).padStart(2, '0')}</div>
            <Editable as="h3" className="g-info-city" path={`agences.${safeHover}.ville`} />
            <div className="g-info-meta">
              <div><span>Adresse</span><strong><Editable path={`agences.${safeHover}.adresse`} /></strong></div>
              <div><span>Code postal</span><strong><Editable path={`agences.${safeHover}.cp`} /> · <Editable path={`agences.${safeHover}.pays`} /></strong></div>
              <div><span>Ouverture</span><strong><Editable path={`agences.${safeHover}.founded`} /> <em>· {yearsActive} ans</em></strong></div>
            </div>
          </div>
        </div>
        <aside className="g-aside">
          <div className="g-aside-head">
            <span className="kicker">Liste</span>
            <span className="g-aside-count">{String(data.length).padStart(2, '0')}</span>
          </div>
          <div className="g-list">
            {data.map((d, i) => (
              <button
                key={`${d.ville}-list-${i}`}
                className={`g-row ${i === safeHover ? 'active' : ''}`}
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
            <Editable as="div" className="kicker kicker-orange-on-dark" path="contactBlock.kicker" />
            <Editable as="h3" path="contactBlock.titleHtml" html />
            <Editable as="p" className="g-contact-baseline" path="contactBlock.baseline" multiline />
          </div>
          <div className="g-contact-actions">
            <a className="g-contact-link" href={`mailto:${contact.email || ''}`}>
              <span>Mail</span>
              <strong><Editable path="contact.email" /></strong>
            </a>
            <a className="g-contact-link" href={contact.telHref || '#'}>
              <span>Téléphone</span>
              <strong><Editable path="contact.tel" /></strong>
            </a>
            <a className="g-contact-link" href={contact.linkedin || '#'} target="_blank" rel="noopener noreferrer">
              <span>LinkedIn</span>
              <strong>/company/up-technologies</strong>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
