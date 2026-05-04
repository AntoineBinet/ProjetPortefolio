import { useRef, useEffect } from 'react';

export default function PointCloud({ density = 2.5, dark = false, repel = true }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ points: [], mouse: { x: -9999, y: -9999, active: false }, raf: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0;
    const dpr = window.devicePixelRatio || 1;

    const initPoints = () => {
      const count = Math.floor((w * h) / 14000 * density);
      stateRef.current.points = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 1.2,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        ampX: 4 + Math.random() * 6,
        ampY: 4 + Math.random() * 6,
        freqX: 0.0005 + Math.random() * 0.0008,
        freqY: 0.0005 + Math.random() * 0.0008,
        ox: 0, oy: 0,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initPoints();
    };
    resize();
    window.addEventListener('resize', resize);

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
      const { points, mouse } = stateRef.current;
      const now = performance.now();
      ctx.clearRect(0, 0, w, h);

      const mouseR = 180;
      const linkD = 140;

      for (const p of points) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.x = Math.max(0, Math.min(w, p.x));
        p.y = Math.max(0, Math.min(h, p.y));

        const fx = Math.sin(now * p.freqX + p.phaseX) * p.ampX;
        const fy = Math.cos(now * p.freqY + p.phaseY) * p.ampY;

        if (mouse.active) {
          const px = p.x + fx, py = p.y + fy;
          const dx = px - mouse.x, dy = py - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < mouseR && d > 0.001) {
            const f = (1 - d / mouseR) * (repel ? 1 : -1) * 0.9;
            p.ox = fx + (dx / d) * f * 28;
            p.oy = fy + (dy / d) * f * 28;
          } else {
            p.ox = p.ox * 0.85 + fx * 0.15;
            p.oy = p.oy * 0.85 + fy * 0.15;
          }
        } else {
          p.ox = p.ox * 0.85 + fx * 0.15;
          p.oy = p.oy * 0.85 + fy * 0.15;
        }
      }

      const lineColor = dark ? 'rgba(239,136,39,' : 'rgba(17,32,42,';
      const baseAlpha = dark ? 0.45 : 0.32;

      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const ax = a.x + a.ox, ay = a.y + a.oy;
        for (let j = i + 1; j < points.length; j++) {
          const b = points[j];
          const bx = b.x + b.ox, by = b.y + b.oy;
          const dx = ax - bx, dy = ay - by;
          const d2 = dx * dx + dy * dy;
          if (d2 < linkD * linkD) {
            const d = Math.sqrt(d2);
            const t = 1 - d / linkD;
            ctx.strokeStyle = lineColor + (t * baseAlpha).toFixed(3) + ')';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
      }

      if (mouse.active) {
        for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const ax = a.x + a.ox, ay = a.y + a.oy;
          const mdx = ax - mouse.x, mdy = ay - mouse.y;
          if (mdx * mdx + mdy * mdy > mouseR * mouseR * 1.3) continue;
          for (let j = i + 1; j < points.length; j++) {
            const b = points[j];
            const bx = b.x + b.ox, by = b.y + b.oy;
            const dx = ax - bx, dy = ay - by;
            const d2 = dx * dx + dy * dy;
            if (d2 < linkD * linkD) {
              const d = Math.sqrt(d2);
              const t = 1 - d / linkD;
              const md = Math.sqrt(mdx * mdx + mdy * mdy);
              const mt = Math.max(0, 1 - md / mouseR);
              ctx.strokeStyle = `rgba(239,136,39,${(t * mt * 0.85).toFixed(3)})`;
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.stroke();
            }
          }
        }
      }

      for (const p of points) {
        const x = p.x + p.ox, y = p.y + p.oy;
        let fill;
        if (mouse.active) {
          const dx = x - mouse.x, dy = y - mouse.y;
          const md = Math.sqrt(dx * dx + dy * dy);
          const mt = Math.max(0, 1 - md / mouseR);
          fill = mt > 0.05
            ? `rgba(239,136,39,${(0.6 + mt * 0.4).toFixed(3)})`
            : dark ? 'rgba(255,255,255,0.55)' : 'rgba(17,32,42,0.55)';
        } else {
          fill = dark ? 'rgba(255,255,255,0.5)' : 'rgba(17,32,42,0.5)';
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
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [density, dark, repel]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
