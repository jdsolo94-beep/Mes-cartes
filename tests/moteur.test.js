import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../app/moteur.js";

const J = 20000; // un jour quelconque
const carte = (c, prevu = J, derniere = null) => ({ case: c, prevu, derniere });
const mot = (id, ef, fe = carte(0), ajouteLe = 0) => ({ id, ajouteLe, cartes: { ef, fe } });
const fixe = () => 0.5; // hasard prévisible pour les tests

// ---------- Calendrier ----------
test("calendrier : intervalles des cases 1 à 9 et entretien", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(c => M.intervalleCase(c)), [1, 3, 7, 14, 30, 60, 120, 240, 365]);
  assert.equal(M.intervalleCase(M.CASE_ENTRETIEN), 365);
  assert.equal(M.intervalleCase(M.CASE_ENTRETIEN, { ...M.REGLAGES_PAR_DEFAUT, entretienMois: 6 }), 182);
});

test("calendrier modifiable : un intervalle changé est pris en compte", () => {
  const r = { ...M.REGLAGES_PAR_DEFAUT, intervalles: [2, 3, 7, 14, 30, 60, 120, 240, 365] };
  assert.equal(M.appliquerReponse(carte(0), true, J, r).prevu, J + 2);
});

// ---------- Règles de passage ----------
test("bonne réponse : le mot passe à la case suivante", () => {
  for (let c = 1; c <= 8; c++) assert.equal(M.appliquerReponse(carte(c), true, J).case, c + 1);
  assert.equal(M.appliquerReponse(carte(9), true, J).case, M.CASE_ENTRETIEN);
  assert.equal(M.appliquerReponse(carte(10), true, J).case, M.CASE_ENTRETIEN);
});

test("mauvaise réponse en case 1 à 5 : recule d'une case, reste en case 1", () => {
  assert.equal(M.appliquerReponse(carte(1), false, J).case, 1);
  for (let c = 2; c <= 5; c++) assert.equal(M.appliquerReponse(carte(c), false, J).case, c - 1);
});

test("mauvaise réponse à partir de la case 6 : recule de deux cases", () => {
  assert.equal(M.appliquerReponse(carte(6), false, J).case, 4);
  assert.equal(M.appliquerReponse(carte(9), false, J).case, 7);
  assert.equal(M.appliquerReponse(carte(10), false, J).case, 8);
});

test("mot nouveau : entre en case 1 après son premier test, juste ou faux", () => {
  assert.equal(M.appliquerReponse(carte(0), true, J).case, 1);
  assert.equal(M.appliquerReponse(carte(0), false, J).case, 1);
  assert.equal(M.appliquerReponse(carte(0), false, J).prevu, J + 1);
});

// ---------- Retards ----------
test("la date prévue est une date de départ, pas une limite", () => {
  assert.equal(M.estARevoir(carte(3, J), J - 1), false);
  assert.equal(M.estARevoir(carte(3, J), J), true);
  assert.equal(M.estARevoir(carte(3, J), J + 40), true);
  assert.equal(M.estARevoir(carte(0, J), J), false, "un mot nouveau n'est pas « à réviser »");
});

test("aucune pénalité de retard et intervalle calculé depuis la révision réelle", () => {
  const enRetard = carte(3, J); // prévu le jour J
  const r = M.appliquerReponse(enRetard, true, J + 10); // révisé 10 jours plus tard
  assert.equal(r.case, 4);
  assert.equal(r.prevu, J + 10 + 14);
});

test("le jour change à 4 h du matin", () => {
  const veille = M.numeroJour(new Date(2026, 10, 3, 23, 0));
  assert.equal(M.numeroJour(new Date(2026, 10, 4, 3, 59)), veille);
  assert.equal(M.numeroJour(new Date(2026, 10, 4, 4, 0)), veille + 1);
});

// ---------- Constitution d'une session ----------
test("plus de mots à réviser que la taille : on garde les plus en retard (retard relatif)", () => {
  const mots = [
    mot("case2-5j", carte(2, J - 5)),  // 5 / 3 = 1,67
    mot("case7-5j", carte(7, J - 5)),  // 5 / 120 = 0,04
    mot("case4-10j", carte(4, J - 10)), // 10 / 14 = 0,71
  ];
  const s = M.preparerSession(mots, "ef", { taille: 2, aujourdhui: J, hasard: fixe });
  assert.deepEqual([...s.cartes].sort(), ["case2-5j", "case4-10j"]);
});

test("moins de mots que la taille : complété par 5 mots nouveaux maximum, les plus anciens d'abord", () => {
  const mots = [mot("a", carte(1, J))];
  for (let i = 0; i < 8; i++) mots.push(mot("n" + i, carte(0), carte(0), 100 - i));
  const s = M.preparerSession(mots, "ef", { taille: 20, aujourdhui: J, hasard: fixe });
  assert.equal(s.cartes.length, 6);
  assert.ok(s.cartes.includes("n7") && !s.cartes.includes("n0"));
});

test("le quota de nouveaux mots tient compte de ceux déjà vus dans la journée", () => {
  const mots = Array.from({ length: 10 }, (_, i) => mot("n" + i, carte(0)));
  const s = M.preparerSession(mots, "ef", { taille: 20, aujourdhui: J, nouveauxDejaVusAujourdhui: 3, hasard: fixe });
  assert.equal(s.cartes.length, 2);
});

test("le hasard change l'ordre, jamais le choix des mots", () => {
  const mots = Array.from({ length: 30 }, (_, i) => mot("m" + i, carte(3, J - i)));
  const a = M.preparerSession(mots, "ef", { taille: 10, aujourdhui: J, hasard: () => 0.1 });
  const b = M.preparerSession(mots, "ef", { taille: 10, aujourdhui: J, hasard: () => 0.9 });
  assert.notDeepEqual(a.cartes, b.cartes);
  assert.deepEqual([...a.cartes].sort(), [...b.cartes].sort());
});

test("deux progressions indépendantes : chaque direction a sa propre case", () => {
  const mots = [mot("x", carte(5, J + 10), carte(2, J))];
  assert.equal(M.preparerSession(mots, "ef", { taille: 10, aujourdhui: J }).vide, true);
  assert.deepEqual(M.preparerSession(mots, "fe", { taille: 10, aujourdhui: J, hasard: fixe }).cartes, ["x"]);
});

test("rien à réviser et aucun mot nouveau : message clair", () => {
  const s = M.preparerSession([mot("x", carte(3, J + 5))], "ef", { taille: 10, aujourdhui: J });
  assert.equal(s.vide, true);
  assert.match(s.message, /Rien à réviser/);
});

// ---------- Déroulement d'une session ----------
test("un mot raté est reproposé une fois en fin de session, sans effet sur sa case", () => {
  let s = M.nouvelleSession(["a", "b", "c"]);
  const comptes = [];
  for (const juste of [true, false, true]) { const r = M.repondre(s, juste, fixe); s = r.session; comptes.push(r.compte); }
  assert.equal(M.sessionTerminee(s), false);
  assert.deepEqual(s.file.slice(3), [{ id: "b", rattrapage: true }]);
  const r = M.repondre(s, false, fixe); // raté encore : pas reproposé une deuxième fois
  assert.equal(r.compte, false);
  assert.equal(M.sessionTerminee(r.session), true);
  assert.deepEqual(comptes, [true, true, true]);
  assert.equal(Math.round(M.tauxSession(r.session) * 100), 67);
});

// ---------- Mode reprise ----------
test("mode reprise après plus de 14 jours : arriéré réparti sur 7 jours, nouveaux mots suspendus", () => {
  const etat = M.majReprise({ dernierJourActif: J - 15, reprise: null }, 140, J);
  assert.deepEqual(etat.reprise, { parJour: 20, depuis: J });
  const mots = Array.from({ length: 140 }, (_, i) => mot("m" + i, carte(2, J - 20)));
  mots.push(mot("nouveau", carte(0)));
  const s = M.preparerSession(mots, "ef", { taille: 50, aujourdhui: J, reprise: etat.reprise, hasard: fixe });
  assert.equal(s.cartes.length, 20);
  assert.ok(!s.cartes.includes("nouveau"));
  const s2 = M.preparerSession(mots, "ef", { taille: 50, aujourdhui: J, reprise: etat.reprise, revisionsFaitesAujourdhui: 20 });
  assert.equal(s2.vide, true);
});

test("pas de mode reprise après 14 jours tout juste", () => {
  assert.equal(M.majReprise({ dernierJourActif: J - 14, reprise: null }, 100, J).reprise, null);
});

test("variante : plafond de 50 révisions par jour", () => {
  const r = { ...M.REGLAGES_PAR_DEFAUT, reprise: { type: "plafond", valeur: 50 } };
  assert.equal(M.majReprise({ dernierJourActif: J - 30, reprise: null }, 300, J, r).reprise.parJour, 50);
});

test("fin du mode reprise quand l'arriéré est résorbé", () => {
  const etat = { dernierJourActif: J - 1, reprise: { parJour: 20, depuis: J - 6 } };
  assert.equal(M.majReprise(etat, 0, J).reprise, null);
  assert.equal(M.majReprise(etat, 20, J).reprise, null, "le reste tient dans une journée");
  assert.notEqual(M.majReprise(etat, 21, J).reprise, null);
});

// ---------- Statistiques ----------
test("jours consécutifs", () => {
  assert.equal(M.joursConsecutifs([J, J - 1, J - 2, J - 4], J), 3);
  assert.equal(M.joursConsecutifs([J - 1, J - 2], J), 2, "la série tient jusqu'à la fin de la journée");
  assert.equal(M.joursConsecutifs([J - 3], J), 0);
});

test("mots par case", () => {
  const t = M.motsParCase([mot("a", carte(0)), mot("b", carte(3)), mot("c", carte(3)), mot("d", carte(10))], "ef");
  assert.equal(t[0], 1); assert.equal(t[3], 2); assert.equal(t[10], 1);
});

// ---------- Réponse écrite ----------
test("écrit : majuscules, accents et espaces superflus ignorés", () => {
  assert.equal(M.verifierEcrit("  TEMOIN ", "témoin").juste, true);
  assert.equal(M.verifierEcrit("Pendant   ce temps", "pendant ce temps").juste, true);
});

test("écrit : plusieurs traductions acceptées", () => {
  assert.equal(M.verifierEcrit("content", "heureux, content").juste, true);
  assert.equal(M.verifierEcrit("triste", "heureux, content").juste, false);
});

test("écrit : « to » facultatif devant un verbe", () => {
  assert.equal(M.verifierEcrit("borrow", "to borrow").juste, true);
  assert.equal(M.verifierEcrit("to borrow", "to borrow").juste, true);
});

test("écrit : une faute de frappe tolérée sur les mots d'au moins 5 lettres", () => {
  assert.equal(M.verifierEcrit("emprunetr", "emprunter").juste, true, "lettres inversées");
  assert.equal(M.verifierEcrit("empruner", "emprunter").juste, true, "lettre oubliée");
  assert.equal(M.verifierEcrit("emprunetrr", "emprunter").juste, false, "deux fautes");
  assert.equal(M.verifierEcrit("hapy", "happy").juste, true, "happy a 5 lettres");
  assert.equal(M.verifierEcrit("cst", "cat").juste, false, "mot court : pas de tolérance");
  assert.equal(M.verifierEcrit("emprunetr", "emprunter").exacte, false);
});

test("écrit : réponse vide = fausse", () => {
  assert.equal(M.verifierEcrit("   ", "témoin").juste, false);
});

// ---------- Réponse orale ----------
test("oral : variantes, articles et phrase entière acceptés", () => {
  assert.equal(M.verifierOral(["témoins", "le témoin"], "témoin").juste, true);
  assert.equal(M.verifierOral(["je dirais emprunter"], "emprunter").juste, true);
  assert.equal(M.verifierOral(["The evidence"], "evidence").juste, true);
});

test("oral : rien de reconnu → secours manuel", () => {
  const r = M.verifierOral(["pendant ce temps"], "avoir du mal, lutter");
  assert.equal(r.juste, false);
  assert.equal(r.secoursManuel, true);
});

test("entraînement libre : mots appris seulement, les plus faibles d'abord", () => {
  const mots = [mot("n", carte(0)), mot("c1", carte(1, J + 1)), mot("c5", carte(5, J + 30)), mot("c2", carte(2, J + 3))];
  const ids = M.preparerEntrainement(mots, "ef", 2, fixe);
  assert.deepEqual([...ids].sort(), ["c1", "c2"]);
  assert.equal(M.preparerEntrainement(mots, "ef", 10, fixe).includes("n"), false);
});
