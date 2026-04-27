/**
 * casino-menu.js — Vue d'accueil "Casino" en thème light (style Portfolio).
 *
 * Inspiré de la page /apps du Portfolio :
 * - Fond off-white
 * - Typo Space Grotesk éditoriale
 * - Liste des jeux numérotés avec ligne d'accent au hover
 * - Tags JetBrains Mono uppercase
 */

import { renderAvatar } from "./svg-assets.js";
import { formatChips } from "./ui.js";

const GAMES = [
  {
    id: "holdem",
    name: "Texas Hold'em",
    tagline: "No-Limit. Solo contre 5 IA, ou en privé entre amis avec un lien d'invitation.",
    accent: "#b89b5e",
    available: true,
    tags: ["poker", "no-limit", "multi"],
  },
  {
    id: "blackjack",
    name: "Blackjack",
    tagline: "21 contre le croupier. Sabots de 6 jeux, split & double, blackjack 3:2.",
    accent: "#446bd6",
    available: true,
    tags: ["cartes", "vs croupier"],
  },
  {
    id: "roulette",
    name: "Roulette",
    tagline: "Européenne (1 zéro). Pleins, chevaux, transversales, douzaines, colonnes, simples.",
    accent: "#a8443a",
    available: true,
    tags: ["roulette", "mises libres"],
  },
  {
    id: "memory",
    name: "Memory",
    tagline: "8 paires chronométrées. Multiplicateur jusqu'à ×3 selon temps & coups.",
    accent: "#2e7a48",
    available: true,
    tags: ["paires", "chrono", "réflexe"],
  },
];

export function renderCasinoMenu(root, { user, onPick, onAdmin, onLogout, onSettings, onInvite }) {
  document.body.classList.add("theme-light");

  const isAdmin = !!user?.is_admin;
  const eyebrow = `Index · ${GAMES.length} jeu${GAMES.length > 1 ? "x" : ""} · ${new Date().getFullYear()}`;

  root.innerHTML = `
    <section class="casino-page">
      <header class="casino-topbar">
        <div class="casino-brand">Casino<span class="casino-brand-dot">.</span></div>
        <nav class="casino-topbar-nav">
          <a href="#/" class="is-active">Index</a>
          ${user ? `<button data-act="settings">Réglages</button>` : ""}
          ${isAdmin ? `<button data-act="admin">Admin</button>` : ""}
          ${user ? `<button data-act="logout">Déconnexion</button>` : `<button data-act="login">Connexion</button>`}
        </nav>
      </header>

      <section class="casino-hero">
        <div class="casino-eyebrow-mono">${eyebrow}</div>
        <h1 class="casino-h1">Tous les jeux,<br><em>dans l'ordre.</em></h1>
        ${user ? `
          <p class="casino-sub">
            ${escapeHtml(user.name)}, tu disposes de
            <strong style="color:#b89b5e">${formatChips(user.chips)} jetons</strong>
            sur ton compte${isAdmin ? `. Tu peux inviter des joueurs et leur attribuer des jetons depuis l'espace admin.` : `.`}
          </p>
        ` : `
          <p class="casino-sub">Joue en mode invité (jetons locaux) ou connecte-toi avec ton lien d'invitation pour suivre ton solde.</p>
        `}
      </section>

      <ul class="games-list">
        ${GAMES.map((g, i) => `
          <button class="games-row"
                  data-game="${g.id}"
                  ${!g.available ? "disabled" : ""}
                  style="--accent:${g.accent}">
            <span class="games-num">${String(i + 1).padStart(2, "0")}</span>
            <span class="games-swatch" style="background:${g.accent}"></span>
            <div class="games-meta">
              <h2 class="games-name">${g.name}</h2>
              <p class="games-tagline">${g.tagline}</p>
            </div>
            <div class="games-tags">
              ${g.tags.map(t => `<span class="games-tag">${t}</span>`).join("")}
            </div>
            ${g.available
              ? `<span class="games-arrow">↗</span>`
              : `<span class="games-soon-badge">Bientôt</span>`}
          </button>
        `).join("")}
      </ul>

      <footer class="casino-foot">
        <div>© ${new Date().getFullYear()} · Casino · Marie Nour</div>
        <div class="casino-foot-actions">
          ${user ? `
            ${isAdmin ? `<button data-act="invite">Inviter</button>` : ""}
            <button data-act="settings">Réglages</button>
          ` : `
            <button data-act="login">Connexion</button>
          `}
        </div>
        ${user ? `
          <div class="casino-userpill">
            <span class="pill-name">${escapeHtml(user.name)}</span>
            <span class="pill-chips">${formatChips(user.chips)} jetons</span>
            <span class="pill-avatar">${renderAvatar(user.avatar_seed || 0)}</span>
          </div>
        ` : `<div></div>`}
      </footer>
    </section>
  `;

  root.addEventListener("click", e => {
    const game = e.target.closest("[data-game]")?.dataset.game;
    if (game) { onPick?.(game); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "logout")        onLogout?.();
    else if (act === "login")    onLogout?.("login");
    else if (act === "settings") onSettings?.();
    else if (act === "admin")    onAdmin?.();
    else if (act === "invite")   onInvite?.();
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
