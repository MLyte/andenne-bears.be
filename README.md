# Andenne Bears

Depot du site public des Andenne Bears : une page statique, des assets, un
script front et quelques endpoints PHP pour les besoins serveur.

## Etat Actuel

- Site sans build ni dependances npm.
- Entree principale : `index.html`.
- Styles : `bears.css`.
- JavaScript front : `scripts/bears.js`.
- Formulaire de contact : POST vers `contact.php`.
- Widget feedback actif : script heberge ChangeThis dans le `<head>` de `index.html`.
- Banniere `Nouveau site` : encore dans le HTML, mais masquee temporairement avec `hidden`.

## Lancer En Local

Pour relire la page sans serveur :

```text
index.html
```

Pour servir les assets comme en production :

```powershell
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000/
```

Le formulaire de contact et les endpoints PHP demandent un serveur PHP. Avec le
serveur Python, la page s'affiche, mais les soumissions serveur ne sont pas
representatives.

## Fichiers Importants

- `index.html` : structure de la page, SEO, script ChangeThis heberge.
- `bears.css` : styles complets du site.
- `scripts/bears.js` : menu, ancres, formulaire, panneau de contact et logique UI.
- `contact.php` : validation, rate-limit et envoi du formulaire de contact.
- `changethis.php` : ancien endpoint ChangeThis local vers GitHub issues.
- `robots.txt` et `sitemap.xml` : indexation.
- `config/contact-config.example.php` : modele de config contact.
- `config/changethis-config.example.php` : modele pour l'ancien endpoint ChangeThis local.
- `scripts/deploy-ovh.ps1` : deploiement OVH principal sous Windows.
- `scripts/deploy-ovh.sh` : deploiement OVH bash.
- `v0/` : ancienne version conservee comme archive de reference.

Les documents de conception (`refonte-contenu-andenne-bears.md`,
`designer-ux-architecture.md`, `designer-ui-direction-visuelle.md`,
`brief-binome-web-designers.md`) sont des notes de refonte, pas du code runtime.

## Configuration Serveur

Les fichiers reels de configuration ne sont pas versionnes.

Pour activer le formulaire de contact, creer :

```text
config/contact-config.php
```

a partir de :

```text
config/contact-config.example.php
```

Pour l'ancien endpoint local ChangeThis, creer si necessaire :

```text
config/changethis-config.php
```

a partir de :

```text
config/changethis-config.example.php
```

Le token GitHub attendu par cet exemple vient de `GITHUB_ISSUES_TOKEN`.

## ChangeThis

L'integration active ne charge plus le bundle local. Elle utilise :

```html
<script src="https://app.changethis.dev/widget.js" data-project="ct_146aeb29a18049799d9d9cd474dbceab" data-locale="fr" data-position="bottom-right" data-button-variant="subtle" data-reporter-fields="optional"></script>
```

Les fichiers suivants restent dans le depot pour l'ancien flux self-hosted et la
synchronisation manuelle du bundle :

- `changethis.php`
- `scripts/changethis-widget.js`
- `scripts/changethis-init.js`
- `scripts/vendor/changethis-widget.global.js`
- `scripts/sync-changethis-widget.ps1`

Ils ne sont pas appeles par `index.html` tant que le script heberge reste en
place.

## Deploiement OVH

Faire un dry-run avant tout envoi reel.

PowerShell, recommande sur cette machine :

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-ovh.ps1 -DryRun
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-ovh.ps1 -Ssl
```

Bash :

```bash
./scripts/deploy-ovh.sh --dry-run
./scripts/deploy-ovh.sh
```

Variables d'environnement supportees :

```bash
export OVH_FTP_HOST="ftp.clusterXXX.hosting.ovh.net"
export OVH_FTP_USER="ton-login-ovh"
export OVH_FTP_PASSWORD="ton-mot-de-passe"
export OVH_FTP_PATH="/www"
export OVH_FTP_PORT="21"
```

Le script bash peut aussi utiliser `.ovh-ftp.netrc` ou `OVH_FTP_NETRC`.

Attention : les deux scripts n'ont pas exactement la meme liste de fichiers.

- PowerShell envoie notamment `.ovhconfig`, `robots.txt`, `sitemap.xml`,
  `index.html`, `journee-familiale.html`, `bears.css`, `contact.php`, `family-day.php`,
  `changethis.php`, `config/contact-config.php`, `fonts/`, `images/`, `scripts/`
  et, si présents, `config/changethis-config.php` et `config/family-day-config.php`.
- Bash envoie `.ovhconfig`, `robots.txt`, `sitemap.xml`, `index.html`, `journee-familiale.html`, `bears.css`,
  `contact.php`, `family-day.php`, `config/contact-config.php`, `fonts/`, `images/`
  et `scripts/`, ainsi que `config/family-day-config.php` s'il existe.

Options utiles :

- `-ChangedOnly` / `--changed-only` : envoyer uniquement les fichiers modifies.
- `-ForceAll` / `--force-all` : forcer un upload complet.
- `-SkipChangeThisSync` : PowerShell uniquement, evite la synchronisation du bundle ChangeThis local.
- `--debug` : bash uniquement, logs FTP/FTPS detailles.

Le mode changed-only s'appuie sur le manifeste distant :

```text
/www/.deploy-manifest-sha256.txt
```

## Journée familiale du 25 octobre 2026

La page `journee-familiale.html` affiche déjà le formulaire, mais son bouton de confirmation est désactivé et `family-day.php` refuse les envois tant que `registration_open` reste à `false`. Le lien dans l'accueil peut être publié sans accepter d'inscription. Les horaires affichés sont 9 h pour le flag, 13 h 00 pour le barbecue et 14 h 30 pour le match. Avant activation, confirmer le prix éventuel du barbecue, le responsable des inscriptions, les modalités pour les mineurs et la couverture des non-licenciés.

Le formulaire inscrit au tournoi de flag et réserve un repas au barbecue de 13 h 00, un formulaire par personne. La projection du match ne demande pas d'inscription. La colonne `match` du CSV reste présente pour conserver son format ; les nouvelles inscriptions y portent `non`.

1. Créer `config/family-day-config.php` depuis `config/family-day-config.example.php` (fichier non versionné).
2. Créer un répertoire privé **hors de `/www`**, accessible en écriture à PHP, et le renseigner dans `storage_dir`. Le script refuse un chemin dans la racine publique.
3. Définir `export_username` et `export_password_hash` avec un mot de passe long et aléatoire. La commande de génération est dans le modèle de configuration. Ne pas partager ce mot de passe dans le dépôt.
4. Après décisions et essai sur l'hébergement réel, passer `registration_open` à `true`, retirer `disabled` du bouton de confirmation dans `journee-familiale.html` et lui redonner un libellé de confirmation. L'export CSV est accessible en HTTPS à `family-day.php?export=1` avec authentification HTTP Basic. Les colonnes sont séparées par `;`.
5. Le responsable doit traiter les demandes de rectification/suppression et supprimer le fichier CSV du répertoire privé au plus tard le 30 novembre 2026. Vérifier aussi les éventuelles sauvegardes de l'hébergeur.

L'inscription ne crée pas d'e-mail de confirmation : la référence est affichée à l'écran après écriture du CSV. En cas d'échec de stockage, le formulaire signale une erreur et ne confirme pas l'inscription. Les tests sur PHP/OVH et la lecture de l'export doivent être faits avant ouverture publique.

Le compteur sous le formulaire lit le même CSV privé via `family-day.php?counts=1` et se rafraîchit toutes les 30 secondes (ainsi qu'après une inscription réussie). Il ne compte que les lignes inscrites au flag et publie uniquement cinq totaux, sans noms ni coordonnées. Les groupes se recoupent : « membre Bears » correspond à la réponse « joue déjà aux Andenne Bears (flag ou tackle) », et « non membre » à « non ». Si le stockage est absent ou illisible, la page indique que le compteur est indisponible au lieu d'inventer des chiffres. Vérifier ce point sur l'hébergement réel avec le répertoire privé configuré.

Le fichier source du compteur et de l'export est `storage_dir/family-day-2026.csv`, hors de la racine publique. Il est créé à la première inscription ; il n'existe pas encore dans l'environnement local de préparation.

Pour composer les équipes le jour du tournoi, ouvrir `tirage-equipes.html` et importer le CSV exporté. Cet outil traite le fichier dans le navigateur, sans envoyer les données au serveur. Il ne retient que les inscriptions au flag et affiche uniquement les noms et les trois réponses utiles au tirage. Marquer les présents, corriger les réponses si nécessaire, puis choisir le nombre d'équipes. Un même participant peut satisfaire plusieurs minima : femme, moins de 18 ans et personne ne jouant pas aux Bears. Le tirage vise cinq personnes par équipe et signale les minima manquants ou les tailles différentes. Un nouveau clic produit un autre tirage ; télécharger le CSV du résultat retenu. Les organisateurs valident la composition avant le jeu.

## Maintenance Rapide

- Reactiver la banniere : retirer `hidden` du bloc `.site-notice` dans `index.html`.
- Modifier le widget feedback : changer les attributs `data-*` du script ChangeThis dans le `<head>`.
- Modifier le contact : ajuster le HTML du formulaire, `scripts/bears.js`, puis verifier `contact.php` si les champs serveur changent.
- Mettre a jour l'indexation : modifier `robots.txt` ou `sitemap.xml`, puis deployer.
