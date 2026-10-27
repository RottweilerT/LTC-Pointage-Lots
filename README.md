# LTC – Pointage vocal des lots

Application web d'inventaire : on importe la liste Excel des lots attendus, puis on annonce à voix haute les numéros présents. L'application les coche automatiquement et exporte le résultat en Excel.

## Utilisation

1. Ouvrir `index.html` dans **Chrome** ou **Edge** (directement, ou via l'adresse GitHub Pages / Netlify).
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
| « Annule la dernière action » | Annule le dernier pointage (numéro ou plage) |
| « Retire le lot 125 », « Retire les lots de 200 à 220 » | Dépointe |
| « Répète la dernière opération » | Affiche et énonce la dernière opération |
| « Pause » / « Reprendre » | Suspend / reprend l'écoute |

En cas de doute (chiffre par chiffre, plage de plus de 400 lots, transcription incertaine), une confirmation est demandée : répondre « oui », « choix 2 » ou « non ».

## À savoir

- La dictée de Chrome / Edge passe par un service en ligne : **connexion Internet requise** pour la voix. L'import / export Excel charge la bibliothèque SheetJS depuis cdnjs (connexion requise aussi). Le pointage manuel et la consultation fonctionnent hors ligne.
- Les données sont sauvegardées dans le navigateur (IndexedDB) de l'appareil utilisé, après chaque action.
- Le micro n'est autorisé que sur une page en `https://` ou ouverte en fichier local.

## Développement

- `src/parser.js` : compréhension des commandes (nombres en français, plages, exclusions, ambiguïtés).
- `src/app.src.html` : interface.
- `node build.js` : reconstruit `index.html`.
- `node tests/test.js` : tests automatisés du moteur de commandes.
