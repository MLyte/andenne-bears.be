# Espace membres : mise en service

Le formulaire joueur est dans `membres.php` ; l'interface des coachs est dans
`membres-staff.php`. La première fonctionnalité est le depth chart de l’équipe
Seniors tackle (pas U20). Les réponses
se saisissent dans une fenêtre modale ouverte depuis la tuile du fil d'actualités.
La journée du 25 octobre et le camp de Blégny figurent dans ce même fil. Les réponses
et les photos sont enregistrées dans le `storage_dir` privé déjà défini dans
`config/family-day-config.php` : `members-depth-chart.json` et `member-photos/`.
Ces fichiers ne doivent jamais être copiés dans `www/` ni dans `dist/`.

## CAPTCHA

Créer un widget Cloudflare Turnstile **Managed** pour `andenne-bears.be` et
`www.andenne-bears.be`. Copier `config/members-config.example.php` vers
`config/members-config.php` sur l'installation, puis renseigner la clé publique
et la clé secrète. Le fichier réel est ignoré par Git et inclus dans `dist/`
uniquement s'il existe localement au moment du build. Ne pas publier la clé
secrète dans le code ou dans un ticket.

Le formulaire affiche un état indisponible tant que les deux clés ne sont pas
configurées. Le serveur rejette toute soumission sans vérification Turnstile
réussie. Le CAPTCHA ne prouve pas l'identité d'un joueur : le staff valide
chaque réponse avant de la placer dans une composition.

## Compositions

Le staff se connecte avec l'identifiant `coach` et le mot de passe organisateur
défini dans `config/family-day-config.php`. L'identifiant organisateur reste réservé
aux autres pages d'administration. Les réponses commencent dans l'état
« À vérifier ». Une fois validées, elles apparaissent dans la sideline des
différentes unités. Chaque poste dispose d'une place starter et backup. Un
profil peut être corrigé depuis « Modifier » : nom, numéro, souhaits de postes,
préférence et message aux coachs. Le consentement de publication reste inchangé.
« Écarter la réponse » retire l'inscription et sa photo du stockage actif.
Les copies datées peuvent encore les contenir pendant leur durée de conservation.
Un joueur peut être affecté à plusieurs unités, mais une seule fois par unité.
Un déplacement sur une place occupée échange les joueurs lorsque le joueur
déplacé venait d'une autre place ; depuis la sideline, le joueur remplacé
retourne en sideline. Déposer un joueur du terrain sur une carte sideline
échange également leurs places. Le dernier déplacement peut être annulé tant qu'aucune
autre modification n'a été effectuée.

À l'envoi, le serveur réduit la photo à 512 px maximum sur son plus grand côté,
la convertit en WebP (250 Ko maximum) et ne conserve pas le fichier d'origine.
Les photos enregistrées avant cette optimisation restent dans leur ancien format.
La photo enregistrée est servie au staff pendant
une session valide et, sur la liste de `membres.php`, uniquement pour un profil
validé dont le joueur a accepté la publication. Les réponses enregistrées avant
l'ajout de ce choix restent privées. Un joueur peut envoyer ses souhaits sans
apparaître dans la liste. Supprimer une réponse supprime aussi la photo et les
affectations correspondantes. Le depth chart n'est pas publié aux joueurs.
