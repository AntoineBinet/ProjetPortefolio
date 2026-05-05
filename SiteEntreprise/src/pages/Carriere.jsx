import Icon from '../components/Icon';
import { useContent } from '../admin/AdminContext';
import { Editable, EditableImage, NavGuardLink } from '../admin/Editable';
import { ListControls } from '../admin/AdminToolbar';
import followUpImg from '../assets/car-follow-up.jpg';
import careerAheadImg from '../assets/car-career-ahead.jpg';
import smartImg from '../assets/car-smart.jpg';
import cvImg from '../assets/car-cv.jpg';

const pourquoiPointTemplate = () => 'Nouveau point fort.';
const avantageTemplate = () => ({ title: 'Nouvel avantage', text: 'Description de l\'avantage.' });
const contrepartieTemplate = () => ({ title: 'Nouvelle contrepartie', text: 'Description de la contrepartie.' });
const questionTemplate = () => 'Nouvelle question à se poser ?';

export default function Carriere() {
  const data = useContent();
  const c = data.carriere || {};
  const contact = data.contact || {};

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
        <Editable as="div" className="kicker kicker-orange" path="carriere.headKicker" />
        <h2 className="c-mega">
          <span>Follow</span>
          <span className="c-mega-up">Up<sup>↗</sup></span>
        </h2>
        <Editable as="p" className="c-tag" path="carriere.headTagline" />

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
            <Editable as="div" className="kicker kicker-orange" path="carriere.pourquoi.kicker" />
            <Editable as="h3" className="c-block-title" path="carriere.pourquoi.title" />
          </div>
        </div>
        <div className="c-with-visual">
          <ul className="c-pourquoi-list c-pourquoi-list-stacked">
            {(c.pourquoi?.points || []).map((p, i) => (
              <li key={i}>
                <span className="c-pq-marker"/>
                <Editable as="span" path={`carriere.pourquoi.points.${i}`} />
                <ListControls path="carriere.pourquoi.points" index={i} template={pourquoiPointTemplate} />
              </li>
            ))}
            <li><ListControls path="carriere.pourquoi.points" template={pourquoiPointTemplate} /></li>
          </ul>
          <figure className="c-figure">
            <EditableImage src={careerAheadImg} alt="Career Ahead — panneau ciel" path="carriere.pourquoi.image" />
            <figcaption>Career Ahead</figcaption>
          </figure>
        </div>
      </div>

      {/* 2 — Le métier de consultant */}
      <div className="container c-block" id="metier-consultant">
        <div className="c-block-head">
          <span className="c-block-num">/02</span>
          <div>
            <Editable as="div" className="kicker kicker-orange" path="carriere.metier.kicker" />
            <Editable as="h3" className="c-block-title" path="carriere.metier.title" />
          </div>
        </div>
        <div className="c-intro-row">
          <Editable as="p" className="c-block-intro" path="carriere.metier.intro" multiline />
          <figure className="c-figure c-figure-sm">
            <EditableImage src={smartImg} alt="SMART — Specific, Measurable, Achievable, Realistic, Timely" path="carriere.metier.image" />
            <figcaption>SMART · objectifs consultant</figcaption>
          </figure>
        </div>

        <div className="c-twocol">
          <div className="c-twocol-side c-twocol-pos">
            <div className="c-twocol-label">+ Avantages</div>
            <div className="c-grid c-grid-tight">
              {(c.metier?.avantages || []).map((a, i) => (
                <div className="c-card" key={`av-${i}`}>
                  <div className="c-card-edge"/>
                  <div className="c-card-num">0{i + 1}</div>
                  <Editable as="h4" path={`carriere.metier.avantages.${i}.title`} />
                  <Editable as="p" path={`carriere.metier.avantages.${i}.text`} multiline />
                  <div className="c-card-bottom">
                    <span>+</span>
                    <span className="c-card-meta">avantage</span>
                  </div>
                  <ListControls path="carriere.metier.avantages" index={i} template={avantageTemplate} />
                </div>
              ))}
              <div className="c-card-add"><ListControls path="carriere.metier.avantages" template={avantageTemplate} /></div>
            </div>
          </div>
          <div className="c-twocol-side c-twocol-neg">
            <div className="c-twocol-label">— La contrepartie</div>
            <div className="c-grid c-grid-tight">
              {(c.metier?.contreparties || []).map((a, i) => (
                <div className="c-card c-card-alt" key={`cp-${i}`}>
                  <div className="c-card-edge"/>
                  <div className="c-card-num">0{i + 1}</div>
                  <Editable as="h4" path={`carriere.metier.contreparties.${i}.title`} />
                  <Editable as="p" path={`carriere.metier.contreparties.${i}.text`} multiline />
                  <div className="c-card-bottom">
                    <span>−</span>
                    <span className="c-card-meta">contrepartie</span>
                  </div>
                  <ListControls path="carriere.metier.contreparties" index={i} template={contrepartieTemplate} />
                </div>
              ))}
              <div className="c-card-add"><ListControls path="carriere.metier.contreparties" template={contrepartieTemplate} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* 3 — Conseils pour nous rejoindre */}
      <div className="container c-block" id="nous-rejoindre">
        <div className="c-block-head">
          <span className="c-block-num">/03</span>
          <div>
            <Editable as="div" className="kicker kicker-orange" path="carriere.rejoindre.kicker" />
            <Editable as="h3" className="c-block-title" path="carriere.rejoindre.title" />
          </div>
        </div>
        <div className="c-questions">
          <div className="c-q-side">
            <figure className="c-figure c-figure-cv">
              <EditableImage src={cvImg} alt="Curriculum Vitae" path="carriere.rejoindre.image" />
              <figcaption>Définir ton projet pro</figcaption>
            </figure>
            <Editable as="p" className="c-q-intro" path="carriere.rejoindre.intro" multiline />
            <NavGuardLink className="btn btn-primary" href={`mailto:${contact.email || ''}?subject=Candidature spontanée`}>
              Candidater par mail <Icon name="arrow" size={16}/>
            </NavGuardLink>
            <NavGuardLink className="btn btn-ghost" href={contact.linkedinJobs || '#'} target="_blank" rel="noopener noreferrer">
              <Icon name="linkedin" size={14}/> Voir nos offres LinkedIn
            </NavGuardLink>
          </div>
          <ol className="c-q-list">
            {(c.rejoindre?.questions || []).map((q, i) => (
              <li key={i}>
                <span className="c-q-num">/{String(i + 1).padStart(2, '0')}</span>
                <Editable as="span" className="c-q-text" path={`carriere.rejoindre.questions.${i}`} />
                <ListControls path="carriere.rejoindre.questions" index={i} template={questionTemplate} />
              </li>
            ))}
            <li><ListControls path="carriere.rejoindre.questions" template={questionTemplate} /></li>
          </ol>
        </div>
      </div>
    </section>
  );
}
