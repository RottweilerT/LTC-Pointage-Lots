# LTC – Pointage vocal des lots

Appli web d'inventaire : on importe la liste Excel des lots attendus, puis on annonce à voix haute les numéros présents. L'appli les coche automatiquement et exporte le résultat en Excel.

- Site : https://rottweilert.github.io/LTC-pointage-lots/ (GitHub Pages, mis à jour à chaque modification de la branche `main`). Installable sur téléphone et tablette (« Ajouter à l'écran d'accueil »).
- Données partagées : Firebase Firestore (projet `ltc-pointage-lots`). Tous les appareils voient le même inventaire en direct ; hors ligne, les actions sont gardées sur l'appareil et envoyées au retour du réseau.
- Tant que `FIREBASE_CONFIG` vaut `null` dans `src/app.src.html`, les données restent sur l'appareil. Une fois Firebase branché, un bouton propose d'envoyer vers la base les inventaires commencés sur l'appareil.
- `firestore.rules` : règles d'accès à coller dans Firebase → Firestore Database → Règles.

## Utilisation

1. Ouvrir le site dans **Chrome** ou **Edge**.
2. « Importer Excel / CSV » : choisir le fichier et la colonne des numéros de lots.
3. Toucher le micro et annoncer les lots.
4. « Exporter Excel » à la fin : 4 feuilles (inventaire complet, lots manquants, anomalies, historique).

### Commandes vocales

| Exemple | Effet |
| --- | --- |
| « Lot 76 », « 79 », « le 125, le 126 et le 130 » | Pointe les lots cités |
| « Du lot 54 au lot 69 », « de 100 à 150 », « 100 jusqu'à 150 » | Pointe tous les lots attendus de la plage |
| « Du 200 au 250, sauf le 225 » | Plage avec exclusion |
| « Du 54 au 69, ensuite le 76, ensuite du 80 au 100 » | Commande mixte |
| « Annule la dernière action » | Annule le dernier pointage fait sur cet appareil (numéro ou plage) |
| « Retire le lot 125 », « Retire les lots de 200 à 220 » | Dépointe |
| « Répète la dernière opération » | Affiche et énonce la dernière opération |
| « Pause » / « Reprendre » | Suspend / reprend l'écoute |

En cas de doute (chiffre par chiffre, plage de plus de 400 lots, transcription incertaine), une confirmation est demandée : répondre « oui », « choix 2 » ou « non ».

## Base Firebase

| Collection | Contenu |
| --- | --- |
| `pt_inventaires` | Un document par inventaire : nom, colonnes du fichier, colonne des lots, clôture |
| `pt_lignes` | Le fichier importé, par tranches de 500 lignes (`{inv}_{n°}`) |
| `pt_etat` | Le pointage, par tranches de 500 : `t.{ligne}` = heure du pointage |
| `pt_journal` | Historique des opérations, avec de quoi les annuler |
| `pt_anomalies` | Numéros absents de la liste, commandes ambiguës ou non comprises |

Pointer une plage ne coûte qu'une écriture par tranche touchée : un inventaire de 3 000 lots reste largement dans l'offre gratuite de Firebase.

## Sauvegardes (onglet Actions)

- **Sauvegarde de la base** : chaque nuit, copie chiffrée de toute la base dans `sauvegarde/base.json.enc` (secret du dépôt `SAUVEGARDE_CLE` requis).
- **Restaurer la base** : remet une sauvegarde dans Firebase (taper RESTAURER pour confirmer).
- **Tests des commandes vocales** : lancés à chaque modification.

## Développement

- `src/parser.js` : compréhension des commandes (nombres en français, plages, exclusions, ambiguïtés).
- `src/data-layer.js` : enregistrement (Firebase ou appareil) et synchronisation en direct.
- `src/app.src.html` : interface. **Modifier ces fichiers, puis lancer `node build.js`** pour reconstruire `index.html`.
- `node tests/test.js` : tests du moteur de commandes. `tests/fake-firebase.js` : faux Firebase pour tester dans un navigateur sans connexion.
- `sw.js` : mode hors ligne (page, icônes et bibliothèques gardées sur l'appareil). Changer `CACHE` pour forcer une mise à jour.
