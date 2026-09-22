
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowLeft') {
            prevStep();
        } else if (e.key === 'ArrowRight') {
            nextStep();
        } else if (e.key.toLowerCase() === 's') {
            openSettingsModal();
        }
    });
}

window.onload = async function() {
    lucide.createIcons();
    loadStateFromLocalStorage();
    await Promise.all([scanMapsFolder(), scanRoutesFolder()]);
    resolveCurrentMap();
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
