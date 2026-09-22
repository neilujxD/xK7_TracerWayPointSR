
function openSettingsModal() {
    document.getElementById('setting-tx-range').value = settings.maxPastSteps;
    document.getElementById('setting-tx-val').innerText = `${settings.maxPastSteps} étapes`;
    document.getElementById('setting-tplus-range').value = settings.maxFutureSteps;
    document.getElementById('setting-tplus-val').innerText = `${settings.maxFutureSteps} étapes`;
    document.getElementById('setting-hide-out-of-scope').checked = settings.hideOutOfScope;

    const qFrom = document.getElementById('quest-range-from'), qTo = document.getElementById('quest-range-to');
    if (qFrom && qTo) { qFrom.max = steps.length; qTo.max = steps.length; qTo.value = steps.length || 1; }
    const mapSearch = document.getElementById('map-search-input');
    if (mapSearch) mapSearch.value = '';

    populateRouteSelector();
    populateMapPresets();
    populateSharedRoutes();
    populateMarkerLayers();
    document.getElementById('settings-modal').classList.remove('hidden');
}


// Transforme "BakronIsland.webp" en "Bakron Island" pour l'affichage
function friendlyMapName(fileName) {
    const base = fileName.replace(/\.[^.]+$/, '');
    return base.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
}


function populateMapPresets(filterText) {
    const selector = document.getElementById('map-preset-selector');
    const status = document.getElementById('map-scan-status');
    if (!selector) return;
    selector.innerHTML = '';

    if (!availableMaps.length) {
        const option = document.createElement('option');
        option.value = '';
        option.innerText = 'Aucune carte détectée';
        selector.appendChild(option);
        selector.disabled = true;
        status.innerText = location.protocol === 'file:'
            ? "Page ouverte en direct (file://) : le navigateur ne peut pas lister un dossier. Utilise un serveur local ou un fichier images/maps/maps.js."
            : "Aucune image trouvée dans images/maps/.";
        return;
    }

    const q = (filterText || '').trim().toLowerCase();
    const filtered = q ? availableMaps.filter(name => friendlyMapName(name).toLowerCase().includes(q)) : availableMaps;

    selector.disabled = false;
    if (!filtered.length) {
        const option = document.createElement('option');
        option.value = '';
        option.innerText = 'Aucun résultat pour cette recherche';
        selector.appendChild(option);
        selector.disabled = true;
        status.innerText = `${availableMaps.length} carte(s) au total, aucune ne correspond à « ${filterText} ».`;
        return;
    }
    filtered.forEach(name => {
        const option = document.createElement('option');
        option.value = MAPS_DIR + name;
        option.innerText = friendlyMapName(name);
        const selectedMap = appWorkspace === 'tactical'
            ? (tacticalStrategy.map || settings.mapImagePath)
            : settings.mapImagePath;
        if (option.value === selectedMap) option.selected = true;
        selector.appendChild(option);
    });
    status.innerText = q
        ? `${filtered.length} / ${availableMaps.length} carte(s) (${scanMethod})`
        : `${availableMaps.length} carte(s) détectée(s) (${scanMethod})`;
}


async function refreshMapList() {
    document.getElementById('map-scan-status').innerText = 'Analyse du dossier...';
    await scanMapsFolder();
    populateMapPresets();
}


function selectMapFromPreset(path) {
    if (!path) return;

    if (appWorkspace === 'tactical') {
        if (path === tacticalStrategy.map) return;
        tacticalStrategy.map = path;
        currentImageUrl = toUrl(path);
        localStorage.removeItem('route_planner_tactical_map_center');
        localStorage.removeItem('route_planner_tactical_map_zoom');
        saveTacticalState();
        initLeafletMap();
        return;
    }

    if (path === settings.mapImagePath) return;
    settings.mapImagePath = path;
    routeWorkspaceMapPath = path;
    currentImageUrl = toUrl(path);
    saveStateToLocalStorage();
    localStorage.removeItem('route_planner_map_center');
    localStorage.removeItem('route_planner_map_zoom');
    initLeafletMap();
}


function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}


function populateRouteSelector() {
    const selector = document.getElementById('route-selector');
    selector.innerHTML = '';
    Object.keys(routePresets).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.innerText = `${name} (${routePresets[name].length} étapes)`;
        if (name === currentRouteName) option.selected = true;
        selector.appendChild(option);
    });
}


function switchRoutePreset(name) {
    if (routePresets[name]) {
        routePresets[currentRouteName] = steps;
        currentRouteName = name;
        steps = routePresets[name] || [];
        currentStepIndex = steps.length > 0 ? 0 : -1;
        saveStateToLocalStorage();
        renderAll();
        populateRouteSelector();
    }
}


function createNewRoutePreset() {
    const name = prompt("Nom du nouvel itinéraire :", `Itinéraire ${Object.keys(routePresets).length + 1}`);
    if (name && name.trim()) {
        const trimmed = name.trim();
        routePresets[trimmed] = [];
        switchRoutePreset(trimmed);
    }
}


function renameCurrentRoutePreset() {
    const newName = prompt("Nouveau nom pour cet itinéraire :", currentRouteName);
    if (newName && newName.trim() && newName.trim() !== currentRouteName) {
        const trimmed = newName.trim();
        routePresets[trimmed] = steps;
        delete routePresets[currentRouteName];
        currentRouteName = trimmed;
        saveStateToLocalStorage();
        populateRouteSelector();
        renderAll();
    }
}


function deleteCurrentRoutePreset() {
    const keys = Object.keys(routePresets);
    if (keys.length <= 1) {
        alert("Vous devez conserver au moins un itinéraire.");
        return;
    }

    if (confirm(`Voulez-vous vraiment supprimer l'itinéraire "${currentRouteName}" ?`)) {
        delete routePresets[currentRouteName];
        currentRouteName = Object.keys(routePresets)[0];
        steps = routePresets[currentRouteName];
        currentStepIndex = steps.length > 0 ? 0 : -1;
        saveStateToLocalStorage();
        populateRouteSelector();
        renderAll();
    }
}


function updateOpacitySettings() {
    settings.maxPastSteps = parseInt(document.getElementById('setting-tx-range').value, 10);
    settings.maxFutureSteps = parseInt(document.getElementById('setting-tplus-range').value, 10);
    settings.hideOutOfScope = document.getElementById('setting-hide-out-of-scope').checked;

    document.getElementById('setting-tx-val').innerText = `${settings.maxPastSteps} étapes`;
    document.getElementById('setting-tplus-val').innerText = `${settings.maxFutureSteps} étapes`;

    saveStateToLocalStorage();
    renderAll();
}
