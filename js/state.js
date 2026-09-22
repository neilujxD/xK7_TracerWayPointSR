// Application Global State
let currentMode = 'edit'; // 'edit' or 'play'

let autoCenter = true;

let isMapReady = false; // Guard preventing state overwrite before image load

let availableMaps = [];   // noms de fichiers trouvés dans MAPS_DIR

let scanMethod = '';

let availableRoutes = [];

let routesScanMethod = '';


// Saved Routes Library
let routePresets = {
    "Itinéraire Principal": []
};

let currentRouteName = "Itinéraire Principal";

let steps = [];

let currentStepIndex = -1;



    // Lien direct vers un itinéraire partagé : ...index.html?route=mon_itineraire.json



function loadStateFromLocalStorage() {
    try {
        // Load Settings
        const savedSettings = localStorage.getItem('route_planner_settings');
        if (savedSettings) {
            settings = { ...settings, ...JSON.parse(savedSettings) };
        }
        // Nettoyage des anciennes versions (liste de cartes figée, "Image locale: ...")
        delete settings.mapPresets;
        if (!Array.isArray(settings.hiddenMarkerLayers)) settings.hiddenMarkerLayers = [];
        if (typeof settings.mapImagePath !== 'string' || !settings.mapImagePath.startsWith(MAPS_DIR)) {
            settings.mapImagePath = '';
        }
        localStorage.removeItem('route_planner_custom_image');

        // Load Presets
        const savedPresets = localStorage.getItem('route_planner_presets');
        if (savedPresets) {
            routePresets = JSON.parse(savedPresets);
        }

        // Load Active Route Name
        const savedActiveRoute = localStorage.getItem('route_planner_active_route');
        if (savedActiveRoute && routePresets[savedActiveRoute]) {
            currentRouteName = savedActiveRoute;
        } else {
            currentRouteName = Object.keys(routePresets)[0] || "Itinéraire Principal";
        }

        steps = routePresets[currentRouteName] || [];

        // Load Active Step Index
        const savedIndex = localStorage.getItem('route_planner_step_index');
        if (savedIndex !== null) {
            currentStepIndex = parseInt(savedIndex, 10);
        } else {
            currentStepIndex = steps.length > 0 ? 0 : -1;
        }

    } catch (e) {
        console.warn("Impossible de charger l'état local", e);
    }
}


function saveStateToLocalStorage() {
    try {
        // Sync current active steps to active route preset
        routePresets[currentRouteName] = steps;

        localStorage.setItem('route_planner_settings', JSON.stringify(settings));
        localStorage.setItem('route_planner_presets', JSON.stringify(routePresets));
        localStorage.setItem('route_planner_active_route', currentRouteName);
        localStorage.setItem('route_planner_step_index', currentStepIndex.toString());

        if (isMapReady && map) {
            const center = map.getCenter();
            const zoom = map.getZoom();
            if (center && !isNaN(center.lat) && !isNaN(center.lng) && !isNaN(zoom)) {
                localStorage.setItem('route_planner_map_center', JSON.stringify([center.lat, center.lng]));
                localStorage.setItem('route_planner_map_zoom', zoom.toString());
            }
        }
    } catch (e) {
        console.warn("Erreur lors de la sauvegarde dans localStorage", e);
    }
}
