// Page d'urgence « Relancer ProspUp » — servie par GET /api/deploy/launch-prospup.
// Externalisé pour permettre une CSP stricte (plus de script ni de onclick inline).
document.getElementById('btn').addEventListener('click', function () {
  var btn = document.getElementById('btn');
  var out = document.getElementById('out');
  btn.disabled = true;
  out.textContent = 'Lancement en cours...';
  fetch('/api/deploy/launch-prospup', { method: 'POST' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      out.className = d.ok ? 'ok' : 'err';
      out.textContent = JSON.stringify(d, null, 2);
      if (d.ok) { out.textContent += ' ProspUp en cours de demarrage. Attends 20 s.'; }
    })
    .catch(function (e) {
      out.className = 'err';
      out.textContent = 'Erreur : ' + e.message;
      btn.disabled = false;
    });
});
