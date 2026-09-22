
function prevStep() {
    if (steps.length === 0) return;
    if (currentStepIndex > 0) {
        currentStepIndex--;
        saveStateToLocalStorage();
        renderAll();
    }
}


function nextStep() {
    if (steps.length === 0) return;
    if (currentStepIndex < steps.length - 1) {
        currentStepIndex++;
        saveStateToLocalStorage();
        renderAll();
    }
}


function onSliderChange(val) {
    currentStepIndex = parseInt(val, 10);
    saveStateToLocalStorage();
    renderAll();
}


function setMode(mode) {
    currentMode = mode;
    const editBtn = document.getElementById('mode-edit-btn');
    const playBtn = document.getElementById('mode-play-btn');
    const hint = document.getElementById('edit-hint');

    if (mode === 'edit') {
        editBtn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 bg-emerald-600 text-white shadow-lg";
        playBtn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 text-slate-400 hover:text-slate-200";
        hint.classList.remove('hidden');
    } else {
        playBtn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 bg-emerald-600 text-white shadow-lg";
        editBtn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 text-slate-400 hover:text-slate-200";
        hint.classList.add('hidden');
    }

    renderAll();
}


function toggleAutoCenter() {
    autoCenter = !autoCenter;
    const btn = document.getElementById('autocenter-toggle');
    if (autoCenter) {
        btn.className = "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-1.5 rounded-lg text-xs flex items-center space-x-1 hover:bg-emerald-500/20 transition shrink-0";
        if (currentStepIndex >= 0) centerMapOnStep(currentStepIndex);
    } else {
        btn.className = "bg-slate-800 border border-slate-700 text-slate-400 p-1.5 rounded-lg text-xs flex items-center space-x-1 hover:bg-slate-700 transition shrink-0";
    }
}
