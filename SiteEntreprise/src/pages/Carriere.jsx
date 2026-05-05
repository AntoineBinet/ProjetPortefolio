import Icon from '../components/Icon';
import { UP_DATA } from '../data';
import followUpImg from '../assets/car-follow-up.jpg';
import careerAheadImg from '../assets/car-career-ahead.jpg';
import smartImg from '../assets/car-smart.jpg';
import cvImg from '../assets/car-cv.jpg';

export default function Carriere() {
  const c = UP_DATA.carriere;
  return (
    <section className="c-section" id="carriere">
      <div
        className="c-hero-bg"
        aria-hidden="true"
        style={{ backgroundImage: `url(${followUpImg})` }}
      />
      <div className="c-bg" aria-hidden="true">
        <div className="c-bg-line"/>
        <div className="c-bg-line"/>
        <div className="c-bg-line"/>
        <div className="c-bg-line"/>
        <div className="c-bg-line"/>
      </div>
      <div className="container c-head">
        <div className="kicker kicker-orange">Carrière · Follow Up</div>
        <h2 className="c-mega">
          <span>Follow</span>
          <span className="c-mega-up">Up<sup>↗</sup></span>
        </h2>
        <p className="c-tag">Accélérateur de carrière. Pas un slogan — un mode d'emploi.</p>

        <nav className="c-anchors" aria-label="Sections Carrière">
          <a href="#pourquoi-up">Pourquoi Up ?</a>
          <span className="c-anchors-sep">|</span>
          <a href="#metier-consultant">Le métier de consultant</a>
          <span className="c-anchors-sep">|</span>
          <a href="#nous-rejoindre">Conseils pour nous rejoindre</a>
        </nav>
      </div>

      {/* 1 — Pourquoi Up ? */}
      <div className="container c-block" id="pourquoi-up">
        <div className="c-block-head">
          <span className="c-block-num">/01</span>
          <div>
            <div className="kicker kicker-orange">{c.pourquoi.kicker}</div>
            <h3 className="c-block-title">{c.pourquoi.title}</h3>
          </div>
        </div>
        <div className="c-with-visual">
          <ul className="c-pourquoi-list c-pourquoi-list-stacked">
            {c.pourquoi.points.map((p, i) => (
              <li key={i}>
                <span className="c-pq-marker"/>
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <figure className="c-figure">
            <img src={careerAheadImg} alt="Career Ahead — panneau ciel"/>
            <figcaption>Career Ahead</figcaption>
          </figure>
        </div>
      </div>

      {/* 2 — Le métier de consultant */}
      <div className="container c-block" id="metier-consultant">
        <div className="c-block-head">
          <span className="c-block-num">/02</span>
          <div>
            <div className="kicker kicker-orange">{c.metier.kicker}</div>
            <h3 className="c-block-title">{c.metier.title}</h3>
          </div>
        </div>
        <div className="c-intro-row">
          <p className="c-block-intro">{c.metier.intro}</p>
          <figure className="c-figure c-figure-sm">
            <img src={smartImg} alt="SMART — Specific, Measurable, Achievable, Realistic, Timely"/>
            <figcaption>SMART · objectifs consultant</figcaption>
          </figure>
        </div>

        <div className="c-twocol">
          <div className="c-twocol-side c-twocol-pos">
            <div className="c-twocol-label">+ Avantages</div>
            <div className="c-grid c-grid-tight">
              {c.metier.avantages.map((a, i) => (
                <div className="c-card" key={`av-${i}`}>
                  <div className="c-card-edge"/>
                  <div className="c-card-num">0{i + 1}</div>
                  <h4>{a.title}</h4>
                  <p>{a.text}</p>
                  <div className="c-card-bottom">
                    <span>+</span>
                    <span className="c-card-meta">avantage</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="c-twocol-side c-twocol-neg">
            <div className="c-twocol-label">— La contrepartie</div>
            <div className="c-grid c-grid-tight">
              {c.metier.contreparties.map((a, i) => (
                <div className="c-card c-card-alt" key={`cp-${i}`}>
                  <div className="c-card-edge"/>
                  <div className="c-card-num">0{i + 1}</div>
                  <h4>{a.title}</h4>
                  <p>{a.text}</p>
                  <div className="c-card-bottom">
                    <span>−</span>
                    <span className="c-card-meta">contrepartie</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3 — Conseils pour nous rejoindre */}
      <div className="container c-block" id="nous-rejoindre">
        <div className="c-block-head">
          <span className="c-block-num">/03</span>
          <div>
            <div className="kicker kicker-orange">{c.rejoindre.kicker}</div>
            <h3 className="c-block-title">{c.rejoindre.title}</h3>
          </div>
        </div>
        <div className="c-questions">
          <div className="c-q-side">
            <figure className="c-figure c-figure-cv">
              <img src={cvImg} alt="Curriculum Vitae"/>
              <figcaption>Définir ton projet pro</figcaption>
            </figure>
            <p className="c-q-intro">{c.rejoindre.intro}</p>
            <a className="btn btn-primary" href={`mailto:${UP_DATA.contact.email}?subject=Candidature spontanée`}>
              Candidater par mail <Icon name="arrow" size={16}/>
            </a>
            <a className="btn btn-ghost" href={UP_DATA.contact.linkedinJobs} target="_blank" rel="noopener noreferrer">
              <Icon name="linkedin" size={14}/> Voir nos offres LinkedIn
            </a>
          </div>
          <ol className="c-q-list">
            {c.rejoindre.questions.map((q, i) => (
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
