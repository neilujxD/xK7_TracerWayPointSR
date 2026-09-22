
// Leaflet Map & Layer References
let map = null;

let stepMarkers = [];

let lineSubSegments = [];

let bezierHandles = [];

let handleGuides = [];

let searchZoneLayers = [];

let mapImageBounds = [[0, 0], [4000, 4000]];

let currentImageUrl = '';


function generateProceduralDemoMap() {
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 4000;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 4000, 4000);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    for (let x = 0; x <= 4000; x += 200) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 4000);
        ctx.stroke();
    }
    for (let y = 0; y <= 4000; y += 200) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(4000, y);
        ctx.stroke();
    }

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(1000, 1000, 600, 0, Math.PI * 2);
    ctx.arc(3000, 2500, 800, 0, Math.PI * 2);
    ctx.arc(2000, 3200, 500, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.font = '900 120px sans-serif';
    ctx.fillText('ZONE DEMO ALPHA', 700, 1000);
    ctx.fillText('ZONE DEMO BETA', 2600, 2500);

    return canvas.toDataURL();
}


function initLeafletMap() {
    isMapReady = false;

    if (map) {
        map.remove();
    }

    map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: -6,
        maxZoom: 5,
        zoomSnap: 0.1,
        wheelPxPerZoomLevel: 120,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        dragging: true,
        attributionControl: false
    });

    // Ordre des couches : image de fond (200) < repères (350) < tracés de l'itinéraire (400) < étapes (600)
    map.createPane('mapImagePane').style.zIndex = 200;

    const img = new Image();
    img.onload = function() {
        const w = this.naturalWidth || 4000;
        const h = this.naturalHeight || 4000;
        mapImageBounds = [[0, 0], [h, w]];

        L.imageOverlay(currentImageUrl, mapImageBounds, { pane: 'mapImagePane' }).addTo(map);
        loadMarkersForCurrentMap();

        // Dynamically calculate zoom bounds to allow proper zoom in/out
        const fitZoom = map.getBoundsZoom(mapImageBounds, true);
        const minZoom = Math.floor(fitZoom) - 2;
        const maxZoom = minZoom + 8;
        map.setMinZoom(minZoom);
        map.setMaxZoom(maxZoom);
        poiIconZoomThreshold = fitZoom + 1.5;   // pictogrammes visibles une fois nettement zoomé

        // Restore an independent camera for Route Map and Tactical Map.
        let savedView = null;
        if (appWorkspace === 'tactical') {
            savedView = tacticalSavedMapView();
        } else {
            try {
                const center = JSON.parse(localStorage.getItem('route_planner_map_center') || 'null');
                const zoom = Number.parseFloat(localStorage.getItem('route_planner_map_zoom'));
                if (Array.isArray(center) && center.length === 2
                    && Number.isFinite(center[0]) && Number.isFinite(center[1]) && Number.isFinite(zoom)) {
                    savedView = { center, zoom };
                }
            } catch (error) {
                savedView = null;
            }
        }

        if (savedView) {
            map.setView(savedView.center, Math.max(minZoom, Math.min(maxZoom, savedView.zoom)));
        } else {
            map.fitBounds(mapImageBounds);
        }

        document.getElementById('map-info').innerText = `Carte : ${w} x ${h} px`;
        isMapReady = true;
        
        setTimeout(() => {
            map.invalidateSize();
            renderAll();
        }, 50);
    };

    const failedPath = currentImageUrl;
    img.onerror = function() {
        console.warn("Image introuvable :", failedPath);
        currentImageUrl = generateProceduralDemoMap();
        mapImageBounds = [[0, 0], [4000, 4000]];
        L.imageOverlay(currentImageUrl, mapImageBounds, { pane: 'mapImagePane' }).addTo(map);

        const fitZoom = map.getBoundsZoom(mapImageBounds, true);
        const minZoom = Math.floor(fitZoom) - 2;
        const maxZoom = minZoom + 8;
        map.setMinZoom(minZoom);
        map.setMaxZoom(maxZoom);

        map.fitBounds(mapImageBounds);
        document.getElementById('map-info').innerText = failedPath
            ? `Carte introuvable : ${failedPath} (carte de démonstration affichée)`
            : `Aucune carte trouvée dans ${MAPS_DIR} (carte de démonstration affichée)`;
        isMapReady = true;

        setTimeout(() => {
            map.invalidateSize();
            renderAll();
        }, 50);
    };

    if (currentImageUrl) {
        img.src = currentImageUrl;
    } else {
        img.onerror();
    }

    // Map Click -> route editing or tactical editing depending on workspace.
    map.on('click', function(e) {
        if (appWorkspace === 'tactical') {
            tacticalHandleMapClick(e.latlng.lat, e.latlng.lng);
        } else if (currentMode === 'edit') {
            addStep(e.latlng.lat, e.latlng.lng);
        }
    });

    // Save map position on move/zoom
    map.on('moveend', saveWorkspaceMapView);
    map.on('zoomend', saveWorkspaceMapView);
}


function renumberAutomaticStepTitles() {
    steps = RouteCore.withRenumberedAutomaticTitles(steps);
    routePresets[currentRouteName] = steps;
}


function addStep(lat, lng, title = '', note = '') {
    const stepNumber = steps.length + 1;
    const newStep = {
        id: Date.now() + Math.random(),
        lat: lat,
        lng: lng,
        title: title || `Étape ${stepNumber}`,
        note: note || '',
        // Bézier control point to curve segment towards next step
        controlLat: null,
        controlLng: null,
        // Linked Search Zone settings
        hasZone: false,
        zoneRadius: 250,
        // Quête suivie pendant ce tronçon (principale par défaut ; "secondaire" reste
        // cochée d'une étape à l'autre tant qu'on ne la décoche pas explicitement)
        questMain: true,
        questSide: settings.stickyQuestSide,
        // Téléportation : ligne hachurée vers l'étape suivante, ou simple passage qui l'active
        tpNext: false,
        tpActivate: false
    };

    steps.push(newStep);
    renumberAutomaticStepTitles();

    if (steps.length === 1) {
        currentStepIndex = 0;
    } else if (currentMode === 'edit') {
        currentStepIndex = steps.length - 1;
    }

    saveStateToLocalStorage();
    renderAll();
}


// Insère une nouvelle étape juste après `afterIndex`, à l'endroit cliqué sur un tracé existant.
// Décale la numérotation des étapes suivantes : les notes qui citent un numéro d'étape
// (ex. "TPvers92") ne sont pas mises à jour automatiquement.
function insertStepAfter(afterIndex, lat, lng) {
    if (!confirm("Insérer une étape ici va décaler le numéro de toutes les étapes suivantes.\nSi une note mentionne un numéro d'étape (ex. « TPvers92 »), pense à la vérifier.\n\nContinuer ?")) {
        return;
    }
    const newStep = {
        id: Date.now() + Math.random(),
        lat, lng,
        title: `Étape ${afterIndex + 2}`, note: '',
        controlLat: null, controlLng: null,
        hasZone: false, zoneRadius: 250,
        questMain: true,
        questSide: settings.stickyQuestSide,
        tpNext: false, tpActivate: false
    };
    steps.splice(afterIndex + 1, 0, newStep);
    renumberAutomaticStepTitles();
    // La courbe qui partait de `afterIndex` visait l'ancienne étape suivante : on la laisse
    // se recalculer vers la nouvelle étape insérée.
    if (steps[afterIndex]) { steps[afterIndex].controlLat = null; steps[afterIndex].controlLng = null; }
    currentStepIndex = afterIndex + 1;
    saveStateToLocalStorage();
    renderAll();
}


// Déplace une étape existante (glisser son repère) : la position change, la courbe
// vers l'étape suivante garde son point de contrôle (peut donc se déformer un peu,
// utilise "Reset courbe" au besoin).
function moveStep(index, lat, lng) {
    if (!steps[index]) return;
    steps[index].lat = lat;
    steps[index].lng = lng;
    saveStateToLocalStorage();
    renderAll();
}


function removeStep(index, event) {
    if (event) event.stopPropagation();
    steps.splice(index, 1);
    renumberAutomaticStepTitles();
    // L'étape précédente est maintenant reliée à une autre : on recalcule sa courbe
    if (index > 0 && steps[index - 1]) {
        steps[index - 1].controlLat = null;
        steps[index - 1].controlLng = null;
    }
    if (currentStepIndex >= steps.length) {
        currentStepIndex = steps.length - 1;
    }
    saveStateToLocalStorage();
    renderAll();
}


function updateStepDetails(index, field, value) {
    if (steps[index]) {
        steps[index][field] = value;
        if (field === 'questSide') settings.stickyQuestSide = !!value;   // reste coché pour les prochaines étapes
        saveStateToLocalStorage();
        renderAll();
    }
}


function toggleStepSearchZone(index, event) {
    if (event) event.stopPropagation();
    if (steps[index]) {
        steps[index].hasZone = !steps[index].hasZone;
        saveStateToLocalStorage();
        renderAll();
    }
}


// Pendant le glissement du curseur : mise à jour "à vif" sans reconstruire l'interface
function liveZoneRadius(index, el) {
    const v = parseInt(el.value, 10);
    if (!steps[index] || isNaN(v)) return;
    steps[index].zoneRadius = v;
    if (el.nextElementSibling) el.nextElementSibling.innerText = `${v} px`;
    const circle = searchZoneLayers.find(z => z._stepIndex === index);
    if (circle) circle.setRadius(v);
}


function updateStepZoneRadius(index, radiusVal) {
    if (steps[index]) {
        steps[index].zoneRadius = parseInt(radiusVal, 10);
        saveStateToLocalStorage();
        renderAll();
    }
}


function resetBezierCurve(index, event) {
    if (event) event.stopPropagation();
    if (steps[index]) {
        steps[index].controlLat = null;
        steps[index].controlLng = null;
        saveStateToLocalStorage();
        renderAll();
    }
}


function calculateStepOpacity(index) {
    if (currentStepIndex === -1) return 1.0;

    const delta = index - currentStepIndex;

    if (delta === 0) return 1.0; // Current step T0

    const carryActive = navigationCarryRange
        && navigationCarryRange.target === currentStepIndex
        && navigationCarryRange.end === currentStepIndex - 1;

    if (carryActive && index >= navigationCarryRange.start && index <= navigationCarryRange.end) {
        const count = Math.max(1, navigationCarryRange.end - navigationCarryRange.start + 1);
        const position = index - navigationCarryRange.start;
        return count === 1 ? 0.7 : 0.35 + (position / (count - 1)) * 0.4;
    }

    if (delta < 0) { // Past steps T - x
        const pastDist = Math.abs(delta);
        if (pastDist <= settings.maxPastSteps) {
            return Math.max(0.15, 1.0 - (pastDist * (0.75 / (settings.maxPastSteps || 1))));
        } else {
            return settings.hideOutOfScope ? 0.0 : 0.05;
        }
    } else { // Future steps T + x
        const futureDist = delta;
        if (futureDist <= settings.maxFutureSteps) {
            return Math.max(0.15, 1.0 - (futureDist * (0.75 / (settings.maxFutureSteps || 1))));
        } else {
            return settings.hideOutOfScope ? 0.0 : 0.05;
        }
    }
}


function sampleQuadraticBezierSegments(p0, p1, p2, opStart, opEnd, samplesCount = 20) {
    const segments = [];
    let prevPt = p0;
    let prevOp = opStart;

    for (let i = 1; i <= samplesCount; i++) {
        const t = i / samplesCount;
        const invT = 1 - t;

        // Quadratic Bézier curve formula: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
        const lat = invT * invT * p0[0] + 2 * invT * t * p1[0] + t * t * p2[0];
        const lng = invT * invT * p0[1] + 2 * invT * t * p1[1] + t * t * p2[1];
        const currentPt = [lat, lng];

        // Linear interpolation of opacity from start step to end step
        const currentOp = opStart + t * (opEnd - opStart);

        segments.push({
            p1: prevPt,
            p2: currentPt,
            opacity: (prevOp + currentOp) / 2
        });

        prevPt = currentPt;
        prevOp = currentOp;
    }

    return segments;
}


function centerMapOnStep(index) {
    if (steps[index]) {
        map.panTo([steps[index].lat, steps[index].lng], { animate: true, duration: 0.4 });
    }
}
