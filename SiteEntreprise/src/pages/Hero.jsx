import { useState, useEffect } from 'react';
import PointCloud from '../components/PointCloud';
import Icon from '../components/Icon';
import { UP_DATA } from '../data';

export default function Hero({ tweaks }) {
  const words = UP_DATA.rotatingWords;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % words.length), 2800);
    return () => clearInterval(id);
  }, [words.length]);

  return (
    <section className="hero">
      <div className="hero-cloud">
        <PointCloud density={tweaks.density} dark={tweaks.dark} repel={tweaks.repel} />
      </div>
      <div className="hero-grain" />
      <div className="hero-content">
        <div className="hero-eyebrow">
          <span className="dot" /> Conseil en ingénierie · depuis 2015
        </div>
        <h1 className="hero-title">
          <span className="hero-light">What's Up ?</span>
          <span className="hero-rotator">
            {words.map((w, i) => (
              <span key={w} className={`word ${i === idx ? 'active' : ''}`}>{w}</span>
            ))}
          </span>
        </h1>
        <p className="hero-sub">
          Nous concevons des systèmes embarqués, mécatroniques et électroniques
          pour les industriels qui ne peuvent pas se permettre d'attendre.
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#manifeste">
            Découvrir <Icon name="arrow" size={16}/>
          </a>
          <a className="btn btn-ghost" href="#carriere">Nous rejoindre</a>
        </div>
        <div className="hero-stats">
          <div><strong>6</strong><span>agences en France</span></div>
          <div><strong>48 h</strong><span>réactivité moyenne</span></div>
          <div><strong>4</strong><span>certifications</span></div>
        </div>
      </div>
      <button
        className="hero-scroll"
        onClick={() => document.getElementById('manifeste')?.scrollIntoView({ behavior: 'smooth' })}
      >
        <Icon name="arrow-down" size={18}/>
      </button>
    </section>
  );
}
