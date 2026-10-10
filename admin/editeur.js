// admin/editeur.js — éditeur de texte riche, sans aucune dépendance.
//
// Principe : on écrit dans une zone contenteditable, puis tout ce qui sort de
// l'éditeur (publication, aperçu) passe par nettoyer() : une liste blanche de
// balises. Le HTML publié est donc toujours propre, quoi que le navigateur
// ait fabriqué pendant la frappe ou un copier-coller.
(function () {
  // ---------- constantes ----------
  const ALIGN_TEXTE = ['ali-centre', 'ali-droite'];                 // gauche = pas de classe
  const TAILLES = ['taille-s', 'taille-m', 'taille-l', 'taille-xl'];
  const ALIGN_FIGURE = ['ali-gauche', 'ali-centre', 'ali-droite'];
  const BLOCS_TEXTE = 'P,H3,H4,BLOCKQUOTE,LI';
  const AUTORISES = new Set(['P', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'U', 'S', 'A', 'BR', 'HR', 'FIGURE', 'FIGCAPTION', 'IMG']);
  const EN_LIGNE = new Set(['STRONG', 'EM', 'U', 'S', 'A', 'BR']);
  const BLOCS = new Set(['P', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'FIGURE', 'FIGCAPTION', 'HR', 'DIV']);
  const A_IGNORER = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'HEAD', 'META', 'LINK']);
  const RENOMMES = { B: 'STRONG', I: 'EM', STRIKE: 'S', DEL: 'S', H1: 'H3', H2: 'H3', H5: 'H4', H6: 'H4' };
  const DOSSIER_IMAGES = 'assets/blog/';
  const COTE_MAX = 1600; // px, plus grand côté d'une image après réduction

  // ---------- utilitaires ----------

  function slugifier(texte) {
    return String(texte)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '');
  }

  const lienValide = href => /^(https?:\/\/|mailto:|\/|\.{1,2}\/|#)/i.test(href.trim());
  const srcValide = src => /^(data:image\/(png|jpe?g|gif|webp);base64,|https?:\/\/|\/|\.{1,2}\/|[\w-]+\/)/i.test(src.trim());

  // ---------- nettoyage (liste blanche) ----------
  //
  // Prend du HTML quelconque, renvoie un <div> contenant uniquement des blocs
  // propres. On passe par DOMParser : le document est inerte (rien ne
  // s'exécute, aucune image ne se charge) pendant l'analyse.
  //
  // options :
  //   sansImages        : supprime les images (collage de texte venu du web)
  //   imagesVersChemin  : les nouvelles images (data-fichier) pointent vers ../assets/blog/...
  //   edition           : garde data-fichier, pour recharger un brouillon
  function nettoyer(html, options = {}) {
    const doc = new DOMParser().parseFromString('<body>' + html, 'text/html');
    const racine = doc.body;

    // 1) images "nues" (anciens billets, collage) -> figures standard
    racine.querySelectorAll('img').forEach(img => {
      if (options.sansImages) { img.remove(); return; }
      if (img.closest('figure')) return;
      const figure = doc.createElement('figure');
      figure.className = 'photo taille-m ali-gauche';
      let haut = img;
      while (haut.parentNode && haut.parentNode !== racine) haut = haut.parentNode;
      if (haut === img) {
        racine.replaceChild(figure, img);
        figure.appendChild(img);
      } else {
        figure.appendChild(img);
        racine.insertBefore(figure, haut.nextSibling);
        if (haut.textContent.trim() === '' && !haut.querySelector('img,figure')) haut.remove();
      }
    });

    // 2) copie filtrée
    const sortie = doc.createElement('div');
    convertir(racine, sortie, doc, options);
    normaliser(sortie, doc);
    return sortie;
  }

  function filtrerClasses(el, source, autorisees) {
    const classes = (source.getAttribute('class') || '').split(/\s+/).filter(c => autorisees.includes(c));
    if (classes.length) el.className = classes.join(' ');
  }

  function convertir(source, dest, doc, options) {
    for (const noeud of source.childNodes) {
      // les espaces insécables fabriqués par le navigateur pendant la frappe deviennent des espaces normaux
      if (noeud.nodeType === 3) { dest.appendChild(doc.createTextNode(noeud.nodeValue.replace(/\u00a0/g, ' '))); continue; }
      if (noeud.nodeType !== 1) continue;

      let nom = noeud.tagName;
      if (A_IGNORER.has(nom.toUpperCase())) continue;
      nom = RENOMMES[nom] || nom;

      if (nom === 'DIV') {
        const contientDesBlocs = [...noeud.children].some(e => BLOCS.has(e.tagName));
        if (contientDesBlocs) { convertir(noeud, dest, doc, options); continue; }
        nom = 'P';
      }
      if (!AUTORISES.has(nom)) { convertir(noeud, dest, doc, options); continue; } // on déballe

      // liens : on ne garde que les adresses sûres
      if (nom === 'A') {
        const href = noeud.getAttribute('href') || '';
        if (!lienValide(href)) { convertir(noeud, dest, doc, options); continue; }
      }
      // images : uniquement dans une figure, avec une source sûre
      if (nom === 'IMG') {
        const fichier = noeud.getAttribute('data-fichier');
        let src = noeud.getAttribute('src') || '';
        if (!srcValide(src)) continue;
        if (options.imagesVersChemin && fichier) src = '../' + fichier;
        const img = doc.createElement('img');
        img.setAttribute('src', src);
        img.setAttribute('alt', noeud.getAttribute('alt') || '');
        if (options.edition && fichier) img.setAttribute('data-fichier', fichier);
        dest.appendChild(img);
        continue;
      }

      const el = doc.createElement(nom.toLowerCase());
      if (nom === 'A') {
        const href = noeud.getAttribute('href').trim();
        el.setAttribute('href', href);
        if (/^https?:\/\//i.test(href)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (['P', 'H3', 'H4', 'BLOCKQUOTE', 'LI'].includes(nom)) filtrerClasses(el, noeud, ALIGN_TEXTE);
      if (nom === 'FIGURE') {
        if (!noeud.querySelector('img')) continue;
        const classes = (noeud.getAttribute('class') || '').split(/\s+/);
        const taille = TAILLES.find(t => classes.includes(t)) || 'taille-m';
        const align = ALIGN_FIGURE.find(a => classes.includes(a)) || 'ali-gauche';
        el.className = `photo ${taille} ${align}`;
      }

      convertir(noeud, el, doc, options);
      dest.appendChild(el);
    }
  }

  const estVide = el => el.textContent.replace(/\u00a0/g, ' ').trim() === '' && !el.querySelector('img,hr');

  function normaliser(sortie, doc) {
    // texte "nu" à la racine -> paragraphes
    let paragraphe = null;
    for (const n of [...sortie.childNodes]) {
      const enLigne = n.nodeType === 3 || (n.nodeType === 1 && EN_LIGNE.has(n.tagName));
      if (enLigne) {
        if (!paragraphe) { paragraphe = doc.createElement('p'); sortie.insertBefore(paragraphe, n); }
        paragraphe.appendChild(n);
      } else {
        paragraphe = null;
      }
    }
    // blocs vides supprimés (le plus profond d'abord)
    sortie.querySelectorAll('li,p,h3,h4,blockquote,figcaption,ul,ol').forEach(el => { if (estVide(el)) el.remove(); });
    sortie.querySelectorAll('ul,ol').forEach(el => { if (!el.children.length) el.remove(); });
    [...sortie.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); });
  }

  const versHTML = sortie => [...sortie.children].map(e => e.outerHTML).join('\n');

  // ---------- images ----------

  function lireDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(lecteur.result);
      lecteur.onerror = () => reject(new Error('lecture de l\'image impossible'));
      lecteur.readAsDataURL(blob);
    });
  }

  // réduit l'image (1600px max) et la recompresse ; les GIF restent intacts (animation)
  async function preparerImage(fichier) {
    const type = fichier.type;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) throw new Error('format non pris en charge (png, jpg, webp ou gif)');

    let blob = fichier;
    let mime = type;
    if (type !== 'image/gif') {
      const bitmap = await createImageBitmap(fichier);
      const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
      const largeur = Math.round(bitmap.width * echelle);
      const hauteur = Math.round(bitmap.height * echelle);
      const garderPng = type === 'image/png' && fichier.size < 400 * 1024;
      mime = garderPng ? 'image/png' : 'image/jpeg';

      const canvas = document.createElement('canvas');
      canvas.width = largeur;
      canvas.height = hauteur;
      const ctx = canvas.getContext('2d');
      if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, largeur, hauteur); }
      ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
      blob = await new Promise(r => canvas.toBlob(r, mime, 0.86));

      // un petit jpeg déjà optimisé : on garde l'original plutôt que de le grossir
      if (type === 'image/jpeg' && echelle === 1 && blob.size >= fichier.size) { blob = fichier; mime = type; }
    }

    const extension = { png: 'png', jpeg: 'jpg', gif: 'gif' }[mime.split('/')[1]];
    const base = slugifier(fichier.name.replace(/\.[^.]+$/, '')) || 'image';
    return {
      fichier: `${DOSSIER_IMAGES}${base}-${Date.now().toString(36)}.${extension}`,
      dataUrl: await lireDataUrl(blob),
    };
  }

  // ---------- l'éditeur ----------

  const Editeur = {
    zone: null,
    options: {},
    figureChoisie: null,

    init(zone, options = {}) {
      this.zone = zone;
      this.options = options;
      document.execCommand('defaultParagraphSeparator', false, 'p');
      this.vider();

      zone.addEventListener('input', e => {
        // dès qu'on tape, l'image n'est plus "choisie" (sinon Retour arrière la supprimerait)
        if (this.figureChoisie && !(e.target.closest && e.target.closest('figcaption'))) this.choisirFigure(null);
        this.apresSaisie();
      });
      zone.addEventListener('paste', e => this.coller(e));
      zone.addEventListener('drop', e => {
        const fichiers = e.dataTransfer && e.dataTransfer.files;
        if (fichiers && fichiers.length) { e.preventDefault(); this.ajouterImages(fichiers); }
      });
      zone.addEventListener('click', e => {
        const figure = e.target.closest('figure');
        if (figure && !e.target.closest('figcaption')) {
          this.choisirFigure(figure);
          this.curseurApres(figure);
        } else {
          this.choisirFigure(null);
        }
      });
      zone.addEventListener('keydown', e => {
        if (this.figureChoisie && (e.key === 'Backspace' || e.key === 'Delete') && !e.target.closest('figcaption')) {
          e.preventDefault();
          this.supprimerFigure();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.lien(); }
        // Entrée dans une citation vide : on en sort, comme on sort d'une liste
        if (e.key === 'Enter' && !e.shiftKey) {
          const bloc = this.blocCourant();
          if (bloc && bloc.tagName === 'BLOCKQUOTE' && bloc.textContent.trim() === '') {
            e.preventDefault();
            this.executer('formatBlock', 'p');
          }
        }
      });
      document.addEventListener('selectionchange', () => this.majBoutons());
    },

    prevenir() { if (this.options.onChange) this.options.onChange(); },

    // redonne le focus seulement si l'éditeur ne l'a pas déjà : refocaliser
    // une zone déjà active peut ramener le curseur au début.
    focaliser() {
      if (!this.zone.contains(document.activeElement)) this.zone.focus();
    },

    vider() {
      this.zone.innerHTML = '<p><br></p>';
      this.choisirFigure(null);
    },

    // le curseur ne peut pas se poser avant ou après une figure : on garde toujours
    // un paragraphe vide au début et à la fin (ils disparaissent à l'export)
    garantirParagraphes() {
      const z = this.zone;
      const vide = () => { const p = document.createElement('p'); p.innerHTML = '<br>'; return p; };
      if (!z.firstElementChild || z.firstElementChild.tagName === 'FIGURE') z.prepend(vide());
      if (z.lastElementChild.tagName === 'FIGURE') z.append(vide());
    },

    // une image n'est pas éditable : on pose le curseur au début du bloc qui la suit,
    // pour que la frappe continue après l'image au lieu d'être perdue
    curseurApres(figure) {
      const suivant = figure.nextElementSibling;
      if (!suivant || suivant.tagName === 'FIGURE') return;
      const plage = document.createRange();
      plage.selectNodeContents(suivant);
      plage.collapse(true);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(plage);
    },

    // ---- chargement ----

    // html : contenu d'un billet publié, ou brouillon (avec data-fichier)
    charger(html) {
      const propre = versHTML(nettoyer(html, { edition: true }));
      this.zone.innerHTML = propre || '<p><br></p>';
      this.zone.querySelectorAll('figure').forEach(f => this.preparerFigure(f));
      this.garantirParagraphes();
      this.choisirFigure(null);
    },

    // contenu brut de la zone (pour les brouillons) : on passe quand même par le nettoyage
    brut() {
      return versHTML(nettoyer(this.zone.innerHTML, { edition: true }));
    },

    // contenu final : { html, images:[{fichier, base64}] }
    exporter(pourPublication) {
      const html = versHTML(nettoyer(this.zone.innerHTML, { imagesVersChemin: pourPublication }));
      const images = [];
      const vus = new Set();
      this.zone.querySelectorAll('img[data-fichier]').forEach(img => {
        const fichier = img.getAttribute('data-fichier');
        const src = img.getAttribute('src') || '';
        if (vus.has(fichier) || !src.startsWith('data:')) return;
        vus.add(fichier);
        images.push({ fichier, base64: src.slice(src.indexOf(',') + 1) });
      });
      return { html, images };
    },

    estVide() {
      return !this.zone.querySelector('img') && this.zone.textContent.trim() === '';
    },

    stats() {
      const mots = this.zone.textContent.split(/\s+/).filter(Boolean).length;
      return { mots, minutes: Math.max(1, Math.ceil(mots / 200)) };
    },

    // ---- saisie ----

    apresSaisie() {
      const z = this.zone;
      const aDuTexteNu = [...z.childNodes].some(n => (n.nodeType === 3 && n.nodeValue.trim()) || (n.nodeType === 1 && EN_LIGNE.has(n.tagName)));
      if (!z.firstChild) this.vider();
      else if (aDuTexteNu) document.execCommand('formatBlock', false, 'p');
      this.prevenir();
    },

    coller(e) {
      const presse = e.clipboardData;
      if (!presse) return;
      const fichiers = [...presse.files].filter(f => f.type.startsWith('image/'));
      e.preventDefault();
      if (fichiers.length) { this.ajouterImages(fichiers); return; }
      const html = presse.getData('text/html');
      if (html) {
        const propre = versHTML(nettoyer(html, { sansImages: true }));
        if (propre) { document.execCommand('insertHTML', false, propre); this.prevenir(); return; }
      }
      document.execCommand('insertText', false, presse.getData('text/plain'));
      this.prevenir();
    },

    // ---- commandes de mise en forme ----

    executer(commande, valeur) {
      this.focaliser();
      // listes et titres : le navigateur ramène le curseur au début du bloc, on le remet
      const delicate = ['insertUnorderedList', 'insertOrderedList', 'formatBlock'].includes(commande);
      const memoire = delicate ? this.memoriserCurseur() : null;
      document.execCommand(commande, false, valeur || null);
      if (delicate) this.deballerListes();
      if (memoire !== null) this.restaurerCurseur(memoire);
      this.prevenir();
      this.majBoutons();
    },

    // position du curseur = nombre de caractères depuis le début de son bloc (null si sélection étendue)
    memoriserCurseur() {
      const sel = getSelection();
      const bloc = this.blocCourant();
      if (!sel.rangeCount || !sel.isCollapsed || !bloc) return null;
      const plage = document.createRange();
      plage.selectNodeContents(bloc);
      plage.setEnd(sel.anchorNode, sel.anchorOffset);
      return plage.toString().length;
    },

    restaurerCurseur(decalage) {
      const bloc = this.blocCourant();
      if (!bloc) return;
      const marcheur = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT);
      let reste = decalage;
      let noeud;
      while ((noeud = marcheur.nextNode())) {
        if (reste <= noeud.nodeValue.length) {
          const plage = document.createRange();
          plage.setStart(noeud, reste);
          plage.collapse(true);
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(plage);
          return;
        }
        reste -= noeud.nodeValue.length;
      }
    },

    // le navigateur range parfois une liste dans un <p> (HTML invalide) : on retire ce <p>
    deballerListes() {
      this.zone.querySelectorAll('p > ul, p > ol').forEach(liste => {
        const p = liste.parentNode;
        if (p.childNodes.length === 1) p.replaceWith(liste);
      });
    },

    blocCourant() {
      const sel = getSelection();
      if (!sel.rangeCount || !this.zone.contains(sel.anchorNode)) return null;
      const noeud = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      const bloc = noeud.closest(BLOCS_TEXTE);
      return bloc && this.zone.contains(bloc) ? bloc : null;
    },

    // paragraphe / titre / sous-titre / citation ; un second clic revient au paragraphe
    formaterBloc(balise) {
      const actuel = this.blocCourant();
      const cible = actuel && actuel.tagName.toLowerCase() === balise && balise !== 'p' ? 'p' : balise;
      this.executer('formatBlock', cible);
    },

    // alignement du/des bloc(s) sélectionné(s) : '' (gauche), 'ali-centre', 'ali-droite'
    aligner(classe) {
      this.focaliser();
      const sel = getSelection();
      if (!sel.rangeCount) return;
      const plage = sel.getRangeAt(0);
      const blocs = [...this.zone.querySelectorAll(BLOCS_TEXTE)].filter(b => plage.intersectsNode(b));
      const liste = blocs.length ? blocs : [this.blocCourant()].filter(Boolean);
      liste.forEach(b => { b.classList.remove(...ALIGN_TEXTE); if (classe) b.classList.add(classe); });
      this.prevenir();
    },

    lien() {
      this.focaliser();
      const sel = getSelection();
      const dansUnLien = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('a');
      const url = prompt('Adresse du lien :', dansUnLien ? dansUnLien.getAttribute('href') : 'https://');
      if (!url || url === 'https://') return;
      if (!lienValide(url)) { alert('Adresse non valide (elle doit commencer par https://, mailto: ou /).'); return; }
      if (sel.isCollapsed && !dansUnLien) {
        const a = document.createElement('a');
        a.href = url; a.textContent = url;
        document.execCommand('insertHTML', false, a.outerHTML);
      } else {
        document.execCommand('createLink', false, url);
      }
      this.prevenir();
    },

    // ---- images ----

    async ajouterImages(fichiers) {
      for (const f of fichiers) {
        try {
          if (this.options.onStatut) this.options.onStatut('Traitement de l\'image…');
          const { fichier, dataUrl } = await preparerImage(f);
          this.insererFigure(this.creerFigure(dataUrl, fichier, ''));
          if (this.options.onStatut) this.options.onStatut('');
        } catch (e) {
          if (this.options.onStatut) this.options.onStatut('Image non ajoutée : ' + e.message, 'erreur');
        }
      }
    },

    creerFigure(src, fichier, alt) {
      const figure = document.createElement('figure');
      figure.className = 'photo taille-m ali-centre';
      const img = document.createElement('img');
      img.src = src;
      img.alt = alt || '';
      if (fichier) img.setAttribute('data-fichier', fichier);
      figure.appendChild(img);
      this.preparerFigure(figure);
      return figure;
    },

    // rend la figure non éditable (sauf sa légende)
    preparerFigure(figure) {
      figure.setAttribute('contenteditable', 'false');
      let legende = figure.querySelector('figcaption');
      if (!legende) { legende = document.createElement('figcaption'); figure.appendChild(legende); }
      legende.setAttribute('contenteditable', 'true');
    },

    insererFigure(figure) {
      const sel = getSelection();
      let bloc = null;
      if (sel.rangeCount && this.zone.contains(sel.anchorNode)) {
        bloc = sel.anchorNode;
        while (bloc && bloc.parentNode !== this.zone) bloc = bloc.parentNode;
      }
      if (bloc && bloc.nodeType === 1 && bloc.tagName === 'P' && estVide(bloc)) bloc.replaceWith(figure);
      else if (bloc) bloc.after(figure);
      else this.zone.appendChild(figure);

      if (!figure.nextElementSibling) {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        figure.after(p);
      }
      this.choisirFigure(figure);
      this.prevenir();
    },

    choisirFigure(figure) {
      if (this.figureChoisie) this.figureChoisie.classList.remove('choisie');
      this.figureChoisie = figure;
      if (figure) figure.classList.add('choisie');
      if (this.options.onFigure) this.options.onFigure(figure);
    },

    reglerFigure(type, valeur) {
      const f = this.figureChoisie;
      if (!f) return;
      const liste = type === 'taille' ? TAILLES : ALIGN_FIGURE;
      f.classList.remove(...liste);
      f.classList.add(valeur);
      this.prevenir();
      if (this.options.onFigure) this.options.onFigure(f);
    },

    texteAlternatif() {
      const f = this.figureChoisie;
      if (!f) return;
      const img = f.querySelector('img');
      const alt = prompt('Description de l\'image (pour les lecteurs d\'écran) :', img.alt);
      if (alt !== null) { img.alt = alt; this.prevenir(); }
    },

    deplacerFigure(sens) {
      const f = this.figureChoisie;
      if (!f) return;
      const voisin = sens < 0 ? f.previousElementSibling : f.nextElementSibling;
      if (!voisin) return;
      if (sens < 0) voisin.before(f); else voisin.after(f);
      this.garantirParagraphes();
      this.prevenir();
    },

    supprimerFigure() {
      const f = this.figureChoisie;
      if (!f) return;
      f.remove();
      this.choisirFigure(null);
      if (!this.zone.firstChild) this.vider();
      else this.garantirParagraphes();
      this.prevenir();
    },

    // ---- état des boutons (gras actif, etc.) ----

    majBoutons() {
      if (!this.options.barre) return;
      const sel = getSelection();
      const dedans = sel.rangeCount && this.zone.contains(sel.anchorNode);
      this.options.barre.querySelectorAll('[data-etat]').forEach(b => {
        let actif = false;
        try { actif = dedans && document.queryCommandState(b.dataset.cmd); } catch (e) { /* ignoré */ }
        b.classList.toggle('actif', !!actif);
      });
      const bloc = dedans ? this.blocCourant() : null;
      const balise = bloc ? (bloc.tagName === 'LI' ? '' : bloc.tagName.toLowerCase()) : '';
      this.options.barre.querySelectorAll('[data-bloc]').forEach(b => b.classList.toggle('actif', b.dataset.bloc === balise));
      const align = bloc ? (ALIGN_TEXTE.find(c => bloc.classList.contains(c)) || '') : null;
      this.options.barre.querySelectorAll('[data-align]').forEach(b => b.classList.toggle('actif', align !== null && b.dataset.align === align));
    },
  };

  Editeur.slugifier = slugifier;
  Editeur.nettoyer = nettoyer;
  window.Editeur = Editeur;
})();
