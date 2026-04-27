/**
 * app.js — Point d'entrée du SPA Casino.
 *
 * Routes (hash) :
 *   #/                  menu casino (grille de jeux)
 *   #/holdem            Texas Hold'em (solo ou multi-host)
 *   #/holdem/host       configuration création multi
 *   #/holdem/join/<C>   rejoint une room poker via lien
 *   #/holdem/lobby      lobby multi
 *   #/blackjack         Blackjack
 *   #/admin             dashboard admin
 *   #/invite/<token>    flow d'invitation (consommation)
 *   #/login             login admin (mdp portfolio)
 *   #/settings          panneau de réglages
 */

import { createGame, startHand, advance, applyAction, legalActions } from "./engine.js";
import { botDecide, botDelay } from "./ai.js";
import { mountGameView, renderGame, showResult, toast, openModal, formatChips } from "./ui.js";
import { NetClient, inviteUrl } from "./multiplayer.js";
import { renderQR, renderAvatar } from "./svg-assets.js";
import * as api from "./auth.js";
import { renderCasinoMenu } from "./casino-menu.js";
import { renderAdminDashboard } from "./admin.js";
import { startBlackjack } from "./blackjack.js";
import { startRoulette } from "./roulette.js";
import { startMemory } from "./memory.js";

/* ── État global du SPA ──────────────────────────────────── */

const state = {
  user: null,
  mode: null,                  // 'solo' | 'multi-host' | 'multi-guest'
  game: null,
  view: null,
  heroId: null,
  net: null,
  settings: loadSettings(),
};

const SETTINGS_KEY = "casino.settings.v2";

function defaultSettings() {
  return {
    /* Identité (mode invité sans compte) */
    name: "Toi",

    /* Hold'em — règles */
    startingStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
    rake: 0,                       // % rake sur le pot
    maxPlayers: 6,

    /* Hold'em — IA */
    aiDifficulty: "medium",        // easy | medium | hard
    aiSpeed: "normal",             // fast | normal | slow
    aiRandomness: 50,              // 0..100, % de variabilité

    /* Hold'em — UX */
    confirmAllin: true,
    autoMuck: true,
    showOdds: false,
    actionTimeout: 15,
    cardStyle: "2color",           // 2color | 4color
    cardBack: "casino",            // casino | blue | red | black
    tableColor: "green",           // green | blue | burgundy
    showStrengthBar: true,
    chipAnimations: true,

    /* Audio */
    sound: true,
    soundVolume: 70,

    /* Affichage */
    reducedMotion: false,
    highContrast: false,
    cardSize: 100,                 // 80..130%

    /* Blackjack */
    bj_minBet: 25,
    bj_maxBet: 1000,
    bj_decks: 6,
    bj_dealerHitsSoft17: false,
    bj_blackjackPays: 1.5,
    bj_doubleAfterSplit: true,
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {}
  return defaultSettings();
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
}

/* ── Bootstrap ───────────────────────────────────────────── */

async function bootstrap() {
  state.user = await api.fetchMe();
  applyVisualSettings();
  route();
}

function applyVisualSettings() {
  const html = document.documentElement;
  html.dataset.cardStyle = state.settings.cardStyle;
  html.dataset.tableColor = state.settings.tableColor;
  html.style.setProperty("--card-scale", (state.settings.cardSize / 100));
  if (state.settings.reducedMotion) html.classList.add("reduced-motion");
  else html.classList.remove("reduced-motion");
  if (state.settings.highContrast) html.classList.add("high-contrast");
  else html.classList.remove("high-contrast");
}

/* ── Routing ─────────────────────────────────────────────── */

function route() {
  const hash = location.hash || "#/";
  const root = document.getElementById("app");

  // Cleanup multi sur changement de route
  if (state.net && !hash.startsWith("#/holdem/lobby") && !hash.startsWith("#/holdem")) {
    state.net.leave?.();
    state.net = null;
  }

  // Switch thème :
  //   - Light Portfolio : menus (home, login, admin, invite, settings)
  //   - Dark Liquid Glass : tous les jeux (Hold'em, Blackjack, Roulette, Memory)
  const isLightShell = hash === "#/" || hash === ""
                    || hash === "#/login"
                    || hash === "#/admin"
                    || hash === "#/settings"
                    || hash.startsWith("#/invite/");
  document.body.classList.toggle("theme-light", isLightShell);

  if (hash === "#/" || hash === "")           return renderHome(root);
  if (hash === "#/holdem")                    return startSolo(root);
  if (hash === "#/holdem/host")               return renderHostForm(root);
  if (hash.startsWith("#/holdem/join/"))      return renderJoinFlow(root, hash.slice("#/holdem/join/".length));
  if (hash === "#/holdem/lobby")              return renderLobby(root);
  if (hash === "#/blackjack")                 return startBlackjackView(root);
  if (hash === "#/roulette")                  return startRouletteView(root);
  if (hash === "#/memory")                    return startMemoryView(root);
  if (hash === "#/admin")                     return renderAdmin(root);
  if (hash.startsWith("#/invite/"))           return renderInviteRedeem(root, hash.slice("#/invite/".length));
  if (hash === "#/login")                     return renderAdminLogin(root);
  if (hash === "#/settings")                  return renderSettings(root);

  // Routes legacy (#/play et #/host depuis premier prototype)
  if (hash === "#/play")                      return startSolo(root);
  if (hash === "#/host")                      return renderHostForm(root);
  if (hash.startsWith("#/join/"))             return renderJoinFlow(root, hash.slice(7));
  if (hash === "#/lobby")                     return renderLobby(root);

  return renderHome(root);
}

window.addEventListener("hashchange", route);

/* ── Vue Home (menu casino) ──────────────────────────────── */

function renderHome(root) {
  renderCasinoMenu(root, {
    user: state.user,
    onPick: (gameId) => {
      if (gameId === "holdem")         location.hash = "#/holdem";
      else if (gameId === "blackjack") location.hash = "#/blackjack";
      else if (gameId === "roulette")  location.hash = "#/roulette";
      else if (gameId === "memory")    location.hash = "#/memory";
    },
    onAdmin:    () => { location.hash = "#/admin"; },
    onSettings: () => { location.hash = "#/settings"; },
    onInvite:   () => openInviteCreator(),
    onLogout:   async (alt) => {
      if (alt === "login") return (location.hash = "#/login");
      await api.logout();
      state.user = null;
      route();
    },
  });
}

function openInviteCreator() {
  // Délègue à l'admin module
  import("./admin.js").then(({ renderAdminDashboard }) => {
    location.hash = "#/admin";
  });
}

/* ── Login admin ─────────────────────────────────────────── */

function renderAdminLogin(root) {
  root.innerHTML = `
    <section class="lite-page">
      <button class="lite-back" data-act="back">← Retour</button>
      <div class="lite-card">
        <div class="lite-eyebrow">Connexion · Admin</div>
        <h1 class="lite-title">Mot de passe.</h1>
        <p class="lite-sub">Réservé à l'administrateur du casino. Le mot de passe est celui du portfolio.</p>
        <div class="lite-field">
          <label>Mot de passe</label>
          <input class="lite-input" type="password" id="adminPwd" autocomplete="current-password">
        </div>
        <div class="lite-btnrow">
          <button class="lite-btn" id="adminLogin">Se connecter</button>
        </div>
      </div>
    </section>
  `;
  root.querySelector('[data-act="back"]').addEventListener("click", () => location.hash = "#/");
  const inp = root.querySelector("#adminPwd");
  inp.focus();
  inp.addEventListener("keydown", e => { if (e.key === "Enter") doAdminLogin(); });
  root.querySelector("#adminLogin").addEventListener("click", doAdminLogin);
}
async function doAdminLogin() {
  const pwd = document.getElementById("adminPwd").value;
  const r = await api.adminLogin(pwd);
  if (!r.ok) return toast(r.error || "Mot de passe incorrect", "err");
  state.user = r.user;
  toast(`Bienvenue ${r.user.name}`, "ok");
  location.hash = "#/";
}

/* ── Invite redemption ───────────────────────────────────── */

async function renderInviteRedeem(root, iid) {
  iid = (iid || "").trim();
  if (!iid) return (location.hash = "#/");
  const r = await api.inviteInfo(iid);
  if (!r.ok) {
    root.innerHTML = `
      <section class="lite-page">
        <div class="lite-card">
          <div class="lite-eyebrow">Invitation</div>
          <h1 class="lite-title">Lien invalide.</h1>
          <p class="lite-sub">${escapeHtml(r.error || "Cette invitation n'est pas (ou plus) valide.")}</p>
          <div class="lite-btnrow">
            <button class="lite-btn" data-act="home">Revenir au casino</button>
          </div>
        </div>
      </section>`;
    root.querySelector('[data-act="home"]').addEventListener("click", () => location.hash = "#/");
    return;
  }
  const inv = r.invite;

  root.innerHTML = `
    <section class="lite-page">
      <div class="lite-card">
        <div class="lite-eyebrow">Invitation reçue</div>
        <h1 class="lite-title">Crée ton profil.</h1>
        <p class="lite-sub">L'admin t'a invité avec <strong style="color:#b89b5e">${formatChips(inv.starting_chips)} jetons</strong> de départ. Saisis le code qu'il t'a transmis pour confirmer.</p>

        <div class="lite-field">
          <label>Code reçu (6 caractères)</label>
          <input class="lite-input lite-input--code" id="invCode" maxlength="6" autocomplete="off" placeholder="A B C D E F">
        </div>
        <div class="lite-field">
          <label>Choisis ton pseudo</label>
          <input class="lite-input" id="invName" maxlength="24" placeholder="Marie">
        </div>

        <div class="lite-field">
          <label>Avatar</label>
          <div class="lite-avatar-pick">
            ${[0,1,2,3,4,5].map(i => `
              <button class="lite-avatar-opt ${i===0?"is-selected":""}" data-avatar="${i}">${renderAvatar(i)}</button>
            `).join("")}
          </div>
        </div>

        <div class="lite-btnrow">
          <button class="lite-btn" id="invSubmit">Rejoindre le casino</button>
        </div>
      </div>
    </section>
  `;

  let chosenAvatar = 0;
  root.querySelectorAll(".lite-avatar-opt").forEach(b => {
    b.addEventListener("click", () => {
      root.querySelectorAll(".lite-avatar-opt").forEach(x => x.classList.remove("is-selected"));
      b.classList.add("is-selected");
      chosenAvatar = parseInt(b.dataset.avatar, 10);
    });
  });
  const codeInp = root.querySelector("#invCode");
  codeInp.addEventListener("input", () => {
    codeInp.value = codeInp.value.toUpperCase().replace(/[^A-Z2-9]/g, "");
  });
  root.querySelector("#invSubmit").addEventListener("click", async () => {
    const code = codeInp.value.trim();
    const name = root.querySelector("#invName").value.trim();
    if (code.length !== 6) return toast("Code à 6 caractères requis", "err");
    if (name.length < 2)   return toast("Pseudo trop court", "err");
    const res = await api.redeem(iid, code, name, chosenAvatar);
    if (!res.ok) return toast(res.error || "Erreur", "err");
    state.user = res.user;
    toast(`Bienvenue ${res.user.name}`, "ok");
    location.hash = "#/";
  });
  setTimeout(() => codeInp.focus(), 100);
}

/* ── Admin dashboard ─────────────────────────────────────── */

function renderAdmin(root) {
  if (!state.user?.is_admin) {
    location.hash = "#/login";
    return;
  }
  renderAdminDashboard(root, {
    onBack: () => location.hash = "#/",
    onUserChanged: async () => {
      state.user = await api.fetchMe();
    },
  });
}

/* ── Settings exhaustifs ─────────────────────────────────── */

function renderSettings(root) {
  const s = state.settings;
  root.innerHTML = `
    <section class="settings-page">
      <header class="topbar">
        <div class="topbar-left">
          <button class="btn btn--ghost btn--sm" data-act="back">← Casino</button>
        </div>
        <div class="topbar-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.9a7 7 0 0 0-2-1.2l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-.9a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>
          <span>Réglages</span>
        </div>
        <div></div>
      </header>

      <div class="settings-body">
        ${settingsGroup("Hold'em — Règles", [
          { type: "number", key: "startingStack", label: "Tapis de départ", min: 100, step: 100 },
          { type: "number", key: "smallBlind",    label: "Small blind", min: 1 },
          { type: "number", key: "bigBlind",      label: "Big blind", min: 2 },
          { type: "number", key: "maxPlayers",    label: "Joueurs max", min: 2, max: 6 },
          { type: "number", key: "rake",          label: "Rake (%)", min: 0, max: 10, step: 0.5 },
        ], s)}

        ${settingsGroup("Hold'em — IA", [
          { type: "select", key: "aiDifficulty", label: "Difficulté",
            options: [["easy","Facile"],["medium","Confirmé"],["hard","Expert"]] },
          { type: "select", key: "aiSpeed", label: "Vitesse",
            options: [["fast","Rapide"],["normal","Normale"],["slow","Lente"]] },
          { type: "range",  key: "aiRandomness", label: "Variabilité (%)", min: 0, max: 100 },
        ], s)}

        ${settingsGroup("Hold'em — UX", [
          { type: "toggle", key: "confirmAllin",     label: "Confirmation all-in" },
          { type: "toggle", key: "autoMuck",         label: "Auto-muck si battu" },
          { type: "toggle", key: "showOdds",         label: "Afficher pot odds & equity" },
          { type: "toggle", key: "showStrengthBar",  label: "Afficher la barre de force de main" },
          { type: "toggle", key: "chipAnimations",   label: "Animations de jetons" },
          { type: "number", key: "actionTimeout",    label: "Timeout action (sec)", min: 5, max: 60 },
        ], s)}

        ${settingsGroup("Cartes & Table", [
          { type: "select", key: "cardStyle", label: "Style des cartes",
            options: [["2color","Deux couleurs"],["4color","Quatre couleurs"]] },
          { type: "select", key: "cardBack", label: "Dos de carte",
            options: [["casino","Casino (anthracite or)"],["blue","Bleu profond"],["red","Bordeaux"],["black","Onyx"]] },
          { type: "select", key: "tableColor", label: "Feutre de table",
            options: [["green","Vert classique"],["blue","Bleu nuit"],["burgundy","Bordeaux"]] },
          { type: "range",  key: "cardSize", label: "Taille des cartes (%)", min: 80, max: 130 },
        ], s)}

        ${settingsGroup("Audio", [
          { type: "toggle", key: "sound", label: "Sons activés" },
          { type: "range",  key: "soundVolume", label: "Volume (%)", min: 0, max: 100 },
        ], s)}

        ${settingsGroup("Accessibilité", [
          { type: "toggle", key: "reducedMotion",  label: "Mouvement réduit" },
          { type: "toggle", key: "highContrast",   label: "Contraste élevé" },
        ], s)}

        ${settingsGroup("Blackjack", [
          { type: "number", key: "bj_minBet", label: "Mise min", min: 1 },
          { type: "number", key: "bj_maxBet", label: "Mise max", min: 1 },
          { type: "number", key: "bj_decks",  label: "Sabots (jeux)", min: 1, max: 8 },
          { type: "toggle", key: "bj_dealerHitsSoft17", label: "Croupier tire sur soft 17" },
          { type: "select", key: "bj_blackjackPays", label: "Paiement Blackjack",
            options: [[1.5,"3:2 (1.5×)"],[1.2,"6:5 (1.2×)"],[1,"Égal (1×)"]] },
          { type: "toggle", key: "bj_doubleAfterSplit", label: "Double après split" },
        ], s)}

        <div class="settings-footer">
          <button class="btn btn--ghost" data-act="reset">Restaurer défauts</button>
          <button class="btn btn--primary" data-act="back">Terminer</button>
        </div>
      </div>
    </section>
  `;

  // Bind interactions
  root.querySelectorAll("[data-set-key]").forEach(el => {
    const key = el.dataset.setKey;
    const t = el.dataset.setType;
    if (t === "toggle") {
      el.addEventListener("click", () => {
        s[key] = !s[key];
        el.classList.toggle("is-on", !!s[key]);
        saveSettings(); applyVisualSettings();
      });
    } else if (t === "number" || t === "range") {
      el.addEventListener("input", () => {
        const v = parseFloat(el.value);
        s[key] = isNaN(v) ? s[key] : v;
        const lab = el.parentElement.querySelector(".set-range-val");
        if (lab) lab.textContent = el.value;
        saveSettings(); applyVisualSettings();
      });
    } else if (t === "select") {
      el.addEventListener("change", () => {
        const raw = el.value;
        s[key] = raw === "true" ? true : raw === "false" ? false : (isNaN(+raw) ? raw : +raw);
        saveSettings(); applyVisualSettings();
      });
    }
  });
  root.querySelectorAll('[data-act="back"]').forEach(b =>
    b.addEventListener("click", () => location.hash = "#/"));
  root.querySelector('[data-act="reset"]')?.addEventListener("click", () => {
    if (!confirm("Restaurer tous les paramètres par défaut ?")) return;
    state.settings = defaultSettings();
    saveSettings();
    applyVisualSettings();
    renderSettings(root);
    toast("Paramètres restaurés", "ok");
  });
}

function settingsGroup(title, items, s) {
  return `<section class="settings-group glass glass--clear">
    <h3 class="settings-group-title">${title}</h3>
    <div class="settings-rows">
      ${items.map(it => settingRow(it, s)).join("")}
    </div>
  </section>`;
}
function settingRow(it, s) {
  const v = s[it.key];
  if (it.type === "toggle") {
    return `<div class="toggle-row">
      <span class="toggle-label">${it.label}</span>
      <div class="toggle ${v ? "is-on" : ""}" data-set-key="${it.key}" data-set-type="toggle"></div>
    </div>`;
  }
  if (it.type === "range") {
    return `<div class="set-row">
      <label class="set-label">${it.label} <span class="set-range-val">${v}</span></label>
      <input type="range" min="${it.min}" max="${it.max}" step="${it.step || 1}" value="${v}"
             data-set-key="${it.key}" data-set-type="range">
    </div>`;
  }
  if (it.type === "number") {
    return `<div class="set-row">
      <label class="set-label">${it.label}</label>
      <input type="number" class="input set-num" min="${it.min ?? ""}" max="${it.max ?? ""}" step="${it.step || 1}" value="${v}"
             data-set-key="${it.key}" data-set-type="number">
    </div>`;
  }
  if (it.type === "select") {
    return `<div class="set-row">
      <label class="set-label">${it.label}</label>
      <select class="input set-num" data-set-key="${it.key}" data-set-type="select">
        ${it.options.map(([val, lab]) => `<option value="${val}" ${String(val)===String(v)?"selected":""}>${lab}</option>`).join("")}
      </select>
    </div>`;
  }
  return "";
}

/* ── Solo Hold'em ────────────────────────────────────────── */

function startSolo(root) {
  state.mode = "solo";
  const startStack = state.user?.chips ?? state.settings.startingStack;
  state.heroSoloStartChips = startStack;
  const players = [
    { id: "hero", name: state.user?.name || state.settings.name || "Toi", stack: startStack, isBot: false },
    { id: "bot1", name: "Vega",  stack: state.settings.startingStack, isBot: true, persona: "vega",  difficulty: state.settings.aiDifficulty },
    { id: "bot2", name: "Nova",  stack: state.settings.startingStack, isBot: true, persona: "nova",  difficulty: state.settings.aiDifficulty },
    { id: "bot3", name: "Atlas", stack: state.settings.startingStack, isBot: true, persona: "atlas", difficulty: state.settings.aiDifficulty },
    { id: "bot4", name: "Echo",  stack: state.settings.startingStack, isBot: true, persona: "echo",  difficulty: state.settings.aiDifficulty },
    { id: "bot5", name: "Rune",  stack: state.settings.startingStack, isBot: true, persona: "rune",  difficulty: state.settings.aiDifficulty },
  ].slice(0, Math.min(6, state.settings.maxPlayers));
  state.heroId = "hero";
  state.game = createGame(players, { sb: state.settings.smallBlind, bb: state.settings.bigBlind });
  state.view = mountGameView(root, { heroId: state.heroId });
  attachGameHandlers(state.view);
  startHand(state.game);
  renderGame(state.view, state.game, { heroId: state.heroId });
  scheduleNextTurn();
}

/* ── Blackjack ───────────────────────────────────────────── */

function commitChipDelta(delta, reason) {
  if (state.user && delta !== 0) {
    return api.cashout(delta, reason).then(r => {
      if (r.ok) state.user.chips = r.chips;
    });
  }
}

function startRouletteView(root) {
  if (!state.user) {
    const guestChips = parseInt(localStorage.getItem("casino.guest.chips") || "5000", 10);
    const fakeUser = { id: "guest", name: state.settings.name, chips: guestChips, is_admin: false, avatar_seed: 0 };
    return startRoulette(root, {
      user: fakeUser, settings: state.settings,
      onChipChange: (chips) => localStorage.setItem("casino.guest.chips", String(chips)),
      onExit: () => location.hash = "#/",
    });
  }
  startRoulette(root, {
    user: state.user, settings: state.settings,
    onChipChange: (chips, delta) => commitChipDelta(delta, "Roulette"),
    onExit: async () => {
      state.user = await api.fetchMe();
      location.hash = "#/";
    },
  });
}

function startMemoryView(root) {
  if (!state.user) {
    const guestChips = parseInt(localStorage.getItem("casino.guest.chips") || "5000", 10);
    const fakeUser = { id: "guest", name: state.settings.name, chips: guestChips, is_admin: false, avatar_seed: 0 };
    return startMemory(root, {
      user: fakeUser, settings: state.settings,
      onChipChange: (chips) => localStorage.setItem("casino.guest.chips", String(chips)),
      onExit: () => location.hash = "#/",
    });
  }
  startMemory(root, {
    user: state.user, settings: state.settings,
    onChipChange: (chips, delta) => commitChipDelta(delta, "Memory"),
    onExit: async () => {
      state.user = await api.fetchMe();
      location.hash = "#/";
    },
  });
}

function startBlackjackView(root) {
  if (!state.user) {
    // Mode invité avec chips localStorage
    const guestChips = parseInt(localStorage.getItem("casino.guest.chips") || "5000", 10);
    const fakeUser = { id: "guest", name: state.settings.name, chips: guestChips, is_admin: false, avatar_seed: 0 };
    startBlackjack(root, {
      user: fakeUser, settings: state.settings,
      onChipChange: (chips) => localStorage.setItem("casino.guest.chips", String(chips)),
      onExit: () => location.hash = "#/",
    });
    return;
  }
  // User authentifié : sync chips vers DB en sortie
  const startChips = state.user.chips;
  startBlackjack(root, {
    user: state.user, settings: state.settings,
    onChipChange: async (chips, delta) => {
      // On commit immédiatement chaque main, ce qui maintient le solde DB cohérent
      if (delta !== 0) {
        const r = await api.cashout(delta, "Blackjack");
        if (r.ok) state.user.chips = r.chips;
      }
    },
    onExit: async (chips) => {
      // Refresh user au cas où
      state.user = await api.fetchMe();
      location.hash = "#/";
    },
  });
}

/* ── Hôte multi : formulaire ─────────────────────────────── */

function renderHostForm(root) {
  root.innerHTML = `
    <section class="lobby">
      <button class="btn btn--ghost btn--sm home-back" data-act="back">← Casino</button>
      <div class="lobby-card glass">
        <div class="lobby-header">
          <div class="lobby-eyebrow">Créer une partie privée</div>
          <h2 style="font-family:var(--font-display);font-weight:700;letter-spacing:-0.025em;font-size:30px;margin:6px 0">Ta room Hold'em</h2>
          <p style="color:var(--ink-soft);margin:0;font-size:14px">Tu obtiendras un code à partager. Seules les personnes ayant ce code pourront te rejoindre.</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label>Ton pseudo</label>
            <input class="input" id="hostName" maxlength="18" value="${escAttr(state.user?.name || state.settings.name)}"></div>
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
  root.querySelectorAll('[data-act="back"]').forEach(b =>
    b.addEventListener("click", () => location.hash = "#/"));
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
      location.hash = "#/holdem/lobby";
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
  const url = inviteUrl(data.code).replace("/casino/#/join/", "/casino/#/holdem/join/");
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
      state.net.fetchRoom(state.net.code).then(d => {
        if (d.ok) { state.lobbyData = d.room; refreshLobbyPlayers(); }
      });
    }
    if (evt.type === "game_start")  startMultiplayerGame();
    if (evt.type === "state")       applyRemoteState(evt.payload);
    if (evt.type === "private")     applyPrivateState(evt.payload);
    if (evt.type === "action" && state.net.isHost) handleRemoteAction(evt.from, evt.payload);
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
  const name = state.user?.name || state.settings.name || "";
  if (!name || name === "Toi") {
    openModal(`
      <h2>Rejoindre la partie</h2>
      <p>Code : <strong style="font-family:var(--font-mono);letter-spacing:.2em">${code}</strong></p>
      <div class="field"><label>Ton pseudo</label>
        <input class="input" id="joinName" maxlength="18" value="${escAttr(name)}"></div>
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
    location.hash = "#/holdem/lobby";
  } catch (e) {
    toast(e.message || "Impossible de rejoindre", "err");
    location.hash = "#/";
  }
}

/* ── Multi : autorité hôte ──────────────────────────────── */

function startMultiplayerGame() {
  const root = document.getElementById("app");
  if (state.net?.isHost) {
    const players = state.lobbyData.players.map(p => ({
      id: p.id, name: p.name, stack: state.lobbyData.starting_stack, isBot: false,
    }));
    state.game = createGame(players, {
      sb: state.lobbyData.blinds[0], bb: state.lobbyData.blinds[1],
    });
    state.view = mountGameView(root, { heroId: state.heroId });
    attachGameHandlers(state.view);
    startHand(state.game);
    broadcastFullState();
    renderGame(state.view, state.game, { heroId: state.heroId });
    scheduleNextTurn();
  } else {
    state.view = mountGameView(root, { heroId: state.heroId });
    attachGameHandlers(state.view);
    state.view.actionsBox.innerHTML = `<div style="padding:14px;text-align:center;color:var(--ink-mute)">Connexion à la partie…</div>`;
  }
}

function scheduleNextTurn() {
  if (!state.game) return;
  const g = state.game;

  if (g.phase === "ended") {
    showResult(state.view, g.lastResult);
    setTimeout(() => {
      const standing = g.players.filter(p => p.stack > 0).length;
      if (standing >= 2) {
        startHand(g);
        if (state.mode === "multi-host") broadcastFullState();
        renderGame(state.view, g, { heroId: state.heroId });
        scheduleNextTurn();
      } else {
        const winner = g.players.find(p => p.stack > 0);
        toast(`${winner?.name || "Personne"} remporte la partie`, "ok", 4000);
        // Cashout solo si user authentifié
        if (state.mode === "solo" && state.user && state.heroSoloStartChips != null) {
          const hero = g.players.find(p => p.id === "hero");
          if (hero) {
            const delta = hero.stack - state.heroSoloStartChips;
            if (delta !== 0) api.cashout(delta, "Solo Hold'em").then(r => {
              if (r.ok) state.user.chips = r.chips;
            });
          }
        }
      }
    }, 3000);
    return;
  }

  if (g.phase === "showdown") return;

  const active = g.players[g.activeIdx];
  if (!active) return;

  if (state.mode === "solo" && active.isBot) {
    const legal = legalActions(g);
    const speed = state.settings.aiSpeed;
    const factor = speed === "fast" ? 0.4 : speed === "slow" ? 1.8 : 1;
    setTimeout(() => {
      const action = botDecide(g, g.activeIdx, legal);
      executeAction(action);
    }, botDelay(active.difficulty) * factor);
    return;
  }
  if (state.mode === "multi-host") {
    // attend l'action SSE
    return;
  }
}

function executeAction(action) {
  const g = state.game;
  const r = applyAction(g, action);
  if (!r.ok) { toast(r.error, "err"); return; }
  const advR = advance(g);
  if (state.mode === "multi-host") broadcastFullState();
  renderGame(state.view, g, { heroId: state.heroId });
  if (advR.event && g.phase === "ended") showResult(state.view, advR.event);
  scheduleNextTurn();
}

function handleRemoteAction(fromPlayerId, payload) {
  const g = state.game;
  if (!g) return;
  const active = g.players[g.activeIdx];
  if (!active || active.id !== fromPlayerId) return;
  executeAction(payload);
}

function broadcastFullState() {
  if (!state.net || !state.net.isHost || !state.game) return;
  const g = state.game;
  const publicState = {
    phase: g.phase, pot: g.pot, currentBet: g.currentBet, minRaise: g.minRaise,
    dealerIdx: g.dealerIdx, activeIdx: g.activeIdx, handNumber: g.handNumber,
    sb: g.sb, bb: g.bb, community: Array.from(g.community || []),
    players: g.players.map(p => ({
      id: p.id, name: p.name, stack: p.stack, currentBet: p.currentBet,
      contributed: p.contributed, folded: p.folded, allIn: p.allIn,
      sittingOut: p.sittingOut, hasActed: p.hasActed,
      hasHoleCards: p.holeCards && p.holeCards.length === 2,
      holeCards: g.phase === "showdown" || g.phase === "ended" ? Array.from(p.holeCards || []) : null,
    })),
    lastResult: g.lastResult || null,
  };
  state.net.send("state", publicState);
  for (const p of g.players) {
    if (p.id === state.heroId) continue;
    if (p.holeCards && p.holeCards.length) {
      state.net.send("private", { kind: "hole_cards", cards: Array.from(p.holeCards), handNumber: g.handNumber }, p.id);
    }
  }
}
function applyRemoteState(s) {
  if (state.mode !== "multi-guest") return;
  if (!state.game) {
    state.game = {
      players: s.players.map(p => ({ ...p, holeCards: [], isBot: false })),
      community: s.community || [], pot: s.pot, currentBet: s.currentBet, minRaise: s.minRaise,
      dealerIdx: s.dealerIdx, activeIdx: s.activeIdx, handNumber: s.handNumber,
      sb: s.sb, bb: s.bb, phase: s.phase, lastResult: s.lastResult, history: [],
    };
  } else {
    Object.assign(state.game, {
      pot: s.pot, currentBet: s.currentBet, minRaise: s.minRaise,
      dealerIdx: s.dealerIdx, activeIdx: s.activeIdx, handNumber: s.handNumber,
      community: s.community, sb: s.sb, bb: s.bb, phase: s.phase, lastResult: s.lastResult,
    });
    for (const sp of s.players) {
      const lp = state.game.players.find(p => p.id === sp.id);
      if (!lp) state.game.players.push({ ...sp, holeCards: sp.holeCards || [] });
      else {
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
    if (hero) { hero.holeCards = p.cards; if (state.view) renderGame(state.view, state.game, { heroId: state.heroId }); }
  }
}

/* ── Handlers vue jeu (Hold'em) ──────────────────────────── */

function attachGameHandlers(view) {
  view.root.addEventListener("click", (e) => {
    const t = e.target;
    const ab = t.closest(".action-btn");
    if (ab) { onActionButton(ab); return; }
    const sysAct = t.closest("[data-act]")?.dataset.act;
    if (sysAct === "leave") {
      if (state.net) state.net.leave();
      location.hash = "#/";
    } else if (sysAct === "settings") {
      location.hash = "#/settings";
    } else if (sysAct === "history") {
      view.historyDrawer.classList.toggle("is-open");
      renderHistoryDrawer(view);
    }
  });
  document.addEventListener("keydown", onKey);
}
function onKey(e) {
  if (!state.game) return;
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  const isHeroTurn = state.game.activeIdx === state.game.players.findIndex(p => p.id === state.heroId);
  if (!isHeroTurn) return;
  if (e.key === "f" || e.key === "F") clickAction("fold");
  else if (e.key === "c" || e.key === "C") {
    const legal = legalActions(state.game);
    clickAction(legal?.canCheck ? "check" : "call");
  }
  else if (e.key === "r" || e.key === "R") document.getElementById("betSlider")?.focus();
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
  if (state.mode === "multi-guest") state.net.send("action", action);
  else executeAction(action);
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

/* ── Helpers ─────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

/* ── Démarrage ───────────────────────────────────────────── */

window.addEventListener("DOMContentLoaded", bootstrap);
