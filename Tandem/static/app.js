/* TANDEM — SPA front-end (vanilla, no build).
 *
 * État global dans `state`. Re-render via `render()` qui regarde `state.view`.
 * Les vues sont :
 *   - 'loading' : initial
 *   - 'login'   : écran de connexion
 *   - 'redeem'  : créer un compte depuis une invitation (URL ?invite=X&code=Y)
 *   - 'app'     : layout sidebar + main + (rail)
 *
 * L'app polling /api/channels/<id>/messages toutes les 5 s pour rester à jour.
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const state = {
    view: 'loading',
    user: null,           // session user
    channels: [],
    activeChannelId: null,
    activeTab: 'chat',    // chat | files | members | admin | drive
    messages: [],
    members: [],
    files: [],
    pendingFile: null,    // {id, original_name, size, mime} après upload, avant envoi msg
    error: null,
    redeemInvite: null,   // {id, role, expires_at, ...}
    polling: null,
    adminTab: 'users',    // users | invites
    adminUsers: [],
    adminInvites: [],
    adminStats: null,
    inviteResult: null,   // dernier invite créé pour afficher le lien
  };

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------
  async function api(path, opts = {}) {
    const init = {
      method: opts.method || 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    };
    if (opts.body && !(opts.body instanceof FormData)) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    } else if (opts.body) {
      init.body = opts.body;
    }
    const res = await fetch(path, init);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || (data && data.ok === false)) {
      const err = (data && data.error) || `HTTP ${res.status}`;
      throw new Error(err);
    }
    return data;
  }

  function toast(msg, kind = '') {
    const root = $('#toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all 0.2s';
      setTimeout(() => el.remove(), 220);
    }, 3000);
  }

  function avatarInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function fmtTime(ts) {
    const d = new Date(ts * 1000);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDay(ts) {
    return new Date(ts * 1000).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  }
  function fmtSize(b) {
    if (b < 1024) return b + ' o';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' Ko';
    return (b / 1024 / 1024).toFixed(1) + ' Mo';
  }
  function fmtRelative(ts) {
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return 'à l\'instant';
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    return new Date(ts * 1000).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short',
    });
  }

  function fileKindIcon(mime, name) {
    if (!mime) mime = '';
    const ext = (name || '').toLowerCase().split('.').pop();
    if (mime.startsWith('image/')) return { icon: 'ic-image', kind: 'is-img' };
    if (mime.startsWith('video/')) return { icon: 'ic-video', kind: 'is-video' };
    if (['zip', 'tar', 'gz', '7z'].includes(ext)) return { icon: 'ic-archive', kind: 'is-archive' };
    return { icon: 'ic-doc', kind: '' };
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function boot() {
    // Si l'URL contient une invitation, basculer en redeem
    const params = new URLSearchParams(location.search);
    const invId = params.get('invite');
    const invCode = params.get('code');
    if (invId && invCode) {
      try {
        const r = await api(`/tandem/api/auth/invite/${encodeURIComponent(invId)}`);
        state.redeemInvite = { ...r.invite, code: invCode };
        state.view = 'redeem';
        render();
        return;
      } catch (e) {
        toast('Lien d\'invitation invalide : ' + e.message, 'error');
      }
    }
    try {
      const r = await api('/tandem/api/auth/me');
      if (r.user) {
        state.user = r.user;
        await afterLogin();
      } else {
        state.view = 'login';
        render();
      }
    } catch (e) {
      state.view = 'login';
      render();
    }
  }

  async function afterLogin() {
    state.view = 'app';
    state.error = null;
    await loadChannels();
    if (state.channels.length && !state.activeChannelId) {
      state.activeChannelId = state.channels[0].id;
    }
    if (state.activeChannelId) {
      await loadMessages();
      await loadMembers();
    }
    render();
    startPolling();
  }

  function startPolling() {
    if (state.polling) clearInterval(state.polling);
    state.polling = setInterval(async () => {
      if (state.view !== 'app') return;
      if (state.activeTab === 'chat' && state.activeChannelId) {
        try {
          const r = await api(`/tandem/api/channels/${state.activeChannelId}/messages?limit=100`);
          // Compare seulement si le nombre ou les ids changent
          const newIds = r.messages.map(m => m.id).join(',');
          const oldIds = state.messages.map(m => m.id).join(',');
          if (newIds !== oldIds) {
            state.messages = r.messages;
            renderMessages(true);
          }
        } catch (e) {}
      }
    }, 5000);
  }
  function stopPolling() {
    if (state.polling) clearInterval(state.polling);
    state.polling = null;
  }

  // ------------------------------------------------------------------
  // API helpers
  // ------------------------------------------------------------------
  async function loadChannels() {
    const r = await api('/tandem/api/channels');
    state.channels = r.channels || [];
  }
  async function loadMessages() {
    const r = await api(`/tandem/api/channels/${state.activeChannelId}/messages?limit=100`);
    state.messages = r.messages || [];
  }
  async function loadMembers() {
    const r = await api(`/tandem/api/channels/${state.activeChannelId}/members`);
    state.members = r.members || [];
  }
  async function loadChannelFiles() {
    const r = await api(`/tandem/api/channels/${state.activeChannelId}/files`);
    state.files = r.files || [];
  }
  async function loadAllFiles() {
    const r = await api('/tandem/api/files');
    state.files = r.files || [];
  }
  async function loadAdminUsers() {
    const r = await api('/tandem/api/admin/users');
    state.adminUsers = r.users || [];
  }
  async function loadAdminInvites() {
    const r = await api('/tandem/api/admin/invites');
    state.adminInvites = r.invites || [];
  }
  async function loadStats() {
    const r = await api('/tandem/api/stats');
    state.adminStats = r.stats;
  }

  // ------------------------------------------------------------------
  // RENDER — orchestrator
  // ------------------------------------------------------------------
  const root = $('#app');

  function render() {
    if (state.view === 'login') return renderLogin();
    if (state.view === 'redeem') return renderRedeem();
    if (state.view === 'app') return renderApp();
    root.dataset.state = 'loading';
    root.innerHTML = '<div class="boot-loader"><span></span><span></span><span></span></div>';
  }

  // ============================================================
  // LOGIN
  // ============================================================
  function renderLogin() {
    root.dataset.state = 'login';
    root.classList.remove('with-rail');
    root.innerHTML = `
      <div class="login-card">
        <div class="login-brand">
          <div class="login-mark"></div>
          <div>
            <div class="login-name">TANDEM</div>
            <div class="login-tag">Espace de travail · marienour.work</div>
          </div>
        </div>
        <h1>Connexion</h1>
        <p class="subtitle">Accédez à votre espace : channels, fichiers, équipe.</p>

        <form id="loginForm" autocomplete="on">
          ${state.error ? `<div class="form-error">${escapeHtml(state.error)}</div>` : ''}
          <div class="form-row">
            <label for="le">Adresse e-mail</label>
            <input type="email" id="le" name="email" required autocomplete="email"
                   placeholder="vous@equipe.fr">
          </div>
          <div class="form-row" style="margin-bottom:24px">
            <label for="lp">Mot de passe</label>
            <input type="password" id="lp" name="password" required autocomplete="current-password"
                   placeholder="••••••••">
          </div>
          <button class="btn-primary" type="submit">Se connecter</button>
        </form>

        <div class="login-hint">
          <strong>Compte de démonstration :</strong><br>
          Email : <code>admin@tandem.local</code><br>
          Mot de passe : <code>tandem</code>
        </div>

        <div class="login-foot">
          <a href="/">↩ Retour au portfolio</a>
          <span>Démo · Antoine Binet</span>
        </div>
      </div>
    `;
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#le').value;
      const password = $('#lp').value;
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Connexion…';
      try {
        const r = await api('/tandem/api/auth/login', {
          method: 'POST', body: { email, password },
        });
        state.user = r.user;
        state.error = null;
        toast('Bienvenue ' + r.user.name + ' ✓', 'ok');
        await afterLogin();
      } catch (e) {
        state.error = e.message;
        renderLogin();
      }
    });
  }

  // ============================================================
  // REDEEM (invitation)
  // ============================================================
  function renderRedeem() {
    root.dataset.state = 'redeem';
    root.classList.remove('with-rail');
    const inv = state.redeemInvite;
    const expires = new Date(inv.expires_at * 1000);
    root.innerHTML = `
      <div class="login-card">
        <div class="login-brand">
          <div class="login-mark"></div>
          <div>
            <div class="login-name">TANDEM</div>
            <div class="login-tag">Invitation à rejoindre l'équipe</div>
          </div>
        </div>

        <h1>Bienvenue !</h1>
        <p class="subtitle">
          On vous invite à rejoindre Tandem en tant que
          <strong style="color:var(--accent-strong)">${inv.role === 'admin' ? 'administrateur' : 'membre'}</strong>.
          Créez votre compte ci-dessous.
        </p>
        ${inv.note ? `<div class="login-hint" style="margin-bottom:24px"><strong>Note :</strong> ${escapeHtml(inv.note)}</div>` : ''}

        <form id="redeemForm" autocomplete="on">
          ${state.error ? `<div class="form-error">${escapeHtml(state.error)}</div>` : ''}
          <div class="form-row">
            <label for="rname">Votre nom complet</label>
            <input type="text" id="rname" required minlength="2" autocomplete="name">
          </div>
          <div class="form-row">
            <label for="remail">Adresse e-mail</label>
            <input type="email" id="remail" required autocomplete="email"
                   value="${escapeHtml(inv.email_hint || '')}">
          </div>
          <div class="form-row">
            <label for="rjob">Poste / fonction <span style="text-transform:none;color:var(--ink-3)">(optionnel)</span></label>
            <input type="text" id="rjob" placeholder="Designer, Chef de projet…">
          </div>
          <div class="form-row" style="margin-bottom:24px">
            <label for="rpwd">Mot de passe (min. 6 caractères)</label>
            <input type="password" id="rpwd" required minlength="6" autocomplete="new-password">
          </div>
          <button class="btn-primary" type="submit">Créer mon compte</button>
        </form>

        <div class="login-foot">
          <span>Lien valable jusqu'au ${expires.toLocaleString('fr-FR')}</span>
          <a href="/tandem">Annuler</a>
        </div>
      </div>
    `;
    $('#redeemForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Création…';
      try {
        const r = await api('/tandem/api/auth/redeem', {
          method: 'POST', body: {
            invite_id: inv.id,
            code: inv.code,
            name: $('#rname').value,
            email: $('#remail').value,
            password: $('#rpwd').value,
            job_title: $('#rjob').value,
          },
        });
        state.user = r.user;
        state.redeemInvite = null;
        state.error = null;
        // Nettoie les params de l'URL
        history.replaceState(null, '', '/tandem');
        toast('Compte créé · bienvenue !', 'ok');
        await afterLogin();
      } catch (e) {
        state.error = e.message;
        renderRedeem();
      }
    });
  }

  // ============================================================
  // APP
  // ============================================================
  function renderApp() {
    root.dataset.state = 'app';
    const showRail = state.activeTab === 'chat' && state.activeChannelId;
    root.classList.toggle('with-rail', !!showRail);

    root.innerHTML = `
      ${renderSidebar()}
      ${renderMain()}
      ${showRail ? renderRail() : ''}
    `;
    bindAppEvents();
    if (state.activeTab === 'chat') renderMessages(true);
  }

  function renderSidebar() {
    const isAdmin = state.user.role === 'admin';
    const channels = state.channels;
    return `
      <aside class="sidebar">
        <div class="sidebar-head">
          <div class="sidebar-mark"></div>
          <div class="sidebar-title">TANDEM</div>
          <a href="/" class="sidebar-back" title="Retour au portfolio" aria-label="Retour au portfolio">
            <svg width="16" height="16"><use href="#ic-back"/></svg>
          </a>
        </div>

        <div class="sidebar-nav">
          <div class="nav-section">
            <div class="nav-section-head">
              <span>Channels</span>
              <button id="btnNewChannel" title="Créer un channel">
                <svg width="14" height="14"><use href="#ic-plus"/></svg>
              </button>
            </div>
            ${channels.map((c) => {
              const isActive = c.id === state.activeChannelId && state.activeTab === 'chat';
              const icon = c.kind === 'announcement' ? 'ic-megaphone' : 'ic-hash';
              return `
                <button class="nav-item ${isActive ? 'is-active' : ''}"
                        data-channel-id="${c.id}" data-action="open-channel">
                  <svg class="nav-item-icon" width="18" height="18"><use href="#${icon}"/></svg>
                  <span class="nav-item-label">${escapeHtml(c.name)}</span>
                  ${c.kind === 'announcement' ? '<span class="nav-item-tag">Lecture</span>' : ''}
                </button>
              `;
            }).join('')}
          </div>

          <div class="nav-section">
            <div class="nav-section-head">
              <span>Espace</span>
            </div>
            <button class="nav-item ${state.activeTab === 'drive' ? 'is-active' : ''}" data-action="open-drive">
              <svg class="nav-item-icon" width="18" height="18"><use href="#ic-folder"/></svg>
              <span class="nav-item-label">Tous les fichiers</span>
            </button>
            ${isAdmin ? `
            <button class="nav-item ${state.activeTab === 'admin' ? 'is-active' : ''}" data-action="open-admin">
              <svg class="nav-item-icon" width="18" height="18"><use href="#ic-shield"/></svg>
              <span class="nav-item-label">Admin</span>
            </button>` : ''}
          </div>
        </div>

        <div class="sidebar-foot">
          <div class="user-chip" data-action="open-profile">
            <div class="user-avatar" style="background: ${state.user.avatar_color}">
              ${avatarInitials(state.user.name)}
            </div>
            <div class="user-info">
              <div class="user-name">${escapeHtml(state.user.name)}</div>
              <div class="user-role">${state.user.role === 'admin' ? 'Administrateur' : 'Membre'}</div>
            </div>
            <button class="btn-ghost" data-action="logout" title="Se déconnecter" aria-label="Se déconnecter" style="padding:6px;">
              <svg width="16" height="16"><use href="#ic-x"/></svg>
            </button>
          </div>
        </div>
      </aside>
    `;
  }

  function renderMain() {
    if (state.activeTab === 'admin') return renderAdminPane();
    if (state.activeTab === 'drive') return renderDrive();
    return renderChannel();
  }

  function renderChannel() {
    if (!state.activeChannelId) {
      return `
        <main class="main">
          <div class="empty-pane">
            <div class="empty-icon"><svg width="32" height="32"><use href="#ic-hash"/></svg></div>
            <h3>Aucun channel sélectionné</h3>
            <p>Choisissez un channel à gauche pour commencer une discussion.</p>
          </div>
        </main>
      `;
    }
    const ch = state.channels.find((c) => c.id === state.activeChannelId);
    if (!ch) return '<main class="main"></main>';
    const icon = ch.kind === 'announcement' ? 'ic-megaphone' : 'ic-hash';
    const isReadOnly = ch.kind === 'announcement' && state.user.role !== 'admin';
    return `
      <main class="main">
        <div class="main-head">
          <h2>
            <svg width="18" height="18"><use href="#${icon}"/></svg>
            ${escapeHtml(ch.name)}
          </h2>
          <span class="main-head-meta">${escapeHtml(ch.description || 'Pas de description')}</span>
          <div class="head-tabs">
            <button class="head-tab ${state.activeTab === 'chat' ? 'is-active' : ''}" data-action="tab-chat">Discussion</button>
            <button class="head-tab ${state.activeTab === 'files' ? 'is-active' : ''}" data-action="tab-files">Fichiers</button>
          </div>
          <div class="main-head-actions">
            ${state.user.role === 'admin' && ch.slug !== 'general' ? `
              <button class="btn-ghost" data-action="delete-channel" title="Supprimer le channel">
                <svg width="16" height="16"><use href="#ic-trash"/></svg>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="main-body" id="mainBody">
          ${state.activeTab === 'chat'
            ? renderMessagesContainer(isReadOnly)
            : renderFilesPane()}
        </div>
      </main>
    `;
  }

  function renderMessagesContainer(isReadOnly) {
    return `
      <div class="msg-list" id="msgList"></div>
      ${isReadOnly ? `
        <div class="composer">
          <p style="margin:6px 0; color:var(--ink-2); font-size:13px; text-align:center;">
            <svg width="14" height="14" style="vertical-align:-2px;"><use href="#ic-megaphone"/></svg>
            Channel en lecture seule — seuls les administrateurs peuvent y publier.
          </p>
        </div>
      ` : `
        <div class="composer">
          ${state.pendingFile ? `
            <div class="composer-attached">
              <svg width="14" height="14"><use href="#ic-attach"/></svg>
              ${escapeHtml(state.pendingFile.original_name)} ·
              <span style="color:var(--ink-2)">${fmtSize(state.pendingFile.size_bytes)}</span>
              <button data-action="cancel-pending"><svg width="12" height="12"><use href="#ic-x"/></svg></button>
            </div>
          ` : ''}
          <div class="composer-bar">
            <button class="composer-btn" data-action="attach-file" title="Joindre un fichier">
              <svg width="18" height="18"><use href="#ic-attach"/></svg>
            </button>
            <textarea class="composer-input" id="composerInput" rows="1"
                      placeholder="Écrivez votre message…"></textarea>
            <button class="composer-btn composer-send" id="btnSend" disabled
                    data-action="send-message" title="Envoyer">
              <svg width="18" height="18"><use href="#ic-send"/></svg>
            </button>
          </div>
        </div>
      `}
      <input type="file" id="hiddenFileInput" style="display:none">
      <div class="drop-overlay" id="dropOverlay">
        <div class="drop-overlay-inner">
          <svg width="48" height="48" style="opacity:0.7;"><use href="#ic-folder"/></svg>
          <h3>Déposez votre fichier ici</h3>
          <p>Il sera attaché à votre prochain message.</p>
        </div>
      </div>
    `;
  }

  function renderMessages(scrollToEnd = false) {
    const list = $('#msgList');
    if (!list) return;
    if (!state.messages.length) {
      list.innerHTML = `
        <div class="msg-empty">
          <div class="msg-empty-icon"><svg width="28" height="28"><use href="#ic-hash"/></svg></div>
          <h3>Lancez la conversation</h3>
          <p>Soyez le premier à écrire dans ce channel.</p>
        </div>
      `;
      return;
    }
    let html = '';
    let lastDay = '';
    let prevAuthorId = null;
    let prevTime = 0;
    for (const m of state.messages) {
      const day = fmtDay(m.created_at);
      if (day !== lastDay) {
        html += `<div class="msg-divider">${day}</div>`;
        lastDay = day;
        prevAuthorId = null;
      }
      const grouped = m.user_id === prevAuthorId
                      && (m.created_at - prevTime) < 300; // 5 min
      html += renderMessage(m, grouped);
      prevAuthorId = m.user_id;
      prevTime = m.created_at;
    }
    list.innerHTML = html;
    if (scrollToEnd) {
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    }
    list.querySelectorAll('[data-action="delete-message"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce message ?')) return;
        const id = btn.dataset.id;
        try {
          await api(`/tandem/api/messages/${id}`, { method: 'DELETE' });
          state.messages = state.messages.filter((m) => m.id !== id);
          renderMessages();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  function renderMessage(m, grouped) {
    const author = escapeHtml(m.author_name || 'Inconnu');
    const time = fmtTime(m.created_at);
    const colorVar = m.author_color || 'oklch(0.7 0.16 220)';
    const initials = avatarInitials(m.author_name || '?');
    const isMine = m.user_id === state.user.id;
    const isAdmin = state.user.role === 'admin';
    const canDelete = isMine || isAdmin;
    let attach = '';
    if (m.file) {
      const f = m.file;
      const ki = fileKindIcon(f.mime, f.original_name);
      attach = `
        <a class="msg-attach" href="/tandem/files/${f.id}?download=1" target="_blank" rel="noopener">
          <span class="msg-attach-icon ${ki.kind}"><svg width="16" height="16"><use href="#${ki.icon}"/></svg></span>
          <div class="msg-attach-meta">
            <div class="msg-attach-name">${escapeHtml(f.original_name)}</div>
            <div class="msg-attach-detail">${escapeHtml(f.mime || 'fichier')} · ${fmtSize(f.size_bytes)}</div>
          </div>
        </a>
      `;
    }
    return `
      <div class="msg ${grouped ? 'is-grouped' : ''}">
        <div class="msg-avatar" style="background:${colorVar}">${initials}</div>
        <div class="msg-content">
          ${grouped ? '' : `
            <div class="msg-head">
              <span class="msg-author">${author}</span>
              ${m.author_role === 'admin' ? '<span class="msg-role-pill">Admin</span>' : ''}
              <span class="msg-time">${time}</span>
            </div>
          `}
          ${m.body ? `<div class="msg-body">${linkify(escapeHtml(m.body))}</div>` : ''}
          ${attach}
        </div>
        ${canDelete ? `
          <div class="msg-actions">
            <button class="msg-action-btn is-danger" data-action="delete-message" data-id="${m.id}" title="Supprimer">
              <svg width="14" height="14"><use href="#ic-trash"/></svg>
            </button>
          </div>` : ''}
      </div>
    `;
  }

  function linkify(html) {
    return html.replace(
      /(https?:\/\/[^\s<>"]+)/g,
      '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent-strong);text-decoration:underline">$1</a>',
    );
  }

  // ----- Files (per channel) -----
  function renderFilesPane() {
    return `<div class="files-grid" id="filesGrid">
      <div class="msg-empty">Chargement…</div>
    </div>`;
  }

  function renderFilesGrid(files) {
    const grid = $('#filesGrid');
    if (!grid) return;
    if (!files.length) {
      grid.innerHTML = `
        <div class="msg-empty" style="grid-column:1/-1">
          <div class="msg-empty-icon"><svg width="28" height="28"><use href="#ic-folder"/></svg></div>
          <h3>Aucun fichier partagé</h3>
          <p>Glissez-déposez un fichier dans la discussion pour le partager.</p>
        </div>
      `;
      return;
    }
    grid.innerHTML = files.map((f) => {
      const ki = fileKindIcon(f.mime, f.original_name);
      const isMine = f.owner_id === state.user.id;
      const canDelete = isMine || state.user.role === 'admin';
      const channelLabel = f.channel_name ? ` · #${escapeHtml(f.channel_slug)}` : '';
      return `
        <div class="file-card">
          <div class="file-icon-wrap ${ki.kind}">
            <svg width="22" height="22"><use href="#${ki.icon}"/></svg>
          </div>
          <div class="file-name" title="${escapeHtml(f.original_name)}">${escapeHtml(f.original_name)}</div>
          <div class="file-meta">
            <span>${fmtSize(f.size_bytes)}</span>
            <span>·</span>
            <span>${fmtRelative(f.uploaded_at)}</span>
            ${channelLabel ? `<span style="margin-left:auto;color:var(--accent-strong)">${channelLabel}</span>` : ''}
          </div>
          <div class="file-actions">
            <a class="file-action" href="/tandem/files/${f.id}?download=1"
               title="Télécharger" target="_blank" rel="noopener">
              <svg width="14" height="14"><use href="#ic-download"/></svg>
            </a>
            ${canDelete ? `
              <button class="file-action is-danger" data-action="delete-file" data-id="${f.id}" title="Supprimer">
                <svg width="14" height="14"><use href="#ic-trash"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    grid.querySelectorAll('[data-action="delete-file"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce fichier ? Cette action est irréversible.')) return;
        const id = btn.dataset.id;
        try {
          await api(`/tandem/api/files/${id}`, { method: 'DELETE' });
          state.files = state.files.filter((f) => f.id !== id);
          renderFilesGrid(state.files);
          toast('Fichier supprimé', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  function renderDrive() {
    return `
      <main class="main">
        <div class="main-head">
          <h2>
            <svg width="18" height="18"><use href="#ic-folder"/></svg>
            Tous les fichiers
          </h2>
          <span class="main-head-meta">Drive partagé de l'équipe — tout fichier uploadé par n'importe quel membre.</span>
        </div>
        <div class="files-grid" id="filesGrid">
          <div class="msg-empty">Chargement…</div>
        </div>
      </main>
    `;
  }

  function renderRail() {
    const ch = state.channels.find((c) => c.id === state.activeChannelId);
    if (!ch) return '';
    return `
      <aside class="rail">
        <div class="rail-head">
          <h3>${escapeHtml(ch.name)}</h3>
          <p>${ch.member_count || state.members.length} membres · ${ch.message_count || 0} messages</p>
        </div>
        <div class="rail-body">
          ${ch.description ? `
            <div class="rail-section">
              <h4>Description</h4>
              <p style="font-size:13px; color:var(--ink-1); margin:0; line-height:1.55;">
                ${escapeHtml(ch.description)}
              </p>
            </div>
          ` : ''}
          <div class="rail-section">
            <h4>Membres (${state.members.length})</h4>
            ${state.members.map((m) => `
              <div class="rail-member">
                <div class="rail-member-avatar" style="background:${m.avatar_color}">
                  ${avatarInitials(m.name)}
                </div>
                <div class="rail-member-info">
                  <div class="rail-member-name">
                    ${escapeHtml(m.name)}
                    ${m.role === 'admin' ? ' <span class="role-pill is-admin" style="margin-left:4px">Admin</span>' : ''}
                  </div>
                  <div class="rail-member-job">${escapeHtml(m.job_title || m.email)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </aside>
    `;
  }

  // ============================================================
  // ADMIN
  // ============================================================
  function renderAdminPane() {
    return `
      <main class="main">
        <div class="main-head">
          <h2>
            <svg width="18" height="18"><use href="#ic-shield"/></svg>
            Administration
          </h2>
          <span class="main-head-meta">Comptes, invitations, statistiques de l'espace.</span>
          <div class="head-tabs">
            <button class="head-tab ${state.adminTab === 'users' ? 'is-active' : ''}" data-action="admin-tab-users">Utilisateurs</button>
            <button class="head-tab ${state.adminTab === 'invites' ? 'is-active' : ''}" data-action="admin-tab-invites">Invitations</button>
          </div>
        </div>
        <div class="admin-pane" id="adminPane">
          <div class="msg-empty">Chargement…</div>
        </div>
      </main>
    `;
  }

  function renderAdminContent() {
    const pane = $('#adminPane');
    if (!pane) return;
    const stats = state.adminStats;
    const statBlock = stats ? `
      <div class="admin-grid">
        <div class="stat-card">
          <div class="stat-card-label">Membres</div>
          <div class="stat-card-value">${stats.users}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Channels</div>
          <div class="stat-card-value">${stats.channels}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Messages</div>
          <div class="stat-card-value">${stats.messages}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Fichiers · ${fmtSize(stats.files_size_bytes)}</div>
          <div class="stat-card-value">${stats.files}</div>
        </div>
      </div>
    ` : '';

    if (state.adminTab === 'users') {
      pane.innerHTML = statBlock + `
        <section class="admin-section">
          <div class="admin-section-head">
            <h3>Comptes (${state.adminUsers.length})</h3>
          </div>
          <table class="admin-table">
            <thead>
              <tr><th>Membre</th><th>Email</th><th>Rôle</th><th>Dernière activité</th><th></th></tr>
            </thead>
            <tbody>
              ${state.adminUsers.map((u) => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div class="user-avatar" style="background:${u.avatar_color};width:28px;height:28px;font-size:11px">
                        ${avatarInitials(u.name)}
                      </div>
                      <div>
                        <div style="font-weight:500">${escapeHtml(u.name)}</div>
                        <div style="font-size:11px;color:var(--ink-2)">${escapeHtml(u.job_title || '—')}</div>
                      </div>
                    </div>
                  </td>
                  <td style="color:var(--ink-1);font-family:var(--font-mono);font-size:12px">${escapeHtml(u.email)}</td>
                  <td><span class="role-pill ${u.role === 'admin' ? 'is-admin' : 'is-member'}">${u.role}</span></td>
                  <td style="color:var(--ink-2);font-size:12px">${u.last_seen ? fmtRelative(u.last_seen) : '—'}</td>
                  <td>
                    ${u.id !== state.user.id ? `
                      <button class="btn-ghost" data-action="toggle-role" data-id="${u.id}" data-role="${u.role}">
                        ${u.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}
                      </button>
                      <button class="btn-ghost" data-action="delete-user" data-id="${u.id}" title="Supprimer" style="color:var(--error)">
                        <svg width="14" height="14"><use href="#ic-trash"/></svg>
                      </button>
                    ` : '<span style="color:var(--ink-3);font-size:12px;font-style:italic">vous</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
      `;
    } else {
      const linkBase = location.origin;
      pane.innerHTML = statBlock + `
        ${state.inviteResult ? renderInviteResult(state.inviteResult, linkBase) : ''}
        <section class="admin-section">
          <div class="admin-section-head">
            <h3>Invitations</h3>
            <button class="btn-secondary" data-action="new-invite">
              <svg width="14" height="14"><use href="#ic-plus"/></svg> Créer une invitation
            </button>
          </div>
          ${state.adminInvites.length === 0 ? `
            <p style="color:var(--ink-2);text-align:center;padding:30px 0">Aucune invitation pour le moment.</p>
          ` : `
            <table class="admin-table">
              <thead>
                <tr><th>Code</th><th>Email</th><th>Rôle</th><th>État</th><th>Expire</th><th></th></tr>
              </thead>
              <tbody>
                ${state.adminInvites.map((i) => `
                  <tr class="invite-row">
                    <td><code>${i.code}</code></td>
                    <td style="color:var(--ink-1)">${escapeHtml(i.email || '—')}</td>
                    <td><span class="role-pill ${i.role === 'admin' ? 'is-admin' : 'is-member'}">${i.role}</span></td>
                    <td>
                      ${i.used_by ? `<span style="color:var(--ok);font-size:12px">Utilisé par ${escapeHtml(i.used_by_name || 'inconnu')}</span>`
                                 : i.expires_at < (Date.now() / 1000) ? '<span style="color:var(--ink-3);font-size:12px">Expiré</span>'
                                 : '<span style="color:var(--accent-strong);font-size:12px">Disponible</span>'}
                    </td>
                    <td style="color:var(--ink-2);font-size:12px">${fmtRelative(i.expires_at)}</td>
                    <td>
                      <button class="btn-ghost" data-action="copy-invite" data-id="${i.id}" data-code="${i.code}" title="Copier le lien">
                        <svg width="14" height="14"><use href="#ic-copy"/></svg>
                      </button>
                      <button class="btn-ghost" data-action="delete-invite" data-id="${i.id}" title="Supprimer" style="color:var(--error)">
                        <svg width="14" height="14"><use href="#ic-trash"/></svg>
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </section>
      `;
    }
    bindAdminEvents();
  }

  function renderInviteResult(inv, linkBase) {
    const link = `${linkBase}/tandem?invite=${inv.id}&code=${inv.code}`;
    return `
      <div class="invite-result">
        <h4><svg width="14" height="14" style="color:var(--accent-strong)"><use href="#ic-link"/></svg> Lien d'invitation créé</h4>
        <div class="invite-line">
          <span>Code</span>
          <strong><code>${inv.code}</code></strong>
        </div>
        <div class="invite-line">
          <span>Rôle</span>
          <strong><span class="role-pill ${inv.role === 'admin' ? 'is-admin' : 'is-member'}">${inv.role}</span></strong>
        </div>
        <div class="invite-line">
          <span>Lien à partager</span>
        </div>
        <div class="invite-link-box">
          <span style="flex:1">${escapeHtml(link)}</span>
          <button data-action="copy-result" data-link="${escapeHtml(link)}">Copier</button>
        </div>
        <button class="btn-ghost" data-action="dismiss-invite-result" style="margin-top:10px">OK</button>
      </div>
    `;
  }

  function bindAdminEvents() {
    $$('[data-action="toggle-role"]').forEach((b) => {
      b.addEventListener('click', async () => {
        const role = b.dataset.role === 'admin' ? 'member' : 'admin';
        try {
          await api(`/tandem/api/admin/users/${b.dataset.id}`, {
            method: 'PATCH', body: { role },
          });
          await loadAdminUsers();
          renderAdminContent();
          toast('Rôle mis à jour', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    $$('[data-action="delete-user"]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Supprimer ce membre ? Tous ses messages et fichiers resteront mais sans auteur.')) return;
        try {
          await api(`/tandem/api/admin/users/${b.dataset.id}`, { method: 'DELETE' });
          await loadAdminUsers();
          renderAdminContent();
          toast('Membre supprimé', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    $$('[data-action="new-invite"]').forEach((b) => {
      b.addEventListener('click', () => openInviteModal());
    });
    $$('[data-action="delete-invite"]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Supprimer cette invitation ?')) return;
        try {
          await api(`/tandem/api/admin/invites/${b.dataset.id}`, { method: 'DELETE' });
          await loadAdminInvites();
          renderAdminContent();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    $$('[data-action="copy-invite"]').forEach((b) => {
      b.addEventListener('click', async () => {
        const link = `${location.origin}/tandem?invite=${b.dataset.id}&code=${b.dataset.code}`;
        await copyToClipboard(link);
        toast('Lien copié', 'ok');
      });
    });
    $$('[data-action="copy-result"]').forEach((b) => {
      b.addEventListener('click', async () => {
        await copyToClipboard(b.dataset.link);
        toast('Lien copié', 'ok');
      });
    });
    $$('[data-action="dismiss-invite-result"]').forEach((b) => {
      b.addEventListener('click', () => {
        state.inviteResult = null;
        renderAdminContent();
      });
    });
    $$('[data-action="admin-tab-users"]').forEach((b) => {
      b.addEventListener('click', async () => {
        state.adminTab = 'users';
        await loadAdminUsers();
        await loadStats();
        renderApp();
        renderAdminContent();
      });
    });
    $$('[data-action="admin-tab-invites"]').forEach((b) => {
      b.addEventListener('click', async () => {
        state.adminTab = 'invites';
        await loadAdminInvites();
        await loadStats();
        renderApp();
        renderAdminContent();
      });
    });
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  // ============================================================
  // EVENTS — app
  // ============================================================
  function bindAppEvents() {
    $$('[data-action="open-channel"]').forEach((b) => {
      b.addEventListener('click', async () => {
        state.activeChannelId = b.dataset.channelId;
        state.activeTab = 'chat';
        try {
          await loadMessages();
          await loadMembers();
        } catch (e) { toast(e.message, 'error'); }
        renderApp();
      });
    });
    $$('[data-action="open-drive"]').forEach((b) => {
      b.addEventListener('click', async () => {
        state.activeTab = 'drive';
        renderApp();
        try {
          await loadAllFiles();
          renderFilesGrid(state.files);
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    $$('[data-action="open-admin"]').forEach((b) => {
      b.addEventListener('click', async () => {
        state.activeTab = 'admin';
        renderApp();
        try {
          await Promise.all([loadAdminUsers(), loadStats()]);
          if (state.adminTab === 'invites') await loadAdminInvites();
          renderAdminContent();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    $$('[data-action="tab-chat"]').forEach((b) => {
      b.addEventListener('click', async () => {
        state.activeTab = 'chat';
        renderApp();
      });
    });
    $$('[data-action="tab-files"]').forEach((b) => {
      b.addEventListener('click', async () => {
        state.activeTab = 'files';
        renderApp();
        try {
          await loadChannelFiles();
          renderFilesGrid(state.files);
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    $$('[data-action="logout"]').forEach((b) => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api('/tandem/api/auth/logout', { method: 'POST' });
        } catch {}
        stopPolling();
        state.user = null;
        state.view = 'login';
        renderLogin();
      });
    });
    $$('[data-action="open-profile"]').forEach((b) => {
      b.addEventListener('click', () => openProfileModal());
    });
    $$('[data-action="btnNewChannel"], [data-action="new-channel"]').forEach((b) => {
      b.addEventListener('click', () => openChannelModal());
    });
    $$('[data-action="delete-channel"]').forEach((b) => {
      b.addEventListener('click', async () => {
        const ch = state.channels.find((c) => c.id === state.activeChannelId);
        if (!ch) return;
        if (!confirm(`Supprimer le channel #${ch.slug} ? Les messages et l'historique seront perdus.`)) return;
        try {
          await api(`/tandem/api/channels/${ch.id}`, { method: 'DELETE' });
          state.channels = state.channels.filter((c) => c.id !== ch.id);
          state.activeChannelId = state.channels[0]?.id || null;
          if (state.activeChannelId) {
            await loadMessages();
            await loadMembers();
          }
          renderApp();
          toast('Channel supprimé', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    // Composer
    const input = $('#composerInput');
    if (input) {
      const send = $('#btnSend');
      const updateBtn = () => {
        send.disabled = !(input.value.trim() || state.pendingFile);
      };
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(200, input.scrollHeight) + 'px';
        updateBtn();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!send.disabled) sendMessage();
        }
      });
      send.addEventListener('click', sendMessage);
      updateBtn();
      setTimeout(() => input.focus(), 50);
    }

    // New button #btnNewChannel
    const btnNewCh = $('#btnNewChannel');
    if (btnNewCh) btnNewCh.addEventListener('click', () => openChannelModal());

    // Attach
    const attachBtn = document.querySelector('[data-action="attach-file"]');
    const hidden = $('#hiddenFileInput');
    if (attachBtn && hidden) {
      attachBtn.addEventListener('click', () => hidden.click());
      hidden.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        await uploadFile(f);
        hidden.value = '';
      });
    }
    const cancelPending = document.querySelector('[data-action="cancel-pending"]');
    if (cancelPending) {
      cancelPending.addEventListener('click', () => {
        // Le fichier est déjà sur le serveur ; on l'oublie côté UI.
        // Pour un vrai cleanup il faudrait un DELETE — pour ce MVP c'est OK.
        state.pendingFile = null;
        renderApp();
      });
    }

    // Drag-drop sur la zone messages
    const body = $('#mainBody');
    const overlay = $('#dropOverlay');
    if (body && overlay && state.activeTab === 'chat') {
      let depth = 0;
      body.addEventListener('dragenter', (e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        depth++;
        overlay.classList.add('is-active');
      });
      body.addEventListener('dragleave', () => {
        depth--;
        if (depth <= 0) {
          depth = 0;
          overlay.classList.remove('is-active');
        }
      });
      body.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      body.addEventListener('drop', async (e) => {
        e.preventDefault();
        depth = 0;
        overlay.classList.remove('is-active');
        const f = e.dataTransfer?.files?.[0];
        if (f) await uploadFile(f);
      });
    }
  }

  async function uploadFile(file) {
    if (file.size > 16 * 1024 * 1024) {
      toast('Fichier trop lourd (max 16 Mo)', 'error');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    if (state.activeChannelId) fd.append('channel_id', state.activeChannelId);
    try {
      const r = await api('/tandem/api/files', { method: 'POST', body: fd });
      state.pendingFile = r.file;
      toast('Fichier prêt à envoyer', 'ok');
      renderApp();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function sendMessage() {
    const input = $('#composerInput');
    if (!input) return;
    const body = input.value.trim();
    const fileId = state.pendingFile?.id || null;
    if (!body && !fileId) return;
    const send = $('#btnSend');
    send.disabled = true;
    try {
      const r = await api(`/tandem/api/channels/${state.activeChannelId}/messages`, {
        method: 'POST', body: { body, file_id: fileId },
      });
      state.messages.push(r.message);
      state.pendingFile = null;
      input.value = '';
      input.style.height = 'auto';
      renderApp();
    } catch (e) {
      toast(e.message, 'error');
      send.disabled = false;
    }
  }

  // ============================================================
  // MODALS
  // ============================================================
  function openModal(html) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-overlay">${html}</div>`;
    const overlay = root.querySelector('.modal-overlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
  }

  function openChannelModal() {
    openModal(`
      <div class="modal">
        <div class="modal-head">
          <h2>Créer un channel</h2>
          <button class="modal-close" data-close><svg width="16" height="16"><use href="#ic-x"/></svg></button>
        </div>
        <form id="chForm">
          <div class="modal-body">
            <div class="field">
              <label>Nom</label>
              <input type="text" id="chName" required maxlength="60" placeholder="Ex : Marketing, Sprint 14, Roadmap…">
            </div>
            <div class="field">
              <label>Description</label>
              <textarea id="chDesc" maxlength="500" placeholder="À quoi sert ce channel ? (optionnel)"></textarea>
            </div>
            <div class="field">
              <label>Type</label>
              <select id="chKind">
                <option value="channel">Channel ouvert (tout le monde peut écrire)</option>
                <option value="announcement">Annonces (lecture seule pour les membres)</option>
              </select>
              <span class="field-help">Les channels sont publics par défaut — tous les membres y sont automatiquement ajoutés.</span>
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn-secondary" data-close>Annuler</button>
            <button type="submit" class="btn-primary" style="width:auto">Créer le channel</button>
          </div>
        </form>
      </div>
    `);
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    $('#chForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/tandem/api/channels', {
          method: 'POST',
          body: {
            name: $('#chName').value,
            description: $('#chDesc').value,
            kind: $('#chKind').value,
          },
        });
        await loadChannels();
        state.activeChannelId = r.channel.id;
        state.activeTab = 'chat';
        await loadMessages();
        await loadMembers();
        closeModal();
        renderApp();
        toast('Channel créé · #' + r.channel.slug, 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
    setTimeout(() => $('#chName')?.focus(), 80);
  }

  function openInviteModal() {
    openModal(`
      <div class="modal">
        <div class="modal-head">
          <h2>Créer une invitation</h2>
          <button class="modal-close" data-close><svg width="16" height="16"><use href="#ic-x"/></svg></button>
        </div>
        <form id="invForm">
          <div class="modal-body">
            <div class="field">
              <label>Email pré-rempli (optionnel)</label>
              <input type="email" id="invEmail" placeholder="vous@equipe.fr">
            </div>
            <div class="field-row">
              <div class="field">
                <label>Rôle</label>
                <select id="invRole">
                  <option value="member">Membre</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
              <div class="field">
                <label>Validité</label>
                <select id="invTtl">
                  <option value="24">24 heures</option>
                  <option value="72">3 jours</option>
                  <option value="168" selected>7 jours</option>
                  <option value="720">30 jours</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label>Note interne (optionnelle)</label>
              <input type="text" id="invNote" placeholder="Ex : « Sandra, designer freelance »">
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn-secondary" data-close>Annuler</button>
            <button type="submit" class="btn-primary" style="width:auto">Créer l'invitation</button>
          </div>
        </form>
      </div>
    `);
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    $('#invForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/tandem/api/admin/invites', {
          method: 'POST',
          body: {
            email: $('#invEmail').value,
            role: $('#invRole').value,
            ttl_hours: parseInt($('#invTtl').value, 10),
            note: $('#invNote').value,
          },
        });
        state.inviteResult = r.invite;
        await loadAdminInvites();
        closeModal();
        renderAdminContent();
        toast('Invitation créée', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openProfileModal() {
    const u = state.user;
    openModal(`
      <div class="modal">
        <div class="modal-head">
          <h2>Profil & sécurité</h2>
          <button class="modal-close" data-close><svg width="16" height="16"><use href="#ic-x"/></svg></button>
        </div>
        <div class="modal-body">
          <form id="profForm">
            <div class="field">
              <label>Nom</label>
              <input type="text" id="pfName" required value="${escapeHtml(u.name)}" maxlength="60">
            </div>
            <div class="field">
              <label>Poste / fonction</label>
              <input type="text" id="pfJob" value="${escapeHtml(u.job_title || '')}" maxlength="80">
            </div>
            <div class="field">
              <label>Email</label>
              <input type="email" disabled value="${escapeHtml(u.email)}" style="opacity:0.6">
              <span class="field-help">L'email ne peut pas être modifié.</span>
            </div>
            <button type="submit" class="btn-primary" style="width:auto">Enregistrer</button>
          </form>

          <hr style="border:none;border-top:1px solid var(--line);margin:24px 0">

          <form id="pwForm">
            <div class="field">
              <label>Changer le mot de passe</label>
              <input type="password" id="pwOld" placeholder="Mot de passe actuel">
            </div>
            <div class="field">
              <input type="password" id="pwNew" placeholder="Nouveau mot de passe (min. 6)" minlength="6">
            </div>
            <button type="submit" class="btn-secondary" style="width:auto">Mettre à jour le mot de passe</button>
          </form>
        </div>
      </div>
    `);
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    $('#profForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/tandem/api/auth/profile', {
          method: 'PATCH',
          body: { name: $('#pfName').value, job_title: $('#pfJob').value },
        });
        state.user = r.user;
        toast('Profil mis à jour', 'ok');
        closeModal();
        renderApp();
      } catch (e) { toast(e.message, 'error'); }
    });
    $('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/tandem/api/auth/change-password', {
          method: 'POST',
          body: { old_password: $('#pwOld').value, new_password: $('#pwNew').value },
        });
        toast('Mot de passe mis à jour', 'ok');
        closeModal();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // ESC ferme la modale
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ------------------------------------------------------------------
  // GO
  // ------------------------------------------------------------------
  boot();
})();
