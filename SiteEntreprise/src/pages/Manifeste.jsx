import Icon from '../components/Icon';
import { UP_DATA } from '../data';

export default function Manifeste() {
  const data = UP_DATA.whyUp;
  return (
    <section className="m-section" id="manifeste">
      <div className="m-marquee" aria-hidden="true">
        <div className="m-marquee-track">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i}>Manifeste · 2026 · Up Technologies · Réactivité &nbsp;◆&nbsp; Manifeste · 2026 · Up Technologies · Réactivité &nbsp;◆&nbsp;</span>
          ))}
        </div>
      </div>
      <div className="container">
        <div className="m-head">
          <div className="kicker">5 convictions · développement de systèmes complexes</div>
          <h2 className="display">
            Alors venez<br/>
            <em>participer</em> à notre<br/>
            développement.
          </h2>
          <div className="m-head-cta">
            <a className="btn btn-primary" href="#carriere">
              Découvrir nos opportunités <Icon name="arrow" size={16}/>
            </a>
            <a className="btn btn-ghost" href={`mailto:${UP_DATA.contact.email}`}>
              Nous contacter
            </a>
          </div>
        </div>
      </div>
      <div className="m-rail-wrap">
        <div className="m-rail">
          {data.map((b, i) => (
            <article className="m-card" key={i} style={{ '--i': i }}>
              <div className="m-card-num">{String(i + 1).padStart(2, '0')}<span>/05</span></div>
              <div className="m-card-icon"><Icon name={b.icon} size={32} stroke="#EF8827"/></div>
              <h3>{b.title}</h3>
              <p>{b.text}</p>
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
