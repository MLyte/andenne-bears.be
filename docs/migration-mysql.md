# Préparation de la migration MySQL OVH

## État

Paramètres reçus le 12 octobre 2026 : MySQL 8.4, base et utilisateur
`andennebhmlyte01`, hôte `andennebhmlyte01.mysql.db`, serveur indiqué par OVH
`mysql101.eu002`. Le port 3306 est la valeur habituelle proposée dans le modèle ;
il reste à confirmer par un test de connexion depuis l'hébergement.

Le modèle `config/database-config.example.php` ne contient aucun mot de passe.
Il n'est pas utilisé par les pages actuelles et ne déclenche aucune migration.
La connexion réelle, le schéma SQL et la bascule restent à réaliser.

## Renseigner le secret sans le partager dans la conversation

1. Dans WinSCP, ouvrir le dossier privé `bears-family-day-private/`, voisin de
   `www/` et correspondant au `storage_dir` de l'installation.
2. Y envoyer `config/database-config.example.php` sous le nom
   `database-config.php`.
3. Éditer uniquement cette copie privée et remplir la valeur `password`.
   Dans une chaîne PHP entre apostrophes, écrire `\'` pour une apostrophe et
   `\\` pour un antislash faisant partie du mot de passe.
4. Enregistrer le fichier avec des droits limités au compte d'hébergement
   (600 si PHP s'exécute sous ce compte).

Ne pas remplir le modèle versionné, ni mettre la copie privée dans `www/`,
`dist/`, Git ou un message. Aucun script actuel ne lit encore cette configuration.

## Stockages identifiés dans le code local

| Données | Stockage actuel | Points à adapter |
| --- | --- | --- |
| Journée familiale | `family-day-2026.csv` | formulaire, suivi, corrections, suppressions, compteurs et exports |
| Camp de Blégny | `camp-blegny-2026.csv` | formulaire, suivi et exports |
| Tirage des équipes | `family-teams-2026.csv` | chargement et sauvegarde du tirage |
| Membres et compositions | `members-depth-chart.json` | accès centralisé dans `membres-data.php` |
| Sauvegardes | copies des fichiers privés | adapter la sauvegarde et la restauration aux données SQL |

Le périmètre initial est le remplacement des CSV comme stockage principal.
Le JSON des membres est identifié séparément pour décider de son inclusion.
Les photos de `member-photos/` peuvent rester des fichiers privés.
Les exports CSV peuvent être conservés, en étant générés depuis MySQL.

## Ordre de bascule prévu

1. Tester la connexion depuis PHP sur OVH avec PDO MySQL et `utf8mb4`, sans
   afficher le secret ni une erreur de connexion brute dans une page publique.
2. Préparer le schéma et les accès SQL, en conservant les références existantes,
   les contrôles d'accès et la détection des modifications concurrentes.
3. Sauvegarder les sources et tester un import réexécutable sans doublons,
   incluant les anciens formats encore acceptés par le code.
4. Prévoir une courte suspension des écritures pour l'import final ; vérifier
   chaque enregistrement ainsi que les totaux et les liens entre les données.
5. Basculer ensemble les lectures et écritures concernées, puis vérifier les
   formulaires, les interfaces privées, les compteurs, les équipes et les exports.
6. Conserver temporairement les fichiers d'origine comme sauvegarde privée.
   Un retour aux fichiers après de nouvelles écritures SQL exige de reporter
   ces écritures : ne pas réactiver automatiquement un CSV devenu obsolète.

Pour les bases incluses dans un hébergement Web OVH, les connexions externes
sont restreintes : prévoir le test depuis l'hébergement, pas uniquement depuis
le PC. Voir les [spécificités techniques OVH](https://github.com/ovh/ovhcloud-docs/blob/develop/docs/en/guides/web-cloud/web-hosting/hosting-technical-specificities.mdx).
