function clearNavigationCarry() {
    navigationCarryRange = null;
}


function fastJumpSize() {
    const future = Number.parseInt(settings.maxFutureSteps, 10);
    if (!Number.isFinite(future)) return 1;
    // T+x compte les étapes futures, auxquelles s'ajoute T0 : T+3 = bloc de 4 étapes.
    return Math.max(1, future + 1);
}


function updateFastNavigationButtons() {
    const amount = fastJumpSize();
    const prev = document.getElementById('fast-prev-btn');
    const next = document.getElementById('fast-next-btn');
    const prevLabel = document.getElementById('fast-prev-label');
    const nextLabel = document.getElementById('fast-next-label');

    if (prevLabel) prevLabel.innerText = `-${amount}`;
    if (nextLabel) nextLabel.innerText = `+${amount}`;

    [prev, next].forEach(button => {
        if (!button) return;
        button.disabled = steps.length === 0;
        button.classList.toggle('opacity-40', button.disabled);
        button.classList.toggle('cursor-not-allowed', button.disabled);
    });

    if (prev) prev.title = `Reculer d'un bloc de ${amount} étape(s) (T0 + T+x)`;
    if (next) next.title = `Avancer d'un bloc de ${amount} étape(s) (T0 + T+x)`;
}


function jumpByFutureWindow(direction) {
    if (!steps.length || currentStepIndex < 0) return;

    const amount = fastJumpSize();
    if (amount <= 0) return;

    const previous = currentStepIndex;
    const target = Math.max(0, Math.min(steps.length - 1, previous + direction * amount));
    if (target === previous) return;

    if (direction > 0) {
        navigationCarryRange = {
            start: previous,
            end: target - 1,
            target
        };
    } else {
        navigationCarryRange = null;
    }

    currentStepIndex = target;
    saveStateToLocalStorage();
    renderAll();
}


function prevStep() {
    if (steps.length === 0) return;
    if (currentStepIndex > 0) {
        clearNavigationCarry();
        currentStepIndex--;
        saveStateToLocalStorage();
        renderAll();
    }
}


function nextStep() {
    if (steps.length === 0) return;
    if (currentStepIndex < steps.length - 1) {
        clearNavigationCarry();
        currentStepIndex++;
        saveStateToLocalStorage();
        renderAll();
    }
}


function onSliderChange(val) {
    clearNavigationCarry();
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
