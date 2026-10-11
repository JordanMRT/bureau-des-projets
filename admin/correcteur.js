// admin/correcteur.js — correction en direct : orthographe, grammaire, conjugaison, typographie.
//
// Le texte de l'éditeur est envoyé à LanguageTool (service tiers, gratuit) pendant
// une pause de frappe ; les fautes sont soulignées avec la "CSS Custom Highlight API",
// qui ne modifie JAMAIS le contenu de l'éditeur (aucune balise ajoutée : ce qui est
// publié reste propre). Un clic sur un mot souligné ouvre une bulle de suggestions.
//
// Pour utiliser ton propre serveur LanguageTool (aucune donnée ne sort de chez toi,
// pas de limite), remplace URL_LT, par exemple par 'http://localhost:8010/v2/check'.
(function () {
  const URL_LT = 'https://api.languagetool.org/v2/check';
  const LANGUE = 'fr';
  const DELAI_FRAPPE = 2000;   // pause de frappe avant vérification (ms)
  const DELAI_MINI = 3500;     // écart minimal entre deux requêtes (limite gratuite : 20 par minute)
  const PAUSE_LIMITE = 60000;  // attente si LanguageTool répond « trop de requêtes »
  const TAILLE_MORCEAU = 15000; // caractères par requête (limite gratuite : 20 000)
  const BLOCS = 'p,h3,h4,blockquote,li,figcaption';
  const CLE_CONSENTEMENT = 'bdp-correcteur';
  const CLE_IGNORES = 'bdp-correcteur-ignores';
  const TYPES = ['ortho', 'gram', 'typo', 'style'];

  const $ = id => document.getElementById(id);
  let zone = null;
  let actif = false;
  let problemes = [];        // { range, message, remplacements, type, regle, texte }
  let version = 0;           // augmente à chaque modification du texte
  let minuteur = null;
  let enCours = false;
  let derniereRequete = 0;
  let bloqueJusqua = 0;
  let dernierTexte = null;
  let composition = false;
  let indexCourant = -1;
  let ignores = new Set();
  const cache = new Map();   // texte d'un morceau -> réponse de LanguageTool (évite de renvoyer ce qui n'a pas changé)
  let defilementProgrammeJusqua = 0; // le défilement qu'on déclenche nous-mêmes ne doit pas fermer la bulle

  const surligne = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

  // ---------- messages ----------

  function etat(texte, type) {
    const el = $('correcteur-etat');
    el.textContent = texte || '';
    el.className = 'aide' + (type ? ' ' + type : '');
  }

  // ---------- lecture du texte de l'éditeur ----------

  const blocsFeuilles = () => [...zone.querySelectorAll(BLOCS)].filter(b => !b.querySelector(BLOCS));

  // texte d'un bloc + correspondance (position dans le texte -> noeud texte du DOM)
  function lireBloc(bloc) {
    let texte = '';
    const segments = [];
    const marcheur = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = marcheur.nextNode())) {
      if (n.nodeType === 3) {
        segments.push({ noeud: n, debut: texte.length, fin: texte.length + n.nodeValue.length });
        texte += n.nodeValue;
      } else if (n.tagName === 'BR') {
        texte += '\n';
      }
    }
    return { texte, segments };
  }

  // découpe le billet en morceaux d'au plus TAILLE_MORCEAU caractères (blocs séparés par une ligne vide)
  function construireMorceaux() {
    const morceaux = [];
    let courant = null;
    for (const bloc of blocsFeuilles()) {
      const { texte, segments } = lireBloc(bloc);
      if (!texte.trim()) continue;
      const taille = Math.min(texte.length, TAILLE_MORCEAU);
      if (!courant || courant.texte.length + 2 + taille > TAILLE_MORCEAU) {
        courant = { texte: '', blocs: [] };
        morceaux.push(courant);
      }
      const decalage = courant.texte ? courant.texte.length + 2 : 0;
      courant.texte += (decalage ? '\n\n' : '') + texte.slice(0, taille);
      courant.blocs.push({ decalage, longueur: taille, segments });
    }
    return morceaux;
  }

  // position dans un morceau -> Range du DOM (null si elle tombe hors d'un texte)
  function versRange(morceau, debut, longueur) {
    const fin = debut + longueur;
    const bloc = morceau.blocs.find(b => debut >= b.decalage && fin <= b.decalage + b.longueur);
    if (!bloc) return null;
    const local = debut - bloc.decalage;
    const localFin = fin - bloc.decalage;
    const segDebut = bloc.segments.find(s => local >= s.debut && local < s.fin);
    const segFin = bloc.segments.find(s => localFin > s.debut && localFin <= s.fin);
    if (!segDebut || !segFin) return null;
    const range = document.createRange();
    range.setStart(segDebut.noeud, local - segDebut.debut);
    range.setEnd(segFin.noeud, localFin - segFin.debut);
    return range;
  }

  // ---------- appel à LanguageTool ----------

  async function interroger(texte) {
    const res = await fetch(URL_LT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ text: texte, language: LANGUE }),
    });
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return res.json();
  }

  function typeDe(m) {
    const id = (m.rule && m.rule.category && m.rule.category.id) || '';
    const genre = (m.rule && m.rule.issueType) || '';
    if (genre === 'misspelling') return 'ortho';
    if (id === 'TYPOGRAPHY' || genre === 'typographical' || genre === 'whitespace') return 'typo';
    if (genre === 'style' || genre === 'register' || id === 'STYLE') return 'style';
    return 'gram';
  }

  const cleIgnore = (regle, texte) => regle + '|' + texte;

  function traiter(morceau, reponse) {
    const trouves = [];
    for (const m of reponse.matches || []) {
      const texte = morceau.texte.substr(m.offset, m.length);
      const regle = (m.rule && m.rule.id) || '';
      if (ignores.has(cleIgnore(regle, texte))) continue;
      const range = versRange(morceau, m.offset, m.length);
      if (!range) continue;
      trouves.push({
        range,
        message: m.message || m.shortMessage || 'Faute possible',
        remplacements: (m.replacements || []).slice(0, 5).map(r => r.value),
        type: typeDe(m),
        regle,
        texte,
      });
    }
    return trouves;
  }

  // ---------- vérification (avec temporisation) ----------

  function planifier(delai) {
    if (!actif || composition) return;
    version++;
    clearTimeout(minuteur);
    minuteur = setTimeout(verifier, delai === undefined ? DELAI_FRAPPE : delai);
  }

  const pause = ms => new Promise(r => setTimeout(r, ms));

  async function verifier() {
    if (!actif || !zone.offsetParent) return;
    if (enCours) { minuteur = setTimeout(verifier, 1000); return; }

    const maintenant = Date.now();
    const attente = Math.max(bloqueJusqua - maintenant, derniereRequete + DELAI_MINI - maintenant);
    if (attente > 0) { minuteur = setTimeout(verifier, attente); return; }

    const morceaux = construireMorceaux();
    const empreinte = morceaux.map(m => m.texte).join('\u0000');
    if (empreinte === dernierTexte) return;
    if (!morceaux.length) { effacerSurlignage(); problemes = []; dernierTexte = empreinte; majCompteur(); return; }

    enCours = true;
    const v = version;
    etat('vérification…');
    const trouves = [];
    try {
      let dejaInterroge = false;
      for (const morceau of morceaux) {
        let reponse = cache.get(morceau.texte);
        if (!reponse) {
          if (dejaInterroge) await pause(1200); // on espace les requêtes d'un même passage
          derniereRequete = Date.now();
          reponse = await interroger(morceau.texte);
          dejaInterroge = true;
          if (cache.size >= 40) cache.delete(cache.keys().next().value);
          cache.set(morceau.texte, reponse);
        }
        if (v !== version) { enCours = false; return; } // le texte a changé pendant ce temps : résultat périmé
        trouves.push(...traiter(morceau, reponse));
      }
    } catch (e) {
      enCours = false;
      if (e.status === 429) {
        bloqueJusqua = Date.now() + PAUSE_LIMITE;
        etat('Limite de LanguageTool atteinte : nouvelle vérification dans une minute.', 'erreur');
        minuteur = setTimeout(verifier, PAUSE_LIMITE);
      } else if (e.status === 413) {
        etat('Texte trop long pour une vérification.', 'erreur');
      } else {
        etat('Correcteur injoignable (réseau, ou LanguageTool refuse l\'accès depuis ce site).', 'erreur');
      }
      return;
    }
    enCours = false;
    dernierTexte = empreinte;
    problemes = trouves;
    indexCourant = -1;
    surligner();
    majCompteur();
  }

  // ---------- soulignement et compteur ----------

  function effacerSurlignage() {
    if (!surligne) return;
    TYPES.forEach(t => CSS.highlights.delete('lt-' + t));
  }

  function surligner() {
    effacerSurlignage();
    if (!surligne) return;
    TYPES.forEach(t => {
      const ranges = problemes.filter(p => p.type === t).map(p => p.range);
      if (ranges.length) CSS.highlights.set('lt-' + t, new Highlight(...ranges));
    });
  }

  function majCompteur() {
    const n = problemes.length;
    $('correcteur-suivante').hidden = !actif || n === 0;
    if (!actif) { etat(''); return; }
    etat(n ? `${n} correction${n > 1 ? 's' : ''} proposée${n > 1 ? 's' : ''}` : '✓ aucune faute détectée', n ? '' : 'ok');
  }

  // ---------- bulle de suggestions ----------

  function problemeSous(selection) {
    if (!selection.rangeCount) return null;
    const { startContainer, startOffset } = selection.getRangeAt(0);
    return problemes.find(p => {
      try { return p.range.comparePoint(startContainer, startOffset) === 0; } catch (e) { return false; }
    }) || null;
  }

  function masquerBulle() { $('correcteur-bulle').hidden = true; }

  function afficherBulle(pb) {
    const bulle = $('correcteur-bulle');
    bulle.replaceChildren();

    const titre = document.createElement('p');
    titre.className = 'bulle-message';
    titre.textContent = pb.message;
    bulle.appendChild(titre);

    if (pb.remplacements.length) {
      const liste = document.createElement('div');
      liste.className = 'bulle-suggestions';
      pb.remplacements.forEach(valeur => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-principal';
        b.textContent = valeur === '' ? '(supprimer)' : valeur;
        b.addEventListener('click', () => appliquer(pb, valeur));
        liste.appendChild(b);
      });
      bulle.appendChild(liste);
    }

    const ignorer = document.createElement('button');
    ignorer.type = 'button';
    ignorer.className = 'btn';
    ignorer.textContent = pb.type === 'ortho' ? 'ajouter au dictionnaire' : 'ignorer';
    ignorer.addEventListener('click', () => ignorerProbleme(pb));
    bulle.appendChild(ignorer);

    bulle.hidden = false;
    const rect = pb.range.getBoundingClientRect();
    const largeur = bulle.offsetWidth;
    bulle.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - largeur - 8)) + 'px';
    bulle.style.top = (rect.bottom + 6) + 'px';
  }

  function appliquer(pb, valeur) {
    masquerBulle();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(pb.range.cloneRange());
    zone.focus();
    document.execCommand('insertText', false, valeur); // passe par l'historique : Annuler fonctionne
    problemes = problemes.filter(p => p !== pb);
    surligner();
    majCompteur();
    planifier(700);
  }

  function ignorerProbleme(pb) {
    masquerBulle();
    const cle = cleIgnore(pb.regle, pb.texte);
    ignores.add(cle);
    try { localStorage.setItem(CLE_IGNORES, JSON.stringify([...ignores])); } catch (e) { /* ignoré */ }
    // toutes les occurrences identiques disparaissent d'un coup, sans attendre la prochaine vérification
    problemes = problemes.filter(p => cleIgnore(p.regle, p.texte) !== cle);
    surligner();
    majCompteur();
  }

  function fauteSuivante() {
    if (!problemes.length) return;
    problemes.sort((a, b) => a.range.compareBoundaryPoints(Range.START_TO_START, b.range));
    indexCourant = (indexCourant + 1) % problemes.length;
    const pb = problemes[indexCourant];
    const el = pb.range.startContainer.parentElement;
    defilementProgrammeJusqua = Date.now() + 400;
    if (el) el.scrollIntoView({ block: 'center' });
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(pb.range.cloneRange());
    afficherBulle(pb);
  }

  // ---------- activation ----------

  function activer() {
    actif = true;
    zone.spellcheck = false; // sinon deux soulignements différents (navigateur + LanguageTool)
    dernierTexte = null;
    planifier(300);
    majCompteur();
  }

  function desactiver() {
    actif = false;
    clearTimeout(minuteur);
    zone.spellcheck = true;
    problemes = [];
    effacerSurlignage();
    masquerBulle();
    majCompteur();
  }

  function init(zoneEcriture) {
    zone = zoneEcriture;
    zone.lang = 'fr';
    try { ignores = new Set(JSON.parse(localStorage.getItem(CLE_IGNORES)) || []); } catch (e) { ignores = new Set(); }

    zone.addEventListener('input', () => { masquerBulle(); planifier(); });
    zone.addEventListener('compositionstart', () => { composition = true; });
    zone.addEventListener('compositionend', () => { composition = false; planifier(); });
    zone.addEventListener('click', () => {
      if (!actif) return;
      const sel = getSelection();
      const pb = sel.isCollapsed ? problemeSous(sel) : null;
      if (pb) afficherBulle(pb); else masquerBulle();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') masquerBulle(); });
    window.addEventListener('scroll', () => { if (Date.now() > defilementProgrammeJusqua) masquerBulle(); }, { passive: true });
    $('correcteur-bulle').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });

    $('correcteur-suivante').addEventListener('click', fauteSuivante);
    $('correcteur-actif').addEventListener('change', e => {
      if (!e.target.checked) { desactiver(); localStorage.removeItem(CLE_CONSENTEMENT); return; }
      if (!localStorage.getItem(CLE_CONSENTEMENT)) {
        const ok = confirm('Activer la correction en direct ?\n\nLe texte de ton billet sera envoyé, en HTTPS, au service gratuit LanguageTool (un service tiers) pour être vérifié. Voir sa politique de confidentialité sur languagetool.org.\n\nÀ éviter pour un texte confidentiel.');
        if (!ok) { e.target.checked = false; return; }
        localStorage.setItem(CLE_CONSENTEMENT, '1');
      }
      activer();
    });

    // déjà accepté sur cet appareil : on réactive
    if (localStorage.getItem(CLE_CONSENTEMENT)) { $('correcteur-actif').checked = true; activer(); }
  }

  window.Correcteur = {
    init,
    // à appeler quand le contenu de l'éditeur est remplacé (ouverture d'un billet)
    rafraichir() {
      problemes = [];
      dernierTexte = null;
      effacerSurlignage();
      masquerBulle();
      if (actif) planifier(500);
      majCompteur();
    },
    effacer() { problemes = []; dernierTexte = null; effacerSurlignage(); masquerBulle(); },
  };
})();
