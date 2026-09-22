

// ----- Touches multimédia globales (Media Session) -----
// Le navigateur transmet les touches "Piste suivante / précédente" à la page qui joue un son,
// même quand une autre application (le jeu) a le focus.
let globalKeysOn = false;

let keepAliveAudio = null;


// Petit son de 20 Hz à très faible niveau (inaudible), en boucle, pour rester "lecteur média actif"
// En data: URI plutôt qu'en blob: URL : ça évite les soucis de cycle de vie que certains
// navigateurs ont avec les blobs (source coupée en cours de lecture).
function makeQuietWavUrl() {
    const rate = 8000, n = rate * 2;              // 2 secondes = 40 périodes entières (boucle sans coupure)
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
        v.setInt16(44 + i * 2, Math.round(60 * Math.sin(2 * Math.PI * 20 * i / rate)), true);
    }
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(binary);
}


// Le titre de la "piste" = la note de l'étape (visible dans le volet média de Windows)
function updateMediaSession() {
    if (!globalKeysOn || !('mediaSession' in navigator)) return;
    const cur = steps[currentStepIndex];
    const note = cur && cur.note ? cur.note.trim() : '';
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: cur ? (note || cur.title || `Étape ${currentStepIndex + 1}`) : 'Aucune étape',
            artist: steps.length ? `Étape ${currentStepIndex + 1} / ${steps.length}` : '',
            album: currentRouteName
        });
    } catch (e) { /* non bloquant */ }
}


function styleGlobalKeysButton() {
    const btn = document.getElementById('gamekeys-toggle');
    const label = document.getElementById('gamekeys-label');
    if (!btn) return;
    btn.className = globalKeysOn
        ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-1.5 rounded-lg text-xs flex items-center space-x-1 hover:bg-emerald-500/20 transition shrink-0"
        : "bg-slate-800 border border-slate-700 text-slate-400 p-1.5 rounded-lg text-xs flex items-center space-x-1 hover:bg-slate-700 transition shrink-0";
    label.innerText = globalKeysOn ? 'Touches jeu : ON' : 'Touches jeu';
}


let togglingKeys = false;   // évite deux bascules en même temps (double-clic, etc.)

async function toggleGlobalKeys() {
    if (togglingKeys) return;
    if (!('mediaSession' in navigator)) {
        alert("Ce navigateur ne gère pas les touches multimédia (Media Session).");
        return;
    }
    togglingKeys = true;
    const setHandler = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) {} };

    if (!globalKeysOn) {
        let started = false;
        for (let attempt = 0; attempt < 2 && !started; attempt++) {
            try {
                if (!keepAliveAudio) {
                    keepAliveAudio = new Audio(makeQuietWavUrl());
                    keepAliveAudio.loop = true;
                }
                await keepAliveAudio.play();     // doit venir d'un clic : c'est le cas ici
                started = true;
            } catch (e) {
                // "aborted by the user agent" arrive parfois sur le tout premier essai
                // (lecture interrompue par le navigateur) : on retente une fois avant d'alerter.
                if (attempt === 0) { await new Promise(r => setTimeout(r, 150)); continue; }
                alert("Impossible de démarrer le son de veille : " + e.message + "\nRéessaie en cliquant à nouveau sur « Touches jeu ».");
            }
        }
        if (!started) { togglingKeys = false; styleGlobalKeysButton(); return; }

        globalKeysOn = true;
        setHandler('previoustrack', () => prevStep());
        setHandler('nexttrack', () => nextStep());
        setHandler('previousslide', () => prevStep());
        setHandler('nextslide', () => nextStep());
        setHandler('pause', () => { keepAliveAudio.play().catch(() => {}); });   // on reste actif même si on appuie sur Pause
        navigator.mediaSession.playbackState = 'playing';
        updateMediaSession();
    } else {
        globalKeysOn = false;
        if (keepAliveAudio) keepAliveAudio.pause();
        ['previoustrack', 'nexttrack', 'previousslide', 'nextslide', 'pause'].forEach(a => setHandler(a, null));
        try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } catch (e) {}
    }
    togglingKeys = false;
    styleGlobalKeysButton();
}
