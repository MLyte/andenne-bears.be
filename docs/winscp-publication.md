# Filtre WinSCP — Andenne Bears

## Méthode recommandée : dossier dist

Depuis la racine du projet, exécuter `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-dist.ps1` après chaque modification. L'option d'exécution s'applique uniquement à ce processus PowerShell. Le script régénère uniquement `dist/`, sans connexion au serveur.

Dans WinSCP, choisir `C:\www\andenne-bears.be\dist\` à gauche et le dossier `www/` du serveur à droite. Envoyer le **contenu** de `dist/` directement dans `www/`, sans créer `www/dist/`. Synchroniser vers Distant avec aperçu et **Supprimer les fichiers décoché**.

`config/family-day-config.php` est inclus dans `dist/` : il contient la configuration d'ouverture, l'identifiant organisateur et l'empreinte du mot de passe définis localement. Son chemin de stockage `dirname(__DIR__, 2) . '/bears-family-day-private'` pointe vers le dossier privé voisin de `www/` sur OVH. Les CSV restent hors de `www/` et ne sont jamais copiés, recréés ni vidés par le script. Une installation vierge nécessite de créer ce dossier privé avec les droits PHP nécessaires. Les configurations de contact et ChangeThis sont copiées lorsqu'elles existent localement. La page comité du camp est incluse, sans ajouter de lien public.

La liste des pages est explicite dans `scripts/build-dist.ps1` ; ajouter toute nouvelle page à cette liste. Les ressources JS, images et polices sont collectées automatiquement. Git, sauvegardes, tests, notes et scripts de développement sont exclus. `dist/` est ignoré par Git et contient des configurations privées : ne pas le publier dans un dépôt ou comme archive publique.

## Ancienne méthode : filtrer la racine du projet

Le filtre prêt à copier est dans `winscp-site-mask.txt` (une seule ligne).

## Enregistrer le réglage

1. Annuler la liste de synchronisation actuelle : elle a été calculée sans filtre.
2. Dans la fenêtre Synchroniser, ouvrir les paramètres de transfert.
3. Coller toute la ligne de `winscp-site-mask.txt` dans **Masque de fichiers**.
4. Laisser **Exclure les fichiers cachés** décoché : `.ovhconfig` et `.htaccess` doivent pouvoir être envoyés.
5. Cocher **Exclure les répertoires vides**.
6. Enregistrer ces paramètres comme préréglage **Andenne Bears — site uniquement** et le sélectionner pour les prochaines synchronisations. Si proposé, activer la sélection automatique pour le répertoire local `C:\www\andenne-bears.be\`.
7. Synchroniser vers **Distant**, avec aperçu des changements et **Supprimer les fichiers** décoché. Recalculer la liste avant de lancer le transfert.

## Contenu retenu

Pages HTML/PHP, CSS, JavaScript, images, polices, `robots.txt`, `sitemap.xml`, `.ovhconfig` et `.htaccess`. Les configurations de contact et ChangeThis restent incluses ; la configuration locale des inscriptions et les exemples sont exclus.

Git, sauvegardes de publication, documentation, tests, maquettes, ancienne version `v0`, dépendances Node et scripts de travail Python/PowerShell/shell ne sont pas envoyés. Les notes texte, fichiers Markdown et paramètres locaux `.ovh-local.ps1` ne sont pas inclus.

Ce filtre ne nettoie pas les fichiers déjà présents sur le serveur et ne lance aucun transfert. Il faut le sélectionner dans WinSCP pour qu'il s'applique. Si le site reçoit un nouveau type de ressource, ajouter son extension au masque.

Documentation officielle : https://winscp.net/eng/docs/file_mask et https://winscp.net/eng/docs/transfer_settings
