// Apps page — Apple Watch dock with bell-curve scaling around the cursor.

(function () {
  const dock = document.getElementById('dock');
  const tooltip = document.getElementById('bubbleTooltip');
  const stage = document.getElementById('dockStage');
  if (!dock || !tooltip || !stage) return;

  const BASE = Number(dock.dataset.baseSize) || 88;
  const GAP = Number(dock.dataset.gap) || 14;
  const RADIUS = 220;     // rayon d'influence du curseur (px)
  const PEAK = 1.85;      // facteur d'agrandissement max

  dock.style.setProperty('--base', BASE + 'px');
  dock.style.setProperty('--gap', GAP + 'px');

  const bubbles = Array.from(dock.querySelectorAll('.bubble'));
  bubbles.forEach((b) => { b.style.setProperty('--size', BASE + 'px'); });

  let mouseX = null;
  let dominantBubble = null;

  const scaleFor = (centerX) => {
    if (mouseX == null) return 1;
    const d = Math.abs(centerX - mouseX);
    if (d > RADIUS) return 1;
    const t = 1 - d / RADIUS;       // 0..1
    const eased = t * t * (3 - 2 * t); // smoothstep
    return 1 + (PEAK - 1) * eased;
  };

  const apply = () => {
    const dockRect = dock.getBoundingClientRect();
    let bestScale = 1;
    let bestBubble = null;
    bubbles.forEach((b) => {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2 - dockRect.left;
      // mouseX est exprimé relativement à dockRect aussi
      const s = scaleFor(cx);
      const lift = (s - 1) * 28;
      b.style.transform = `translateY(-${lift}px) scale(${s})`;
      b.style.zIndex = String(Math.round(s * 10));
      if (s > bestScale) { bestScale = s; bestBubble = b; }
    });

    // Tooltip seulement si une bulle dépasse un certain seuil de scale
    if (bestBubble && bestScale > 1.25) {
      if (bestBubble !== dominantBubble) {
        dominantBubble = bestBubble;
        tooltip.querySelector('.tt-name').textContent = bestBubble.dataset.name || '';
        tooltip.querySelector('.tt-tagline').textContent = bestBubble.dataset.tagline || '';
        tooltip.querySelector('.tt-tags').textContent = (bestBubble.dataset.tags || '').toUpperCase();
      }
      const r = bestBubble.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      tooltip.hidden = false;
      tooltip.style.left = (r.left + r.width / 2 - stageRect.left) + 'px';
      tooltip.style.top = (r.top - stageRect.top) + 'px';
    } else {
      tooltip.hidden = true;
      dominantBubble = null;
    }
  };

  let raf = null;
  const onMouseMove = (e) => {
    const rect = dock.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    if (raf == null) {
      raf = requestAnimationFrame(() => { raf = null; apply(); });
    }
  };
  const onMouseLeave = () => {
    mouseX = null;
    bubbles.forEach((b) => {
      b.style.transform = '';
      b.style.zIndex = '';
    });
    tooltip.hidden = true;
    dominantBubble = null;
  };

  dock.addEventListener('mousemove', onMouseMove);
  dock.addEventListener('mouseleave', onMouseLeave);

  // Fallback tactile : pas de scaling, juste navigation par tap sur les liens.
})();
