import { useState, useEffect, useRef, useMemo } from 'react';
import PointCloud from '../components/PointCloud';
import Icon from '../components/Icon';
import { useContent } from '../admin/AdminContext';
import { Editable, NavGuardLink } from '../admin/Editable';
import { ListControls } from '../admin/AdminToolbar';

const statTemplate = () => ({ value: '0', label: 'Nouveau KPI' });
const wordTemplate = () => 'mot';

export default function Hero({ tweaks }) {
  const data = useContent();
  const words = data.rotatingWords || [];
  const stats = data.hero?.stats || [];
  const contact = data.contact || {};
  const hero = data.hero || {};

  const [idx, setIdx] = useState(0);

  const eyebrowRef = useRef(null);
  const titleRef = useRef(null);
  const subRef = useRef(null);
  const ctaRef = useRef(null);
  const statsRef = useRef(null);
  const textRefs = useMemo(
    () => [eyebrowRef, titleRef, subRef, ctaRef, statsRef],
    [],
  );

  useEffect(() => {
    if (!words.length) return;
    const id = setInterval(() => setIdx(i => (i + 1) % words.length), 3000);
    return () => clearInterval(id);
  }, [words.length]);

  return (
    <section className="hero" id="home">
      <div className="hero-cloud">
        <PointCloud
          density={tweaks.density}
          dark={tweaks.dark}
          repel={tweaks.repel}
          repelTargets={textRefs}
        />
      </div>
      <div className="hero-grain" />
      <div className="hero-content">
        <div className="hero-eyebrow" ref={eyebrowRef}>
          <span className="dot" /> <Editable path="hero.eyebrow" />
        </div>
        <h1 className="hero-title" ref={titleRef}>
          <Editable as="span" className="hero-light" path="hero.titleLight" />
          <span className="hero-rotator">
            {words.map((w, i) => (
              <Editable
                key={`${w}-${i}`}
                as="span"
                className={`word ${i === idx ? 'active' : ''}`}
                path={`rotatingWords.${i}`}
              />
            ))}
          </span>
        </h1>
        {/* Panneau admin : édition de la liste de mots rotatifs (visible
            uniquement en mode édition via CSS [data-edit-mode]). */}
        <div className="hero-words-edit" aria-hidden="true">
          <span className="hero-words-edit-label">Mots rotatifs :</span>
          {words.map((w, i) => (
            <span key={`w-${i}`} className="hero-words-chip">
              <Editable as="span" path={`rotatingWords.${i}`} />
              <ListControls path="rotatingWords" index={i} template={wordTemplate} />
            </span>
          ))}
          <ListControls path="rotatingWords" template={wordTemplate} />
        </div>
        <p className="hero-sub" ref={subRef}>
          <Editable path="hero.sub" multiline html />
        </p>
        <div className="hero-cta" ref={ctaRef}>
          <NavGuardLink className="btn btn-primary" href="#carriere">
            <Editable path="hero.ctaPrimary" /> <Icon name="arrow" size={16}/>
          </NavGuardLink>
          <NavGuardLink className="btn btn-ghost" href={`mailto:${contact.email || ''}`}>
            <Editable path="hero.ctaSecondary" />
          </NavGuardLink>
        </div>
        <div className="hero-stats" ref={statsRef}>
          {stats.map((s, i) => (
            <div key={i} className="hero-stat-wrap">
              <Editable as="strong" path={`hero.stats.${i}.value`} />
              <Editable as="span" path={`hero.stats.${i}.label`} />
              <ListControls path="hero.stats" index={i} template={statTemplate} />
            </div>
          ))}
          <div className="hero-stat-add"><ListControls path="hero.stats" template={statTemplate} /></div>
        </div>
      </div>
      <button
        className="hero-scroll"
        aria-label="Faire défiler vers la section suivante"
        onClick={() => document.getElementById('manifeste')?.scrollIntoView({ behavior: 'smooth' })}
      >
        <Icon name="arrow-down" size={18}/>
      </button>
    </section>
  );
}
