let markerGroups = {};      // id -> L.layerGroup

let markerLayerDefs = [];   // { id, label, color, count }

let markerLoadToken = 0;

let markerPointsFlat = [];   // [{id, color, lat, lng}] à plat, pour affichage et recherche
let markerSpatialIndex = new Map();
const MARKER_INDEX_CELL = 32;
let poiIconLayer = null;     // pictogrammes affichés uniquement en zoom rapproché, dans la vue actuelle


// Cherche le repère (plume, TP, donjon...) le plus proche d'une position donnée.
// Renvoie {id, color} si un repère se trouve à moins de BADGE_SNAP_PX pixels-carte, sinon null.
function markerCellKey(lat, lng) {
    return `${Math.floor(lat / MARKER_INDEX_CELL)}:${Math.floor(lng / MARKER_INDEX_CELL)}`;
}


function indexMarkerPoint(point) {
    const key = markerCellKey(point.lat, point.lng);
    if (!markerSpatialIndex.has(key)) markerSpatialIndex.set(key, []);
    markerSpatialIndex.get(key).push(point);
}


function findMarkerBadgeForStep(lat, lng) {
    let best = null;
    let bestDist = BADGE_SNAP_PX;
    const row = Math.floor(lat / MARKER_INDEX_CELL);
    const col = Math.floor(lng / MARKER_INDEX_CELL);

    // BADGE_SNAP_PX est bien inférieur à la taille d'une cellule : 3x3 cellules suffisent.
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const bucket = markerSpatialIndex.get(`${row + dr}:${col + dc}`) || [];
            for (const point of bucket) {
                const distance = Math.hypot(point.lat - lat, point.lng - lng);
                if (distance <= bestDist) {
                    bestDist = distance;
                    best = point;
                }
            }
        }
    }

    return best ? { id: best.id, color: best.color } : null;
}


// Affiche, uniquement dans la zone visible et à partir d'un certain zoom, un pictogramme
// par-dessus chaque point (au lieu du simple disque coloré). Les disques restent en dessous
// pour le clic et l'infobulle ; le pictogramme n'est qu'une décoration.
function refreshPoiIcons() {
    if (!map) return;
    if (!poiIconLayer) poiIconLayer = L.layerGroup().addTo(map);
    poiIconLayer.clearLayers();
    if (map.getZoom() < poiIconZoomThreshold) return;

    const bounds = map.getBounds();
    const visible = markerPointsFlat.filter(p =>
        !settings.hiddenMarkerLayers.includes(p.id) && bounds.contains([p.lat, p.lng]));
    // Trop de pictogrammes à la fois ralentirait l'affichage : au-delà, on garde les simples points.
    if (visible.length > 500) return;

    visible.forEach(p => {
        const icon = L.divIcon({
            html: `<svg width="20" height="20" viewBox="-10 -10 20 20" style="overflow:visible">
                     <circle r="8.5" fill="${p.color}" stroke="#1f1f1f" stroke-width="1.3"/>
                     <g style="color:#fff">${POI_ICONS[p.id] || ''}</g>
                   </svg>`,
            className: '', iconSize: [20, 20], iconAnchor: [10, 10]
        });
        L.marker([p.lat, p.lng], { icon, interactive: false, pane: 'poiPane' }).addTo(poiIconLayer);
    });
}


function currentWorkspaceMapPath() {
    if (appWorkspace === 'tactical' && tacticalStrategy && tacticalStrategy.map) {
        return tacticalStrategy.map;
    }
    return settings.mapImagePath || '';
}

function currentMapBase() {
    const file = currentWorkspaceMapPath().split('/').pop() || '';
    return file.replace(/\.[^.]+$/, '');
}


async function loadMarkersForCurrentMap() {
    const token = ++markerLoadToken;
    const thisMap = map;
    markerGroups = {};
    markerLayerDefs = [];
    markerPointsFlat = [];
    markerSpatialIndex = new Map();

    const base = currentMapBase();
    let data = null;
    if (base && location.protocol !== 'file:') {
        try {
            const res = await fetch(MARKERS_DIR + encodeURIComponent(base) + '.json?t=' + Date.now(), { cache: 'no-store' });
            if (res.ok) data = await res.json();
        } catch (e) { /* pas de fichier de repères pour cette carte */ }
    }
    if (token !== markerLoadToken || thisMap !== map) return;   // la carte a changé entre-temps

    if (data && Array.isArray(data.layers)) {
        if (!thisMap.getPane('poiPane')) thisMap.createPane('poiPane').style.zIndex = 350;
        const renderer = L.canvas({ pane: 'poiPane' });
        const h = mapImageBounds[1][0], w = mapImageBounds[1][1];

        data.layers.forEach(layer => {
            if (!layer || typeof layer.id !== 'string' || !Array.isArray(layer.points)) return;
            const color = /^#[0-9a-f]{3,8}$/i.test(layer.color || '') ? layer.color : '#ef4444';
            const group = L.layerGroup();
            let count = 0;
            layer.points.forEach(pt => {
                if (!Array.isArray(pt)) return;
                const nx = Number(pt[0]), ny = Number(pt[1]);
                if (!isFinite(nx) || !isFinite(ny)) return;
                const lat = (1 - ny) * h, lng = nx * w;
                const name = typeof pt[2] === 'string' ? pt[2] : '';
                const dot = L.circleMarker([lat, lng], {
                    renderer, radius: 6, color: '#ffffff', weight: 1.5,
                    fillColor: color, fillOpacity: 0.95, bubblingMouseEvents: false
                });
                if (name) {
                    const tip = document.createElement('span');   // texte brut : pas d'interprétation HTML
                    tip.textContent = name;
                    dot.bindTooltip(tip, { direction: 'top' });
                }
                // En mode édition : un clic sur un repère place l'étape pile dessus
                dot.on('click', () => { if (currentMode === 'edit') addStep(lat, lng, name); });
                group.addLayer(dot);
                const indexedPoint = { id: layer.id, color, lat, lng };
                markerPointsFlat.push(indexedPoint);
                indexMarkerPoint(indexedPoint);
                count++;
            });
            markerGroups[layer.id] = group;
            markerLayerDefs.push({ id: layer.id, label: String(layer.label || layer.id), color, count });
            if (!settings.hiddenMarkerLayers.includes(layer.id)) group.addTo(thisMap);
        });

        if (!thisMap.__poiIconHandlersBound) {
            thisMap.__poiIconHandlersBound = true;
            thisMap.on('zoomend moveend', refreshPoiIcons);
        }
        refreshPoiIcons();
    }
    populateMarkerLayers();
}


function toggleMarkerLayer(id, visible) {
    const group = markerGroups[id];
    if (!group || !map) return;
    const hidden = new Set(settings.hiddenMarkerLayers);
    if (visible) { hidden.delete(id); group.addTo(map); }
    else { hidden.add(id); map.removeLayer(group); }
    settings.hiddenMarkerLayers = [...hidden];
    saveStateToLocalStorage();
    refreshPoiIcons();
}


function populateMarkerLayers() {
    const box = document.getElementById('marker-layers-list');
    const status = document.getElementById('marker-layers-status');
    if (!box || !status) return;
    box.innerHTML = '';
    if (!markerLayerDefs.length) {
        status.innerText = location.protocol === 'file:'
            ? "Repères indisponibles en ouverture directe (file://)."
            : `Aucun repère pour cette carte (fichier ${MARKERS_DIR}${currentMapBase() || 'nom_de_la_carte'}.json).`;
        return;
    }
    markerLayerDefs.forEach(def => {
        const label = document.createElement('label');
        label.className = 'flex items-center space-x-2 text-xs text-slate-200 cursor-pointer';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'accent-emerald-500';
        cb.checked = !settings.hiddenMarkerLayers.includes(def.id);
        cb.onchange = () => toggleMarkerLayer(def.id, cb.checked);
        const dot = document.createElement('span');
        dot.className = 'inline-block w-3 h-3 rounded-full border border-white shrink-0';
        dot.style.background = def.color;
        const txt = document.createElement('span');
        txt.textContent = `${def.label} (${def.count})`;
        label.append(cb, dot, txt);
        box.appendChild(label);
    });
    status.innerText = "En mode édition, un clic sur un repère place l'étape pile dessus.";
}
