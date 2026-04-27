/**
 * engine.js — Cœur Texas Hold'em No-Limit.
 *
 * Encodage des cartes : entier 0..51 = `rank * 4 + suit`
 *  - rank : 0 = 2, 1 = 3, …, 12 = A
 *  - suit : 0 = ♠ (s), 1 = ♥ (h), 2 = ♦ (d), 3 = ♣ (c)
 *
 * On exporte :
 *   - createDeck / shuffle (Fisher-Yates crypto)
 *   - cardToStr / parseCard
 *   - evaluate7  (meilleure main 5-cartes parmi 7)
 *   - handName   (nom français : "Quinte flush", "Brelan", …)
 *   - createGame, advance, applyAction (FSM)
 *   - computePots (main + side pots)
 */

export const RANK_NAMES = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
export const SUIT_NAMES = ["s","h","d","c"];
export const SUIT_ICON = ["♠","♥","♦","♣"];

/* ── Deck ─────────────────────────────────────────────────── */

export function createDeck() {
  const d = new Uint8Array(52);
  for (let i = 0; i < 52; i++) d[i] = i;
  return d;
}

/**
 * Fisher–Yates avec crypto.getRandomValues — équité prouvable.
 * @param {Uint8Array} deck modifié en place ; retourné aussi.
 */
export function shuffle(deck) {
  const n = deck.length;
  const rand = new Uint32Array(n);
  crypto.getRandomValues(rand);
  for (let i = n - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck;
}

export function cardToStr(c) {
  return RANK_NAMES[c >> 2] + SUIT_NAMES[c & 3];
}
export function cardRank(c) { return c >> 2; }
export function cardSuit(c) { return c & 3; }

/* ── Évaluateur 7 cartes ──────────────────────────────────── */

/**
 * Catégories (du fort au faible) :
 *   8 = Quinte flush      7 = Carré        6 = Full
 *   5 = Couleur            4 = Quinte       3 = Brelan
 *   2 = Deux paires        1 = Paire        0 = Hauteur
 *
 * @param {number[]|Uint8Array} cards7 7 cartes encodées
 * @returns {number} score 32 bits : `cat << 24 | r1<<20 | r2<<16 | r3<<12 | r4<<8 | r5<<4`
 */
export function evaluate7(cards7) {
  const ranks = new Int8Array(13);              // count par rang
  const suits = new Int8Array(4);               // count par couleur
  const suitMasks = new Uint16Array(4);         // bitmask des rangs présents par couleur
  const rankMask = (function () { let m = 0; return m; })();
  let mask = 0;
  for (let i = 0; i < 7; i++) {
    const c = cards7[i];
    const r = c >> 2, s = c & 3;
    ranks[r]++;
    suits[s]++;
    suitMasks[s] |= 1 << r;
    mask |= 1 << r;
  }

  // ── Quinte flush ?
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suits[s] >= 5) { flushSuit = s; break; }
  if (flushSuit >= 0) {
    const sm = suitMasks[flushSuit];
    // wheel : A-2-3-4-5 → mask = 0001000001111  (A bit12 + 2..5 bits 0..3)
    const sf = straightHigh(sm);
    if (sf >= 0) return makeScore(8, sf);
    // Couleur (à défaut)
    const top5 = topNBits(sm, 5);
    return makeScore(5, ...top5);
  }

  // ── Compteur de paires/brelans/carrés
  let quad = -1, trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (ranks[r] === 4) quad = r;
    else if (ranks[r] === 3) trips.push(r);
    else if (ranks[r] === 2) pairs.push(r);
  }

  // ── Carré
  if (quad >= 0) {
    const k = bestKicker(ranks, [quad]);
    return makeScore(7, quad, k);
  }

  // ── Full house
  if (trips.length >= 1 && (trips.length >= 2 || pairs.length >= 1)) {
    const t = trips[0];
    const p = trips.length >= 2 ? trips[1] : pairs[0];
    return makeScore(6, t, p);
  }

  // ── Quinte
  const sh = straightHigh(mask);
  if (sh >= 0) return makeScore(4, sh);

  // ── Brelan
  if (trips.length === 1) {
    const t = trips[0];
    const k = topRanks(ranks, 2, [t]);
    return makeScore(3, t, k[0], k[1]);
  }

  // ── Deux paires
  if (pairs.length >= 2) {
    const p1 = pairs[0], p2 = pairs[1];
    const k = bestKicker(ranks, [p1, p2]);
    return makeScore(2, p1, p2, k);
  }

  // ── Paire
  if (pairs.length === 1) {
    const p = pairs[0];
    const k = topRanks(ranks, 3, [p]);
    return makeScore(1, p, k[0], k[1], k[2]);
  }

  // ── Hauteur
  const k = topRanks(ranks, 5, []);
  return makeScore(0, ...k);
}

function makeScore(cat, ...ks) {
  let s = cat << 24;
  for (let i = 0; i < ks.length && i < 5; i++) {
    s |= (ks[i] & 0xF) << (20 - i * 4);
  }
  return s >>> 0;
}

/**
 * Plus haute carte d'une suite consécutive de 5 dans `mask` (bitmask 13 bits).
 * Renvoie -1 sinon. Reconnaît la wheel A-2-3-4-5 (haute = 3 = "5").
 */
function straightHigh(mask) {
  for (let high = 12; high >= 4; high--) {
    const need = (1 << high) | (1 << (high - 1)) | (1 << (high - 2)) | (1 << (high - 3)) | (1 << (high - 4));
    if ((mask & need) === need) return high;
  }
  // Wheel : A-2-3-4-5
  const wheel = (1 << 12) | 1 | 2 | 4 | 8;
  if ((mask & wheel) === wheel) return 3;
  return -1;
}

function topNBits(mask, n) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}
function topRanks(ranks, n, exclude) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (ranks[r] && !exclude.includes(r)) out.push(r);
  }
  while (out.length < n) out.push(0);
  return out;
}
function bestKicker(ranks, exclude) {
  for (let r = 12; r >= 0; r--) if (ranks[r] && !exclude.includes(r)) return r;
  return 0;
}

/* ── Nom de main lisible (français) ───────────────────────── */

export function handName(cards7) {
  const score = evaluate7(cards7);
  const cat = score >>> 24;
  const r1 = (score >>> 20) & 0xF;
  const r2 = (score >>> 16) & 0xF;
  const NAMES_FR = ["2","3","4","5","6","7","8","9","10","Valet","Dame","Roi","As"];
  switch (cat) {
    case 8: return r1 === 12 ? "Quinte flush royale" : `Quinte flush au ${NAMES_FR[r1]}`;
    case 7: return `Carré de ${NAMES_FR[r1]}`;
    case 6: return `Full aux ${NAMES_FR[r1]} par les ${NAMES_FR[r2]}`;
    case 5: return `Couleur au ${NAMES_FR[r1]}`;
    case 4: return r1 === 3 ? "Quinte basse (5)" : `Quinte au ${NAMES_FR[r1]}`;
    case 3: return `Brelan de ${NAMES_FR[r1]}`;
    case 2: return `Deux paires : ${NAMES_FR[r1]} et ${NAMES_FR[r2]}`;
    case 1: return `Paire de ${NAMES_FR[r1]}`;
    default: return `Hauteur ${NAMES_FR[r1]}`;
  }
}

/* ── Pots / side pots ─────────────────────────────────────── */

/**
 * Calcule le main pot + side pots à partir des contributions totales
 * et du statut "fold" de chaque joueur.
 *
 * @param {Array<{id:string, contributed:number, folded:boolean}>} players
 * @returns {Array<{amount:number, eligible:string[]}>}
 */
export function computePots(players) {
  const active = players.filter(p => p.contributed > 0);
  if (!active.length) return [];

  // Trie par contribution croissante
  const sorted = [...active].sort((a, b) => a.contributed - b.contributed);
  const pots = [];
  let prev = 0;

  for (const p of sorted) {
    const c = p.contributed;
    if (c <= prev) continue;
    const layer = c - prev;
    let amount = 0;
    for (const q of active) {
      const take = Math.min(layer, q.contributed - prev);
      if (take > 0) amount += take;
    }
    const eligible = active
      .filter(q => q.contributed >= c && !q.folded)
      .map(q => q.id);
    if (amount > 0 && eligible.length > 0) {
      pots.push({ amount, eligible });
    } else if (amount > 0) {
      // Tous les éligibles ont foldé : le pot est partagé selon les règles
      // — en réalité, ça ne devrait jamais arriver dans un round normal.
      pots.push({ amount, eligible: active.map(q => q.id) });
    }
    prev = c;
  }
  return pots;
}

/* ── Game state machine ───────────────────────────────────── */

/**
 * État d'un joueur dans une main :
 *   id, name, stack (avant la main), holeCards [c1,c2],
 *   currentBet (mise du tour en cours), contributed (cumul main),
 *   folded, allIn, hasActed (a agi dans le tour en cours)
 */

export const PHASES = ["preflop", "flop", "turn", "river", "showdown", "ended"];

/**
 * Crée un nouvel état de partie multi-mains. À appeler une fois.
 * @param {Array<{id, name, stack, isBot, difficulty}>} players (≥ 2)
 * @param {object} opts { sb, bb, dealerIdx }
 */
export function createGame(players, opts = {}) {
  return {
    players: players.map(p => ({
      ...p,
      seat: 0,                    // position assignée (0 = bas humain)
      holeCards: [],
      currentBet: 0,
      contributed: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      sittingOut: p.stack <= 0,
    })),
    sb: opts.sb || 10,
    bb: opts.bb || 20,
    dealerIdx: opts.dealerIdx ?? 0,
    handNumber: 0,
    history: [],                  // mains précédentes
    settings: opts.settings || {},
    phase: "idle",
  };
}

/**
 * Démarre une nouvelle main (deal hole cards, post blinds, mise active de BB).
 */
export function startHand(game) {
  game.handNumber++;
  game.deck = shuffle(createDeck());
  game.deckIdx = 0;
  game.community = [];
  game.pot = 0;
  game.currentBet = 0;
  game.minRaise = game.bb;
  game.lastAggressor = null;

  // Joueurs encore debout
  const live = game.players.filter(p => p.stack > 0 && !p.sittingOut);
  if (live.length < 2) {
    game.phase = "ended";
    return;
  }

  for (const p of game.players) {
    p.holeCards = [];
    p.currentBet = 0;
    p.contributed = 0;
    p.folded = p.stack <= 0;       // out → fold permanent pour cette main
    p.allIn = false;
    p.hasActed = false;
  }

  // Avance le bouton (passe les sortis)
  game.dealerIdx = nextLiveIdx(game, game.dealerIdx, +1, true);

  // Distribution
  const order = orderFromDealer(game);
  for (let round = 0; round < 2; round++) {
    for (const idx of order) {
      const p = game.players[idx];
      if (!p.folded) p.holeCards.push(game.deck[game.deckIdx++]);
    }
  }

  // Blinds (heads-up : SB = bouton)
  let sbIdx, bbIdx;
  if (live.length === 2) {
    sbIdx = game.dealerIdx;
    bbIdx = nextLiveIdx(game, sbIdx, +1);
  } else {
    sbIdx = nextLiveIdx(game, game.dealerIdx, +1);
    bbIdx = nextLiveIdx(game, sbIdx, +1);
  }
  postBlind(game, sbIdx, game.sb);
  postBlind(game, bbIdx, game.bb);
  game.currentBet = game.bb;
  game.minRaise = game.bb;
  game.bbIdx = bbIdx;

  // Action commence à gauche de la BB (UTG) — heads-up : SB (= bouton)
  game.activeIdx = nextLiveIdx(game, bbIdx, +1);
  game.phase = "preflop";
}

function postBlind(game, idx, amount) {
  const p = game.players[idx];
  const real = Math.min(amount, p.stack);
  p.stack -= real;
  p.currentBet += real;
  p.contributed += real;
  game.pot += real;
  if (p.stack === 0) p.allIn = true;
}

function nextLiveIdx(game, from, dir, allowSelf = false) {
  const n = game.players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (allowSelf && i === from) return i;
    const p = game.players[i];
    if (!p.folded && !p.sittingOut && p.stack > 0) return i;
  }
  return from;
}

function nextActiveIdx(game, from) {
  const n = game.players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    const p = game.players[i];
    if (!p.folded && !p.allIn && !p.sittingOut) return i;
  }
  return -1;
}

function orderFromDealer(game) {
  const n = game.players.length;
  const out = [];
  let i = game.dealerIdx;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    const p = game.players[i];
    if (!p.sittingOut && p.stack > 0) out.push(i);
  }
  return out;
}

/**
 * Joueurs encore debout dans la main (non foldés, hors sitOut).
 */
export function liveCount(game) {
  return game.players.filter(p => !p.folded && !p.sittingOut).length;
}

/**
 * Joueurs pouvant encore agir (non all-in, non foldés).
 */
export function actorsCount(game) {
  return game.players.filter(p => !p.folded && !p.sittingOut && !p.allIn).length;
}

/**
 * Actions légales pour le joueur actif courant.
 * @returns {{canCheck, canCall, callAmount, canRaise, minRaiseTo, maxRaiseTo, isAllInOnly}}
 */
export function legalActions(game) {
  const p = game.players[game.activeIdx];
  if (!p) return null;
  const toCall = game.currentBet - p.currentBet;
  const callAmount = Math.min(toCall, p.stack);
  const canCheck = toCall === 0;
  const canCall = toCall > 0;
  const minRaiseTo = Math.min(p.currentBet + p.stack, game.currentBet + game.minRaise);
  const maxRaiseTo = p.currentBet + p.stack;
  const canRaise = p.stack > toCall;       // a de quoi mettre plus
  const isAllInOnly = canRaise && (p.stack + p.currentBet) <= game.currentBet;
  return { canCheck, canCall, callAmount, canRaise, minRaiseTo, maxRaiseTo, isAllInOnly, toCall, stack: p.stack };
}

/**
 * Applique une action du joueur actif.
 * @param {object} game
 * @param {{type: 'fold'|'check'|'call'|'bet'|'raise'|'allin', amount?: number}} action
 *        Pour bet/raise, `amount` = montant TOTAL (pas l'incrément) que la mise du joueur atteint.
 *        Pour allin, montant ignoré (on prend tout son tapis).
 * @returns {object} { ok, error?, autoAdvance? } — caller doit ensuite appeler advance(game).
 */
export function applyAction(game, action) {
  const p = game.players[game.activeIdx];
  if (!p) return { ok: false, error: "Aucun joueur actif" };

  const legal = legalActions(game);

  switch (action.type) {
    case "fold": {
      p.folded = true;
      p.hasActed = true;
      break;
    }
    case "check": {
      if (!legal.canCheck) return { ok: false, error: "Impossible de checker" };
      p.hasActed = true;
      break;
    }
    case "call": {
      if (!legal.canCall) return { ok: false, error: "Rien à suivre" };
      const amt = legal.callAmount;
      p.stack -= amt;
      p.currentBet += amt;
      p.contributed += amt;
      game.pot += amt;
      if (p.stack === 0) p.allIn = true;
      p.hasActed = true;
      break;
    }
    case "bet":
    case "raise":
    case "allin": {
      let target;
      if (action.type === "allin") target = p.currentBet + p.stack;
      else target = Math.max(action.amount || 0, 0);

      if (target <= p.currentBet) return { ok: false, error: "Mise inférieure à la courante" };
      if (target > p.currentBet + p.stack) target = p.currentBet + p.stack;

      const isAllIn = target === p.currentBet + p.stack;
      const incrementOverCurrent = target - game.currentBet;

      // Si mise active, vérifier min-raise (sauf all-in incomplet)
      if (game.currentBet > 0 && !isAllIn) {
        if (target < game.currentBet + game.minRaise) {
          return { ok: false, error: `Min raise = ${game.currentBet + game.minRaise}` };
        }
      } else if (game.currentBet === 0 && !isAllIn) {
        // Mise d'ouverture : doit être au moins une BB
        if (target < game.bb) return { ok: false, error: `Mise min = ${game.bb}` };
      }

      const add = target - p.currentBet;
      p.stack -= add;
      p.currentBet = target;
      p.contributed += add;
      game.pot += add;
      if (p.stack === 0) p.allIn = true;

      // Mise à jour min-raise (et hasActed reset des autres)
      if (target > game.currentBet) {
        const fullRaise = !(isAllIn && incrementOverCurrent < game.minRaise);
        if (fullRaise) {
          game.minRaise = target - game.currentBet;
          game.lastAggressor = p.id;
          // Tous les joueurs encore en jeu doivent re-agir
          for (const q of game.players) {
            if (q !== p && !q.folded && !q.allIn && !q.sittingOut) q.hasActed = false;
          }
        } else {
          // All-in incomplet : ne rouvre pas l'action pour ceux ayant déjà agi
          // avec une mise complète, mais oui pour ceux qui n'ont pas encore agi.
        }
        game.currentBet = target;
      }
      p.hasActed = true;
      break;
    }
    default:
      return { ok: false, error: "Action inconnue" };
  }

  return { ok: true };
}

/**
 * Avance la machine d'état :
 *  - si tour de mise terminé → flop / turn / river / showdown
 *  - sinon, passe au prochain joueur actif
 * @returns {{ phase, event? }}
 */
export function advance(game) {
  // Tous foldés sauf 1 → fin par walk
  const live = game.players.filter(p => !p.folded && !p.sittingOut);
  if (live.length === 1) {
    return finishHandWalk(game, live[0]);
  }

  // Tour terminé ?
  const actors = game.players.filter(p => !p.folded && !p.allIn && !p.sittingOut);
  const allActed = actors.every(p => p.hasActed);
  const allMatched = actors.every(p => p.currentBet === game.currentBet);

  if (allActed && allMatched) {
    // Reset round
    for (const p of game.players) {
      p.currentBet = 0;
      p.hasActed = false;
    }
    game.currentBet = 0;
    game.minRaise = game.bb;

    if (actors.length <= 1 && live.length > 1) {
      // Plus personne à faire agir : on défile direct jusqu'au showdown
      while (game.phase !== "river" && game.phase !== "showdown") {
        if (game.phase === "preflop") dealFlop(game);
        else if (game.phase === "flop") dealTurn(game);
        else if (game.phase === "turn") dealRiver(game);
      }
      return finishHandShowdown(game);
    }

    if (game.phase === "preflop") { dealFlop(game); return { phase: "flop" }; }
    if (game.phase === "flop")    { dealTurn(game); return { phase: "turn" }; }
    if (game.phase === "turn")    { dealRiver(game); return { phase: "river" }; }
    if (game.phase === "river")   { return finishHandShowdown(game); }
  } else {
    // Joueur suivant
    const nx = nextActiveIdx(game, game.activeIdx);
    if (nx >= 0) game.activeIdx = nx;
    return { phase: game.phase };
  }
  return { phase: game.phase };
}

function dealFlop(game) {
  game.deckIdx++;                // burn
  game.community.push(game.deck[game.deckIdx++]);
  game.community.push(game.deck[game.deckIdx++]);
  game.community.push(game.deck[game.deckIdx++]);
  game.phase = "flop";
  game.activeIdx = nextActiveIdx(game, game.dealerIdx);
}
function dealTurn(game) {
  game.deckIdx++;
  game.community.push(game.deck[game.deckIdx++]);
  game.phase = "turn";
  game.activeIdx = nextActiveIdx(game, game.dealerIdx);
}
function dealRiver(game) {
  game.deckIdx++;
  game.community.push(game.deck[game.deckIdx++]);
  game.phase = "river";
  game.activeIdx = nextActiveIdx(game, game.dealerIdx);
}

function finishHandWalk(game, winner) {
  winner.stack += game.pot;
  game.phase = "ended";
  game.lastResult = {
    type: "walk",
    winners: [{ id: winner.id, name: winner.name, amount: game.pot, hand: null }],
    pot: game.pot,
  };
  game.history.push({ ...game.lastResult, hand: game.handNumber });
  return { phase: "ended", event: game.lastResult };
}

function finishHandShowdown(game) {
  // Compléter le board s'il manque des cartes (en cas de all-in chain)
  while (game.community.length < 5) {
    game.deckIdx++;
    game.community.push(game.deck[game.deckIdx++]);
  }
  game.phase = "showdown";

  const pots = computePots(game.players.map(p => ({
    id: p.id, contributed: p.contributed, folded: p.folded || p.sittingOut,
  })));

  const winners = [];
  for (const pot of pots) {
    const eligibles = game.players.filter(p => pot.eligible.includes(p.id) && !p.folded);
    if (!eligibles.length) continue;
    let bestScore = -1;
    let bestPlayers = [];
    for (const p of eligibles) {
      const score = evaluate7([...p.holeCards, ...game.community]);
      if (score > bestScore) { bestScore = score; bestPlayers = [p]; }
      else if (score === bestScore) bestPlayers.push(p);
    }
    const each = Math.floor(pot.amount / bestPlayers.length);
    let remainder = pot.amount - each * bestPlayers.length;
    // Le jeton impair va au premier gagnant à gauche du bouton
    const orderedFromDealer = [];
    let i = game.dealerIdx;
    for (let k = 0; k < game.players.length; k++) {
      i = (i + 1) % game.players.length;
      orderedFromDealer.push(game.players[i]);
    }
    const oddOrder = orderedFromDealer.filter(p => bestPlayers.includes(p));
    for (const p of bestPlayers) {
      let share = each;
      if (remainder > 0 && p === oddOrder[0]) { share += remainder; remainder = 0; }
      p.stack += share;
      winners.push({
        id: p.id, name: p.name, amount: share,
        hand: handName([...p.holeCards, ...game.community]),
        cards: [...p.holeCards],
        score: bestScore,
      });
    }
  }

  game.phase = "ended";
  game.lastResult = { type: "showdown", winners, pot: game.pot, board: [...game.community] };
  game.history.push({ ...game.lastResult, hand: game.handNumber });
  return { phase: "ended", event: game.lastResult };
}

/* ── Helpers visualisation ────────────────────────────────── */

/**
 * Position relative d'un joueur par rapport à un siège de référence.
 * @returns {string} "BTN" | "SB" | "BB" | "UTG" | "MP" | "CO" | ""
 */
export function positionLabel(game, idx) {
  const n = game.players.filter(p => !p.sittingOut).length;
  if (n < 2) return "";
  if (idx === game.dealerIdx) return "BTN";
  // SB / BB
  let sbIdx, bbIdx;
  if (n === 2) {
    sbIdx = game.dealerIdx;
    bbIdx = nextLiveIdx(game, sbIdx, +1);
    if (idx === bbIdx) return "BB";
    return "BTN";        // déjà couvert
  }
  sbIdx = nextLiveIdx(game, game.dealerIdx, +1);
  bbIdx = nextLiveIdx(game, sbIdx, +1);
  if (idx === sbIdx) return "SB";
  if (idx === bbIdx) return "BB";
  return "";
}
