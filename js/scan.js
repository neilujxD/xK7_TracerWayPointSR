
// Méthode 1 : page d'index du dossier (serveur local : python -m http.server, Live Server...)
async function listFromDirectoryIndex(dir, extRe) {
    try {
        const res = await fetch(dir, { cache: 'no-store' });
        if (!res.ok) return [];
        if (!(res.headers.get('content-type') || '').includes('text/html')) return [];
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        return [...doc.querySelectorAll('a[href]')].map(a => {
            const href = a.getAttribute('href').split('?')[0].split('#')[0];
            try { return decodeURIComponent(href.split('/').filter(Boolean).pop() || ''); }
            catch (e) { return ''; }
        }).filter(n => extRe.test(n));
    } catch (e) { return []; }
}


// Méthode 2 : API GitHub (quand le site est hébergé sur GitHub Pages : user.github.io/repo/)
async function listFromGitHubApi(dir, extRe) {
    if (!location.hostname.endsWith('.github.io')) return [];
    const owner = location.hostname.split('.')[0];
    const segs = location.pathname.split('/').filter(Boolean);
    if (segs.length && segs[segs.length - 1].includes('.')) segs.pop(); // retire index.html
    const candidates = [];
    if (segs.length) candidates.push({ repo: segs[0], sub: segs.slice(1) });
    candidates.push({ repo: `${owner}.github.io`, sub: segs });
    for (const c of candidates) {
        const path = [...c.sub, dir.replace(/\/$/, '')].join('/');
        try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${c.repo}/contents/${path}`,
                { headers: { Accept: 'application/vnd.github+json' } });
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data)) {
                return data.filter(f => f.type === 'file' && extRe.test(f.name)).map(f => f.name);
            }
        } catch (e) { /* on essaie le candidat suivant */ }
    }
    return [];
}


// Méthode 3 (secours) : fichier <dossier>/<manifestFile> contenant  window.<globalName> = ["a", "b"];
function listFromManifest(dir, manifestFile, globalName, extRe) {
    return new Promise(resolve => {
        delete window[globalName];
        const sc = document.createElement('script');
        sc.src = dir + manifestFile + '?t=' + Date.now();
        sc.onload = () => {
            const list = window[globalName];
            sc.remove();
            resolve(Array.isArray(list) ? list.filter(n => typeof n === 'string' && extRe.test(n)) : []);
        };
        sc.onerror = () => { sc.remove(); resolve([]); };
        document.head.appendChild(sc);
    });
}


async function scanFolder(dir, extRe, manifestFile, globalName) {
    let names = [];
    let method = '';
    if (location.protocol !== 'file:') {
        names = await listFromDirectoryIndex(dir, extRe);
        if (names.length) method = 'dossier';
        if (!names.length) {
            names = await listFromGitHubApi(dir, extRe);
            if (names.length) method = 'GitHub';
        }
    }
    if (!names.length) {
        names = await listFromManifest(dir, manifestFile, globalName, extRe);
        if (names.length) method = manifestFile;
    }
    names = [...new Set(names)].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return { names, method };
}


async function scanMapsFolder() {
    const r = await scanFolder(MAPS_DIR, MAP_EXT, 'maps.js', 'MAPS_MANIFEST');
    availableMaps = r.names;
    scanMethod = r.method;
}


async function scanRoutesFolder() {
    const r = await scanFolder(ROUTES_DIR, ROUTE_EXT, 'routes.js', 'ROUTES_MANIFEST');
    availableRoutes = r.names;
    routesScanMethod = r.method;
}


// Choisit la carte à afficher : celle sauvegardée si elle existe, sinon la première du dossier
function resolveCurrentMap() {
    const paths = availableMaps.map(n => MAPS_DIR + n);
    if (paths.length && !paths.includes(settings.mapImagePath)) {
        settings.mapImagePath = paths[0];
        localStorage.removeItem('route_planner_map_center');
        localStorage.removeItem('route_planner_map_zoom');
    }
    currentImageUrl = settings.mapImagePath ? toUrl(settings.mapImagePath) : '';
}
