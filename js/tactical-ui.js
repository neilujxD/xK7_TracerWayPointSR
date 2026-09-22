function tacticalActivePhase() {
    return tacticalStrategy.phases.find(phase => phase.id === tacticalActivePhaseId)
        || tacticalStrategy.phases[0];
}

function tacticalActiveGroup() {
    return tacticalStrategy.groups.find(group => group.id === tacticalActiveGroupId)
        || tacticalStrategy.groups[0];
}

function switchWorkspace(workspace) {
    if (workspace !== 'route' && workspace !== 'tactical') return;
    if (appWorkspace === workspace) return;

    appWorkspace = workspace;
    document.getElementById('route-sidebar').classList.toggle('hidden', workspace !== 'route');
    document.getElementById('tactical-sidebar').classList.toggle('hidden', workspace !== 'tactical');
    document.getElementById('route-mode-controls').classList.toggle('hidden', workspace !== 'route');
    document.getElementById('tactical-mode-controls').classList.toggle('hidden', workspace !== 'tactical');
    document.getElementById('route-bottom-controls').classList.toggle('hidden', workspace !== 'route');
    document.getElementById('route-shortcuts').classList.toggle('hidden', workspace !== 'route');
    document.getElementById('tactical-bottom-controls').classList.toggle('hidden', workspace !== 'tactical');

    const routeButton = document.getElementById('workspace-route-btn');
    const tacticalButton = document.getElementById('workspace-tactical-btn');
    routeButton.className = workspace === 'route'
        ? 'workspace-switch workspace-switch-active'
        : 'workspace-switch';
    tacticalButton.className = workspace === 'tactical'
        ? 'workspace-switch workspace-switch-active'
        : 'workspace-switch';

    if (workspace === 'tactical') {
        if (!tacticalStrategy.map) tacticalStrategy.map = settings.mapImagePath || '';
        if (tacticalStrategy.map && tacticalStrategy.map !== settings.mapImagePath) {
            settings.mapImagePath = tacticalStrategy.map;
            currentImageUrl = toUrl(tacticalStrategy.map);
            initLeafletMap();
        } else {
            renderTacticalAll();
        }
    } else {
        clearTacticalLayers();
        if (settings.mapImagePath) currentImageUrl = toUrl(settings.mapImagePath);
        renderAll();
    }
    if (window.lucide) lucide.createIcons();
}

function renderTacticalHeader() {
    const title = document.getElementById('workspace-title');
    const badge = document.getElementById('active-route-badge');
    title.innerText = 'Tactical Map';
    badge.innerText = tacticalStrategy.name;

    document.getElementById('tactical-mode-edit').className = tacticalMode === 'edit'
        ? 'flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white shadow-lg'
        : 'flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200';
    document.getElementById('tactical-mode-present').className = tacticalMode === 'present'
        ? 'flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white shadow-lg'
        : 'flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200';

    const phase = tacticalActivePhase();
    const group = tacticalActiveGroup();
    document.getElementById('tactical-phase-label').innerText = phase ? phase.name : 'Phase';
    document.getElementById('tactical-group-label').innerText = group ? group.name : 'Groupe';
}

function setTacticalMode(mode) {
    tacticalMode = mode === 'present' ? 'present' : 'edit';
    if (tacticalMode === 'present') tacticalTool = 'route';
    renderTacticalAll();
}

function setTacticalTool(tool, pointType) {
    if (tacticalMode !== 'edit') return;
    tacticalTool = tool;
    if (pointType) tacticalPointType = pointType;
    renderTacticalSidebar();
}

function tacticalSnapPoint(lat, lng) {
    let best = { lat, lng };
    let distance = 18;
    tacticalStrategy.groups.forEach(group => {
        const path = group.paths[tacticalActivePhaseId] || [];
        path.forEach(point => {
            const d = Math.hypot(point.lat - lat, point.lng - lng);
            if (d < distance) {
                distance = d;
                best = { lat: point.lat, lng: point.lng };
            }
        });
    });
    tacticalStrategy.points
        .filter(point => point.phaseId === tacticalActivePhaseId)
        .forEach(point => {
            const d = Math.hypot(point.lat - lat, point.lng - lng);
            if (d < distance) {
                distance = d;
                best = { lat: point.lat, lng: point.lng };
            }
        });
    return best;
}

function tacticalHandleMapClick(lat, lng) {
    if (appWorkspace !== 'tactical' || tacticalMode !== 'edit') return;
    const group = tacticalActiveGroup();
    if (!group) return;
    const snapped = tacticalSnapPoint(lat, lng);

    if (tacticalTool === 'point') {
        const meta = TacticalCore.POINT_TYPES[tacticalPointType] || TacticalCore.POINT_TYPES.objective;
        tacticalStrategy.points.push({
            id: 'point_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
            type: tacticalPointType,
            label: meta.label,
            note: '',
            lat: snapped.lat,
            lng: snapped.lng,
            phaseId: tacticalActivePhaseId,
            groupIds: [group.id]
        });
    } else {
        if (!group.paths[tacticalActivePhaseId]) group.paths[tacticalActivePhaseId] = [];
        group.paths[tacticalActivePhaseId].push(snapped);
    }

    saveTacticalState();
    renderTacticalAll();
}

function tacticalUndoPoint() {
    const group = tacticalActiveGroup();
    if (!group) return;
    const path = group.paths[tacticalActivePhaseId] || [];
    if (path.length) path.pop();
    saveTacticalState();
    renderTacticalAll();
}

function tacticalClearActiveRoute() {
    const group = tacticalActiveGroup();
    if (!group) return;
    if (!confirm(`Effacer le tracé de « ${group.name} » pour cette phase ?`)) return;
    group.paths[tacticalActivePhaseId] = [];
    saveTacticalState();
    renderTacticalAll();
}

function tacticalAddGroup() {
    const name = prompt('Nom du groupe :', `Groupe ${tacticalStrategy.groups.length + 1}`);
    if (!name || !name.trim()) return;
    const group = TacticalCore.addGroup(tacticalStrategy, name.trim());
    tacticalActiveGroupId = group.id;
    saveTacticalState();
    renderTacticalAll();
}

function tacticalRenameGroup(groupId) {
    const group = tacticalStrategy.groups.find(item => item.id === groupId);
    if (!group) return;
    const name = prompt('Nom du groupe :', group.name);
    if (!name || !name.trim()) return;
    group.name = name.trim().slice(0, 80);
    saveTacticalState();
    renderTacticalAll();
}

function tacticalSetGroupColor(groupId, color) {
    const group = tacticalStrategy.groups.find(item => item.id === groupId);
    if (!group || !/^#[0-9a-f]{6}$/i.test(color)) return;
    group.color = color;
    saveTacticalState();
    renderTacticalAll();
}

function tacticalDeleteGroup(groupId) {
    if (tacticalStrategy.groups.length <= 1) {
        alert('La stratégie doit conserver au moins un groupe.');
        return;
    }
    const group = tacticalStrategy.groups.find(item => item.id === groupId);
    if (!group || !confirm(`Supprimer « ${group.name} » et ses tracés ?`)) return;
    tacticalStrategy.groups = tacticalStrategy.groups.filter(item => item.id !== groupId);
    tacticalStrategy.points.forEach(point => {
        point.groupIds = point.groupIds.filter(id => id !== groupId);
    });
    if (tacticalActiveGroupId === groupId) tacticalActiveGroupId = tacticalStrategy.groups[0].id;
    if (tacticalFocusGroupId === groupId) tacticalFocusGroupId = 'all';
    saveTacticalState();
    renderTacticalAll();
}

function tacticalAddPhase() {
    const name = prompt('Nom de la phase :', `Phase ${tacticalStrategy.phases.length + 1}`);
    if (!name || !name.trim()) return;
    const phase = TacticalCore.addPhase(tacticalStrategy, name.trim());
    tacticalActivePhaseId = phase.id;
    saveTacticalState();
    renderTacticalAll();
}

function tacticalSelectPhase(phaseId) {
    if (!tacticalStrategy.phases.some(phase => phase.id === phaseId)) return;
    tacticalActivePhaseId = phaseId;
    saveTacticalState();
    renderTacticalAll();
}

function tacticalStepPhase(direction) {
    const index = tacticalStrategy.phases.findIndex(phase => phase.id === tacticalActivePhaseId);
    const next = Math.max(0, Math.min(tacticalStrategy.phases.length - 1, index + direction));
    tacticalSelectPhase(tacticalStrategy.phases[next].id);
}

function tacticalFocusGroup(groupId) {
    tacticalFocusGroupId = groupId;
    saveTacticalState();
    renderTacticalAll();
}

function tacticalSelectGroup(groupId) {
    if (!tacticalStrategy.groups.some(group => group.id === groupId)) return;
    tacticalActiveGroupId = groupId;
    saveTacticalState();
    renderTacticalAll();
}

function tacticalSelectPoint(pointId) {
    const point = tacticalStrategy.points.find(item => item.id === pointId);
    if (!point) return;
    const label = prompt('Nom du point tactique :', point.label);
    if (label !== null && label.trim()) point.label = label.trim().slice(0, 120);
    saveTacticalState();
    renderTacticalAll();
}

function tacticalTogglePointGroup(pointId, groupId, checked) {
    const point = tacticalStrategy.points.find(item => item.id === pointId);
    if (!point) return;
    const ids = new Set(point.groupIds);
    if (checked) ids.add(groupId); else ids.delete(groupId);
    point.groupIds = [...ids];
    saveTacticalState();
    renderTacticalAll();
}

function tacticalDeletePoint(pointId) {
    tacticalStrategy.points = tacticalStrategy.points.filter(point => point.id !== pointId);
    saveTacticalState();
    renderTacticalAll();
}

function tacticalNewStrategy() {
    if (!confirm('Créer une nouvelle stratégie tactique ? La stratégie actuelle reste exportable avant de continuer.')) return;
    const name = prompt('Nom de la stratégie :', 'Nouvelle stratégie');
    if (!name || !name.trim()) return;
    tacticalStrategy = TacticalCore.createStrategy(name.trim(), settings.mapImagePath || '');
    tacticalActivePhaseId = tacticalStrategy.phases[0].id;
    tacticalActiveGroupId = tacticalStrategy.groups[0].id;
    tacticalFocusGroupId = 'all';
    saveTacticalState();
    renderTacticalAll();
}

function tacticalExportJSON() {
    const data = TacticalCore.normalizeStrategy(tacticalStrategy, settings.mapImagePath);
    const slug = data.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'strategie';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.strategy.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function tacticalImportJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(loadEvent) {
        try {
            tacticalStrategy = TacticalCore.normalizeStrategy(JSON.parse(loadEvent.target.result), settings.mapImagePath);
            tacticalActivePhaseId = tacticalStrategy.phases[0].id;
            tacticalActiveGroupId = tacticalStrategy.groups[0].id;
            tacticalFocusGroupId = 'all';
            if (tacticalStrategy.map && tacticalStrategy.map !== settings.mapImagePath) {
                settings.mapImagePath = tacticalStrategy.map;
                currentImageUrl = toUrl(tacticalStrategy.map);
                initLeafletMap();
            }
            saveTacticalState();
            renderTacticalAll();
        } catch (error) {
            alert('Ce fichier de stratégie est invalide.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function workspaceSave() {
    if (appWorkspace === 'tactical') tacticalExportJSON();
    else exportJSON();
}

function workspaceImport(event) {
    if (appWorkspace === 'tactical') tacticalImportJSON(event);
    else importJSON(event);
}

function workspaceSettings() {
    if (appWorkspace === 'route') {
        openSettingsModal();
        return;
    }
    const name = prompt('Nom de la stratégie :', tacticalStrategy.name);
    if (name && name.trim()) {
        tacticalStrategy.name = name.trim().slice(0, 100);
        saveTacticalState();
        renderTacticalAll();
    }
}

function tacticalPointTypeButton(type, meta) {
    const active = tacticalTool === 'point' && tacticalPointType === type;
    return `<button onclick="setTacticalTool('point','${type}')" class="tactical-tool-btn ${active ? 'tactical-tool-active' : ''}" title="${esc(meta.label)}">
        <i data-lucide="${meta.icon}" class="w-3.5 h-3.5"></i><span>${esc(meta.label)}</span>
    </button>`;
}

function renderTacticalSidebar() {
    const container = document.getElementById('tactical-sidebar-content');
    if (!container) return;
    const phase = tacticalActivePhase();
    const group = tacticalActiveGroup();

    const phaseOptions = tacticalStrategy.phases.map(item =>
        `<option value="${esc(item.id)}" ${item.id === tacticalActivePhaseId ? 'selected' : ''}>${esc(item.name)}</option>`
    ).join('');

    const groupCards = tacticalStrategy.groups.map(item => {
        const selected = item.id === tacticalActiveGroupId;
        const pathCount = (item.paths[tacticalActivePhaseId] || []).length;
        return `
            <div class="tactical-card ${selected ? 'tactical-card-active' : ''}" onclick="tacticalSelectGroup('${item.id}')">
                <div class="flex items-center gap-2">
                    <input type="color" value="${item.color}" onclick="event.stopPropagation()" onchange="tacticalSetGroupColor('${item.id}', this.value)" class="w-7 h-7 bg-transparent border-0 p-0 cursor-pointer">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-semibold truncate">${esc(item.name)}</div>
                        <div class="text-[10px] text-slate-500">${pathCount} point(s) · ${esc(phase.name)}</div>
                    </div>
                    <button onclick="event.stopPropagation(); tacticalRenameGroup('${item.id}')" class="text-slate-500 hover:text-slate-200 p-1"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                    <button onclick="event.stopPropagation(); tacticalDeleteGroup('${item.id}')" class="text-slate-500 hover:text-red-400 p-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>`;
    }).join('');

    const pointCards = tacticalStrategy.points
        .filter(point => point.phaseId === tacticalActivePhaseId)
        .map(point => {
            const meta = TacticalCore.POINT_TYPES[point.type] || TacticalCore.POINT_TYPES.objective;
            const checks = tacticalStrategy.groups.map(item =>
                `<label class="text-[9px] flex items-center gap-1 text-slate-400"><input type="checkbox" ${point.groupIds.includes(item.id) ? 'checked' : ''} onchange="tacticalTogglePointGroup('${point.id}','${item.id}',this.checked)">${esc(item.name)}</label>`
            ).join('');
            return `
                <div class="tactical-card">
                    <div class="flex items-center gap-2">
                        <i data-lucide="${meta.icon}" class="w-4 h-4 text-emerald-400"></i>
                        <button onclick="tacticalSelectPoint('${point.id}')" class="flex-1 text-left text-xs font-medium truncate">${esc(point.label)}</button>
                        <button onclick="tacticalDeletePoint('${point.id}')" class="text-slate-500 hover:text-red-400 p-1"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
                    </div>
                    <div class="grid grid-cols-2 gap-1 pt-1">${checks}</div>
                </div>`;
        }).join('');

    container.innerHTML = `
        <div class="p-3 border-b border-slate-800 space-y-2">
            <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Phases</span>
                <button onclick="tacticalAddPhase()" class="tactical-mini-btn"><i data-lucide="plus" class="w-3 h-3"></i> Phase</button>
            </div>
            <select onchange="tacticalSelectPhase(this.value)" class="tactical-select">${phaseOptions}</select>
        </div>

        <div class="p-3 border-b border-slate-800 space-y-2">
            <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Groupes</span>
                <button onclick="tacticalAddGroup()" class="tactical-mini-btn"><i data-lucide="plus" class="w-3 h-3"></i> Groupe</button>
            </div>
            <div class="space-y-2">${groupCards}</div>
        </div>

        <div class="p-3 border-b border-slate-800 space-y-2">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Outils</span>
            <button onclick="setTacticalTool('route')" class="tactical-tool-btn w-full ${tacticalTool === 'route' ? 'tactical-tool-active' : ''}">
                <i data-lucide="route" class="w-3.5 h-3.5"></i><span>Tracer pour ${esc(group.name)}</span>
            </button>
            <div class="grid grid-cols-2 gap-1">
                ${Object.entries(TacticalCore.POINT_TYPES).map(([type, meta]) => tacticalPointTypeButton(type, meta)).join('')}
            </div>
            <div class="flex gap-1">
                <button onclick="tacticalUndoPoint()" class="tactical-mini-btn flex-1"><i data-lucide="undo-2" class="w-3 h-3"></i> Dernier point</button>
                <button onclick="tacticalClearActiveRoute()" class="tactical-mini-btn flex-1"><i data-lucide="eraser" class="w-3 h-3"></i> Effacer tracé</button>
            </div>
        </div>

        <div class="p-3 space-y-2 flex-1 overflow-y-auto">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Points tactiques</span>
            <div class="space-y-2">${pointCards || '<p class="text-[10px] text-slate-500">Aucun point tactique dans cette phase.</p>'}</div>
        </div>
    `;

    document.getElementById('tactical-focus-select').innerHTML =
        '<option value="all">Vue globale</option>' +
        tacticalStrategy.groups.map(item =>
            `<option value="${item.id}" ${item.id === tacticalFocusGroupId ? 'selected' : ''}>Focus : ${esc(item.name)}</option>`
        ).join('');

    if (window.lucide) lucide.createIcons();
}
