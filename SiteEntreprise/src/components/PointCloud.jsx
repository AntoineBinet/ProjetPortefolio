import { useRef, useEffect } from 'react';

/* PointCloud — version stylisée :
   - densité moyenne, points et liens plus visibles
   - 3 classes de points (small/medium/large) → variété visuelle
   - liens limités aux 4 plus proches voisins par point
   - épaisseur de ligne variable selon la distance (proche = épais)
   - opacité plus marquée au repos, spotlight orange au hover
*/

export default function PointCloud({ density = 2.2, dark = false, repel = true, repelTargets = [] }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    points: [],
    mouse: { x: -9999, y: -9999, active: false },
    rects: [],
    raf: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const initPoints = () => {
      const count = Math.floor((w * h) / 18000 * density);
      stateRef.current.points = Array.from({ length: count }, () => {
        // 3 classes de tailles : 60% small, 30% medium, 10% large (hubs visuels)
        const roll = Math.random();
        let r, sizeClass;
        if (roll < 0.6)        { r = 1.3 + Math.random() * 0.7;  sizeClass = 0; }
        else if (roll < 0.9)   { r = 2.0 + Math.random() * 1.0;  sizeClass = 1; }
        else                   { r = 3.0 + Math.random() * 1.6;  sizeClass = 2; }
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.20,
          vy: (Math.random() - 0.5) * 0.20,
          r,
          sizeClass,
          phaseX: Math.random() * Math.PI * 2,
          phaseY: Math.random() * Math.PI * 2,
          ampX: 2 + Math.random() * 4,
          ampY: 2 + Math.random() * 4,
          freqX: 0.0003 + Math.random() * 0.0005,
          freqY: 0.0003 + Math.random() * 0.0005,
          ox: 0, oy: 0,
        };
      });
    };

    const computeRects = () => {
      const rect = canvas.getBoundingClientRect();
      const out = [];
      for (const ref of repelTargets) {
        const el = ref && ref.current;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // Padding around text so points don't graze the letters.
        const pad = 18;
        out.push({
          x: r.left - rect.left - pad,
          y: r.top  - rect.top  - pad,
          w: r.width  + pad * 2,
          h: r.height + pad * 2,
        });
      }
      stateRef.current.rects = out;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initPoints();
      computeRects();
    };
    resize();
    window.addEventListener('resize', resize);
    // Recompute rects after fonts/layout settle, and on scroll inside the page.
    const rectsTimer = setTimeout(computeRects, 250);
    const rectsTimer2 = setTimeout(computeRects, 1200);
    window.addEventListener('scroll', computeRects, { passive: true });

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      stateRef.current.mouse.x = e.clientX - rect.left;
      stateRef.current.mouse.y = e.clientY - rect.top;
      stateRef.current.mouse.active = true;
    };
    const onLeave = () => {
      stateRef.current.mouse.active = false;
      stateRef.current.mouse.x = -9999;
      stateRef.current.mouse.y = -9999;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);

    const tick = () => {
      const { points, mouse, rects } = stateRef.current;
      const now = performance.now();
      ctx.clearRect(0, 0, w, h);

      const mouseR = 180;
      const linkD = 185;
      const NEIGHBORS = 4; // chaque point ne se relie qu'à ses N plus proches voisins
      const textReach = 90; // distance d'influence autour des zones de texte

      for (const p of points) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.x = Math.max(0, Math.min(w, p.x));
        p.y = Math.max(0, Math.min(h, p.y));

        const fx = Math.sin(now * p.freqX + p.phaseX) * p.ampX;
        const fy = Math.cos(now * p.freqY + p.phaseY) * p.ampY;

        let targetOx = fx, targetOy = fy;

        if (mouse.active) {
          const px = p.x + fx, py = p.y + fy;
          const dx = px - mouse.x, dy = py - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < mouseR && d > 0.001) {
            const f = (1 - d / mouseR) * (repel ? 1 : -1) * 0.7;
            targetOx = fx + (dx / d) * f * 22;
            targetOy = fy + (dy / d) * f * 22;
          }
        }

        // Repel away from text rectangles. Same logic as the mouse:
        // find the closest point on the rect, push outward if within reach.
        if (rects.length) {
          const px = p.x, py = p.y;
          for (const r of rects) {
            const cx = Math.max(r.x, Math.min(px, r.x + r.w));
            const cy = Math.max(r.y, Math.min(py, r.y + r.h));
            const dx = px - cx, dy = py - cy;
            let d = Math.sqrt(dx * dx + dy * dy);
            if (d < textReach) {
              let nx, ny;
              if (d > 0.001) {
                nx = dx / d; ny = dy / d;
              } else {
                // Inside the rect: push toward the nearest edge.
                const left = px - r.x, right = (r.x + r.w) - px;
                const top = py - r.y, bottom = (r.y + r.h) - py;
                const m = Math.min(left, right, top, bottom);
                if (m === left) { nx = -1; ny = 0; }
                else if (m === right) { nx = 1; ny = 0; }
                else if (m === top) { nx = 0; ny = -1; }
                else { nx = 0; ny = 1; }
                d = 0.001;
              }
              const f = (1 - Math.min(1, d / textReach)) * 1.0;
              targetOx += nx * f * 28;
              targetOy += ny * f * 28;
            }
          }
        }

        p.ox = p.ox * 0.85 + targetOx * 0.15;
        p.oy = p.oy * 0.85 + targetOy * 0.15;
      }

      const lineColor = dark ? 'rgba(239,136,39,' : 'rgba(17,32,42,';
      const baseAlpha = dark ? 0.42 : 0.28;

      // 1) Liens : pour chaque point, on garde les N plus proches voisins en dessous de linkD
      const linkD2 = linkD * linkD;
      const drawn = new Set(); // évite de dessiner deux fois la même paire (a→b puis b→a)

      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const ax = a.x + a.ox, ay = a.y + a.oy;
        const candidates = [];
        for (let j = 0; j < points.length; j++) {
          if (j === i) continue;
          const b = points[j];
          const bx = b.x + b.ox, by = b.y + b.oy;
          const dx = ax - bx, dy = ay - by;
          const d2 = dx * dx + dy * dy;
          if (d2 < linkD2) candidates.push({ j, d2 });
        }
        candidates.sort((u, v) => u.d2 - v.d2);
        const take = candidates.slice(0, NEIGHBORS);
        for (const { j, d2 } of take) {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (drawn.has(key)) continue;
          drawn.add(key);
          const b = points[j];
          const bx = b.x + b.ox, by = b.y + b.oy;
          const d = Math.sqrt(d2);
          const t = 1 - d / linkD;
          // épaisseur variable : proche + gros points = trait épais
          const sizeBoost = (a.sizeClass + b.sizeClass) * 0.18;
          const lw = 0.6 + t * 1.2 + sizeBoost;
          ctx.strokeStyle = lineColor + (t * baseAlpha).toFixed(3) + ')';
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      // 2) Liens orange autour de la souris (effet "spotlight")
      if (mouse.active) {
        const mouseR2 = mouseR * mouseR * 1.4;
        for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const ax = a.x + a.ox, ay = a.y + a.oy;
          const mdx = ax - mouse.x, mdy = ay - mouse.y;
          if (mdx * mdx + mdy * mdy > mouseR2) continue;
          for (let j = i + 1; j < points.length; j++) {
            const b = points[j];
            const bx = b.x + b.ox, by = b.y + b.oy;
            const dx = ax - bx, dy = ay - by;
            const d2 = dx * dx + dy * dy;
            if (d2 < linkD2) {
              const d = Math.sqrt(d2);
              const t = 1 - d / linkD;
              const md = Math.sqrt(mdx * mdx + mdy * mdy);
              const mt = Math.max(0, 1 - md / mouseR);
              const sizeBoost = (a.sizeClass + b.sizeClass) * 0.25;
              ctx.strokeStyle = `rgba(239,136,39,${(t * mt * 0.85).toFixed(3)})`;
              ctx.lineWidth = 1.0 + t * 1.4 + sizeBoost;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.stroke();
            }
          }
        }
      }

      // 3) Points — halo doux pour les hubs (sizeClass 2), point net pour tous
      for (const p of points) {
        const x = p.x + p.ox, y = p.y + p.oy;
        let fill, halo = null;
        if (mouse.active) {
          const dx = x - mouse.x, dy = y - mouse.y;
          const md = Math.sqrt(dx * dx + dy * dy);
          const mt = Math.max(0, 1 - md / mouseR);
          if (mt > 0.05) {
            fill = `rgba(239,136,39,${(0.65 + mt * 0.35).toFixed(3)})`;
            if (p.sizeClass === 2) halo = `rgba(239,136,39,${(0.18 + mt * 0.2).toFixed(3)})`;
          } else {
            fill = dark ? 'rgba(255,255,255,0.50)' : 'rgba(17,32,42,0.46)';
            if (p.sizeClass === 2) halo = dark ? 'rgba(239,136,39,0.18)' : 'rgba(239,136,39,0.14)';
          }
        } else {
          fill = dark ? 'rgba(255,255,255,0.48)' : 'rgba(17,32,42,0.42)';
          if (p.sizeClass === 2) halo = dark ? 'rgba(239,136,39,0.16)' : 'rgba(239,136,39,0.12)';
        }
        if (halo) {
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y, p.r * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      stateRef.current.raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(stateRef.current.raf);
      clearTimeout(rectsTimer);
      clearTimeout(rectsTimer2);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', computeRects);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [density, dark, repel, repelTargets]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
