// admin/github.js — petit client pour l'API GitHub, pensé pour l'éditeur de billets.
// Aucune dépendance. Le token reste dans ton navigateur (localStorage si tu coches
// "rester connecté", sinon sessionStorage) et n'est envoyé qu'à api.github.com.
(function () {
  const API = 'https://api.github.com';
  const CLE = 'bdp-token';

  const Github = {
    repo: (window.BUREAU && window.BUREAU.REPO) || 'JordanMRT/bureau-des-projets',
    branche: 'main',
    token: null,

    // ---------- token ----------

    recupererToken() {
      this.token = localStorage.getItem(CLE) || sessionStorage.getItem(CLE) || null;
      return this.token;
    },

    memoriserToken(token, durable) {
      this.token = token;
      localStorage.removeItem(CLE);
      sessionStorage.removeItem(CLE);
      (durable ? localStorage : sessionStorage).setItem(CLE, token);
    },

    oublierToken() {
      this.token = null;
      localStorage.removeItem(CLE);
      sessionStorage.removeItem(CLE);
    },

    // ---------- appels bas niveau ----------

    async appel(chemin, options = {}) {
      const res = await fetch(API + chemin, {
        cache: 'no-store',
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).message || ''; } catch (e) { /* pas de JSON */ }
        const erreur = new Error(detail || res.statusText);
        erreur.status = res.status;
        throw erreur;
      }
      return res.status === 204 ? null : res.json();
    },

    // message compréhensible pour l'écran
    erreurLisible(e) {
      if (e.status === 401) return 'Token refusé par GitHub (invalide ou expiré).';
      if (e.status === 403) return 'GitHub refuse l\'accès : vérifie que le token a la permission "Contents : Read and write" (ou que la limite de requêtes n\'est pas atteinte).';
      if (e.status === 404) return 'Dépôt introuvable avec ce token : vérifie qu\'il donne accès à ' + this.repo + '.';
      if (e.status === 409 || e.status === 422) return 'Conflit avec le dépôt (un autre commit vient d\'arriver ?). Réessaie dans un instant. Détail : ' + e.message;
      if (e instanceof TypeError) return 'Impossible de joindre GitHub (connexion ?).';
      return e.message || 'Erreur inconnue.';
    },

    // ---------- lecture ----------

    // vérifie que le token marche et qu'il peut écrire sur le dépôt
    async verifier() {
      const infos = await this.appel(`/repos/${this.repo}`);
      this.branche = infos.default_branch || 'main';
      if (infos.permissions && infos.permissions.push === false) {
        const e = new Error('Ce token ne peut pas écrire sur le dépôt.');
        e.status = 403;
        throw e;
      }
      return infos;
    },

    // lit un fichier texte (UTF-8) du dépôt ; renvoie null s'il n'existe pas
    async lireTexte(chemin, ref) {
      const suite = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      let fichier;
      try {
        fichier = await this.appel(`/repos/${this.repo}/contents/${chemin}${suite}`);
      } catch (e) {
        if (e.status === 404) return null;
        throw e;
      }
      const binaire = atob(fichier.content.replace(/\n/g, ''));
      return new TextDecoder().decode(Uint8Array.from(binaire, c => c.charCodeAt(0)));
    },

    async listerBillets() {
      const texte = await this.lireTexte('billets/billets.json');
      return texte ? JSON.parse(texte) : [];
    },

    // ---------- écriture : UN SEUL commit pour tous les fichiers ----------
    //
    // `construire(lire)` est appelée avec le dépôt à son état le plus récent ;
    // elle renvoie { ecrire: [{ chemin, texte | base64 }], supprimer: [chemin] }.
    // `lire(chemin)` lit un fichier tel qu'il est sur la branche à cet instant.
    async publier(message, construire) {
      const repo = `/repos/${this.repo}`;
      const ref = await this.appel(`${repo}/git/ref/heads/${this.branche}`);
      const teteSha = ref.object.sha;
      const tete = await this.appel(`${repo}/git/commits/${teteSha}`);

      const { ecrire = [], supprimer = [] } = await construire(chemin => this.lireTexte(chemin, teteSha));

      const arbre = [];
      for (const f of ecrire) {
        const blob = await this.appel(`${repo}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify(f.base64
            ? { content: f.base64, encoding: 'base64' }
            : { content: f.texte, encoding: 'utf-8' }),
        });
        arbre.push({ path: f.chemin, mode: '100644', type: 'blob', sha: blob.sha });
      }
      for (const chemin of supprimer) {
        arbre.push({ path: chemin, mode: '100644', type: 'blob', sha: null });
      }

      const nouvelArbre = await this.appel(`${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({ base_tree: tete.tree.sha, tree: arbre }),
      });
      const commit = await this.appel(`${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message, tree: nouvelArbre.sha, parents: [teteSha] }),
      });
      await this.appel(`${repo}/git/refs/heads/${this.branche}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha }),
      });
      return commit.sha;
    },
  };

  window.Github = Github;
})();
