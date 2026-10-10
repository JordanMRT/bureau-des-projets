// commun.js — header, bandeau "en ce moment" (avec le renard), pied de page,
// sidebar (aside), statut, spotify et date de mise à jour, injectés
// automatiquement sur toute page qui charge ce fichier.
// Un seul endroit à modifier pour changer un lien, un texte commun ou une clé
// Supabase, plutôt que de répéter le même bloc sur chaque page HTML.
//
// Une page n'a besoin que de <main> (son contenu) et <aside></aside>.
// Inclusion, juste avant </body> :
//   pages à la racine    -> <script src="commun.js"></script>
//   pages dans /billets/  -> <script src="../commun.js"></script>
//
// Pour changer un lien de nav ou un lien externe : modifie PAGES ou
// LIENS_EXTERNES juste en dessous, ça se répercute dans le header ET la sidebar.

(function () {
  const BASE = document.currentScript.src.replace(/commun\.js$/, '');
  const REPO = 'JordanMRT/bureau-des-projets';
  const PORTFOLIO_URL = 'https://jordanmrt.github.io/';

  // Exposé pour les autres scripts du site (ex. l'éditeur de billets)
  window.BUREAU = { BASE, REPO };

  // Configuration Supabase — à remplir avec tes vraies valeurs
  // (visibles dans Project Settings > API sur ton dashboard Supabase)
  const SUPABASE_URL = 'https://fdbycrkflickpcjcihwl.supabase.co'; // ex: 'https://xxxxxxxx.supabase.co'
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkYnljcmtmbGlja3BjamNpaHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjEyMjksImV4cCI6MjEwMjA5NzIyOX0.qNdWKplToaJJVHvFc2h0MpgJ9tQRab8vMPpUU4r8SCE'; // la clé "anon public", pas la service_role !

  async function supabaseSelect(table) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&id=eq.1`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  // ---- liens : une seule liste, utilisée par le header ET la sidebar ----
  const PAGES = [
    { page: 'index.html',   label: 'accueil' },
    { page: 'billets.html', label: 'tous les billets' },
    { page: 'about.html',   label: 'à propos' },
  ];
  const LIENS_EXTERNES = [
    { url: 'https://github.com/JordanMRT',    label: 'github' },
    { url: 'http://instagram.com/jordan.mrt', label: 'instagram' },
  ];

  // ---- bandeau "en ce moment" et pied de page, communs à toutes les pages ----
  const STATUT_HTML = `
    <div class="statut">en ce moment : <b id="statut-live">chargement…</b>
    <img class="renard" src="${BASE}assets/decor/renard.gif" alt="petit renard, mascotte du site">
    </div>
  `;
  const FOOTER_HTML = `
    <hr>

    <footer>
      fait à la main, sans framework — dernière mise à jour le <span id="derniere-maj">chargement…</span>
    </footer>
  `;

  // ---- header : logo, statut et menu. Modifie ici pour que ça change PARTOUT ----
  function construireHeader() {
    const chemin = location.pathname;
    const fichier = chemin.split('/').pop() || 'index.html';
    const dansBillets = chemin.includes('/billets/');
    const actif = page => {
      const estActif = page === 'billets.html' ? (fichier === page || dansBillets) : fichier === page;
      return estActif ? ' actif' : '';
    };
    return `
      <div class="header-haut">
        <button class="header-dots" type="button" aria-label="aller à la colonne latérale">
          <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
        </button>
        <a class="header-logo" href="${BASE}index.html">bureau des projets</a>
        <div class="header-droite">
          <span class="header-statut"><span class="dot" id="header-dot"></span><span id="header-statut-texte">en ligne</span></span>
          <a class="header-pilule" href="${PORTFOLIO_URL}" target="_blank">mon portfolio</a>
        </div>
      </div>
      <nav class="header-menu">
        <div class="header-menu-liste">
          ${PAGES.map(p => `<a class="principal${actif(p.page)}" href="${BASE}${p.page}">${p.label}</a>`).join('\n          ')}
          <span class="header-sep"></span>
          ${LIENS_EXTERNES.map(l => `<a href="${l.url}" target="_blank">${l.label}</a>`).join('\n          ')}
        </div>
      </nav>`;
  }

  // ---- contenu de la sidebar : modifie ici pour que ça change PARTOUT ----
  const ASIDE_HTML = `
    <div class="bloc">
      <h4>statut</h4>
      <span class="dot" id="statut-dot"></span><span id="statut-texte">en ligne</span>
      <div id="statut-message" style="margin-top:4px; color:var(--muted); display:none;"></div>
      </div>
      <div class="bloc-spotify">
      <div style="color: var(--muted);">
        <span id="spotify-label">écoute en ce moment :</span><br>
        <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
          <img id="spotify-cover" src="" alt="" style="display:none;">
          <span>
            <a href="#" id="spotify-link" target="_blank">[chargement…]</a><span class="eq" id="spotify-eq" style="display:none;"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>
          </span>
          </div>
      </div>
    </div>

    <div class="bloc">
      <h4>navigation</h4>
      <ul>
        ${PAGES.map(p => `<li><a href="${BASE}${p.page}">${p.label}</a></li>`).join('\n        ')}
      </ul>
    </div>

    <div class="bloc">
      <h4>liens externes</h4>
      <ul>
        <li><a href="${PORTFOLIO_URL}" target="_blank">bento des projets</a></li>
        ${LIENS_EXTERNES.map(l => `<li><a href="${l.url}" target="_blank">${l.label}</a></li>`).join('\n        ')}
        <!--<li><a href="#">rss (à venir)</a></li>-->
      </ul>
    </div>

    <div class="bloc">
      <h4>Inspirations & ressources</h4>
      <ul>
        <li><a href="https://www.humanite.fr/" target="_blank">L'Humanité</a></li>
        <li><a href="https://jlm27.fr/p/5AGre8fWVQ" target="_blank">Parrainer la campagne de Jean-Luc Mélenchon</a></li>
      </ul>
    </div>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    // ---- injection du header ----
    if (!document.querySelector('.site-header')) {
      const header = document.createElement('header');
      header.className = 'site-header';
      header.innerHTML = construireHeader();
      document.body.insertBefore(header, document.body.firstChild);
      header.querySelector('.header-dots').addEventListener('click', () => {
        const colonne = document.querySelector('aside');
        if (colonne) colonne.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // ---- injection de la sidebar ----
    const aside = document.querySelector('aside');
    if (aside && !aside.dataset.rempli) {
      aside.innerHTML = ASIDE_HTML;
      aside.dataset.rempli = 'oui';
    }

    // ---- bandeau "en ce moment" et pied de page ----
    const main = document.querySelector('main');
    if (main && !main.querySelector('.statut') && !main.hasAttribute('data-sans-bandeau')) {
      main.insertAdjacentHTML('afterbegin', STATUT_HTML);
      main.insertAdjacentHTML('beforeend', FOOTER_HTML);
    }

    // ---- "en ce moment" (bandeau du haut) ----
    const statutLive = document.getElementById('statut-live');
    if (statutLive) {
      fetch(BASE + 'en-ce-moment.json')
        .then(r => r.json())
        .then(data => { statutLive.textContent = data.texte; })
        .catch(() => {});
    }

    // ---- statut en ligne / hors ligne ----
    supabaseSelect('statut').then(data => {
      if (!data) return; // Supabase pas encore branché, on garde l'état par défaut du HTML

      const couleur = data.online ? 'var(--dot)' : '#a8a094';
      const libelle = data.online ? 'en ligne' : 'hors ligne';
      document.querySelectorAll('#statut-dot, #header-dot').forEach(d => { d.style.background = couleur; });
      document.querySelectorAll('#statut-texte, #header-statut-texte').forEach(t => { t.textContent = libelle; });

      const message = document.getElementById('statut-message');
      if (data.message && message) {
        message.textContent = data.message;
        message.style.display = 'block';
      }
    });

    // ---- morceau Spotify (lu depuis la table now_playing) ----
    supabaseSelect('now_playing').then(data => {
      const spotifyLabel = document.getElementById('spotify-label');
      const spotifyLink = document.getElementById('spotify-link');
      const spotifyEq = document.getElementById('spotify-eq');
      const spotifyCover = document.getElementById('spotify-cover');
      if (!spotifyLabel) return;
 
      if (!data || !data.title) {
        spotifyLabel.textContent = data ? 'rien d\'écouté récemment' : 'spotify pas encore branché';
        spotifyLink.style.display = 'none';
        spotifyEq.style.display = 'none';
        spotifyCover.style.display = 'none';
        return;
      }
      spotifyLabel.textContent = data.is_playing ? 'écoute en ce moment :' : 'dernier morceau écouté :';
      spotifyLink.textContent = `${data.title} — ${data.artist}`;
      spotifyLink.href = data.url || '#';
      spotifyEq.style.display = data.is_playing ? 'inline-flex' : 'none';
      spotifyEq.classList.toggle('playing', !!data.is_playing);
 
      if (data.cover_url) {
        spotifyCover.src = data.cover_url;
        spotifyCover.alt = `pochette de ${data.title}`;
        spotifyCover.style.display = 'block';
      } else {
        spotifyCover.style.display = 'none';
      }
    });

    // ---- date de dernière mise à jour (dernier commit GitHub) ----
    const derniereMaj = document.getElementById('derniere-maj');
    if (derniereMaj) {
      fetch(`https://api.github.com/repos/${REPO}/commits?per_page=1`)
        .then(r => r.json())
        .then(commits => {
          const date = new Date(commits[0].commit.committer.date);
          derniereMaj.textContent = date.toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric'
          });
        })
        .catch(() => {
          // si l'API GitHub est indisponible, le texte "chargement…" reste affiché
        });
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
