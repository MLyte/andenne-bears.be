# Stockage MySQL OVH

Les tarifs en vigueur figurent dans « Tarifs du camp communs à toutes les catégories » ci-dessous.
Les comptes rendus de déploiement suivants conservent les montants historiques.

## Ancien tarif d’une nuit — déployé et vérifié le 13 octobre 2026

Une nuit, le vendredi ou le samedi, coûte 90,50 € : base sans logement de 56 €
plus 34,50 € de logement (69 € par chambre double et par nuit, selon le budget
du dossier comité). Les deux choix du formulaire, le récapitulatif tarifaire,
le suivi et l’export CSV utilisent ce montant. Les forfaits de deux nuits et
sans logement restent respectivement à 125 € et 56 €.

Seuls `camp-blegny.html` et `suivi-camp-blegny.php` ont été publiés. Aucune
migration ni modification des inscriptions n’était nécessaire. Les deux
fichiers ont été relus par SFTP ; les options publiques, le suivi authentifié
et l’export ont été vérifiés en HTTPS. Les 19 inscriptions sont inchangées.
Le code précédent est conservé dans le dossier privé
`camp-price-deploy-d07e42/`. Le point d’accès temporaire a été supprimé (404).

## Choix des nuits — déployé et vérifié le 13 octobre 2026

Le champ `nuits` distingue `vendredi`, `samedi`, `deux` et `aucune`.
Les anciennes inscriptions avec logement conservent leur montant de 125 € et
reçoivent `a_preciser` : elles ne sont pas arbitrairement réparties entre les
deux nuits. Les inscriptions sans logement reçoivent `aucune`. Le suivi sépare
les lits du vendredi et du samedi et signale les choix encore à préciser.
Les paiements existants sont conservés. Le tarif d’une seule nuit, initialement
laissé à confirmer, a ensuite été fixé à 90,50 € (voir ci-dessus).

La migration ajoute `nuits VARCHAR(12) NOT NULL DEFAULT 'a_preciser'`, puis
normalise à `aucune` les anciennes lignes sans logement. Les formats CSV de
8 à 10 colonnes restent lus et sont étendus à 11 colonnes à l’écriture.
Les fichiers de stockage et d’inscription, la page du camp et son suivi ont été
publiés. Les Juniors peuvent
choisir le vendredi, le samedi, les deux nuits ou aucun logement, comme les
Seniors : ce choix a été confirmé. Le programme commun des U20 commence le samedi
matin ; la soirée du vendredi est réservée aux Seniors et le repas offert à
la Pizzeria Mia passe au samedi soir.

La migration réelle a conservé tous les champs et paiements des 19 inscriptions
au camp, ainsi que les 35 inscriptions familiales et les 22 joueurs du tirage.
Au contrôle, 17 inscriptions avec logement ont des nuits à préciser et 2 sont
sans logement. Aucun paiement n’était marqué comme reçu. Les anciennes lignes
ne sont pas transformées en nouvelles déclarations de présence par nuit.

Sauvegarde privée avant migration :
`bears-family-day-private/camp-nights-deploy-b84c20/database-before.json`.
SHA-256 : `990f4db8fba81414ffc002300f7791309dce3b526be939cb8a13f3f258c4800d`.
Les quatre fichiers précédents sont conservés dans `code-before/`.
Les tests SQL sur tables temporaires, le suivi authentifié, les compteurs,
l’export CSV et les fichiers HTTPS ont été vérifiés. Les quatre fichiers
publiés sont identiques aux sources locales après relecture SFTP. Les outils
temporaires ont été retirés et le point d’accès de maintenance répond 404.
Il n’y a pas eu de contrôle visuel dans un navigateur.

## Paiements du camp — vérifié le 13 octobre 2026

La colonne `bears_camp_registrations.paye` a été ajoutée sur OVH avec la valeur
par défaut `non`. Une comparaison avant/après a confirmé la conservation de
tous les champs existants : 19 inscriptions au camp, 35 inscriptions familiales
et 22 joueurs du tirage. Le suivi authentifié et son export CSV affichent
17 participants à 125 € et 2 à 56 €, soit 2 237 € attendus, avec aucun paiement
marqué comme reçu au moment du contrôle.

Sauvegarde préalable privée :
`bears-family-day-private/camp-payment-deploy-a72f19/database-before.json`.
SHA-256 : `b617dbe26b8dc165aac484061a9cd8f938e92d8d1f288e52774b4c4efa1f768c`.
Le code précédent est conservé dans le sous-dossier `code-before/`.

Les tests SQL, dont la migration d’une ancienne table et l’enregistrement d’un
paiement, ont réussi dans des tables temporaires. Les sept fichiers publiés
ont été comparés octet par octet par SFTP ; la page du camp, son image de pizza
et la feuille de style du suivi ont aussi été vérifiées en HTTPS. Le suivi
reste protégé pour les visiteurs non connectés. Les outils temporaires ont
été retirés et leur point d’accès répond 404. Ces contrôles ne constituent pas
une vérification visuelle dans un navigateur.

## État vérifié le 12 octobre 2026

Migration activée sur OVH à 16:58 UTC : 35 inscriptions familiales,
19 inscriptions au camp et 22 joueurs du tirage importés. Tous les champs SQL
correspondaient aux sources. Les exports authentifiés, les compositions du
tirage, la liste des joueurs et les compteurs ont été comparés avant/après.
Les compteurs publics étaient de 25 joueurs au flag et 77 burgers.

Copie des sources :
`bears-family-day-private/migration-backups/20261012-165859-5602c0e2/`.
Copie du code précédent :
`bears-family-day-private/migration-code-backup-20261012-165525/`.
La première sauvegarde SQL `backups/2026-10-12-mysql/mysql-data.json` a été
vérifiée par son empreinte. Les outils temporaires de test et maintenance ont
été retirés ; leurs URL répondent 404.

Les écritures SQL ont été testées dans des tables temporaires ; les contrôles
finaux des pages réelles ont conservé les inscriptions existantes intactes.

## Connexion et périmètre

Connexion vérifiée depuis PHP sur OVH le 12 octobre 2026 : MySQL `8.4.11-11`,
PHP `8.5.7`, port `3306`, base et utilisateur `andennebhmlyte01`, hôte
`andennebhmlyte01.mysql.db`. Le serveur indiqué par OVH est `mysql101.eu002`.

Le secret reste dans `bears-family-day-private/database-config.php`, hors de
`www/`, avec les droits `600`. Il n'est ni téléchargé pour les tests, ni envoyé
dans Git, ni inclus dans `dist/`. Le modèle sans secret est
`config/database-config.example.php`.

| Données | Table MySQL | Ancienne source privée |
| --- | --- | --- |
| Journée familiale | `bears_family_registrations` | `family-day-2026.csv` |
| Camp de Blégny | `bears_camp_registrations` | `camp-blegny-2026.csv` |
| Tirage des équipes | `bears_team_players` | `family-teams-2026.csv` |
| État de l'import | `bears_dataset_state` | présence et empreinte de chaque source |

Chaque inscription et chaque joueur du tirage occupe une ligne SQL, avec les
champs existants conservés. Les tables utilisent InnoDB et `utf8mb4`. Les
références restent uniques et l'ordre d'origine est conservé. Les exports CSV
restent disponibles : en mode MySQL ils sont générés depuis la base, en mémoire.

L'espace membres utilise encore `members-depth-chart.json`. Les photos restent
dans `member-photos/`. Ils ne font pas partie de cette migration des trois CSV.

## Activation et import

La présence de `database-config.php` seule n'active rien. Le fichier privé
`.mysql-active`, contenant exactement `bears-mysql-v1` suivi d'un saut de ligne,
active MySQL après un import vérifié. `bears-storage.php` centralise les accès.

Avant activation, le code conserve la compatibilité avec les CSV. Après
activation, aucune panne SQL ne provoque un retour automatique aux fichiers :
les pages répondent avec une erreur temporaire, sans confirmer une écriture
échouée et sans exposer les détails de connexion.

`bears-migration.php` contient l'import ; `scripts/migrate-mysql.php` fournit
l'entrée CLI. La commande suivante vérifie les sources sans créer les tables
ni activer MySQL :

```sh
php scripts/migrate-mysql.php --private=/home/andennebh/bears-family-day-private
```

Ajouter `--activate` pour importer et activer, après publication de tous les
fichiers dépendants et extinction des anciennes requêtes. L'hébergement actuel
accepte SFTP mais pas l'exécution de commandes SSH ; la maintenance à distance
passe donc par un script PHP temporaire, limité à HTTPS et protégé par un jeton
aléatoire envoyé en en-tête. Ce script doit être retiré après vérification. Il
n'est pas inclus dans `dist/` et aucun outil de maintenance permanent n'est publié.

L'import prend un verrou exclusif `.mysql-migration.lock`, partagé par les
requêtes applicatives, puis verrouille les sources. Il sauvegarde les fichiers
dans `migration-backups/<date-identifiant>/` avec un manifeste SHA-256. Il accepte
les formats famille à 11, 12 ou 13 colonnes et camp à 8, 9 ou 10 colonnes, refuse les
références dupliquées et vérifie chaque champ après insertion. Les insertions
sont transactionnelles ; le marqueur n'est publié qu'après comparaison exacte.

Une nouvelle exécution après activation ne réimporte rien. Si un import a été
validé en base sans avoir pu publier le marqueur, la reprise n'est acceptée que
si les sources et toutes les lignes SQL correspondent encore exactement. Une
base différente n'est jamais écrasée automatiquement.

## Déploiement

Déployer `bears-storage.php` avant `private-backup.php`, puis les cinq points
d'accès : `family-day.php`, `camp-registration.php`, `suivi-inscriptions.php`,
`suivi-camp-blegny.php`, `tirage-equipes.php`. Les textes du tirage sont adaptés
dans `tirage-equipes.html` et `scripts/family-teams-ui.js`.

Comparer les fichiers distants à la version de départ, conserver une copie,
envoyer les remplacements, puis vérifier leurs empreintes. Ne pas envoyer
`bears-migration.php`, les tests et les outils CLI dans le dossier public
habituel. Pour une maintenance ponctuelle, les placer dans une zone temporaire
interdite d'accès Web direct et les retirer ensuite.

## Vérifications

### Suivi des paiements du camp

La colonne `paye` vaut `non` par défaut, pour les anciennes comme les nouvelles
inscriptions. Le montant affiché et exporté est calculé depuis `categorie` et
`nuits`, selon les tarifs ci-dessous. La case se modifie dans le suivi via
« Modifier », puis « Enregistrer » ; le formulaire public ne peut pas la définir.

Publier ensemble `bears-storage.php`, `private-backup.php`,
`camp-registration.php`, `suivi-camp-blegny.php` et `camp-dashboard.css`.
En MySQL, le premier accès au camp ajoute `paye VARCHAR(3) NOT NULL DEFAULT 'non'`
si nécessaire, avant toute transaction ; l’utilisateur SQL doit disposer du droit
`ALTER`. Une erreur bloque l’opération, sans retour vers les CSV. Les sauvegardes
préparent également cette colonne avant d’ouvrir leur transaction de lecture.
En mode CSV, les anciens formats sont normalisés lors de la lecture et migrés
à la prochaine écriture. L’export ajoute `paye` et `montant_eur` ; le montant
calculé n’est pas stocké dans la ligne d’inscription.

### Tarifs du camp communs à toutes les catégories (13 octobre 2026)

| Nuits | Seniors, U20 et staff |
| --- | ---: |
| Aucune | 30 € |
| Vendredi uniquement | 73 € |
| Samedi uniquement | 73 € |
| Vendredi et samedi | 116 € |

Le terrain est partagé à égalité : 10 heures × 50 € / 30 joueurs = 16,67 €
par personne, arrondis au centime. Le menu sportif du samedi midi coûte 13,20 €.
La base de 29,87 € est arrondie à 30 € pour le forfait joueur.
Chaque nuit ajoute 34,50 € en chambre double et le petit-déjeuner du lendemain
à 8,50 €, quelle que soit la catégorie. Les pizzas du samedi soir sont offertes
par le club. Aucun repas du dimanche midi n’est facturé.

Les U20 sont conviés dès la séance du samedi à 8h30. Ceux qui choisissent de
dormir le vendredi prennent aussi le petit-déjeuner du samedi. Les nuits restent
libres pour toutes les catégories ; aucun choix de jours supplémentaire n’est
nécessaire, tous participent au même programme sur le terrain.

Pour les anciennes inscriptions `a_preciser`, le montant reste vide dans
l’export et affiche « Nuits à préciser » dans le suivi pour toutes les catégories.
Aucun forfait de deux nuits n’est supposé avant ce choix. Les tarifs sont
calculés à la lecture : aucune migration SQL supplémentaire ni modification
des inscriptions ou paiements existants n’est nécessaire.
Publier ensemble `camp-blegny.html`, `scripts/camp-registration.js` et
`suivi-camp-blegny.php`. Les prix figurent directement dans les options HTML et
ne changent plus selon la catégorie.

### Commandes de contrôle

- `php tests/mysql-storage.php` vérifie les anciens formats, les références
  dupliquées, les caractères accentués, les guillemets et les champs multilignes.
- `node --test tests/registration-storage.test.mjs tests/tirage-save.test.mjs tests/family-teams.test.mjs`
  couvre les formulaires, suivis, exports, conflits, règles du tirage et le
  refus du repli CSV après activation.
- `testStorageMysql()` dans `tests/mysql-storage.php` utilise exclusivement des
  tables MySQL temporaires, propres à sa connexion, et un répertoire de test
  privé. Il vérifie les insertions, doublons, corrections concurrentes,
  suppressions, remplacement transactionnel du tirage et sauvegardes SQL.

## Conservation et retour arrière

Les CSV d'origine deviennent des archives après activation : les modifier ne
modifie plus le site. Conserver temporairement ces archives et les copies
d'import, puis appliquer les durées de conservation du projet, y compris aux
sauvegardes. Les sauvegardes quotidiennes couvrent désormais MySQL : voir
`docs/sauvegardes-privees.md`.

Ne pas supprimer `.mysql-active` pour revenir à de vieux CSV après des écritures
SQL. Un retour nécessite une suspension des écritures, un export des données
SQL actuelles vers les anciens formats, une comparaison complète et une
bascule coordonnée du code et du stockage.
