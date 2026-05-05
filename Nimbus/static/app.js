/* NIMBUS — interactions vitrine
 *
 * - Configurator : change la couleur des CSS vars en temps réel sur les SVG
 *                   (via document.documentElement.style.setProperty)
 * - FAQ accordéon : un seul item ouvert à la fois
 * - Nav sticky shadow : ajoute .is-stuck quand on a scrollé
 * - Showcase : tilt léger du casque selon la position de souris
 */
(function () {
  'use strict';

  // ================ Nav stuck ================
  const nav = document.getElementById('nav');
  if (nav) {
    let stuck = false;
    const onScroll = () => {
      const should = window.scrollY > 24;
      if (should !== stuck) {
        stuck = should;
        nav.classList.toggle('is-stuck', stuck);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ================ Configurator ================
  const PALETTES = {
    eclipse: {
      cup1: '#5a4ddc', cup2: '#2d2473', cup3: '#0d0825',
      rim1: '#8c7eff', rim2: '#2a1f6b',
      band1: '#d2c8ff', band2: '#6f64c4', band3: '#2c2569',
      led: '#c9b8ff',
      accent1: '#5a4ddc', accent2: '#c9b8ff',
      glow: 'rgba(140, 126, 255, 0.55)',
      label: 'Eclipse',
    },
    sage: {
      cup1: '#a8c0a0', cup2: '#5a7560', cup3: '#1f3024',
      rim1: '#c8d8c0', rim2: '#456a4e',
      band1: '#dde6d2', band2: '#7a8e74', band3: '#2a3a2a',
      led: '#cee0c2',
      accent1: '#7a9070', accent2: '#cee0c2',
      glow: 'rgba(168, 192, 160, 0.5)',
      label: 'Sauge',
    },
    linen: {
      cup1: '#e8dccb', cup2: '#a89880', cup3: '#5a4e3a',
      rim1: '#f4ecda', rim2: '#7a6c54',
      band1: '#f8f1e2', band2: '#c4b59a', band3: '#7a6c54',
      led: '#f4ecda',
      accent1: '#a89880', accent2: '#f4ecda',
      glow: 'rgba(232, 220, 203, 0.55)',
      label: 'Linen',
    },
    ember: {
      cup1: '#e87f4a', cup2: '#a13d18', cup3: '#3a1408',
      rim1: '#ffb088', rim2: '#7a2810',
      band1: '#ffd0b0', band2: '#c45a30', band3: '#5a1f08',
      led: '#ffd0b0',
      accent1: '#e87f4a', accent2: '#ffb088',
      glow: 'rgba(232, 127, 74, 0.55)',
      label: 'Ember',
    },
  };

  const swatches = document.querySelectorAll('.swatch');
  const finishLabel = document.getElementById('configFinish');
  const root = document.documentElement;

  function applyPalette(name) {
    const p = PALETTES[name];
    if (!p) return;
    root.style.setProperty('--cup-1', p.cup1);
    root.style.setProperty('--cup-2', p.cup2);
    root.style.setProperty('--cup-3', p.cup3);
    root.style.setProperty('--rim-1', p.rim1);
    root.style.setProperty('--rim-2', p.rim2);
    root.style.setProperty('--band-1', p.band1);
    root.style.setProperty('--band-2', p.band2);
    root.style.setProperty('--band-3', p.band3);
    root.style.setProperty('--led-color', p.led);
    root.style.setProperty('--accent-1', p.accent1);
    root.style.setProperty('--accent-2', p.accent2);
    root.style.setProperty('--accent-glow', p.glow);
    if (finishLabel) finishLabel.textContent = p.label;
  }

  swatches.forEach((sw) => {
    sw.addEventListener('click', () => {
      swatches.forEach((s) => {
        s.classList.remove('is-active');
        s.setAttribute('aria-checked', 'false');
      });
      sw.classList.add('is-active');
      sw.setAttribute('aria-checked', 'true');
      const name = sw.getAttribute('data-color');
      applyPalette(name);
    });
  });

  // ================ FAQ ================
  document.querySelectorAll('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const isOpen = item.classList.contains('is-open');
      // ferme tous les autres
      document.querySelectorAll('.faq-item.is-open').forEach((el) => {
        if (el !== item) el.classList.remove('is-open');
      });
      item.classList.toggle('is-open', !isOpen);
    });
  });

  // ================ Showcase tilt ================
  const showcaseSvg = document.getElementById('showcaseSvg');
  const stage = document.getElementById('showcaseStage');
  if (showcaseSvg && stage) {
    let raf = null;
    const onMove = (e) => {
      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        showcaseSvg.style.transform = `perspective(1200px) rotateY(${x * 8}deg) rotateX(${-y * 6}deg)`;
      });
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      showcaseSvg.style.transform = '';
    };
    stage.addEventListener('mousemove', onMove);
    stage.addEventListener('mouseleave', onLeave);
  }

  // ================ Reveal au scroll (IntersectionObserver) ================
  const reveal = (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
      }
    });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(reveal, { threshold: 0.15 });
    document.querySelectorAll('.feature-card, .price-card, .spec-block').forEach((el) => {
      io.observe(el);
    });
  }
})();
