import CertBadge from '../components/CertBadge';
import { useContent } from '../admin/AdminContext';
import { Editable, EditableLink } from '../admin/Editable';
import { ListControls } from '../admin/AdminToolbar';

const docTemplate = () => ({ label: 'Nouveau document', ref: 'Référence', url: '#', kind: 'doc' });
const certTemplate = () => ({ kind: 'iso-9001', name: 'Nouvelle certification', desc: 'Description courte', year: '2026' });

export default function Qualite() {
  const c = useContent();
  const docs = c.documents || [];
  const certs = c.certifications || [];

  return (
    <section className="q-section" id="qualite">
      <div className="q-ticker" aria-hidden="true">
        <div className="q-ticker-track">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i}>EcoVadis Silver · ISO 9001 · ISO 14001 · ISO 27001 · Agrément CIR · Time for the Planet · EcoVadis Silver · ISO 9001 · ISO 14001 · ISO 27001 · Agrément CIR · Time for the Planet · </span>
          ))}
        </div>
      </div>
      <div className="container q-grid">
        <div>
          <Editable as="div" className="kicker" path="qualiteIntro.kicker" />
          <Editable as="h2" className="display" path="qualiteIntro.titleHtml" html />
          <Editable as="p" className="lead" path="qualiteIntro.lead" multiline />

          <div className="q-docs">
            <Editable as="div" className="q-docs-title" path="qualiteIntro.docsTitle" />
            {docs.map((d, i) => (
              <div key={i} className="q-doc-row">
                <EditableLink
                  path={`documents.${i}.url`}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`q-link q-link-${d.kind}`}
                >
                  <span className="q-link-arrow">↓</span>
                  <span className="q-link-label">
                    <Editable path={`documents.${i}.label`} />
                    <Editable as="span" className="q-link-ref" path={`documents.${i}.ref`} />
                  </span>
                  <span className="q-link-meta">PDF</span>
                </EditableLink>
                <ListControls path="documents" index={i} template={docTemplate} />
              </div>
            ))}
            <ListControls path="documents" template={docTemplate} />
          </div>
        </div>
        <div className="q-stack">
          {certs.map((c, i) => (
            <div className="q-badge" key={`${c.kind}-${i}`} style={{ '--i': i }}>
              <div className="q-badge-visual"><CertBadge kind={c.kind} size={88}/></div>
              <div className="q-badge-info">
                <div className="q-badge-num">{String(i + 1).padStart(2, '0')} / {String(certs.length).padStart(2, '0')}</div>
                <Editable as="div" className="q-badge-name" path={`certifications.${i}.name`} />
                <Editable as="div" className="q-badge-desc" path={`certifications.${i}.desc`} />
                <div className="q-badge-status">
                  <span className="q-badge-dot"/> active · <Editable path={`certifications.${i}.year`} />
                </div>
                <ListControls path="certifications" index={i} template={certTemplate} />
              </div>
            </div>
          ))}
          <div className="q-badge-add-wrap">
            <ListControls path="certifications" template={certTemplate} />
          </div>
        </div>
      </div>
    </section>
  );
}
