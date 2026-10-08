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
  `index.html`, `journee-familiale.html`, `export-inscriptions.html`, `bears.css`, `contact.php`, `family-day.php`, `suivi-inscriptions.php`,
  `changethis.php`, `config/contact-config.php`, `fonts/`, `images/`, `scripts/`
  et, si présent, `config/changethis-config.php`.
- Bash envoie `.ovhconfig`, `robots.txt`, `sitemap.xml`, `index.html`, `journee-familiale.html`, `export-inscriptions.html`, `bears.css`,
  `contact.php`, `family-day.php`, `suivi-inscriptions.php`, `config/contact-config.php`, `fonts/`, `images/`
  et `scripts/`. Les deux scripts excluent `config/family-day-config.php` pour conserver la configuration et le stockage privés d'OVH.

Options utiles :

- `-ChangedOnly` / `--changed-only` : envoyer uniquement les fichiers modifies.
- `-ForceAll` / `--force-all` : forcer un upload complet.
- `-SkipChangeThisSync` : PowerShell uniquement, evite la synchronisation du bundle ChangeThis local.
- `--debug` : bash uniquement, logs FTP/FTPS detailles.

Le mode changed-only s'appuie sur le manifeste distant :

```text
/www/.deploy-manifest-sha256.txt
```

## Camp de Blégny du 11 au 13 décembre 2026

`camp-blegny.html` est l’annonce et le formulaire pour les participants. L’ancien dossier de décision, avec les calculs, est conservé séparément dans `camp-blegny-comite.html` ; ne pas partager son adresse avec les joueurs. Les horaires de l’annonce sont prévisionnels. Le prix, le menu définitif et le repas du vendredi ne sont pas encore annoncés.

`camp-registration.php` écrit chaque inscription dans `camp-blegny-2026.csv` avec les colonnes `reference`, `date_utc`, `nom`, `prenom`, `categorie`, `exigence_alimentaire`, `allergies`, `autres` (séparateur `;`, UTF-8). Il réutilise uniquement le chemin privé `storage_dir` de `config/family-day-config.php` ; le fichier du camp reste distinct des inscriptions à la journée familiale. Ce répertoire doit exister, être accessible en écriture à PHP et se trouver hors du dossier public `/www`. Le CSV est créé au premier envoi et se récupère par SFTP, dans ce répertoire privé. La référence affichée après inscription permet de retrouver une ligne en cas de correction.

`suivi-camp-blegny.php` donne aux organisateurs une vue privée des inscriptions, des totaux Junior/Senior/Staff et des besoins signalés, avec téléchargement du CSV. L’identifiant est `orginasteur` et le mot de passe est vérifié avec le même `export_password_hash` que `suivi-inscriptions.php` ; aucun second mot de passe n’est stocké. La page exige HTTPS hors localhost, utilise une session limitée à huit heures, un jeton CSRF et la limitation des tentatives de connexion commune au suivi de la journée familiale. Elle reste en lecture seule : les corrections se font dans le CSV privé par une personne autorisée. Son lien figure dans le header de la page du camp.

Avant de partager la page, déployer `camp-blegny.html`, `scripts/camp-registration.js`, `camp-registration.php`, `suivi-camp-blegny.php` et `camp-dashboard.css`, puis vérifier une inscription réelle, la ligne CSV dans le stockage privé, la connexion organisateur et l’export. Prévoir la suppression du CSV et de ses sauvegardes après le camp, une fois les besoins d’organisation et de suivi terminés. Ne pas publier le CSV ni la page comité depuis la navigation publique.

## Journée familiale du 25 octobre 2026

La page `journee-familiale.html` affiche le formulaire et son bouton de confirmation. `family-day.php` accepte les envois lorsque la configuration privée contient `registration_open => true`. Les horaires affichés sont 9 h 00 pour le flag, 13 h 00 pour les burgers à l’effiloché de porc et 14 h 30 pour le match. Le burger coûte 5 € ; le premier est offert aux personnes venues aider comme bénévoles aux Wallos d’Andenne, après vérification par le club. Avant ouverture publique, vérifier le stockage privé, l’export, les modalités pour les mineurs et la couverture des non-licenciés sur l’hébergement réel.

Le formulaire inscrit une personne au tournoi de flag et permet de réserver de 1 à 50 burgers à l’effiloché de porc pour 13 h 00. Un formulaire par personne inscrite au flag ; une même réservation peut porter sur plusieurs burgers. La projection du match ne demande pas d'inscription. La question sur l’âge et l’autorisation parentale ne sont demandées que pour le tournoi. La colonne `match` du CSV reste présente pour conserver son format ; les nouvelles inscriptions y portent `non`. La colonne `repas` contient désormais le nombre de burgers (`0` sans réservation). Les anciennes lignes `oui` et `non` restent lisibles et correspondent respectivement à 1 et 0 burger. La colonne `benevole_wallos_declare` enregistre la déclaration liée au premier burger offert. La colonne `aide_organisation_declaree` enregistre une proposition distincte d’aide le 25 octobre, proposée uniquement aux personnes qui réservent des burgers sans jouer au flag. Le serveur refuse le cumul de cette aide avec une inscription au tournoi. Les anciens CSV de 11 ou 12 colonnes restent lisibles et sont migrés vers 13 colonnes au prochain enregistrement ou à la prochaine correction organisateur, sans effacer les demandes. Le suivi affiche au plus un premier burger potentiellement offert par demande déclarée, toujours sous réserve de vérification par le club ; le formulaire ne calcule aucun paiement ni réduction.

Les réservations de burgers sont acceptées jusqu’au 21 octobre 2026 inclus, selon l’heure de Bruxelles. Dès le 22 octobre à 00 h 00, le formulaire désactive l’option burgers et le serveur refuse toute nouvelle réservation de repas. L’inscription au tournoi de flag reste ouverte tant que `registration_open` est activé.

1. Créer `config/family-day-config.php` depuis `config/family-day-config.example.php` (fichier non versionné).
2. Créer un répertoire privé **hors de `/www`**, accessible en écriture à PHP, et le renseigner dans `storage_dir`. Le script refuse un chemin dans la racine publique.
3. Définir `export_username` et `export_password_hash` avec un mot de passe long et aléatoire. La commande de génération est dans le modèle de configuration. Ne pas partager ce mot de passe dans le dépôt.
4. Après décisions et essai sur l'hébergement réel, passer `registration_open` à `true`. Le bouton de confirmation est déjà actif dans `journee-familiale.html`. L'export CSV se télécharge en HTTPS depuis `export-inscriptions.html` avec l'identifiant et le mot de passe privés configurés ; les colonnes sont séparées par `;`.
5. Le responsable doit traiter les demandes de rectification/suppression et supprimer le fichier CSV du répertoire privé au plus tard le 30 novembre 2026. Vérifier aussi les éventuelles sauvegardes de l'hébergeur.

L'inscription ne crée pas d'e-mail de confirmation : la référence est affichée à l'écran après écriture du CSV. En cas d'échec de stockage, le formulaire signale une erreur et ne confirme pas l'inscription. Les tests sur PHP/OVH et la lecture de l'export doivent être faits avant ouverture publique.

La page non liée `suivi-inscriptions.php` permet aux organisateurs de consulter les demandes, les totaux et le CSV avec les mêmes identifiants que l'export. Ils peuvent corriger la date, le nom, le contact et les choix de participation, sans modifier la référence. Ils peuvent aussi supprimer une inscription en saisissant sa référence exacte dans le panneau « Modifier » ; la ligne disparaît du CSV, des totaux et du tirage des équipes. Une demande sans flag ni burger reste visible comme annulée, et les compteurs publics sont recalculés depuis le CSV. Une modification concurrente impose de recharger la page. La page exige HTTPS, limite les tentatives de connexion, expire la session après huit heures et interdit l'indexation et la mise en cache. Le CSV reste dans `storage_dir`, hors de la racine publique. Ne pas publier le fichier CSV directement dans `/www` ni partager l'accès organisateur dans les pages publiques.

Les compteurs sous le formulaire lisent le même CSV privé via `family-day.php?counts=1` et se rafraîchissent toutes les 30 secondes (ainsi qu'après une inscription réussie). Les cinq totaux du flag ne comptent que les personnes inscrites au tournoi. Le total public des burgers additionne les réservations de repas, même sans inscription au flag. Les anciennes valeurs `oui` et `non` valent 1 et 0. Aucun nom ni coordonnée ne sont publiés. Les groupes du flag se recoupent : « membre Bears » correspond à la réponse « joue déjà aux Andenne Bears (flag ou tackle) », et « non membre » à « non ». Si le stockage est absent ou illisible, la page indique que les compteurs sont indisponibles au lieu d'inventer des chiffres. Vérifier ce point sur l'hébergement réel avec le répertoire privé configuré.

Le fichier source du compteur et de l'export est `storage_dir/family-day-2026.csv`, hors de la racine publique. Il est créé à la première inscription ; il n'existe pas encore dans l'environnement local de préparation.

Pour préparer les équipes, l'organisateur se connecte à `suivi-inscriptions.php`, puis ouvre `tirage-equipes.html`. La page lit automatiquement les inscriptions au flag à travers la session organisateur ; `suivi-inscriptions.php?team_roster=1` ne renvoie que les références, les noms et les trois réponses utiles au tirage, sans coordonnées de contact, et refuse les demandes non authentifiées. Une rangée de cartes montre d'abord les joueurs non placés dans la simulation actuelle. Les équipes suggérées apparaissent ensuite, même incomplètes : la simulation utilise au maximum les cases admissibles, avec une femme, une personne de moins de 18 ans et une personne hors Bears représentées par trois joueurs différents, puis deux places libres. Une case de règle non couverte reste vide. Les indicateurs montrent le potentiel actuel selon les profils et les minima pour atteindre le prochain seuil d'équipes de cinq. Les organisateurs peuvent corriger localement les présences, ajouter une personne sur place, lier un enfant à un proche et échanger des joueurs entre équipes par glisser-déposer ou sélection de deux cases. Un échange qui sépare un lien familial ou fait perdre une règle couverte est refusé. Les corrections locales ne modifient pas les inscriptions enregistrées ; l'export du résultat porte `statut_equipe` (`conforme`, `provisoire` ou `en_attente`) et `proche_avec`. Les organisateurs valident la composition avant le jeu.

## Maintenance Rapide

- Reactiver la banniere : retirer `hidden` du bloc `.site-notice` dans `index.html`.
- Modifier le widget feedback : changer les attributs `data-*` du script ChangeThis dans le `<head>`.
- Modifier le contact : ajuster le HTML du formulaire, `scripts/bears.js`, puis verifier `contact.php` si les champs serveur changent.
- Mettre a jour l'indexation : modifier `robots.txt` ou `sitemap.xml`, puis deployer.
