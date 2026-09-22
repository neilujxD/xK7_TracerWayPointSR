const TACTICAL_STORAGE_KEY = 'route_planner_tactical_strategy';
const TACTICAL_UI_KEY = 'route_planner_tactical_ui';

function loadTacticalState() {
    try {
        const raw = localStorage.getItem(TACTICAL_STORAGE_KEY);
        if (raw) tacticalStrategy = TacticalCore.normalizeStrategy(JSON.parse(raw), settings.mapImagePath);
    } catch (error) {
        console.warn('Stratégie tactique locale invalide ignorée.', error);
    }

    if (!tacticalStrategy.map) tacticalStrategy.map = settings.mapImagePath || '';

    try {
        const ui = JSON.parse(localStorage.getItem(TACTICAL_UI_KEY) || '{}');
        tacticalActivePhaseId = tacticalStrategy.phases.some(p => p.id === ui.phaseId)
            ? ui.phaseId : tacticalStrategy.phases[0].id;
        tacticalActiveGroupId = tacticalStrategy.groups.some(g => g.id === ui.groupId)
            ? ui.groupId : tacticalStrategy.groups[0].id;
        tacticalFocusGroupId = ui.focusGroupId === 'all' || tacticalStrategy.groups.some(g => g.id === ui.focusGroupId)
            ? (ui.focusGroupId || 'all') : 'all';
    } catch (error) {
        tacticalActivePhaseId = tacticalStrategy.phases[0].id;
        tacticalActiveGroupId = tacticalStrategy.groups[0].id;
        tacticalFocusGroupId = 'all';
    }
}

function saveTacticalState() {
    try {
        localStorage.setItem(TACTICAL_STORAGE_KEY, JSON.stringify(tacticalStrategy));
        localStorage.setItem(TACTICAL_UI_KEY, JSON.stringify({
            phaseId: tacticalActivePhaseId,
            groupId: tacticalActiveGroupId,
            focusGroupId: tacticalFocusGroupId
        }));
    } catch (error) {
        console.warn('Impossible de sauvegarder la stratégie tactique.', error);
    }
}
