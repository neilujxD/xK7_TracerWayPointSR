/*
 * Browser persistence layer.
 * Keeping localStorage access here prevents persistence details from leaking
 * into the route model and makes migrations/validation explicit.
 */
const STORAGE_KEYS = Object.freeze({
    settings: 'route_planner_settings',
    presets: 'route_planner_presets',
    activeRoute: 'route_planner_active_route',
    stepIndex: 'route_planner_step_index',
    mapCenter: 'route_planner_map_center',
    mapZoom: 'route_planner_map_zoom'
});

function readStoredJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
        console.warn(`Donnée locale invalide ignorée : ${key}`, error);
        return fallback;
    }
}

function normalizeStoredSettings(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const hidden = Array.isArray(value.hiddenMarkerLayers)
        ? [...new Set(value.hiddenMarkerLayers.filter(id => typeof id === 'string'))]
        : [];

    return {
        ...settings,
        mapImagePath: RouteCore.isSafeMapPath(value.mapImagePath, MAPS_DIR) ? value.mapImagePath : '',
        hiddenMarkerLayers: hidden,
        stickyQuestSide: Boolean(value.stickyQuestSide),
        maxPastSteps: RouteCore.clampInteger(value.maxPastSteps, 0, 10, settings.maxPastSteps),
        maxFutureSteps: RouteCore.clampInteger(value.maxFutureSteps, 0, 10, settings.maxFutureSteps),
        hideOutOfScope: Boolean(value.hideOutOfScope)
    };
}

function normalizeStoredPresets(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { 'Itinéraire Principal': [] };
    }

    const clean = {};
    Object.entries(raw).forEach(([name, routeSteps]) => {
        if (!Array.isArray(routeSteps)) return;
        try {
            const route = RouteCore.normalizeRouteData(routeSteps, {
                fallbackName: name,
                mapsDir: MAPS_DIR,
                settingsDefaults: settings
            });
            clean[String(name).slice(0, 80) || 'Itinéraire'] = route.steps;
        } catch (error) {
            console.warn(`Itinéraire local ignoré : ${name}`, error);
        }
    });

    return Object.keys(clean).length ? clean : { 'Itinéraire Principal': [] };
}

function loadStateFromLocalStorage() {
    settings = normalizeStoredSettings(readStoredJson(STORAGE_KEYS.settings, {}));

    // Nettoyage de clés utilisées par d'anciennes versions.
    localStorage.removeItem('route_planner_custom_image');

    routePresets = normalizeStoredPresets(readStoredJson(STORAGE_KEYS.presets, null));

    const wantedRoute = localStorage.getItem(STORAGE_KEYS.activeRoute);
    currentRouteName = wantedRoute && routePresets[wantedRoute]
        ? wantedRoute
        : Object.keys(routePresets)[0];

    steps = routePresets[currentRouteName] || [];

    const savedIndex = Number.parseInt(localStorage.getItem(STORAGE_KEYS.stepIndex), 10);
    if (!steps.length) {
        currentStepIndex = -1;
    } else if (Number.isFinite(savedIndex)) {
        currentStepIndex = Math.min(steps.length - 1, Math.max(0, savedIndex));
    } else {
        currentStepIndex = 0;
    }
}

function saveStateToLocalStorage() {
    try {
        routePresets[currentRouteName] = steps;

        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
        localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(routePresets));
        localStorage.setItem(STORAGE_KEYS.activeRoute, currentRouteName);
        localStorage.setItem(STORAGE_KEYS.stepIndex, String(currentStepIndex));

        if (isMapReady && map) {
            const center = map.getCenter();
            const zoom = map.getZoom();
            if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng) && Number.isFinite(zoom)) {
                localStorage.setItem(STORAGE_KEYS.mapCenter, JSON.stringify([center.lat, center.lng]));
                localStorage.setItem(STORAGE_KEYS.mapZoom, String(zoom));
            }
        }
    } catch (error) {
        console.warn('Erreur lors de la sauvegarde dans localStorage', error);
    }
}
