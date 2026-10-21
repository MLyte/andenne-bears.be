# Plan de stationnement — Évelette, 25 octobre 2026

## Consigne retenue

Le message et la capture transmis par l’organisateur indiquent trois lieux : le parking du terrain de football et ses abords, le parking de la Maison des Jeunes, et la place de convivialité près de l’école. Le message exclut explicitement la rue des Comognes. Une précision du comité ajoute explicitement le long de la rue du Tige, du côté du terrain. Les repères désignent ces lieux, sans tracer des limites d’autorisation de stationnement.

## Fond cartographique

- Extrait OpenStreetMap téléchargé le 21 octobre 2026 : <https://www.openstreetmap.org/api/0.6/map?bbox=5.161,50.409,5.175,50.418>.
- Source locale : `family-parking-osm.xml`. Seuls les coordonnées, identifiants de géométrie et attributs utilisés par le rendu sont conservés ; les métadonnées des contributeurs ont été retirées.
- Attribution : © contributeurs OpenStreetMap, données sous ODbL, <https://www.openstreetmap.org/copyright>.
- Le script projette les coordonnées dans un plan local à la latitude 50,414° ; les distances sont conservées avec une approximation inférieure à 0,5 % à cette échelle. Nord en haut, barre de 100 m. Les rues et bâtiments ne sont ni inventés ni déplacés.
- Une vue aérienne du service ArcGIS World Imagery a servi au contrôle des emplacements : <https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer>. Elle n’est pas incorporée dans le JPEG livré.

## Repères et recoupements

1. **Terrain de foot / parking et abords** : pointe à 50.41560, 5.16748, dans l’approche du bâtiment sportif, au nord-est du carrefour Saint-Donat / Tige. Terrain OSM `way/99579819`, bâtiment `way/175556645`. La pointe a été éloignée du carrefour pour éviter toute ambiguïté.
2. **Maison des Jeunes** : pointe à 50.41313, 5.17010. Bâtiment OSM `way/175465443`, parkings `way/334864055` et `way/334864056`. Adresse confirmée par la commune : rue du Tige, 26, <https://www.ohey.be/ateliers-organises-par-la-mjgo-maison-des-jeunes-2026-2027/>.
3. **Place de convivialité** : pointe indicative à 50.41140, 5.17354, à l’ouest de la rue du Baty et au nord de l’école, selon la croix de l’organisateur, recoupée avec la vue aérienne. L’existence du nouvel espace est confirmée par <https://www.ohey.be/inaugurations-evelette/>. Adresse de l’école voisine confirmée par <https://www.ohey.be/lecole-develette/> (rue du Baty, 47). Il ne s’agit pas d’un relevé des places de parking ou des limites de la place.
- **Rue des Comognes** : tracé OSM `way/99579828`, surligné en rouge avec une consigne écrite. La consigne est celle de l’organisateur, sans qualification juridique ajoutée.

## Reproduction et livraison

### Simulation de voitures, version 4

- Gabarit illustratif choisi : **4,5 × 1,9 m**, avec **1 m d’écart longitudinal**. Sept silhouettes servent d’exemple ; leur nombre n’est pas une capacité annoncée.
- Projection générale : 1,46 pixel par mètre, soit 6,57 × 2,774 pixels par voiture. Détail agrandi exactement 4 fois : 5,84 pixels par mètre, soit 26,28 × 11,096 pixels par voiture. Barre d’échelle indépendante de 10 m (58,4 pixels). Le fond du détail est recalculé à partir des mêmes géométries vectorielles.
- La file suit le tronçon OSM `way/238574046`, orienté du carrefour Saint-Donat vers le sud-est. Les centres sont placés à 18, 23,5, 29, 34,5, 40, 45,5 et 51 m le long de cet axe, puis décalés de 4,25 m vers le **nord-est, côté terrain**. La bande bleue est un repère graphique et non un marquage routier.
- Les largeurs des routes du fond sont **symboliques**. Le décalage latéral de 4,25 m est une hypothèse d’illustration : il ne mesure pas la largeur disponible ni celle de l’accotement. Les dimensions des voitures et des espacements, en revanche, sont calculées en mètres.
- Arrêts de bus recoupés dans l’API OSM le 21 octobre : `node/2463951146` (50.4148531, 5.1677161), `node/2463951144` (50.4144830, 5.1683217), et leurs positions sur chaussée `node/2463951183` et `node/2463951171`. La file illustrée reste sur la portion nord, à distance du carrefour, du débouché des Comognes et de ces repères. L’accès au bâtiment du terrain reste hors de la simulation.
- Aucun relevé de terrain des obstacles ou des panneaux n’est disponible. La page demande de préserver les accès, carrefours et arrêts de bus. Aucune simulation de places individuelles n’a été ajoutée aux parkings P2 et P3.

Exécuter `python design/family-parking-map.py` depuis le dépôt, avec Pillow et les polices Segoe UI de Windows. Le rendu est déterministe et fonctionne hors ligne avec l’extrait conservé.

Sortie : `images/family-day-parking-evelette-2026.jpg`, 1600 × 2000 pixels, JPEG progressif. La page `journee-familiale.html#stationnement` utilise la version `v=4`, expose les trois lieux en texte et propose le téléchargement du JPEG.
