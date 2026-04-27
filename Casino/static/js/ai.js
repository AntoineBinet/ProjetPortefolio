/**
 * ai.js — IA des bots.
 *
 * Trois niveaux : easy / medium / hard. Le calcul d'équité est un Monte Carlo
 * adapté au nombre d'adversaires. La table Chen pré-flop sert de baseline
 * rapide quand le board est vide.
 */

import { evaluate7, cardRank, cardSuit } from "./engine.js";

/* ── Table Chen pré-flop ─────────────────────────────────── */

/**
 * Score Chen pour une main pré-flop. Renvoie typiquement 0..20.
 * (Méthode B. Chen, 2002 — utilisée comme baseline rapide.)
 */
export function chenScore(c1, c2) {
  let r1 = cardRank(c1), r2 = cardRank(c2);
  if (r1 < r2) [r1, r2] = [r2, r1];
  const s1 = cardSuit(c1), s2 = cardSuit(c2);
  const baseValues = { 12: 10, 11: 8, 10: 7, 9: 6 };       // A,K,Q,J
  let pts = baseValues[r1] ?? Math.max(2, (r1 + 2) / 2);
  if (r1 === r2) {
    pts *= 2;
    if (pts < 5) pts = 5;
  }
  if (s1 === s2) pts += 2;
  const gap = r1 - r2;
  if (r1 !== r2) {
    if (gap === 1) pts += 1;
    else if (gap === 2) pts -= 1;
    else if (gap === 3) pts -= 2;
    else if (gap >= 4) pts -= 4;
    if (gap <= 2 && r1 < 11) pts += 1;
  }
  return Math.round(pts);
}

/* ── Monte Carlo équité ──────────────────────────────────── */

/**
 * Calcul d'équité Monte Carlo : tire aléatoirement les cartes manquantes
 * et compte les victoires sur N simulations.
 *
 * @param {number[]} hole 2 cartes du joueur
 * @param {number[]} board cartes communes connues (0..5)
 * @param {number} nbOpp nombre d'adversaires actifs
 * @param {number} iters nombre d'itérations (300 easy, 800 medium, 1500 hard)
 * @returns {number} probabilité de gain (0..1)
 */
export function equity(hole, board, nbOpp, iters = 800) {
  const known = new Set([...hole, ...board]);
  const remaining = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) remaining.push(c);

  let wins = 0, ties = 0;
  const need = 5 - board.length;

  for (let it = 0; it < iters; it++) {
    // Tirage aléatoire sans remise (Fisher-Yates partiel)
    const draw = remaining.slice();
    const taken = [];
    const total = need + nbOpp * 2;
    for (let k = 0; k < total; k++) {
      const j = (Math.random() * (draw.length - k) | 0) + k;
      const t = draw[j]; draw[j] = draw[k]; draw[k] = t;
      taken.push(draw[k]);
    }
    const fullBoard = [...board, ...taken.slice(0, need)];
    const myCards = [...hole, ...fullBoard];
    const myScore = evaluate7(myCards);
    let bestOpp = -1;
    let split = false;
    let p = need;
    for (let o = 0; o < nbOpp; o++) {
      const oc = [taken[p], taken[p + 1], ...fullBoard];
      p += 2;
      const sc = evaluate7(oc);
      if (sc > bestOpp) { bestOpp = sc; split = false; }
      else if (sc === bestOpp) split = true;
    }
    if (myScore > bestOpp) wins++;
    else if (myScore === bestOpp) ties++;
  }
  return (wins + ties * 0.5) / iters;
}

/* ── Décision bot ────────────────────────────────────────── */

const PERSONALITY = {
  vega:  { aggro: 0.18, bluff: 0.05, vpip: 0.0,  callDown: 0.05 },
  nova:  { aggro: -0.08, bluff: -0.02, vpip: 0.22, callDown: 0.18 },
  atlas: { aggro: -0.10, bluff: -0.06, vpip: -0.10, callDown: -0.04 },
  echo:  { aggro: 0.10, bluff: 0.12, vpip: 0.05, callDown: 0.0 },
  rune:  { aggro: 0.0, bluff: 0.0, vpip: 0.0, callDown: 0.0 },
};

/**
 * Décide d'une action pour un bot.
 *
 * @param {object} game l'état complet
 * @param {number} botIdx index du bot dans game.players
 * @param {object} legal résultat de legalActions(game) pour ce bot
 * @returns {{type, amount?}}
 */
export function botDecide(game, botIdx, legal) {
  const bot = game.players[botIdx];
  const diff = bot.difficulty || "medium";
  const persona = PERSONALITY[bot.persona] || PERSONALITY.rune;
  const iters = diff === "easy" ? 200 : diff === "hard" ? 900 : 500;

  const liveOpps = game.players.filter(p => !p.folded && !p.sittingOut && p.id !== bot.id).length;
  const isPreflop = game.community.length === 0;

  let strength;
  if (isPreflop) {
    // Mix Chen + petit MC pour calibrage
    const chen = chenScore(bot.holeCards[0], bot.holeCards[1]);
    strength = clamp((chen - 4) / 16, 0.05, 0.95);
    if (diff !== "easy") {
      strength = strength * 0.6 + equity(bot.holeCards, [], liveOpps, 250) * 0.4;
    }
  } else {
    strength = equity(bot.holeCards, game.community, liveOpps, iters);
  }

  // Pot odds
  const toCall = legal.toCall;
  const potAfter = game.pot + toCall;
  const potOdds = toCall === 0 ? 0 : toCall / (potAfter + toCall);

  const aggroBase = diff === "easy" ? 0.15 : diff === "medium" ? 0.30 : 0.42;
  const bluffBase = diff === "easy" ? 0.08 : diff === "medium" ? 0.14 : 0.20;
  const aggro = clamp(aggroBase + persona.aggro, 0, 0.7);
  const bluffP = clamp(bluffBase + persona.bluff, 0, 0.5);

  // Décision
  // 1. Si check possible et main faible : check (pas de fold gratuit)
  if (legal.canCheck) {
    if (strength > 0.55 && Math.random() < aggro) {
      return betSize(game, bot, legal, strength, isPreflop);
    }
    // Bluff occasionnel sur board sec
    if (strength < 0.30 && Math.random() < bluffP * 0.5) {
      return betSize(game, bot, legal, 0.35, isPreflop);
    }
    return { type: "check" };
  }

  // 2. Sinon, comparer equity vs pot odds
  const margin = strength - potOdds;

  if (margin < -0.06 - persona.callDown) {
    // Fold sauf small bluff catch
    if (Math.random() < 0.04 && toCall < bot.stack * 0.08) {
      return safeCall(game, bot, legal);
    }
    return { type: "fold" };
  }

  if (margin >= -0.06 - persona.callDown && margin < 0.05) {
    // Marginal : call
    return safeCall(game, bot, legal);
  }

  // Fort : raise
  if (legal.canRaise && Math.random() < 0.55 + aggro) {
    return betSize(game, bot, legal, strength, isPreflop);
  }
  return safeCall(game, bot, legal);
}

function safeCall(game, bot, legal) {
  if (legal.callAmount === 0) return { type: "check" };
  if (legal.callAmount >= bot.stack) return { type: "allin" };
  return { type: "call" };
}

function betSize(game, bot, legal, strength, isPreflop) {
  if (!legal.canRaise) return safeCall(game, bot, legal);
  const min = legal.minRaiseTo;
  const max = legal.maxRaiseTo;

  // Sizing : pré-flop = 2.5..3.5 BB d'open ; postflop = fraction de pot
  let target;
  if (isPreflop && game.currentBet === game.bb) {
    target = Math.round(game.bb * (2.5 + strength * 1.2));
  } else {
    const potBet = Math.round(game.pot * (0.5 + strength * 0.6));
    target = bot.currentBet + potBet;
  }
  // Borne
  target = Math.max(min, Math.min(max, target));
  if (target === max) return { type: "allin" };
  if (game.currentBet === 0) return { type: "bet", amount: target };
  return { type: "raise", amount: target };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ── Tempo IA ─────────────────────────────────────────────── */

/**
 * Délai aléatoire avant action (simule la réflexion).
 */
export function botDelay(diff = "medium", isHard = false) {
  const base = diff === "easy" ? [400, 1100] : diff === "medium" ? [600, 1700] : [800, 2400];
  let ms = base[0] + Math.random() * (base[1] - base[0]);
  if (isHard) ms *= 1.4;
  return Math.round(ms);
}
