// admin/app.js — l'interface : connexion, liste des billets, brouillons,
// édition, aperçu et publication (un seul commit GitHub par action).
(function () {
  const $ = id => document.getElementById(id);
  const CLE_BROUILLONS = 'bdp-brouillons';

  // billet en cours : slug de l'article déjà publié qu'on modifie (null = nouveau)
  const courant = { slug: null, slugAMain: false };
  let billets = [];
  let minuteur = null;
  let modifie = false; // le contenu a changé depuis l'ouverture ou la dernière publication

  // ---------- petits outils ----------

  function dire(texte, type) {
    const el = $('message');
    el.textContent = texte || '';
    el.className = 'msg' + (type ? ' ' + type : '');
    el.hidden = !texte;
  }

  function afficher(vue) {
    ['connexion', 'liste', 'editeur'].forEach(v => { $('vue-' + v).hidden = v !== vue; });
    $('panneau-statut').hidden = vue === 'editeur'; // pas de statut pendant qu'on écrit : plus de place pour le texte
    window.scrollTo(0, 0);
  }

  const aujourdhui = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const formaterDate = iso => new Date(iso + 'T12:00:00')
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  function element(balise, classe, texte) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (texte !== undefined) el.textContent = texte;
    return el;
  }

  function bouton(texte, action, classe) {
    const b = element('button', 'btn' + (classe ? ' ' + classe : ''), texte);
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  }

  // ---------- connexion ----------

  async function demarrer(token, durable) {
    Github.token = token;
    dire('Vérification du token…');
    try {
      await Github.verifier();
    } catch (e) {
      Github.token = null;
      dire(Github.erreurLisible(e), 'erreur');
      afficher('connexion');
      return;
    }
    if (durable !== undefined) Github.memoriserToken(token, durable);
    dire('');
    ouvrirListe();
  }

  // ---------- liste des billets et des brouillons ----------

  async function ouvrirListe() {
    afficher('liste');
    const ul = $('liste-billets');
    ul.replaceChildren(element('li', 'meta', 'chargement…'));
    try {
      billets = await Github.listerBillets();
    } catch (e) {
      dire(Github.erreurLisible(e), 'erreur');
      billets = [];
    }
    billets.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    ul.replaceChildren();
    if (!billets.length) ul.appendChild(element('li', 'meta', 'aucun billet publié pour l\'instant.'));
    billets.forEach(b => {
      const li = element('li');
      li.appendChild(element('span', 'titre', b.titre));
      li.appendChild(element('span', 'meta', b.date_affichee || b.date || ''));
      li.appendChild(bouton('modifier', () => modifierBillet(b.slug)));
      const voir = element('a', 'btn', 'voir');
      voir.href = `${window.BUREAU.BASE}billets/${encodeURIComponent(b.slug)}.html`;
      voir.target = '_blank';
      li.appendChild(voir);
      li.appendChild(bouton('supprimer', () => supprimerBillet(b), 'danger'));
      ul.appendChild(li);
    });
    afficherBrouillons();
  }

  // ---------- brouillons (stockés dans ce navigateur) ----------

  function lireBrouillons() {
    try { return JSON.parse(localStorage.getItem(CLE_BROUILLONS)) || {}; } catch (e) { return {}; }
  }

  function ecrireBrouillons(obj) {
    try {
      localStorage.setItem(CLE_BROUILLONS, JSON.stringify(obj));
      return true;
    } catch (e) {
      $('info-brouillon').textContent = 'Brouillon trop lourd pour ce navigateur (images ?). Publie ou allège-le.';
      return false;
    }
  }

  const idBrouillon = () => courant.slug || 'nouveau';

  function sauverBrouillon() {
    const titre = $('champ-titre').value;
    if (!titre.trim() && Editeur.estVide()) return;
    const tous = lireBrouillons();
    tous[idBrouillon()] = {
      titre,
      date: $('champ-date').value,
      slug: $('champ-slug').value,
      slugAMain: courant.slugAMain,
      existant: courant.slug,
      html: Editeur.brut(),
      maj: Date.now(),
    };
    if (ecrireBrouillons(tous)) {
      const h = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      $('info-brouillon').textContent = `brouillon enregistré à ${h}`;
    }
  }

  function supprimerBrouillon(id) {
    const tous = lireBrouillons();
    delete tous[id];
    ecrireBrouillons(tous);
  }

  function afficherBrouillons() {
    const tous = lireBrouillons();
    const ids = Object.keys(tous);
    $('bloc-brouillons').hidden = !ids.length;
    const ul = $('liste-brouillons');
    ul.replaceChildren();
    ids.sort((a, b) => tous[b].maj - tous[a].maj).forEach(id => {
      const b = tous[id];
      const li = element('li');
      li.appendChild(element('span', 'titre', b.titre || '(sans titre)'));
      li.appendChild(element('span', 'meta', (b.existant ? 'modification de ' + b.existant : 'nouveau billet') + ' · ' + new Date(b.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })));
      li.appendChild(bouton('reprendre', () => ouvrirEditeur(b)));
      li.appendChild(bouton('jeter', () => {
        if (confirm('Jeter ce brouillon ?')) { supprimerBrouillon(id); afficherBrouillons(); }
      }, 'danger'));
      ul.appendChild(li);
    });
  }

  // ---------- édition ----------

  // donnees : { titre, date, slug, slugAMain, existant, html }
  function ouvrirEditeur(donnees) {
    courant.slug = donnees.existant || null;
    courant.slugAMain = !!donnees.slugAMain;
    $('champ-titre').value = donnees.titre || '';
    $('champ-date').value = donnees.date || aujourdhui();
    $('champ-slug').value = donnees.slug || '';
    $('champ-slug').disabled = !!courant.slug; // l'adresse d'un billet publié ne change pas
    Editeur.charger(donnees.html || '');
    $('info-brouillon').textContent = '';
    modifie = false;
    afficherOnglet('ecrire');
    majCompteur();
    dire('');
    afficher('editeur');
    $('champ-titre').focus();
  }

  function nouveauBillet() {
    const tous = lireBrouillons();
    if (tous.nouveau && confirm('Un brouillon de nouveau billet existe déjà. Le reprendre ?\n\n(Annuler = repartir d\'une page blanche, l\'ancien brouillon sera remplacé.)')) {
      ouvrirEditeur(tous.nouveau);
    } else {
      ouvrirEditeur({});
    }
  }

  async function modifierBillet(slug) {
    const brouillon = lireBrouillons()[slug];
    if (brouillon && confirm('Un brouillon existe pour ce billet. Le reprendre ?\n\n(Annuler = recharger la version publiée.)')) {
      ouvrirEditeur(brouillon);
      return;
    }
    dire('Chargement du billet…');
    try {
      const texte = await Github.lireTexte(`billets/${slug}.html`);
      if (texte === null) throw new Error('fichier billets/' + slug + '.html introuvable');
      const page = new DOMParser().parseFromString(texte, 'text/html');
      const corps = page.querySelector('.billet-corps') || page.querySelector('ul.projets');
      const entree = billets.find(b => b.slug === slug) || {};
      ouvrirEditeur({
        titre: (page.querySelector('main h2') || {}).textContent || entree.titre || '',
        date: entree.date || aujourdhui(),
        slug,
        existant: slug,
        html: corps ? corps.innerHTML : '',
      });
    } catch (e) {
      dire(Github.erreurLisible(e), 'erreur');
    }
  }

  function majCompteur() {
    const { mots, minutes } = Editeur.stats();
    $('compteur').textContent = mots ? `${mots} mot${mots > 1 ? 's' : ''} · environ ${minutes} min de lecture` : '';
  }

  function afficherOnglet(nom) {
    $('panneau-ecrire').hidden = nom !== 'ecrire';
    $('panneau-apercu').hidden = nom !== 'apercu';
    $('onglet-ecrire').classList.toggle('actif', nom === 'ecrire');
    $('onglet-apercu').classList.toggle('actif', nom === 'apercu');
  }

  // ---------- fabrication de la page d'un billet à partir de TEMPLATE.html ----------

  function construirePage(gabarit, { titre, dateAffichee, corps, base }) {
    const doc = new DOMParser().parseFromString(gabarit, 'text/html');

    const commentaires = [];
    const marcheur = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
    while (marcheur.nextNode()) commentaires.push(marcheur.currentNode);
    commentaires.forEach(c => c.remove()); // les instructions du gabarit n'ont rien à faire dans le billet

    doc.title = `bureau des projets - ${titre}`;
    doc.querySelector('main h2').textContent = titre;
    doc.querySelector('.tagline-date').textContent = `le ${dateAffichee}`;
    const zone = doc.querySelector('.billet-corps');
    const indente = corps.split('\n').map(l => '      ' + l).join('\n');
    zone.innerHTML = `\n${indente}\n    `;

    if (base) {
      const b = doc.createElement('base');
      b.href = base;
      doc.head.prepend(b);
    }
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';
  }

  // ---------- aperçu ----------

  async function montrerApercu() {
    afficherOnglet('apercu');
    const cadre = $('cadre-apercu');
    try {
      const res = await fetch(new URL('../billets/TEMPLATE.html', location.href), { cache: 'no-store' });
      if (!res.ok) throw new Error('gabarit introuvable');
      const gabarit = await res.text();
      const titre = $('champ-titre').value.trim() || 'Titre du billet';
      const date = $('champ-date').value || aujourdhui();
      cadre.onload = () => {
        const corps = cadre.contentDocument && cadre.contentDocument.body;
        if (!corps) return;
        const ajuster = () => { cadre.style.height = cadre.contentDocument.documentElement.scrollHeight + 'px'; };
        ajuster();
        new ResizeObserver(ajuster).observe(corps);
      };
      cadre.srcdoc = construirePage(gabarit, {
        titre,
        dateAffichee: formaterDate(date),
        corps: Editeur.exporter(false).html,
        base: new URL('../billets/', location.href).href,
      });
    } catch (e) {
      dire('Aperçu impossible : ' + e.message, 'erreur');
    }
  }

  // ---------- publication ----------

  const SLUG_VALIDE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  async function publier() {
    const titre = $('champ-titre').value.trim();
    const date = $('champ-date').value;
    const slug = $('champ-slug').value.trim();

    if (!titre) return dire('Il manque le titre.', 'erreur');
    if (!date) return dire('Il manque la date.', 'erreur');
    if (!SLUG_VALIDE.test(slug)) return dire('L\'adresse (slug) ne peut contenir que des minuscules, des chiffres et des tirets.', 'erreur');
    if (Editeur.estVide()) return dire('Le billet est vide.', 'erreur');

    const { html, images } = Editeur.exporter(true);
    const dateAffichee = formaterDate(date);
    const modification = !!courant.slug;
    const bouton = $('btn-publier');
    bouton.disabled = true;
    dire('Publication en cours…');

    try {
      await Github.publier(
        `${modification ? 'Modification du billet' : 'Nouveau billet'} : ${titre}`,
        async lire => {
          const gabarit = await lire('billets/TEMPLATE.html');
          if (!gabarit) throw new Error('billets/TEMPLATE.html est introuvable dans le dépôt.');
          const liste = JSON.parse((await lire('billets/billets.json')) || '[]');

          if (!modification) {
            if (liste.some(b => b.slug === slug) || (await lire(`billets/${slug}.html`)) !== null) {
              throw new Error(`Un billet avec l'adresse « ${slug} » existe déjà : change le slug.`);
            }
          }
          const entree = { slug, titre, date, date_affichee: dateAffichee };
          const i = liste.findIndex(b => b.slug === slug);
          if (i >= 0) liste[i] = entree; else liste.push(entree);

          return {
            ecrire: [
              { chemin: `billets/${slug}.html`, texte: construirePage(gabarit, { titre, dateAffichee, corps: html }) },
              { chemin: 'billets/billets.json', texte: JSON.stringify(liste, null, 2) + '\n' },
              ...images.map(img => ({ chemin: img.fichier, base64: img.base64 })),
            ],
          };
        }
      );
    } catch (e) {
      bouton.disabled = false;
      return dire(Github.erreurLisible(e), 'erreur');
    }

    bouton.disabled = false;
    clearTimeout(minuteur);
    modifie = false;
    supprimerBrouillon(idBrouillon());
    courant.slug = slug;
    $('champ-slug').disabled = true;
    $('info-brouillon').textContent = '';
    const lien = element('a', '', 'voir le billet');
    lien.href = `${window.BUREAU.BASE}billets/${encodeURIComponent(slug)}.html`;
    lien.target = '_blank';
    const msg = $('message');
    msg.textContent = 'Publié ! Le site se met à jour dans environ une minute. Pense à faire un « git pull » avant de retoucher le code en local. ';
    msg.appendChild(lien);
    msg.className = 'msg ok';
    msg.hidden = false;
    window.scrollTo(0, 0);
  }

  async function supprimerBillet(billet) {
    if (!confirm(`Supprimer définitivement « ${billet.titre} » ?\n\nLa page sera retirée du site (les images restent dans le dépôt).`)) return;
    dire('Suppression en cours…');
    try {
      await Github.publier(`Suppression du billet : ${billet.titre}`, async lire => {
        const liste = JSON.parse((await lire('billets/billets.json')) || '[]').filter(b => b.slug !== billet.slug);
        return {
          ecrire: [{ chemin: 'billets/billets.json', texte: JSON.stringify(liste, null, 2) + '\n' }],
          supprimer: [`billets/${billet.slug}.html`],
        };
      });
      supprimerBrouillon(billet.slug);
      dire('Billet supprimé. Le site se met à jour dans environ une minute.', 'ok');
      ouvrirListe();
    } catch (e) {
      dire(Github.erreurLisible(e), 'erreur');
    }
  }

  // ---------- branchements ----------

  function programmerSauvegarde() {
    modifie = true;
    clearTimeout(minuteur);
    minuteur = setTimeout(sauverBrouillon, 800);
  }

  function brancher() {
    // connexion
    $('btn-connexion').addEventListener('click', () => {
      const token = $('champ-token').value.trim();
      if (!token) return dire('Colle ton token GitHub.', 'erreur');
      demarrer(token, $('case-durable').checked);
      $('champ-token').value = '';
    });
    $('champ-token').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-connexion').click(); });
    $('btn-deconnexion').addEventListener('click', () => {
      Github.oublierToken();
      dire('Déconnecté : le token a été effacé de ce navigateur.', 'ok');
      afficher('connexion');
    });

    // navigation
    $('btn-nouveau').addEventListener('click', nouveauBillet);
    $('btn-retour').addEventListener('click', () => { clearTimeout(minuteur); if (modifie) sauverBrouillon(); dire(''); ouvrirListe(); });
    $('onglet-ecrire').addEventListener('click', () => afficherOnglet('ecrire'));
    $('onglet-apercu').addEventListener('click', montrerApercu);

    // titre -> slug automatique (tant qu'on n'a pas écrit le slug à la main)
    $('champ-titre').addEventListener('input', () => {
      if (!courant.slug && !courant.slugAMain) $('champ-slug').value = Editeur.slugifier($('champ-titre').value);
      programmerSauvegarde();
    });
    $('champ-slug').addEventListener('input', () => { courant.slugAMain = true; programmerSauvegarde(); });
    $('champ-date').addEventListener('change', programmerSauvegarde);

    // éditeur
    const barre = $('barre');
    const barreImage = $('barre-image');
    Editeur.init($('zone-ecriture'), {
      barre,
      onChange: () => { majCompteur(); programmerSauvegarde(); },
      onStatut: (texte, type) => dire(texte, type),
      onFigure: figure => {
        barreImage.hidden = !figure;
        if (!figure) return;
        barreImage.querySelectorAll('[data-taille]').forEach(b => b.classList.toggle('actif', figure.classList.contains(b.dataset.taille)));
        barreImage.querySelectorAll('[data-aligne]').forEach(b => b.classList.toggle('actif', figure.classList.contains(b.dataset.aligne)));
      },
    });

    // les boutons ne volent pas le focus (sinon la sélection du texte se perd)
    [barre, barreImage].forEach(b => b.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }));

    barre.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.cmd) Editeur.executer(b.dataset.cmd);
      else if (b.dataset.bloc) Editeur.formaterBloc(b.dataset.bloc);
      else if (b.dataset.align !== undefined) Editeur.aligner(b.dataset.align);
      else if (b.dataset.action === 'lien') Editeur.lien();
      else if (b.dataset.action === 'image') $('fichier-image').click();
    });

    barreImage.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.taille) Editeur.reglerFigure('taille', b.dataset.taille);
      else if (b.dataset.aligne) Editeur.reglerFigure('align', b.dataset.aligne);
      else if (b.dataset.img === 'alt') Editeur.texteAlternatif();
      else if (b.dataset.img === 'haut') Editeur.deplacerFigure(-1);
      else if (b.dataset.img === 'bas') Editeur.deplacerFigure(1);
      else if (b.dataset.img === 'supprimer') Editeur.supprimerFigure();
    });

    $('fichier-image').addEventListener('change', e => {
      Editeur.ajouterImages(e.target.files);
      e.target.value = '';
    });

    // actions de fin
    $('btn-publier').addEventListener('click', publier);
    $('btn-brouillon').addEventListener('click', sauverBrouillon);
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('vue-editeur').hidden) {
        e.preventDefault();
        sauverBrouillon();
      }
    });
  }

  // ---------- démarrage ----------

  brancher();
  const tokenMemorise = Github.recupererToken();
  if (tokenMemorise) demarrer(tokenMemorise);
  else afficher('connexion');

  // pour les tests et le débogage
  window.AdminApp = { construirePage, formaterDate };
})();
