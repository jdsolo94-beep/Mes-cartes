// Écrans de « Mes cartes ».
import * as M from "./moteur.js";
import * as S from "./stockage.js";

const { useState, useEffect, useMemo, useRef } = React;
const html = htm.bind(React.createElement);

// ---------- Outils ----------
const DIRS = { ef: "Anglais → Français", fe: "Français → Anglais" };
const JOUR_MS = 86400000;
const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const carteNeuve = () => ({ case: 0, prevu: null, derniere: null });
const nouveauMot = (en, fr, ex) => ({ id: nouvelId(), en, fr, ex: ex || "", ajouteLe: Date.now(), cartes: { ef: carteNeuve(), fe: carteNeuve() } });
const boxLabel = b => b === 0 ? "Nouveau" : b === 10 ? "Entretien" : "Case " + b;
const premiereTrad = t => t.split(",")[0].trim();
const cleMot = en => M.normaliser(en).replace(/^to /, "");

const parseLot = txt => txt.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.indexOf("=");
  if (i < 1) return { ok: false, ligne: l };
  const en = l.slice(0, i).trim(), fr = l.slice(i + 1).trim();
  return en && fr ? { ok: true, en, fr } : { ok: false, ligne: l };
});

function etatParDefaut() {
  return {
    reglages: { ...M.REGLAGES_PAR_DEFAUT },
    prefs: { dir: "ef", mode: "ecrit", taille: 20 },
    dernierJourActif: null, reprise: null, joursActifs: [], historique: [],
    journal: { jour: null, nouveaux: { ef: 0, fe: 0 }, revisions: 0 },
    derniereExport: null, premierUsage: Date.now(),
  };
}
const completerEtat = e => {
  const d = etatParDefaut();
  return { ...d, ...(e || {}), reglages: { ...d.reglages, ...((e && e.reglages) || {}) }, prefs: { ...d.prefs, ...((e && e.prefs) || {}) } };
};
const journalDuJour = (etat, jour) => etat.journal && etat.journal.jour === jour ? { bonus: { ef: 0, fe: 0 }, ...etat.journal } : { jour, nouveaux: { ef: 0, fe: 0 }, bonus: { ef: 0, fe: 0 }, revisions: 0 };

let voixAnglaise = null;
function choisirVoix() {
  try {
    const v = speechSynthesis.getVoices().filter(x => x.lang && x.lang.startsWith("en"));
    voixAnglaise = v.find(x => /enhanced|premium/i.test(x.name) && x.lang === "en-US") || v.find(x => x.lang === "en-US") || v.find(x => x.lang === "en-GB") || v[0] || null;
  } catch (e) {}
}
try { choisirVoix(); speechSynthesis.onvoiceschanged = choisirVoix; } catch (e) {}
function lire(texte) {
  try {
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = "en-US"; if (voixAnglaise) u.voice = voixAnglaise; u.rate = 0.9;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------- Icônes ----------
const I = {
  home: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>`,
  list: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/></svg>`,
  gear: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
  sound: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></svg>`,
  close: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  play: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="13" height="16" rx="2"/><path d="M8 3h11a2 2 0 012 2v13"/></svg>`,
  plus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  stats: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>`,
};
const Seg = ({ options, valeur, choisir }) => html`<div className="seg" role="group">${options.map(([v, l]) =>
  html`<button key=${v} aria-pressed=${valeur === v} onClick=${() => choisir(v)}>${l}</button>`)}</div>`;

const dateCourte = jour => new Date(jour * JOUR_MS).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const dateLongue = () => new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

// ---------- Accueil ----------
function Accueil({ mots, etat, jour, aRevoir, nouveauxPrevus, sync, go, exporter, compte }) {
  const total = aRevoir.ef + aRevoir.fe;
  const tous = etat.historique.reduce((a, h) => ({ j: a.j + h.juste, t: a.t + h.total }), { j: 0, t: 0 });
  const taux = tous.t ? Math.round(tous.j / tous.t * 100) : null;
  const serie = M.joursConsecutifs(etat.joursActifs, jour);
  const depuisExport = Date.now() - (etat.derniereExport || etat.premierUsage);
  const rappelExport = mots.length > 0 && depuisExport > 14 * JOUR_MS;
  const syncTexte = { ok: "Sauvegardé en ligne", envoi: "Envoi au serveur…", horsligne: "Hors ligne : envoi au retour du réseau", erreur: "Problème de synchronisation", local: "Sur l'iPhone uniquement" }[sync];
  return html`<div className="stack" style=${{ gap: 16 }}>
    <div className="hero">
      <div className="row between"><div><div className="label">${dateLongue()}</div><h1>Mes cartes</h1></div>
        <button className="gear" aria-label="Réglages" onClick=${() => go("reglages")}>${I.gear}</button></div>
      ${mots.length === 0 ? html`<div><h2>Bienvenue</h2><div className="small" style=${{ opacity: .9 }}>Commencez par ajouter vos premiers mots : un par un, ou toute une liste d'un coup.</div></div>`
      : total + nouveauxPrevus > 0 ? html`<div className="row" style=${{ alignItems: "flex-end", gap: 12 }}>
          <div className="hero-num">${total}</div>
          <div style=${{ paddingBottom: 6 }}><b>mot${total > 1 ? "s" : ""} à réviser aujourd'hui</b>
            <div className="small" style=${{ opacity: .85 }}>${aRevoir.ef} en anglais → français · ${aRevoir.fe} en français → anglais${nouveauxPrevus ? " · + " + nouveauxPrevus + " nouveaux possibles" : ""}</div></div></div>`
      : html`<div><h2>Rien à réviser aujourd'hui</h2><div className="small" style=${{ opacity: .85 }}>Tous vos mots sont à jour et aucun mot nouveau n'attend. Ajoutez des mots pour en apprendre d'autres demain.</div></div>`}
      <div className="row"><span className="chip">${serie} jour${serie > 1 ? "s" : ""} de suite</span>${taux !== null && html`<span className="chip">${taux} % de réussite</span>`}<span className="chip">${mots.length} mots</span><span className="chip">${syncTexte}</span></div>
    </div>

    ${etat.reprise && html`<div className="banner warn"><div><b>Mode reprise</b><div className="small">Vous revenez après plus de 14 jours. Les mots en retard sont répartis sur 7 jours (${etat.reprise.parJour} révisions par jour). Les nouveaux mots reprendront ensuite.</div></div></div>`}
    ${compte === "deconnecte" && html`<div className="banner warn"><div className="small"><b>Sauvegarde en ligne inactive.</b> Connectez-vous dans les Réglages pour protéger vos mots.</div>
      <button className="btn sm primary" onClick=${() => go("reglages")}>Se connecter</button></div>`}

    <div className="tiles">
      <button className="tile big" onClick=${() => go("reviser")}>
        <span className="ic">${I.play}</span><span><b>Réviser</b><div className="small" style=${{ opacity: .85 }}>Choisir la direction, le mode et la taille</div></span></button>
      <button className="tile" onClick=${() => go("ajouter")}><span className="ic">${I.plus}</span><span><b>Ajouter un mot</b><div className="small muted">Rapide ou en lot</div></span></button>
      <button className="tile" onClick=${() => go("stats")}><span className="ic">${I.stats}</span><span><b>Statistiques</b><div className="small muted">Cases et réussite</div></span></button>
    </div>

    ${rappelExport && html`<div className="banner info"><div className="small"><b>Rappel : fichier de secours.</b> ${etat.derniereExport ? "Dernier export il y a " + Math.floor(depuisExport / JOUR_MS) + " jours." : "Aucun export pour l'instant."} Enregistrez une copie dans Fichiers (iCloud Drive).</div>
      <button className="btn sm primary" onClick=${exporter}>Exporter</button></div>`}
  </div>`;
}

// ---------- Réviser ----------
function Reviser({ etat, majPrefs, aRevoir, nouveauxDispo, commencer, message, nbAppris, nbNouveaux, entrainement, plusDeNouveaux }) {
  const p = etat.prefs;
  const dispo = aRevoir[p.dir] + nouveauxDispo[p.dir];
  const limite = etat.reprise ? Math.max(0, etat.reprise.parJour - etat.journal.revisions) : Infinity;
  const total = Math.min(p.taille, Math.min(aRevoir[p.dir], limite) + (etat.reprise ? 0 : nouveauxDispo[p.dir]));
  return html`<div className="stack" style=${{ gap: 18 }}>
    <div><div className="label">Réviser</div><h1>Préparer la session</h1></div>
    <div className="stack" style=${{ gap: 8 }}><div className="label">Direction</div>
      <${Seg} options=${[["ef", DIRS.ef], ["fe", DIRS.fe]]} valeur=${p.dir} choisir=${v => majPrefs({ dir: v })}/></div>
    <div className="stack" style=${{ gap: 8 }}><div className="label">Mode de réponse</div>
      <${Seg} options=${[["ecrit", "Écrit"], ["oral", "Oral"]]} valeur=${p.mode} choisir=${v => majPrefs({ mode: v })}/>
      <div className="small muted">${p.mode === "ecrit" ? "Vous tapez la traduction. Le micro du clavier (dictée) fonctionne aussi." : "Vous répondez à voix haute, vous touchez la carte pour voir la réponse, puis vous indiquez si vous saviez."}</div></div>
    <div className="stack" style=${{ gap: 8 }}><div className="label">Taille de la session</div>
      <${Seg} options=${[10, 20, 30, 40, 50].map(n => [n, String(n)])} valeur=${p.taille} choisir=${v => majPrefs({ taille: v })}/></div>
    <div className="panel"><b>${aRevoir[p.dir]} à réviser + ${etat.reprise ? 0 : nouveauxDispo[p.dir]} nouveaux</b>
      <div className="small muted">${total > 0 ? "Cette session comptera " + total + " carte" + (total > 1 ? "s" : "") + (total < p.taille ? " (il n'y en a pas davantage aujourd'hui)." : ".") : "Aucune carte disponible dans cette direction aujourd'hui."}</div></div>
    ${message && html`<div className="banner info small">${message}</div>`}
    <button className="btn primary block" disabled=${dispo === 0} style=${{ fontSize: "1.1rem", padding: 16, opacity: dispo ? 1 : .5 }} onClick=${commencer}>Commencer</button>
    ${dispo === 0 && (nbAppris[p.dir] > 0 || (nbNouveaux[p.dir] > 0 && !etat.reprise)) && html`<div className="panel stack">
      <h3>Envie de continuer ?</h3>
      ${nbAppris[p.dir] > 0 && html`<button className="btn block" onClick=${entrainement}>Entraînement libre</button>
        <div className="small muted">Vos mots déjà appris, les moins bien connus d'abord. Aucun effet sur les cases ni sur le calendrier.</div>`}
      ${nbNouveaux[p.dir] > 0 && !etat.reprise && html`<button className="btn block" onClick=${plusDeNouveaux}>+ 5 nouveaux mots</button>
        <div className="small muted">Dépasse le quota du jour. Ces mots entrent normalement dans le calendrier (${nbNouveaux[p.dir]} en attente).</div>`}
    </div>`}
  </div>`;
}

// ---------- Carte ----------
function Carte({ mot, dir, mode, session, repondre, quitter, ajouter }) {
  const [reponse, setReponse] = useState("");
  const [etatC, setEtatC] = useState(null); // null | ok | ko | vue
  const [resultat, setResultat] = useState(null);
  const champ = useRef(null);
  useEffect(() => { setReponse(""); setEtatC(null); setResultat(null); if (champ.current) champ.current.focus(); }, [session.position]);
  const actuelle = session.file[session.position];
  const ef = dir === "ef";
  const question = ef ? mot.en : premiereTrad(mot.fr);
  const solution = ef ? mot.fr : mot.en;
  const numCase = mot.cartes[dir].case;
  const premierTour = session.file.filter(x => !x.rattrapage).length;
  const pos = Math.min(session.position + 1, premierTour);
  const valider = () => { const r = M.verifierEcrit(reponse, solution); setResultat(r); setEtatC(r.juste ? "ok" : "ko"); };
  const haut = html`<button className="icon-btn" aria-label="Écouter la prononciation" onClick=${e => { e.stopPropagation(); lire(mot.en); }}>${I.sound}</button>`;
  const exemple = mot.ex && html`<div className="muted small"><i>${mot.ex}</i></div>`;

  return html`<div className="stack" style=${{ gap: 16 }}>
    <div className="row" style=${{ flexWrap: "nowrap" }}>
      <button className="icon-btn" aria-label="Quitter la session" onClick=${quitter}>${I.close}</button>
      <div className="progress"><div style=${{ width: (session.position / session.file.length * 100) + "%" }}></div></div>
      <span className="small muted" style=${{ fontVariantNumeric: "tabular-nums" }}>${actuelle.rattrapage ? "Rattrapage" : pos + " / " + premierTour}</span>
      <button className="icon-btn" aria-label="Ajouter un mot sans quitter la session" onClick=${ajouter}>${I.plus}</button>
    </div>
    <div className="row between"><span className=${"chip" + (numCase === 0 ? " new" : "")}>${boxLabel(numCase)}</span><span className="small muted">${DIRS[dir]}</span></div>
    ${session.entrainement && html`<div className="banner info small">Entraînement libre : vos réponses ne changent pas les cases.</div>`}
    ${actuelle.rattrapage && html`<div className="banner info small">Mot raté reproposé une fois. Cette réponse ne change pas sa case.</div>`}

    ${mode === "ecrit" ? html`
      <div className="card"><div className="word">${question}</div>${ef && haut}${etatC && exemple}</div>
      ${!etatC && html`<form className="stack" style=${{ gap: 10 }} onSubmit=${e => { e.preventDefault(); if (reponse.trim()) valider(); }}>
        <div className="field"><input id="reponse" ref=${champ} autoFocus placeholder="Votre traduction" value=${reponse} onChange=${e => setReponse(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" enterKeyHint="done"/></div>
        <button type="submit" className="btn primary block" disabled=${!reponse.trim()} style=${{ opacity: reponse.trim() ? 1 : .5 }}>Valider</button>
        <button type="button" className="btn ghost block" onClick=${() => { setReponse(""); setEtatC("ko"); }}>Je ne sais pas</button></form>`}
      ${etatC === "ok" && html`<div className="feedback ok stack" style=${{ gap: 10 }}><b>Bonne réponse.</b>
        ${resultat && !resultat.exacte && html`<div className="small">Acceptée avec une petite faute. Orthographe exacte :</div>`}
        <div style=${{ fontSize: "1.15rem" }}><b>${solution}</b> ${!ef && haut}</div>
        <button className="btn good block" onClick=${() => repondre(true)}>Carte suivante</button></div>`}
      ${etatC === "ko" && html`<div className="feedback ko stack" style=${{ gap: 10 }}>
        <div><b>${reponse.trim() ? "Ce n'est pas ça." : "Voici la réponse."}</b>${reponse.trim() && html`<div className="small">Votre réponse : ${reponse}</div>`}</div>
        <div style=${{ fontSize: "1.2rem" }}><b>${solution}</b> ${!ef && haut}</div>
        <button className="btn bad block" onClick=${() => repondre(false)}>Carte suivante</button>
        ${reponse.trim() && html`<button className="btn ghost block" onClick=${() => repondre(true)}>J'avais juste</button>`}</div>`}
    ` : html`
      <div className=${"card" + (etatC ? "" : " tap")} role="button" tabIndex="0" onClick=${() => !etatC && setEtatC("vue")} onKeyDown=${e => e.key === "Enter" && !etatC && setEtatC("vue")}>
        <div className="word">${question}</div>${ef && haut}
        ${!etatC ? html`<div className="muted">Répondez à voix haute, puis touchez la carte pour voir la réponse.</div>`
          : html`<div style=${{ borderTop: "1px solid var(--line)", paddingTop: 12, width: "100%" }}>
            <div className="label">Réponse</div><div style=${{ fontSize: "1.4rem", fontWeight: 700 }}>${solution}</div>
            ${!ef && html`<div style=${{ marginTop: 6 }}>${haut}</div>`}${exemple}</div>`}
      </div>
      ${etatC && html`<div className="row" style=${{ flexWrap: "nowrap" }}>
        <button className="btn bad" style=${{ flex: 1 }} onClick=${() => repondre(false)}>Je ne savais pas</button>
        <button className="btn good" style=${{ flex: 1 }} onClick=${() => repondre(true)}>Je savais</button></div>`}
    `}
    <div className="small muted" style=${{ textAlign: "center" }}>Chaque réponse est enregistrée aussitôt : vous pouvez quitter à tout moment.</div>
  </div>`;
}

// ---------- Fin de session ----------
function Fin({ session, mots, serie, demain, accueil, encore }) {
  const premiers = session.resultats.filter(r => !r.rattrapage);
  const ok = premiers.filter(r => r.juste).length, ko = premiers.length - ok;
  const rates = premiers.filter(r => !r.juste).map(r => mots.find(m => m.id === r.id)).filter(Boolean);
  return html`<div className="stack" style=${{ gap: 16 }}>
    <div><div className="label">Session terminée</div><h1>${ok} sur ${premiers.length} justes</h1></div>
    <div className="panel stat3">
      <div><div className="n" style=${{ color: "var(--good)" }}>${ok}</div><div className="small muted">justes</div></div>
      <div><div className="n" style=${{ color: "var(--bad)" }}>${ko}</div><div className="small muted">à revoir</div></div>
      <div><div className="n">${serie}</div><div className="small muted">jour${serie > 1 ? "s" : ""} de suite</div></div>
    </div>
    ${rates.length > 0 && html`<div className="stack" style=${{ gap: 8 }}><h3>Mots à retravailler</h3>
      <div className="list">${rates.map(w => html`<div className="item" key=${w.id}><div className="t"><b>${w.en}</b><span className="muted small">${w.fr}</span></div>
        <button className="icon-btn" aria-label="Écouter" onClick=${() => lire(w.en)}>${I.sound}</button></div>`)}</div></div>`}
    <div className="panel"><b>Demain :</b> <span className="muted">${demain} mot${demain > 1 ? "s" : ""} à réviser, à partir de 4 h du matin.</span></div>
    <button className="btn primary block" onClick=${accueil}>Retour à l'accueil</button>
    <button className="btn block" onClick=${encore}>Faire une autre session</button>
  </div>`;
}

// ---------- Liste des mots ----------
function ListeMots({ mots, jour, modifier }) {
  const [q, setQ] = useState(""); const [f, setF] = useState("tous");
  const F = [["tous", "Tous"], ["due", "À réviser"], ["new", "Nouveaux"], ["c13", "Cases 1–3"], ["c46", "Cases 4–6"], ["c79", "Cases 7–9"], ["ent", "Entretien"]];
  const cases = w => [w.cartes.ef.case, w.cartes.fe.case];
  const visibles = mots.filter(w => {
    if (q && !M.normaliser(w.en + " " + w.fr).includes(M.normaliser(q))) return false;
    if (f === "due") return M.estARevoir(w.cartes.ef, jour) || M.estARevoir(w.cartes.fe, jour);
    if (f === "new") return cases(w).includes(0);
    if (f === "c13") return cases(w).some(b => b >= 1 && b <= 3);
    if (f === "c46") return cases(w).some(b => b >= 4 && b <= 6);
    if (f === "c79") return cases(w).some(b => b >= 7 && b <= 9);
    if (f === "ent") return cases(w).includes(10);
    return true;
  }).sort((a, b) => cleMot(a.en).localeCompare(cleMot(b.en)));
  const pastille = (d, b) => html`<span className=${"chip" + (b === 0 ? " new" : "")}>${d} · ${b === 0 ? "N" : b === 10 ? "E" : b}</span>`;
  return html`<div className="stack" style=${{ gap: 12 }}>
    <div className="row between"><h1>Mes mots</h1><span className="muted small">${mots.length} mots</span></div>
    <input className="search" id="recherche" type="search" placeholder="Rechercher en anglais ou en français" value=${q} onChange=${e => setQ(e.target.value)}/>
    <div className="chips" role="group">${F.map(([k, l]) => html`<button key=${k} aria-pressed=${f === k} onClick=${() => setF(k)}>${l}</button>`)}</div>
    ${visibles.length ? html`<div className="list">${visibles.map(w => html`
      <button className="item" key=${w.id} onClick=${() => modifier(w)}>
        <div className="t"><b>${w.en}</b><span className="muted small">${w.fr}</span></div>
        <div className="stack" style=${{ gap: 4, alignItems: "flex-end", flex: "none" }}>${pastille("EN→FR", w.cartes.ef.case)}${pastille("FR→EN", w.cartes.fe.case)}</div>
      </button>`)}</div>`
    : html`<div className="panel muted">${mots.length ? "Aucun mot ne correspond à cette recherche." : "Aucun mot pour l'instant. Utilisez l'onglet « Ajouter »."}</div>`}
    ${mots.length > 0 && html`<div className="small muted">Touchez un mot pour le modifier ou le supprimer. N = nouveau, E = entretien.</div>`}
  </div>`;
}

// ---------- Statistiques ----------
function Stats({ mots, etat, jour, aRevoir }) {
  const [dir, setDir] = useState("ef");
  const parCase = M.motsParCase(mots, dir);
  const max = Math.max(1, ...parCase);
  const tous = etat.historique.reduce((a, h) => ({ j: a.j + h.juste, t: a.t + h.total }), { j: 0, t: 0 });
  const taux = tous.t ? Math.round(tous.j / tous.t * 100) : 0;
  const dern = etat.historique[etat.historique.length - 1];
  const serie = M.joursConsecutifs(etat.joursActifs, jour);
  return html`<div className="stack" style=${{ gap: 16 }}>
    <h1>Statistiques</h1>
    <div className="tiles">
      <div className="panel"><div className="label">Réussite générale</div><div className="rate">${tous.t ? taux + " %" : "–"}</div><div className="small muted">${tous.j} sur ${tous.t} cartes</div></div>
      <div className="panel"><div className="label">Dernière session</div><div className="rate">${dern ? Math.round(dern.juste / dern.total * 100) + " %" : "–"}</div><div className="small muted">${dern ? dern.juste + " sur " + dern.total : "Aucune"}</div></div>
      <div className="panel"><div className="label">Jours de suite</div><div className="rate">${serie}</div><div className="small muted">avec au moins une révision</div></div>
      <div className="panel"><div className="label">À réviser</div><div className="rate">${aRevoir.ef + aRevoir.fe}</div><div className="small muted">aujourd'hui</div></div>
    </div>
    <div className="panel stack">
      <h3>Mots par case</h3>
      <${Seg} options=${[["ef", DIRS.ef], ["fe", DIRS.fe]]} valeur=${dir} choisir=${setDir}/>
      <div className="bars" style=${{ gridTemplateColumns: "repeat(11,1fr)" }}>${parCase.map((c, i) => html`<div key=${i} style=${{ height: (c / max * 100) + "%", opacity: i === 0 ? .45 : 1 }} title=${boxLabel(i) + " : " + c}></div>`)}</div>
      <div className="bars-l" style=${{ gridTemplateColumns: "repeat(11,1fr)" }}>${parCase.map((c, i) => html`<span key=${i}>${i === 0 ? "N" : i === 10 ? "E" : i}<br/><b>${c}</b></span>`)}</div>
      <div className="small muted">N = nouveaux mots pas encore testés · E = entretien (après la case 9).</div>
    </div>
    <div className="panel stack">
      <h3>Réussite par session</h3>
      ${etat.historique.length ? html`<div className="hist">${[...etat.historique].reverse().slice(0, 10).map((h, k) => { const r = Math.round(h.juste / h.total * 100); return html`<div className="hist-row" key=${k}>
        <span className="muted">${dateCourte(h.jour)} ${h.dir === "ef" ? "EN→FR" : "FR→EN"}</span><div className="hist-bar"><div style=${{ width: r + "%" }}></div></div><b style=${{ textAlign: "right" }}>${r} %</b></div>`; })}</div>`
      : html`<div className="muted small">Aucune session pour l'instant.</div>`}
      <div className="small muted">Seule la première réponse compte (les mots reproposés en fin de session sont exclus).</div>
    </div>
  </div>`;
}

// ---------- Ajout / modification ----------
function FormMot({ mot, page, fermer, enregistrer, supprimer }) {
  const edition = !!mot;
  const [onglet, setOnglet] = useState("rapide");
  const [en, setEn] = useState(mot ? mot.en : ""); const [fr, setFr] = useState(mot ? mot.fr : ""); const [ex, setEx] = useState(mot ? mot.ex : "");
  const [lot, setLot] = useState(""); const [confirmer, setConfirmer] = useState(false);
  const lignes = useMemo(() => parseLot(lot), [lot]);
  const bons = lignes.filter(p => p.ok);
  const okRapide = en.trim() && fr.trim();
  const corps = html`<${React.Fragment}>
    ${page ? html`<div><div className="label">Ajouter un mot</div><h1>Nouveaux mots</h1></div>`
      : html`<div className="grab"></div><div className="row between"><h2>${edition ? "Modifier le mot" : "Ajouter des mots"}</h2><button className="icon-btn" aria-label="Fermer" onClick=${fermer}>${I.close}</button></div>`}
    ${!edition && html`<${Seg} options=${[["rapide", "Ajout rapide"], ["lot", "Ajout en lot"]]} valeur=${onglet} choisir=${setOnglet}/>`}
    ${(edition || onglet === "rapide") ? html`<form className="stack" style=${{ gap: 14 }} onSubmit=${e => { e.preventDefault(); if (!okRapide) return; if (enregistrer([{ en: en.trim(), fr: fr.trim(), ex: ex.trim() }]) && !edition) { setEn(""); setFr(""); setEx(""); } }}>
      <div className="field"><label className="label" htmlFor="f-en">Anglais</label><input id="f-en" value=${en} onChange=${e => setEn(e.target.value)} placeholder="to borrow" autoCapitalize="off" autoCorrect="off"/></div>
      <div className="field"><label className="label" htmlFor="f-fr">Français</label><input id="f-fr" value=${fr} onChange=${e => setFr(e.target.value)} placeholder="emprunter, louer" autoCapitalize="off"/>
        <span className="small muted">Plusieurs traductions : séparez-les par une virgule.</span></div>
      <div className="field"><label className="label" htmlFor="f-ex">Exemple de phrase (facultatif)</label><input id="f-ex" value=${ex} onChange=${e => setEx(e.target.value)} placeholder="Can I borrow your pen?"/></div>
      <button type="submit" className="btn primary block" disabled=${!okRapide} style=${{ opacity: okRapide ? 1 : .5 }}>${edition ? "Enregistrer" : "Ajouter"}</button>
      ${!edition && html`<div className="small muted" style=${{ textAlign: "center" }}>Le mot sera proposé dès la prochaine session, dans les deux directions.</div>`}
      ${edition && html`<div className="small muted">Modifier le texte ne change pas la progression du mot.</div>`}
    </form>
    ${edition && !confirmer && html`<button className="btn bad block" onClick=${() => setConfirmer(true)}>Supprimer ce mot</button>`}
    ${edition && confirmer && html`<div className="feedback ko stack" style=${{ gap: 10 }}><b>Supprimer « ${mot.en} » et sa progression ?</b>
      <div className="row" style=${{ flexWrap: "nowrap" }}><button className="btn ghost" style=${{ flex: 1 }} onClick=${() => setConfirmer(false)}>Annuler</button><button className="btn" style=${{ flex: 1, background: "var(--bad)", color: "var(--surface)" }} onClick=${supprimer}>Supprimer</button></div></div>`}
    ` : html`
      <div className="field"><label className="label" htmlFor="f-lot">Collez votre liste, un mot par ligne</label>
        <textarea id="f-lot" value=${lot} onChange=${e => setLot(e.target.value)} placeholder=${"to borrow = emprunter\nhappy = heureux, content\nwitness = témoin"} autoCapitalize="off"></textarea>
        <span className="small muted">Format : mot anglais = traduction</span></div>
      ${lignes.length > 0 && html`<div className="panel small stack" style=${{ gap: 6 }}>
        <b>${bons.length} mot${bons.length > 1 ? "s" : ""} reconnu${bons.length > 1 ? "s" : ""}${lignes.length - bons.length ? ", " + (lignes.length - bons.length) + " ligne(s) ignorée(s)" : ""}</b>
        ${lignes.map((p, k) => html`<div key=${k} style=${{ color: p.ok ? "var(--ink)" : "var(--bad)" }}>${p.ok ? p.en + " → " + p.fr : "Ligne non comprise : " + p.ligne}</div>`)}</div>`}
      <button className="btn primary block" disabled=${!bons.length} style=${{ opacity: bons.length ? 1 : .5 }} onClick=${() => { if (enregistrer(bons.map(g => ({ en: g.en, fr: g.fr, ex: "" })))) setLot(""); }}>Ajouter ${bons.length || ""} mot${bons.length > 1 ? "s" : ""}</button>
    `}
  <//>`;
  if (page) return html`<div className="stack" style=${{ gap: 14 }}>${corps}</div>`;
  return html`<div className="overlay" onClick=${fermer}><div className="sheet stack" style=${{ gap: 14 }} onClick=${e => e.stopPropagation()}>${corps}</div></div>`;
}

// ---------- Compte en ligne ----------
function Compte({ compte, email, sync }) {
  const [mail, setMail] = useState(""); const [mdp, setMdp] = useState(""); const [err, setErr] = useState(""); const [info, setInfo] = useState("");
  const traduire = e => ({ "auth/invalid-email": "Adresse e-mail invalide.", "auth/wrong-password": "Mot de passe incorrect.", "auth/invalid-credential": "E-mail ou mot de passe incorrect.", "auth/invalid-login-credentials": "E-mail ou mot de passe incorrect.", "auth/user-not-found": "Aucun compte avec cette adresse.", "auth/email-already-in-use": "Un compte existe déjà avec cette adresse : utilisez « Se connecter ».", "auth/weak-password": "Mot de passe trop court (6 caractères minimum).", "auth/network-request-failed": "Pas de réseau. Réessayez une fois connecté." }[e.code] || "Erreur : " + e.message);
  const agir = f => { setErr(""); setInfo(""); f().catch(e => setErr(traduire(e))); };
  if (compte === "absent") return html`<div className="panel stack"><h3>Sauvegarde en ligne</h3>
    <div className="small muted">Pas encore configurée. Vos mots sont pour l'instant gardés sur cet iPhone uniquement : pensez au fichier de secours ci-dessous.</div></div>`;
  if (compte === "connecte") return html`<div className="panel stack"><h3>Sauvegarde en ligne</h3>
    <div className="row between"><span>Synchronisation automatique</span><span className=${"chip " + (sync === "erreur" ? "bad" : "good")}>${sync === "erreur" ? "Problème" : "Activée"}</span></div>
    <div className="small muted">Chaque mot ajouté, modifié ou supprimé, et chaque réponse, part aussitôt vers Firebase. Sans réseau, l'iPhone garde les changements et les envoie au retour de la connexion.</div>
    <div className="small">Compte : <b>${email}</b></div>
    <button className="btn ghost block" onClick=${() => S.deconnecter()}>Se déconnecter</button></div>`;
  return html`<form className="panel stack" onSubmit=${e => { e.preventDefault(); agir(() => S.connecter(mail.trim(), mdp)); }}>
    <h3>Sauvegarde en ligne</h3>
    <div className="small muted">Connectez-vous pour sauvegarder vos mots en ligne. Si vous n'avez pas encore de compte, choisissez « Créer mon compte ».</div>
    <div className="field"><label className="label" htmlFor="c-mail">E-mail</label><input id="c-mail" type="email" autoComplete="username" value=${mail} onChange=${e => setMail(e.target.value)} autoCapitalize="off"/></div>
    <div className="field"><label className="label" htmlFor="c-mdp">Mot de passe</label><input id="c-mdp" type="password" autoComplete="current-password" value=${mdp} onChange=${e => setMdp(e.target.value)}/></div>
    ${err && html`<div className="form-err">${err}</div>`}${info && html`<div className="note">${info}</div>`}
    <div className="row" style=${{ flexWrap: "nowrap" }}>
      <button type="submit" className="btn primary" style=${{ flex: 1 }}>Se connecter</button>
      <button type="button" className="btn" style=${{ flex: 1 }} onClick=${() => agir(() => S.creerCompte(mail.trim(), mdp))}>Créer mon compte</button></div>
    <button type="button" className="btn ghost sm" onClick=${() => mail.trim() ? agir(() => S.reinitialiserMdp(mail.trim()).then(() => setInfo("Un e-mail de réinitialisation vous a été envoyé."))) : setErr("Entrez d'abord votre e-mail.")}>Mot de passe oublié</button>
  </form>`;
}

// ---------- Réglages ----------
function Reglages({ etat, majReglages, compte, email, sync, exporter, importer }) {
  const r = etat.reglages;
  const [cal, setCal] = useState(r.intervalles.map(String));
  const [aImporter, setAImporter] = useState(null); const [errImport, setErrImport] = useState("");
  const fichier = useRef(null);
  const calOk = cal.every(v => /^\d+$/.test(v) && +v > 0);
  const lireFichier = e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    f.text().then(t => { try { setAImporter(S.lireFichierImport(t)); setErrImport(""); } catch (x) { setErrImport(x.message || "Fichier illisible."); } });
  };
  return html`<div className="stack" style=${{ gap: 16 }}>
    <h1>Réglages</h1>
    <${Compte} compte=${compte} email=${email} sync=${sync}/>
    <div className="panel stack"><h3>Fichier de secours</h3>
      <div className="small muted">Une copie complète de vos mots et de votre progression. Sur l'iPhone, choisissez « Enregistrer dans Fichiers » puis iCloud Drive. Rappel automatique toutes les 2 semaines.</div>
      <div className="small">${etat.derniereExport ? "Dernier export : " + new Date(etat.derniereExport).toLocaleDateString("fr-FR") : "Aucun export pour l'instant."}</div>
      <div className="row" style=${{ flexWrap: "nowrap" }}><button className="btn primary" style=${{ flex: 1 }} onClick=${exporter}>Exporter</button>
        <button className="btn" style=${{ flex: 1 }} onClick=${() => fichier.current.click()}>Importer</button></div>
      <input ref=${fichier} type="file" accept=".json,application/json" hidden onChange=${lireFichier}/>
      ${errImport && html`<div className="form-err">${errImport}</div>`}
      ${aImporter && html`<div className="feedback ko stack" style=${{ gap: 10 }}>
        <b>Remplacer vos données par celles du fichier ?</b>
        <div className="small">Le fichier contient ${aImporter.mots.length} mots${aImporter.exporteLe ? ", exportés le " + new Date(aImporter.exporteLe).toLocaleDateString("fr-FR") : ""}. Vos données actuelles seront remplacées.</div>
        <div className="row" style=${{ flexWrap: "nowrap" }}><button className="btn ghost" style=${{ flex: 1 }} onClick=${() => setAImporter(null)}>Annuler</button>
          <button className="btn" style=${{ flex: 1, background: "var(--bad)", color: "var(--surface)" }} onClick=${() => { importer(aImporter); setAImporter(null); }}>Remplacer</button></div></div>`}
    </div>
    <div className="panel stack"><h3>Calendrier des révisions</h3>
      <div style=${{ overflowX: "auto" }}><table className="cal"><thead><tr><th>Case</th><th>Révision après</th></tr></thead><tbody>
        ${cal.map((d, k) => html`<tr key=${k}><td>Case ${k + 1}</td><td><input type="number" inputMode="numeric" id=${"cal" + k} min="1" value=${d} onChange=${e => { const c = [...cal]; c[k] = e.target.value; setCal(c); }}/> jours</td></tr>`)}
        <tr><td>Ensuite</td><td><div style=${{ maxWidth: 220 }}><${Seg} options=${[[12, "12 mois"], [6, "6 mois"]]} valeur=${r.entretienMois} choisir=${v => majReglages({ entretienMois: v })}/></div></td></tr>
      </tbody></table></div>
      ${!calOk && html`<div className="form-err">Chaque case doit avoir un nombre de jours supérieur à 0.</div>`}
      <div className="row"><button className="btn primary" disabled=${!calOk} style=${{ opacity: calOk ? 1 : .5 }} onClick=${() => majReglages({ intervalles: cal.map(Number) })}>Enregistrer le calendrier</button>
        <button className="btn ghost" onClick=${() => { setCal(M.REGLAGES_PAR_DEFAUT.intervalles.map(String)); majReglages({ intervalles: [...M.REGLAGES_PAR_DEFAUT.intervalles] }); }}>Valeurs d'origine</button></div>
      <div className="small muted">Un changement s'applique aux prochaines révisions, pas aux dates déjà prévues.</div>
    </div>
    <div className="panel row between"><div><h3>Nouveaux mots par jour</h3><div className="small muted">Par direction · suspendu en mode reprise</div></div>
      <div className="row"><button className="icon-btn" aria-label="Moins" onClick=${() => majReglages({ nouveauxParJour: Math.max(0, r.nouveauxParJour - 1) })}>−</button>
        <b style=${{ minWidth: 24, textAlign: "center" }}>${r.nouveauxParJour}</b>
        <button className="icon-btn" aria-label="Plus" onClick=${() => majReglages({ nouveauxParJour: r.nouveauxParJour + 1 })}>+</button></div></div>
    <div className="panel stack"><h3>Rappel quotidien</h3>
      <div className="small muted">Une notification automatique n'est pas possible gratuitement : sur iPhone, elle exige un serveur d'envoi payant. Solution simple : dans l'app Rappels, créez un rappel « Réviser mes cartes » répété chaque jour.</div></div>
    <div className="small muted" style=${{ textAlign: "center" }}>Mes cartes · version 1.0</div>
  </div>`;
}

// ---------- Application ----------
function App() {
  const depart = useMemo(() => S.lireLocal(), []);
  const [mots, setMots] = useState(depart ? depart.mots : []);
  const [etat, setEtat] = useState(() => completerEtat(depart && depart.etat));
  const [ecran, setEcran] = useState("accueil");
  const [session, setSession] = useState(null);
  const [fin, setFin] = useState(null);
  const [feuille, setFeuille] = useState(null);
  const [msg, setMsg] = useState("");
  const [messageSession, setMessageSession] = useState("");
  const [compte, setCompte] = useState(S.firebaseConfigure() ? "deconnecte" : "absent");
  const [uid, setUid] = useState(null); const [email, setEmail] = useState("");
  const [sync, setSync] = useState(S.firebaseConfigure() ? "horsligne" : "local");
  const [jour, setJour] = useState(() => M.numeroJour(new Date()));
  const refs = useRef({ mots, etat, uid }); refs.current = { mots, etat, uid };

  const toast = t => { setMsg(t); clearTimeout(window.__t); window.__t = setTimeout(() => setMsg(""), 2500); };
  const go = e => { setEcran(e); setMessageSession(""); window.scrollTo(0, 0); };

  // Copie locale à chaque changement
  useEffect(() => { S.ecrireLocal({ mots, etat }); }, [mots, etat]);
  useEffect(() => { S.demanderStockagePersistant(); }, []);

  // Changement de jour (4 h) pendant que l'application est ouverte
  useEffect(() => {
    const verif = () => setJour(M.numeroJour(new Date()));
    const t = setInterval(verif, 60000); document.addEventListener("visibilitychange", verif);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", verif); };
  }, []);

  // Firebase : connexion et écoute
  useEffect(() => {
    if (!S.initFirebase()) return;
    let stop = null;
    const off = S.surConnexion(u => {
      if (stop) { stop(); stop = null; }
      if (!u) { setUid(null); setCompte("deconnecte"); setSync("local"); return; }
      setUid(u.uid); setEmail(u.email || ""); setCompte("connecte");
      stop = S.ecouter(u.uid, {
        surMots: m => { if (m.length || !refs.current.mots.length) setMots(m); },
        surEtat: e => setEtat(completerEtat(e)),
        surSync: setSync,
        surPremierChargement: n => {
          // Premier envoi : rien en ligne, mais des mots sur l'iPhone
          if (n === 0 && refs.current.mots.length) S.remplacerTout(u.uid, refs.current.mots, refs.current.etat).then(() => toast("Vos mots ont été envoyés en ligne")).catch(() => {});
        },
      });
    });
    return () => { off(); if (stop) stop(); };
  }, []);

  const sauverEtat = e => { setEtat(e); if (refs.current.uid) S.ecrireEtat(refs.current.uid, e); };
  const sauverMot = m => { setMots(l => l.some(x => x.id === m.id) ? l.map(x => x.id === m.id ? m : x) : [m, ...l]); if (refs.current.uid) S.ecrireMot(refs.current.uid, m); };

  // Comptes du jour
  const aRevoir = useMemo(() => ({ ef: mots.filter(m => M.estARevoir(m.cartes.ef, jour)).length, fe: mots.filter(m => M.estARevoir(m.cartes.fe, jour)).length }), [mots, jour]);
  const journal = journalDuJour(etat, jour);
  const nouveauxDispo = useMemo(() => {
    const q = d => Math.max(0, Math.min(mots.filter(m => m.cartes[d].case === 0).length, etat.reglages.nouveauxParJour + journal.bonus[d] - journal.nouveaux[d]));
    return { ef: q("ef"), fe: q("fe") };
  }, [mots, etat, jour]);

  // Mode reprise : vérifié à l'ouverture et à chaque changement de jour
  useEffect(() => {
    const e = M.majReprise(etat, aRevoir.ef + aRevoir.fe, jour, etat.reglages);
    if ((e.reprise === null) !== (etat.reprise === null)) sauverEtat({ ...e, journal });
  }, [jour, aRevoir.ef + aRevoir.fe]);

  const etatJour = { ...etat, journal };

  const commencer = () => {
    const p = etat.prefs;
    const prep = M.preparerSession(mots, p.dir, { taille: p.taille, aujourdhui: jour, nouveauxDejaVusAujourdhui: journal.nouveaux[p.dir] - journal.bonus[p.dir], revisionsFaitesAujourdhui: journal.revisions, reprise: etat.reprise }, etat.reglages);
    if (prep.vide) { setMessageSession(prep.message); return; }
    setSession({ ...M.nouvelleSession(prep.cartes), dir: p.dir, mode: p.mode });
    go("carte");
  };

  const entrainement = () => {
    const p = etat.prefs;
    const ids = M.preparerEntrainement(mots, p.dir, p.taille);
    if (!ids.length) return;
    setSession({ ...M.nouvelleSession(ids), dir: p.dir, mode: p.mode, entrainement: true });
    go("carte");
  };
  const plusDeNouveaux = () => {
    const p = etat.prefs; const j = journalDuJour(etat, jour);
    const e = { ...etat, journal: { ...j, bonus: { ...j.bonus, [p.dir]: j.bonus[p.dir] + 5 } } };
    sauverEtat(e);
    const prep = M.preparerSession(mots, p.dir, { taille: p.taille, aujourdhui: jour, nouveauxDejaVusAujourdhui: j.nouveaux[p.dir] - j.bonus[p.dir] - 5, revisionsFaitesAujourdhui: j.revisions, reprise: null }, etat.reglages);
    if (prep.vide) return;
    setSession({ ...M.nouvelleSession(prep.cartes), dir: p.dir, mode: p.mode });
    go("carte");
  };

  const repondre = juste => {
    const { session: s2, compte: compteCase } = M.repondre(session, juste);
    const id = session.file[session.position].id;
    let e = { ...etat, journal: journalDuJour(etat, jour) };
    if (compteCase && !session.entrainement) {
      const mot = mots.find(m => m.id === id);
      if (mot) {
        const avant = mot.cartes[session.dir];
        sauverMot({ ...mot, cartes: { ...mot.cartes, [session.dir]: M.appliquerReponse(avant, juste, jour, etat.reglages) } });
        const j = { ...e.journal, nouveaux: { ...e.journal.nouveaux } };
        if (avant.case === 0) j.nouveaux[session.dir]++; else j.revisions++;
        e = { ...e, journal: j, dernierJourActif: jour, joursActifs: e.joursActifs.includes(jour) ? e.joursActifs : [...e.joursActifs, jour].slice(-800) };
      }
    }
    if (M.sessionTerminee(s2) && session.entrainement) {
      e = { ...e, joursActifs: e.joursActifs.includes(jour) ? e.joursActifs : [...e.joursActifs, jour].slice(-800) };
      setFin(s2); setSession(null); go("fin");
    } else if (M.sessionTerminee(s2)) {
      const premiers = s2.resultats.filter(r => !r.rattrapage);
      e = { ...e, historique: [...e.historique, { jour, dir: session.dir, juste: premiers.filter(r => r.juste).length, total: premiers.length }].slice(-1000) };
      setFin(s2); setSession(null); go("fin");
    } else {
      setSession({ ...s2, dir: session.dir, mode: session.mode, entrainement: session.entrainement });
    }
    sauverEtat(e);
  };

  const enregistrer = liste => {
    if (feuille && feuille.mot) {
      sauverMot({ ...feuille.mot, ...liste[0] }); setFeuille(null); toast("Mot modifié"); return true;
    }
    const existants = new Set(mots.map(m => cleMot(m.en)));
    const nouveaux = [], doublons = [];
    for (const x of liste) { const k = cleMot(x.en); if (existants.has(k)) doublons.push(x.en); else { existants.add(k); nouveaux.push(nouveauMot(x.en, x.fr, x.ex)); } }
    nouveaux.forEach(sauverMot);
    if (!nouveaux.length) { toast("« " + doublons[0] + " » existe déjà"); return false; }
    toast((nouveaux.length > 1 ? nouveaux.length + " mots ajoutés" : "« " + nouveaux[0].en + " » ajouté") + (doublons.length ? " · " + doublons.length + " déjà présent(s)" : "") + (uid ? " et sauvegardé" : ""));
    return true;
  };
  const supprimer = () => { const id = feuille.mot.id; setMots(l => l.filter(m => m.id !== id)); if (uid) S.effacerMot(uid, id); setFeuille(null); toast("Mot supprimé"); };

  const exporter = async () => {
    try {
      const r = await S.partagerFichier(S.fichierExport(mots, etat));
      sauverEtat({ ...etat, derniereExport: Date.now() });
      toast(r === "partage" ? "Fichier prêt : choisissez « Enregistrer dans Fichiers »" : "Fichier de secours téléchargé");
    } catch (e) { if (e && e.name !== "AbortError") toast("Export impossible : " + (e.message || e)); }
  };
  const importer = d => {
    const e = completerEtat(d.etat || etat);
    setMots(d.mots); setEtat(e);
    if (uid) S.remplacerTout(uid, d.mots, e).then(() => toast("Import terminé et envoyé en ligne")).catch(() => toast("Import fait sur l'iPhone, envoi en ligne à réessayer"));
    else toast(d.mots.length + " mots importés");
  };

  const majPrefs = p => sauverEtat({ ...etat, prefs: { ...etat.prefs, ...p } });
  const majReglages = r => { sauverEtat({ ...etat, reglages: { ...etat.reglages, ...r } }); toast("Réglage enregistré"); };

  const enSession = ecran === "carte" && session;
  const onglet = ecran === "fin" ? "reviser" : ecran;
  const T = [["accueil", "Accueil", I.home], ["reviser", "Réviser", I.play], ["ajouter", "Ajouter", I.plus], ["stats", "Stats", I.stats], ["mots", "Mes mots", I.list]];
  const motCourant = enSession && mots.find(m => m.id === session.file[session.position].id);
  const demain = mots.filter(m => M.estARevoir(m.cartes.ef, jour + 1) || false).length + mots.filter(m => M.estARevoir(m.cartes.fe, jour + 1)).length;

  // Si le mot en cours a été supprimé pendant la session, on passe au suivant sans effet
  useEffect(() => { if (enSession && !motCourant) { const { session: s2 } = M.repondre(session, true); if (M.sessionTerminee(s2)) { setFin(s2); setSession(null); go("fin"); } else setSession({ ...s2, dir: session.dir, mode: session.mode, entrainement: session.entrainement }); } }, [enSession, motCourant]);

  return html`<div className="app">
    ${ecran === "accueil" && html`<${Accueil} mots=${mots} etat=${etatJour} jour=${jour} aRevoir=${aRevoir} nouveauxPrevus=${etat.reprise ? 0 : nouveauxDispo.ef + nouveauxDispo.fe} sync=${sync} go=${go} exporter=${exporter} compte=${compte}/>`}
    ${ecran === "reviser" && html`<${Reviser} etat=${etatJour} majPrefs=${majPrefs} aRevoir=${aRevoir} nouveauxDispo=${nouveauxDispo} commencer=${commencer} message=${messageSession} nbAppris=${{ ef: mots.filter(m => m.cartes.ef.case > 0).length, fe: mots.filter(m => m.cartes.fe.case > 0).length }} nbNouveaux=${{ ef: mots.filter(m => m.cartes.ef.case === 0).length, fe: mots.filter(m => m.cartes.fe.case === 0).length }} entrainement=${entrainement} plusDeNouveaux=${plusDeNouveaux}/>`}
    ${ecran === "ajouter" && html`<${FormMot} page=${true} key="page-ajout" enregistrer=${enregistrer}/>`}
    ${ecran === "stats" && html`<${Stats} mots=${mots} etat=${etatJour} jour=${jour} aRevoir=${aRevoir}/>`}
    ${ecran === "mots" && html`<${ListeMots} mots=${mots} jour=${jour} modifier=${m => setFeuille({ mot: m })}/>`}
    ${ecran === "reglages" && html`<${Reglages} etat=${etatJour} majReglages=${majReglages} compte=${compte} email=${email} sync=${sync} exporter=${exporter} importer=${importer}/>`}
    ${enSession && motCourant && html`<${Carte} mot=${motCourant} dir=${session.dir} mode=${session.mode} session=${session} repondre=${repondre} quitter=${() => { setSession(null); go("accueil"); toast("Progression enregistrée"); }} ajouter=${() => setFeuille({})}/>`}
    ${ecran === "fin" && fin && html`<${Fin} session=${fin} mots=${mots} serie=${M.joursConsecutifs(etat.joursActifs, jour)} demain=${demain} accueil=${() => go("accueil")} encore=${() => go("reviser")}/>`}

    ${!enSession && html`<nav className="tabs"><div className="tabs-in">
      ${T.map(([k, l, ic]) => html`<button key=${k} aria-current=${onglet === k ? "page" : undefined} onClick=${() => go(k)}>${ic}${l}</button>`)}</div></nav>`}
    ${feuille && html`<${FormMot} key=${feuille.mot ? feuille.mot.id : "nouveau"} mot=${feuille.mot} fermer=${() => setFeuille(null)} enregistrer=${enregistrer} supprimer=${supprimer}/>`}
    ${msg && html`<div className="toast" role="status">${msg}</div>`}
  </div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App}/>`);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
