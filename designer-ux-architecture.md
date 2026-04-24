# Designer 1 - UX, parcours et architecture

Projet : refonte du site Andenne Bears  
Role : UX, parcours utilisateurs et structure  
Date : 24 avril 2026

## 1. Objectifs UX prioritaires

Le site doit passer d'une carte de visite a un outil simple de recrutement, d'information et de contact pour un club sportif amateur.

Priorites UX :

1. Faire comprendre en moins de 5 secondes :
   - qui est le club : Andenne Bears ;
   - quels sports sont proposes : football americain tackle et flag football ;
   - ou se situe le club : Andenne / province de Namur ;
   - quelle action faire ensuite : venir essayer, contacter, suivre ou sponsoriser.
2. Rendre le parcours "Venir essayer" evident sur mobile comme sur desktop.
3. Rassurer les debutants et les parents avec des informations concretes : age, niveau requis, equipement, securite, encadrement, horaires, lieu.
4. Reduire la dependance aux reseaux sociaux pour les informations essentielles.
5. Donner une porte claire aux sponsors et partenaires locaux.
6. Prevoir une structure facile a maintenir par le comite, meme si les actualites ou le calendrier ne sont pas mis a jour chaque semaine.
7. Eviter toute publication d'information non confirmee sur les horaires, lieux, categories et cotisations.

## 2. Publics cibles et parcours utilisateurs

### Joueur debutant

Besoin principal : comprendre s'il peut commencer sans experience et comment essayer.

Questions naturelles :

- Est-ce ouvert aux debutants ?
- Quel sport choisir entre tackle et flag football ?
- A partir de quel age peut-on commencer ?
- Quand et ou venir ?
- Que faut-il apporter ?
- Qui contacter avant de venir ?

Parcours recommande :

1. Arrive sur l'accueil via Google, Instagram, Facebook ou bouche-a-oreille.
2. Voit immediatement le club, les disciplines et le bouton `Venir essayer`.
3. Consulte un bloc court `Debutant ? Tu es bienvenu`.
4. Selectionne `Football americain` ou `Flag football`.
5. Lit les infos pratiques : age, horaires, lieu, materiel.
6. Remplit un mini formulaire d'essai ou clique sur e-mail / reseau social.

CTA principal : `Venir essayer`  
CTA secondaire : `Voir les entrainements`

### Parent

Besoin principal : etre rassure sur le cadre, la securite, l'encadrement et l'organisation.

Questions naturelles :

- Mon enfant est-il assez age ?
- Le flag football est-il sans contact ?
- Qui encadre les jeunes ?
- Quels sont les horaires et le lieu exact ?
- Combien cela coute ?
- Peut-on venir observer avant d'inscrire ?

Parcours recommande :

1. Arrive sur l'accueil ou directement sur `Rejoindre`.
2. Identifie rapidement une section `Parents et jeunes`.
3. Lit une explication simple du flag football et des ages.
4. Consulte les horaires, le lieu, les cotisations si confirmees et le contact.
5. Utilise `Poser une question parent` ou `Demander un essai`.

CTA principal : `Demander un essai pour mon enfant`  
CTA secondaire : `Contacter le club`

### Sponsor ou partenaire

Besoin principal : comprendre pourquoi soutenir le club et comment prendre contact.

Questions naturelles :

- Quelle est la valeur locale du club ?
- Quels publics touche-t-il ?
- Quels types de partenariats sont possibles ?
- Qui contacter ?
- Existe-t-il un dossier sponsor ?

Parcours recommande :

1. Arrive via recommandation, recherche locale ou lien direct.
2. Clique sur `Partenaires` dans la navigation.
3. Comprend l'ancrage local : sport amateur, jeunesse, benevolat, communaute andennaise.
4. Voit des formats de soutien simples : maillot, evenement, materiel, logistique, visibilite digitale.
5. Contacte le comite ou demande un dossier.

CTA principal : `Devenir partenaire`  
CTA secondaire : `Demander le dossier sponsor`

### Supporter

Besoin principal : suivre le club, connaitre les matchs/evenements et trouver les reseaux.

Questions naturelles :

- Quand a lieu le prochain match ?
- Comment suivre l'actualite ?
- Ou voir les photos ou resultats ?
- Comment aider le club comme benevole ?

Parcours recommande :

1. Arrive sur l'accueil.
2. Consulte un bloc `Prochains rendez-vous`.
3. Accede au calendrier ou aux reseaux sociaux.
4. Trouve les infos de match, d'evenement ou de benevolat.

CTA principal : `Voir le calendrier`  
CTA secondaire : `Suivre sur Facebook / Instagram`

## 3. Arborescence recommandee

Navigation principale courte :

- `Accueil`
- `Rejoindre`
- `Equipes`
- `Calendrier`
- `Partenaires`
- `Contact`

Structure recommandee :

```text
Accueil
  Hero : Andenne Bears + proposition claire + CTA
  Pourquoi rejoindre les Bears
  Disciplines : football americain / flag football
  Infos pratiques resumees
  Prochains rendez-vous
  Partenaires en bref
  Contact rapide

Rejoindre
  Pour qui ?
  Debutants bienvenus
  Comment se passe un essai
  Ages et disciplines
  Materiel a apporter
  Cotisations, seulement si confirmees
  FAQ courte
  Formulaire d'essai

Equipes
  Football americain tackle
  Flag football
  Categories jeunes / seniors, a confirmer
  Staff ou contacts sportifs, si communicables

Calendrier
  Prochains entrainements publics
  Matchs
  Evenements club
  Etat vide utile : "Le calendrier arrive, suivez-nous aussi sur Facebook"

Partenaires
  Pourquoi soutenir les Bears
  Formules possibles
  Logos partenaires
  Contact sponsor

Contact
  E-mail
  Facebook
  Instagram
  Adresse officielle confirmee
  Horaires confirmes
  Carte, seulement apres validation du lieu
```

Option si le site doit rester tres simple au lancement :

- page unique avec ancres : `Accueil`, `Rejoindre`, `Equipes`, `Infos pratiques`, `Partenaires`, `Contact`.
- garder des URLs propres pour une future evolution : `/rejoindre`, `/partenaires`, `/contact`.

## 4. Wireframe textuel mobile

Mobile first, objectif : donner l'action sans forcer le visiteur a chercher.

```text
[Header sticky compact]
Logo Bears | Menu

[Hero]
Photo reelle equipe/action
H1 Andenne Bears
Football americain et flag football a Andenne
CTA principal : Venir essayer
CTA secondaire : Contacter le club

[Barre infos rapides]
Debutants bienvenus
Flag des 8 ans ? a confirmer
Tackle des 14 ans ? a confirmer
Andenne / lieu a confirmer

[Bloc alerte si necessaire]
Lieu ou horaires en cours de confirmation

[Section Rejoindre]
Titre : Viens tester un entrainement
3 etapes :
1. Tu nous contactes
2. On te confirme le bon entrainement
3. Tu viens essayer avec le staff
Bouton : Demander un essai

[Disciplines]
Carte : Flag football
Sans contact, accessible, mixte, jeunes/adultes selon categories confirmees
CTA : Voir les infos flag

Carte : Football americain
Tackle, equipe, progression, debutants acceptes
CTA : Voir les infos tackle

[Infos pratiques]
Horaires confirmes
Lieu confirme
Materiel premiere seance
Cotisation si confirmee

[Parents]
Encadrement, securite, progression, respect
CTA : Poser une question parent

[Prochains rendez-vous]
Liste courte de 2 a 3 evenements
Etat vide : Le calendrier sera publie prochainement
CTA : Voir le calendrier

[Partenaires]
Soutenir un club local et amateur
CTA : Devenir partenaire

[Contact]
E-mail
Facebook
Instagram
Mini formulaire ou lien mail

[Footer]
Nom ASBL
Liens sociaux
Mentions utiles
```

## 5. Wireframe textuel desktop

Desktop, objectif : lecture rapide, meilleure comparaison des disciplines, acces direct aux parcours.

```text
[Header horizontal sticky]
Logo | Accueil | Rejoindre | Equipes | Calendrier | Partenaires | Contact
CTA header : Venir essayer

[Hero full width]
Fond photo reelle du club
Colonne gauche :
  H1 Andenne Bears
  Football americain et flag football a Andenne
  Phrase identitaire courte
  CTA : Venir essayer
  CTA : Contacter le club
Colonne droite ou bas hero :
  Infos rapides : debutants, disciplines, ages a confirmer, lieu

[Bandeau de confiance]
Depuis 2002 | Club amateur | Mixte | Province de Namur | LFFA si confirme

[Section Parcours]
3 entrees :
  Je veux jouer
  Je suis parent
  Je veux sponsoriser

[Section Disciplines]
2 colonnes :
  Football americain tackle
  Flag football
Chaque colonne :
  pour qui
  age
  niveau
  horaires
  CTA

[Section Infos pratiques]
Tableau clair :
  Discipline
  Ages
  Horaires
  Lieu
  Cotisation
  Statut de validation

[Section Experience club]
Photos + citations courtes
Devise : One team. One family. One heartbeat.

[Section Calendrier]
Liste horizontale ou tableau simple
Matchs / entrainements publics / evenements

[Section Partenaires]
Argumentaire local
Logos
CTA : Devenir partenaire

[Section Contact]
Formulaire + coordonnees + carte si lieu confirme

[Footer complet]
Navigation secondaire
Reseaux
E-mail
Copyright
```

## 6. Composants fonctionnels necessaires

Composants prioritaires :

- Header responsive avec menu mobile et CTA `Venir essayer`.
- Hero avec photo reelle, titre, sous-titre et deux CTA.
- Barre d'infos rapides : discipline, age, lieu, debutants.
- Bandeau d'alerte pour informations temporaires : travaux, changement de terrain, horaires a confirmer.
- Cartes disciplines : tackle, flag football, jeunes/seniors si confirme.
- Bloc `Comment venir essayer` en 3 etapes.
- Tableau d'infos pratiques facile a mettre a jour.
- FAQ courte pour recrutement et parents.
- Liste calendrier avec etat vide.
- Bloc partenaires avec logos et CTA.
- Formulaire de contact / essai :
  - nom ;
  - age ;
  - commune ;
  - discipline souhaitee ;
  - experience ;
  - e-mail ;
  - telephone facultatif ;
  - message.
- Liens sociaux visibles mais secondaires par rapport aux actions principales.
- Footer avec coordonnees et liens essentiels.

Composants utiles en phase 2 :

- Filtre calendrier : entrainements, matchs, evenements.
- Module actualites simple, limite aux 3 dernieres nouvelles.
- Galerie photos selectionnee.
- Telechargement dossier sponsor.
- Schema de donnees locales pour SEO.

## 7. Contenus manquants a demander au club

Informations a obtenir avant design final ou mise en ligne :

- Adresse officielle du terrain actuel.
- Adresse du terrain habituel si differente.
- Confirmation d'un lieu temporaire eventuel a Evelette-Jallet / Ohey.
- Horaires actuels par discipline.
- Date ou periode de fin des travaux, si le terrain est en renovation.
- Categories actives : U13, U16, seniors, tackle, flag, autres.
- Ages minimums exacts.
- Conditions pour un premier essai.
- Materiel a apporter pour une premiere seance.
- Procedure d'inscription.
- Cotisations exactes et ce qu'elles incluent.
- Assurance et affiliation ligue : incluses ou non.
- Nom officiel a utiliser : `Andenne Bears`, `Namur Country Andenne Bears` ou autre.
- Statut LFFA et libelle officiel.
- Photos recentes en bonne qualite.
- Logos partenaires actuels.
- Contact public pour recrutement.
- Contact public pour parents.
- Contact public pour sponsors.
- Calendrier de saison ou prochains evenements.
- Mentions legales / donnees ASBL.

## 8. Recommandations de navigation et CTA

### Navigation

La navigation doit rester courte. Les visiteurs viennent surtout pour agir, pas pour explorer une grande arborescence.

Ordre recommande :

1. `Accueil`
2. `Rejoindre`
3. `Equipes`
4. `Calendrier`
5. `Partenaires`
6. `Contact`

Sur mobile :

- Header sticky compact.
- CTA `Venir essayer` visible avant l'ouverture du menu si possible.
- Menu avec liens grands, faciles a toucher.
- Contact et reseaux en bas du menu.

Sur desktop :

- Header sticky ou semi-sticky.
- CTA distinct dans le header.
- Eviter plus de 6 entrees principales.

### CTA

CTA principal global : `Venir essayer`

CTA secondaires selon contexte :

- `Contacter le club`
- `Voir les entrainements`
- `Poser une question parent`
- `Devenir partenaire`
- `Voir le calendrier`
- `Suivre le club`

Regles UX :

- Un seul CTA principal par section.
- Le bouton `Venir essayer` doit apparaitre dans le hero, la section rejoindre, les infos pratiques et le footer.
- Les CTA parents doivent etre rassurants, pas commerciaux.
- Les CTA sponsor doivent mener directement a un contact ou a un dossier.
- Les reseaux sociaux doivent soutenir l'actualite, mais ne pas remplacer les informations pratiques.

## 9. Risques UX lies aux informations contradictoires

Les sources publiques donnent des informations differentes sur les lieux, horaires, cotisations et noms officiels. C'est le principal risque UX de la refonte.

Risques identifies :

- Un joueur se rend au mauvais terrain.
- Un parent se base sur un horaire obsolete.
- Un visiteur confond le lieu habituel, le lieu temporaire et le siege administratif.
- Une cotisation affichee est incorrecte, ce qui cree de la frustration au moment de l'inscription.
- Des ages minimums non confirmes generent des demandes inutiles ou des refus mal vecus.
- Le club perd en credibilite si le site contredit la LFFA, la Ville d'Andenne ou les reseaux sociaux.

Recommandations :

- Ne publier les horaires, lieux et cotisations qu'apres validation explicite du comite.
- Ajouter un libelle visible `Mis a jour le ...` sur les infos pratiques.
- Separer clairement :
  - lieu d'entrainement actuel ;
  - lieu habituel ;
  - siege administratif ;
  - lieu temporaire en cas de travaux.
- Prevoir un bandeau `Info terrain` si un demenagement temporaire est en cours.
- Utiliser une formulation prudente tant que les donnees ne sont pas confirmees :
  - `Horaires a confirmer par le club`
  - `Contactez-nous avant votre premier entrainement`
  - `Lieu temporaire possible selon les travaux`
- Faire du formulaire d'essai le point de validation : le club confirme toujours le bon horaire et le bon lieu avant la venue.

## 10. Priorites de mise en oeuvre

Phase 1 : rendre le site utile

1. Accueil structure.
2. CTA `Venir essayer`.
3. Infos pratiques confirmees.
4. Contact clair.
5. Explication tackle / flag.

Phase 2 : rassurer et convertir

1. FAQ debutants et parents.
2. Formulaire d'essai.
3. Parcours sponsor.
4. Photos reelles.

Phase 3 : faire vivre le site

1. Calendrier.
2. Actualites legeres.
3. Galerie photos.
4. Dossier sponsor telechargeable.
