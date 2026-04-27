/**
 * roulette.js — Roulette européenne (1 zéro vert, 18 rouge / 18 noir).
 *
 * Mises supportées (paiements standards casino) :
 *  - Plein (1 numéro)        — 35:1
 *  - Cheval (2 numéros)      — 17:1
 *  - Transversale (3 num.)   — 11:1
 *  - Carré (4 num.)          — 8:1
 *  - Sixain (6 num.)         — 5:1
 *  - Douzaine / Colonne      — 2:1
 *  - Pair/Impair, Rouge/Noir, Manque/Passe — 1:1
 *
 * Le joueur dépose des jetons sur la table de mise, click "Lancer la bille",
 * la roulette tourne, le résultat affiche les gains.
 */

import { formatChips, toast } from "./ui.js";

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BLACK = new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

/** Couleur d'un numéro (0=green, sinon red/black). */
function colorOf(n) {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
}

/** Calcule le gain net pour une mise sur le numéro n.
 *  bet : { type: 'straight'|'split'|..., numbers: int[], amount }
 *  Renvoie le PAIEMENT TOTAL (mise + gain) si gagnant, 0 sinon. */
function payout(bet, n) {
  if (!bet.numbers.includes(n)) return 0;
  const ratio = bet.ratio;     // ex: 35 pour straight
  return bet.amount * (ratio + 1);
}

const BET_TYPES = {
  straight:  { ratio: 35, label: "Plein" },
  split:     { ratio: 17, label: "Cheval" },
  street:    { ratio: 11, label: "Transversale" },
  corner:    { ratio: 8,  label: "Carré" },
  sixline:   { ratio: 5,  label: "Sixain" },
  dozen:     { ratio: 2,  label: "Douzaine" },
  column:    { ratio: 2,  label: "Colonne" },
  red:       { ratio: 1,  label: "Rouge" },
  black:     { ratio: 1,  label: "Noir" },
  even:      { ratio: 1,  label: "Pair" },
  odd:       { ratio: 1,  label: "Impair" },
  low:       { ratio: 1,  label: "Manque (1-18)" },
  high:      { ratio: 1,  label: "Passe (19-36)" },
};

function spinNumber() {
  return Math.floor(Math.random() * 37);    // 0..36
}

/**
 * @param {HTMLElement} root
 * @param {{ user, settings, onChipChange, onExit }} opts
 */
export function startRoulette(root, { user, settings, onChipChange, onExit }) {
  const state = {
    chips: user.chips,
    chipDenom: 25,                          // jeton sélectionné pour cliquer
    bets: [],                               // [{ type, numbers, amount, ratio, label }]
    spinning: false,
    lastResult: null,
    history: [],                            // 20 derniers numéros tirés
  };

  root.innerHTML = `
    <section class="game roulette-game" data-view="roulette">
      <header class="topbar">
        <div class="topbar-left">
          <button class="btn btn--ghost btn--sm" data-act="exit">← Casino</button>
        </div>
        <div class="topbar-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
          <span>Roulette · Européenne</span>
        </div>
        <div class="topbar-right">
          <span class="topbar-info" id="rChips">${formatChips(state.chips)} · jetons</span>
        </div>
      </header>

      <div class="roulette-felt">
        <div class="roulette-wheel-wrap">
          <div class="roulette-wheel" id="wheel">${renderWheel()}</div>
          <div class="roulette-result" id="rResult">—</div>
          <div class="roulette-history" id="rHistory"></div>
        </div>

        <div class="roulette-table" id="rTable">
          ${renderTable()}
        </div>

        <div class="roulette-bottombar glass">
          <div class="rb-row">
            <div class="rb-label">Jeton</div>
            <div class="rb-chips">
              ${[5, 25, 100, 500, 1000].map(v => `
                <button class="rb-chip ${v===25?'is-on':''}" data-denom="${v}">${formatChips(v)}</button>
              `).join("")}
            </div>
          </div>
          <div class="rb-row">
            <div class="rb-label">Total misé</div>
            <div class="rb-total" id="rTotal">0</div>
          </div>
          <div class="rb-actions">
            <button class="btn btn--ghost btn--sm" id="rUndo">Annuler dernier</button>
            <button class="btn btn--ghost btn--sm" id="rClear">Effacer mises</button>
            <button class="btn btn--primary" id="rSpin">Lancer la bille</button>
          </div>
        </div>
      </div>
    </section>
  `;

  const refs = {
    wheel: root.querySelector("#wheel"),
    result: root.querySelector("#rResult"),
    history: root.querySelector("#rHistory"),
    table: root.querySelector("#rTable"),
    chips: root.querySelector("#rChips"),
    total: root.querySelector("#rTotal"),
  };

  // Bind chip selector
  root.querySelectorAll("[data-denom]").forEach(b =>
    b.addEventListener("click", () => {
      state.chipDenom = parseInt(b.dataset.denom, 10);
      root.querySelectorAll("[data-denom]").forEach(x => x.classList.remove("is-on"));
      b.classList.add("is-on");
    })
  );

  // Bind table cells
  refs.table.addEventListener("click", e => {
    const cell = e.target.closest("[data-bet]");
    if (!cell || state.spinning) return;
    placeBet(cell);
  });

  root.querySelector("#rUndo").addEventListener("click", () => {
    if (state.spinning || !state.bets.length) return;
    const last = state.bets.pop();
    state.chips += last.amount;
    repaint();
  });
  root.querySelector("#rClear").addEventListener("click", () => {
    if (state.spinning || !state.bets.length) return;
    for (const b of state.bets) state.chips += b.amount;
    state.bets = [];
    repaint();
  });
  root.querySelector("#rSpin").addEventListener("click", () => spin());
  root.querySelector('[data-act="exit"]').addEventListener("click", () => onExit?.(state.chips));

  function placeBet(cell) {
    const type = cell.dataset.bet;
    const numbers = (cell.dataset.nums || "").split(",").filter(Boolean).map(Number);
    if (state.chipDenom > state.chips) {
      return toast("Jetons insuffisants", "err");
    }
    const meta = BET_TYPES[type];
    if (!meta) return;
    state.chips -= state.chipDenom;
    state.bets.push({
      type, numbers, amount: state.chipDenom,
      ratio: meta.ratio, label: meta.label, cellId: cell.dataset.id || "",
    });
    repaint();
  }

  function repaint() {
    refs.chips.textContent = `${formatChips(state.chips)} · jetons`;
    const total = state.bets.reduce((s, b) => s + b.amount, 0);
    refs.total.textContent = formatChips(total);
    // Markers de mise sur la table
    refs.table.querySelectorAll(".bet-marker").forEach(m => m.remove());
    const groups = new Map();   // cellId -> total
    for (const b of state.bets) {
      groups.set(b.cellId, (groups.get(b.cellId) || 0) + b.amount);
    }
    for (const [cellId, amount] of groups) {
      const cell = refs.table.querySelector(`[data-id="${CSS.escape(cellId)}"]`);
      if (!cell) continue;
      const m = document.createElement("div");
      m.className = "bet-marker";
      m.textContent = formatChips(amount);
      cell.appendChild(m);
    }
    // Bouton spin actif si mises
    const spinBtn = root.querySelector("#rSpin");
    spinBtn.disabled = state.bets.length === 0;
  }

  function spin() {
    if (state.spinning || !state.bets.length) return;
    state.spinning = true;
    refs.result.textContent = "…";
    refs.result.dataset.color = "";
    const n = spinNumber();
    // Anim simple : roue tourne ~2s
    refs.wheel.classList.add("spinning");
    setTimeout(() => {
      refs.wheel.classList.remove("spinning");
      refs.wheel.dataset.result = n;
      refs.result.textContent = `${n} · ${BET_TYPES[colorOf(n) === "green" ? "straight" : colorOf(n)]?.label || colorOf(n)}`;
      refs.result.dataset.color = colorOf(n);
      // Calcule gains
      let payoutTotal = 0;
      const winners = [];
      for (const b of state.bets) {
        const p = payout(b, n);
        if (p > 0) { payoutTotal += p; winners.push(`${b.label} ×${b.amount}`); }
      }
      const wagered = state.bets.reduce((s, b) => s + b.amount, 0);
      const delta = payoutTotal - wagered;
      state.chips += payoutTotal;
      state.bets = [];
      state.history.unshift(n);
      state.history = state.history.slice(0, 20);
      onChipChange?.(state.chips, delta);
      // Affiche la bannière
      const banner = document.createElement("div");
      banner.className = "endhand-banner";
      banner.textContent = delta > 0
        ? `${n} ${colorOf(n)==='red'?'rouge':colorOf(n)==='black'?'noir':'vert'} — Gain +${formatChips(delta)}`
        : delta < 0
          ? `${n} ${colorOf(n)==='red'?'rouge':colorOf(n)==='black'?'noir':'vert'} — Perdu (${formatChips(-delta)})`
          : `${n} ${colorOf(n)==='red'?'rouge':colorOf(n)==='black'?'noir':'vert'} — Égalité`;
      root.querySelector(".game").appendChild(banner);
      setTimeout(() => banner.remove(), 3000);
      repaint();
      renderHistory();
      state.spinning = false;
    }, 2200);
  }

  function renderHistory() {
    refs.history.innerHTML = state.history.map(n =>
      `<span class="rh-num" data-color="${colorOf(n)}">${n}</span>`).join("");
  }

  repaint();
  renderHistory();
}

/* ─────────── Rendus SVG / HTML ──────────────── */

function renderWheel() {
  // Roue stylisée 0..36 — un cercle avec segments alternés rouge/noir + 0 vert
  // L'ordre standard européen : 0 32 15 19 4 21 2 25 17 34 6 27 13 36 11 30 8 23 10 5 24 16 33 1 20 14 31 9 22 18 29 7 28 12 35 3 26
  const order = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const N = order.length;
  let segs = "";
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * 2 * Math.PI - Math.PI/2;
    const a2 = ((i + 1) / N) * 2 * Math.PI - Math.PI/2;
    const r = 90;
    const x1 = 100 + r * Math.cos(a1);
    const y1 = 100 + r * Math.sin(a1);
    const x2 = 100 + r * Math.cos(a2);
    const y2 = 100 + r * Math.sin(a2);
    const c = colorOf(order[i]);
    const fill = c === "red" ? "#a8443a" : c === "black" ? "#1a1a1f" : "#2e7a48";
    segs += `<path d="M100 100 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z" fill="${fill}" stroke="#0a0b0d" stroke-width="0.6"/>`;
    const aMid = (a1 + a2) / 2;
    const tx = 100 + 70 * Math.cos(aMid);
    const ty = 100 + 70 * Math.sin(aMid);
    segs += `<text x="${tx}" y="${ty + 3}" text-anchor="middle" font-size="9" fill="white" font-weight="700"
                  transform="rotate(${(aMid * 180/Math.PI) + 90} ${tx} ${ty})">${order[i]}</text>`;
  }
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="98" fill="#3a1e10"/>
    ${segs}
    <circle cx="100" cy="100" r="28" fill="url(#wheel-center)"/>
    <defs>
      <radialGradient id="wheel-center" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#e6c757"/>
        <stop offset="1" stop-color="#8c733e"/>
      </radialGradient>
    </defs>
  </svg>`;
}

function renderTable() {
  // Table de mise standard : 0 + 1..36 sur 3 colonnes × 12 lignes + extérieurs
  let cells = "";
  // Colonne 0 (à gauche)
  cells += `<button class="rt-cell rt-zero" data-bet="straight" data-nums="0" data-id="z0">0</button>`;

  // Numéros 1..36 en grille 12×3 (visualisée 3 lignes × 12 colonnes)
  // Layout : ligne haut = 3,6,9,...; milieu = 2,5,8,...; bas = 1,4,7,...
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 12; col++) {
      const n = (col * 3) + (3 - row);
      const c = colorOf(n);
      cells += `<button class="rt-cell rt-num rt-${c}" data-bet="straight" data-nums="${n}" data-id="n${n}" style="grid-row:${row+1};grid-column:${col+2}">${n}</button>`;
    }
  }
  // Colonnes (extrême droite)
  for (let row = 0; row < 3; row++) {
    const colNums = [];
    for (let col = 0; col < 12; col++) colNums.push((col * 3) + (3 - row));
    cells += `<button class="rt-cell rt-outside" data-bet="column" data-nums="${colNums.join(",")}" data-id="col${row}" style="grid-row:${row+1};grid-column:14">2:1</button>`;
  }
  // Douzaines (sous la grille principale)
  const dozenNums = [
    Array.from({length: 12}, (_, i) => i + 1),
    Array.from({length: 12}, (_, i) => i + 13),
    Array.from({length: 12}, (_, i) => i + 25),
  ];
  cells += `<button class="rt-cell rt-outside" data-bet="dozen" data-nums="${dozenNums[0].join(",")}" data-id="d1" style="grid-row:4;grid-column:2/6">1-12</button>`;
  cells += `<button class="rt-cell rt-outside" data-bet="dozen" data-nums="${dozenNums[1].join(",")}" data-id="d2" style="grid-row:4;grid-column:6/10">13-24</button>`;
  cells += `<button class="rt-cell rt-outside" data-bet="dozen" data-nums="${dozenNums[2].join(",")}" data-id="d3" style="grid-row:4;grid-column:10/14">25-36</button>`;
  // Mises 1:1 sous les douzaines
  const lowNums  = Array.from({length: 18}, (_, i) => i + 1);
  const highNums = Array.from({length: 18}, (_, i) => i + 19);
  const evenNums = Array.from({length: 18}, (_, i) => (i + 1) * 2);
  const oddNums  = Array.from({length: 18}, (_, i) => i * 2 + 1);
  const redNums  = [...RED];
  const blackNums = [...BLACK];
  cells += `<button class="rt-cell rt-outside" data-bet="low"   data-nums="${lowNums.join(",")}"   data-id="low"   style="grid-row:5;grid-column:2/4">1-18</button>`;
  cells += `<button class="rt-cell rt-outside" data-bet="even"  data-nums="${evenNums.join(",")}"  data-id="even"  style="grid-row:5;grid-column:4/6">PAIR</button>`;
  cells += `<button class="rt-cell rt-red"     data-bet="red"   data-nums="${redNums.join(",")}"   data-id="red"   style="grid-row:5;grid-column:6/8">ROUGE</button>`;
  cells += `<button class="rt-cell rt-black"   data-bet="black" data-nums="${blackNums.join(",")}" data-id="black" style="grid-row:5;grid-column:8/10">NOIR</button>`;
  cells += `<button class="rt-cell rt-outside" data-bet="odd"   data-nums="${oddNums.join(",")}"   data-id="odd"   style="grid-row:5;grid-column:10/12">IMPAIR</button>`;
  cells += `<button class="rt-cell rt-outside" data-bet="high"  data-nums="${highNums.join(",")}"  data-id="high"  style="grid-row:5;grid-column:12/14">19-36</button>`;
  return cells;
}
