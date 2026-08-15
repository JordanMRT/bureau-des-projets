// commun.js — sidebar (aside), statut, spotify, "en ce moment" et date de
// mise à jour, injectés automatiquement sur toute page qui charge ce fichier.
// Un seul endroit à modifier pour changer un lien de la sidebar ou une clé
// Supabase, plutôt que de répéter le même bloc sur chaque page HTML.
// (même principe que decor.js, à charger juste avant lui)
//
// Inclusion, juste avant </body>, AVANT decor.js :
//   pages à la racine    -> <script src="commun.js"></script>
//   pages dans /billets/  -> <script src="../commun.js"></script>
//
// Pour changer un lien de nav, un lien "ailleurs" ou un site que t'aimes :
// modifie juste le bloc ASIDE_HTML juste en dessous, ça se répercute partout.

(function () {
  const BASE = document.currentScript.src.replace(/commun\.js$/, '');

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

  // ---- contenu de la sidebar : modifie ici pour que ça change PARTOUT ----
  const ASIDE_HTML = `
    <div class="bloc">
      <img class="liane-coin-tr" src="${BASE}assets/decor/liane-coin.png" alt="">
      <img class="liane-coin-bl" src="${BASE}assets/decor/liane-coin.png" alt="">
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
      <img class="liane-coin-br" src="${BASE}assets/decor/liane-coin.png" alt="">
      <img class="liane-coin-tl" src="${BASE}assets/decor/liane-coin.png" alt="">
      <h4>navigation</h4>
      <ul>
        <li><a href="https://jordanmrt.github.io/bureau-des-projets/">accueil</a></li>
        <li><a href="https://jordanmrt.github.io/bureau-des-projets/billets.html">tous les billets</a></li>
        <li><a href="https://jordanmrt.github.io/bureau-des-projets/about.html">à propos</a></li>
      </ul>
    </div>

    <div class="bloc">
      <img class="liane-coin-tr" src="${BASE}assets/decor/liane-coin.png" alt="">
      <img class="liane-coin-bl" src="${BASE}assets/decor/liane-coin.png" alt="">
      <h4>liens externes</h4>
      <ul>
        <li><a href="https://jordanmrt.github.io/" target="_blank">bento des projets</a></li>
        <li><a href="https://github.com/JordanMRT" target="_blank">github</a></li>
        <li><a href="http://instagram.com/jordan.mrt" target="_blank">instagram</a></li>
        <!--<li><a href="#">rss (à venir)</a></li>-->
      </ul>
    </div>

    <div class="bloc">
      <img class="liane-coin-br" src="${BASE}assets/decor/liane-coin.png" alt="">
      <img class="liane-coin-tl" src="${BASE}assets/decor/liane-coin.png" alt="">
      <h4>sites que j'aime</h4>
      <ul>
        <li><a href="#">[à compléter]</a></li>
      </ul>
    </div>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    // ---- injection de la sidebar ----
    const aside = document.querySelector('aside');
    if (aside && !aside.dataset.rempli) {
      aside.innerHTML = ASIDE_HTML;
      aside.dataset.rempli = 'oui';
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
      const dot = document.getElementById('statut-dot');
      const texte = document.getElementById('statut-texte');
      const message = document.getElementById('statut-message');
      if (!data || !dot) return; // Supabase pas encore branché, on garde l'état par défaut du HTML

      if (data.online) {
        dot.style.background = 'var(--dot)';
        texte.textContent = 'en ligne';
      } else {
        dot.style.background = '#a8a094';
        texte.textContent = 'hors ligne';
      }

      if (data.message) {
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
      fetch('https://api.github.com/repos/JordanMRT/bureau-des-projets/commits?per_page=1')
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
  });
})();
