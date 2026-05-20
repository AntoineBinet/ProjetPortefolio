// Admin — page Paramètres serveur (MAJ / rollback / restart / ProspUp / demandes).
// Externalisé depuis parametres.html pour permettre une CSP stricte (script-src 'self').
  const $ = (s) => document.querySelector(s);
  const log = $("#log");
  const status = $("#status");

  async function refreshHealth() {
    try {
      const r = await fetch("/api/deploy/health");
      const d = await r.json();
      $("#curHash").textContent = d.current_hash || "?";
      $("#curRollback").textContent = d.can_rollback ? `oui (${d.rollback_hash})` : "non";
    } catch {}
  }
  refreshHealth();

  $("#btnPull").addEventListener("click", async () => {
    log.hidden = false; log.textContent = ""; status.textContent = "Pull en cours…";
    const r = await fetch("/api/deploy/pull", { method: "POST" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      status.textContent = "Erreur : " + (d.error || ("HTTP " + r.status));
      return;
    }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const ev = buf.slice(0, idx); buf = buf.slice(idx + 2);
        if (!ev.startsWith("data:")) continue;
        try {
          const d = JSON.parse(ev.slice(5).trim());
          if (d.line) log.textContent += d.line + "\n";
          if (d.message) log.textContent += "→ " + d.message + "\n";
          if (d.error) { log.textContent += "ERREUR : " + d.error + "\n"; status.textContent = "Erreur"; }
          if (d.step === "done") {
            status.textContent = d.updated ? "MAJ OK — redémarrage…" : "Déjà à jour";
            if (d.updated) setTimeout(() => location.reload(), 12000);
          }
        } catch {}
        log.scrollTop = log.scrollHeight;
      }
    }
  });

  $("#btnRollback").addEventListener("click", async () => {
    if (!confirm("Rollback vers le commit précédent ?")) return;
    status.textContent = "Rollback…";
    const r = await fetch("/api/deploy/rollback", { method: "POST" });
    const d = await r.json();
    status.textContent = d.ok ? d.message : ("Erreur : " + d.error);
    if (d.ok) setTimeout(() => location.reload(), 7000);
  });

  $("#btnRestart").addEventListener("click", async () => {
    if (!confirm("Redémarrer le serveur ?")) return;
    status.textContent = "Redémarrage…";
    const r = await fetch("/api/deploy/restart", { method: "POST" });
    const d = await r.json();
    status.textContent = d.ok ? d.message : ("Erreur : " + d.error);
    if (d.ok) setTimeout(() => location.reload(), 7000);
  });

  // ProspUp section
  async function checkProspup() {
    try {
      const r = await fetch("/api/deploy/prospup-status");
      const d = await r.json();
      const st = $("#prospupStatus");
      const btn = $("#btnProspup");
      if (d.running) {
        st.textContent = "✓ ProspUp tourne sur le port 8000";
        st.style.color = "var(--green, #16a34a)";
        btn.disabled = true;
      } else {
        st.textContent = "⚠ ProspUp ne répond pas sur le port 8000";
        st.style.color = "var(--red, #dc2626)";
        btn.disabled = false;
      }
    } catch {
      $("#prospupStatus").textContent = "Impossible de vérifier le statut";
    }
  }
  checkProspup();

  $("#btnProspup").addEventListener("click", async () => {
    const btn = $("#btnProspup");
    const plog = $("#prospupLog");
    const st = $("#prospupStatus");
    btn.disabled = true;
    st.textContent = "Lancement en cours…";
    plog.hidden = false;
    plog.textContent = "";
    try {
      const r = await fetch("/api/deploy/launch-prospup", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        plog.textContent = (d.log || []).join("\n") + "\nPID : " + d.pid;
        st.textContent = "ProspUp lancé — attends 20 s avant de vérifier";
        st.style.color = "";
        setTimeout(checkProspup, 20000);
      } else {
        plog.textContent = "Erreur : " + (d.error || JSON.stringify(d));
        if (d.log) plog.textContent += "\n" + d.log.join("\n");
        st.textContent = "Échec du lancement";
        st.style.color = "var(--red, #dc2626)";
        btn.disabled = false;
      }
    } catch (e) {
      plog.textContent = "Erreur réseau : " + e.message;
      btn.disabled = false;
    }
  });

  // Demandes de modifications (timeline)
  const demandesList = $("#demandesList");
  const demandesEmpty = $("#demandesEmpty");
  const demandeText = $("#demandeText");
  const demandeStatus = $("#demandeStatus");

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
      li.className = "timeline-item";
      li.dataset.id = it.id;
      const updated = it.updated_at && it.updated_at !== it.created_at
        ? ` · modif. ${fmtDate(it.updated_at)}`
        : "";
      li.innerHTML = `
        <div class="timeline-dot" aria-hidden="true"></div>
        <div class="timeline-body">
          <time class="timeline-time">${fmtDate(it.created_at)}${updated}</time>
          <p class="timeline-text"></p>
          <div class="timeline-actions">
            <button type="button" class="btn-ghost btn-xs" data-act="edit">Modifier</button>
            <button type="button" class="btn-ghost btn-xs" data-act="archive">Archiver</button>
          </div>
        </div>`;
      li.querySelector(".timeline-text").textContent = it.text;
      demandesList.appendChild(li);
    });
  }

  async function loadDemandes() {
    try {
      const r = await fetch("/api/demandes-modifs");
      const d = await r.json();
      if (d.ok) renderDemandes(d.items || []);
    } catch {}
  }
  loadDemandes();

  $("#formDemande").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = demandeText.value.trim();
    if (!text) return;
    demandeStatus.textContent = "Enregistrement…";
    demandeStatus.style.color = "";
    try {
      const r = await fetch("/api/demandes-modifs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (d.ok) {
        demandeText.value = "";
        demandeStatus.textContent = "✓ Ajouté";
        demandeStatus.style.color = "var(--green, #16a34a)";
        loadDemandes();
        setTimeout(() => { demandeStatus.textContent = ""; }, 2000);
      } else {
        demandeStatus.textContent = "Erreur : " + (d.error || "?");
        demandeStatus.style.color = "var(--red, #dc2626)";
      }
    } catch (err) {
      demandeStatus.textContent = "Erreur réseau : " + err.message;
      demandeStatus.style.color = "var(--red, #dc2626)";
    }
  });

  demandesList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const li = btn.closest(".timeline-item");
    if (!li) return;
    const id = li.dataset.id;
    const act = btn.dataset.act;

    if (act === "edit") {
      const p = li.querySelector(".timeline-text");
      const current = p.textContent;
      const next = prompt("Modifier la demande :", current);
      if (next === null) return;
      const text = next.trim();
      if (!text || text === current) return;
      try {
        const r = await fetch("/api/demandes-modifs/" + encodeURIComponent(id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const d = await r.json();
        if (d.ok) loadDemandes();
        else alert("Erreur : " + (d.error || "?"));
      } catch (err) {
        alert("Erreur réseau : " + err.message);
      }
    } else if (act === "archive") {
      try {
        const r = await fetch("/api/demandes-modifs/" + encodeURIComponent(id) + "/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        const d = await r.json();
        if (d.ok) loadDemandes();
        else alert("Erreur : " + (d.error || "?"));
      } catch (err) {
        alert("Erreur réseau : " + err.message);
      }
    }
  });

  // Password change
  $("#formPass").addEventListener("submit", async (e) => {
    e.preventDefault();
    const oldPass = $("#oldPass").value;
    const pass = $("#newPass").value;
    const confirm = $("#confirmPass").value;
    const st = $("#passStatus");
    if (pass !== confirm) {
      st.textContent = "Les mots de passe ne correspondent pas";
      st.style.color = "var(--red, #dc2626)";
      return;
    }
    st.textContent = "Mise à jour…";
    st.style.color = "";
    try {
      const r = await fetch("/api/deploy/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_password: oldPass, password: pass }),
      });
      let d;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok || !d) {
        if (r.status === 401) {
          st.textContent = "Session expirée — recharge la page et reconnecte-toi";
        } else {
          st.textContent = "Erreur serveur (" + r.status + ")";
        }
        st.style.color = "var(--red, #dc2626)";
        return;
      }
      if (d.ok) {
        st.textContent = "✓ " + d.message;
        st.style.color = "var(--green, #16a34a)";
        $("#oldPass").value = "";
        $("#newPass").value = "";
        $("#confirmPass").value = "";
        setTimeout(() => location.reload(), 1200);
      } else {
        st.textContent = "Erreur : " + d.error;
        st.style.color = "var(--red, #dc2626)";
      }
    } catch (e) {
      st.textContent = "Erreur réseau : " + e.message;
      st.style.color = "var(--red, #dc2626)";
    }
  });
