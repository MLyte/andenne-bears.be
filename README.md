# Andenne Bears

Depot du site public des Andenne Bears.

Le site est volontairement simple : une page HTML statique, une feuille CSS,
un script JavaScript cote navigateur, et deux endpoints PHP pour les formulaires
ou integrations serveur.

## Lancer en local

Il n'y a pas de build, pas de framework et pas de dependances a installer.

Pour une verification rapide, ouvrir directement :

```text
index.html
```

Pour tester avec un petit serveur local :

```powershell
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000/
```

Le formulaire de contact et les endpoints PHP ne fonctionneront completement que
sur un serveur avec PHP actif.

## Structure

- `index.html` : page principale du site.
- `bears.css` : styles du site.
- `scripts/bears.js` : interactions front, formulaire de contact, navigation et panneau de contact.
- `contact.php` : endpoint du formulaire de contact.
- `changethis.php` : endpoint PHP historique pour le flux ChangeThis self-hosted / GitHub issues.
- `config/*.example.php` : exemples de configuration locale.
- `images/` : photos, logo, favicon et visuels sociaux.
- `fonts/` : polices embarquees.
- `docs/` : contenus de support, dont les posts de lancement.
- `v0/` : ancienne version conservee comme reference.

Les documents `refonte-contenu-andenne-bears.md`,
`designer-ux-architecture.md`, `designer-ui-direction-visuelle.md` et
`brief-binome-web-designers.md` documentent les choix de refonte.

## Configuration PHP

Les fichiers de configuration reels ne sont pas fournis par les exemples.

Pour le formulaire de contact :

```text
config/contact-config.php
```

Voir `config/contact-config.example.php`.

Pour l'ancien endpoint ChangeThis local :

```text
config/changethis-config.php
```

Voir `config/changethis-config.example.php`.

## ChangeThis

L'integration active du site charge le widget heberge directement dans le
`<head>` de `index.html` :

```html
<script src="https://app.changethis.dev/widget.js" data-project="ct_146aeb29a18049799d9d9cd474dbceab" data-locale="fr" data-position="bottom-right" data-button-variant="subtle" data-reporter-fields="optional"></script>
```

Les anciens fichiers locaux `scripts/changethis-widget.js`,
`scripts/changethis-init.js` et `scripts/vendor/changethis-widget.global.js`
sont conserves pour le flux self-hosted et la synchronisation depuis le projet
ChangeThis, mais ils ne sont plus charges par `index.html`.

## Bannieres temporaires

La banniere `Nouveau site` existe encore dans `index.html`, mais elle est
actuellement masquee avec l'attribut `hidden`. Pour la reactiver, retirer
simplement cet attribut sur le bloc `.site-notice`.

## Deployer sur OVH

Deux scripts sont disponibles :

- `scripts/deploy-ovh.ps1` pour Windows / PowerShell.
- `scripts/deploy-ovh.sh` pour Linux/macOS avec `curl`.

Avant un envoi reel, lancer toujours un dry-run.

PowerShell :

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-ovh.ps1 -DryRun
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-ovh.ps1 -Ssl
```

Bash :

```bash
./scripts/deploy-ovh.sh --dry-run
./scripts/deploy-ovh.sh
```

Les identifiants peuvent etre fournis via variables d'environnement :

```bash
export OVH_FTP_HOST="ftp.clusterXXX.hosting.ovh.net"
export OVH_FTP_USER="ton-login-ovh"
export OVH_FTP_PASSWORD="ton-mot-de-passe"
export OVH_FTP_PATH="/www"
export OVH_FTP_PORT="21"
```

Ou via un fichier local `.ovh-ftp.netrc` non versionne :

```text
machine ftp.clusterXXX.hosting.ovh.net
login ton-login-ovh
password ton-mot-de-passe
```

Options utiles :

- `--changed-only` ou `-ChangedOnly` : uploader uniquement les fichiers modifies.
- `--force-all` : forcer un upload complet avec le script bash.
- `--debug` : activer les logs FTP/FTPS detailles avec le script bash.
- `-SkipChangeThisSync` : eviter la synchronisation du bundle ChangeThis local avec le script PowerShell.

Le mode changed-only utilise le manifeste distant :

```text
/www/.deploy-manifest-sha256.txt
```
