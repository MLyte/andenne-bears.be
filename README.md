# Andenne Bears

Depot du site des Andenne Bears.

## Voir le site en local

L'etat actuel du site est une page HTML statique. Il n'y a pas encore de build,
de framework ou de dependances a installer.

Depuis ce dossier, ouvrir simplement :

```text
index.html
```

Sur Windows, on peut double-cliquer sur le fichier `index.html`.

Option avec un petit serveur local :

```powershell
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000/
```

## ChangeThis

Le site embarque le widget ChangeThis via :

- `scripts/changethis-widget.js`
- `scripts/changethis-init.js`

En local, `changethis-init.js` envoie les retours vers `http://localhost:3000/api/public/feedback`.
En production, il utilise `https://app.changethis.dev/api/public/feedback`.

Pour forcer un endpoint pendant un test, definir `window.CHANGETHIS_ENDPOINT`
avant le chargement de `scripts/changethis-init.js`.

## Fichiers principaux

- `index.html` : page actuelle du site.
- `bears.css` : styles actuels.
- `scripts/` : scripts du site, dont le widget ChangeThis.
- `images/` : logo, favicon et fond.
- `fonts/` : polices utilisees par le site actuel.
- `refonte-contenu-andenne-bears.md` : audit de contenu et refonte.
- `designer-ux-architecture.md` : proposition UX.
- `designer-ui-direction-visuelle.md` : proposition UI.
- `brief-binome-web-designers.md` : synthese pour le binome de designers.

## Deployer sur OVH en FTP/FTPS

Deux scripts sont disponibles :

- `scripts/deploy-ovh.ps1` (PowerShell, Windows)
- `scripts/deploy-ovh.sh` (bash + `curl`, Linux/macOS)

Les scripts envoient les fichiers publics suivants :

- `.ovhconfig`
- `index.html`
- `bears.css`
- `contact.php`
- `config/contact-config.php` (si present)
- `fonts/`
- `images/`
- `scripts/`

### Mode recommande (safe + sans saisie manuelle)

Creer un fichier local `.ovh-ftp.netrc` (non versionne) :

```text
machine ftp.clusterXXX.hosting.ovh.net
login ton-login-ovh
password ton-mot-de-passe
```

Puis proteger le fichier :

```bash
chmod 600 .ovh-ftp.netrc
```

Ensuite, il suffit de lancer :

```bash
./scripts/deploy-ovh.sh --dry-run
./scripts/deploy-ovh.sh
```

Le script utilisera automatiquement `.ovh-ftp.netrc` (ou `OVH_FTP_NETRC`) et refusera un fichier avec des permissions trop ouvertes.
Il affiche aussi une progression `[x/N]` pour chaque fichier (`UPLOAD` puis `DONE`).
Pour OVH, utiliser le port `21` (FTP ou FTPS explicite).
Les chemins distants sont encodes automatiquement (`%20`), donc les noms de fichiers avec espaces fonctionnent.

### Variables d'environnement (alternative)

```bash
export OVH_FTP_HOST="ftp.clusterXXX.hosting.ovh.net"
export OVH_FTP_USER="ton-login-ovh"
export OVH_FTP_PASSWORD="ton-mot-de-passe"
export OVH_FTP_PATH="/www"
export OVH_FTP_PORT="21"
```

### Linux/macOS (bash)

Envoyer en FTPS (par defaut) :

```bash
./scripts/deploy-ovh.sh
```

Basculer en FTP simple si necessaire :

```bash
./scripts/deploy-ovh.sh --ftp
```

Forcer explicitement le port OVH :

```bash
./scripts/deploy-ovh.sh --port 21
```

Si un transfert semble bloque, activer les logs FTP/FTPS detailles :

```bash
./scripts/deploy-ovh.sh --debug
```

Uploader uniquement les fichiers modifies (compare taille et date distante quand disponible) :

```bash
./scripts/deploy-ovh.sh --changed-only
```

Forcer l'upload complet (comportement historique) :

```bash
./scripts/deploy-ovh.sh --force-all
```

### Windows (PowerShell)

Verifier sans envoyer :

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-ovh.ps1 -DryRun
```

Envoyer en FTPS :

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-ovh.ps1 -Ssl
```

Si l'hebergement n'accepte que le FTP simple, ne pas ajouter `-Ssl`.
