// Apps page — search filter on a vertical list. Pluralization-aware.

(function () {
  const input = document.getElementById('appsSearchInput');
  const list = document.getElementById('appsList');
  const count = document.getElementById('appsCount');
  const empty = document.getElementById('appsEmpty');
  const emptyTerm = document.getElementById('appsEmptyTerm');
  if (!input || !list) return;

  const items = Array.from(list.querySelectorAll('.apps-item'));
  const total = items.length;

  const fmt = (n, root) => {
    const s = n > 1 ? 's' : '';
    return `${n} ${root}${s} affiché${s}`;
  };

  const filter = (q) => {
    const term = q.trim().toLowerCase();
    let matches = 0;
    items.forEach((it) => {
      if (!term) {
        it.hidden = false;
        matches++;
        return;
      }
      const hay = (it.dataset.name || '') + ' ' +
                  (it.dataset.tagline || '') + ' ' +
                  (it.dataset.tags || '') + ' ' +
                  (it.dataset.year || '') + ' ' +
                  (it.dataset.type || '');
      const ok = hay.includes(term);
      it.hidden = !ok;
      if (ok) matches++;
    });

    if (count) {
      count.textContent = term
        ? `${matches} / ${total} projet${total > 1 ? 's' : ''}`
        : fmt(total, 'projet');
    }
    if (empty && emptyTerm) {
      empty.hidden = matches !== 0;
      emptyTerm.textContent = term;
    }
  };

  input.addEventListener('input', (e) => filter(e.target.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      filter('');
      input.blur();
    }
  });

  document.addEventListener('keydown', (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
