// Admin — page Demandes archivées (désarchiver / supprimer).
// Externalisé depuis demandes_archivees.html pour permettre une CSP stricte.
  const $ = (s) => document.querySelector(s);
  const demandesList = $("#demandesList");
  const demandesEmpty = $("#demandesEmpty");

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    } catch { return iso; }
  }

  function renderDemandes(items) {
    demandesList.innerHTML = "";
    if (!items.length) {
      demandesEmpty.hidden = false;
      return;
    }
    demandesEmpty.hidden = true;
    items.forEach((it) => {
      const li = document.createElement("li");
      li.className = "timeline-item is-archived";
      li.dataset.id = it.id;
      const archivedAt = it.archived_at ? ` · archivé ${fmtDate(it.archived_at)}` : "";
      li.innerHTML = `
        <div class="timeline-dot" aria-hidden="true"></div>
        <div class="timeline-body">
          <time class="timeline-time">${fmtDate(it.created_at)}${archivedAt}</time>
          <p class="timeline-text"></p>
          <div class="timeline-actions">
            <button type="button" class="btn-ghost btn-xs" data-act="unarchive">Désarchiver</button>
            <button type="button" class="btn-ghost btn-xs btn-danger" data-act="delete">Supprimer</button>
          </div>
        </div>`;
      li.querySelector(".timeline-text").textContent = it.text;
      demandesList.appendChild(li);
    });
  }

  async function loadDemandes() {
    try {
      const r = await fetch("/api/demandes-modifs?archived=1");
      const d = await r.json();
      if (d.ok) renderDemandes(d.items || []);
    } catch {}
  }
  loadDemandes();

  demandesList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const li = btn.closest(".timeline-item");
    if (!li) return;
    const id = li.dataset.id;
    const act = btn.dataset.act;

    if (act === "unarchive") {
      try {
        const r = await fetch("/api/demandes-modifs/" + encodeURIComponent(id) + "/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: false }),
        });
        const d = await r.json();
        if (d.ok) loadDemandes();
        else alert("Erreur : " + (d.error || "?"));
      } catch (err) {
        alert("Erreur réseau : " + err.message);
      }
    } else if (act === "delete") {
      if (!confirm("Supprimer définitivement cette demande ?")) return;
      try {
        const r = await fetch("/api/demandes-modifs/" + encodeURIComponent(id), {
          method: "DELETE",
        });
        const d = await r.json();
        if (d.ok) loadDemandes();
        else alert("Erreur : " + (d.error || "?"));
      } catch (err) {
        alert("Erreur réseau : " + err.message);
      }
    }
  });
