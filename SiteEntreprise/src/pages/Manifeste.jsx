import Icon from '../components/Icon';
import { useContent } from '../admin/AdminContext';
import { Editable } from '../admin/Editable';

export default function Manifeste() {
  const c = useContent();
  const data = c.whyUp || [];
  const m = c.manifeste || {};
  const contact = c.contact || {};
  const marquee = m.marquee || 'Manifeste · 2026 · Up Technologies · Réactivité';

  return (
    <section className="m-section" id="manifeste">
      <div className="m-marquee" aria-hidden="true">
        <div className="m-marquee-track">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i}>{marquee} &nbsp;◆&nbsp; {marquee} &nbsp;◆&nbsp;</span>
          ))}
        </div>
      </div>
      <div className="container">
        <div className="m-head">
          <Editable as="div" className="kicker" path="manifeste.kicker" />
          <Editable as="h2" className="display" path="manifeste.titleHtml" html />
          <div className="m-head-cta">
            <a className="btn btn-primary" href="#carriere">
              <Editable path="manifeste.ctaPrimary" /> <Icon name="arrow" size={16}/>
            </a>
            <a className="btn btn-ghost" href={`mailto:${contact.email || ''}`}>
              <Editable path="manifeste.ctaSecondary" />
            </a>
          </div>
        </div>
      </div>
      <div className="m-rail-wrap">
        <div className="m-rail">
          {data.map((b, i) => (
            <article className="m-card" key={i} style={{ '--i': i }}>
              <div className="m-card-num">{String(i + 1).padStart(2, '0')}<span>/0{data.length}</span></div>
              <div className="m-card-icon"><Icon name={b.icon} size={32} stroke="#EF8827"/></div>
              <Editable as="h3" path={`whyUp.${i}.title`} />
              <Editable as="p" path={`whyUp.${i}.text`} multiline />
              <div className="m-card-footer">
                <span className="m-card-tag">conviction · {String(i + 1).padStart(2, '0')}</span>
                <Icon name="arrow" size={16} stroke="#EF8827"/>
              </div>
            </article>
          ))}
          <div className="m-rail-end">
            <div>
              <div className="kicker">Suite →</div>
              <h3>Et après ?<br/>Voyons ce qu'on fait.</h3>
              <a className="btn btn-primary" href="#activites">
                Activités <Icon name="arrow" size={16}/>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
