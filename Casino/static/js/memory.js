/**
 * memory.js — Jeu de Memory : 8 paires (16 cartes), chronométré.
 *
 * Mise initiale, gain proportionnel à la performance :
 *   - Toutes les paires trouvées → multiplicateur fonction du temps + erreurs
 *   - Plafond de gain = 3× la mise pour parfait < 60s
 */

import { renderCard } from "./svg-assets.js";
import { shuffle, createDeck, RANK_NAMES, SUIT_NAMES } from "./engine.js";
import { formatChips, toast } from "./ui.js";

const PAIRS_COUNT = 8;            // 16 cartes au total

export function startMemory(root, { user, settings, onChipChange, onExit }) {
  const minBet = Math.max(1, settings?.bj_minBet || 25);
  const state = {
    chips: user.chips,
    bet: 0,
    cards: [],          // [{ card: int, revealed, matched }]
    flipped: [],        // indices of currently revealed unmatched
    moves: 0,
    matchedPairs: 0,
    startTime: 0,
    elapsed: 0,
    phase: "betting",   // betting | playing | done
    timer: null,
    locked: false,
    result: null,
  };

  root.innerHTML = `
    <section class="game memory-game" data-view="memory">
      <header class="topbar">
        <div class="topbar-left">
          <button class="btn btn--ghost btn--sm" data-act="exit">← Casino</button>
        </div>
        <div class="topbar-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="5" width="6" height="9" rx="1" opacity=".7"/><rect x="14" y="10" width="6" height="9" rx="1"/></svg>
          <span>Memory · paires</span>
        </div>
        <div class="topbar-right">
          <span class="topbar-info" id="mChips">${formatChips(state.chips)} · jetons</span>
          <span class="topbar-info" id="mTimer">⏱ 0:00</span>
        </div>
      </header>

      <div class="memory-felt" id="memFelt">
        <div class="memory-empty" id="memEmpty">
          <div class="bj-bet-card glass">
            <h3>Place ta mise</h3>
            <p style="color:var(--ink-mute);font-size:13px;margin:4px 0 12px">
              Trouve les 8 paires. Tes gains dépendent du temps et du nombre de coups.
            </p>
            <div class="bj-bet-presets">
              ${[25,50,100,250,500,1000].map(v => `<button data-bet="${v}">${formatChips(v)}</button>`).join("")}
            </div>
            <div class="bj-bet-row">
              <input type="number" class="input" id="memBetInput" min="${minBet}" value="${minBet}">
            </div>
            <div class="bj-bet-actions">
              <button class="btn btn--primary btn--full" id="memStart">Commencer la partie</button>
            </div>
            <p class="bj-meta">Min ${formatChips(minBet)}. Parfait sous 60s = ×3 ; sinon dégradé.</p>
          </div>
        </div>
      </div>

      <footer class="hud memory-hud" id="memHud">
        <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--ink-mute)">
          <span>Coups : <strong id="mMoves" style="color:var(--gold)">0</strong></span>
          <span>·</span>
          <span>Paires : <strong id="mPairs" style="color:var(--gold)">0/${PAIRS_COUNT}</strong></span>
        </div>
      </footer>
    </section>
  `;

  const refs = {
    felt: root.querySelector("#memFelt"),
    chips: root.querySelector("#mChips"),
    timer: root.querySelector("#mTimer"),
    moves: root.querySelector("#mMoves"),
    pairs: root.querySelector("#mPairs"),
    hud: root.querySelector("#memHud"),
  };

  root.querySelectorAll("[data-bet]").forEach(b =>
    b.addEventListener("click", () => {
      document.getElementById("memBetInput").value = b.dataset.bet;
    })
  );
  root.querySelector("#memStart").addEventListener("click", () => {
    const v = parseInt(document.getElementById("memBetInput").value, 10) || 0;
    if (v < minBet) return toast(`Mise min ${formatChips(minBet)}`, "err");
    if (v > state.chips) return toast("Tapis insuffisant", "err");
    state.bet = v;
    state.chips -= v;
    startGame();
  });
  root.querySelector('[data-act="exit"]').addEventListener("click", () => {
    if (state.timer) clearInterval(state.timer);
    onExit?.(state.chips);
  });

  function startGame() {
    // Tire 8 cartes au hasard du deck (52 cartes), double, mélange
    const deck = shuffle(createDeck());
    const picked = Array.from(deck.slice(0, PAIRS_COUNT));
    const doubled = [...picked, ...picked];
    // Mélange final
    for (let i = doubled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [doubled[i], doubled[j]] = [doubled[j], doubled[i]];
    }
    state.cards = doubled.map((c, i) => ({ card: c, revealed: false, matched: false, idx: i }));
    state.flipped = [];
    state.moves = 0;
    state.matchedPairs = 0;
    state.startTime = Date.now();
    state.elapsed = 0;
    state.phase = "playing";
    state.locked = false;

    refs.felt.innerHTML = `<div class="memory-board">${state.cards.map((c, i) => `
      <button class="memory-card" data-i="${i}">
        <div class="mc-inner">
          <div class="mc-back">${cardBack()}</div>
          <div class="mc-face">${renderCard(RANK_NAMES[c.card >> 2], SUIT_NAMES[c.card & 3], true)}</div>
        </div>
      </button>
    `).join("")}</div>`;

    refs.felt.querySelectorAll(".memory-card").forEach(b =>
      b.addEventListener("click", () => onCardClick(parseInt(b.dataset.i, 10))));

    state.timer = setInterval(updateTimer, 250);
    repaint();
  }

  function onCardClick(i) {
    if (state.phase !== "playing" || state.locked) return;
    const card = state.cards[i];
    if (card.revealed || card.matched) return;
    card.revealed = true;
    state.flipped.push(i);
    refs.felt.querySelector(`[data-i="${i}"]`).classList.add("is-flipped");
    if (state.flipped.length === 2) {
      state.locked = true;
      state.moves++;
      const [a, b] = state.flipped;
      const cardA = state.cards[a], cardB = state.cards[b];
      const sameRank = (cardA.card >> 2) === (cardB.card >> 2);
      const sameColor = (cardA.card & 1) === (cardB.card & 1);  // s/c (=0,3) vs h/d (=1,2)
      // Match strict : même rang ET même couleur (rouge/noir) — mais comme on tire 8 cartes
      // distinctes du deck et qu'on les double, c'est forcément un match parfait si même index
      const matched = cardA.card === cardB.card;
      if (matched) {
        cardA.matched = cardB.matched = true;
        state.matchedPairs++;
        setTimeout(() => {
          refs.felt.querySelector(`[data-i="${a}"]`).classList.add("is-matched");
          refs.felt.querySelector(`[data-i="${b}"]`).classList.add("is-matched");
          state.flipped = [];
          state.locked = false;
          repaint();
          if (state.matchedPairs === PAIRS_COUNT) finish();
        }, 380);
      } else {
        setTimeout(() => {
          cardA.revealed = cardB.revealed = false;
          refs.felt.querySelector(`[data-i="${a}"]`).classList.remove("is-flipped");
          refs.felt.querySelector(`[data-i="${b}"]`).classList.remove("is-flipped");
          state.flipped = [];
          state.locked = false;
          repaint();
        }, 900);
      }
    }
    repaint();
  }

  function updateTimer() {
    state.elapsed = (Date.now() - state.startTime) / 1000;
    const m = Math.floor(state.elapsed / 60);
    const s = Math.floor(state.elapsed % 60);
    refs.timer.textContent = `⏱ ${m}:${String(s).padStart(2, "0")}`;
  }

  function repaint() {
    refs.chips.textContent = `${formatChips(state.chips)} · jetons`;
    refs.moves.textContent = state.moves;
    refs.pairs.textContent = `${state.matchedPairs}/${PAIRS_COUNT}`;
  }

  function finish() {
    clearInterval(state.timer);
    state.phase = "done";
    // Multiplicateur :
    //   - parfait (8 coups) sous 60s : ×3
    //   - parfait sous 120s : ×2
    //   - chaque coup superflu réduit de 0.08, plancher à ×0.5
    //   - chaque sec >120 réduit de 0.005, plancher à ×0.3
    let mult = 1;
    const extras = state.moves - PAIRS_COUNT;     // tentatives manquées
    if (state.elapsed <= 60 && extras === 0) mult = 3;
    else if (state.elapsed <= 120 && extras <= 2) mult = 2;
    else mult = Math.max(0.3, 1.5 - extras * 0.08 - Math.max(0, state.elapsed - 60) * 0.005);
    const payout = Math.floor(state.bet * mult);
    const delta = payout - state.bet;
    state.chips += payout;
    state.result = { mult, payout, delta };
    onChipChange?.(state.chips, delta);

    refs.hud.innerHTML = `
      <div class="bj-result">
        <div class="bj-result-text">
          ${PAIRS_COUNT} paires en ${state.moves} coups · ${Math.floor(state.elapsed)}s · ×${mult.toFixed(2)} →
          ${delta >= 0 ? `<strong style="color:var(--st-call)">+${formatChips(delta)}</strong>` : `<strong style="color:var(--st-fold)">${formatChips(delta)}</strong>`}
        </div>
        <div class="bj-result-actions">
          <button class="btn btn--primary" id="memAgain">Rejouer</button>
          <button class="btn btn--ghost" data-act="exit">Quitter</button>
        </div>
      </div>
    `;
    document.getElementById("memAgain").addEventListener("click", () => {
      // Réinit
      state.bet = 0;
      state.cards = [];
      state.flipped = [];
      state.matchedPairs = 0;
      state.moves = 0;
      state.elapsed = 0;
      state.phase = "betting";
      refs.timer.textContent = `⏱ 0:00`;
      refs.felt.innerHTML = `<div class="memory-empty" id="memEmpty">
        <div class="bj-bet-card glass">
          <h3>Place ta mise</h3>
          <div class="bj-bet-presets">
            ${[25,50,100,250,500,1000].map(v => `<button data-bet="${v}">${formatChips(v)}</button>`).join("")}
          </div>
          <div class="bj-bet-row">
            <input type="number" class="input" id="memBetInput" min="${minBet}" value="${minBet}">
          </div>
          <div class="bj-bet-actions">
            <button class="btn btn--primary btn--full" id="memStart2">Commencer la partie</button>
          </div>
        </div>
      </div>`;
      refs.felt.querySelectorAll("[data-bet]").forEach(b =>
        b.addEventListener("click", () => {
          document.getElementById("memBetInput").value = b.dataset.bet;
        })
      );
      document.getElementById("memStart2").addEventListener("click", () => {
        const v = parseInt(document.getElementById("memBetInput").value, 10) || 0;
        if (v < minBet) return toast(`Mise min ${formatChips(minBet)}`, "err");
        if (v > state.chips) return toast("Tapis insuffisant", "err");
        state.bet = v;
        state.chips -= v;
        startGame();
      });
      refs.hud.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--ink-mute)">
          <span>Coups : <strong id="mMoves" style="color:var(--gold)">0</strong></span>
          <span>·</span>
          <span>Paires : <strong id="mPairs" style="color:var(--gold)">0/${PAIRS_COUNT}</strong></span>
        </div>
      `;
      refs.moves = root.querySelector("#mMoves");
      refs.pairs = root.querySelector("#mPairs");
      repaint();
    });
  }
}

function cardBack() {
  return `<svg viewBox="0 0 240 336" xmlns="http://www.w3.org/2000/svg">
    <rect width="240" height="336" rx="16" fill="#0F2E5C"/>
    <rect x="6" y="6" width="228" height="324" rx="10" fill="none" stroke="#1B4A8A" stroke-width="2"/>
    <ellipse cx="120" cy="168" rx="58" ry="80" fill="#082146" stroke="#1B4A8A" stroke-width="2"/>
    <text x="120" y="186" font-size="64" font-weight="800" fill="#e6c757" text-anchor="middle"
          font-family="-apple-system,system-ui,sans-serif">♠</text>
  </svg>`;
}
