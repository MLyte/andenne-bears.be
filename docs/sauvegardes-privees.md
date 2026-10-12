# Sauvegardes du stockage privé

`private-backup.php` crée une copie lors de la première écriture réussie de chaque
jour (heure de Bruxelles). Le dossier est `bears-family-day-private/backups/YYYY-MM-DD/`,
hors de `www/` et visible via SFTP. Aucune tâche planifiée ni accès OVH n'est requis.
Un jour sans écriture ne produit pas de nouvelle copie : les données n'ont alors
pas changé. Les autres écritures du même jour ne remplacent pas la copie du jour.

Avant activation MySQL, chaque copie rassemble, lorsqu'ils existent,
`family-day-2026.csv`, `camp-blegny-2026.csv`, `family-teams-2026.csv`,
`members-depth-chart.json` et `member-photos/`.

Après activation, le dossier quotidien s'appelle `YYYY-MM-DD-mysql/`. Les trois
CSV sont remplacés par `mysql-data.json`, un instantané transactionnel des
inscriptions et du tirage. Les données membres et photos restent copiées comme
avant. Ce nom distinct évite de confondre la copie CSV du matin et la copie SQL
créée le jour de la bascule. Aucune copie ne contient `database-config.php`.

`manifest.json` contient les empreintes SHA-256 de chaque
fichier et marque une copie complète. Le dossier n'est publié sous son nom daté
qu'une fois tous les fichiers copiés.

À la création d'une nouvelle copie, les dossiers datés de plus de 14 jours sont
supprimés. Cette purge dépend d'une prochaine écriture ; il faut également
supprimer manuellement les copies des données du 25 octobre à la fin de leur
durée de conservation. Une suppression de joueur ou d'inscription retire la
donnée active, mais les copies antérieures peuvent la contenir pendant cette
durée. Le dossier de sauvegarde étant sur le même hébergement, conserver aussi
une copie régulière hors d'OVH par SFTP.

Pour restaurer, vérifier d'abord les empreintes du manifeste, conserver une
copie des données actives. Les fichiers membres et photos peuvent être remis
dans le stockage privé. Pour MySQL, `mysql-data.json` contient `schema`, la date
et `datasets.family`, `datasets.camp`, `datasets.teams` ; une valeur `null`
signifie qu'aucune source n'existait. La restauration doit réinsérer ces lignes
dans les tables correspondantes et mettre à jour `bears_dataset_state.present`,
dans une transaction et avec les écritures applicatives suspendues via le
verrou exclusif `.mysql-migration.lock`. Une simple copie du JSON sur le serveur
ne restaure pas la base. Vérifier ensuite tous les champs et les totaux avant
de rouvrir les écritures. Ne jamais envoyer ces données dans `www/` ni `dist/`.

Les copies de bascule `migration-backups/` sont séparées des copies quotidiennes
et ne sont pas purgées automatiquement. Les supprimer à la fin de leur durée
de conservation. Les anciens CSV actifs ne reçoivent plus les nouvelles
inscriptions après activation MySQL.
