// decor.js — petits éléments du bureau, injectés automatiquement sur toute page qui charge ce fichier.
// Un seul endroit à modifier pour ajouter/retirer/ajuster un élément partout à la fois.
//
// Inclusion, juste avant </body> :
//   pages à la racine       -> <script src="decor.js"></script>
//   pages dans /billets/    -> <script src="../decor.js"></script>

(function () {
  const BASE = document.currentScript.src.replace(/decor\.js$/, ''); // s'adapte à la profondeur du dossier

  function img(cls, fichier, alt) {
    const el = document.createElement('img');
    el.className = cls;
    el.src = BASE + 'assets/decor/' + fichier;
    el.alt = alt || '';
    return el;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('main');
    const aside = document.querySelector('aside');
    const wrap = document.querySelector('.wrap');

    // ---- tasse de café, coin haut de main ----
    if (main) {
      main.prepend(img('decor-tasse', 'tasse.gif'));
    }

    // ---- enveloppe timbrée, accrochée au titre "blog et billet d'humeur" ----
if (main) {
  const isBilletsPage = window.location.pathname.includes('/billets/');

  if (isBilletsPage) {
    main.appendChild(img('decor-enveloppe-billet', 'enveloppe.png'));
  } else {
    const titres = Array.from(main.querySelectorAll('h2'));
    const h2Blog = titres.find(h => h.textContent.trim().toLowerCase().includes('billet'));
    if (h2Blog) {
      h2Blog.appendChild(img('decor-enveloppe', 'enveloppe.png'));
    }
  }
}

    // ---- carnet, gribouillis différent à chaque visite ----
    if (main) {
      const gribouillis = ['griffonnage-1.png', 'griffonnage-2.png', 'griffonnage-3.png'];
      const choix = gribouillis[Math.floor(Math.random() * gribouillis.length)];
      const cibleCarnet = main.querySelector('footer') || main;
      cibleCarnet.appendChild(img('decor-carnet', choix, 'un gribouillis du carnet'));
    }

    // ---- fenêtre jour/nuit selon l'heure locale du visiteur ----
    if (aside) {
      const heure = new Date().getHours();
      const nuit = heure < 7 || heure >= 20;
      aside.prepend(img('decor-fenetre', nuit ? 'fenetre-nuit.gif' : 'fenetre-jour.gif'));
    }

    // ---- chat qui dort, sous les blocs de la sidebar ----
    if (main) {
      main.appendChild(img('decor-chat', 'sleepingcat.gif', 'un chat qui dort'));
    }

    // ---- plante en pot, coin bas-gauche de toute la page ----
    if (wrap) {
      wrap.appendChild(img('decor-plante', 'plante.png'));
    }
  
    
    // ---- bulle de pensée du renard, au survol ----
    const renard = document.querySelector('.renard');
    if (renard) {
      const pensees = [
        'je me demande si les trains sont à l\'heure',
        'peut-être une pause café...',
        'il faudrait écrire une lettre à quelqu\'un',
        'chut, je réfléchis très fort.',
        'j\'ai encore perdu un gant',
        'le chat qui vit ici dort profondément'
      ];
      const pensee = pensees[Math.floor(Math.random() * pensees.length)];
 
      const bulle = document.createElement('div');
      bulle.className = 'renard-bulle';
 
      const petite = document.createElement('span');
      petite.className = 'bulle-petite';
      const moyenne = document.createElement('span');
      moyenne.className = 'bulle-moyenne';
      const grande = document.createElement('span');
      grande.className = 'bulle-grande';
      grande.textContent = pensee;
 
      bulle.append(petite, moyenne, grande);
      renard.parentNode.insertBefore(bulle, renard.nextSibling);
 
      renard.addEventListener('mouseenter', () => bulle.classList.add('visible'));
      renard.addEventListener('mouseleave', () => bulle.classList.remove('visible'));
    }
  });
})();