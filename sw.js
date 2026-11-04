// Fonctionnement hors ligne : les fichiers de l'application sont gardés sur l'iPhone.
// Changer VERSION à chaque mise en ligne pour que l'iPhone récupère la nouvelle version.
const VERSION = "mescartes-1.0.4";
const FICHIERS = [
  "./", "./index.html", "./manifest.webmanifest",
  "./app/style.css", "./app/app.js", "./app/moteur.js", "./app/stockage.js", "./app/firebase-config.js",
  "./vendor/react.production.min.js", "./vendor/react-dom.production.min.js", "./vendor/htm.umd.js",
  "./vendor/firebase-app-compat.js", "./vendor/firebase-auth-compat.js", "./vendor/firebase-firestore-compat.js",
  "./icons/icone-180.png", "./icons/icone-192.png", "./icons/icone-512.png",
];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSION).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
// Réseau d'abord (pour avoir la dernière version), copie locale si pas de réseau.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Firebase passe directement
  e.respondWith(
    fetch(e.request).then(r => { const copie = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copie)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
