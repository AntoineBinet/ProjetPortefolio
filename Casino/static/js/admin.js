/**
 * admin.js — Dashboard admin Casino : users + invites + jetons.
 */

import * as api from "./auth.js";
import { renderAvatar } from "./svg-assets.js";
import { formatChips, openModal, toast } from "./ui.js";

export function renderAdminDashboard(root, { onBack, onUserChanged }) {
  root.innerHTML = `
    <section class="admin-page">
      <header class="admin-topbar">
        <div style="display:flex;align-items:center;gap:14px">
          <button data-act="back" style="background:none;border:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.10em;text-transform:uppercase;color:#737373;padding:6px 0">← Casino</button>
          <h1 class="admin-h1">Espace admin</h1>
        </div>
        <button data-act="new-invite" style="font:inherit;padding:9px 16px;border-radius:8px;background:#0a0a0a;color:#fbfaf7;border:none;cursor:pointer;font-size:13px;font-weight:500">+ Nouvelle invitation</button>
      </header>

      <div class="admin-grid">
        <section class="admin-section">
          <div class="admin-section-head">
            <h2>Joueurs</h2>
            <span class="admin-count" id="usersCount">…</span>
          </div>
          <div class="admin-list" id="usersList">
            <div class="admin-loading">Chargement…</div>
          </div>
        </section>

        <section class="admin-section">
          <div class="admin-section-head">
            <h2>Invitations</h2>
            <span class="admin-count" id="invitesCount">…</span>
          </div>
          <div class="admin-list" id="invitesList">
            <div class="admin-loading">Chargement…</div>
          </div>
        </section>
      </div>
    </section>
  `;

  root.querySelector('[data-act="back"]').addEventListener("click", () => onBack?.());
  root.querySelector('[data-act="new-invite"]').addEventListener("click", () => openInviteModal());

  refresh();

  async function refresh() {
    const [u, inv] = await Promise.all([api.listUsers(), api.listInvites()]);
    if (u.ok) renderUsers(u.users);
    if (inv.ok) renderInvites(inv.invites);
  }

  function renderUsers(users) {
    root.querySelector("#usersCount").textContent = `${users.length} joueur${users.length > 1 ? "s" : ""}`;
    const list = root.querySelector("#usersList");
    if (!users.length) {
      list.innerHTML = `<p class="admin-empty">Aucun joueur encore.</p>`;
      return;
    }
    list.innerHTML = users.map(u => `
      <div class="admin-row" data-uid="${u.id}">
        <div class="admin-row-avatar">${renderAvatar(u.avatar_seed || 0)}</div>
        <div class="admin-row-meta">
          <div class="admin-row-name">${escapeHtml(u.name)}${u.is_admin ? `<span class="ch-pill ch-pill--admin">ADMIN</span>` : ""}</div>
          <div class="admin-row-sub">${u.last_seen ? `Vu ${timeAgo(u.last_seen)}` : "Jamais connecté"} · Créé ${timeAgo(u.created_at)}</div>
          ${u.notes ? `<div class="admin-row-note">${escapeHtml(u.notes)}</div>` : ""}
        </div>
        <div class="admin-row-chips">
          <span class="chips-amount">${formatChips(u.chips)}</span>
          <span class="chips-label">jetons</span>
        </div>
        <div class="admin-row-actions">
          <button class="btn btn--sm" data-edit-chips>Jetons</button>
          <button class="btn btn--sm btn--ghost" data-edit-user>Détails</button>
          ${u.is_admin ? "" : `<button class="btn btn--sm btn--ghost" data-del-user title="Supprimer">×</button>`}
        </div>
      </div>
    `).join("");

    list.querySelectorAll("[data-edit-chips]").forEach(b =>
      b.addEventListener("click", e => editChips(b.closest("[data-uid]").dataset.uid)));
    list.querySelectorAll("[data-edit-user]").forEach(b =>
      b.addEventListener("click", e => editUser(b.closest("[data-uid]").dataset.uid, users)));
    list.querySelectorAll("[data-del-user]").forEach(b =>
      b.addEventListener("click", e => deleteUser(b.closest("[data-uid]").dataset.uid, users)));
  }

  function renderInvites(invites) {
    const active = invites.filter(i => !i.used_by && (!i.expires_at || i.expires_at > Date.now() / 1000));
    root.querySelector("#invitesCount").textContent =
      `${active.length} active${active.length > 1 ? "s" : ""} · ${invites.length} total`;
    const list = root.querySelector("#invitesList");
    if (!invites.length) {
      list.innerHTML = `<p class="admin-empty">Aucune invitation. Crée-en une avec le bouton + en haut.</p>`;
      return;
    }
    list.innerHTML = invites.map(inv => {
      const used = inv.used_by != null;
      const expired = inv.expires_at && inv.expires_at < Date.now() / 1000;
      const url = inviteUrl(inv.id);
      return `
        <div class="admin-invite ${used ? "is-used" : expired ? "is-expired" : "is-active"}" data-iid="${inv.id}">
          <div class="admin-invite-meta">
            <div class="admin-invite-status">
              ${used ? `<span class="ch-pill">UTILISÉE</span>` : expired ? `<span class="ch-pill">EXPIRÉE</span>` : `<span class="ch-pill ch-pill--ready">ACTIVE</span>`}
              <span class="admin-invite-chips">${formatChips(inv.starting_chips)} jetons</span>
              ${inv.note ? `· <span class="admin-invite-note">${escapeHtml(inv.note)}</span>` : ""}
            </div>
            ${!used && !expired ? `
              <div class="admin-invite-link">
                <code>${escapeHtml(url)}</code>
                <button class="btn btn--sm" data-copy-url>Copier le lien</button>
              </div>
              <div class="admin-invite-code">
                Code à donner : <strong>${inv.code}</strong>
                <button class="btn btn--sm" data-copy-code>Copier le code</button>
              </div>
            ` : `<div class="admin-invite-meta-faded">Créée ${timeAgo(inv.created_at)}</div>`}
          </div>
          ${!used ? `<button class="btn btn--icon btn--ghost" data-del-invite title="Révoquer">×</button>` : ""}
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-copy-url]").forEach(b => b.addEventListener("click", () => {
      const iid = b.closest("[data-iid]").dataset.iid;
      navigator.clipboard?.writeText(inviteUrl(iid)).then(() => toast("Lien copié", "ok"));
    }));
    list.querySelectorAll("[data-copy-code]").forEach(b => b.addEventListener("click", () => {
      const iid = b.closest("[data-iid]").dataset.iid;
      const inv = invites.find(i => i.id === iid);
      navigator.clipboard?.writeText(inv.code).then(() => toast("Code copié", "ok"));
    }));
    list.querySelectorAll("[data-del-invite]").forEach(b => b.addEventListener("click", async () => {
      const iid = b.closest("[data-iid]").dataset.iid;
      if (!confirm("Révoquer cette invitation ?")) return;
      await api.deleteInvite(iid);
      toast("Invitation révoquée", "ok");
      refresh();
    }));
  }

  function openInviteModal() {
    openModal(`
      <h2>Nouvelle invitation</h2>
      <p>Le lien et le code doivent être transmis séparément. Le code expire à l'utilisation.</p>
      <div class="field"><label>Note interne (qui ?)</label>
        <input class="input" id="invNote" maxlength="60" placeholder="Marie, Jean…"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
        <div class="field"><label>Jetons de départ</label>
          <input class="input" id="invChips" type="number" min="0" value="3000"></div>
        <div class="field"><label>Validité (heures)</label>
          <input class="input" id="invTtl" type="number" min="1" max="720" value="168"></div>
      </div>
      <div class="toggle-row">
        <span class="toggle-label">Accorder droits admin</span>
        <div class="toggle" id="invAdminTg"></div>
      </div>
      <div class="modal-row">
        <button class="btn btn--ghost btn--full" data-close>Annuler</button>
        <button class="btn btn--primary btn--full" id="invCreate">Créer l'invitation</button>
      </div>
    `);
    const tg = document.getElementById("invAdminTg");
    tg.addEventListener("click", () => tg.classList.toggle("is-on"));
    document.getElementById("invCreate").addEventListener("click", async () => {
      const r = await api.createInvite({
        note: document.getElementById("invNote").value,
        starting_chips: parseInt(document.getElementById("invChips").value, 10) || 0,
        ttl_hours: parseInt(document.getElementById("invTtl").value, 10) || 168,
        is_admin: tg.classList.contains("is-on"),
      });
      if (!r.ok) return toast(r.error || "Erreur", "err");
      document.getElementById("modal-root").innerHTML = "";
      showInviteResult(r.invite);
      refresh();
    });
  }

  function showInviteResult(inv) {
    const url = inviteUrl(inv.id);
    openModal(`
      <h2>Invitation prête</h2>
      <p>Donne ces deux éléments à ton ami — séparément si possible (un par message).</p>
      <div class="field"><label>1. Lien (URL)</label>
        <div class="lobby-link"><span>${escapeHtml(url)}</span>
          <button class="btn btn--sm" data-copy-url>Copier</button></div></div>
      <div class="field" style="margin-top:14px"><label>2. Code de confirmation</label>
        <div class="invite-code-big">${inv.code}
          <button class="btn btn--sm" data-copy-code>Copier</button></div></div>
      <p class="muted" style="margin-top:14px;color:var(--ink-mute);font-size:12px">
        Le code expire à la première utilisation. Validité : ${Math.round((inv.expires_at - Date.now() / 1000) / 3600)}h.
      </p>
      <div class="modal-row">
        <button class="btn btn--primary btn--full" data-close>OK</button>
      </div>
    `);
    document.querySelector("[data-copy-url]").addEventListener("click", () =>
      navigator.clipboard?.writeText(url).then(() => toast("Lien copié", "ok")));
    document.querySelector("[data-copy-code]").addEventListener("click", () =>
      navigator.clipboard?.writeText(inv.code).then(() => toast("Code copié", "ok")));
  }

  function editChips(uid) {
    const list = [...root.querySelectorAll(".admin-row")];
    const row = list.find(r => r.dataset.uid === uid);
    const name = row?.querySelector(".admin-row-name")?.textContent.trim();
    openModal(`
      <h2>Jetons · ${escapeHtml(name)}</h2>
      <p>Modifie le solde de ce joueur. L'opération est tracée dans l'historique.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label>Ajouter / Retirer</label>
          <input class="input" id="chDelta" type="number" placeholder="+500 ou -1000"></div>
        <div class="field"><label>Définir directement</label>
          <input class="input" id="chSet" type="number" min="0" placeholder="2000"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Raison</label>
        <input class="input" id="chReason" maxlength="100" placeholder="Recharge initiale, prime…"></div>
      <div class="modal-row">
        <button class="btn btn--ghost btn--full" data-close>Annuler</button>
        <button class="btn btn--primary btn--full" id="chApply">Appliquer</button>
      </div>
    `);
    document.getElementById("chApply").addEventListener("click", async () => {
      const delta = parseInt(document.getElementById("chDelta").value, 10);
      const setV  = document.getElementById("chSet").value;
      const reason = document.getElementById("chReason").value;
      const opts = { reason };
      if (delta) opts.delta = delta;
      else if (setV !== "") opts.set = parseInt(setV, 10);
      else return toast("Indique un delta ou une valeur", "err");
      const r = await api.setChips(uid, opts);
      if (!r.ok) return toast(r.error || "Erreur", "err");
      toast(`Solde : ${formatChips(r.chips)}`, "ok");
      document.getElementById("modal-root").innerHTML = "";
      refresh();
      onUserChanged?.();
    });
  }

  function editUser(uid, users) {
    const u = users.find(x => x.id === uid);
    if (!u) return;
    openModal(`
      <h2>Détails · ${escapeHtml(u.name)}</h2>
      <div class="field"><label>Pseudo</label>
        <input class="input" id="euName" maxlength="24" value="${escapeAttr(u.name)}"></div>
      <div class="field" style="margin-top:10px"><label>Notes (privées)</label>
        <textarea class="input" id="euNotes" maxlength="500" rows="3" placeholder="Notes admin">${escapeHtml(u.notes || "")}</textarea></div>
      ${u.is_admin ? `<p style="color:var(--ink-mute);font-size:12px;margin-top:10px">Admin — droits non modifiables ici.</p>` : ""}
      <div class="modal-row">
        <button class="btn btn--ghost btn--full" data-close>Annuler</button>
        <button class="btn btn--primary btn--full" id="euApply">Enregistrer</button>
      </div>
    `);
    document.getElementById("euApply").addEventListener("click", async () => {
      const r = await api.updateUser(uid, {
        name: document.getElementById("euName").value,
        notes: document.getElementById("euNotes").value,
      });
      if (!r.ok) return toast(r.error || "Erreur", "err");
      toast("Profil mis à jour", "ok");
      document.getElementById("modal-root").innerHTML = "";
      refresh();
      onUserChanged?.();
    });
  }

  async function deleteUser(uid, users) {
    const u = users.find(x => x.id === uid);
    if (!u) return;
    if (!confirm(`Supprimer définitivement ${u.name} ? Les sessions actives seront fermées.`)) return;
    const r = await api.deleteUser(uid);
    if (!r.ok) return toast(r.error || "Erreur", "err");
    toast(`${u.name} supprimé`, "ok");
    refresh();
    onUserChanged?.();
  }
}

function inviteUrl(iid) {
  return `${location.origin}/casino/#/invite/${iid}`;
}
function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 30 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(ts * 1000).toLocaleDateString("fr-FR");
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }
