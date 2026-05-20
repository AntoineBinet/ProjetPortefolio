// Pages d'erreur 404 / 500 — bouton « Réparer & redémarrer » (+ recharger sur 500).
// Externalisé des templates pour permettre une CSP stricte (script-src 'self').
(function () {
  const btnReload = document.getElementById('btnReload');
  if (btnReload) btnReload.addEventListener('click', () => location.reload());

  const btnRepair = document.getElementById('btnRepair');
  if (!btnRepair) return;
  btnRepair.addEventListener('click', async () => {
    if (!confirm("Pull origin/main + redémarrage du serveur ?")) return;
    const status = document.getElementById('repairStatus');
    status.textContent = "Mise à jour en cours…";
    try {
      const r = await fetch("/api/deploy/pull-from-404", { method: "POST" });
      if (r.status === 401) {
        status.textContent = "Connexion admin requise — redirection…";
        setTimeout(() => location.href = "/login?next=/admin/parametres", 900);
        return;
      }
      const d = await r.json();
      status.textContent = d.ok ? d.message : ("Erreur : " + d.error);
      if (d.ok) setTimeout(() => location.href = "/", 8000);
    } catch (e) {
      status.textContent = "Erreur réseau : " + e.message;
    }
  });
})();
