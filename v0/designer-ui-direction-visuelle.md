# Direction visuelle et UI - Andenne Bears

Role : Designer 2 - direction visuelle et UI  
Contexte : refonte du site vitrine des Andenne Bears, club de football americain et flag football a Andenne.

## 1. Intention visuelle generale

Le site doit donner une impression immediate de club sportif local, solide, accessible et fier de son terrain. L'identite visuelle doit etre energique sans devenir agressive : on doit sentir le contact, l'effort, l'equipe et la famille de club, tout en restant clair pour un parent, un debutant ou un partenaire local.

Direction recommandee :

- Une premiere impression portee par une vraie photo d'equipe, d'entrainement ou d'action.
- Le logo Bears comme repere central, mais pas comme unique contenu visuel.
- Une interface sombre et contrastree, avec des touches jaunes/or pour l'action.
- Des blocs lisibles, simples a maintenir et faciles a scanner sur mobile.
- Une ambiance sportive amateur assumee : intense, locale, humaine, pas trop corporate.

Mots-cles visuels : terrain, engagement, equipe, chaleur humaine, discipline, ancrage andennais, sport accessible.

## 2. Palette recommandee

La palette doit partir des couleurs deja associees au club : noir, blanc, jaune/or et tonalites chaudes du logo. Elle doit permettre de construire une interface lisible, pas seulement decorative.

### Couleurs principales

- Noir Bears : `#080808`
  - Usage : fond principal, navigation, footer, overlays sur photo.
  - Role : ancrer l'identite, donner une presence sportive forte.

- Anthracite terrain : `#171717`
  - Usage : fonds secondaires, cards, sections alternes.
  - Role : eviter un site entierement noir, garder du relief.

- Blanc chaud : `#F7F4EC`
  - Usage : textes principaux sur fond sombre.
  - Role : meilleur confort qu'un blanc pur.

- Or Bears : `#F2CB2A`
  - Usage : CTA principal, liens importants, badges, highlights.
  - Role : couleur d'action et de reconnaissance club.

### Couleurs d'appui

- Or fonce : `#B88919`
  - Usage : hover, bordures actives, details graphiques.

- Rouge brun logo : `#7A2418`
  - Usage : accent rare, alertes non critiques, details identitaires.
  - A utiliser avec retenue pour ne pas alourdir l'interface.

- Gris ligne : `#D8D2C3`
  - Usage : bordures sur fond clair, textes secondaires, pictogrammes.

- Vert validation : `#2E7D4F`
  - Usage : messages de confirmation de formulaire.

### Repartition recommandee

- 55 % fonds sombres : noir et anthracite.
- 25 % contenus clairs : textes, zones pratiques, formulaires.
- 15 % or : actions, appels importants, marqueurs.
- 5 % rouge brun ou accents secondaires.

Regle importante : l'or doit signaler l'action. Eviter de l'utiliser partout, sinon les boutons et informations critiques perdent leur force.

## 3. Typographies et ambiance

Le site actuel utilise deja `BertholdCityBold` et `BertholdCityMedium`. Ces polices peuvent devenir une signature si elles sont reservees aux titres et aux elements de marque.

### Recommandation typo

- Titres principaux : `BertholdCityBold`, puis fallback `Impact`, `Arial Black`, sans-serif.
- Sous-titres et accroches : `BertholdCityMedium`, puis fallback systeme.
- Texte courant : `Inter`, `Roboto`, `Arial` ou police systeme sans-serif.
- Chiffres, horaires, tarifs : police systeme en graisse 600 pour la lisibilite.

### Usage

- H1 : massif, court, tres lisible, jamais sur plus de deux lignes sur mobile.
- H2 : clair et direct, pas trop decoratif.
- Texte courant : taille confortable, interligne genereux, phrases courtes.
- CTA : texte court, verbe d'action, graisse 700.

Ambiance typographique : sportive, nette, directe. Eviter les effets trop "affiche de combat" qui pourraient intimider les debutants ou les parents.

## 4. Style photo et video recommande

Le site doit utiliser des images reelles du club des que possible. Elles seront plus fortes que des visuels generiques de football americain.

### Photos prioritaires

- Photo hero : equipe en tenue, huddle, entree terrain ou action lisible.
- Recrutement : entrainement avec coachs, joueurs debutants, explication technique.
- Flag football : action sans contact, jeunes, mixite, mouvement.
- Club : groupe, benevoles, staff, moments apres match.
- Partenaires : maillots, banniere terrain, evenement local.

### Traitement visuel

- Recadrages horizontaux forts pour desktop, avec sujet principal a gauche ou centre.
- Recadrages verticaux prevus pour mobile.
- Overlay sombre entre 45 % et 65 % sur les photos avec texte.
- Contraste legerement pousse, noirs profonds, couleurs chaudes preservees.
- Pas de flou excessif ni de photo trop sombre : le visiteur doit reconnaitre le club.

### Video

- Une courte boucle video peut fonctionner dans le hero si elle reste legere.
- Montrer : preparation, course, passes, plaquage encadre, flag arrache, celebration d'equipe.
- Prevoir une image fixe de fallback.
- Pas de son automatique.

## 5. Composants UI

### Boutons

Bouton primaire :

- Fond : `#F2CB2A`
- Texte : `#080808`
- Style : rectangle legerement arrondi, rayon 6 px maximum.
- Libelles recommandes : `Venir essayer`, `Demander un essai`, `Contacter le club`.
- Hover : or fonce ou leger assombrissement, sans animation excessive.

Bouton secondaire :

- Fond transparent.
- Bordure : blanc chaud ou or.
- Texte : blanc chaud sur fond sombre, noir sur fond clair.
- Usage : `Suivre le club`, `Voir les horaires`, `Devenir partenaire`.

Bouton discret :

- Texte seul avec fleche ou icone.
- Usage : liens vers Facebook, Instagram, details d'une section.

### Cards

Les cards doivent rester utilitaires, pas decoratives.

- Rayon : 6 a 8 px.
- Fond sombre : `#171717`, bordure subtile `rgba(247,244,236,0.14)`.
- Fond clair : `#F7F4EC`, texte noir, bordure `#D8D2C3`.
- Toujours inclure un titre court, une information utile et une action ou un detail concret.
- Pour les disciplines, utiliser un visuel ou pictogramme simple : casque, flag, calendrier, localisation.

Types de cards :

- Discipline : Tackle, Flag football, Jeunes.
- Info pratique : age, horaire, lieu, materiel.
- Evenement : date, type, lieu, action.
- Partenaire : logo, type de soutien, lien.

### Formulaires

Le formulaire doit etre court et rassurant.

Champs recommandes :

- Nom et prenom.
- Age.
- Commune.
- Discipline souhaitee : football americain, flag football, je ne sais pas encore.
- E-mail ou telephone.
- Message libre.

Style :

- Labels visibles, jamais uniquement des placeholders.
- Champs larges, hauteur minimum 44 px.
- Focus visible en or.
- Message d'erreur simple sous le champ.
- Bouton final : `Envoyer ma demande`.

### Navigation

Navigation desktop :

- Logo a gauche.
- Liens courts : Accueil, Rejoindre, Equipes, Calendrier, Partenaires, Contact.
- CTA `Venir essayer` a droite.
- Fond noir semi-opaque si superpose au hero, noir plein apres scroll.

Navigation mobile :

- Logo + bouton menu.
- Menu plein ecran ou panneau lateral simple.
- CTA `Venir essayer` toujours visible dans le menu.
- Zones tactiles minimum 44 px.

### Sections

Structure visuelle recommandee :

- Hero plein ecran partiel, pas trop long : laisser apparaitre le debut de la section suivante.
- Sections alternees sombre / clair pour rythmer la lecture.
- Les informations pratiques doivent etre tres scannables.
- Les CTA de recrutement doivent revenir 2 ou 3 fois, mais sous des formes differentes.

### Badges

Badges utiles :

- `Depuis 2002`
- `Debutants bienvenus`
- `Flag des 8 ans`
- `Tackle des 14 ans`
- `A confirmer`
- `Lieu temporaire`

Style :

- Fond or tres leger sur fond clair, texte noir.
- Fond transparent avec bordure or sur fond sombre.
- Texte court, taille lisible, pas en majuscules partout.

## 6. Mobile et accessibilite

### Mobile

Le mobile doit etre traite comme l'usage principal. Beaucoup de visiteurs viendront depuis Facebook, Instagram ou une recherche rapide.

Priorites :

- H1 lisible sans debordement.
- CTA visible dans le premier ecran.
- Horaires, lieux et contact accessibles en moins de deux scrolls depuis le hero.
- Cards en une colonne.
- Photos recadrees avec sujet visible, pas seulement une texture sombre.
- Boutons suffisamment grands pour le tactile.

### Accessibilite

- Contraste texte/fond conforme WCAG AA.
- Ne pas placer de texte sur photo sans overlay solide.
- Labels visibles sur tous les champs.
- Focus clavier visible sur liens, boutons et champs.
- Ne pas transmettre une information uniquement par la couleur.
- Prevoir des textes alternatifs utiles pour les photos : action, equipe, contexte.
- Eviter les animations rapides, tremblements ou effets agressifs.
- Respecter `prefers-reduced-motion`.

## 7. Hero propose

### Version recommandee

Image : photo reelle de l'equipe ou d'un huddle Bears, sombrement overlayee.  
Composition desktop : texte a gauche, logo en appui a droite ou en haut du bloc texte.  
Composition mobile : logo au-dessus du H1, photo recadree verticalement.

Contenu :

- Badge : `Football americain et flag football a Andenne`
- H1 : `Andenne Bears`
- Texte : `Depuis 2002, les Bears rassemblent joueurs, joueuses, coachs et benevoles autour d'un meme esprit : One team. One family. One heartbeat.`
- CTA primaire : `Venir essayer`
- CTA secondaire : `Contacter le club`

Elements visuels complementaires :

- Bandeau court sous le hero : `Debutants bienvenus`, `Flag football`, `Tackle`, `Province de Namur`.
- Une info pratique visible rapidement : prochain entrainement ou message `Horaires a confirmer par le club`.

## 8. Sections visuelles prioritaires

### 1. Rejoindre les Bears

Objectif : convertir les curieux.

UI :

- Section claire ou anthracite tres lisible.
- 3 blocs : `Tu peux debuter`, `Viens tester`, `On t'accompagne`.
- CTA : `Demander un essai`.

### 2. Nos disciplines

Objectif : expliquer simplement tackle et flag.

UI :

- Deux grandes cards avec photo ou pictogramme.
- Tackle : intensite, equipement, apprentissage progressif.
- Flag : sans contact, rapide, mixte, accessible aux jeunes.

### 3. Infos pratiques

Objectif : eviter que les visiteurs cherchent sur les reseaux.

UI :

- Tableau simple ou cards : age, horaires, lieu, materiel, cotisation.
- Marquer clairement les informations a confirmer.
- Variante mobile en liste compacte.

### 4. Vie du club

Objectif : montrer l'ambiance.

UI :

- Grille photo simple.
- Citation courte de joueur, parent ou coach.
- Mise en avant de la devise.

### 5. Partenaires

Objectif : ouvrir une porte commerciale locale.

UI :

- Section claire, plus calme.
- Logos partenaires sur fond blanc ou blanc chaud.
- CTA : `Devenir partenaire`.
- Texte oriente valeur locale, jeunesse, visibilite, sport amateur.

### 6. Contact

Objectif : finaliser l'action.

UI :

- Formulaire court + liens directs.
- E-mail tres visible : `comite@andenne-bears.be`.
- Icônes sociales pour Facebook et Instagram.
- Carte ou adresse seulement apres validation du club.

## 9. Notes de collaboration avec le designer UX

- Aligner le hero avec le parcours prioritaire defini par l'UX : le CTA principal doit rester `Venir essayer` ou son equivalent.
- L'UX doit confirmer l'ordre final des sections avant la maquette haute fidelite.
- Les composants UI doivent rester modulaires : une card `Info pratique` doit pouvoir servir aux horaires, lieux, tarifs et conditions d'essai.
- Prevoir un etat `information a confirmer` pour les horaires, lieux et cotisations, car les sources publiques divergent.
- Ne pas concevoir une experience dependante d'actualites frequentes : le site doit rester credible meme sans mise a jour hebdomadaire.
- Les maquettes doivent integrer tres tot les contraintes mobile : navigation, CTA, formulaire, recadrage photo.
- Le designer UX peut definir les contenus exacts ; la direction UI doit garantir que chaque section a une hierarchie visuelle claire.
- Les deux designers doivent se mettre d'accord sur les photos indispensables a demander au club avant design final.

## 10. Checklist UI avant developpement

- Palette validee avec le logo existant.
- Photo hero disponible en qualite suffisante.
- Version mobile du hero testee avec un vrai recadrage.
- Boutons primaire, secondaire et discret definis.
- Cards discipline, info pratique, evenement et partenaire definies.
- Formulaire court avec labels, erreurs et focus.
- Navigation mobile et desktop coherentes.
- Contrastes verifies sur fonds sombres et photos.
- Etats a confirmer prevus pour les donnees variables.
- CTA recrutement visible dans le hero, la section rejoindre et le contact.
