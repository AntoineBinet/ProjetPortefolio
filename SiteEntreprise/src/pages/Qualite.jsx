import CertBadge from '../components/CertBadge';
import { UP_DATA } from '../data';

const docKindLabel = {
  qualite: 'Qualité',
  gouvernance: 'Gouvernance',
  rgpd: 'RGPD',
};

export default function Qualite() {
  return (
    <section className="q-section" id="qualite">
      <div className="q-ticker" aria-hidden="true">
        <div className="q-ticker-track">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i}>ISO 9001 · ISO 14001 · ISO 27001 · EcoVadis Silver · Agrément CIR · Time for the Planet · ISO 9001 · ISO 14001 · ISO 27001 · EcoVadis Silver · Agrément CIR · Time for the Planet · </span>
          ))}
        </div>
      </div>
      <div className="container q-grid">
        <div>
          <div className="kicker">Qualité & certifications</div>
          <h2 className="display">
            Auditée. <em>Certifiée.</em><br/>Mesurée.
          </h2>
          <p className="lead">
            Up Technologies est engagée dans une démarche d'amélioration continue
            appuyée sur les normes ISO 9001, ISO 14001, ISO 27001 et la démarche EcoVadis.
            Nos activités R&D sont reconnues par l'agrément CIR.
          </p>

          <div className="q-docs">
            <div className="q-docs-title">Documents publics</div>
            {UP_DATA.documents.map((d, i) => (
              <a
                key={i}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`q-link q-link-${d.kind}`}
              >
                <span className="q-link-arrow">↓</span>
                <span className="q-link-label">
                  {d.label}
                  <span className="q-link-ref">{d.ref}</span>
                </span>
                <span className="q-link-meta">PDF</span>
              </a>
            ))}
          </div>
        </div>
        <div className="q-stack">
          {UP_DATA.certifications.map((c, i) => (
            <div className="q-badge" key={c.kind} style={{ '--i': i }}>
              <div className="q-badge-visual"><CertBadge kind={c.kind} size={88}/></div>
              <div className="q-badge-info">
                <div className="q-badge-num">{String(i + 1).padStart(2, '0')} / 06</div>
                <div className="q-badge-name">{c.name}</div>
                <div className="q-badge-desc">{c.desc}</div>
                <div className="q-badge-status"><span className="q-badge-dot"/> active · {c.year}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
