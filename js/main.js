
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowLeft') {
            if (appWorkspace === 'tactical' && tacticalMode === 'present') tacticalStepPhase(-1);
            else if (appWorkspace === 'route') prevStep();
        } else if (e.key === 'ArrowRight') {
            if (appWorkspace === 'tactical' && tacticalMode === 'present') tacticalStepPhase(1);
            else if (appWorkspace === 'route') nextStep();
        } else if (e.key.toLowerCase() === 's') {
            workspaceSettings();
        }
    });
}

window.onload = async function() {
    lucide.createIcons();
    loadStateFromLocalStorage();
    await Promise.all([scanMapsFolder(), scanRoutesFolder()]);
    resolveCurrentMap();
    routeWorkspaceMapPath = settings.mapImagePath || '';
    loadTacticalState();
    const wantedRoute = new URLSearchParams(location.search).get('route');
    if (wantedRoute) {
        try {
            const route = await fetchSharedRoute(wantedRoute);
            if (confirmOverwrite(route)) applyRoute(route);
        } catch (e) {
            alert(`Itinéraire « ${wantedRoute} » introuvable.\nS'il vient d'être ajouté, attends une minute que GitHub le publie.`);
        }
    }
    initLeafletMap();
    setupKeyboardShortcuts();
    window.addEventListener('resize', function() {
        if (map) map.invalidateSize();
    });
};
