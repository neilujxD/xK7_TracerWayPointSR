# Route Map Navigator Pro

Application web statique de création et de lecture d'itinéraires sur cartes haute résolution.

## Architecture V2

La V2 conserve volontairement l'interface et l'identité visuelle existantes. Le code est organisé par responsabilités :

- `js/core.js` : modèle de données pur, validation et migration des itinéraires.
- `js/state.js` : état en mémoire de l'application.
- `js/storage.js` : lecture/écriture et nettoyage du `localStorage`.
- `js/scan.js` : découverte des cartes et itinéraires partagés.
- `js/map.js` : carte Leaflet et édition géométrique.
- `js/markers.js` : repères/POI.
- `js/render.js` : rendu de l'interface et des couches d'itinéraire.
- `js/routes.js` : import, export et gestion des itinéraires.
- `js/ui.js` / `js/nav.js` : interactions de l'interface et navigation.
- `js/main.js` : initialisation.

Les fichiers JSON V1 existants restent importables. Les nouveaux exports utilisent le schéma V2.

## Vérification locale

Node.js 20+ suffit, sans dépendance npm externe :

```bash
npm run verify
```

Cette commande vérifie la syntaxe des fichiers JavaScript et lance les tests du modèle d'itinéraire.

## Sécurité de la refonte

- `main` correspond à la version historique tant que la V2 n'est pas fusionnée.
- `stable-before-v2` est le point de restauration explicite avant refonte.
- `refactor/v2-cleanup` contient la V2 en cours de validation.

## Hébergement

L'application reste compatible avec un hébergement statique / GitHub Pages. Aucun backend n'est requis.
