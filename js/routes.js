
// ----- Détection automatique depuis les notes (quêtes + téléportation) -----
// Outil ponctuel : à lancer une fois, puis à vérifier/corriger à la main.
function detectQuestsAndTpFromNotes() {
    if (!steps.length) return;
    if (!confirm("Ceci va relire toutes tes notes et recolorer les étapes en conséquence " +
        "(quête principale/secondaire, téléportation), en écrasant les cases déjà cochées.\n\nContinuer ?")) {
        return;
    }
    const secondaryRx = /quete secondaire|qu[êe]te secondaire|\bQS\b/i;
    const mainWordRx = /\bmain\b/i;
    const tpVersRx = /tp\s*vers\s*\d+/i;
    const activRx = /activ/i;

    let touched = 0;
    steps.forEach((s, i) => {
        const note = s.note || '';
        const hasSecondary = secondaryRx.test(note);
        const hasMainWord = mainWordRx.test(note);
        if (hasSecondary && hasMainWord) { s.questMain = true; s.questSide = true; touched++; }
        else if (hasSecondary) { s.questMain = false; s.questSide = true; touched++; }
        else { s.questMain = true; s.questSide = false; }

        // Le champ "TPvers92" vise quasi toujours l'étape suivante : on l'utilise pour ça,
        // sans essayer de recaser le numéro s'il ne correspond plus après des insertions.
        if (tpVersRx.test(note) && i < steps.length - 1) s.tpNext = true;
        if (activRx.test(note)) s.tpActivate = true;
    });

    saveStateToLocalStorage();
    renderAll();
    alert(`Fait : ${touched} étape(s) marquée(s) "quête secondaire" détectées dans les notes.\nVérifie le résultat sur la carte.`);
}


// Applique un statut de quête (ou de téléportation) à toutes les étapes d'un intervalle,
// depuis le petit formulaire "Appliquer de l'étape X à Y" des paramètres.
function applyQuestRangeFromForm() {
    const from = parseInt(document.getElementById('quest-range-from').value, 10);
    const to = parseInt(document.getElementById('quest-range-to').value, 10);
    const mode = document.getElementById('quest-range-mode').value;
    if (isNaN(from) || isNaN(to) || from < 1 || to < from) { alert('Intervalle invalide.'); return; }
    const a = Math.max(0, from - 1), b = Math.min(steps.length - 1, to - 1);
    for (let i = a; i <= b; i++) {
        if (mode === 'main') { steps[i].questMain = true; steps[i].questSide = false; }
        else if (mode === 'side') { steps[i].questMain = false; steps[i].questSide = true; }
        else if (mode === 'both') { steps[i].questMain = true; steps[i].questSide = true; }
        else { steps[i].questMain = false; steps[i].questSide = false; }
    }
    saveStateToLocalStorage();
    renderAll();
}



// Signature comparable d'une liste d'étapes (pour détecter une modification locale)
function stepsSignature(list) {
    return JSON.stringify((list || []).map(t => [t.lat, t.lng, t.title, t.note,
        t.controlLat, t.controlLng, !!t.hasZone, t.zoneRadius]));
}


// Valide et nettoie les données d'un fichier (ancien format ou nouveau)
function normalizeRoute(data, fallbackName) {
    const rawSteps = Array.isArray(data) ? data : (data && Array.isArray(data.steps) ? data.steps : null);
    if (!rawSteps) throw new Error('format');
    const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
    const cleanSteps = [];
    rawSteps.forEach(t => {
        if (!t) return;
        const lat = num(t.lat), lng = num(t.lng);
        if (lat === null || lng === null) return;
        const cLat = num(t.controlLat), cLng = num(t.controlLng);
        const hasCtrl = cLat !== null && cLng !== null;
        cleanSteps.push({
            id: Date.now() + Math.random(),
            lat, lng,
            title: String(t.title ?? '').slice(0, 120),
            note: String(t.note ?? '').slice(0, 500),
            controlLat: hasCtrl ? cLat : null,
            controlLng: hasCtrl ? cLng : null,
            hasZone: !!t.hasZone,
            zoneRadius: Math.min(1000, Math.max(50, parseInt(t.zoneRadius, 10) || 250)),
            // Quête suivie + téléportation : absents d'un ancien fichier -> valeurs par défaut
            questMain: t.questMain === undefined ? true : !!t.questMain,
            questSide: !!t.questSide,
            tpNext: !!t.tpNext,
            tpActivate: !!t.tpActivate
        });
    });

    const obj = (data && !Array.isArray(data)) ? data : {};
    const name = String(obj.name || obj.routeName || fallbackName || `Imported_${Date.now()}`).trim().slice(0, 80)
        || `Imported_${Date.now()}`;

    // Carte associée (on n'accepte que des chemins dans images/maps/)
    let map = obj.map || (obj.settings && obj.settings.mapImagePath) || null;
    if (typeof map !== 'string' || !map.startsWith(MAPS_DIR) || map.includes('..')) map = null;

    // Réglages d'opacité (facultatifs)
    let opacity = null;
    if (obj.settings && typeof obj.settings === 'object') {
        const clamp = (v, def) => {
            const n = parseInt(v, 10);
            return isNaN(n) ? def : Math.min(10, Math.max(0, n));
        };
        opacity = {
            maxPastSteps: clamp(obj.settings.maxPastSteps, settings.maxPastSteps),
            maxFutureSteps: clamp(obj.settings.maxFutureSteps, settings.maxFutureSteps),
            hideOutOfScope: !!obj.settings.hideOutOfScope
        };
    }
    return { name, steps: cleanSteps, map, opacity };
}


// Si un itinéraire local du même nom existe et diffère, demande confirmation
function confirmOverwrite(route) {
    const local = routePresets[route.name];
    if (!local) return true;
    if (stepsSignature(local) === stepsSignature(route.steps)) return true;
    return confirm(`Un itinéraire local nommé « ${route.name} » existe déjà et diffère de ce fichier.\nLe remplacer ?`);
}


// Applique l'itinéraire (étapes + carte + réglages). Retourne true si la carte a changé.
function applyRoute(route) {
    routePresets[currentRouteName] = steps;
    routePresets[route.name] = route.steps;
    currentRouteName = route.name;
    steps = route.steps;
    currentStepIndex = steps.length > 0 ? 0 : -1;

    if (route.opacity) Object.assign(settings, route.opacity);

    let mapChanged = false;
    if (route.map && route.map !== settings.mapImagePath) {
        const known = availableMaps.length === 0 || availableMaps.includes(route.map.slice(MAPS_DIR.length));
        if (known) {
            settings.mapImagePath = route.map;
            currentImageUrl = toUrl(route.map);
            mapChanged = true;
        } else {
            console.warn('Carte de l\'itinéraire introuvable dans le dossier :', route.map);
        }
    }

    saveStateToLocalStorage();
    if (mapChanged) {
        localStorage.removeItem('route_planner_map_center');
        localStorage.removeItem('route_planner_map_zoom');
    }
    return mapChanged;
}


// Applique et rafraîchit l'affichage (utilisé une fois la carte déjà lancée)
function applyRouteLive(route) {
    const mapChanged = applyRoute(route);
    if (mapChanged) initLeafletMap(); else renderAll();
    populateRouteSelector();
}


// Télécharge l'itinéraire courant : étapes + carte + réglages d'opacité
function exportJSON() {
    const data = {
        version: 1,
        name: currentRouteName,
        map: settings.mapImagePath || null,
        settings: {
            maxPastSteps: settings.maxPastSteps,
            maxFutureSteps: settings.maxFutureSteps,
            hideOutOfScope: settings.hideOutOfScope
        },
        steps: steps
    };
    const slug = currentRouteName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'itineraire';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const route = normalizeRoute(JSON.parse(e.target.result), file.name.replace(/\.json$/i, ''));
            if (confirmOverwrite(route)) applyRouteLive(route);
        } catch (err) {
            alert("Erreur lors de la lecture du fichier JSON.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}


// ----- Itinéraires partagés (dossier routes/) -----

async function fetchSharedRoute(file) {
    if (location.protocol === 'file:') throw new Error('file');
    const res = await fetch(ROUTES_DIR + encodeURIComponent(file) + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return normalizeRoute(await res.json(), file.replace(/\.json$/i, ''));
}


function populateSharedRoutes() {
    const selector = document.getElementById('shared-route-selector');
    const status = document.getElementById('route-scan-status');
    if (!selector) return;
    selector.innerHTML = '';

    if (!availableRoutes.length) {
        const option = document.createElement('option');
        option.value = '';
        option.innerText = 'Aucun itinéraire partagé';
        selector.appendChild(option);
        selector.disabled = true;
        status.innerText = location.protocol === 'file:'
            ? "Indisponible en ouverture directe (file://). Utilise le bouton Importer."
            : "Aucun fichier .json trouvé dans routes/.";
        return;
    }

    selector.disabled = false;
    availableRoutes.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.innerText = name.replace(/\.json$/i, '');
        selector.appendChild(option);
    });
    status.innerText = `${availableRoutes.length} itinéraire(s) partagé(s) (${routesScanMethod})`;
}


async function refreshRouteList() {
    document.getElementById('route-scan-status').innerText = 'Analyse du dossier...';
    await scanRoutesFolder();
    populateSharedRoutes();
}


async function loadSelectedSharedRoute() {
    const file = document.getElementById('shared-route-selector').value;
    if (!file) return;
    try {
        const route = await fetchSharedRoute(file);
        if (!confirmOverwrite(route)) return;
        applyRouteLive(route);
        closeSettingsModal();
    } catch (e) {
        alert("Impossible de charger cet itinéraire.\nS'il vient d'être ajouté, attends une minute que GitHub le publie, puis réessaie.");
    }
}


function copySharedRouteLink() {
    const file = document.getElementById('shared-route-selector').value;
    if (!file) return;
    const link = location.origin + location.pathname + '?route=' + encodeURIComponent(file);
    const status = document.getElementById('route-scan-status');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(
            () => { status.innerText = 'Lien copié dans le presse-papiers.'; },
            () => prompt('Copie ce lien :', link)
        );
    } else {
        prompt('Copie ce lien :', link);
    }
}
