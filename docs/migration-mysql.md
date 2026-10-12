# Stockage MySQL OVH

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
les formats famille à 11, 12 ou 13 colonnes et camp à 8 ou 9 colonnes, refuse les
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
