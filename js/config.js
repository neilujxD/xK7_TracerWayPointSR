
// Settings State
let settings = {
    mapImagePath: '',    // ex: 'images/maps/ma_carte.png' (chemin relatif)
    hiddenMarkerLayers: [],   // ids des calques de repères masqués
    stickyQuestSide: false,   // "Secondaire" reste coché pour les prochaines étapes tant qu'on ne le décoche pas
    maxPastSteps: 3,     // T-x
    maxFutureSteps: 3,   // T+x
    hideOutOfScope: false
};


// Dossier des cartes (chemin relatif : le projet peut être déplacé n'importe où)
const MAPS_DIR = 'images/maps/';

const MAP_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i;


// Itinéraires partagés (fichiers .json déposés dans le dossier routes/ du dépôt)
const ROUTES_DIR = 'routes/';

const ROUTE_EXT = /\.json$/i;


// ----- Repères (plumes, téléporteurs, donjons...) : fichier markers/<nom_de_la_carte>.json -----
// Format : { "layers": [ { "id":"plumes", "label":"Plumes", "color":"#ef4444",
//            "points": [ [x, y], [x, y, "Nom facultatif"], ... ] } ] }
// x et y sont des proportions de la taille de l'image (0 à 1, origine en haut à gauche).
const MARKERS_DIR = 'markers/';


// Échappe le texte saisi par l'utilisateur avant de l'insérer dans du HTML
function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


// ----- Code couleur des quêtes -----
const QUEST_COLORS = {
    main: '#F5C400',   // quête principale (jaune)
    side: '#12C8A6',   // quête secondaire (turquoise)
    none: '#94a3b8'    // aucune quête indiquée (gris neutre)
};

// Couleur (et trait) d'une étape selon ses cases "quête principale" / "quête secondaire"
function questColorOf(step) {
    const m = !!(step && step.questMain), s = !!(step && step.questSide);
    if (m && s) return 'both';
    if (m) return 'main';
    if (s) return 'side';
    return 'none';
}

// Couleur de téléportation (violet, comme le calque "Téléporteurs")
const TP_COLOR = '#a855f7';

// Combien d'étapes avant/après l'étape courante sont réellement dessinées sur la carte.
// Au-delà, une étape est de toute façon quasi invisible (opacité ~5%) : ne pas la dessiner
// du tout évite de reconstruire des centaines de segments à chaque déplacement.
const RENDER_WINDOW = 30;
function inRenderWindow(index) {
    if (currentStepIndex < 0) return true;
    const span = Math.max(RENDER_WINDOW, settings.maxPastSteps || 0, settings.maxFutureSteps || 0);
    return Math.abs(index - currentStepIndex) <= span;
}

// Les poignées de courbe et les cibles de clic "insérer une étape ici" sont coûteuses
// (deux objets Leaflet de plus par segment) et rarement utiles à modifier loin de l'étape
// courante : on ne les affiche que tout près, même quand le tracé, lui, reste visible plus loin.
const EDIT_TOOLS_WINDOW = 8;
function inEditToolsWindow(index) {
    if (currentStepIndex < 0) return true;
    return Math.abs(index - currentStepIndex) <= EDIT_TOOLS_WINDOW;
}


// ----- Petits pictogrammes (badges de type de point, cohérents avec les calques de repères) -----
// Chaque icône est un fragment SVG recentré sur (0,0), à insérer dans un <g transform="...">.
const POI_ICONS = {
    plumes: '<path d="M-5 5 C-5 -1 0 -6 5 -6 C5 -1 1 4 -5 5 Z" fill="#fff"/><path d="M-5 5 L2 -2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
    donjons: '<path d="M-5 -5 L4 4 M5 -5 L-4 4 M0.5 4.5 L4.5 0.5 M-4.5 0.5 L-0.5 4.5" stroke="#1f1f1f" stroke-width="1.9" fill="none" stroke-linecap="round"/>',
    forteresses: '<path d="M-5 -5 L4 4 M5 -5 L-4 4 M0.5 4.5 L4.5 0.5 M-4.5 0.5 L-0.5 4.5" stroke="#1f1f1f" stroke-width="1.9" fill="none" stroke-linecap="round"/>',
    teleporteurs: '<polygon points="1.5,-6.5 -4,1 -0.5,1 -1.5,6.5 4,-1.5 0.5,-1.5" fill="#fff"/>'
};

// Distance maximale (en pixels-carte) pour considérer qu'une étape est posée "sur" un repère
const BADGE_SNAP_PX = 5;

// À partir de quel zoom les repères (plumes, TP...) affichent leur pictogramme plutôt qu'un simple point
let poiIconZoomThreshold = 2;


// Encode chaque segment du chemin (espaces, accents, #, ? ...) en gardant les "/"
function toUrl(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}
