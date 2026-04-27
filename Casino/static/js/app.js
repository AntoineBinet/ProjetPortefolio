/**
 * app.js — Point d'entrée du SPA Casino.
 *
 * Routes (hash) :
 *   #/                   accueil
 *   #/play               solo (1 humain + 5 bots)
 *   #/host               hôte multijoueur (création)
 *   #/join/<CODE>        rejoint une room par lien
 *   #/lobby              lobby multijoueur (post-création)
 */

import { createGame, startHand, advance, applyAction, legalActions, liveCount } from "./engine.js";
import { botDecide, botDelay } from "./ai.js";
import { mountGameView, renderGame, showResult, toast, openModal, formatChips } from "./ui.js";
import { NetClient, inviteUrl } from "./multiplayer.js";
import { renderQR, renderAvatar } from "./svg-assets.js";

/* ── État global du SPA ──────────────────────────────────── */

const state = {
  mode: null,            // 'solo' | 'multi-host' | 'multi-guest'
  game: null,
  view: null,
  heroId: null,
  net: null,
  settings: loadSettings(),
};

const SETTINGS_KEY = "casino.settings.v1";
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {}
  return defaultSettings();
}
function defaultSettings() {
  return {
    startingStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
    aiDifficulty: "medium",
    actionTimeout: 15,
    sound: true,
    confirmAllin: true,
    showOdds: false,
    autoMuck: true,
    name: "Toi",
  };
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
}

/* ── Routing ─────────────────────────────────────────────── */

function route() {
  const hash = location.hash || "#/";
  const root = document.getElementById("app");

  // Cleanup
  if (state.net) {
    if (!hash.startsWith("#/lobby") && !hash.startsWith("#/play")) {
      state.net.leave();
      state.net = null;
    }
  }

  if (hash === "#/" || hash === "") return renderHome(root);
  if (hash === "#/play")            return startSolo(root);
  if (hash === "#/host")            return renderHostForm(root);
  if (hash.startsWith("#/join/"))   return renderJoinFlow(root, hash.slice(7));
  if (hash === "#/lobby")           return renderLobby(root);
  return renderHome(root);
}

window.addEventListener("hashchange", route);

/* ── Vue Home ────────────────────────────────────────────── */

function renderHome(root) {
  root.innerHTML = `
    <section class="home" data-view="home">
      <div class="home-card glass">
        <div class="home-eyebrow">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-3.5 4.5-7 7-4 10 1.2.8 2.8.4 4-.8 1.2 1.2 2.8 1.6 4 .8 3-3-.5-5.5-4-10z"/></svg>
          <span>Texas Hold'em · No-Limit</span>
        </div>
        <h1 class="home-title">La table.<br><em>Comme à la maison.</em></h1>
        <p class="home-tagline">Solo contre cinq IA, ou en privé entre amis. Six joueurs max. Blinds, tapis, niveau IA — tout est réglable.</p>

        <div class="home-actions">
          <button class="btn btn--primary" data-act="play-solo">Jouer en solo</button>
          <div class="home-divider">ou en privé</div>
          <button class="btn" data-act="host">Créer une partie</button>
          <button class="btn btn--ghost" data-act="join">J'ai un code</button>
        </div>

        <div class="home-foot">Chaque partie a un code unique. Seules les personnes ayant le code peuvent y accéder — rien n'est public.</div>
      </div>
    </section>
  `;

  root.querySelector('[data-act="play-solo"]').addEventListener("click", () => location.hash = "#/play");
  root.querySelector('[data-act="host"]').addEventListener("click", () => location.hash = "#/host");
  root.querySelector('[data-act="join"]').addEventListener("click", () => askJoinCode());
}

function askJoinCode() {
  openModal(`
    <h2>Rejoindre une partie</h2>
    <p>Saisis le code à 6 caractères que ton hôte t'a transmis.</p>
    <div class="field">
      <label>Code d'invitation</label>
      <input type="text" class="input input--code" id="codeInput" maxlength="6" autocomplete="off" placeholder="A B C D E F">
    </div>
    <div class="field" style="margin-top:14px">
      <label>Ton pseudo</label>
      <input type="text" class="input" id="nameInput" maxlength="18" placeholder="Antoine" value="${escAttr(state.settings.name)}">
    </div>
    <div class="modal-row">
      <button class="btn btn--primary btn--full" id="goJoin">Rejoindre</button>
    </div>
  `);
  const codeInput = document.getElementById("codeInput");
  const nameInput = document.getElementById("nameInput");
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z2-9]/g, "");
  });
  document.getElementById("goJoin").addEventListener("click", () => {
    const code = codeInput.value.trim();
    const name = nameInput.value.trim() || "Joueur";
    if (code.length !== 6) { toast("Code invalide", "err"); return; }
    state.settings.name = name; saveSettings();
    location.hash = `#/join/${code}`;
  });
  setTimeout(() => codeInput.focus(), 100);
}

/* ── Solo ────────────────────────────────────────────────── */

function startSolo(root) {
  state.mode = "solo";
  const players = [
    { id: "hero", name: state.settings.name || "Toi", stack: state.settings.startingStack, isBot: false },
    { id: "bot1", name: "Vega",  stack: state.settings.startingStack, isBot: true, persona: "vega",  difficulty: state.settings.aiDifficulty },
    { id: "bot2", name: "Nova",  stack: state.settings.startingStack, isBot: true, persona: "nova",  difficulty: state.settings.aiDifficulty },
    { id: "bot3", name: "Atlas", stack: state.settings.startingStack, isBot: true, persona: "atlas", difficulty: state.settings.aiDifficulty },
    { id: "bot4", name: "Echo",  stack: state.settings.startingStack, isBot: true, persona: "echo",  difficulty: state.settings.aiDifficulty },
    { id: "bot5", name: "Rune",  stack: state.settings.startingStack, isBot: true, persona: "rune",  difficulty: state.settings.aiDifficulty },
  ];
  state.heroId = "hero";
  state.game = createGame(players, { sb: state.settings.smallBlind, bb: state.settings.bigBlind });
  state.view = mountGameView(root, { heroId: state.heroId });
  attachGameHandlers(state.view);

  startHand(state.game);
  renderGame(state.view, state.game, { heroId: state.heroId });
  scheduleNextTurn();
}

/* ── Hôte multi : formulaire ─────────────────────────────── */

function renderHostForm(root) {
  root.innerHTML = `
    <section class="lobby">
      <button class="btn btn--ghost btn--sm home-back" data-act="back">← Retour</button>
      <div class="lobby-card glass">
        <div class="lobby-header">
          <div class="lobby-eyebrow">Créer une partie privée</div>
          <h2 style="font-family:var(--font-display);font-weight:700;letter-spacing:-0.02em;font-size:32px;margin:6px 0">Configure ta room</h2>
          <p style="color:var(--ink-soft);margin:0">Tu obtiendras un code à partager. Seules les personnes ayant ce code pourront te rejoindre.</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label>Ton pseudo</label>
            <input class="input" id="hostName" maxlength="18" value="${escAttr(state.settings.name)}"></div>
          <div class="field"><label>Joueurs max</label>
            <input class="input" id="hostMax" type="number" min="2" max="6" value="6"></div>
          <div class="field"><label>Small blind</label>
            <input class="input" id="hostSB" type="number" min="1" value="${state.settings.smallBlind}"></div>
          <div class="field"><label>Big blind</label>
            <input class="input" id="hostBB" type="number" min="2" value="${state.settings.bigBlind}"></div>
          <div class="field" style="grid-column:1/-1"><label>Tapis de départ</label>
            <input class="input" id="hostStack" type="number" min="100" value="${state.settings.startingStack}"></div>
        </div>

        <div class="lobby-actions">
          <button class="btn btn--primary" id="goCreate">Créer la room</button>
          <button class="btn btn--ghost" data-act="back">Annuler</button>
        </div>
      </div>
    </section>
  `;
  root.querySelectorAll('[data-act="back"]').forEach(b => b.addEventListener("click", () => history.back()));
  document.getElementById("goCreate").addEventListener("click", async () => {
    const name = document.getElementById("hostName").value.trim() || "Hôte";
    const max  = parseInt(document.getElementById("hostMax").value, 10) || 6;
    const sb   = parseInt(document.getElementById("hostSB").value, 10) || 10;
    const bb   = parseInt(document.getElementById("hostBB").value, 10) || 20;
    const st   = parseInt(document.getElementById("hostStack").value, 10) || 2000;

    state.settings.name = name;
    state.settings.smallBlind = sb;
    state.settings.bigBlind = bb;
    state.settings.startingStack = st;
    saveSettings();

    try {
      state.net = new NetClient();
      const data = await state.net.create(name, {
        max_players: max, small_blind: sb, big_blind: bb, starting_stack: st,
      });
      state.heroId = data.host_id;
      state.mode = "multi-host";
      state.lobbyData = data.room;
      attachLobbyEvents();
      location.hash = "#/lobby";
    } catch (e) {
      toast(e.message || "Erreur", "err");
    }
  });
}

/* ── Lobby ───────────────────────────────────────────────── */

function renderLobby(root) {
  if (!state.net || !state.lobbyData) {
    location.hash = "#/";
    return;
  }
  const data = state.lobbyData;
  const url = inviteUrl(data.code);
  const isHost = state.net.isHost;

  root.innerHTML = `
    <section class="lobby">
      <button class="btn btn--ghost btn--sm home-back" data-act="leave">← Quitter</button>
      <div class="lobby-card glass">
        <div class="lobby-header">
          <div class="lobby-eyebrow">${isHost ? "Tu es l'hôte · Partage le code" : "En attente du lancement"}</div>
          <div class="lobby-code">${data.code}</div>
        </div>

        <div class="qr">${renderQR(url)}</div>

        <div class="lobby-link">
          <span>${url}</span>
          <button class="btn btn--sm" id="copyLink">Copier</button>
        </div>

        <div class="lobby-players" id="players"></div>

        <div class="lobby-actions">
          ${isHost
            ? `<button class="btn btn--primary" id="goStart" disabled>Lancer la partie</button>`
            : `<button class="btn btn--primary" id="goReady">Je suis prêt</button>`}
          <button class="btn btn--ghost" data-act="leave">Quitter</button>
        </div>
        <p style="color:var(--ink-mute);font-size:12px;margin-top:14px;text-align:center">
          ${isHost ? "Min. 2 joueurs requis. Les autres voient le code mais pas ton portfolio." : "Attends que l'hôte lance la partie."}
        </p>
      </div>
    </section>
  `;

  refreshLobbyPlayers();

  document.getElementById("copyLink")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url); toast("Lien copié", "ok"); }
    catch { toast("Impossible de copier", "err"); }
  });
  root.querySelectorAll('[data-act="leave"]').forEach(b =>
    b.addEventListener("click", async () => {
      await state.net?.leave();
      location.hash = "#/";
    }));
  document.getElementById("goStart")?.addEventListener("click", async () => {
    const r = await state.net.start();
    if (!r.ok) toast(r.error || "Erreur", "err");
  });
  document.getElementById("goReady")?.addEventListener("click", async () => {
    await state.net.ready(true);
    document.getElementById("goReady").textContent = "Prêt ✓";
    document.getElementById("goReady").disabled = true;
  });
}

function refreshLobbyPlayers() {
  const ul = document.getElementById("players");
  if (!ul || !state.lobbyData) return;
  const players = state.lobbyData.players || [];
  ul.innerHTML = players.map((p, i) => {
    const me = p.id === state.net?.playerId;
    const cls = `lobby-player${p.is_host ? " is-host" : ""}${me ? " is-self" : ""}`;
    return `<div class="${cls}">
      <div style="width:36px;height:36px;flex-shrink:0">${renderAvatar(i)}</div>
      <div style="flex:1;font-weight:600;letter-spacing:-0.01em">${escapeHtml(p.name)}${me ? `<span style="color:var(--ink-mute);font-weight:500;font-size:12px;margin-left:6px">· toi</span>` : ""}</div>
      ${p.is_host ? `<span class="lobby-pill lobby-pill--host">HÔTE</span>` :
        p.ready ? `<span class="lobby-pill lobby-pill--ready">PRÊT</span>` :
        `<span class="lobby-pill">EN ATTENTE</span>`}
    </div>`;
  }).join("");

  // Activer le bouton lancer si ≥ 2 joueurs
  const btn = document.getElementById("goStart");
  if (btn) btn.disabled = players.length < 2;
}

function attachLobbyEvents() {
  if (!state.net) return;
  state.net.addEventListener("event", (e) => {
    const evt = e.detail;
    if (evt.type === "room") state.lobbyData = evt.room;
    if (evt.type === "hello") state.lobbyData = evt.room;
    if (evt.type === "player_joined" || evt.type === "player_left" || evt.type === "player_ready") {
      // Refetch full
      state.net.fetchRoom(state.net.code).then(d => {
        if (d.ok) { state.lobbyData = d.room; refreshLobbyPlayers(); }
      });
    }
    if (evt.type === "game_start") {
      startMultiplayerGame();
    }
    if (evt.type === "state") {
      // Snapshot d'état diffusé par l'hôte
      applyRemoteState(evt.payload);
    }
    if (evt.type === "private") {
      // Hole cards privées
      applyPrivateState(evt.payload);
    }
    if (evt.type === "action" && state.net.isHost) {
      // Un joueur soumet une action — l'hôte la valide et applique
      handleRemoteAction(evt.from, evt.payload);
    }
  });
}

/* ── Rejoint via lien ────────────────────────────────────── */

async function renderJoinFlow(root, code) {
  code = (code || "").toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (code.length !== 6) {
    toast("Code invalide", "err");
    location.hash = "#/";
    return;
  }
  const name = state.settings.name || "Joueur";
  // Demander le pseudo si pas encore défini
  if (!state.settings.name || state.settings.name === "Toi") {
    openModal(`
      <h2>Rejoindre la partie</h2>
      <p>Code : <strong style="font-family:var(--font-mono);letter-spacing:.2em">${code}</strong></p>
      <div class="field">
        <label>Ton pseudo</label>
        <input class="input" id="joinName" maxlength="18" value="${escAttr(name)}">
      </div>
      <div class="modal-row">
        <button class="btn btn--primary btn--full" id="goJoinNow">Rejoindre</button>
      </div>
    `, { closeOnBackdrop: false });
    document.getElementById("goJoinNow").addEventListener("click", () => {
      const n = document.getElementById("joinName").value.trim() || "Joueur";
      state.settings.name = n; saveSettings();
      document.getElementById("modal-root").innerHTML = "";
      doJoin(code, n);
    });
    return;
  }
  doJoin(code, name);
}

async function doJoin(code, name) {
  try {
    state.net = new NetClient();
    const data = await state.net.join(code, name);
    state.heroId = data.player_id;
    state.mode = "multi-guest";
    state.lobbyData = data.room;
    attachLobbyEvents();
    location.hash = "#/lobby";
  } catch (e) {
    toast(e.message || "Impossible de rejoindre", "err");
    location.hash = "#/";
  }
}

/* ── Démarrage partie multi (autorité = hôte) ───────────── */

function startMultiplayerGame() {
  const root = document.getElementById("app");
  if (state.net?.isHost) {
    // L'hôte construit la game state à partir du lobby
    const players = state.lobbyData.players.map(p => ({
      id: p.id, name: p.name, stack: state.lobbyData.starting_stack, isBot: false,
    }));
    state.game = createGame(players, {
      sb: state.lobbyData.blinds[0],
      bb: state.lobbyData.blinds[1],
    });
    state.view = mountGameView(root, { heroId: state.heroId });
    attachGameHandlers(state.view);
    startHand(state.game);
    broadcastFullState();
    renderGame(state.view, state.game, { heroId: state.heroId });
    scheduleNextTurn();
  } else {
    // Invité : attend le 1er state
    state.view = mountGameView(root, { heroId: state.heroId });
    attachGameHandlers(state.view);
    state.view.actionsBox.innerHTML = `<div style="padding:14px;text-align:center;color:var(--ink-mute)">Connexion à la partie…</div>`;
  }
}

/* ── Boucle de tour (solo + hôte multi) ──────────────────── */

function scheduleNextTurn() {
  if (!state.game) return;
  const g = state.game;

  if (g.phase === "ended") {
    showResult(state.view, g.lastResult);
    setTimeout(() => {
      // Nouvelle main si ≥ 2 joueurs avec stack > 0
      const standing = g.players.filter(p => p.stack > 0).length;
      if (standing >= 2) {
        startHand(g);
        if (state.mode === "multi-host") broadcastFullState();
        renderGame(state.view, g, { heroId: state.heroId });
        scheduleNextTurn();
      } else {
        // Partie terminée
        const winner = g.players.find(p => p.stack > 0);
        toast(`${winner?.name || "Personne"} remporte la partie`, "ok", 4000);
      }
    }, 3000);
    return;
  }

  if (g.phase === "showdown") {
    return;        // géré par advance qui passe à "ended"
  }

  const active = g.players[g.activeIdx];
  if (!active) return;

  // Si solo : bots jouent automatiquement
  if (state.mode === "solo" && active.isBot) {
    const legal = legalActions(g);
    setTimeout(() => {
      const action = botDecide(g, g.activeIdx, legal);
      executeAction(action);
    }, botDelay(active.difficulty));
    return;
  }

  // Si multi-host : autorité, fait jouer les bots locaux (s'il y en a)
  // Sinon, attend l'action du joueur courant via SSE.
  if (state.mode === "multi-host") {
    if (active.id === state.heroId) {
      // attend que le joueur clique
    } else {
      // attend que l'autre joueur envoie une action via "action" event
    }
    return;
  }

  // Multi-guest : si c'est mon tour, j'envoie au serveur dès que je clique
  // Sinon j'attends.
}

function executeAction(action) {
  const g = state.game;
  const r = applyAction(g, action);
  if (!r.ok) { toast(r.error, "err"); return; }
  const advR = advance(g);

  if (state.mode === "multi-host") {
    broadcastFullState();
  }
  renderGame(state.view, g, { heroId: state.heroId });

  if (advR.event && g.phase === "ended") {
    showResult(state.view, advR.event);
  }
  scheduleNextTurn();
}

function handleRemoteAction(fromPlayerId, payload) {
  const g = state.game;
  if (!g) return;
  // Vérifie que c'est bien à ce joueur de jouer
  const active = g.players[g.activeIdx];
  if (!active || active.id !== fromPlayerId) {
    return; // ignore
  }
  executeAction(payload);
}

/* ── Diffusion de l'état (autorité = hôte) ───────────────── */

function broadcastFullState() {
  if (!state.net || !state.net.isHost || !state.game) return;
  const g = state.game;
  // État public (sans hole cards)
  const publicState = {
    phase: g.phase,
    pot: g.pot,
    currentBet: g.currentBet,
    minRaise: g.minRaise,
    dealerIdx: g.dealerIdx,
    activeIdx: g.activeIdx,
    handNumber: g.handNumber,
    sb: g.sb, bb: g.bb,
    community: Array.from(g.community || []),
    players: g.players.map(p => ({
      id: p.id, name: p.name, stack: p.stack,
      currentBet: p.currentBet, contributed: p.contributed,
      folded: p.folded, allIn: p.allIn, sittingOut: p.sittingOut,
      hasActed: p.hasActed,
      // Hole cards : visibles seulement pour le destinataire (envoyées à part)
      hasHoleCards: p.holeCards && p.holeCards.length === 2,
      // Au showdown, on les rend publiques
      holeCards: g.phase === "showdown" || g.phase === "ended" ? Array.from(p.holeCards || []) : null,
    })),
    lastResult: g.lastResult || null,
  };
  state.net.send("state", publicState);

  // Hole cards privées par joueur
  for (const p of g.players) {
    if (p.id === state.heroId) continue;
    if (p.holeCards && p.holeCards.length) {
      state.net.send("private", {
        kind: "hole_cards",
        cards: Array.from(p.holeCards),
        handNumber: g.handNumber,
      }, p.id);
    }
  }
}

function applyRemoteState(s) {
  if (state.mode !== "multi-guest") return;
  // Reconstruit un état "lecture seule" à partir du snapshot
  if (!state.game) {
    state.game = {
      players: s.players.map(p => ({ ...p, holeCards: [], isBot: false })),
      community: s.community || [],
      pot: s.pot, currentBet: s.currentBet, minRaise: s.minRaise,
      dealerIdx: s.dealerIdx, activeIdx: s.activeIdx, handNumber: s.handNumber,
      sb: s.sb, bb: s.bb, phase: s.phase,
      lastResult: s.lastResult,
      history: [],
    };
  } else {
    Object.assign(state.game, {
      pot: s.pot, currentBet: s.currentBet, minRaise: s.minRaise,
      dealerIdx: s.dealerIdx, activeIdx: s.activeIdx, handNumber: s.handNumber,
      community: s.community, sb: s.sb, bb: s.bb, phase: s.phase,
      lastResult: s.lastResult,
    });
    // Met à jour les joueurs (en gardant les hole cards locales du héros)
    for (const sp of s.players) {
      const lp = state.game.players.find(p => p.id === sp.id);
      if (!lp) {
        state.game.players.push({ ...sp, holeCards: sp.holeCards || [] });
      } else {
        const keepHole = lp.id === state.heroId ? lp.holeCards : (sp.holeCards || []);
        Object.assign(lp, sp);
        lp.holeCards = sp.holeCards && sp.holeCards.length ? sp.holeCards : keepHole;
      }
    }
  }
  if (state.view) {
    renderGame(state.view, state.game, { heroId: state.heroId });
    if (s.phase === "ended" && s.lastResult) showResult(state.view, s.lastResult);
  }
}

function applyPrivateState(p) {
  if (p.kind === "hole_cards" && state.game) {
    const hero = state.game.players.find(pl => pl.id === state.heroId);
    if (hero) {
      hero.holeCards = p.cards;
      if (state.view) renderGame(state.view, state.game, { heroId: state.heroId });
    }
  }
}

/* ── Handlers de la vue jeu ──────────────────────────────── */

function attachGameHandlers(view) {
  view.root.addEventListener("click", (e) => {
    const t = e.target;
    // 1. Bouton d'action de jeu (fold/check/call/raise/bet/allin) — prioritaire
    const ab = t.closest(".action-btn");
    if (ab) { onActionButton(ab); return; }

    // 2. Boutons système (menu, settings, historique)
    const sysAct = t.closest("[data-act]")?.dataset.act;
    if (sysAct === "leave") {
      if (state.net) state.net.leave();
      location.hash = "#/";
    } else if (sysAct === "settings") {
      openSettings();
    } else if (sysAct === "history") {
      view.historyDrawer.classList.toggle("is-open");
      renderHistoryDrawer(view);
    }
  });

  // Raccourcis clavier
  document.addEventListener("keydown", onKey);
}

function onKey(e) {
  if (!state.game) return;
  const view = state.view;
  if (!view) return;
  // Évite si une input a le focus
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

  const isHeroTurn = state.game.activeIdx === state.game.players.findIndex(p => p.id === state.heroId);
  if (!isHeroTurn) return;

  if (e.key === "f" || e.key === "F") clickAction("fold");
  else if (e.key === "c" || e.key === "C") {
    const legal = legalActions(state.game);
    if (legal?.canCheck) clickAction("check"); else clickAction("call");
  }
  else if (e.key === "r" || e.key === "R") {
    const slider = document.getElementById("betSlider");
    if (slider) slider.focus();
  }
  else if (e.key === "a" || e.key === "A") clickAction("allin");
}

function clickAction(act) {
  const btn = document.querySelector(`.action-btn[data-act="${act}"]`);
  if (btn && !btn.disabled) onActionButton(btn);
}

function onActionButton(btn) {
  const act = btn.dataset.act;
  if (!act) return;
  let action = { type: act };
  if (act === "raise" || act === "bet") {
    const slider = document.getElementById("betSlider");
    action.amount = parseInt(slider.value, 10);
  }
  // Confirmation all-in
  if (act === "allin" && state.settings.confirmAllin) {
    openModal(`
      <h2>Confirmer All-in ?</h2>
      <p>Tu mises l'intégralité de ton tapis.</p>
      <div class="modal-row">
        <button class="btn btn--ghost btn--full" data-close>Annuler</button>
        <button class="btn btn--primary btn--full" id="confirmAllin">Confirmer</button>
      </div>
    `);
    document.getElementById("confirmAllin").addEventListener("click", () => {
      document.getElementById("modal-root").innerHTML = "";
      submitAction(action);
    });
    return;
  }
  submitAction(action);
}

function submitAction(action) {
  if (state.mode === "multi-guest") {
    state.net.send("action", action);
  } else {
    executeAction(action);
  }
}

function renderHistoryDrawer(view) {
  const items = (state.game?.history || []).slice(-20).reverse();
  view.historyList.innerHTML = items.length
    ? items.map(h => `<div class="history-item">
        <div class="winner">${escapeHtml(h.winners?.[0]?.name || "—")} · ${formatChips(h.pot)}</div>
        <div class="hand">${escapeHtml(h.winners?.[0]?.hand || (h.type === "walk" ? "(par abandon)" : ""))}</div>
      </div>`).join("")
    : `<div style="color:var(--ink-mute);font-size:13px">Aucune main jouée pour l'instant.</div>`;
}

/* ── Settings ───────────────────────────────────────────── */

function openSettings() {
  const s = state.settings;
  openModal(`
    <h2>Paramètres</h2>
    <p>Modifications appliquées à la prochaine main.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="field"><label>Tapis de départ</label>
        <input class="input" id="setStack" type="number" min="100" value="${s.startingStack}"></div>
      <div class="field"><label>Small blind</label>
        <input class="input" id="setSB" type="number" min="1" value="${s.smallBlind}"></div>
      <div class="field"><label>Big blind</label>
        <input class="input" id="setBB" type="number" min="2" value="${s.bigBlind}"></div>
      <div class="field"><label>Difficulté IA</label>
        <select class="input" id="setDiff">
          <option value="easy"   ${s.aiDifficulty==="easy"?"selected":""}>Facile</option>
          <option value="medium" ${s.aiDifficulty==="medium"?"selected":""}>Confirmé</option>
          <option value="hard"   ${s.aiDifficulty==="hard"?"selected":""}>Expert</option>
        </select></div>
    </div>
    <div class="toggle-row" style="margin-top:14px">
      <span class="toggle-label">Confirmation all-in</span>
      <div class="toggle ${s.confirmAllin?"is-on":""}" id="tgAllin"></div>
    </div>
    <div class="toggle-row">
      <span class="toggle-label">Sons</span>
      <div class="toggle ${s.sound?"is-on":""}" id="tgSound"></div>
    </div>
    <div class="modal-row">
      <button class="btn btn--ghost btn--full" data-close>Fermer</button>
      <button class="btn btn--primary btn--full" id="saveSet">Enregistrer</button>
    </div>
  `);
  document.getElementById("tgAllin").addEventListener("click", e => e.currentTarget.classList.toggle("is-on"));
  document.getElementById("tgSound").addEventListener("click", e => e.currentTarget.classList.toggle("is-on"));
  document.getElementById("saveSet").addEventListener("click", () => {
    state.settings.startingStack = parseInt(document.getElementById("setStack").value, 10) || 2000;
    state.settings.smallBlind = parseInt(document.getElementById("setSB").value, 10) || 10;
    state.settings.bigBlind = parseInt(document.getElementById("setBB").value, 10) || 20;
    state.settings.aiDifficulty = document.getElementById("setDiff").value;
    state.settings.confirmAllin = document.getElementById("tgAllin").classList.contains("is-on");
    state.settings.sound = document.getElementById("tgSound").classList.contains("is-on");
    saveSettings();
    document.getElementById("modal-root").innerHTML = "";
    toast("Paramètres enregistrés", "ok");
  });
}

/* ── Helpers ─────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

/* ── Démarrage ───────────────────────────────────────────── */

window.addEventListener("DOMContentLoaded", route);
