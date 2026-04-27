/**
 * blackjack.js — Moteur Blackjack 1 joueur vs croupier.
 *
 * Règles :
 * - Mise initiale (au moins 1)
 * - Deal : 2 cartes joueur + 2 cartes croupier (1 face cachée)
 * - Joueur : Hit / Stand / Double / Split (1 niveau)
 * - Croupier : tire jusqu'à 17 ou plus (S17 — stand on soft 17)
 * - Blackjack naturel (2 cartes = 21) paie 3:2
 * - Push (égalité) = mise rendue
 * - Bust > 21 = défaite
 */

import { renderCard, renderChip } from "./svg-assets.js";
import { shuffle, createDeck, RANK_NAMES, SUIT_NAMES } from "./engine.js";
import { formatChips, toast, openModal } from "./ui.js";

const DECKS = 6;          // sabot 6 jeux

/** Crée un sabot mélangé (DECKS jeux). */
function createShoe() {
  const shoe = new Uint8Array(52 * DECKS);
  for (let d = 0; d < DECKS; d++)
    for (let i = 0; i < 52; i++) shoe[d * 52 + i] = i;
  return shuffle(shoe);
}

/** Valeur d'une main (gère les As 1/11). Renvoie {total, soft}. */
function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    const r = c >> 2;
    if (r === 12) { total += 11; aces++; }              // As → 11 par défaut
    else if (r >= 8) total += 10;                       // T,J,Q,K → 10
    else total += r + 2;                                // 2..9
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

/* ── Vue Blackjack ──────────────────────────────────────────── */

export function startBlackjack(root, { user, settings, onExit, onChipChange }) {
  const state = {
    shoe: createShoe(),
    idx: 0,
    chips: user.chips,
    bet: 0,
    phase: "betting",          // betting | dealing | playing | dealer | done
    player: [[]],              // mains (peuvent être >1 si split)
    activeHand: 0,
    dealer: [],
    revealDealer: false,
    busted: [false],
    doubled: [false],
    canSplit: false,
    canDouble: true,
    lastResult: null,
  };

  // Cap de mise par défaut (peut être paramétré dans settings.js plus tard)
  const minBet  = Math.max(1, settings?.bj_minBet  || 25);
  const maxBet  = Math.max(minBet, settings?.bj_maxBet || 1000);

  root.innerHTML = `
    <section class="game bj-game" data-view="blackjack">
      <header class="topbar">
        <div class="topbar-left">
          <button class="btn btn--ghost btn--sm" data-act="exit">← Casino</button>
        </div>
        <div class="topbar-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm2 4v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8H7z"/></svg>
          <span>Blackjack · 21</span>
        </div>
        <div class="topbar-right">
          <span class="topbar-info" id="bjChips">${formatChips(state.chips)} · jetons</span>
        </div>
      </header>

      <div class="bj-felt">
        <div class="bj-row bj-dealer-row" id="dealerRow">
          <div class="bj-row-label">Croupier</div>
          <div class="bj-cards" id="dealerCards"></div>
          <div class="bj-total" id="dealerTotal"></div>
        </div>

        <div class="bj-mid">
          <div class="bj-bet" id="potBet">
            <span class="pot-label">Mise</span>
            <span class="pot-amount" id="betAmount">${formatChips(state.bet)}</span>
          </div>
        </div>

        <div class="bj-row bj-player-row" id="playerRow">
          <div class="bj-row-label" id="playerLabel">Vous</div>
          <div class="bj-hands" id="playerHands"></div>
        </div>
      </div>

      <footer class="hud bj-hud" id="bjHud"></footer>
    </section>
  `;

  const refs = {
    dealerCards: root.querySelector("#dealerCards"),
    dealerTotal: root.querySelector("#dealerTotal"),
    playerHands: root.querySelector("#playerHands"),
    playerLabel: root.querySelector("#playerLabel"),
    bjHud: root.querySelector("#bjHud"),
    bjChips: root.querySelector("#bjChips"),
    betAmount: root.querySelector("#betAmount"),
  };

  function draw() {
    if (state.idx >= state.shoe.length - 20) {
      state.shoe = createShoe();
      state.idx = 0;
    }
    return state.shoe[state.idx++];
  }

  function render() {
    refs.bjChips.textContent = `${formatChips(state.chips)} · jetons`;
    refs.betAmount.textContent = formatChips(state.bet);

    // Croupier
    refs.dealerCards.innerHTML = state.dealer.map((c, i) => {
      const faceUp = state.revealDealer || i === 0;
      return `<div class="bj-card-wrap">${renderCard(
        RANK_NAMES[c >> 2], SUIT_NAMES[c & 3], faceUp
      )}</div>`;
    }).join("");
    if (state.revealDealer && state.dealer.length) {
      const v = handValue(state.dealer);
      refs.dealerTotal.textContent = v.soft && v.total < 21 ? `${v.total} (soft)` : `${v.total}`;
    } else if (state.dealer.length) {
      const v = handValue([state.dealer[0]]);
      refs.dealerTotal.textContent = `${v.total}+`;
    } else {
      refs.dealerTotal.textContent = "";
    }

    // Joueur (peut avoir plusieurs mains après split)
    refs.playerHands.innerHTML = state.player.map((hand, i) => {
      const v = handValue(hand);
      const active = i === state.activeHand && state.phase === "playing";
      const cls = `bj-hand ${active ? "is-active" : ""} ${state.busted[i] ? "is-bust" : ""}`;
      const cards = hand.map(c => `<div class="bj-card-wrap">${renderCard(
        RANK_NAMES[c >> 2], SUIT_NAMES[c & 3], true
      )}</div>`).join("");
      const totalLabel = v.total > 21 ? `${v.total} · BUST` :
                          v.soft && v.total < 21 ? `${v.total} (soft)` : `${v.total}`;
      const dbl = state.doubled[i] ? `<span class="bj-tag">×2</span>` : "";
      return `<div class="${cls}" data-hand="${i}">
        <div class="bj-hand-cards">${cards || "<div class='card-slot' style='width:44px;height:60px'></div>"}</div>
        <div class="bj-hand-total">${hand.length ? totalLabel : ""} ${dbl}</div>
      </div>`;
    }).join("");

    // HUD : actions selon la phase
    if (state.phase === "betting") {
      const presets = [25, 50, 100, 250, 500, 1000].filter(v => v >= minBet && v <= maxBet);
      refs.bjHud.innerHTML = `
        <div class="bj-bet-card glass">
          <h3>Place ta mise</h3>
          <div class="bj-bet-presets">
            ${presets.map(v => `<button data-bet-add="${v}" ${v > state.chips ? "disabled" : ""}>${formatChips(v)}</button>`).join("")}
          </div>
          <div class="bj-bet-row">
            <input type="number" class="input" id="bjBetInput" min="${minBet}" max="${Math.min(maxBet, state.chips)}" value="${Math.min(state.bet || minBet, state.chips)}">
            <button class="btn btn--ghost btn--sm" data-bet-clear>×</button>
          </div>
          <div class="bj-bet-actions">
            <button class="btn btn--primary btn--full" id="bjDeal" ${state.chips < minBet ? "disabled" : ""}>Distribuer</button>
          </div>
          <p class="bj-meta">Min ${formatChips(minBet)} · Max ${formatChips(maxBet)}</p>
        </div>
      `;
      const inp = root.querySelector("#bjBetInput");
      root.querySelectorAll("[data-bet-add]").forEach(b => {
        b.addEventListener("click", () => {
          inp.value = Math.min(maxBet, state.chips, (parseInt(inp.value, 10) || 0) + parseInt(b.dataset.betAdd, 10));
        });
      });
      root.querySelector("[data-bet-clear]").addEventListener("click", () => { inp.value = minBet; });
      root.querySelector("#bjDeal").addEventListener("click", () => {
        const v = parseInt(inp.value, 10) || 0;
        if (v < minBet) return toast(`Mise min ${formatChips(minBet)}`, "err");
        if (v > state.chips) return toast("Tapis insuffisant", "err");
        if (v > maxBet) return toast(`Mise max ${formatChips(maxBet)}`, "err");
        state.bet = v;
        deal();
      });
    } else if (state.phase === "playing") {
      const v = handValue(state.player[state.activeHand]);
      const canHit = v.total < 21;
      const canDouble = state.canDouble && state.player[state.activeHand].length === 2 && state.chips >= state.bet;
      const canSplit = state.canSplit && state.player[state.activeHand].length === 2
                        && (state.player[state.activeHand][0] >> 2) === (state.player[state.activeHand][1] >> 2)
                        && state.chips >= state.bet;
      refs.bjHud.innerHTML = `
        <div class="bj-actions">
          <button class="action-btn action-btn--call" data-bj="hit" ${!canHit ? "disabled" : ""}>
            <span class="label">Tirer</span><span class="amount">+1</span>
          </button>
          <button class="action-btn action-btn--fold" data-bj="stand">
            <span class="label">Rester</span><span class="amount">${v.total}</span>
          </button>
          <button class="action-btn action-btn--raise" data-bj="double" ${!canDouble ? "disabled" : ""}>
            <span class="label">Doubler</span><span class="amount">×2</span>
          </button>
          <button class="action-btn action-btn--allin" data-bj="split" ${!canSplit ? "disabled" : ""}>
            <span class="label">Split</span><span class="amount">↔</span>
          </button>
        </div>
      `;
      refs.bjHud.querySelectorAll("[data-bj]").forEach(b =>
        b.addEventListener("click", () => doAction(b.dataset.bj)));
    } else if (state.phase === "done") {
      refs.bjHud.innerHTML = `
        <div class="bj-result">
          <div class="bj-result-text">${state.lastResult || ""}</div>
          <div class="bj-result-actions">
            <button class="btn btn--primary" id="bjAgain">Rejouer</button>
            <button class="btn btn--ghost" data-act="exit">Quitter</button>
          </div>
        </div>
      `;
      root.querySelector("#bjAgain").addEventListener("click", reset);
    }
  }

  function deal() {
    if (state.bet > state.chips) return;
    state.chips -= state.bet;
    state.player = [[draw(), draw()]];
    state.dealer = [draw(), draw()];
    state.busted = [false];
    state.doubled = [false];
    state.activeHand = 0;
    state.canSplit = (state.player[0][0] >> 2) === (state.player[0][1] >> 2);
    state.canDouble = true;
    state.revealDealer = false;
    state.phase = "playing";
    render();

    // Vérif blackjack naturel
    const pBJ = isBlackjack(state.player[0]);
    const dBJ = isBlackjack(state.dealer);
    if (pBJ || dBJ) {
      state.revealDealer = true;
      state.phase = "done";
      if (pBJ && dBJ) {
        state.chips += state.bet;          // push
        state.lastResult = `Égalité — Blackjack contre Blackjack`;
        commitDelta(0);
      } else if (pBJ) {
        const win = Math.floor(state.bet * 2.5);
        state.chips += win;
        state.lastResult = `Blackjack ! +${formatChips(win - state.bet)}`;
        commitDelta(win - state.bet);
      } else {
        state.lastResult = `Blackjack du croupier — perdu`;
        commitDelta(-state.bet);
      }
      render();
    }
  }

  function doAction(act) {
    const hand = state.player[state.activeHand];
    if (act === "hit") {
      hand.push(draw());
      state.canDouble = false;
      const v = handValue(hand);
      if (v.total > 21) {
        state.busted[state.activeHand] = true;
        nextHandOrFinish();
      }
      render();
    } else if (act === "stand") {
      nextHandOrFinish();
    } else if (act === "double") {
      if (state.chips < state.bet) return toast("Tapis insuffisant", "err");
      state.chips -= state.bet;
      state.doubled[state.activeHand] = true;
      hand.push(draw());
      const v = handValue(hand);
      if (v.total > 21) state.busted[state.activeHand] = true;
      nextHandOrFinish();
    } else if (act === "split") {
      if (state.chips < state.bet) return toast("Tapis insuffisant", "err");
      state.chips -= state.bet;
      const c1 = hand[0], c2 = hand[1];
      state.player = [[c1, draw()], [c2, draw()]];
      state.busted = [false, false];
      state.doubled = [false, false];
      state.canSplit = false;
      state.canDouble = true;
      render();
    }
  }

  function nextHandOrFinish() {
    if (state.activeHand < state.player.length - 1) {
      state.activeHand++;
      state.canDouble = state.player[state.activeHand].length === 2 && state.chips >= state.bet;
      render();
    } else {
      finishDealer();
    }
  }

  function finishDealer() {
    state.revealDealer = true;
    // Si toutes les mains sont busted, le croupier ne tire pas
    const allBust = state.busted.every(b => b);
    if (!allBust) {
      while (handValue(state.dealer).total < 17) state.dealer.push(draw());
    }
    settleHands();
  }

  function settleHands() {
    const dV = handValue(state.dealer).total;
    let netDelta = 0;
    const messages = [];
    state.player.forEach((hand, i) => {
      const wager = state.bet * (state.doubled[i] ? 2 : 1);
      const v = handValue(hand).total;
      if (state.busted[i]) {
        netDelta -= wager;
        messages.push(`Main ${i + 1} : bust (-${formatChips(wager)})`);
      } else if (dV > 21 || v > dV) {
        const payout = wager * 2;
        state.chips += payout;
        netDelta += wager;
        messages.push(`Main ${i + 1} : gagné +${formatChips(wager)}`);
      } else if (v === dV) {
        state.chips += wager;
        messages.push(`Main ${i + 1} : push`);
      } else {
        netDelta -= wager;
        messages.push(`Main ${i + 1} : perdu (-${formatChips(wager)})`);
      }
    });
    state.lastResult = messages.join(" · ");
    state.phase = "done";
    commitDelta(netDelta);
    render();
  }

  function commitDelta(delta) {
    if (onChipChange) onChipChange(state.chips, delta);
  }

  function reset() {
    state.player = [[]];
    state.dealer = [];
    state.bet = 0;
    state.busted = [false];
    state.doubled = [false];
    state.revealDealer = false;
    state.phase = "betting";
    state.lastResult = null;
    render();
  }

  // Listener global
  root.addEventListener("click", e => {
    if (e.target.closest('[data-act="exit"]')) {
      onExit?.(state.chips);
    }
  });

  render();
  return state;
}
