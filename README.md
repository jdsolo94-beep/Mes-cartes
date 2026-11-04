# Mes cartes

Application personnelle de flash cartes pour apprendre le vocabulaire anglais (répétition espacée), installable sur iPhone.

Adresse : https://jdsolo94-beep.github.io/Mes-cartes/

- `index.html`, `manifest.webmanifest`, `sw.js` : application installable et hors ligne.
- `app/moteur.js` : moteur de répétition espacée (cases, passages, retards, jour à 4 h, sessions, mode reprise, vérification des réponses).
- `app/app.js` : écrans.
- `app/stockage.js` : copie sur l'iPhone, synchronisation Firebase, fichier de secours.
- `app/firebase-config.js` : paramètres du projet Firebase.
- `tests/` : tests automatiques des règles (`npm test`).
- `test-voix/` : page de test de la voix (étape 2).

## Règles de sécurité Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /utilisateurs/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
