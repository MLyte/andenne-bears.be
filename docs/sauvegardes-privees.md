# Sauvegardes du stockage privé

`private-backup.php` crée une copie lors de la première écriture réussie de chaque
jour (heure de Bruxelles). Le dossier est `bears-family-day-private/backups/YYYY-MM-DD/`,
hors de `www/` et visible via SFTP. Aucune tâche planifiée ni accès OVH n'est requis.
Un jour sans écriture ne produit pas de nouvelle copie : les données n'ont alors
pas changé. Les autres écritures du même jour ne remplacent pas la copie du jour.

Chaque copie rassemble, lorsqu'ils existent, `family-day-2026.csv`,
`camp-blegny-2026.csv`, `family-teams-2026.csv`, `members-depth-chart.json`
et `member-photos/`. `manifest.json` contient les empreintes SHA-256 de chaque
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
copie des fichiers actifs, puis remettre les fichiers choisis dans le stockage
privé. Ne jamais envoyer ces données dans `www/` ni dans `dist/`.
