import { useState } from 'react';
import Icon from '../components/Icon';
import { useContent } from '../admin/AdminContext';
import { Editable, EditableImage, EditableLink } from '../admin/Editable';
import { ListControls } from '../admin/AdminToolbar';
import agency1 from '../assets/agency-1.jpg';
import agency2 from '../assets/agency-2.jpg';
import agency3 from '../assets/agency-3.png';
import agency4 from '../assets/agency-4.jpg';
import agency5 from '../assets/agency-5.jpg';
import agency6 from '../assets/agency-6.jpg';

const agencyPhotos = [agency1, agency2, agency3, agency4, agency5, agency6];

const minLat = 41.0, maxLat = 51.5, minLng = -5.5, maxLng = 10.0;

function project(lat, lng) {
  return {
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: ((maxLat - lat) / (maxLat - minLat)) * 100,
  };
}

function formatCoord(value, posLabel, negLabel) {
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? posLabel : negLabel}`;
}

const FRANCE_PATH = [
  'M 47.4 5.2',
  'L 50.8 4.4',
  'L 55.3 8.3',
  'L 61.1 11.6',
  'L 61.8 15.1',
  'L 70.1 14.6',
  'L 75.0 18.0',
  'L 81.1 22.9',
  'L 86.8 23.4',
  'L 85.5 27.8',
  'L 84.5 37.6',
  'L 76.5 43.8',
  'L 75.0 50.5',
  'L 79.7 54.0',
  'L 78.3 62.9',
  'L 84.5 70.6',
  'L 83.9 73.5',
  'L 82.4 74.3',
  'L 78.3 78.4',
  'L 73.7 79.8',
  'L 70.1 78.1',
  'L 64.5 75.7',
  'L 59.3 77.1',
  'L 55.9 86.2',
  'L 44.9 84.3',
  'L 36.4 81.6',
  'L 24.0 77.5',
  'L 26.1 74.7',
  'L 28.0 65.1',
  'L 31.7 63.4',
  'L 28.8 56.0',
  'L 28.1 50.9',
  'L 24.0 47.7',
  'L 21.3 40.2',
  'L 13.7 35.7',
  'L 4.5 29.5',
  'L 22.6 27.1',
  'L 25.0 17.6',
  'L 36.1 19.1',
  'L 45.2 14.3',
  'Z',
].join(' ');

const labelMap = {
  'Lyon':            { side: 'right', dy: 0 },
  'Paris':           { side: 'right', dy: 0 },
  'Grenoble':        { side: 'right', dy: 0 },
  'Aix-en-Provence': { side: 'left',  dy: 1.2 },
  'Toulon':          { side: 'right', dy: 2.0 },
  'Nice Sophia':     { side: 'left',  dy: -1.6 },
};

const agenceTemplate = () => ({
  ville: 'Nouvelle ville',
  adresse: 'Adresse à compléter',
  cp: '00000',
  pays: 'France',
  founded: 2026,
  lat: 46.6,
  lng: 2.5,
});

export default function Agences() {
  const c = useContent();
  const data = c.agences || [];
  const contact = c.contact || {};
  const [hover, setHover] = useState(0);
  const safeHover = Math.min(hover, Math.max(0, data.length - 1));
  const a = data[safeHover];
  const yearsActive = a ? (2026 - a.founded) : 0;
  const aP = a ? project(a.lat, a.lng) : { x: 50, y: 50 };

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

      <div className="g-stage">
        <div className="g-map">
          <div className="g-map-grid"/>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="g-svg">
            <defs>
              <linearGradient id="franceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(239,136,39,0.10)"/>
                <stop offset="55%" stopColor="rgba(239,136,39,0.05)"/>
                <stop offset="100%" stopColor="rgba(239,136,39,0.02)"/>
              </linearGradient>
              <linearGradient id="franceStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(17,32,42,0.55)"/>
                <stop offset="100%" stopColor="rgba(17,32,42,0.30)"/>
              </linearGradient>
              <radialGradient id="cityHalo" cx="50%" cy="50%">
                <stop offset="0%" stopColor="rgba(239,136,39,0.35)"/>
                <stop offset="60%" stopColor="rgba(239,136,39,0.10)"/>
                <stop offset="100%" stopColor="rgba(239,136,39,0)"/>
              </radialGradient>
            </defs>

            <path d={FRANCE_PATH} fill="none" stroke="rgba(239,136,39,0.05)" strokeWidth="2.4" strokeLinejoin="round"/>
            <path d={FRANCE_PATH} fill="none" stroke="rgba(239,136,39,0.10)" strokeWidth="1.2" strokeLinejoin="round"/>

            <path
              d={FRANCE_PATH}
              fill="url(#franceGrad)"
              stroke="url(#franceStroke)"
              strokeWidth="0.36"
              strokeLinejoin="round"
            />

            <g opacity="0.18" stroke="#11202A" strokeWidth="0.12" fill="none" strokeLinejoin="round">
              <path d="M 78 24 Q 82 34 83 44 Q 81 52 79 58"/>
              <path d="M 73 32 Q 77 40 78 48 Q 76 56 74 62"/>
              <path d="M 28 36 Q 32 46 30 56 Q 28 64 28 70"/>
              <path d="M 38 60 Q 46 64 53 65 Q 60 66 65 70"/>
              <path d="M 50 30 Q 58 36 64 42 Q 68 48 70 56"/>
            </g>

            <g opacity="0.22" stroke="#EF8827" strokeWidth="0.08" strokeDasharray="0.4 0.6" fill="none">
              <line x1="0"  y1="50" x2="100" y2="50"/>
              <line x1="50" y1="0"  x2="50"  y2="100"/>
            </g>

            <g transform="translate(11.5, 11.5)" className="g-compass">
              <circle r="4.2" fill="rgba(255,255,255,0.85)" stroke="rgba(17,32,42,0.18)" strokeWidth="0.14"/>
              <circle r="3.0" fill="none" stroke="rgba(17,32,42,0.08)" strokeWidth="0.08"/>
              <line x1="-3.6" y1="0" x2="3.6" y2="0" stroke="rgba(17,32,42,0.18)" strokeWidth="0.08"/>
              <line x1="0" y1="-3.6" x2="0" y2="3.6" stroke="rgba(17,32,42,0.18)" strokeWidth="0.08"/>
              <path d="M 0 -3.0 L 0.6 0 L 0 0.7 L -0.6 0 Z" fill="#EF8827"/>
              <path d="M 0 0 L 0.6 0 L 0 3.0 L -0.6 0 Z" fill="rgba(17,32,42,0.55)"/>
              <text y="-4.6" textAnchor="middle" fontSize="1.4" fill="#11202A"
                fontFamily="JetBrains Mono, monospace" fontWeight="600" letterSpacing="0.05em">N</text>
            </g>

            <g transform="translate(78, 95)">
              <line x1="0"  y1="0" x2="16" y2="0" stroke="rgba(17,32,42,0.42)" strokeWidth="0.20"/>
              <line x1="0"  y1="-0.6" x2="0"  y2="0.6" stroke="rgba(17,32,42,0.42)" strokeWidth="0.20"/>
              <line x1="8"  y1="-0.4" x2="8"  y2="0.4" stroke="rgba(17,32,42,0.42)" strokeWidth="0.18"/>
              <line x1="16" y1="-0.6" x2="16" y2="0.6" stroke="rgba(17,32,42,0.42)" strokeWidth="0.20"/>
              <text x="0"  y="-1.4" fontSize="1.2" fill="rgba(17,32,42,0.55)"
                fontFamily="JetBrains Mono, monospace" letterSpacing="0.05em">0</text>
              <text x="16" y="-1.4" fontSize="1.2" fill="rgba(17,32,42,0.55)"
                fontFamily="JetBrains Mono, monospace" letterSpacing="0.05em" textAnchor="end">200 km</text>
            </g>

            <text x="3" y="97" fontSize="1.3" fill="rgba(17,32,42,0.45)"
              fontFamily="JetBrains Mono, monospace" letterSpacing="0.08em">FR · MÉTROPOLE</text>

            {data.map((d, i) => {
              if (i === safeHover) return null;
              const p2 = project(d.lat, d.lng);
              return (
                <line
                  key={`l-${i}`}
                  x1={aP.x} y1={aP.y} x2={p2.x} y2={p2.y}
                  stroke="rgba(239,136,39,0.32)" strokeWidth="0.20" strokeDasharray="0.6 0.8"
                />
              );
            })}

            {data.map((d, i) => {
              if (i !== safeHover) return null;
              const p = project(d.lat, d.lng);
              return (
                <circle
                  key="halo"
                  cx={p.x} cy={p.y} r="9"
                  fill="url(#cityHalo)"
                  pointerEvents="none"
                />
              );
            })}

            {data.map((d, i) => {
              const p = project(d.lat, d.lng);
              const isActive = i === safeHover;
              const cfg = labelMap[d.ville] || { side: 'right', dy: 0 };
              const labelRight = cfg.side === 'right';
              const lx = labelRight ? p.x + 1.8 : p.x - 1.8;
              const ly = p.y + 0.7 + cfg.dy;
              return (
                <g
                  key={`${d.ville}-${i}`}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={p.x} cy={p.y} r="4" fill="transparent"/>
                  {isActive && <circle cx={p.x} cy={p.y} r="5" fill="rgba(239,136,39,0.16)" className="g-pulse"/>}
                  {isActive && <circle cx={p.x} cy={p.y} r="2.6" fill="rgba(239,136,39,0.32)"/>}
                  <circle
                    cx={p.x} cy={p.y}
                    r={isActive ? 1.35 : 0.85}
                    fill="#EF8827"
                    stroke="#fff"
                    strokeWidth={isActive ? 0.45 : 0.28}
                  />
                  <text
                    x={lx} y={ly}
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
                      x={lx} y={ly - 2.0}
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
          <div className="g-map-legend">
            <span className="g-map-legend-dot"/>
            <span>{data.length} agences · Up Technologies</span>
          </div>
        </div>

        <aside className="g-aside">
          <div className="g-aside-head">
            <span className="kicker">Liste</span>
            <span className="g-aside-count">{String(data.length).padStart(2, '0')}</span>
          </div>
          <div className="g-list">
            {data.map((d, i) => (
              <div key={`${d.ville}-list-${i}`} className="g-row-wrap">
                <button
                  type="button"
                  className={`g-row ${i === safeHover ? 'active' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onClick={() => setHover(i)}
                >
                  <span className="g-row-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="g-row-ville">{d.ville}</span>
                  <span className="g-row-year">{d.founded}</span>
                  <span className="g-row-arrow"><Icon name="arrow" size={14}/></span>
                </button>
                <ListControls path="agences" index={i} template={agenceTemplate} />
              </div>
            ))}
            <div className="g-row-add"><ListControls path="agences" template={agenceTemplate} /></div>
          </div>

          <div className="g-detail" key={safeHover}>
            <div className="g-detail-img">
              <EditableImage
                src={agencyPhotos[safeHover]}
                alt={`Agence ${a.ville}`}
                path={`agences.${safeHover}.photo`}
              />
              <span className="g-detail-num">N°{String(safeHover + 1).padStart(2, '0')}</span>
              <span className="g-detail-coord">
                {formatCoord(a.lat, 'N', 'S')} · {formatCoord(a.lng, 'E', 'O')}
              </span>
            </div>
            <Editable as="h3" className="g-detail-city" path={`agences.${safeHover}.ville`} />
            <div className="g-detail-meta">
              <div>
                <span>Adresse</span>
                <strong><Editable path={`agences.${safeHover}.adresse`} /></strong>
              </div>
              <div>
                <span>Code postal</span>
                <strong><Editable path={`agences.${safeHover}.cp`} /> · <Editable path={`agences.${safeHover}.pays`} /></strong>
              </div>
              <div>
                <span>Ouverture</span>
                <strong><Editable path={`agences.${safeHover}.founded`} /> <em>· {yearsActive} ans</em></strong>
              </div>
            </div>
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
            <EditableLink path="contact.emailHref" href={`mailto:${contact.email || ''}`} className="g-contact-link">
              <span>Mail</span>
              <strong><Editable path="contact.email" /></strong>
            </EditableLink>
            <EditableLink path="contact.telHref" href={contact.telHref || '#'} className="g-contact-link">
              <span>Téléphone</span>
              <strong><Editable path="contact.tel" /></strong>
            </EditableLink>
            <EditableLink path="contact.linkedin" href={contact.linkedin || '#'} target="_blank" rel="noopener noreferrer" className="g-contact-link">
              <span>LinkedIn</span>
              <strong>/company/up-technologies</strong>
            </EditableLink>
          </div>
        </div>
      </div>
    </section>
  );
}
