/**
 * ui.js — Rendu DOM de la table, des sièges, du HUD et de la barre d'actions.
 *
 * Le rendu est manuel (pas de framework). Une fonction `renderGame(state)`
 * met à jour le DOM en place.
 */

import { renderCard, renderChip, renderTable, renderAvatar, seatPositions } from "./svg-assets.js";
import { legalActions, positionLabel, handName, evaluate7 } from "./engine.js";
import { SUIT_NAMES, RANK_NAMES } from "./engine.js";

const BOT_PERSONAS = ["vega","nova","atlas","echo","rune"];

/**
 * Construit le squelette de la vue jeu dans le conteneur racine.
 * Retourne un objet avec des références utiles (seats, hud, actions).
 */
export function mountGameView(root, ctx) {
  root.innerHTML = `
    <section class="game" data-view="game">
      <header class="topbar">
        <div class="topbar-left">
          <button class="btn btn--ghost btn--sm" data-act="leave">← Menu</button>
        </div>
        <div class="topbar-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-3.5 4.5-7 7-4 10 1.2.8 2.8.4 4-.8 1.2 1.2 2.8 1.6 4 .8 3-3-.5-5.5-4-10z"/></svg>
          <span>Casino · Hold'em</span>
        </div>
        <div class="topbar-right">
          <span class="topbar-info" id="blindsInfo">Blinds 10/20</span>
          <button class="btn btn--icon btn--ghost" data-act="history" title="Historique">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>
          </button>
          <button class="btn btn--icon btn--ghost" data-act="settings" title="Paramètres">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.9a7 7 0 0 0-2-1.2l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-.9a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>
          </button>
        </div>
      </header>

      <div class="table-wrap" id="tableWrap">
        <div class="table-svg" id="tableSvg"></div>
        <div class="seats-layer" id="seatsLayer"></div>
        <div class="pot" id="pot">
          <div class="pot-label">Pot</div>
          <div class="pot-amount" id="potAmount">0</div>
        </div>
        <div class="community" id="community"></div>
      </div>

      <footer class="hud" id="hud">
        <div class="hud-cards" id="hudCards"></div>
        <div class="hud-info" id="hudInfo"></div>
        <div class="actions" id="actionsBox"></div>
      </footer>
    </section>
    <aside class="drawer glass glass--deep" id="historyDrawer"><h3>Historique des mains</h3><div id="historyList"></div></aside>
  `;

  const tableSvg = root.querySelector("#tableSvg");
  tableSvg.innerHTML = renderTable();

  return {
    root,
    seatsLayer: root.querySelector("#seatsLayer"),
    pot: root.querySelector("#pot"),
    potAmount: root.querySelector("#potAmount"),
    community: root.querySelector("#community"),
    hudCards: root.querySelector("#hudCards"),
    hudInfo: root.querySelector("#hudInfo"),
    actionsBox: root.querySelector("#actionsBox"),
    blindsInfo: root.querySelector("#blindsInfo"),
    historyDrawer: root.querySelector("#historyDrawer"),
    historyList: root.querySelector("#historyList"),
    ctx,
  };
}

/* ─────────────────────────────────────────────────────────── */
/* Rendu plein                                                 */
/* ─────────────────────────────────────────────────────────── */

export function renderGame(view, game, opts = {}) {
  const heroId = opts.heroId;                  // joueur humain
  const wrap = view.seatsLayer.parentElement;
  const W = wrap.clientWidth, H = wrap.clientHeight;

  // ── Sièges (positionnés selon nb joueurs)
  const positions = seatPositions(game.players.length);
  const heroIdx = Math.max(0, game.players.findIndex(p => p.id === heroId));

  // Place le héros en bas (siège 0)
  const rotated = (idx) => positions[(idx - heroIdx + positions.length) % positions.length];

  view.seatsLayer.innerHTML = "";
  game.players.forEach((p, idx) => {
    const pos = rotated(idx);
    const x = pos.x * W;
    const y = pos.y * H;

    const seat = document.createElement("div");
    seat.className = "seat";
    if (idx === game.activeIdx && game.phase !== "ended" && game.phase !== "showdown") seat.classList.add("is-active");
    if (p.folded) seat.classList.add("is-folded");
    if (p.allIn) seat.classList.add("is-allin");
    seat.style.left = `${x}px`;
    seat.style.top = `${y}px`;
    seat.dataset.player = p.id;
    // Le hero est rendu dans le HUD : on n'affiche son siège qu'avec la pastille de position.
    if (p.id === heroId) seat.classList.add("is-hero");

    // Avatar
    const personaIdx = p.isBot ? (BOT_PERSONAS.indexOf(p.persona) + 1) : 0;
    seat.innerHTML = `
      <div class="seat-avatar">
        <div class="seat-avatar-ring"></div>
        <div class="seat-avatar-svg">${renderAvatar(personaIdx)}</div>
      </div>
      <div class="seat-name">${escapeHtml(p.name)}</div>
      <div class="seat-stack">${formatChips(p.stack)} ${p.allIn ? "· ALL-IN" : ""}</div>
      <div class="seat-cards">${renderSeatCards(p, idx, heroId, game)}</div>
    `;

    // Position label (BTN / SB / BB)
    const label = positionLabel(game, idx);
    if (label) {
      const tag = document.createElement("div");
      tag.className = `seat-pos ${label.toLowerCase()}`;
      tag.textContent = label === "BTN" ? "D" : label;
      // Place le tag à côté de l'avatar (en haut-droite)
      tag.style.position = "absolute";
      tag.style.top = "-4px";
      tag.style.right = "8px";
      seat.querySelector(".seat-avatar").appendChild(tag);
    }

    view.seatsLayer.appendChild(seat);

    // Bulle de mise (entre siège et pot)
    if (p.currentBet > 0 && game.phase !== "ended") {
      const bet = document.createElement("div");
      bet.className = "seat-bet";
      // Position interpolée vers le centre
      const cx = (pos.x * 0.62 + 0.5 * 0.38) * W;
      const cy = (pos.y * 0.62 + 0.5 * 0.38) * H;
      bet.style.left = `${cx}px`;
      bet.style.top = `${cy}px`;
      bet.style.transform = "translate(-50%, -50%)";
      bet.innerHTML = `${renderChip(nearestChipValue(p.currentBet))}<span>${formatChips(p.currentBet)}</span>`;
      view.seatsLayer.appendChild(bet);
    }
  });

  // ── Pot
  view.potAmount.textContent = formatChips(game.pot);
  view.pot.style.opacity = game.pot > 0 ? "1" : "0.4";

  // ── Cartes communes
  view.community.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    if (i < game.community.length) {
      const c = game.community[i];
      const cardWrap = document.createElement("div");
      cardWrap.innerHTML = renderCard(RANK_NAMES[c >> 2], SUIT_NAMES[c & 3], true);
      view.community.appendChild(cardWrap.firstElementChild);
    } else {
      const slot = document.createElement("div");
      slot.className = "card-slot";
      view.community.appendChild(slot);
    }
  }

  // ── HUD
  const hero = game.players.find(p => p.id === heroId);
  if (hero && hero.holeCards.length === 2 && !hero.sittingOut) {
    view.hudCards.innerHTML =
      renderCard(RANK_NAMES[hero.holeCards[0] >> 2], SUIT_NAMES[hero.holeCards[0] & 3], true) +
      renderCard(RANK_NAMES[hero.holeCards[1] >> 2], SUIT_NAMES[hero.holeCards[1] & 3], true);
  } else {
    view.hudCards.innerHTML = "";
  }

  // Infos main + force estimée
  if (hero && hero.holeCards.length === 2 && !hero.folded) {
    const all = [...hero.holeCards, ...game.community];
    if (all.length >= 5) {
      const name = handName(all);
      view.hudInfo.innerHTML = `
        <div class="strength">${name}</div>
        <div>Tapis : ${formatChips(hero.stack)} · Mise : ${formatChips(hero.currentBet)}</div>
        <div class="hud-strength-bar"><div style="width:${strengthBarWidth(all)}%"></div></div>
      `;
    } else {
      view.hudInfo.innerHTML = `
        <div>${RANK_NAMES[hero.holeCards[0] >> 2]}${suitChar(hero.holeCards[0])} ${RANK_NAMES[hero.holeCards[1] >> 2]}${suitChar(hero.holeCards[1])}</div>
        <div>Tapis : ${formatChips(hero.stack)}</div>
      `;
    }
  } else {
    view.hudInfo.innerHTML = `<div>Tapis : ${hero ? formatChips(hero.stack) : "—"}</div>`;
  }

  // ── Blinds
  view.blindsInfo.textContent = `Blinds ${game.sb}/${game.bb} · Main #${game.handNumber || 0}`;

  // ── Actions (uniquement si c'est au héros + phase active)
  const isHeroTurn = game.activeIdx === game.players.findIndex(p => p.id === heroId);
  const phaseActive = ["preflop","flop","turn","river"].includes(game.phase);
  if (isHeroTurn && phaseActive && hero && !hero.folded) {
    renderActions(view, game, hero);
  } else {
    view.actionsBox.innerHTML = "";
  }
}

function renderSeatCards(p, idx, heroId, game) {
  if (p.id === heroId) return ""; // affichées dans le HUD
  if (p.holeCards.length === 0 || p.folded) return "";
  // Dos pendant le jeu, faces au showdown
  const showFace = game.phase === "showdown" || game.phase === "ended";
  if (!showFace) {
    return p.holeCards.map(() => renderCard("","",false)).join("");
  }
  return p.holeCards.map(c =>
    renderCard(RANK_NAMES[c >> 2], SUIT_NAMES[c & 3], true)
  ).join("");
}

function suitChar(c) { return SUIT_NAMES[c & 3]; }

function strengthBarWidth(cards) {
  const score = evaluate7(cards) >>> 0;
  // catégorie sur 4 bits hauts (0..8) — convertit en %
  const cat = score >>> 24;
  return Math.min(100, 8 + cat * 11 + (((score >>> 20) & 0xF) / 12) * 4);
}

/* ─────────────────────────────────────────────────────────── */
/* Barre d'actions                                             */
/* ─────────────────────────────────────────────────────────── */

function renderActions(view, game, hero) {
  const legal = legalActions(game);
  if (!legal) { view.actionsBox.innerHTML = ""; return; }

  const callLabel = legal.canCheck ? "Check" : `Suivre ${formatChips(legal.callAmount)}`;
  const callType  = legal.canCheck ? "check" : "call";
  const raiseLabel = game.currentBet === 0 ? "Miser" : "Relancer";

  let raiseDisabled = !legal.canRaise || legal.minRaiseTo > legal.maxRaiseTo;

  const html = `
    <div class="bet-slider glass" id="betSliderBox" ${raiseDisabled ? "hidden" : ""}>
      <div class="bet-slider-row">
        <input type="range" id="betSlider"
               min="${legal.minRaiseTo}" max="${legal.maxRaiseTo}"
               value="${Math.min(Math.round(game.pot * 0.66) + game.currentBet, legal.maxRaiseTo) || legal.minRaiseTo}"
               step="${Math.max(1, Math.floor(game.bb / 2))}">
        <span class="bet-amount" id="betAmount">${legal.minRaiseTo}</span>
      </div>
      <div class="bet-presets">
        <button data-preset="min">Min</button>
        <button data-preset="half">½ Pot</button>
        <button data-preset="twothirds">⅔ Pot</button>
        <button data-preset="pot">Pot</button>
        <button data-preset="max">All-in</button>
      </div>
    </div>
    <div class="actions-row">
      <button class="action-btn action-btn--fold" data-act="fold">
        <span class="label">Fold</span><span class="amount">—</span>
      </button>
      <button class="action-btn action-btn--call" data-act="${callType}">
        <span class="label">${legal.canCheck ? "Check" : "Suivre"}</span>
        <span class="amount">${legal.canCheck ? "✓" : formatChips(legal.callAmount)}</span>
      </button>
      <button class="action-btn ${legal.maxRaiseTo === legal.minRaiseTo ? "action-btn--allin" : "action-btn--raise"}"
              data-act="${legal.maxRaiseTo === legal.minRaiseTo ? "allin" : "raise"}"
              ${raiseDisabled ? "disabled" : ""}>
        <span class="label">${legal.maxRaiseTo === legal.minRaiseTo ? "All-in" : raiseLabel}</span>
        <span class="amount" id="raiseAmount">${formatChips(legal.minRaiseTo)}</span>
      </button>
    </div>
  `;
  view.actionsBox.innerHTML = html;

  // Interaction
  const slider = view.actionsBox.querySelector("#betSlider");
  const betAmt = view.actionsBox.querySelector("#betAmount");
  const raiseAmt = view.actionsBox.querySelector("#raiseAmount");

  function syncSlider() {
    if (!slider) return;
    const v = parseInt(slider.value, 10);
    if (betAmt) betAmt.textContent = formatChips(v);
    if (raiseAmt) raiseAmt.textContent = formatChips(v);
  }
  if (slider) {
    slider.addEventListener("input", syncSlider);
    syncSlider();
  }

  // Presets
  view.actionsBox.querySelectorAll(".bet-presets button").forEach(b => {
    b.addEventListener("click", () => {
      if (!slider) return;
      const preset = b.dataset.preset;
      const min = parseInt(slider.min, 10);
      const max = parseInt(slider.max, 10);
      let v;
      if (preset === "min") v = min;
      else if (preset === "half") v = Math.min(max, Math.max(min, Math.round(hero.currentBet + game.pot * 0.5)));
      else if (preset === "twothirds") v = Math.min(max, Math.max(min, Math.round(hero.currentBet + game.pot * 0.66)));
      else if (preset === "pot") v = Math.min(max, Math.max(min, hero.currentBet + game.pot));
      else if (preset === "max") v = max;
      slider.value = v;
      syncSlider();
    });
  });
}

/* ─────────────────────────────────────────────────────────── */
/* Bandeau fin de main                                         */
/* ─────────────────────────────────────────────────────────── */

export function showResult(view, result) {
  if (!result) return;
  const old = view.root.querySelector(".endhand-banner");
  if (old) old.remove();
  const div = document.createElement("div");
  div.className = "endhand-banner";
  if (result.type === "walk") {
    const w = result.winners[0];
    div.textContent = `${w.name} remporte ${formatChips(w.amount)}`;
  } else {
    const w = result.winners[0];
    if (result.winners.length === 1) {
      div.textContent = `${w.name} gagne ${formatChips(w.amount)} · ${w.hand || ""}`;
    } else {
      div.textContent = `Split : ${result.winners.map(x => x.name).join(", ")}`;
    }
  }
  view.root.querySelector(".game").appendChild(div);
  setTimeout(() => div.classList.add("is-out"), 2400);
  setTimeout(() => div.remove(), 2900);
}

/* ─────────────────────────────────────────────────────────── */
/* Toasts                                                      */
/* ─────────────────────────────────────────────────────────── */

export function toast(msg, kind = "default", ms = 2400) {
  const root = document.getElementById("toasts");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast glass ${kind === "ok" ? "glass--tinted-green" : kind === "err" ? "glass--tinted-red" : ""}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.classList.add("toast--out"); }, ms - 300);
  setTimeout(() => { el.remove(); }, ms);
}

/* ─────────────────────────────────────────────────────────── */
/* Modale                                                      */
/* ─────────────────────────────────────────────────────────── */

export function openModal(html, opts = {}) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" id="mb"><div class="modal glass glass--deep">${html}<button class="modal-close" data-close>×</button></div></div>`;
  const close = () => { root.innerHTML = ""; opts.onClose?.(); };
  root.querySelector("[data-close]").addEventListener("click", close);
  if (opts.closeOnBackdrop !== false) {
    root.querySelector("#mb").addEventListener("click", e => {
      if (e.target.id === "mb") close();
    });
  }
  return { root, close };
}

/* ─────────────────────────────────────────────────────────── */
/* Helpers                                                     */
/* ─────────────────────────────────────────────────────────── */

export function formatChips(n) {
  if (n == null) return "0";
  if (n >= 10000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k";
  return n.toLocaleString("fr-FR");
}
function nearestChipValue(v) {
  const tiers = [5000, 1000, 500, 100, 25, 5, 1];
  for (const t of tiers) if (v >= t) return t;
  return 1;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
