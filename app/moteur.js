// Moteur de répétition espacée de « Mes cartes ».
// Ce fichier ne contient que des règles de calcul : aucun affichage, aucune sauvegarde.
// Les jours sont des numéros entiers (jour 0 = 1er janvier 1970), et chaque jour commence à 4 h du matin.

export const REGLAGES_PAR_DEFAUT = {
  intervalles: [1, 3, 7, 14, 30, 60, 120, 240, 365], // case 1 à case 9, en jours
  entretienMois: 12,          // après la case 9 : une révision tous les 12 mois (réglable à 6)
  nouveauxParJour: 5,         // nouveaux mots par jour et par direction
  heureChangementJour: 4,     // le jour change à 4 h du matin
  repriseApresJours: 14,      // mode reprise après plus de 14 jours sans révision
  reprise: { type: "jours", valeur: 7 }, // arriéré réparti sur 7 jours (ou { type: "plafond", valeur: 50 })
};

export const CASE_NOUVEAU = 0;   // mot jamais testé dans cette direction
export const CASE_ENTRETIEN = 10; // au-delà de la case 9

// ---------- Jours ----------

/** Numéro du jour d'une date, avec changement de jour à 4 h (heure locale). */
export function numeroJour(date, reglages = REGLAGES_PAR_DEFAUT) {
  const d = new Date(date.getTime() - reglages.heureChangementJour * 3600 * 1000);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** Intervalle (en jours) associé à une case. */
export function intervalleCase(numCase, reglages = REGLAGES_PAR_DEFAUT) {
  if (numCase >= 1 && numCase <= 9) return reglages.intervalles[numCase - 1];
  if (numCase === CASE_ENTRETIEN) return reglages.entretienMois === 6 ? 182 : 365;
  return 0;
}

// ---------- Règles de passage ----------

/**
 * Applique une réponse à une carte (un mot dans une direction).
 * carte = { case, prevu, derniere } ; retourne une nouvelle carte.
 */
export function appliquerReponse(carte, juste, aujourdhui, reglages = REGLAGES_PAR_DEFAUT) {
  let c = carte.case;
  if (c === CASE_NOUVEAU) {
    c = 1; // un mot nouveau entre en case 1 après son premier test, juste ou faux
  } else if (juste) {
    c = Math.min(c + 1, CASE_ENTRETIEN);
  } else if (c <= 5) {
    c = Math.max(1, c - 1); // case 1 à 5 : recule d'une case (reste en case 1)
  } else {
    c = c - 2; // à partir de la case 6 : recule de deux cases
  }
  // L'intervalle part du jour de la révision réelle, pas de la date prévue.
  return { ...carte, case: c, prevu: aujourdhui + intervalleCase(c, reglages), derniere: aujourdhui };
}

/** Une carte est à réviser quand sa date prévue est arrivée (ce n'est pas une date limite). */
export function estARevoir(carte, aujourdhui) {
  return carte.case !== CASE_NOUVEAU && carte.prevu <= aujourdhui;
}

/** Retard relatif : 5 jours de retard pèsent plus sur un intervalle de 3 jours que sur un de 120. */
export function retardRelatif(carte, aujourdhui, reglages = REGLAGES_PAR_DEFAUT) {
  return (aujourdhui - carte.prevu) / intervalleCase(carte.case, reglages);
}

// ---------- Mode reprise ----------

/**
 * Met à jour l'état de reprise au moment où l'application est ouverte.
 * etat = { dernierJourActif, reprise: null | { parJour } } ; nbARevoir = mots à réviser ce jour-là.
 */
export function majReprise(etat, nbARevoir, aujourdhui, reglages = REGLAGES_PAR_DEFAUT) {
  let reprise = etat.reprise || null;
  const absence = etat.dernierJourActif == null ? 0 : aujourdhui - etat.dernierJourActif;
  if (!reprise && absence > reglages.repriseApresJours && nbARevoir > 0) {
    const r = reglages.reprise;
    const parJour = r.type === "plafond" ? r.valeur : Math.ceil(nbARevoir / r.valeur);
    reprise = { parJour, depuis: aujourdhui };
  }
  if (reprise && nbARevoir === 0) reprise = null; // arriéré résorbé : retour à la normale
  return { ...etat, reprise };
}

// ---------- Constitution d'une session ----------

/** Mélange (Fisher-Yates). `hasard` peut être remplacé pour les tests. */
export function melanger(liste, hasard = Math.random) {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

/**
 * Prépare le lot de cartes d'une session.
 * mots : [{ id, ajouteLe, cartes: { ef: carte, fe: carte } }]
 * dir : "ef" (anglais → français) ou "fe" (français → anglais)
 * options : { taille, aujourdhui, nouveauxDejaVusAujourdhui, revisionsFaitesAujourdhui, reprise, hasard }
 */
export function preparerSession(mots, dir, options, reglages = REGLAGES_PAR_DEFAUT) {
  const { taille, aujourdhui, nouveauxDejaVusAujourdhui = 0, revisionsFaitesAujourdhui = 0, reprise = null, hasard = Math.random } = options;

  // 1. Mots dont la date de révision est arrivée
  const aRevoir = mots.filter(m => estARevoir(m.cartes[dir], aujourdhui));

  // 2. S'il y en a trop : garder les plus en retard (retard relatif à l'intervalle)
  aRevoir.sort((a, b) =>
    retardRelatif(b.cartes[dir], aujourdhui, reglages) - retardRelatif(a.cartes[dir], aujourdhui, reglages)
    || a.cartes[dir].prevu - b.cartes[dir].prevu
    || String(a.id).localeCompare(String(b.id)));

  let place = taille;
  if (reprise) place = Math.min(place, Math.max(0, reprise.parJour - revisionsFaitesAujourdhui));
  const lot = aRevoir.slice(0, place);

  // 3. S'il en manque : compléter avec des mots nouveaux (suspendu en mode reprise)
  let nouveaux = [];
  if (!reprise && lot.length < taille) {
    const quota = Math.max(0, reglages.nouveauxParJour - nouveauxDejaVusAujourdhui);
    nouveaux = mots
      .filter(m => m.cartes[dir].case === CASE_NOUVEAU)
      .sort((a, b) => (a.ajouteLe ?? 0) - (b.ajouteLe ?? 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, Math.min(quota, taille - lot.length));
  }

  const choisis = [...lot, ...nouveaux];

  // 6. Rien à réviser et aucun mot nouveau : message clair
  if (choisis.length === 0) {
    const existeNouveau = mots.some(m => m.cartes[dir].case === CASE_NOUVEAU);
    let message = "Rien à réviser aujourd'hui et aucun mot nouveau en attente. Ajoutez des mots pour continuer.";
    if (reprise) message = "Le quota de rattrapage du jour est atteint. La suite demain.";
    else if (existeNouveau) message = "Rien à réviser aujourd'hui, et le quota de nouveaux mots du jour est atteint.";
    return { cartes: [], vide: true, message };
  }

  // 4. Mélanger : le hasard porte sur l'ordre, jamais sur le choix des mots
  return { cartes: melanger(choisis, hasard).map(m => m.id), vide: false, message: "" };
}

// ---------- Déroulement d'une session ----------

/** Crée une session à partir d'une liste d'identifiants. */
export function nouvelleSession(ids) {
  return { file: ids.map(id => ({ id, rattrapage: false })), position: 0, rates: [], resultats: [] };
}

/**
 * Enregistre la réponse à la carte en cours.
 * Retourne { session, compte } : compte = true si la réponse doit modifier la case du mot.
 * 5. Un mot raté est reproposé une fois en fin de session, sans effet sur sa case.
 */
export function repondre(session, juste, hasard = Math.random) {
  const actuelle = session.file[session.position];
  const s = { ...session, file: [...session.file], rates: [...session.rates], resultats: [...session.resultats] };
  s.resultats.push({ id: actuelle.id, juste, rattrapage: actuelle.rattrapage });
  if (!actuelle.rattrapage && !juste) s.rates.push(actuelle.id);
  s.position++;
  const finPremierTour = s.position === s.file.length && !actuelle.rattrapage;
  if (finPremierTour && s.rates.length) {
    s.file.push(...melanger(s.rates, hasard).map(id => ({ id, rattrapage: true })));
  }
  return { session: s, compte: !actuelle.rattrapage };
}

export const sessionTerminee = s => s.position >= s.file.length;

/** Taux de réussite d'une session : seule la première réponse compte. */
export function tauxSession(s) {
  const premiers = s.resultats.filter(r => !r.rattrapage);
  return premiers.length ? premiers.filter(r => r.juste).length / premiers.length : 0;
}

// ---------- Statistiques ----------

/** Nombre de jours consécutifs avec au moins une révision (aujourd'hui ou hier compris). */
export function joursConsecutifs(joursActifs, aujourdhui) {
  const jours = new Set(joursActifs);
  let j = jours.has(aujourdhui) ? aujourdhui : aujourdhui - 1;
  let n = 0;
  while (jours.has(j)) { n++; j--; }
  return n;
}

/** Nombre de mots par case pour une direction (indice 0 = nouveaux, 10 = entretien). */
export function motsParCase(mots, dir) {
  const t = Array(11).fill(0);
  for (const m of mots) t[m.cartes[dir].case]++;
  return t;
}

// ---------- Vérification des réponses ----------

/** Ignore majuscules, accents, espaces superflus ; uniformise les apostrophes. */
export function normaliser(texte) {
  return texte
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[.!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const sansTo = t => t.replace(/^to /, "");

/** Distance entre deux mots : une lettre en trop, en moins, remplacée ou deux lettres inversées = 1 faute. */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Liste des traductions acceptées (séparées par des virgules). */
export const traductions = texte => texte.split(",").map(t => sansTo(normaliser(t))).filter(Boolean);

/**
 * Réponse écrite. Retourne { juste, exacte, attendue }.
 * - plusieurs traductions acceptées ;
 * - « to » facultatif devant un verbe ;
 * - une faute de frappe tolérée sur les mots d'au moins 5 lettres.
 */
export function verifierEcrit(reponse, solution) {
  const r = sansTo(normaliser(reponse));
  if (!r) return { juste: false, exacte: false, attendue: solution };
  const sols = traductions(solution);
  if (sols.includes(r)) return { juste: true, exacte: true, attendue: solution };
  const proche = sols.some(s => s.replace(/[ '-]/g, "").length >= 5 && distance(r, s) <= 1);
  return { juste: proche, exacte: false, attendue: solution };
}

const ARTICLES = /^(le |la |les |l'|un |une |des |a |an |the )/;

/**
 * Réponse orale (texte entendu par l'iPhone, avec ses variantes).
 * En plus des règles écrites : articles ignorés, réponse trouvée au milieu d'une phrase.
 * Si rien ne correspond, l'application passe au secours manuel (« Je savais » / « Je ne savais pas »).
 */
export function verifierOral(variantes, solution) {
  const sols = traductions(solution).map(s => s.replace(ARTICLES, ""));
  for (const v of variantes) {
    const e = sansTo(normaliser(v)).replace(ARTICLES, "");
    if (verifierEcrit(e, sols.join(",")).juste) return { juste: true, entendu: v };
    if (sols.some(s => (" " + e + " ").includes(" " + s + " "))) return { juste: true, entendu: v };
  }
  return { juste: false, entendu: variantes[0] || "", secoursManuel: true };
}
