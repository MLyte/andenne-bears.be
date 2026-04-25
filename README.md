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

## Fichiers principaux

- `index.html` : page actuelle du site.
- `bears.css` : styles actuels.
- `images/` : logo, favicon et fond.
- `fonts/` : polices utilisees par le site actuel.
- `refonte-contenu-andenne-bears.md` : audit de contenu et refonte.
- `designer-ux-architecture.md` : proposition UX.
- `designer-ui-direction-visuelle.md` : proposition UI.
- `brief-binome-web-designers.md` : synthese pour le binome de designers.

## Deployer sur OVH en FTP/FTPS

Le script `scripts/deploy-ovh.ps1` envoie uniquement les fichiers publics :

- `index.html`
- `bears.css`
- `fonts/`
- `images/`

Configurer les variables locales PowerShell :

```powershell
$env:OVH_FTP_HOST = "ftp.clusterXXX.hosting.ovh.net"
$env:OVH_FTP_USER = "ton-login-ovh"
$env:OVH_FTP_PASSWORD = "ton-mot-de-passe"
$env:OVH_FTP_PATH = "www"
```

Verifier sans envoyer :

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-ovh.ps1 -DryRun
```

Envoyer sur OVH :

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy-ovh.ps1
```

Par defaut, le script force FTPS via `--ssl-reqd`. Si l'hebergement n'accepte
que le FTP simple, ajouter `-PlainFtp`.
