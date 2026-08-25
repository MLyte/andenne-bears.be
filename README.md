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
  `index.html`, `bears.css`, `contact.php`, `changethis.php`, `config/contact-config.php`,
  `fonts/`, `images/`, `scripts/` et, si present, `config/changethis-config.php`.
- Bash envoie `.ovhconfig`, `index.html`, `bears.css`, `contact.php`,
  `config/contact-config.php`, `fonts/`, `images/` et `scripts/`.

Options utiles :

- `-ChangedOnly` / `--changed-only` : envoyer uniquement les fichiers modifies.
- `-ForceAll` / `--force-all` : forcer un upload complet.
- `-SkipChangeThisSync` : PowerShell uniquement, evite la synchronisation du bundle ChangeThis local.
- `--debug` : bash uniquement, logs FTP/FTPS detailles.

Le mode changed-only s'appuie sur le manifeste distant :

```text
/www/.deploy-manifest-sha256.txt
```

## Maintenance Rapide

- Reactiver la banniere : retirer `hidden` du bloc `.site-notice` dans `index.html`.
- Modifier le widget feedback : changer les attributs `data-*` du script ChangeThis dans le `<head>`.
- Modifier le contact : ajuster le HTML du formulaire, `scripts/bears.js`, puis verifier `contact.php` si les champs serveur changent.
- Mettre a jour l'indexation : modifier `robots.txt` ou `sitemap.xml`, puis deployer.
