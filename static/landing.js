// Landing — scroll-snap nav, IntersectionObserver, search, keyboard.

(function () {
  const projects = window.PROJECTS || [];
  const snap = document.getElementById('snap');
  const sections = Array.from(document.querySelectorAll('.snap-section'));
  const indicator = document.getElementById('sectionIndicator');
  const navIndex = document.getElementById('navIndex');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  const TOTAL = projects.length;
  const HERO_IDX = 0;
  const ABOUT_IDX = TOTAL + 1;
  let currentIdx = HERO_IDX;

  // ── Scroll helpers ────────────────────────────────────────────
  const scrollToIdx = (idx) => {
    const target = sections[idx];
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  };

  // Si l'URL arrive avec #project-N ou #about, on scrolle après le layout.
  const jumpFromHash = () => {
    const h = location.hash.replace('#', '');
    if (!h) return;
    const el = document.getElementById(h);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'auto' });
      });
    }
  };
  window.addEventListener('load', jumpFromHash);
  window.addEventListener('hashchange', jumpFromHash);

  // ── Indicator + topbar active state ───────────────────────────
  const updateIndicator = (idx) => {
    let label, num;
    if (idx === HERO_IDX) { label = 'Index'; num = '00'; }
    else if (idx === ABOUT_IDX) { label = 'About'; num = '—'; }
    else {
      label = 'Project';
      num = String(idx).padStart(2, '0') + ' / ' + String(TOTAL).padStart(2, '0');
    }
    if (indicator) indicator.textContent = label + ' · ' + num;
    if (navIndex) navIndex.classList.toggle('is-active', idx === HERO_IDX);
    if (btnPrev) btnPrev.disabled = idx === HERO_IDX;
    if (btnNext) btnNext.disabled = idx === ABOUT_IDX;
    currentIdx = idx;
  };
  updateIndicator(HERO_IDX);

  // ── IntersectionObserver pour tracker la section active ───────
  if (snap && sections.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          const idx = Number(entry.target.dataset.idx);
          if (!Number.isNaN(idx)) updateIndicator(idx);
        }
      });
    }, { root: snap, threshold: [0.55] });
    sections.forEach((s) => io.observe(s));
  }

  // ── Nav arrows ─────────────────────────────────────────────────
  if (btnPrev) btnPrev.addEventListener('click', () => {
    if (currentIdx > 0) scrollToIdx(currentIdx - 1);
  });
  if (btnNext) btnNext.addEventListener('click', () => {
    if (currentIdx < ABOUT_IDX) scrollToIdx(currentIdx + 1);
  });

  // ── Brand + nav anchors interceptent (pour smooth scroll dans le snap) ──
  document.querySelectorAll('a[data-jump]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const idx = Number(a.dataset.jump);
      if (!Number.isNaN(idx)) {
        e.preventDefault();
        scrollToIdx(idx);
      }
    });
  });
  // Liens d'ancre internes (#about, #project-N) → utiliser scrollIntoView dans le conteneur snap.
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    if (a.dataset.jump != null) return;
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const el = id ? document.getElementById(id) : null;
      if (el && el.classList.contains('snap-section')) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ── Keyboard nav ───────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    const inField = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      scrollToIdx(HERO_IDX);
      setTimeout(() => searchInput && searchInput.focus(), 350);
      return;
    }
    if (inField) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      if (currentIdx < ABOUT_IDX) scrollToIdx(currentIdx + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      if (currentIdx > 0) scrollToIdx(currentIdx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollToIdx(HERO_IDX);
    } else if (e.key === 'End') {
      e.preventDefault();
      scrollToIdx(ABOUT_IDX);
    }
  });

  // ── Search live ───────────────────────────────────────────────
  if (searchInput && searchResults) {
    const renderResults = (rows) => {
      if (!rows.length) {
        searchResults.innerHTML = '<div class="search-empty">Aucun projet trouvé</div>';
        searchResults.hidden = false;
        return;
      }
      searchResults.innerHTML = rows.slice(0, 6).map((p) => `
        <a href="#project-${p.id}" class="search-row" data-id="${p.id}">
          <span class="swatch" style="background:${p.accent}"></span>
          <span class="meta">
            <span class="meta-name">${escapeHtml(p.name)}</span>
            <span class="meta-tagline">${escapeHtml(p.tagline)}</span>
          </span>
          <span class="meta-tags">
            ${p.tags.slice(0, 2).map((t) => `<span>${escapeHtml(t)}</span>`).join('')}
          </span>
        </a>
      `).join('');
      searchResults.hidden = false;
      searchResults.querySelectorAll('.search-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          const id = Number(row.dataset.id);
          const idx = projects.findIndex((p) => p.id === id);
          if (idx !== -1) {
            e.preventDefault();
            searchInput.value = '';
            searchResults.hidden = true;
            scrollToIdx(idx + 1);
          }
        });
      });
    };

    const filterAndRender = () => {
      const q = searchInput.value.toLowerCase().trim();
      if (!q) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
      const rows = projects.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q))
      );
      renderResults(rows);
    };

    searchInput.addEventListener('input', filterAndRender);
    searchInput.addEventListener('focus', filterAndRender);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search')) searchResults.hidden = true;
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
})();
