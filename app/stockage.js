// Sauvegarde des données : copie sur l'iPhone (toujours) + Firebase (si configuré et connecté).
import { FIREBASE_CONFIG } from "./firebase-config.js";

const CLE = "mescartes-v1";

export function lireLocal() {
  try { return JSON.parse(localStorage.getItem(CLE)) || null; } catch (e) { return null; }
}
export function ecrireLocal(donnees) {
  try { localStorage.setItem(CLE, JSON.stringify(donnees)); return true; } catch (e) { return false; }
}

/** Demande à Safari de ne pas effacer les données (accepté seulement pour une app installée). */
export async function demanderStockagePersistant() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}

// ---------- Firebase ----------
let auth = null, db = null;

export const firebaseConfigure = () => !!(FIREBASE_CONFIG.apiKey && window.firebase);

export function initFirebase() {
  if (!firebaseConfigure()) return false;
  if (auth) return true;
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  // Copie hors ligne gérée par Firebase : les écritures partent dès que le réseau revient.
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  return true;
}

export const surConnexion = cb => auth.onAuthStateChanged(cb);
export const connecter = (email, mdp) => auth.signInWithEmailAndPassword(email, mdp);
export const creerCompte = (email, mdp) => auth.createUserWithEmailAndPassword(email, mdp);
export const deconnecter = () => auth.signOut();
export const reinitialiserMdp = email => auth.sendPasswordResetEmail(email);

const base = uid => db.collection("utilisateurs").doc(uid);

/** Écoute les changements en ligne. surSync reçoit "ok", "envoi" ou "erreur". */
export function ecouter(uid, { surMots, surEtat, surSync, surPremierChargement }) {
  let premier = true;
  const stop1 = base(uid).collection("mots").onSnapshot({ includeMetadataChanges: true }, snap => {
    if (premier && !snap.metadata.fromCache) { premier = false; surPremierChargement(snap.size); }
    surMots(snap.docs.map(d => d.data()));
    surSync(snap.metadata.hasPendingWrites ? "envoi" : (snap.metadata.fromCache ? "horsligne" : "ok"));
  }, () => surSync("erreur"));
  const stop2 = base(uid).onSnapshot(d => { if (d.exists && d.data().etat) surEtat(d.data().etat); }, () => {});
  return () => { stop1(); stop2(); };
}

// Les écritures ne sont pas attendues : hors ligne, Firebase les garde et les envoie plus tard.
export const ecrireMot = (uid, mot) => base(uid).collection("mots").doc(String(mot.id)).set(mot).catch(() => {});
export const effacerMot = (uid, id) => base(uid).collection("mots").doc(String(id)).delete().catch(() => {});
export const ecrireEtat = (uid, etat) => base(uid).set({ etat }, { merge: true }).catch(() => {});

/** Remplace tout le contenu en ligne (premier envoi ou import d'un fichier). */
export async function remplacerTout(uid, mots, etat) {
  const col = base(uid).collection("mots");
  const existants = await col.get();
  const garder = new Set(mots.map(m => String(m.id)));
  const ops = [];
  existants.forEach(d => { if (!garder.has(d.id)) ops.push(b => b.delete(d.ref)); });
  mots.forEach(m => ops.push(b => b.set(col.doc(String(m.id)), m)));
  ops.push(b => b.set(base(uid), { etat }, { merge: true }));
  for (let i = 0; i < ops.length; i += 400) {
    const lot = db.batch();
    ops.slice(i, i + 400).forEach(op => op(lot));
    await lot.commit();
  }
}

// ---------- Fichier de secours ----------

export function fichierExport(mots, etat) {
  const d = new Date();
  const nom = `mes-cartes-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
  const contenu = JSON.stringify({ application: "mes-cartes", version: 1, exporteLe: d.toISOString(), mots, etat }, null, 1);
  return new File([contenu], nom, { type: "application/json" });
}

/** Sur iPhone, ouvre le menu Partager (choisir « Enregistrer dans Fichiers »). Sinon, télécharge. */
export async function partagerFichier(fichier) {
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    await navigator.share({ files: [fichier], title: "Sauvegarde Mes cartes" });
    return "partage";
  }
  const url = URL.createObjectURL(fichier);
  const a = document.createElement("a");
  a.href = url; a.download = fichier.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "telechargement";
}

export function lireFichierImport(texte) {
  const d = JSON.parse(texte);
  if (d.application !== "mes-cartes" || !Array.isArray(d.mots)) throw new Error("Ce fichier n'est pas une sauvegarde de Mes cartes.");
  for (const m of d.mots) {
    if (!m.id || typeof m.en !== "string" || typeof m.fr !== "string" || !m.cartes || !m.cartes.ef || !m.cartes.fe)
      throw new Error("Le fichier est incomplet ou abîmé.");
  }
  return { mots: d.mots, etat: d.etat || null, exporteLe: d.exporteLe };
}
