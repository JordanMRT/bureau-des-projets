// admin/statut.js — bascule "en ligne / hors ligne" et phrase de statut.
//
// Écrit dans la table Supabase `statut` (celle que lit le site). L'écriture
// est protégée côté Supabase par une règle SQL (voir 0002_statut_ecriture.sql) :
// on s'identifie avec un compte Supabase Auth (email + mot de passe), pas avec
// la clé publique du site, qui ne peut que lire.
(function () {
  const $ = id => document.getElementById(id);
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.BUREAU;
  const CLE_SESSION = 'bdp-supabase';
  const CLE_RECENTS = 'bdp-statuts-recents';
  const MARGE_EXPIRATION = 60 * 1000; // on renouvelle le jeton une minute avant son expiration

  let session = null;       // { access_token, refresh_token, expires_at, email }
  let enCours = false;      // une sauvegarde est en train de partir

  // ---------- messages ----------

  function dire(texte, type) {
    const el = $('statut-msg');
    el.textContent = texte || '';
    el.className = 'aide' + (type ? ' ' + type : '');
  }

  // ---------- session Supabase Auth ----------

  function lireSession() {
    const brut = localStorage.getItem(CLE_SESSION) || sessionStorage.getItem(CLE_SESSION);
    try { return brut ? JSON.parse(brut) : null; } catch (e) { return null; }
  }

  function memoriserSession(s, durable) {
    session = s;
    localStorage.removeItem(CLE_SESSION);
    sessionStorage.removeItem(CLE_SESSION);
    (durable ? localStorage : sessionStorage).setItem(CLE_SESSION, JSON.stringify(s));
  }

  function oublierSession() {
    session = null;
    localStorage.removeItem(CLE_SESSION);
    sessionStorage.removeItem(CLE_SESSION);
  }

  const estDurable = () => !!localStorage.getItem(CLE_SESSION);

  async function demanderJeton(grant, corps) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error_description || data.msg || data.message || res.statusText);
      e.status = res.status;
      throw e;
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      email: (data.user && data.user.email) || (session && session.email) || '',
    };
  }

  // renvoie un jeton d'accès valable (en le renouvelant si besoin), ou null
  async function jetonValide() {
    if (!session) return null;
    if (Date.now() < session.expires_at - MARGE_EXPIRATION) return session.access_token;
    try {
      const renouvelee = await demanderJeton('refresh_token', { refresh_token: session.refresh_token });
      memoriserSession(renouvelee, estDurable());
      return session.access_token;
    } catch (e) {
      oublierSession();
      return null;
    }
  }

  // ---------- lecture / écriture de la table ----------

  async function lireStatut() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/statut?select=*&id=eq.1`, {
        cache: 'no-store',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!res.ok) return null;
      return (await res.json())[0] || null;
    } catch (e) {
      return null;
    }
  }

  async function ecrireStatut(online, message) {
    const jeton = await jetonValide();
    if (!jeton) { const e = new Error('session expirée'); e.status = 401; throw e; }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/statut?id=eq.1`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ online, message: message || null, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const e = new Error(data.message || res.statusText);
      e.status = res.status;
      throw e;
    }
    // une règle SQL qui refuse la modification ne renvoie pas d'erreur : juste zéro ligne modifiée
    const lignes = await res.json();
    if (!lignes.length) {
      const e = new Error('Supabase a refusé la modification : la règle SQL de 0002_statut_ecriture.sql est-elle bien en place (et le bon email dedans) ?');
      e.status = 403;
      throw e;
    }
    return lignes[0];
  }

  // ---------- affichage ----------

  function afficherEtat(online, message) {
    $('statut-online').checked = !!online;
    $('statut-etat').textContent = online ? 'en ligne' : 'hors ligne';
    $('statut-phrase').value = message || '';
    $('statut-actuel-point').style.background = online ? 'var(--dot)' : '#a8a094';
    $('statut-actuel-texte').textContent = (online ? 'en ligne' : 'hors ligne') + (message ? ` — « ${message} »` : '');
    // le header de cette page lit le statut une seule fois au chargement : on le tient à jour
    const pointHeader = document.getElementById('header-dot');
    const texteHeader = document.getElementById('header-statut-texte');
    if (pointHeader) pointHeader.style.background = online ? 'var(--dot)' : '#a8a094';
    if (texteHeader) texteHeader.textContent = online ? 'en ligne' : 'hors ligne';
  }

  function afficherVue() {
    $('statut-connecte').hidden = !session;
    $('statut-connexion').hidden = !!session;
    if (session) $('statut-compte').textContent = session.email ? `connecté à Supabase (${session.email})` : 'connecté à Supabase';
  }

  // ---------- phrases récentes (suggestions du champ) ----------

  function recents() {
    try { return JSON.parse(localStorage.getItem(CLE_RECENTS)) || []; } catch (e) { return []; }
  }

  function retenir(message) {
    if (!message) return;
    const liste = [message, ...recents().filter(m => m !== message)].slice(0, 8);
    try { localStorage.setItem(CLE_RECENTS, JSON.stringify(liste)); } catch (e) { /* ignoré */ }
    afficherRecents();
  }

  function afficherRecents() {
    $('statut-recents').replaceChildren(...recents().map(m => {
      const o = document.createElement('option');
      o.value = m;
      return o;
    }));
  }

  // ---------- actions ----------

  async function enregistrer() {
    if (enCours) return;
    enCours = true;
    const online = $('statut-online').checked;
    const message = $('statut-phrase').value.trim();
    dire('Enregistrement…');
    try {
      const ligne = await ecrireStatut(online, message);
      afficherEtat(ligne.online, ligne.message);
      retenir(ligne.message);
      dire('Statut mis à jour : visible sur le site tout de suite.', 'ok');
    } catch (e) {
      // on remet la bascule dans l'état réel du site
      const reel = await lireStatut();
      if (reel) afficherEtat(reel.online, reel.message);
      if (e.status === 401) { oublierSession(); afficherVue(); dire('Session expirée : reconnecte-toi.', 'erreur'); }
      else dire(e.message || 'Erreur inconnue.', 'erreur');
    }
    enCours = false;
  }

  async function connecter() {
    const email = $('statut-email').value.trim();
    const mdp = $('statut-mdp').value;
    if (!email || !mdp) return dire('Renseigne l\'email et le mot de passe.', 'erreur');
    dire('Connexion…');
    try {
      const s = await demanderJeton('password', { email, password: mdp });
      s.email = s.email || email;
      memoriserSession(s, $('statut-durable').checked);
      $('statut-mdp').value = '';
      afficherVue();
      dire('');
    } catch (e) {
      dire(e.status === 400 ? 'Email ou mot de passe incorrect.' : (e.message || 'Connexion impossible.'), 'erreur');
    }
  }

  // ---------- démarrage ----------

  async function init() {
    session = lireSession();
    afficherVue();
    afficherRecents();

    $('statut-online').addEventListener('change', enregistrer);   // la bascule agit tout de suite
    $('statut-enregistrer').addEventListener('click', enregistrer);
    $('statut-phrase').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); enregistrer(); } });
    $('statut-connexion-btn').addEventListener('click', connecter);
    $('statut-mdp').addEventListener('keydown', e => { if (e.key === 'Enter') connecter(); });
    $('statut-deconnexion').addEventListener('click', () => {
      oublierSession();
      afficherVue();
      dire('Déconnecté de Supabase : le jeton a été effacé de ce navigateur.', 'ok');
    });

    const actuel = await lireStatut();
    if (actuel) afficherEtat(actuel.online, actuel.message);
    else dire('Impossible de lire le statut actuel.', 'erreur');
  }

  init();
})();
