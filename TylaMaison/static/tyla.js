/* TYLA Maison — SPA vanilla JS.
 * État en mémoire + fetch JSON. Pas de framework, pas de build step.
 * Architecture : un objet state, des renderers par vue, un dispatcher.
 */
(() => {
'use strict';

// ── Constants ─────────────────────────────────────────────────

const ICONS = {
  // pièces
  home: 'ic-home', sofa: 'ic-sofa', bed: 'ic-bed', kitchen: 'ic-kitchen',
  desk: 'ic-desk', drop: 'ic-drop',
  // devices
  bulb: 'ic-bulb', plug: 'ic-plug', vacuum: 'ic-vacuum',
  speaker: 'ic-speaker', projector: 'ic-projector', webhook: 'ic-webhook',
  // scenes
  sparkle: 'ic-sparkle', sun: 'ic-sun', moon: 'ic-moon',
  play: 'ic-play', leaf: 'ic-leaf', power: 'ic-power',
};

const ROOM_ICONS = ['home', 'sofa', 'bed', 'kitchen', 'desk', 'drop'];
const SCENE_ICONS = ['sparkle', 'sun', 'moon', 'play', 'leaf', 'power'];

const ROOM_COLORS = [
  'oklch(0.72 0.14 70)',  'oklch(0.72 0.16 130)', 'oklch(0.7 0.16 290)',
  'oklch(0.72 0.13 220)', 'oklch(0.73 0.12 200)', 'oklch(0.7 0.14 350)',
  'oklch(0.74 0.16 30)',  'oklch(0.7 0.14 165)',
];

const COLOR_PRESETS = [
  '#ffffff', '#fff5e0', '#ffd99c', '#ff9a5a',
  '#ff5a5a', '#ff5aa8', '#a05cff', '#5a78ff',
  '#5acdff', '#5affb1', '#bcff5a', '#fff05a',
];

const DEVICE_TYPE_ICON = {
  tuya_bulb: 'bulb',
  tuya_plug: 'plug',
  roborock:  'vacuum',
  denon:     'speaker',
  siemens:   'projector',
  generic:   'webhook',
};

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ── State ──────────────────────────────────────────────────────

const state = {
  user: null,
  view: 'dashboard',          // active sidebar tab
  rooms: [],
  devices: [],
  scenes: [],
  schedules: [],
  history: [],
  types: {},                  // capabilities map
  hasTinytuya: false,
  selectedRoomId: null,       // filtre devices
  loading: true,
};

// ── Helpers ────────────────────────────────────────────────────

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function svgIcon(name) {
  const id = ICONS[name] || name;
  return `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)}j`;
  return formatTime(ts);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── API ────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const init = {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const r = await fetch(path, init);
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok) {
    const msg = (data && data.error) || `Erreur HTTP ${r.status}`;
    const err = new Error(msg);
    err.data = data; err.status = r.status;
    throw err;
  }
  return data;
}

// ── Toasts ────────────────────────────────────────────────────

function toast(message, kind = 'info') {
  const root = $('#toasts');
  if (!root) return;
  const t = el('div', { class: `toast is-${kind}` }, [
    el('span', { html: svgIcon(kind === 'ok' ? 'ic-check' : kind === 'error' ? 'ic-warn' : 'ic-info') }),
    el('span', {}, [message]),
  ]);
  root.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(120%)';
    t.style.transition = 'all 0.25s';
    setTimeout(() => t.remove(), 260);
  }, 3500);
}

// ── Modals ─────────────────────────────────────────────────────

function openModal(content, opts = {}) {
  const root = $('#modal-root');
  const backdrop = el('div', { class: 'modal-backdrop', onClick: e => {
    if (e.target === backdrop && opts.dismissable !== false) close();
  } });
  const modal = el('div', { class: 'modal' + (opts.wide ? ' modal-wide' : '') });
  modal.appendChild(content);
  backdrop.appendChild(modal);
  function close() { backdrop.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape' && opts.dismissable !== false) close(); }
  document.addEventListener('keydown', onKey);
  root.appendChild(backdrop);
  return { close, modal };
}

// ── Bootstrap ─────────────────────────────────────────────────

async function boot() {
  try {
    const r = await api('/tyla/api/auth/me');
    state.user = r.user;
    state.hasTinytuya = !!r.has_tinytuya;
  } catch (e) {
    state.user = null;
  }
  state.loading = false;
  render();
}

// ── Renderer principal ───────────────────────────────────────

function render() {
  const root = $('#app');
  root.dataset.state = state.user ? 'app' : 'auth';
  root.innerHTML = '';
  if (!state.user) {
    root.appendChild(renderLogin());
    return;
  }
  if (state.user.must_change_password) {
    root.appendChild(renderForceChangePassword());
    return;
  }
  root.appendChild(renderShell());
}

// ── Login view ───────────────────────────────────────────────

function renderLogin() {
  const shell = el('div', { class: 'auth-shell' });
  const card = el('div', { class: 'auth-card' });
  card.innerHTML = `
    <div class="auth-logo">
      <span class="auth-logo-mark">${svgIcon('bulb')}</span>
      <span>TYLA <em style="font-style:normal;color:var(--text-mute);font-weight:400">· Maison</em></span>
    </div>
    <h1 class="auth-title">Bienvenue à la maison</h1>
    <p class="auth-sub">Connectez-vous pour piloter vos appareils.</p>
    <form class="auth-form" id="loginForm" autocomplete="on">
      <div class="auth-field">
        <label class="auth-label" for="lf-user">Identifiant</label>
        <input class="auth-input" id="lf-user" name="username" required autocomplete="username" autofocus />
      </div>
      <div class="auth-field">
        <label class="auth-label" for="lf-pass">Mot de passe</label>
        <div class="auth-input-row">
          <input class="auth-input" id="lf-pass" name="password" type="password" required autocomplete="current-password" />
          <button type="button" class="auth-eye" id="lf-eye" aria-label="Afficher le mot de passe">${svgIcon('ic-eye')}</button>
        </div>
      </div>
      <div id="lf-error" hidden></div>
      <button type="submit" class="auth-submit" id="lf-submit">Se connecter</button>
    </form>
    <div class="auth-foot">Première fois ? <strong>admin / admin</strong> — vous serez invité à changer le mot de passe.</div>
  `;
  shell.appendChild(card);

  setTimeout(() => {
    const form = $('#loginForm', card);
    const eye = $('#lf-eye', card);
    const passInput = $('#lf-pass', card);
    eye.addEventListener('click', () => {
      const isPwd = passInput.type === 'password';
      passInput.type = isPwd ? 'text' : 'password';
      eye.innerHTML = svgIcon(isPwd ? 'ic-eye-off' : 'ic-eye');
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const submit = $('#lf-submit', card);
      const errBox = $('#lf-error', card);
      const fd = new FormData(form);
      submit.disabled = true; submit.textContent = '…';
      errBox.hidden = true;
      try {
        const r = await api('/tyla/api/auth/login', {
          method: 'POST',
          body: { username: fd.get('username'), password: fd.get('password') },
        });
        state.user = r.user;
        render();
      } catch (err) {
        errBox.hidden = false;
        errBox.className = 'auth-error';
        errBox.innerHTML = `${svgIcon('ic-warn')}<span>${escapeHtml(err.message)}</span>`;
      } finally {
        submit.disabled = false; submit.textContent = 'Se connecter';
      }
    });
  }, 0);
  return shell;
}

// ── Forced password change (first login) ──────────────────────

function renderForceChangePassword() {
  const shell = el('div', { class: 'auth-shell' });
  const card = el('div', { class: 'auth-card' });
  card.innerHTML = `
    <div class="auth-logo">
      <span class="auth-logo-mark">${svgIcon('bulb')}</span>
      <span>TYLA <em style="font-style:normal;color:var(--text-mute);font-weight:400">· Sécurité</em></span>
    </div>
    <h1 class="auth-title">Changez votre mot de passe</h1>
    <p class="auth-sub">Première connexion détectée — il est obligatoire de définir un nouveau mot de passe avant tout accès.</p>
    <form class="auth-form" id="cpForm" autocomplete="off">
      <div class="auth-field">
        <label class="auth-label" for="cp-old">Ancien mot de passe</label>
        <input class="auth-input" id="cp-old" name="old_password" type="password" required autocomplete="current-password" autofocus />
      </div>
      <div class="auth-field">
        <label class="auth-label" for="cp-new">Nouveau mot de passe</label>
        <div class="auth-input-row">
          <input class="auth-input" id="cp-new" name="new_password" type="password" required minlength="8" autocomplete="new-password" />
          <button type="button" class="auth-eye" id="cp-eye" aria-label="Afficher">${svgIcon('ic-eye')}</button>
        </div>
        <p class="form-hint">8 caractères minimum.</p>
      </div>
      <div class="auth-field">
        <label class="auth-label" for="cp-confirm">Confirmation</label>
        <input class="auth-input" id="cp-confirm" name="confirm" type="password" required minlength="8" autocomplete="new-password" />
      </div>
      <div id="cp-error" hidden></div>
      <button type="submit" class="auth-submit" id="cp-submit">Définir le nouveau mot de passe</button>
    </form>
    <div class="auth-foot">
      <a href="#" id="cp-logout">Annuler et se déconnecter</a>
    </div>
  `;
  shell.appendChild(card);
  setTimeout(() => {
    const form = $('#cpForm', card);
    const eye = $('#cp-eye', card);
    const newInput = $('#cp-new', card);
    eye.addEventListener('click', () => {
      const isPwd = newInput.type === 'password';
      newInput.type = isPwd ? 'text' : 'password';
      eye.innerHTML = svgIcon(isPwd ? 'ic-eye-off' : 'ic-eye');
    });
    $('#cp-logout', card).addEventListener('click', async e => {
      e.preventDefault();
      await api('/tyla/api/auth/logout', { method: 'POST' }).catch(() => {});
      state.user = null; render();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const submit = $('#cp-submit', card);
      const errBox = $('#cp-error', card);
      const fd = new FormData(form);
      const newPass = fd.get('new_password');
      const confirm = fd.get('confirm');
      errBox.hidden = true;
      if (newPass !== confirm) {
        errBox.hidden = false; errBox.className = 'auth-error';
        errBox.innerHTML = `${svgIcon('ic-warn')}<span>Les deux mots de passe ne correspondent pas.</span>`;
        return;
      }
      submit.disabled = true; submit.textContent = '…';
      try {
        const r = await api('/tyla/api/auth/change-password', {
          method: 'POST',
          body: { old_password: fd.get('old_password'), new_password: newPass },
        });
        state.user = r.user;
        toast('Mot de passe mis à jour', 'ok');
        await refreshAll();
        render();
      } catch (err) {
        errBox.hidden = false; errBox.className = 'auth-error';
        errBox.innerHTML = `${svgIcon('ic-warn')}<span>${escapeHtml(err.message)}</span>`;
      } finally {
        submit.disabled = false; submit.textContent = 'Définir le nouveau mot de passe';
      }
    });
  }, 0);
  return shell;
}

// ── App shell (sidebar + main) ────────────────────────────────

function renderShell() {
  const shell = el('div', { class: 'app-shell' });
  shell.appendChild(renderSidebar());
  const main = el('main', { class: 'main' });
  main.appendChild(renderActiveView());
  shell.appendChild(main);
  return shell;
}

function renderSidebar() {
  const aside = el('aside', { class: 'sidebar' });
  aside.innerHTML = `
    <div class="sidebar-brand">
      <span class="sidebar-brand-mark">${svgIcon('bulb')}</span>
      <div class="sidebar-brand-name">
        TYLA
        <div class="sidebar-brand-sub">Maison</div>
      </div>
    </div>
  `;
  const items = [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'ic-home' },
    { id: 'rooms',     label: 'Pièces',          icon: 'ic-grid' },
    { id: 'devices',   label: 'Appareils',       icon: 'ic-bulb' },
    { id: 'scenes',    label: 'Scènes',          icon: 'ic-sparkle' },
    { id: 'schedules', label: 'Programmation',   icon: 'ic-clock' },
    { id: 'history',   label: 'Historique',      icon: 'ic-history' },
    { id: 'settings',  label: 'Paramètres',      icon: 'ic-settings' },
  ];
  for (const it of items) {
    const btn = el('button', {
      class: 'nav-item' + (state.view === it.id ? ' is-active' : ''),
      onClick: () => { state.view = it.id; state.selectedRoomId = null; render(); },
    });
    btn.innerHTML = `${svgIcon(it.icon)}<span>${it.label}</span>`;
    aside.appendChild(btn);
  }
  aside.appendChild(el('div', { class: 'nav-spacer' }));
  const foot = el('div', { class: 'nav-foot' });
  const initials = (state.user?.username || '?').slice(0, 1).toUpperCase();
  const userRow = el('div', { class: 'nav-user' });
  userRow.innerHTML = `<div class="nav-user-avatar">${initials}</div><span>${escapeHtml(state.user?.username || '')}</span>`;
  foot.appendChild(userRow);
  const logoutBtn = el('button', {
    class: 'nav-item',
    onClick: async () => {
      await api('/tyla/api/auth/logout', { method: 'POST' }).catch(() => {});
      state.user = null; render();
    },
  });
  logoutBtn.innerHTML = `${svgIcon('ic-logout')}<span>Se déconnecter</span>`;
  foot.appendChild(logoutBtn);
  aside.appendChild(foot);
  return aside;
}

function renderActiveView() {
  switch (state.view) {
    case 'dashboard': return renderDashboard();
    case 'rooms':     return renderRoomsView();
    case 'devices':   return renderDevicesView();
    case 'scenes':    return renderScenesView();
    case 'schedules': return renderSchedulesView();
    case 'history':   return renderHistoryView();
    case 'settings':  return renderSettingsView();
    default:          return renderDashboard();
  }
}

// ── Dashboard ─────────────────────────────────────────────────

function renderDashboard() {
  const wrap = el('div');
  // Header
  const head = el('div', { class: 'main-header' });
  const onCount = state.devices.filter(d => (d.state?.power) === true).length;
  const onlineCount = state.devices.filter(d => d.online).length;
  head.innerHTML = `
    <div>
      <h1 class="page-title">Tableau de bord</h1>
      <p class="page-sub">Vue d'ensemble de la maison.</p>
    </div>
  `;
  const headBtns = el('div', { class: 'page-actions' });
  const refreshBtn = el('button', { class: 'btn btn-ghost', onClick: () => refreshAll().then(render) });
  refreshBtn.innerHTML = `${svgIcon('ic-refresh')}<span>Actualiser</span>`;
  headBtns.appendChild(refreshBtn);
  head.appendChild(headBtns);
  wrap.appendChild(head);

  // Stats
  const stats = el('div', { class: 'stats-row' });
  stats.appendChild(makeStatCard('Pièces', state.rooms.length, '', 'oklch(0.74 0.16 220)'));
  stats.appendChild(makeStatCard('Appareils', state.devices.length, `${onlineCount} en ligne`, 'oklch(0.84 0.16 80)'));
  stats.appendChild(makeStatCard('Allumés', onCount, onCount > 0 ? 'Actifs maintenant' : 'Tout est éteint', 'oklch(0.78 0.16 145)'));
  stats.appendChild(makeStatCard('Scènes', state.scenes.length, '', 'oklch(0.7 0.18 290)'));
  wrap.appendChild(stats);

  // Map
  const mapCard = el('section', { class: 'card' });
  mapCard.innerHTML = `<div class="card-head"><div><h2 class="card-title">Maison</h2><p class="card-sub">Cliquez une pièce pour voir ses appareils.</p></div></div>`;
  mapCard.appendChild(renderHouseMap());
  wrap.appendChild(mapCard);

  // Scenes row
  const scenesCard = el('section', { class: 'card' });
  scenesCard.innerHTML = `
    <div class="card-head">
      <div><h2 class="card-title">Scènes rapides</h2><p class="card-sub">Un appui pour déclencher une ambiance.</p></div>
      <button class="btn btn-sm" id="newSceneBtn">${svgIcon('ic-plus')}<span>Nouvelle scène</span></button>
    </div>
  `;
  setTimeout(() => $('#newSceneBtn', scenesCard)?.addEventListener('click', () => openSceneModal(null)), 0);
  const scenesRow = el('div', { class: 'scenes-row' });
  if (!state.scenes.length) {
    scenesRow.appendChild(el('div', { class: 'empty-state', html: `${svgIcon('ic-sparkle')}<h3>Aucune scène</h3><p>Créez une scène pour exécuter plusieurs actions d'un coup.</p>` }));
  } else {
    for (const sc of state.scenes) scenesRow.appendChild(makeSceneTile(sc));
  }
  scenesCard.appendChild(scenesRow);
  wrap.appendChild(scenesCard);

  // Devices recent
  const devCard = el('section', { class: 'card' });
  devCard.innerHTML = `
    <div class="card-head">
      <div><h2 class="card-title">Appareils</h2><p class="card-sub">Pilotage direct.</p></div>
      <div class="row-flex">
        <button class="btn btn-sm" id="discoverBtn" ${state.hasTinytuya ? '' : 'disabled title="tinytuya non installé"'}>${svgIcon('ic-radar')}<span>Scanner LAN</span></button>
        <button class="btn btn-primary btn-sm" id="addDevBtn">${svgIcon('ic-plus')}<span>Ajouter</span></button>
      </div>
    </div>
  `;
  setTimeout(() => {
    $('#discoverBtn', devCard)?.addEventListener('click', () => openDiscoverModal());
    $('#addDevBtn', devCard)?.addEventListener('click', () => openDeviceModal(null));
  }, 0);
  devCard.appendChild(renderDevicesGrid(state.devices.slice(0, 8)));
  wrap.appendChild(devCard);
  return wrap;
}

function makeStatCard(label, value, sub, color) {
  return el('div', {
    class: 'stat-card', style: `--stat-color: ${color}`,
  }, [
    el('div', { class: 'stat-label', html: escapeHtml(label) }),
    el('div', { class: 'stat-value', html: escapeHtml(String(value)) }),
    sub ? el('div', { class: 'stat-sub', html: escapeHtml(sub) }) : null,
  ]);
}

function renderHouseMap() {
  const map = el('div', { class: 'map-wrap' });
  if (!state.rooms.length) {
    const empty = el('div', { class: 'empty-state', html: `${svgIcon('ic-home')}<h3>Aucune pièce</h3><p>Ajoutez des pièces depuis l'onglet Pièces.</p>` });
    empty.style.position = 'absolute'; empty.style.inset = '0';
    map.appendChild(empty);
    return map;
  }
  for (const room of state.rooms) {
    const devs = state.devices.filter(d => d.room_id === room.id);
    const onCount = devs.filter(d => d.state?.power === true).length;
    const roomEl = el('button', {
      class: 'map-room',
      style: `--room-color: ${room.color};` +
        `left:${(room.pos_x * 100).toFixed(2)}%;` +
        `top:${(room.pos_y * 100).toFixed(2)}%;` +
        `width:${(room.pos_w * 100).toFixed(2)}%;` +
        `height:${(room.pos_h * 100).toFixed(2)}%;`,
      onClick: () => { state.view = 'devices'; state.selectedRoomId = room.id; render(); },
    });
    roomEl.innerHTML = `
      <div class="map-room-head">${svgIcon(room.icon || 'home')}<span>${escapeHtml(room.name)}</span></div>
      <div class="map-room-count">${devs.length} appareil${devs.length > 1 ? 's' : ''}${onCount ? ` · ${onCount} allumé${onCount > 1 ? 's' : ''}` : ''}</div>
      <div class="map-dots">${devs.map(d => {
        const cls = d.state?.power === true ? 'is-on' : (d.last_error ? 'is-error' : 'is-off');
        return `<span class="map-dot ${cls}" title="${escapeHtml(d.name)}"></span>`;
      }).join('')}</div>
    `;
    map.appendChild(roomEl);
  }
  return map;
}

function makeSceneTile(scene) {
  const tile = el('button', {
    class: 'scene-tile' + (scene.actions?.length ? '' : ' is-empty'),
    style: `--scene-color: ${scene.color}`,
    onClick: async () => {
      try {
        const r = await api(`/tyla/api/scenes/${scene.id}/run`, { method: 'POST' });
        const okCount = (r.results || []).filter(x => x.ok).length;
        const total = (r.results || []).length;
        toast(`Scène « ${scene.name} » — ${okCount}/${total} OK`, okCount === total && total > 0 ? 'ok' : 'info');
        await refreshAll(); render();
      } catch (err) { toast(err.message, 'error'); }
    },
  });
  tile.innerHTML = `
    <span class="scene-tile-icon">${svgIcon(scene.icon || 'sparkle')}</span>
    <span>
      <div class="scene-tile-name">${escapeHtml(scene.name)}</div>
      <div class="scene-tile-meta">${scene.actions?.length || 0} action${(scene.actions?.length || 0) > 1 ? 's' : ''}</div>
    </span>
    <button type="button" class="btn btn-icon btn-ghost" style="position:absolute;top:8px;right:8px" data-edit aria-label="Modifier">${svgIcon('ic-edit')}</button>
  `;
  setTimeout(() => {
    const edit = tile.querySelector('[data-edit]');
    if (edit) edit.addEventListener('click', e => { e.stopPropagation(); openSceneModal(scene); });
  }, 0);
  return tile;
}

// ── Devices view ──────────────────────────────────────────────

function renderDevicesView() {
  const wrap = el('div');
  const head = el('div', { class: 'main-header' });
  const room = state.selectedRoomId ? state.rooms.find(r => r.id === state.selectedRoomId) : null;
  head.innerHTML = `
    <div>
      <h1 class="page-title">${room ? escapeHtml(room.name) : 'Appareils'}</h1>
      <p class="page-sub">${room ? `Appareils de la pièce ${escapeHtml(room.name)}.` : `${state.devices.length} appareil${state.devices.length > 1 ? 's' : ''} au total.`}</p>
    </div>
  `;
  const actions = el('div', { class: 'page-actions' });
  if (room) {
    const back = el('button', { class: 'btn btn-ghost', onClick: () => { state.selectedRoomId = null; render(); } });
    back.innerHTML = `${svgIcon('ic-back')}<span>Retour</span>`;
    actions.appendChild(back);
  }
  const refreshBtn = el('button', { class: 'btn btn-ghost', onClick: () => refreshAll().then(render) });
  refreshBtn.innerHTML = `${svgIcon('ic-refresh')}<span>Rafraîchir</span>`;
  actions.appendChild(refreshBtn);
  if (state.hasTinytuya) {
    const dBtn = el('button', { class: 'btn', onClick: () => openDiscoverModal() });
    dBtn.innerHTML = `${svgIcon('ic-radar')}<span>Scanner LAN</span>`;
    actions.appendChild(dBtn);
  }
  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openDeviceModal(null) });
  addBtn.innerHTML = `${svgIcon('ic-plus')}<span>Ajouter</span>`;
  actions.appendChild(addBtn);
  head.appendChild(actions);
  wrap.appendChild(head);

  const list = state.selectedRoomId
    ? state.devices.filter(d => d.room_id === state.selectedRoomId)
    : state.devices;
  if (!list.length) {
    wrap.appendChild(makeEmptyState(
      'Aucun appareil', state.hasTinytuya
        ? 'Ajoutez votre première ampoule TUYA, ou scannez le réseau pour les détecter.'
        : 'Installez tinytuya (`pip install tinytuya`) puis ajoutez votre premier appareil.',
      'ic-bulb',
    ));
  } else {
    wrap.appendChild(renderDevicesGrid(list));
  }
  return wrap;
}

function renderDevicesGrid(devices) {
  const grid = el('div', { class: 'devices-grid' });
  for (const dev of devices) grid.appendChild(makeDeviceCard(dev));
  return grid;
}

function makeDeviceCard(dev) {
  const isOn = dev.state?.power === true;
  const card = el('div', { class: 'device-card' + (isOn ? ' is-on' : '') });
  const iconKey = DEVICE_TYPE_ICON[dev.type] || 'webhook';
  const cap = state.types[dev.type] || {};
  // Head
  const head = el('div', { class: 'device-card-head' });
  head.innerHTML = `
    <div class="device-card-head-left">
      <div class="device-icon">${svgIcon(iconKey)}</div>
      <div class="device-meta">
        <h3 class="device-name">${escapeHtml(dev.name)}</h3>
        <div class="device-room">${escapeHtml(dev.room_name || 'Sans pièce')} · <span class="tag-pill">${escapeHtml(cap.label || dev.type)}</span></div>
      </div>
    </div>
    <div class="device-status ${dev.online ? 'is-online' : (dev.last_error ? 'is-error' : '')}">${dev.online ? 'En ligne' : (dev.last_error ? 'Erreur' : 'Hors ligne')}</div>
  `;
  card.appendChild(head);

  // Toggle (si supporte turn_on/off)
  const supportsToggle = (cap.actions || []).includes('turn_on') && (cap.actions || []).includes('turn_off');
  if (supportsToggle) {
    const toggleRow = el('div', { class: 'device-toggle' });
    const toggle = el('button', {
      class: 'toggle-btn' + (isOn ? ' is-on' : ''),
      'aria-label': isOn ? 'Éteindre' : 'Allumer',
      onClick: () => doDeviceAction(dev, isOn ? 'turn_off' : 'turn_on', {}),
    });
    const lbl = el('span', { class: 'toggle-label', html: isOn ? 'Allumé' : 'Éteint' });
    toggleRow.appendChild(toggle);
    toggleRow.appendChild(lbl);
    card.appendChild(toggleRow);
  }

  // Controls par type
  if (dev.type === 'tuya_bulb') {
    card.appendChild(makeBulbControls(dev));
  } else if (dev.type === 'roborock') {
    card.appendChild(makeRoborockControls(dev));
  } else if (dev.type === 'denon') {
    card.appendChild(makeDenonControls(dev));
  } else if (dev.type === 'siemens') {
    card.appendChild(makeSiemensControls(dev));
  } else if (dev.type === 'tuya_plug') {
    if (dev.state?.power_W !== undefined) {
      const energy = el('div', { class: 'device-controls' });
      energy.innerHTML = `
        <div class="row-flex" style="justify-content:space-between"><span class="form-label" style="margin:0">Consommation</span><span class="slider-row-value">${dev.state.power_W} W</span></div>
        ${dev.state.voltage_V ? `<div class="row-flex" style="justify-content:space-between"><span class="form-label" style="margin:0">Tension</span><span class="slider-row-value">${dev.state.voltage_V} V</span></div>` : ''}
      `;
      card.appendChild(energy);
    }
  } else if (dev.type === 'generic') {
    const ctrl = el('div', { class: 'device-controls' });
    for (const action of cap.actions || []) {
      const b = el('button', { class: 'btn btn-sm', onClick: () => doDeviceAction(dev, action, {}) }, [action]);
      ctrl.appendChild(b);
    }
    card.appendChild(ctrl);
  }

  // Footer actions
  const foot = el('div', { class: 'device-actions' });
  const refresh = el('button', {
    class: 'btn btn-ghost btn-sm',
    onClick: async () => {
      try {
        await api(`/tyla/api/devices/${dev.id}/refresh`, { method: 'POST' });
        await refreshDevices(); render();
      } catch (e) { toast(e.message, 'error'); }
    },
  });
  refresh.innerHTML = `${svgIcon('ic-refresh')}<span>Statut</span>`;
  const edit = el('button', { class: 'btn btn-ghost btn-sm', onClick: () => openDeviceModal(dev) });
  edit.innerHTML = `${svgIcon('ic-edit')}<span>Éditer</span>`;
  foot.appendChild(refresh);
  foot.appendChild(edit);
  card.appendChild(foot);

  if (dev.last_error) {
    const err = el('div', {
      class: 'auth-error', style: 'margin-top:8px;font-size:12px',
      html: `${svgIcon('ic-warn')}<span>${escapeHtml(dev.last_error)}</span>`,
    });
    card.appendChild(err);
  }
  return card;
}

function makeBulbControls(dev) {
  const ctrl = el('div', { class: 'device-controls' });
  const bright = dev.state?.brightness;
  const brightPct = bright != null ? Math.round(((bright - 10) / 990) * 100) : 80;
  // Brightness
  const briRow = el('div', { class: 'slider-row' });
  briRow.innerHTML = `
    <div class="slider-row-label"><span>Luminosité</span><span class="slider-row-value">${brightPct}%</span></div>
    <input type="range" class="slider" min="1" max="100" value="${brightPct}" />
  `;
  const briSlider = $('.slider', briRow);
  briSlider.addEventListener('change', () => {
    doDeviceAction(dev, 'set_brightness', { brightness: parseInt(briSlider.value, 10) });
  });
  briSlider.addEventListener('input', () => {
    $('.slider-row-value', briRow).textContent = briSlider.value + '%';
  });
  ctrl.appendChild(briRow);
  // Color presets
  const colorRow = el('div', { class: 'slider-row' });
  colorRow.innerHTML = `<div class="slider-row-label"><span>Couleur</span></div>`;
  const colorWrap = el('div', { class: 'color-row' });
  for (const c of COLOR_PRESETS) {
    const sw = el('button', {
      class: 'color-swatch', style: `--swatch:${c}`, 'aria-label': c,
      onClick: () => doDeviceAction(dev, 'set_color', { hex: c }),
    });
    colorWrap.appendChild(sw);
  }
  // White button + custom picker
  const whiteBtn = el('button', {
    class: 'color-swatch',
    style: '--swatch:linear-gradient(135deg,#fff,#ffd99c)',
    title: 'Mode blanc',
    onClick: () => doDeviceAction(dev, 'set_white', {}),
  });
  colorWrap.appendChild(whiteBtn);
  const picker = el('input', {
    type: 'color', class: 'color-picker-input', value: '#ffffff', title: 'Couleur personnalisée',
    onChange: e => doDeviceAction(dev, 'set_color', { hex: e.target.value }),
  });
  colorWrap.appendChild(picker);
  colorRow.appendChild(colorWrap);
  ctrl.appendChild(colorRow);
  // Color temp
  const tempRow = el('div', { class: 'slider-row' });
  const tempVal = dev.state?.color_temp != null ? Math.round((dev.state.color_temp / 1000) * 100) : 50;
  tempRow.innerHTML = `
    <div class="slider-row-label"><span>Température</span><span class="slider-row-value">${tempVal < 50 ? 'Chaud' : (tempVal > 50 ? 'Froid' : 'Neutre')}</span></div>
    <input type="range" class="slider slider-temp" min="0" max="100" value="${tempVal}" />
  `;
  const tempSlider = $('.slider', tempRow);
  tempSlider.addEventListener('change', () => {
    doDeviceAction(dev, 'set_color_temp', { color_temp: parseInt(tempSlider.value, 10) });
  });
  ctrl.appendChild(tempRow);
  return ctrl;
}

function makeRoborockControls(dev) {
  const ctrl = el('div', { class: 'device-controls' });
  const actions = [
    ['start_clean', 'Démarrer'],
    ['pause', 'Pause'],
    ['stop_clean', 'Stop'],
    ['return_dock', 'Rentrer'],
    ['find_robot', 'Localiser'],
  ];
  for (const [a, label] of actions) {
    const b = el('button', { class: 'btn btn-ghost btn-sm', onClick: () => doDeviceAction(dev, a, {}) }, [label]);
    ctrl.appendChild(b);
  }
  return ctrl;
}

function makeDenonControls(dev) {
  const ctrl = el('div', { class: 'device-controls' });
  const actions = [
    ['turn_on', 'On'], ['turn_off', 'Off'],
    ['volume_down', 'Vol -'], ['volume_up', 'Vol +'],
    ['mute', 'Mute'], ['play', 'Play'], ['pause', 'Pause'],
  ];
  for (const [a, label] of actions) {
    const b = el('button', { class: 'btn btn-ghost btn-sm', onClick: () => doDeviceAction(dev, a, {}) }, [label]);
    ctrl.appendChild(b);
  }
  return ctrl;
}

function makeSiemensControls(dev) {
  const ctrl = el('div', { class: 'device-controls' });
  const actions = [
    ['turn_on', 'On'], ['turn_off', 'Off'],
    ['mute_video', 'Mute vidéo'], ['mute_audio', 'Mute audio'],
  ];
  for (const [a, label] of actions) {
    const b = el('button', { class: 'btn btn-ghost btn-sm', onClick: () => doDeviceAction(dev, a, {}) }, [label]);
    ctrl.appendChild(b);
  }
  return ctrl;
}

async function doDeviceAction(dev, action, params) {
  try {
    const r = await api(`/tyla/api/devices/${dev.id}/action`, {
      method: 'POST', body: { action, params },
    });
    if (r.error) toast(`${dev.name} — ${r.error}`, 'error');
    else toast(`${dev.name} — ${action}`, 'ok');
    await refreshDevices(); render();
  } catch (e) {
    toast(`${dev.name} — ${e.message}`, 'error');
  }
}

// ── Rooms view ────────────────────────────────────────────────

function renderRoomsView() {
  const wrap = el('div');
  const head = el('div', { class: 'main-header' });
  head.innerHTML = `<div><h1 class="page-title">Pièces</h1><p class="page-sub">${state.rooms.length} pièce${state.rooms.length > 1 ? 's' : ''} configurée${state.rooms.length > 1 ? 's' : ''}.</p></div>`;
  const actions = el('div', { class: 'page-actions' });
  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openRoomModal(null) });
  addBtn.innerHTML = `${svgIcon('ic-plus')}<span>Nouvelle pièce</span>`;
  actions.appendChild(addBtn);
  head.appendChild(actions);
  wrap.appendChild(head);

  if (!state.rooms.length) {
    wrap.appendChild(makeEmptyState('Aucune pièce', 'Créez votre première pièce — salon, chambre, cuisine…', 'ic-grid'));
    return wrap;
  }
  const grid = el('div', { class: 'rooms-grid' });
  for (const r of state.rooms) {
    const devs = state.devices.filter(d => d.room_id === r.id);
    const card = el('div', { class: 'room-card', style: `--room-color: ${r.color}`, onClick: () => { state.view = 'devices'; state.selectedRoomId = r.id; render(); } });
    card.innerHTML = `
      <div class="room-card-icon">${svgIcon(r.icon || 'home')}</div>
      <h3 class="room-card-name">${escapeHtml(r.name)}</h3>
      <div class="room-card-count">${devs.length} appareil${devs.length > 1 ? 's' : ''}</div>
    `;
    const editBtn = el('button', {
      class: 'btn btn-icon btn-ghost', style: 'position:absolute;top:10px;right:10px',
      onClick: e => { e.stopPropagation(); openRoomModal(r); },
    });
    editBtn.innerHTML = svgIcon('ic-edit');
    card.appendChild(editBtn);
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ── Scenes view ───────────────────────────────────────────────

function renderScenesView() {
  const wrap = el('div');
  const head = el('div', { class: 'main-header' });
  head.innerHTML = `<div><h1 class="page-title">Scènes</h1><p class="page-sub">Combinez plusieurs actions sur plusieurs appareils.</p></div>`;
  const actions = el('div', { class: 'page-actions' });
  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openSceneModal(null) });
  addBtn.innerHTML = `${svgIcon('ic-plus')}<span>Nouvelle scène</span>`;
  actions.appendChild(addBtn);
  head.appendChild(actions);
  wrap.appendChild(head);

  if (!state.scenes.length) {
    wrap.appendChild(makeEmptyState('Aucune scène', 'Une scène déclenche plusieurs actions d\'un coup. Ex : « Cinéma » baisse les lumières et allume le projecteur.', 'ic-sparkle'));
    return wrap;
  }
  const grid = el('div', { class: 'scenes-row' });
  for (const sc of state.scenes) grid.appendChild(makeSceneTile(sc));
  wrap.appendChild(grid);
  return wrap;
}

// ── Schedules view ────────────────────────────────────────────

function renderSchedulesView() {
  const wrap = el('div');
  const head = el('div', { class: 'main-header' });
  head.innerHTML = `<div><h1 class="page-title">Programmation</h1><p class="page-sub">Déclencheurs automatiques par horaire.</p></div>`;
  const actions = el('div', { class: 'page-actions' });
  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openScheduleModal(null) });
  addBtn.innerHTML = `${svgIcon('ic-plus')}<span>Nouvelle programmation</span>`;
  actions.appendChild(addBtn);
  head.appendChild(actions);
  wrap.appendChild(head);

  if (!state.schedules.length) {
    wrap.appendChild(makeEmptyState('Aucune programmation', 'Programmez l\'allumage des lumières au lever, le robot le matin, ou tout off à 23h.', 'ic-clock'));
    return wrap;
  }
  const list = el('div', { class: 'schedule-list' });
  for (const s of state.schedules) {
    const target = s.kind === 'scene'
      ? state.scenes.find(x => x.id === s.target_id)
      : state.devices.find(x => x.id === s.target_id);
    const targetName = target ? target.name : '— (cible supprimée)';
    const row = el('div', { class: 'schedule-row' });
    const days = el('div', { class: 'weekday-pills' });
    for (let i = 0; i < 7; i++) {
      const d = el('span', { class: 'weekday-pill' + (s.weekdays.includes(i) ? ' is-active' : '') }, [WEEKDAY_LABELS[i]]);
      days.appendChild(d);
    }
    row.innerHTML = `
      <div class="schedule-time">${escapeHtml(s.time_hhmm)}</div>
      <div>
        <div class="schedule-name">${escapeHtml(s.name)}</div>
        <div class="schedule-meta">${s.kind === 'scene' ? 'Scène' : 'Appareil'} · ${escapeHtml(targetName)}${s.action ? ' · ' + escapeHtml(s.action) : ''}</div>
      </div>
    `;
    row.appendChild(days);
    const ctrls = el('div', { class: 'row-flex' });
    const toggle = el('button', {
      class: 'toggle-btn' + (s.enabled ? ' is-on' : ''),
      onClick: async () => {
        try { await api(`/tyla/api/schedules/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } }); await refreshSchedules(); render(); }
        catch (e) { toast(e.message, 'error'); }
      },
    });
    const editBtn = el('button', { class: 'btn btn-icon btn-ghost', onClick: () => openScheduleModal(s) });
    editBtn.innerHTML = svgIcon('ic-edit');
    const delBtn = el('button', {
      class: 'btn btn-icon btn-ghost btn-danger',
      onClick: async () => {
        if (!confirm(`Supprimer la programmation « ${s.name} » ?`)) return;
        try { await api(`/tyla/api/schedules/${s.id}`, { method: 'DELETE' }); await refreshSchedules(); render(); toast('Programmation supprimée', 'ok'); }
        catch (e) { toast(e.message, 'error'); }
      },
    });
    delBtn.innerHTML = svgIcon('ic-trash');
    ctrls.appendChild(toggle); ctrls.appendChild(editBtn); ctrls.appendChild(delBtn);
    row.appendChild(ctrls);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

// ── History view ──────────────────────────────────────────────

function renderHistoryView() {
  const wrap = el('div');
  const head = el('div', { class: 'main-header' });
  head.innerHTML = `<div><h1 class="page-title">Historique</h1><p class="page-sub">Les ${state.history.length} dernières actions.</p></div>`;
  const refreshBtn = el('button', { class: 'btn btn-ghost', onClick: () => refreshHistory().then(render) });
  refreshBtn.innerHTML = `${svgIcon('ic-refresh')}<span>Actualiser</span>`;
  head.appendChild(el('div', { class: 'page-actions' }, [refreshBtn]));
  wrap.appendChild(head);
  if (!state.history.length) {
    wrap.appendChild(makeEmptyState('Aucune action enregistrée', 'L\'historique se remplit dès que vous pilotez un appareil.', 'ic-history'));
    return wrap;
  }
  const list = el('div', { class: 'history-list' });
  for (const h of state.history) {
    const row = el('div', { class: 'history-row' });
    const params = Object.entries(h.params || {}).filter(([k, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${v}`).join(', ');
    row.innerHTML = `
      <div class="history-time">${escapeHtml(formatTime(h.created_at))}</div>
      <div class="history-content">
        <div class="history-action">${escapeHtml(h.action)}${params ? ' <span class="kbd">' + escapeHtml(params) + '</span>' : ''}</div>
        <div class="history-target">${escapeHtml(h.device_name || '—')}${h.message ? ' · ' + escapeHtml(h.message) : ''} · <span class="tag-pill">${escapeHtml(h.source)}</span></div>
      </div>
      <div class="history-status is-${h.status}">${h.status === 'ok' ? svgIcon('ic-check') : svgIcon('ic-warn')}<span>${h.status}</span></div>
    `;
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

// ── Settings view ─────────────────────────────────────────────

function renderSettingsView() {
  const wrap = el('div');
  const head = el('div', { class: 'main-header' });
  head.innerHTML = `<div><h1 class="page-title">Paramètres</h1><p class="page-sub">Compte et configuration.</p></div>`;
  wrap.appendChild(head);

  // Account card
  const acc = el('section', { class: 'card' });
  acc.innerHTML = `
    <div class="card-head"><div><h2 class="card-title">Compte</h2><p class="card-sub">Identifiant et mot de passe.</p></div></div>
    <div class="form-row">
      <div class="form-field">
        <label class="form-label">Identifiant</label>
        <input class="form-input" id="setUser" value="${escapeHtml(state.user?.username || '')}" />
        <p class="form-hint">Cliquez « Enregistrer » pour mettre à jour.</p>
      </div>
      <div class="form-field">
        <label class="form-label">Dernière connexion</label>
        <div class="form-input" style="background:transparent">${escapeHtml(formatTime(state.user?.last_login))}</div>
      </div>
    </div>
    <div class="row-flex" style="margin-top:14px;gap:10px">
      <button class="btn" id="saveUserBtn">Enregistrer l'identifiant</button>
      <button class="btn" id="changePassBtn">${svgIcon('ic-settings')}<span>Changer de mot de passe</span></button>
    </div>
  `;
  setTimeout(() => {
    $('#saveUserBtn', acc)?.addEventListener('click', async () => {
      const v = $('#setUser', acc).value.trim();
      if (!v) return;
      try {
        const r = await api('/tyla/api/auth/change-username', { method: 'POST', body: { username: v } });
        state.user = r.user;
        toast('Identifiant mis à jour', 'ok'); render();
      } catch (e) { toast(e.message, 'error'); }
    });
    $('#changePassBtn', acc)?.addEventListener('click', () => openChangePasswordModal());
  }, 0);
  wrap.appendChild(acc);

  // System card
  const sys = el('section', { class: 'card' });
  sys.innerHTML = `
    <div class="card-head"><div><h2 class="card-title">Système</h2><p class="card-sub">Statut des intégrations.</p></div></div>
    <div class="form-row">
      <div class="form-field">
        <label class="form-label">Bibliothèque tinytuya</label>
        <div class="form-input" style="background:transparent;display:flex;align-items:center;gap:8px">
          ${state.hasTinytuya ? `<span style="color:var(--good)">${svgIcon('ic-check')}</span> Installée — pilotage TUYA actif.` : `<span style="color:var(--warn)">${svgIcon('ic-warn')}</span> Non installée — <code>pip install tinytuya</code> puis redémarrer.`}
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Stats</label>
        <div class="form-input" style="background:transparent">
          ${state.devices.length} appareil${state.devices.length > 1 ? 's' : ''} ·
          ${state.rooms.length} pièce${state.rooms.length > 1 ? 's' : ''} ·
          ${state.scenes.length} scène${state.scenes.length > 1 ? 's' : ''} ·
          ${state.schedules.length} prog.
        </div>
      </div>
    </div>
  `;
  wrap.appendChild(sys);

  // Help card
  const help = el('section', { class: 'card' });
  help.innerHTML = `
    <div class="card-head"><div><h2 class="card-title">Aide — récupérer ses identifiants TUYA</h2><p class="card-sub">Pour piloter en LAN sans cloud, il faut device_id, IP, local_key.</p></div></div>
    <ol style="margin:0;padding-left:18px;color:var(--text-mute);font-size:14px;line-height:1.7">
      <li>Pairez vos ampoules dans l'app <strong>Smart Life</strong> ou <strong>Tuya Smart</strong>.</li>
      <li>Créez un compte gratuit sur <a href="https://iot.tuya.com" target="_blank" rel="noreferrer noopener" style="color:var(--accent)">iot.tuya.com</a> et un projet « Cloud » (région : Western Europe ou Central Europe).</li>
      <li>Liez votre app Smart Life via QR code dans Devices → Link Tuya App Account.</li>
      <li>Sur le serveur, lancez <code>python -m tinytuya wizard</code> — entrez l'API key, secret, et l'ID d'un device. Le wizard récupère <code>local_key</code> + IP pour TOUS vos devices.</li>
      <li>Copiez ces valeurs dans « Ajouter un appareil » ici.</li>
    </ol>
    <p class="form-hint" style="margin-top:14px">Le scan LAN détecte les IP/IDs automatiquement, mais le <code>local_key</code> nécessite obligatoirement le wizard ou une extraction depuis Smart Life — c'est une protection Tuya.</p>
  `;
  wrap.appendChild(help);

  return wrap;
}

// ── Modals: Add/Edit Device ───────────────────────────────────

function openDeviceModal(existing) {
  const types = state.types;
  const typeKeys = Object.keys(types);
  let currentType = existing?.type || (state.hasTinytuya ? 'tuya_bulb' : 'generic');

  const content = el('div');
  const head = el('div', { class: 'modal-head' });
  head.innerHTML = `<h2 class="modal-title">${existing ? 'Modifier l\'appareil' : 'Nouvel appareil'}</h2>`;
  const closeBtn = el('button', { class: 'modal-close', onClick: () => closeModal() });
  closeBtn.innerHTML = svgIcon('ic-x');
  head.appendChild(closeBtn);
  content.appendChild(head);

  const body = el('div', { class: 'modal-body' });
  // Type selector
  const typeField = el('div', { class: 'form-field' });
  typeField.innerHTML = `<label class="form-label">Type d'appareil</label>`;
  const typeSel = el('select', { class: 'form-select' });
  for (const t of typeKeys) {
    const opt = el('option', { value: t }, [types[t].label || t]);
    if (t === currentType) opt.selected = true;
    typeSel.appendChild(opt);
  }
  if (existing) typeSel.disabled = true;
  typeField.appendChild(typeSel);
  body.appendChild(typeField);

  // Name + room
  const row = el('div', { class: 'form-row' });
  const nameField = el('div', { class: 'form-field' });
  nameField.innerHTML = `<label class="form-label">Nom</label><input class="form-input" id="dm-name" value="${escapeHtml(existing?.name || '')}" placeholder="Ex : Lampe Salon" />`;
  row.appendChild(nameField);
  const roomField = el('div', { class: 'form-field' });
  roomField.innerHTML = `<label class="form-label">Pièce</label>`;
  const roomSel = el('select', { class: 'form-select' });
  roomSel.appendChild(el('option', { value: '' }, ['— Sans pièce']));
  for (const r of state.rooms) {
    const opt = el('option', { value: r.id }, [r.name]);
    if (existing?.room_id === r.id) opt.selected = true;
    roomSel.appendChild(opt);
  }
  roomField.appendChild(roomSel);
  row.appendChild(roomField);
  body.appendChild(row);

  // Config fields (per-type)
  const configWrap = el('div');
  body.appendChild(configWrap);

  // Note for stub adapters
  const noteWrap = el('div');
  body.appendChild(noteWrap);

  // Test result
  const testResult = el('div');
  body.appendChild(testResult);

  function rebuildConfigFields() {
    configWrap.innerHTML = '';
    noteWrap.innerHTML = '';
    const cap = types[currentType] || {};
    if (cap.note) {
      noteWrap.innerHTML = `<div class="auth-info" style="margin-top:6px">${svgIcon('ic-info')}<span>${escapeHtml(cap.note)}</span></div>`;
    }
    for (const f of (cap.config_fields || [])) {
      const field = el('div', { class: 'form-field' });
      const lbl = f.label || f.name;
      const val = existing?.config?.[f.name] !== undefined ? existing.config[f.name] : (f.default !== undefined ? f.default : '');
      const isSecret = !!f.secret;
      const isJson = f.type === 'json';
      const isTextarea = f.type === 'textarea' || isJson;
      field.innerHTML = `
        <label class="form-label">${escapeHtml(lbl)}${f.required ? ' *' : ''}</label>
        ${isTextarea
          ? `<textarea class="form-textarea" data-cf="${escapeHtml(f.name)}" placeholder="${escapeHtml(f.hint || '')}">${escapeHtml(typeof val === 'object' ? JSON.stringify(val, null, 2) : (val ?? ''))}</textarea>`
          : `<input class="form-input" data-cf="${escapeHtml(f.name)}" type="${isSecret ? 'password' : 'text'}" value="${escapeHtml(val ?? '')}" placeholder="${escapeHtml(f.hint || '')}" />`}
        ${f.hint ? `<p class="form-hint">${escapeHtml(f.hint)}</p>` : ''}
      `;
      configWrap.appendChild(field);
    }
  }
  typeSel.addEventListener('change', () => { currentType = typeSel.value; rebuildConfigFields(); });
  rebuildConfigFields();

  // Foot
  const foot = el('div', { class: 'modal-foot' });
  if (existing) {
    const delBtn = el('button', {
      class: 'btn btn-danger',
      onClick: async () => {
        if (!confirm(`Supprimer « ${existing.name} » ?`)) return;
        try { await api(`/tyla/api/devices/${existing.id}`, { method: 'DELETE' }); await refreshDevices(); render(); toast('Appareil supprimé', 'ok'); closeModal(); }
        catch (e) { toast(e.message, 'error'); }
      },
    });
    delBtn.innerHTML = `${svgIcon('ic-trash')}<span>Supprimer</span>`;
    foot.appendChild(delBtn);
    foot.appendChild(el('div', { class: 'nav-spacer', style: 'flex:1' }));
  }
  const testBtn = el('button', { class: 'btn btn-ghost' }, ['Tester']);
  const cancelBtn = el('button', { class: 'btn btn-ghost', onClick: () => closeModal() }, ['Annuler']);
  const saveBtn = el('button', { class: 'btn btn-primary' }, [existing ? 'Enregistrer' : 'Créer']);
  foot.appendChild(testBtn); foot.appendChild(cancelBtn); foot.appendChild(saveBtn);
  content.appendChild(body);
  content.appendChild(foot);

  function collectConfig() {
    const config = {};
    for (const inp of $$('[data-cf]', configWrap)) {
      let v = inp.value;
      const fname = inp.dataset.cf;
      const f = (types[currentType].config_fields || []).find(x => x.name === fname);
      if (f && f.type === 'json' && v.trim()) {
        try { v = JSON.parse(v); } catch { throw new Error(`Champ ${f.label || fname} : JSON invalide`); }
      } else if (f && (typeof f.default === 'number') && v !== '') {
        const n = Number(v); if (!Number.isNaN(n)) v = n;
      }
      config[fname] = v;
    }
    return config;
  }

  testBtn.addEventListener('click', async () => {
    if (!existing) {
      // Pour tester, il faut d'abord créer. Suggère de sauver d'abord.
      toast('Enregistrez d\'abord, puis testez depuis la fiche', 'info');
      return;
    }
    try {
      let config; try { config = collectConfig(); } catch (e) { toast(e.message, 'error'); return; }
      await api(`/tyla/api/devices/${existing.id}`, { method: 'PATCH', body: { config } });
      const r = await api(`/tyla/api/devices/${existing.id}/test`, { method: 'POST' });
      testResult.innerHTML = '';
      const cls = r.online ? 'auth-info' : 'auth-error';
      testResult.innerHTML = `<div class="${cls}" style="margin-top:8px">${svgIcon(r.online ? 'ic-check' : 'ic-warn')}<span>${escapeHtml(r.online ? 'En ligne — état lu : ' + JSON.stringify(r.state) : (r.error || 'Hors ligne'))}</span></div>`;
    } catch (e) { toast(e.message, 'error'); }
  });

  saveBtn.addEventListener('click', async () => {
    const name = $('#dm-name', body).value.trim();
    if (!name) { toast('Nom requis', 'error'); return; }
    let config; try { config = collectConfig(); } catch (e) { toast(e.message, 'error'); return; }
    saveBtn.disabled = true;
    try {
      if (existing) {
        await api(`/tyla/api/devices/${existing.id}`, {
          method: 'PATCH', body: { name, room_id: roomSel.value || null, config },
        });
        toast('Appareil mis à jour', 'ok');
      } else {
        await api('/tyla/api/devices', {
          method: 'POST',
          body: { type: currentType, name, room_id: roomSel.value || null, config },
        });
        toast('Appareil créé', 'ok');
      }
      await refreshDevices(); closeModal(); render();
    } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
  });

  const m = openModal(content, { wide: true });
  function closeModal() { m.close(); }
}

// ── Modals: Discover (Tuya scan) ──────────────────────────────

function openDiscoverModal() {
  const content = el('div');
  const head = el('div', { class: 'modal-head' });
  head.innerHTML = `<h2 class="modal-title">Scanner le réseau local</h2>`;
  const closeBtn = el('button', { class: 'modal-close', onClick: () => m.close() });
  closeBtn.innerHTML = svgIcon('ic-x');
  head.appendChild(closeBtn);
  content.appendChild(head);
  const body = el('div', { class: 'modal-body' });
  body.innerHTML = `
    <p style="color:var(--text-mute);font-size:14px;margin:0">
      Scan UDP broadcast Tuya — détecte les ampoules/prises/capteurs sur votre LAN.
      <strong>Note :</strong> le scan ne fournit pas le <code>local_key</code> qui doit être
      récupéré via <code>tinytuya wizard</code> (voir Paramètres → Aide).
    </p>
    <div id="dscList" class="discover-list" style="margin-top:14px"><div class="empty-state" style="padding:20px"><div class="empty-state-icon">${svgIcon('ic-radar')}</div><h3>Lancement du scan…</h3><p>~6 secondes.</p></div></div>
  `;
  content.appendChild(body);

  const m = openModal(content, { wide: true });

  setTimeout(async () => {
    try {
      const r = await api('/tyla/api/discover', { method: 'POST' });
      const list = $('#dscList', body);
      list.innerHTML = '';
      if (!r.devices || !r.devices.length) {
        list.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-state-icon">${svgIcon('ic-info')}</div><h3>Aucun device détecté</h3><p>Vérifiez que les ampoules sont connectées au même réseau Wi-Fi que ce serveur.</p></div>`;
        return;
      }
      for (const dev of r.devices) {
        const row = el('div', { class: 'discover-item' });
        row.innerHTML = `
          <span class="device-icon">${svgIcon('ic-bulb')}</span>
          <div class="discover-meta">
            <div class="discover-ip">${escapeHtml(dev.ip)} ${dev.already_added ? '<span class="tag-pill" style="margin-left:6px">Déjà ajouté</span>' : ''}</div>
            <div class="discover-id">ID : ${escapeHtml(dev.device_id || '?')} · v${escapeHtml(dev.version || '?')}</div>
          </div>
        `;
        const addBtn = el('button', { class: 'btn btn-sm btn-primary' });
        addBtn.innerHTML = `${svgIcon('ic-plus')}<span>${dev.already_added ? 'Reconfigurer' : 'Ajouter'}</span>`;
        addBtn.addEventListener('click', () => {
          m.close();
          openDeviceModal({
            id: null, type: 'tuya_bulb', name: '', room_id: null,
            config: { device_id: dev.device_id, ip: dev.ip, version: parseFloat(dev.version) || 3.3 },
            state: {}, online: false,
          });
          // Note: existing reste null donc create_device — on a juste pré-rempli.
          setTimeout(() => {
            const inp = document.querySelector('#dm-name');
            if (inp) inp.focus();
          }, 50);
        });
        row.appendChild(addBtn);
        list.appendChild(row);
      }
    } catch (e) {
      $('#dscList', body).innerHTML = `<div class="auth-error">${svgIcon('ic-warn')}<span>${escapeHtml(e.message)}</span></div>`;
    }
  }, 0);
}

// ── Modals: Room edit ─────────────────────────────────────────

function openRoomModal(existing) {
  const data = existing ? { ...existing } : {
    name: '', icon: 'home', color: ROOM_COLORS[0],
    pos_x: 0.2, pos_y: 0.2, pos_w: 0.25, pos_h: 0.25,
  };
  const content = el('div');
  const head = el('div', { class: 'modal-head' });
  head.innerHTML = `<h2 class="modal-title">${existing ? 'Modifier la pièce' : 'Nouvelle pièce'}</h2>`;
  const closeBtn = el('button', { class: 'modal-close', onClick: () => m.close() });
  closeBtn.innerHTML = svgIcon('ic-x');
  head.appendChild(closeBtn);
  content.appendChild(head);

  const body = el('div', { class: 'modal-body' });
  body.innerHTML = `
    <div class="form-field"><label class="form-label">Nom</label><input class="form-input" id="rm-name" value="${escapeHtml(data.name)}" placeholder="Ex : Salon" /></div>
    <div class="form-field"><label class="form-label">Icône</label><div class="icon-grid" id="rm-icons"></div></div>
    <div class="form-field"><label class="form-label">Couleur</label><div class="color-grid" id="rm-colors"></div></div>
    <div class="form-row">
      <div class="form-field"><label class="form-label">Position X (%)</label><input class="form-input" id="rm-x" type="number" min="0" max="100" step="1" value="${Math.round(data.pos_x * 100)}" /></div>
      <div class="form-field"><label class="form-label">Position Y (%)</label><input class="form-input" id="rm-y" type="number" min="0" max="100" step="1" value="${Math.round(data.pos_y * 100)}" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label class="form-label">Largeur (%)</label><input class="form-input" id="rm-w" type="number" min="5" max="100" step="1" value="${Math.round(data.pos_w * 100)}" /></div>
      <div class="form-field"><label class="form-label">Hauteur (%)</label><input class="form-input" id="rm-h" type="number" min="5" max="100" step="1" value="${Math.round(data.pos_h * 100)}" /></div>
    </div>
    <p class="form-hint">Ces positions servent à dessiner la maison sur le tableau de bord.</p>
  `;
  content.appendChild(body);
  // icons
  const iconBox = $('#rm-icons', body);
  for (const ic of ROOM_ICONS) {
    const b = el('button', {
      class: 'icon-btn' + (data.icon === ic ? ' is-active' : ''),
      type: 'button', onClick: () => { data.icon = ic; for (const x of $$('.icon-btn', iconBox)) x.classList.remove('is-active'); b.classList.add('is-active'); },
    });
    b.innerHTML = svgIcon(ic);
    iconBox.appendChild(b);
  }
  // colors
  const colorBox = $('#rm-colors', body);
  for (const c of ROOM_COLORS) {
    const b = el('button', {
      class: 'color-btn' + (data.color === c ? ' is-active' : ''),
      type: 'button', style: `--swatch: ${c}`,
      onClick: () => { data.color = c; for (const x of $$('.color-btn', colorBox)) x.classList.remove('is-active'); b.classList.add('is-active'); },
    });
    colorBox.appendChild(b);
  }

  const foot = el('div', { class: 'modal-foot' });
  if (existing) {
    const del = el('button', {
      class: 'btn btn-danger',
      onClick: async () => {
        if (!confirm(`Supprimer la pièce « ${existing.name} » ? Les appareils seront détachés (mais pas supprimés).`)) return;
        try { await api(`/tyla/api/rooms/${existing.id}`, { method: 'DELETE' }); await refreshAll(); render(); toast('Pièce supprimée', 'ok'); m.close(); }
        catch (e) { toast(e.message, 'error'); }
      },
    });
    del.innerHTML = `${svgIcon('ic-trash')}<span>Supprimer</span>`;
    foot.appendChild(del);
    foot.appendChild(el('div', { style: 'flex:1' }));
  }
  const cancel = el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, ['Annuler']);
  const save = el('button', { class: 'btn btn-primary' }, [existing ? 'Enregistrer' : 'Créer']);
  foot.appendChild(cancel); foot.appendChild(save);
  content.appendChild(foot);
  save.addEventListener('click', async () => {
    const payload = {
      name: $('#rm-name', body).value.trim(),
      icon: data.icon, color: data.color,
      pos_x: parseFloat($('#rm-x', body).value) / 100,
      pos_y: parseFloat($('#rm-y', body).value) / 100,
      pos_w: parseFloat($('#rm-w', body).value) / 100,
      pos_h: parseFloat($('#rm-h', body).value) / 100,
    };
    if (!payload.name) { toast('Nom requis', 'error'); return; }
    save.disabled = true;
    try {
      if (existing) await api(`/tyla/api/rooms/${existing.id}`, { method: 'PATCH', body: payload });
      else await api('/tyla/api/rooms', { method: 'POST', body: payload });
      await refreshRooms(); render(); toast(existing ? 'Pièce mise à jour' : 'Pièce créée', 'ok'); m.close();
    } catch (e) { toast(e.message, 'error'); save.disabled = false; }
  });
  const m = openModal(content);
}

// ── Modals: Scene edit ───────────────────────────────────────

function openSceneModal(existing) {
  const data = existing ? { ...existing, actions: [...(existing.actions || [])] } : {
    name: '', icon: 'sparkle', color: 'oklch(0.72 0.15 80)', actions: [],
  };
  const content = el('div');
  const head = el('div', { class: 'modal-head' });
  head.innerHTML = `<h2 class="modal-title">${existing ? 'Modifier la scène' : 'Nouvelle scène'}</h2>`;
  const closeBtn = el('button', { class: 'modal-close', onClick: () => m.close() });
  closeBtn.innerHTML = svgIcon('ic-x');
  head.appendChild(closeBtn);
  content.appendChild(head);

  const body = el('div', { class: 'modal-body' });
  body.innerHTML = `
    <div class="form-field"><label class="form-label">Nom</label><input class="form-input" id="sm-name" value="${escapeHtml(data.name)}" placeholder="Ex : Cinéma" /></div>
    <div class="form-field"><label class="form-label">Icône</label><div class="icon-grid" id="sm-icons"></div></div>
    <div class="form-field"><label class="form-label">Couleur</label><div class="color-grid" id="sm-colors"></div></div>
    <div class="form-field"><label class="form-label">Actions</label><div class="scene-actions-builder" id="sm-actions"></div><p class="form-hint">Chaque action est exécutée en séquence quand la scène se déclenche.</p></div>
  `;
  content.appendChild(body);

  const iconBox = $('#sm-icons', body);
  for (const ic of SCENE_ICONS) {
    const b = el('button', {
      class: 'icon-btn' + (data.icon === ic ? ' is-active' : ''),
      type: 'button', onClick: () => { data.icon = ic; for (const x of $$('.icon-btn', iconBox)) x.classList.remove('is-active'); b.classList.add('is-active'); },
    });
    b.innerHTML = svgIcon(ic);
    iconBox.appendChild(b);
  }
  const sceneColors = ['oklch(0.78 0.16 80)', 'oklch(0.55 0.18 280)', 'oklch(0.7 0.14 160)', 'oklch(0.6 0.12 250)', 'oklch(0.65 0.14 25)', 'oklch(0.72 0.13 220)'];
  const colorBox = $('#sm-colors', body);
  for (const c of sceneColors) {
    const b = el('button', {
      class: 'color-btn' + (data.color === c ? ' is-active' : ''), type: 'button',
      style: `--swatch:${c}`,
      onClick: () => { data.color = c; for (const x of $$('.color-btn', colorBox)) x.classList.remove('is-active'); b.classList.add('is-active'); },
    });
    colorBox.appendChild(b);
  }

  const actionsBox = $('#sm-actions', body);
  function rebuildActions() {
    actionsBox.innerHTML = '';
    if (!data.actions.length) {
      actionsBox.innerHTML = `<div class="form-hint" style="padding:6px">Aucune action — ajoutez-en au moins une.</div>`;
    }
    data.actions.forEach((a, idx) => {
      const row = el('div', { class: 'scene-action-row' });
      const devSel = el('select', { class: 'form-select' });
      devSel.appendChild(el('option', { value: '' }, ['— Appareil…']));
      for (const d of state.devices) {
        const opt = el('option', { value: d.id }, [d.name + (d.room_name ? ` (${d.room_name})` : '')]);
        if (a.device_id === d.id) opt.selected = true;
        devSel.appendChild(opt);
      }
      const actSel = el('select', { class: 'form-select' });
      function refillActSel() {
        actSel.innerHTML = '';
        const dev = state.devices.find(x => x.id === devSel.value);
        const cap = dev ? state.types[dev.type] : null;
        if (cap) {
          for (const ac of cap.actions || []) {
            const opt = el('option', { value: ac }, [ac]);
            if (a.action === ac) opt.selected = true;
            actSel.appendChild(opt);
          }
        } else {
          actSel.appendChild(el('option', { value: '' }, ['—']));
        }
      }
      refillActSel();
      devSel.addEventListener('change', () => { data.actions[idx].device_id = devSel.value; refillActSel(); a.action = actSel.value; });
      actSel.addEventListener('change', () => { data.actions[idx].action = actSel.value; });
      const del = el('button', { class: 'btn btn-icon btn-ghost btn-danger', type: 'button', onClick: () => { data.actions.splice(idx, 1); rebuildActions(); } });
      del.innerHTML = svgIcon('ic-trash');
      row.appendChild(devSel); row.appendChild(actSel); row.appendChild(del);
      actionsBox.appendChild(row);
    });
    const addBtn = el('button', {
      class: 'btn btn-sm', type: 'button', style: 'margin-top:8px;width:100%',
      onClick: () => { data.actions.push({ device_id: '', action: '', params: {} }); rebuildActions(); },
    });
    addBtn.innerHTML = `${svgIcon('ic-plus')}<span>Ajouter une action</span>`;
    actionsBox.appendChild(addBtn);
  }
  rebuildActions();

  const foot = el('div', { class: 'modal-foot' });
  if (existing) {
    const del = el('button', {
      class: 'btn btn-danger',
      onClick: async () => {
        if (!confirm(`Supprimer la scène « ${existing.name} » ?`)) return;
        try { await api(`/tyla/api/scenes/${existing.id}`, { method: 'DELETE' }); await refreshScenes(); render(); toast('Scène supprimée', 'ok'); m.close(); }
        catch (e) { toast(e.message, 'error'); }
      },
    });
    del.innerHTML = `${svgIcon('ic-trash')}<span>Supprimer</span>`;
    foot.appendChild(del);
    foot.appendChild(el('div', { style: 'flex:1' }));
  }
  const cancel = el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, ['Annuler']);
  const save = el('button', { class: 'btn btn-primary' }, [existing ? 'Enregistrer' : 'Créer']);
  foot.appendChild(cancel); foot.appendChild(save);
  content.appendChild(foot);
  save.addEventListener('click', async () => {
    const payload = {
      name: $('#sm-name', body).value.trim(),
      icon: data.icon, color: data.color,
      actions: data.actions.filter(a => a.device_id && a.action),
    };
    if (!payload.name) { toast('Nom requis', 'error'); return; }
    save.disabled = true;
    try {
      if (existing) await api(`/tyla/api/scenes/${existing.id}`, { method: 'PATCH', body: payload });
      else await api('/tyla/api/scenes', { method: 'POST', body: payload });
      await refreshScenes(); render(); toast(existing ? 'Scène mise à jour' : 'Scène créée', 'ok'); m.close();
    } catch (e) { toast(e.message, 'error'); save.disabled = false; }
  });

  const m = openModal(content, { wide: true });
}

// ── Modals: Schedule edit ────────────────────────────────────

function openScheduleModal(existing) {
  const data = existing ? {
    ...existing,
    weekdays: [...(existing.weekdays || [0, 1, 2, 3, 4, 5, 6])],
  } : {
    name: '', kind: 'scene', target_id: '', action: '', params: {},
    time_hhmm: '08:00', weekdays: [0, 1, 2, 3, 4], enabled: true,
  };
  const content = el('div');
  const head = el('div', { class: 'modal-head' });
  head.innerHTML = `<h2 class="modal-title">${existing ? 'Modifier la programmation' : 'Nouvelle programmation'}</h2>`;
  const closeBtn = el('button', { class: 'modal-close', onClick: () => m.close() });
  closeBtn.innerHTML = svgIcon('ic-x');
  head.appendChild(closeBtn);
  content.appendChild(head);

  const body = el('div', { class: 'modal-body' });
  body.innerHTML = `
    <div class="form-row">
      <div class="form-field"><label class="form-label">Nom</label><input class="form-input" id="schm-name" value="${escapeHtml(data.name)}" placeholder="Ex : Réveil semaine" /></div>
      <div class="form-field"><label class="form-label">Heure</label><input class="form-input" id="schm-time" type="time" value="${escapeHtml(data.time_hhmm)}" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label class="form-label">Type de cible</label>
        <select class="form-select" id="schm-kind">
          <option value="scene"${data.kind === 'scene' ? ' selected' : ''}>Scène</option>
          <option value="device"${data.kind === 'device' ? ' selected' : ''}>Appareil</option>
        </select>
      </div>
      <div class="form-field"><label class="form-label">Cible</label>
        <select class="form-select" id="schm-target"></select>
      </div>
    </div>
    <div class="form-field" id="schm-action-wrap" hidden><label class="form-label">Action</label><select class="form-select" id="schm-action"></select></div>
    <div class="form-field"><label class="form-label">Jours</label><div class="weekday-pills" id="schm-days" style="gap:6px"></div></div>
  `;
  content.appendChild(body);

  function refillTarget() {
    const targetSel = $('#schm-target', body);
    const kind = $('#schm-kind', body).value;
    targetSel.innerHTML = '';
    targetSel.appendChild(el('option', { value: '' }, ['— Choisir…']));
    const items = kind === 'scene' ? state.scenes : state.devices;
    for (const it of items) {
      const opt = el('option', { value: it.id }, [it.name]);
      if (data.target_id === it.id) opt.selected = true;
      targetSel.appendChild(opt);
    }
    refillAction();
  }
  function refillAction() {
    const actionWrap = $('#schm-action-wrap', body);
    const actionSel = $('#schm-action', body);
    if ($('#schm-kind', body).value === 'scene') {
      actionWrap.hidden = true;
      return;
    }
    actionWrap.hidden = false;
    actionSel.innerHTML = '';
    const dev = state.devices.find(d => d.id === $('#schm-target', body).value);
    const cap = dev ? state.types[dev.type] : null;
    if (!cap) { actionSel.appendChild(el('option', { value: '' }, ['—'])); return; }
    for (const a of cap.actions || []) {
      const opt = el('option', { value: a }, [a]);
      if (data.action === a) opt.selected = true;
      actionSel.appendChild(opt);
    }
  }
  $('#schm-kind', body).addEventListener('change', refillTarget);
  $('#schm-target', body).addEventListener('change', refillAction);
  refillTarget();

  // Days
  const daysBox = $('#schm-days', body);
  for (let i = 0; i < 7; i++) {
    const b = el('button', {
      class: 'weekday-pill' + (data.weekdays.includes(i) ? ' is-active' : ''),
      type: 'button', style: 'width:32px;height:32px;border:none;cursor:pointer',
      onClick: () => {
        const idx = data.weekdays.indexOf(i);
        if (idx >= 0) data.weekdays.splice(idx, 1); else data.weekdays.push(i);
        b.classList.toggle('is-active');
      },
    }, [WEEKDAY_LABELS[i]]);
    daysBox.appendChild(b);
  }

  const foot = el('div', { class: 'modal-foot' });
  if (existing) {
    const del = el('button', {
      class: 'btn btn-danger',
      onClick: async () => {
        if (!confirm(`Supprimer la programmation ?`)) return;
        try { await api(`/tyla/api/schedules/${existing.id}`, { method: 'DELETE' }); await refreshSchedules(); render(); toast('Programmation supprimée', 'ok'); m.close(); }
        catch (e) { toast(e.message, 'error'); }
      },
    });
    del.innerHTML = `${svgIcon('ic-trash')}<span>Supprimer</span>`;
    foot.appendChild(del);
    foot.appendChild(el('div', { style: 'flex:1' }));
  }
  const cancel = el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, ['Annuler']);
  const save = el('button', { class: 'btn btn-primary' }, [existing ? 'Enregistrer' : 'Créer']);
  foot.appendChild(cancel); foot.appendChild(save);
  content.appendChild(foot);
  save.addEventListener('click', async () => {
    const payload = {
      name: $('#schm-name', body).value.trim(),
      kind: $('#schm-kind', body).value,
      target_id: $('#schm-target', body).value,
      action: $('#schm-action', body).value || '',
      time_hhmm: $('#schm-time', body).value,
      weekdays: data.weekdays,
      params: {},
      enabled: existing ? existing.enabled : true,
    };
    if (!payload.name || !payload.target_id) { toast('Nom et cible requis', 'error'); return; }
    if (payload.kind === 'device' && !payload.action) { toast('Action requise', 'error'); return; }
    save.disabled = true;
    try {
      if (existing) await api(`/tyla/api/schedules/${existing.id}`, { method: 'PATCH', body: payload });
      else await api('/tyla/api/schedules', { method: 'POST', body: payload });
      await refreshSchedules(); render(); toast(existing ? 'Programmation mise à jour' : 'Programmation créée', 'ok'); m.close();
    } catch (e) { toast(e.message, 'error'); save.disabled = false; }
  });
  const m = openModal(content);
}

// ── Modals: Change password (depuis settings) ───────────────

function openChangePasswordModal() {
  const content = el('div');
  const head = el('div', { class: 'modal-head' });
  head.innerHTML = `<h2 class="modal-title">Changer de mot de passe</h2>`;
  const closeBtn = el('button', { class: 'modal-close', onClick: () => m.close() });
  closeBtn.innerHTML = svgIcon('ic-x');
  head.appendChild(closeBtn);
  content.appendChild(head);

  const body = el('div', { class: 'modal-body' });
  body.innerHTML = `
    <div class="form-field"><label class="form-label">Ancien mot de passe</label><input class="form-input" id="cpm-old" type="password" autocomplete="current-password" /></div>
    <div class="form-field"><label class="form-label">Nouveau mot de passe</label><input class="form-input" id="cpm-new" type="password" minlength="8" autocomplete="new-password" /><p class="form-hint">8 caractères minimum.</p></div>
    <div class="form-field"><label class="form-label">Confirmer</label><input class="form-input" id="cpm-confirm" type="password" minlength="8" autocomplete="new-password" /></div>
  `;
  content.appendChild(body);

  const foot = el('div', { class: 'modal-foot' });
  const cancel = el('button', { class: 'btn btn-ghost', onClick: () => m.close() }, ['Annuler']);
  const save = el('button', { class: 'btn btn-primary' }, ['Changer']);
  foot.appendChild(cancel); foot.appendChild(save);
  content.appendChild(foot);

  save.addEventListener('click', async () => {
    const oldP = $('#cpm-old', body).value;
    const newP = $('#cpm-new', body).value;
    const conf = $('#cpm-confirm', body).value;
    if (newP.length < 8) { toast('Nouveau mdp trop court', 'error'); return; }
    if (newP !== conf) { toast('Les mots de passe ne correspondent pas', 'error'); return; }
    save.disabled = true;
    try {
      await api('/tyla/api/auth/change-password', { method: 'POST', body: { old_password: oldP, new_password: newP } });
      toast('Mot de passe mis à jour', 'ok'); m.close();
    } catch (e) { toast(e.message, 'error'); save.disabled = false; }
  });
  const m = openModal(content);
}

// ── Empty state helper ──────────────────────────────────────

function makeEmptyState(title, msg, iconKey) {
  const div = el('div', { class: 'device-empty' });
  div.innerHTML = `<div class="device-empty-icon">${svgIcon(iconKey)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(msg)}</p>`;
  return div;
}

// ── Refresh data ────────────────────────────────────────────

async function refreshAll() {
  try {
    const [me, types, rooms, devices, scenes, schedules, history] = await Promise.all([
      api('/tyla/api/auth/me'),
      api('/tyla/api/types'),
      api('/tyla/api/rooms'),
      api('/tyla/api/devices'),
      api('/tyla/api/scenes'),
      api('/tyla/api/schedules'),
      api('/tyla/api/history?limit=80'),
    ]);
    state.user = me.user;
    state.hasTinytuya = !!types.has_tinytuya;
    state.types = types.types || {};
    state.rooms = rooms.rooms || [];
    state.devices = devices.devices || [];
    state.scenes = scenes.scenes || [];
    state.schedules = schedules.schedules || [];
    state.history = history.history || [];
  } catch (e) {
    if (e.status === 401) { state.user = null; }
    else if (e.status === 403 && e.data?.error === 'must_change_password') {
      // L'API force le changement — on garde l'écran de login forcé
      const me = await api('/tyla/api/auth/me').catch(() => ({ user: null }));
      state.user = me.user;
    } else {
      toast(e.message, 'error');
    }
  }
}

async function refreshDevices() {
  try { state.devices = (await api('/tyla/api/devices')).devices || []; } catch {}
}
async function refreshRooms() {
  try { state.rooms = (await api('/tyla/api/rooms')).rooms || []; } catch {}
}
async function refreshScenes() {
  try { state.scenes = (await api('/tyla/api/scenes')).scenes || []; } catch {}
}
async function refreshSchedules() {
  try { state.schedules = (await api('/tyla/api/schedules')).schedules || []; } catch {}
}
async function refreshHistory() {
  try { state.history = (await api('/tyla/api/history?limit=80')).history || []; } catch {}
}

// ── Polling: refresh devices state every 20s ──────────────

setInterval(async () => {
  if (!state.user || state.user.must_change_password) return;
  if (document.hidden) return;
  await refreshDevices();
  if (state.view === 'dashboard' || state.view === 'devices') render();
}, 20000);

// ── Boot ────────────────────────────────────────────────────

(async function start() {
  await boot();
  if (state.user && !state.user.must_change_password) {
    await refreshAll();
    render();
  }
})();

})();
