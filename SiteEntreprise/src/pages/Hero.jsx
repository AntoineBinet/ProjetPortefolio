import { useState, useEffect, useRef, useMemo } from 'react';
import PointCloud from '../components/PointCloud';
import Icon from '../components/Icon';
import { UP_DATA } from '../data';

export default function Hero({ tweaks }) {
  const words = UP_DATA.rotatingWords;
  const [idx, setIdx] = useState(0);

  const eyebrowRef = useRef(null);
  const titleRef = useRef(null);
  const subRef = useRef(null);
  const ctaRef = useRef(null);
  const statsRef = useRef(null);
  // Stable array reference so PointCloud doesn't re-init on each render.
  const textRefs = useMemo(
    () => [eyebrowRef, titleRef, subRef, ctaRef, statsRef],
    [],
  );

  useEffect(() => {
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
          <span className="dot" /> Conseil en ingénierie · électronique · informatique embarquée · mécatronique
        </div>
        <h1 className="hero-title" ref={titleRef}>
          <span className="hero-light">What's Up ?</span>
          <span className="hero-rotator">
            {words.map((w, i) => (
              <span key={w} className={`word ${i === idx ? 'active' : ''}`}>{w}</span>
            ))}
          </span>
        </h1>
        <p className="hero-sub" ref={subRef}>
          UP TECHNOLOGIES&nbsp;! Société de conseil en ingénierie et bureau d'études
          en électronique, informatique embarquée, et systèmes mécatroniques.
          6 agences en France, 5 secteurs industriels.
        </p>
        <div className="hero-cta" ref={ctaRef}>
          <a className="btn btn-primary" href="#carriere">
            Découvrir nos opportunités <Icon name="arrow" size={16}/>
          </a>
          <a className="btn btn-ghost" href={`mailto:${UP_DATA.contact.email}`}>Nous contacter</a>
        </div>
        <div className="hero-stats" ref={statsRef}>
          <div><strong>6</strong><span>agences en France</span></div>
          <div><strong>5</strong><span>secteurs industriels</span></div>
          <div><strong>3</strong><span>certifications ISO</span></div>
          <div><strong>CIR</strong><span>agrément recherche</span></div>
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
