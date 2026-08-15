// blog.js — affiche la liste des billets à partir de billets/billets.json
// dans n'importe quel conteneur <div class="billets-liste"></div>.
//
// Pour ajouter un billet : ajoute une entrée dans billets/billets.json,
// c'est tout. index.html et billets.html se mettent à jour tout seuls,
// aucun risque d'oublier l'un des deux.
//
// Astuce : mets data-limit="3" sur le conteneur pour n'afficher que les
// 3 billets les plus récents (utile sur la page d'accueil par exemple).
// Sans data-limit, tous les billets sont affichés, du plus récent au plus ancien.
//
// Inclusion, juste avant </body>, avec commun.js :
//   <script src="blog.js"></script>

(function () {
  const BASE = document.currentScript.src.replace(/blog\.js$/, '');

  document.addEventListener('DOMContentLoaded', () => {
    const conteneurs = document.querySelectorAll('.billets-liste');
    if (!conteneurs.length) return;

    fetch(BASE + 'billets/billets.json')
      .then(r => r.json())
      .then(billets => {
        const tries = [...billets].sort((a, b) => b.date.localeCompare(a.date));

        conteneurs.forEach(conteneur => {
          const limite = parseInt(conteneur.dataset.limit, 10);
          const aAfficher = Number.isNaN(limite) ? tries : tries.slice(0, limite);

          conteneur.innerHTML = aAfficher.map(b => `
    <div class="billet">
      <span class="date">${b.date_affichee}</span>
      <h3><a href="${BASE}billets/${b.slug}.html">${b.titre}</a></h3>
    </div>`).join('\n');
        });
      })
      .catch(() => {
        conteneurs.forEach(c => {
          c.innerHTML = '<p class="tagline">impossible de charger les billets pour le moment.</p>';
        });
      });
  });
})();
