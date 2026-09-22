// Tactical Map Leaflet rendering
function clearTacticalLayers() {
    if (!map) return;
    tacticalLayers.forEach(layer => {
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    });
    tacticalLayers = [];
}

function clearRouteLayersForWorkspaceSwitch() {
    if (!map) return;
    stepMarkers.forEach(layer => map.hasLayer(layer) && map.removeLayer(layer));
    lineSubSegments.forEach(layer => map.hasLayer(layer) && map.removeLayer(layer));
    bezierHandles.forEach(layer => map.hasLayer(layer) && map.removeLayer(layer));
    handleGuides.forEach(layer => map.hasLayer(layer) && map.removeLayer(layer));
    searchZoneLayers.forEach(layer => map.hasLayer(layer) && map.removeLayer(layer));
    stepMarkers = [];
    lineSubSegments = [];
    bezierHandles = [];
    handleGuides = [];
    searchZoneLayers = [];
}

function tacticalGroupOpacity(groupId) {
    if (tacticalFocusGroupId === 'all') return 0.95;
    return tacticalFocusGroupId === groupId ? 1 : 0.14;
}

function tacticalSegmentOpacity(ownerIds) {
    if (tacticalFocusGroupId === 'all') return 0.95;
    return ownerIds.includes(tacticalFocusGroupId) ? 1 : 0.12;
}

function tacticalPointVisible(point) {
    if (point.phaseId !== tacticalActivePhaseId) return false;
    if (tacticalFocusGroupId === 'all') return true;
    return point.groupIds.length === 0 || point.groupIds.includes(tacticalFocusGroupId);
}

function tacticalPointIcon(point) {
    const meta = TacticalCore.POINT_TYPES[point.type] || TacticalCore.POINT_TYPES.objective;
    const groups = tacticalStrategy.groups.filter(group => point.groupIds.includes(group.id));
    const color = TacticalCore.mixColors(groups.map(group => group.color));
    const html = `
        <div class="tactical-point-marker" style="--tactical-color:${color}">
            <div class="tactical-point-symbol"><i data-lucide="${meta.icon}" style="width:14px;height:14px"></i></div>
            <div class="tactical-point-label">${esc(point.label)}</div>
        </div>`;
    return L.divIcon({
        html,
        className: 'tactical-leaflet-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

function renderTacticalMap() {
    clearRouteLayersForWorkspaceSwitch();
    clearTacticalLayers();

    if (!map || !isMapReady || !tacticalStrategy) return;

    const phaseId = tacticalActivePhaseId;
    const segmentDrawn = new Set();

    tacticalStrategy.groups.forEach(group => {
        const path = group.paths[phaseId] || [];
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i], b = path[i + 1];
            const owners = TacticalCore.segmentOwners(tacticalStrategy, phaseId, a, b, 4);
            const ownerIds = owners.map(owner => owner.id).sort();
            const keyA = `${Math.round(a.lat)}:${Math.round(a.lng)}`;
            const keyB = `${Math.round(b.lat)}:${Math.round(b.lng)}`;
            const segmentKey = [keyA, keyB].sort().join('|') + ':' + ownerIds.join(',');
            if (segmentDrawn.has(segmentKey)) continue;
            segmentDrawn.add(segmentKey);

            const color = TacticalCore.mixColors(owners.map(owner => owner.color));
            const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
                color,
                weight: owners.length > 1 ? 8 : 6,
                opacity: tacticalSegmentOpacity(ownerIds),
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);
            tacticalLayers.push(line);
        }

        path.forEach((point, index) => {
            const active = group.id === tacticalActiveGroupId;
            const marker = L.circleMarker([point.lat, point.lng], {
                radius: active ? 6 : 4,
                color: '#0f172a',
                weight: 2,
                fillColor: group.color,
                fillOpacity: tacticalGroupOpacity(group.id),
                opacity: tacticalGroupOpacity(group.id)
            }).addTo(map);

            marker.bindTooltip(`${esc(group.name)} · ${index + 1}`, {
                direction: 'top',
                opacity: 0.9
            });

            marker.on('click', event => {
                if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
                tacticalActiveGroupId = group.id;
                saveTacticalState();
                renderTacticalAll();
            });

            tacticalLayers.push(marker);
        });
    });

    tacticalStrategy.points.filter(tacticalPointVisible).forEach(point => {
        const marker = L.marker([point.lat, point.lng], {
            icon: tacticalPointIcon(point),
            opacity: tacticalFocusGroupId === 'all' || point.groupIds.length === 0
                || point.groupIds.includes(tacticalFocusGroupId) ? 1 : 0.15
        }).addTo(map);

        const groupNames = tacticalStrategy.groups
            .filter(group => point.groupIds.includes(group.id))
            .map(group => group.name)
            .join(', ') || 'Tous les groupes';
        marker.bindTooltip(`<strong>${esc(point.label)}</strong><br><span>${esc(groupNames)}</span>`, {
            direction: 'top'
        });

        marker.on('click', event => {
            if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
            tacticalSelectPoint(point.id);
        });

        tacticalLayers.push(marker);
    });

    if (window.lucide) lucide.createIcons();
}

function renderTacticalAll() {
    if (appWorkspace !== 'tactical') return;
    renderTacticalSidebar();
    renderTacticalHeader();
    renderTacticalMap();
}
