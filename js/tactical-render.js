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

function tacticalBezierPoints(a, b, samples) {
    const count = samples || 24;
    const control = (Number.isFinite(a.controlLat) && Number.isFinite(a.controlLng))
        ? [a.controlLat, a.controlLng]
        : [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
    const points = [];
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const inv = 1 - t;
        points.push([
            inv * inv * a.lat + 2 * inv * t * control[0] + t * t * b.lat,
            inv * inv * a.lng + 2 * inv * t * control[1] + t * t * b.lng
        ]);
    }
    return { points, control };
}

function tacticalSegmentKey(a, b, ownerIds) {
    const keyA = `${Math.round(a.lat * 10)}:${Math.round(a.lng * 10)}`;
    const keyB = `${Math.round(b.lat * 10)}:${Math.round(b.lng * 10)}`;
    return [keyA, keyB].sort().join('|') + ':' + ownerIds.slice().sort().join(',');
}

function tacticalEndpointMenu(groupId, trackIndex, nodeIndex, isEndpoint) {
    const group = tacticalGroupById(groupId);
    if (!group) return '';
    const joinSplit = isEndpoint
        ? `<button class="tactical-popup-btn" onclick="tacticalJoinAtNode('${groupId}',${trackIndex},${nodeIndex})">Joindre</button>
           <button class="tactical-popup-btn" onclick="tacticalSplitAtNode('${groupId}',${trackIndex},${nodeIndex})">Séparer</button>`
        : '';
    return `
        <div class="tactical-popup-menu">
            <div class="tactical-popup-title">${esc(group.name)}</div>
            <div class="tactical-popup-actions">
                ${joinSplit}
                <button class="tactical-popup-btn" onclick="tacticalMoveNode('${groupId}',${trackIndex},${nodeIndex})">Déplacer</button>
            </div>
        </div>`;
}

function tacticalPointMenu(point) {
    return `
        <div class="tactical-popup-menu">
            <div class="tactical-popup-title">${esc(point.label)}</div>
            <div class="tactical-popup-actions">
                <button class="tactical-popup-btn" onclick="tacticalJoinPoint('${point.id}')">Joindre</button>
                <button class="tactical-popup-btn" onclick="tacticalSplitFromPoint('${point.id}')">Séparer</button>
                <button class="tactical-popup-btn" onclick="tacticalMovePoint('${point.id}')">Déplacer</button>
                <button class="tactical-popup-btn" onclick="tacticalRenamePoint('${point.id}')">Renommer</button>
            </div>
        </div>`;
}

function renderTacticalMoveHandle() {
    if (!tacticalMoveTarget || tacticalMode !== 'edit') return;
    const marker = L.marker([tacticalMoveTarget.lat, tacticalMoveTarget.lng], {
        draggable: true,
        icon: L.divIcon({
            className: 'bezier-handle-icon tactical-move-handle',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        }),
        zIndexOffset: 1200
    }).addTo(map);

    marker.bindTooltip('Déplacer', { permanent: true, direction: 'top', offset: [0, -10] });
    marker.on('dragend', event => {
        const p = event.target.getLatLng();
        tacticalMoveSelectedByDrag(p.lat, p.lng);
    });
    tacticalLayers.push(marker);
}

function renderTacticalBezierHandle(group, trackIndex, segmentIndex, a, b) {
    if (tacticalMode !== 'edit' || group.id !== tacticalActiveGroupId) return;

    const data = tacticalBezierPoints(a, b, 4);
    const control = data.control;

    const guide = L.polyline([
        [a.lat, a.lng],
        control,
        [b.lat, b.lng]
    ], {
        color: '#f59e0b',
        weight: 1,
        opacity: 0.35,
        dashArray: '4,6',
        interactive: false
    }).addTo(map);
    tacticalLayers.push(guide);

    const handle = L.marker(control, {
        draggable: true,
        icon: L.divIcon({
            className: 'bezier-handle-icon',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        }),
        zIndexOffset: 900
    }).addTo(map);

    handle.on('dragend', event => {
        const p = event.target.getLatLng();
        tacticalSetBezier(group.id, trackIndex, segmentIndex, p.lat, p.lng);
    });

    handle.on('dblclick', event => {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        tacticalResetBezier(group.id, trackIndex, segmentIndex);
    });

    handle.bindTooltip('Courbe · double-clic = reset', { direction: 'top' });
    tacticalLayers.push(handle);
}

function renderTacticalMap() {
    clearRouteLayersForWorkspaceSwitch();
    clearTacticalLayers();

    if (!map || !isMapReady || !tacticalStrategy) return;

    const phaseId = tacticalActivePhaseId;
    const segmentDrawn = new Set();

    tacticalStrategy.groups.forEach(group => {
        const tracks = group.paths[phaseId] || [];

        tracks.forEach((track, trackIndex) => {
            for (let i = 0; i < track.length - 1; i++) {
                const a = track[i];
                const b = track[i + 1];
                const owners = TacticalCore.segmentOwners(tacticalStrategy, phaseId, a, b, 0.1);
                const ownerIds = owners.map(owner => owner.id).sort();
                const segmentKey = tacticalSegmentKey(a, b, ownerIds);

                if (!segmentDrawn.has(segmentKey)) {
                    segmentDrawn.add(segmentKey);
                    const bezier = tacticalBezierPoints(a, b, 24);
                    const opacity = tacticalSegmentOpacity(ownerIds);

                    if (owners.length >= 3) {
                        const halo = L.polyline(bezier.points, {
                            color: '#f8fafc',
                            weight: 11,
                            opacity: opacity * 0.75,
                            lineCap: 'round',
                            lineJoin: 'round',
                            interactive: false
                        }).addTo(map);
                        tacticalLayers.push(halo);
                    }

                    const color = TacticalCore.mixColors(owners.map(owner => owner.color));
                    const line = L.polyline(bezier.points, {
                        color,
                        weight: owners.length > 1 ? 8 : 6,
                        opacity,
                        lineCap: 'round',
                        lineJoin: 'round',
                        interactive: false
                    }).addTo(map);
                    tacticalLayers.push(line);
                }

                renderTacticalBezierHandle(group, trackIndex, i, a, b);
            }

            track.forEach((point, nodeIndex) => {
                const active = group.id === tacticalActiveGroupId;
                const endpoint = nodeIndex === 0 || nodeIndex === track.length - 1;
                const marker = L.circleMarker([point.lat, point.lng], {
                    radius: endpoint ? (active ? 7 : 6) : (active ? 5 : 4),
                    color: endpoint ? '#f8fafc' : '#0f172a',
                    weight: endpoint ? 2.5 : 2,
                    fillColor: group.color,
                    fillOpacity: tacticalGroupOpacity(group.id),
                    opacity: tacticalGroupOpacity(group.id)
                }).addTo(map);

                marker.bindTooltip(`${esc(group.name)} · branche ${trackIndex + 1} · point ${nodeIndex + 1}`, {
                    direction: 'top',
                    opacity: 0.9
                });

                marker.on('click', event => {
                    if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
                    L.popup({
                        closeButton: true,
                        offset: [0, -4],
                        className: 'tactical-action-popup'
                    })
                        .setLatLng([point.lat, point.lng])
                        .setContent(tacticalEndpointMenu(group.id, trackIndex, nodeIndex, endpoint))
                        .openOn(map);
                });

                tacticalLayers.push(marker);
            });
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
            L.popup({
                closeButton: true,
                offset: [0, -8],
                className: 'tactical-action-popup'
            })
                .setLatLng([point.lat, point.lng])
                .setContent(tacticalPointMenu(point))
                .openOn(map);
        });

        tacticalLayers.push(marker);
    });

    renderTacticalMoveHandle();

    if (window.lucide) lucide.createIcons();
}

function renderTacticalAll() {
    if (appWorkspace !== 'tactical') return;
    renderTacticalSidebar();
    renderTacticalHeader();
    renderTacticalMap();
}
