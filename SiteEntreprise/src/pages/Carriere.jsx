import Icon from '../components/Icon';
import { UP_DATA } from '../data';

export default function Carriere() {
  const c = UP_DATA.carriere;
  return (
    <section className="c-section" id="carriere">
      <div className="c-bg" aria-hidden="true">
        <div className="c-bg-line"/>
        <div className="c-bg-line"/>
        <div className="c-bg-line"/>
        <div className="c-bg-line"/>
        <div className="c-bg-line"/>
      </div>
      <div className="container c-head">
        <div className="kicker kicker-orange">Carrière</div>
        <h2 className="c-mega">
          <span>Follow</span>
          <span className="c-mega-up">Up<sup>↗</sup></span>
        </h2>
        <p className="c-tag">Accélérateur de carrière. Pas un slogan — un mode d'emploi.</p>
      </div>

      <div className="container">
        <div className="c-grid">
          {c.avantages.map((a, i) => (
            <div className={`c-card c-card-${i % 4}`} key={i}>
              <div className="c-card-edge"/>
              <div className="c-card-num">0{i + 1}</div>
              <h3>{a.title}</h3>
              <p>{a.text}</p>
              <div className="c-card-bottom">
                <span>→</span>
                <span className="c-card-meta">avantage</span>
              </div>
            </div>
          ))}
        </div>

        <div className="c-questions">
          <div className="c-q-side">
            <div className="kicker kicker-orange">Avant de candidater</div>
            <h3 className="c-q-title">4 questions<br/>à se poser.</h3>
            <a className="btn btn-primary" href="#contact">
              Postuler maintenant <Icon name="arrow" size={16}/>
            </a>
          </div>
          <ol className="c-q-list">
            {c.questions.map((q, i) => (
              <li key={i}>
                <span className="c-q-num">/{String(i + 1).padStart(2, '0')}</span>
                <span className="c-q-text">{q}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
