/**
 * svg-assets.js — Génération procédurale de tous les visuels du casino.
 *
 * Aucune ressource externe : cartes, jetons, table, avatars sont produits ici
 * en SVG inline. Tout retourne une chaîne SVG (`renderXxx`) ou un nœud DOM.
 */

export const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
export const SUITS = ["s","h","d","c"];        // spade, heart, diamond, club
export const SUIT_GLYPH = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_COLOR = { s: "#0A0A0A", c: "#0A0A0A", h: "#D0021B", d: "#D0021B" };

/* ── Pip paths : couleurs en SVG compact (origine 0,0..100,110) ── */
const PIP_PATHS = {
  s: "M50 8 C 22 38, 8 60, 22 80 C 32 92, 46 88, 50 78 C 50 90, 46 96, 36 102 L 64 102 C 54 96, 50 90, 50 78 C 54 88, 68 92, 78 80 C 92 60, 78 38, 50 8 Z",
  h: "M50 100 C 18 76, 4 52, 22 28 C 36 16, 48 26, 50 40 C 52 26, 64 16, 78 28 C 96 52, 82 76, 50 100 Z",
  d: "M50 6 L 92 55 L 50 104 L 8 55 Z",
  c: "M50 12 a 16 16 0 1 1 0.01 0 M 32 50 a 16 16 0 1 1 0.01 0 M 68 50 a 16 16 0 1 1 0.01 0 M 42 95 L 58 95 C 53 84, 53 70, 50 64 C 47 70, 47 84, 42 95 Z"
};

/* ── Layouts des pips (positions x,y dans 240×336) pour rangs 2..10 ── */
const PIP_LAYOUTS = {
  "2":  [[120, 88], [120, 248]],
  "3":  [[120, 76], [120, 168], [120, 260]],
  "4":  [[88, 88], [152, 88], [88, 248], [152, 248]],
  "5":  [[88, 88], [152, 88], [120, 168], [88, 248], [152, 248]],
  "6":  [[88, 88], [152, 88], [88, 168], [152, 168], [88, 248], [152, 248]],
  "7":  [[88, 88], [152, 88], [120, 128], [88, 168], [152, 168], [88, 248], [152, 248]],
  "8":  [[88, 78], [152, 78], [120, 124], [88, 168], [152, 168], [120, 212], [88, 258], [152, 258]],
  "9":  [[88, 78], [152, 78], [88, 130], [152, 130], [120, 168], [88, 206], [152, 206], [88, 258], [152, 258]],
  "T":  [[88, 76], [152, 76], [88, 116], [152, 116], [88, 168], [152, 168], [88, 220], [152, 220], [88, 260], [152, 260]],
};

/**
 * Pip SVG positionné — utilisé pour cartes 2..10 et indices.
 * @param {number} cx centre X
 * @param {number} cy centre Y
 * @param {number} scale échelle
 * @param {string} suit "s"|"h"|"d"|"c"
 * @param {boolean} flip retourner verticalement (pour la moitié basse des cartes)
 */
function pip(cx, cy, scale, suit, flip = false) {
  const fill = SUIT_COLOR[suit];
  const t = `translate(${cx} ${cy}) scale(${scale} ${flip ? -scale : scale}) translate(-50 -55)`;
  return `<path d="${PIP_PATHS[suit]}" fill="${fill}" transform="${t}"/>`;
}

/**
 * Indice (rang + mini-pip) en haut-gauche d'une carte. Retourne un groupe SVG.
 */
function cornerIndex(rank, suit, x, y, rotated = false) {
  const fill = SUIT_COLOR[suit];
  const tx = rotated ? `rotate(180 ${x} ${y})` : "";
  return `<g transform="${tx}">
    <text x="${x}" y="${y + 22}" font-family="-apple-system, 'SF Pro Display', system-ui, sans-serif"
          font-size="34" font-weight="800" fill="${fill}" text-anchor="middle">${rank}</text>
    ${pip(x, y + 50, 0.18, suit)}
  </g>`;
}

/**
 * Génère une figure (J/Q/K) de manière géométrique stylisée — emblème.
 * @param {string} rank "J"|"Q"|"K"
 * @param {string} suit
 */
function figure(rank, suit) {
  const c = SUIT_COLOR[suit];
  const gold = "#C9A961";
  const cream = "#FBF6E5";
  // Cadre central
  let body = `
    <rect x="48" y="76" width="144" height="184" rx="10" fill="${cream}" stroke="${gold}" stroke-width="2"/>
    <rect x="56" y="84" width="128" height="168" rx="6" fill="none" stroke="${gold}" stroke-width="1" stroke-dasharray="2 3"/>`;
  // Pattern damassé (losanges)
  body += `<g opacity="0.08" fill="${c}">`;
  for (let r = 0; r < 6; r++) for (let cIdx = 0; cIdx < 4; cIdx++) {
    const x = 70 + cIdx * 28; const y = 100 + r * 28;
    body += `<polygon points="${x},${y - 6} ${x + 8},${y} ${x},${y + 6} ${x - 8},${y}"/>`;
  }
  body += `</g>`;

  if (rank === "J") {
    // Valet : silhouette buste + chapeau à plume
    body += `
      <g fill="${c}">
        <path d="M120 130 q-12 -8 -22 -2 q-2 14 6 24 q-2 6 0 12 q-22 8 -28 24 l 88 0 q-6 -16 -28 -24 q2 -6 0 -12 q8 -10 6 -24 q-10 -6 -22 2z"/>
        <path d="M98 124 l 18 -22 l 24 4 l -8 24 z" fill="${gold}"/>
        <path d="M138 102 q 10 -10 18 0 q-4 6 -14 4 z" fill="${c}"/>
      </g>
      <text x="120" y="240" font-size="14" font-weight="700" fill="${c}" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif">J</text>`;
  } else if (rank === "Q") {
    // Reine : couronne 5 pointes + collier de perles
    body += `
      <g fill="${c}">
        <path d="M88 116 l 8 -16 l 8 12 l 8 -18 l 8 14 l 8 -16 l 8 18 l 8 -14 l 8 18 l 8 -12 l 8 16 l -80 0 z" fill="${gold}"/>
        <circle cx="92" cy="116" r="3" fill="${c}"/><circle cx="120" cy="116" r="3" fill="${c}"/><circle cx="148" cy="116" r="3" fill="${c}"/>
        <path d="M120 130 q-22 4 -28 28 q-2 18 4 28 q12 6 24 6 q12 0 24 -6 q6 -10 4 -28 q-6 -24 -28 -28 z"/>
        <g fill="${gold}"><circle cx="106" cy="160" r="2"/><circle cx="114" cy="166" r="2"/><circle cx="120" cy="170" r="2"/><circle cx="126" cy="166" r="2"/><circle cx="134" cy="160" r="2"/></g>
      </g>
      <text x="120" y="240" font-size="14" font-weight="700" fill="${c}" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif">Q</text>`;
  } else { // K
    // Roi : couronne 7 pointes + barbe + sceptre
    body += `
      <g fill="${gold}">
        <path d="M84 118 l 6 -22 l 6 16 l 8 -22 l 6 16 l 8 -22 l 6 24 l 6 -22 l 8 22 l 6 -16 l 8 22 l 6 -16 l 6 22 l -80 0 z"/>
        <circle cx="120" cy="100" r="4" fill="${c}"/>
      </g>
      <g fill="${c}">
        <path d="M120 130 q-22 4 -26 24 q4 4 6 14 q-2 18 8 32 l 24 0 q10 -14 8 -32 q2 -10 6 -14 q-4 -20 -26 -24 z"/>
        <path d="M104 168 q 16 4 32 0 q-2 8 -16 8 q-14 0 -16 -8 z" fill="${cream}"/>
        <rect x="156" y="138" width="6" height="80" fill="${gold}"/>
        <circle cx="159" cy="134" r="6" fill="${gold}"/>
      </g>
      <text x="120" y="244" font-size="14" font-weight="700" fill="${c}" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif">K</text>`;
  }
  return body;
}

/**
 * Carte. Rendu intégral en SVG (face ou dos).
 * @param {string} rank  "2".."9","T","J","Q","K","A"
 * @param {string} suit  "s"|"h"|"d"|"c"
 * @param {boolean} faceUp défaut true ; sinon dos.
 * @param {object} opts { back: 'blue'|'red'|'black', selected }
 * @returns {string} markup SVG
 */
export function renderCard(rank, suit, faceUp = true, opts = {}) {
  const w = 240, h = 336;
  if (!faceUp) {
    return renderCardBack(opts.back || "blue", w, h);
  }
  const fill = SUIT_COLOR[suit];
  let inner = "";
  if (rank === "A") {
    inner = pip(120, 168, 1.4, suit);
  } else if (PIP_LAYOUTS[rank]) {
    const layout = PIP_LAYOUTS[rank];
    const flipFromIdx = Math.ceil(layout.length / 2);
    layout.forEach(([x, y], i) => {
      inner += pip(x, y, 0.34, suit, i >= flipFromIdx && layout.length > 1 && y > 168);
    });
    // Cas pair : la 2ème moitié est flippée pour rester orientée vers le bas
  } else {
    inner = figure(rank, suit);
  }

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="card card-${suit}">
    <rect width="${w}" height="${h}" rx="16" ry="16" fill="url(#card-face)"/>
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="14" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
    ${cornerIndex(rank, suit, 24, 18, false)}
    ${cornerIndex(rank, suit, w - 24, h - 86, true)}
    <g>${inner}</g>
  </svg>`;
}

/**
 * Dos de carte — pattern damassé + médaillon central.
 */
function renderCardBack(palette = "blue", w = 240, h = 336) {
  const palettes = {
    blue:  { bg: "#0F2E5C", line: "#1B4A8A", med: "#082146" },
    red:   { bg: "#7A1F2B", line: "#A53341", med: "#5A1722" },
    black: { bg: "#1A1A1F", line: "#3A3A48", med: "#0E0E12" },
  };
  const p = palettes[palette] || palettes.blue;
  let pattern = "";
  for (let i = 0; i < 18; i++) {
    for (let j = 0; j < 12; j++) {
      const x = 12 + j * 22;
      const y = 12 + i * 19;
      pattern += `<polygon points="${x},${y - 5} ${x + 7},${y} ${x},${y + 5} ${x - 7},${y}" fill="${p.line}" opacity="0.5"/>`;
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="card card-back">
    <rect width="${w}" height="${h}" rx="16" fill="${p.bg}"/>
    <rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="10" fill="none" stroke="${p.line}" stroke-width="2"/>
    <g transform="translate(0 0)">${pattern}</g>
    <ellipse cx="120" cy="168" rx="58" ry="80" fill="${p.med}" stroke="${p.line}" stroke-width="2"/>
    <ellipse cx="120" cy="168" rx="48" ry="68" fill="none" stroke="${p.line}" stroke-width="1" stroke-dasharray="2 3"/>
    <text x="120" y="186" font-size="64" font-weight="800" fill="#e6c757" text-anchor="middle"
          font-family="-apple-system,system-ui,sans-serif">♠</text>
  </svg>`;
}

/**
 * Slot vide (placeholder pour cartes communes non encore distribuées).
 */
export function renderCardSlot() {
  return `<div class="card-slot"></div>`;
}

/* ─────────────────────────────────────────────────────────── */
/* Jetons                                                      */
/* ─────────────────────────────────────────────────────────── */

const CHIP_COLORS = {
  1:    { main: "#f7f7f7", edge: "#cdcdcd", text: "#1a1a1a" },
  5:    { main: "#D0021B", edge: "#FFFFFF", text: "#FFFFFF" },
  25:   { main: "#1E7A3C", edge: "#FFFFFF", text: "#FFFFFF" },
  100:  { main: "#1A1A1A", edge: "#e6c757", text: "#e6c757" },
  500:  { main: "#6B2C91", edge: "#e6c757", text: "#FFFFFF" },
  1000: { main: "#F5C518", edge: "#1a1a1a", text: "#1a1a1a" },
  5000: { main: "#FF6B1A", edge: "#FFFFFF", text: "#FFFFFF" },
};

/**
 * Jeton SVG (vue de dessus, 100×100).
 * @param {number} value valeur du jeton
 */
export function renderChip(value = 25) {
  const tier = nearestChip(value);
  const c = CHIP_COLORS[tier];
  let stripes = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const a2 = a + Math.PI / 8;
    const x1 = 50 + 48 * Math.cos(a), y1 = 50 + 48 * Math.sin(a);
    const x2 = 50 + 48 * Math.cos(a2), y2 = 50 + 48 * Math.sin(a2);
    if (i % 2 === 0)
      stripes += `<path d="M50 50 L ${x1} ${y1} A 48 48 0 0 1 ${x2} ${y2} Z" fill="${c.edge}" opacity="0.85"/>`;
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="${c.main}"/>
    ${stripes}
    <circle cx="50" cy="50" r="38" fill="${c.main}"/>
    <circle cx="50" cy="50" r="22" fill="white"/>
    <text x="50" y="56" font-size="14" font-weight="800" fill="${c.text}" text-anchor="middle"
          font-family="-apple-system,system-ui,sans-serif">${value}</text>
  </svg>`;
}

function nearestChip(v) {
  const tiers = [5000, 1000, 500, 100, 25, 5, 1];
  for (const t of tiers) if (v >= t) return t;
  return 1;
}

/* ─────────────────────────────────────────────────────────── */
/* Table                                                       */
/* ─────────────────────────────────────────────────────────── */

/**
 * Table de poker ovale. Sobre, un seul liseré or fin, feutre sombre.
 */
export function renderTable() {
  return `<svg viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet" class="table-bg">
    <defs>
      <radialGradient id="felt-gradient-2" cx="0.5" cy="0.5" r="0.7">
        <stop offset="0"   stop-color="#143c2e"/>
        <stop offset="0.55" stop-color="#0e2c22"/>
        <stop offset="1"   stop-color="#081610"/>
      </radialGradient>
      <linearGradient id="rail-2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#1d1e22"/>
        <stop offset="1"   stop-color="#0f1014"/>
      </linearGradient>
    </defs>
    <!-- Rail extérieur (anthracite, pas du bois) -->
    <ellipse cx="600" cy="350" rx="552" ry="288" fill="url(#rail-2)"/>
    <ellipse cx="600" cy="350" rx="552" ry="288" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    <!-- Liseré or fin -->
    <ellipse cx="600" cy="350" rx="528" ry="266" fill="none" stroke="#d6b770" stroke-width="0.7" opacity="0.45"/>
    <!-- Feutre intérieur -->
    <ellipse cx="600" cy="350" rx="514" ry="254" fill="url(#felt-gradient-2)"/>
    <!-- Vignettage doux -->
    <ellipse cx="600" cy="350" rx="514" ry="254" fill="black" opacity="0.18" filter="url(#felt-grain)"/>
    <!-- Halo central très subtil -->
    <ellipse cx="600" cy="338" rx="240" ry="120" fill="rgba(255,255,255,0.025)"/>
    <!-- Ligne de mise discrète -->
    <ellipse cx="600" cy="350" rx="380" ry="194" fill="none"
             stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="2 6"/>
  </svg>`;
}

/**
 * Calcule les positions cartésiennes de N sièges autour d'un ovale donné.
 * @param {number} count nombre de sièges (typiquement 2..6)
 * @param {object} opts { rxRatio: 0.36, ryRatio: 0.46 } proportions relatives
 * @returns {Array<{x:number, y:number, angle:number}>} en pourcentages 0..1
 *
 * Le siège #0 est en bas (humain), puis sens anti-horaire.
 */
export function seatPositions(count) {
  const positions = [];
  const startAngle = Math.PI / 2;     // bas
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / count;
    const rx = 0.42, ry = 0.38;
    const x = 0.5 + rx * Math.cos(angle);
    const y = 0.5 + ry * Math.sin(angle);
    positions.push({ x, y, angle });
  }
  return positions;
}

/* ─────────────────────────────────────────────────────────── */
/* Avatars                                                     */
/* ─────────────────────────────────────────────────────────── */

const AVATAR_PALETTES = [
  { from: "#BF5AF2", to: "#5856D6", glyph: "fox" },     // 0 — humain
  { from: "#FF9F0A", to: "#FF375F", glyph: "owl" },     // 1 — Vega
  { from: "#30D158", to: "#FFD60A", glyph: "robot" },   // 2 — Nova
  { from: "#0A84FF", to: "#BF5AF2", glyph: "mask" },    // 3 — Atlas
  { from: "#FF453A", to: "#FFD60A", glyph: "star" },    // 4 — Echo
  { from: "#8E8E93", to: "#48484A", glyph: "shark" },   // 5 — Rune
];

/**
 * Avatar circulaire procédural. `seed` détermine la palette (modulo).
 */
export function renderAvatar(seed = 0) {
  const p = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
  const id = `g${seed}-${Math.floor(Math.random() * 1e6)}`;
  let glyph = "";
  switch (p.glyph) {
    case "fox":
      glyph = `<g fill="white">
        <path d="M30 56 L 36 36 L 50 46 L 64 36 L 70 56 z" opacity="0.92"/>
        <circle cx="42" cy="60" r="3"/><circle cx="58" cy="60" r="3"/>
        <path d="M50 68 L 46 72 L 54 72 z"/>
      </g>`;
      break;
    case "owl":
      glyph = `<g fill="white">
        <ellipse cx="50" cy="56" rx="22" ry="20"/>
        <circle cx="42" cy="54" r="6" fill="#1a1a1a"/><circle cx="58" cy="54" r="6" fill="#1a1a1a"/>
        <circle cx="42" cy="54" r="2"/><circle cx="58" cy="54" r="2"/>
        <path d="M46 64 L 50 70 L 54 64 z" fill="#FFD60A"/>
      </g>`;
      break;
    case "robot":
      glyph = `<g fill="white">
        <rect x="34" y="38" width="32" height="34" rx="6"/>
        <rect x="40" y="46" width="6" height="6" fill="#1a1a1a"/>
        <rect x="54" y="46" width="6" height="6" fill="#1a1a1a"/>
        <rect x="44" y="62" width="12" height="3" fill="#1a1a1a"/>
        <rect x="48" y="30" width="4" height="8"/>
        <circle cx="50" cy="28" r="3"/>
      </g>`;
      break;
    case "mask":
      glyph = `<g fill="white">
        <path d="M28 44 Q50 36 72 44 L 72 60 Q 60 76 50 70 Q 40 76 28 60 z"/>
        <ellipse cx="42" cy="54" rx="4" ry="6" fill="#1a1a1a"/>
        <ellipse cx="58" cy="54" rx="4" ry="6" fill="#1a1a1a"/>
      </g>`;
      break;
    case "star":
      glyph = `<polygon fill="white" points="50,28 56,46 76,46 60,58 66,76 50,66 34,76 40,58 24,46 44,46"/>`;
      break;
    case "shark":
      glyph = `<g fill="white">
        <path d="M22 56 L 50 38 L 78 56 L 70 60 L 60 62 L 60 68 L 50 64 L 40 68 L 40 62 L 30 60 z"/>
        <circle cx="44" cy="50" r="2.5" fill="#1a1a1a"/>
      </g>`;
      break;
    default:
      glyph = `<circle cx="50" cy="50" r="14" fill="white"/>`;
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="${id}" cx="0.3" cy="0.3" r="0.9">
        <stop offset="0" stop-color="${p.from}"/>
        <stop offset="1" stop-color="${p.to}"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#${id})"/>
    <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    ${glyph}
  </svg>`;
}

/* ─────────────────────────────────────────────────────────── */
/* QR Code (encodeur version 2 niveau L pour ~25 caractères)    */
/* Implémentation compacte — couvre ASCII alphanumérique.       */
/* ─────────────────────────────────────────────────────────── */

/**
 * Génère un QR SVG simple en mode "alphanumérique" (suffisant pour les URLs
 * courtes en majuscules + chiffres). Pas un encodeur générique : adapté au
 * cas d'usage (URL `marienour.work/casino/#/join/CODE`).
 *
 * Pour rester concis et 100 % autoporté, on délègue le rendu à un encodeur
 * minimal "byte mode" version 4..6 niveau L.
 */
export function renderQR(text) {
  const matrix = encodeQR(text);
  const N = matrix.length;
  const cell = 6;
  const pad = 12;
  const size = N * cell + pad * 2;
  let rects = "";
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${pad + c * cell}" y="${pad + r * cell}" width="${cell}" height="${cell}" fill="#0a1f1a"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="white"/>
    ${rects}
  </svg>`;
}

/* ── Encodeur QR (version 2..7 niveau L, byte mode) ─────────
 * Implémentation compacte basée sur la norme ISO/IEC 18004.
 * Suffisant pour ~30..100 caractères ASCII (URLs courtes).
 */
function encodeQR(text) {
  // Choix de la version : 4 (33×33) suffit pour ~80 octets en niveau L
  const data = new TextEncoder().encode(text);
  let version = 2;
  const cap = { 1: 17, 2: 32, 3: 53, 4: 78, 5: 106, 6: 134, 7: 154 };
  while (cap[version] < data.length + 2 && version < 7) version++;
  const N = 17 + version * 4;

  // Construction du flux binaire : header (mode byte=0100 + length) + data
  const lengthBits = version < 10 ? 8 : 16;
  const bits = [];
  pushBits(bits, 0b0100, 4);            // mode byte
  pushBits(bits, data.length, lengthBits);
  for (const b of data) pushBits(bits, b, 8);
  pushBits(bits, 0, 4);                 // terminator
  while (bits.length % 8) bits.push(0);

  // Conversion bits → octets
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    bytes.push(v);
  }
  // Padding pour atteindre la capacité totale
  const totalBytes = cap[version];
  const PAD = [0xEC, 0x11];
  let pi = 0;
  while (bytes.length < totalBytes) bytes.push(PAD[pi++ % 2]);

  // Reed-Solomon : niveau L approximé via une séquence d'EC fixe
  // Pour la simplicité on omet la correction (les lecteurs modernes tolèrent
  // jusqu'à 7% d'erreurs) : on remplit le reste avec 0 — fonctionne pour
  // affichage local. Pour un QR scanné par téléphone, l'app fournira aussi
  // le lien texte en clair (toujours visible).
  const ECLEN = { 2: 10, 3: 15, 4: 20, 5: 26, 6: 18, 7: 20 }[version];
  const ec = rsEncode(bytes, ECLEN);
  const codewords = bytes.concat(ec);

  // Construction de la matrice
  const m = Array.from({ length: N }, () => Array(N).fill(null));
  placeFinder(m, 0, 0);
  placeFinder(m, N - 7, 0);
  placeFinder(m, 0, N - 7);
  placeTimingPatterns(m);
  placeAlignment(m, version);
  placeDarkModule(m, version);
  reserveFormatInfo(m);

  // Placement des codewords (zig-zag depuis bas-droite)
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let r = 0; r < N; r++) {
      const row = upward ? N - 1 - r : r;
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx;
        if (m[row][c] !== null) continue;
        let bit = 0;
        if (bitIndex < totalBits) {
          bit = (codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
          bitIndex++;
        }
        m[row][c] = bit;
      }
    }
    upward = !upward;
  }

  // Application du masque 0 (i+j) % 2 == 0
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if ((r + c) % 2 === 0 && !isReserved(r, c, N, version)) {
      m[r][c] ^= 1;
    }
  }
  // Format info pour masque 0 + niveau L = 0b111011111000100
  placeFormatBits(m, 0b111011111000100);
  // Convertit nulls restants en 0
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) m[r][c] = m[r][c] ? 1 : 0;
  return m;
}

function pushBits(arr, val, n) {
  for (let i = n - 1; i >= 0; i--) arr.push((val >> i) & 1);
}
function placeFinder(m, r, c) {
  for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
    let v;
    if (dr === -1 || dc === -1 || dr === 7 || dc === 7) v = 0;
    else if (dr === 0 || dr === 6 || dc === 0 || dc === 6) v = 1;
    else if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) v = 1;
    else v = 0;
    m[rr][cc] = v;
  }
}
function placeTimingPatterns(m) {
  const N = m.length;
  for (let i = 8; i < N - 8; i++) {
    if (m[6][i] === null) m[6][i] = (i % 2 === 0) ? 1 : 0;
    if (m[i][6] === null) m[i][6] = (i % 2 === 0) ? 1 : 0;
  }
}
function placeAlignment(m, v) {
  const positions = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38]
  }[v] || [];
  for (const r of positions) for (const c of positions) {
    if ((r === 6 && c === 6) || (r === 6 && c === positions[positions.length - 1])
        || (r === positions[positions.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      let v2;
      if (Math.abs(dr) === 2 || Math.abs(dc) === 2) v2 = 1;
      else if (dr === 0 && dc === 0) v2 = 1;
      else v2 = 0;
      m[r + dr][c + dc] = v2;
    }
  }
}
function placeDarkModule(m, v) {
  m[4 * v + 9][8] = 1;
}
function reserveFormatInfo(m) {
  const N = m.length;
  for (let i = 0; i < 9; i++) { if (m[8][i] === null) m[8][i] = 0; if (m[i][8] === null) m[i][8] = 0; }
  for (let i = 0; i < 8; i++) { if (m[8][N - 1 - i] === null) m[8][N - 1 - i] = 0; if (m[N - 1 - i][8] === null) m[N - 1 - i][8] = 0; }
}
function placeFormatBits(m, fmt) {
  const N = m.length;
  for (let i = 0; i < 6; i++) m[i][8] = (fmt >> i) & 1;
  m[7][8] = (fmt >> 6) & 1;
  m[8][8] = (fmt >> 7) & 1;
  m[8][7] = (fmt >> 8) & 1;
  for (let i = 0; i < 6; i++) m[8][5 - i] = (fmt >> (9 + i)) & 1;
  for (let i = 0; i < 7; i++) m[N - 1 - i][8] = (fmt >> i) & 1;
  for (let i = 0; i < 8; i++) m[8][N - 8 + i] = (fmt >> (7 + i)) & 1;
}
function isReserved(r, c, N, v) {
  // Finder + separators + format
  if (r < 9 && c < 9) return true;
  if (r < 9 && c >= N - 8) return true;
  if (r >= N - 8 && c < 9) return true;
  // Timing
  if (r === 6 || c === 6) return true;
  // Alignment
  const positions = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38] }[v] || [];
  for (const ar of positions) for (const ac of positions) {
    if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
  }
  return false;
}

/* RS encoding — implémentation Galois-field GF(256) ─────────── */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]; }
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= gfMul(g[j], GF_EXP[i]);
    }
    g = ng;
  }
  return g;
}
function rsEncode(data, eclen) {
  const gen = rsGenerator(eclen);
  const buf = data.concat(new Array(eclen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = buf[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      buf[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return buf.slice(data.length);
}
