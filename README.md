# LTC – Pointage des lots

Appli web d'inventaire : on importe la liste Excel des lots attendus, puis on pointe les lots présents au scanner de codes-barres, au clavier ou en touchant la ligne dans le tableau. L'appli exporte le résultat en Excel.

- Site : https://rottweilert.github.io/LTC-Pointage-Lots/ (GitHub Pages, mis à jour à chaque modification de la branche `main`). Installable sur téléphone et tablette (« Ajouter à l'écran d'accueil »).
- Données partagées : Firebase Firestore (projet `ltc-pointage-lots-4bfa7`). Tous les appareils voient le même inventaire en direct ; hors ligne, les actions sont gardées sur l'appareil et envoyées au retour du réseau.
- La configuration Firebase est dans `src/app.src.html` (`FIREBASE_CONFIG`). Si des inventaires avaient été commencés sur un appareil avant le branchement, un bouton propose de les envoyer vers la base.
- `firestore.rules` : règles d'accès à coller dans Firebase → Firestore Database → Règles.

## Utilisation

1. Ouvrir le site dans **Chrome** ou **Edge**.
2. « Importer Excel / CSV » : choisir le fichier, la colonne des numéros de lots, éventuellement un **deuxième numéro pour pointer** (ex. code-barres à 6 chiffres + n° de lot à 5 chiffres, détecté automatiquement), et les autres colonnes à garder (affichées dans le tableau et reprises dans l'export ; le choix est proposé à nouveau au prochain import).
   Avec deux colonnes de numéros, un lot se pointe par l'un ou l'autre ; si un même numéro existe dans les deux colonnes pour des lots différents, l'appli demande laquelle.
3. Scanner les codes-barres ou taper un numéro dans la case « Saisie manuelle / scanner » : le lot est pointé tout de suite (zéros initiaux tolérés). Dans le tableau, **toucher une ligne la coche ou la décoche**. « ↺ Annuler la dernière action » défait le dernier pointage.
   Le tableau affiche toutes les colonnes gardées (n° de lot, 2e numéro, statut, heure, puis les autres) ; s'il y en a beaucoup, il défile sur le côté et le n° de lot reste visible.
4. « Gérer les listes » (en haut) : supprimer une ou plusieurs listes déjà traitées, ou toutes (« Cocher les clôturées », « Tout cocher »), avec confirmation.
5. « Exporter Excel » à tout moment : 4 feuilles (inventaire complet, lots manquants, anomalies, historique). Lignes **vertes** = lots pointés, **rouges** = non pointés (ou manquants à la clôture), orange = anomalies ; filtres activés et ligne de titres figée. L'export est fabriqué par `src/xlsx-writer.js` et fonctionne hors ligne.

### Saisies au clavier possibles

| Exemple | Effet |
| --- | --- |
| `20076` ou `111376` (scan) | Pointe le lot |
| `20054 à 20069`, `du 20054 au 20069` | Pointe tous les lots attendus de la plage |
| `20200 à 20250 sauf 20225` | Plage avec exclusion |
| `20054 à 20069 puis 20076` | Plusieurs éléments à la suite |
| `retire 20125`, `retire 20200 à 20220` | Dépointe |
| `annule` | Annule la dernière action faite sur cet appareil |

Une plage de plus de 400 lots demande une confirmation.

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
- **Tests des commandes** : lancés à chaque modification.

## Développement

- `src/parser.js` : compréhension des saisies (numéros, plages, exclusions, ambiguïtés).
- `src/data-layer.js` : enregistrement (Firebase ou appareil) et synchronisation en direct.
- `src/app.src.html` : interface. **Modifier ces fichiers, puis lancer `node build.js`** pour reconstruire `index.html`.
- `node tests/test.js` : tests du moteur de commandes. `tests/fake-firebase.js` : faux Firebase pour tester dans un navigateur sans connexion.
- `sw.js` : mode hors ligne (page, icônes et bibliothèques gardées sur l'appareil). Changer `CACHE` pour forcer une mise à jour.
