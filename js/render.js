
function renderAll() {
    // Update Active Route Badge
    document.getElementById('active-route-badge').innerText = currentRouteName;

    // Render Sidebar List
    renderSidebarList();

    // Update Opacity Preview Bar
    renderOpacityPreviewBar();
    updateFastNavigationButtons();

    // Update Progress Slider
    const range = document.getElementById('progress-range');
    range.max = Math.max(0, steps.length - 1);
    range.value = currentStepIndex >= 0 ? currentStepIndex : 0;

    // Clear existing map layers
    stepMarkers.forEach(m => map.removeLayer(m));
    lineSubSegments.forEach(s => map.removeLayer(s));
    bezierHandles.forEach(h => map.removeLayer(h));
    handleGuides.forEach(g => map.removeLayer(g));
    searchZoneLayers.forEach(z => map.removeLayer(z));

    stepMarkers = [];
    lineSubSegments = [];
    bezierHandles = [];
    handleGuides = [];
    searchZoneLayers = [];

    if (steps.length === 0) {
        renderStepBanner();
        return;
    }

    // 1. Render Bézier Curved Lines with Smooth Opacity Gradient Interpolation
    for (let i = 0; i < steps.length - 1; i++) {
        if (!inRenderWindow(i) && !inRenderWindow(i + 1)) continue;   // trop loin de l'étape courante : pas dessiné

        const startStep = steps[i];
        const endStep = steps[i + 1];

        const p0 = [startStep.lat, startStep.lng];
        const p2 = [endStep.lat, endStep.lng];

        // Determine Quadratic Control Point (Default: midpoint)
        let p1 = [ (p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2 ];
        if (startStep.controlLat !== null && startStep.controlLng !== null) {
            p1 = [startStep.controlLat, startStep.controlLng];
        }

        const opStart = calculateStepOpacity(i);
        const opEnd = calculateStepOpacity(i + 1);
        const isCurrentSegment = (i === currentStepIndex || i === currentStepIndex - 1);
        const qcolor = questColorOf(startStep);

        if (startStep.tpNext) {
            // Téléportation : pas un chemin parcouru, une ligne droite hachurée + éclair au milieu
            const tpLine = L.polyline([p0, p2], {
                color: TP_COLOR,
                weight: isCurrentSegment ? 4 : 3,
                opacity: Math.max(opStart, opEnd, 0.35),
                dashArray: '2, 9',
                lineCap: 'round'
            }).addTo(map);
            tpLine.on('click', () => { currentStepIndex = i; saveStateToLocalStorage(); renderAll(); });
            lineSubSegments.push(tpLine);

            const mid = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
            const boltIcon = L.divIcon({
                html: `<svg width="18" height="18" viewBox="-9 -9 18 18"><circle r="8" fill="${TP_COLOR}" stroke="#1f1f1f" stroke-width="1.5"/><g style="color:#fff">${POI_ICONS.teleporteurs}</g></svg>`,
                className: 'tp-bolt-icon', iconSize: [18, 18], iconAnchor: [9, 9]
            });
            const boltMarker = L.marker(mid, { icon: boltIcon, interactive: false }).addTo(map);
            lineSubSegments.push(boltMarker);
        } else {
            // Sample curve into subsegments each with its interpolated opacity (0% -> 100%)
            // Moins d'échantillons pour les segments loin de l'étape courante : la finesse de la
            // courbe ne s'y voit de toute façon presque plus, et ça évite des centaines de lignes inutiles.
            const samples = isCurrentSegment ? 24 : (inEditToolsWindow(i) ? 16 : 8);
            const subSegments = sampleQuadraticBezierSegments(p0, p1, p2, opStart, opEnd, samples);
            const lineColor = isCurrentSegment ? '#22c55e' : (qcolor === 'main' ? QUEST_COLORS.main : qcolor === 'side' ? QUEST_COLORS.side : qcolor === 'none' ? '#38bdf8' : QUEST_COLORS.main);

            subSegments.forEach((seg, si) => {
                if (seg.opacity > 0) {
                    // "Les deux quêtes" : la ligne alterne jaune/turquoise (effet rayé)
                    const segColor = (qcolor === 'both' && !isCurrentSegment)
                        ? (si % 2 === 0 ? QUEST_COLORS.main : QUEST_COLORS.side)
                        : lineColor;
                    const line = L.polyline([seg.p1, seg.p2], {
                        color: segColor,
                        weight: isCurrentSegment ? 5 : 3.5,
                        opacity: seg.opacity,
                        lineCap: 'round'
                    }).addTo(map);
                    line.on('click', () => { currentStepIndex = i; saveStateToLocalStorage(); renderAll(); });
                    lineSubSegments.push(line);
                }
            });

        }

        // Cible de clic élargie et invisible, en mode édition, pour insérer une étape sur le tracé
        // (uniquement tout près de l'étape courante : coûteux, et rarement utile plus loin)
        if (currentMode === 'edit' && !startStep.tpNext && inEditToolsWindow(i)) {
            const hitLine = L.polyline([p0, p1, p2], { color: '#000', weight: 16, opacity: 0 }).addTo(map);
            hitLine.on('click', (ev) => {
                L.DomEvent.stopPropagation(ev);
                insertStepAfter(i, ev.latlng.lat, ev.latlng.lng);
            });
            lineSubSegments.push(hitLine);
        }

        // Edit Mode: Render Bézier Handle Control Point and Guide Lines
        if (currentMode === 'edit' && !startStep.tpNext && inEditToolsWindow(i)) {
            // Guide lines from start to control and control to end
            const guideLine = L.polyline([p0, p1, p2], {
                color: '#f59e0b',
                weight: 1.5,
                dashArray: '4, 4',
                opacity: 0.6
            }).addTo(map);
            handleGuides.push(guideLine);

            // Draggable Handle Icon
            const handleIcon = L.divIcon({
                className: 'bezier-handle-icon',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });

            const handleMarker = L.marker([p1[0], p1[1]], {
                icon: handleIcon,
                draggable: true,
                title: `Poignée de courbe (Étape ${i + 1} → ${i + 2})`
            }).addTo(map);

            handleMarker.on('drag', function(e) {
                const newPos = e.target.getLatLng();
                startStep.controlLat = newPos.lat;
                startStep.controlLng = newPos.lng;
                
                // Live redraw guide lines
                guideLine.setLatLngs([p0, [newPos.lat, newPos.lng], p2]);
            });

            handleMarker.on('dragend', function() {
                saveStateToLocalStorage();
                renderAll();
            });

            bezierHandles.push(handleMarker);
        }
    }

    // 2. Render Search Zones Linked to Steps (Zones de Fouille)
    steps.forEach((step, index) => {
        if (!inRenderWindow(index)) return;
        const stepOpacity = calculateStepOpacity(index);

        if (step.hasZone && stepOpacity > 0) {
            const isCurrent = (index === currentStepIndex);

            const circleZone = L.circle([step.lat, step.lng], {
                radius: step.zoneRadius || 250,
                color: isCurrent ? '#22c55e' : '#f59e0b',
                weight: isCurrent ? 2.5 : 1.5,
                dashArray: isCurrent ? '8, 6' : '4, 4',
                fillColor: isCurrent ? '#22c55e' : '#f59e0b',
                fillOpacity: stepOpacity * 0.2,
                opacity: stepOpacity * 0.8,
                className: isCurrent ? 'search-zone-pulse' : ''
            }).addTo(map);

            // Click zone to select step
            circleZone.on('click', () => {
                currentStepIndex = index;
                saveStateToLocalStorage();
                renderAll();
            });

            circleZone._stepIndex = index;
            searchZoneLayers.push(circleZone);
        }
    });

    // 3. Render Step Point Markers
    steps.forEach((step, index) => {
        if (!inRenderWindow(index)) return;
        const opacity = calculateStepOpacity(index);
        if (opacity <= 0) return; // Hidden completely if hideOutOfScope

        const isCurrent = (index === currentStepIndex);
        const qcolor = questColorOf(step);
        const size = isCurrent ? 40 : 32;               // px
        const r = 13;                                    // rayon du disque en unités SVG (viewBox 32x32)

        // Disque de couleur : uni (jaune/turquoise/gris) ou coupé en deux si les deux quêtes sont cochées
        let discSvg;
        if (qcolor === 'both') {
            discSvg = `<path d="M16 3 A13 13 0 0 1 16 29 Z" fill="${QUEST_COLORS.main}"/>` +
                      `<path d="M16 29 A13 13 0 0 1 16 3 Z" fill="${QUEST_COLORS.side}"/>` +
                      `<circle cx="16" cy="16" r="${r}" fill="none" stroke="#1f1f1f" stroke-width="2"/>`;
        } else {
            const fill = qcolor === 'main' ? QUEST_COLORS.main : qcolor === 'side' ? QUEST_COLORS.side : QUEST_COLORS.none;
            discSvg = `<circle cx="16" cy="16" r="${r}" fill="${fill}" stroke="#1f1f1f" stroke-width="2"/>`;
        }
        const numColor = (qcolor === 'main' || qcolor === 'both') ? '#1f1f1f' : (qcolor === 'side' ? '#08312b' : '#0f172a');

        // Badge : type de point d'intérêt sous l'étape (plume / donjon / téléporteur...), au coin haut-droit
        const badge = findMarkerBadgeForStep(step.lat, step.lng);
        const badgeSvg = badge ? `
            <svg width="16" height="16" viewBox="-8 -8 16 16" x="22" y="0" style="overflow:visible">
                <circle r="8" fill="${badge.color}" stroke="#1f1f1f" stroke-width="1.4"/>
                <g style="color:#fff">${POI_ICONS[badge.id] || ''}</g>
            </svg>` : '';

        // Petit repère "Activer TP" (juste passer à côté, sans ligne de téléportation)
        const tpActBadge = step.tpActivate ? `
            <svg width="14" height="14" viewBox="-7 -7 14 14" x="-2" y="22" style="overflow:visible">
                <circle r="7" fill="${TP_COLOR}" stroke="#1f1f1f" stroke-width="1.3"/>
                <g style="color:#fff">${POI_ICONS.teleporteurs}</g>
            </svg>` : '';

        const markerHtml = `
            <div style="opacity: ${opacity}; transition: opacity 0.3s ease;" class="relative group flex items-center justify-center">
                ${isCurrent ? '<div class="absolute w-12 h-12 rounded-full bg-white/25 active-step-ping"></div>' : ''}
                <svg width="${size}" height="${size}" viewBox="0 0 32 32" class="drop-shadow-md" style="overflow:visible">
                    ${isCurrent ? '<circle cx="16" cy="16" r="15" fill="none" stroke="#fff" stroke-width="3"/>' : ''}
                    ${discSvg}
                    <text x="16" y="17" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="800" fill="${numColor}">${index + 1}</text>
                    ${badgeSvg}
                    ${tpActBadge}
                </svg>
                ${(step.note || '').trim() ? `
                    <div class="absolute left-10 w-max max-w-[240px] whitespace-normal break-words leading-snug bg-slate-900/90 text-slate-100 text-[11px] font-semibold px-2 py-1 rounded-md border border-slate-700 shadow-xl pointer-events-none">
                        ${esc(step.note.trim())} ${step.hasZone ? '<span class="text-amber-400 ml-1">🔍 Zone</span>' : ''}
                    </div>
                ` : ''}
            </div>
        `;

        const customIcon = L.divIcon({
            html: markerHtml,
            className: 'custom-map-marker',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });

        const marker = L.marker([step.lat, step.lng], {
            icon: customIcon,
            draggable: currentMode === 'edit'
        }).addTo(map);

        marker.on('click', () => {
            currentStepIndex = index;
            saveStateToLocalStorage();
            renderAll();
            if (autoCenter) centerMapOnStep(index);
        });

        if (currentMode === 'edit') {
            marker.on('dragend', (e) => {
                const p = e.target.getLatLng();
                moveStep(index, p.lat, p.lng);
            });
        }

        stepMarkers.push(marker);
    });

    if (autoCenter && currentStepIndex >= 0 && currentStepIndex < steps.length) {
        centerMapOnStep(currentStepIndex);
    }

    renderStepBanner();
}


function renderSidebarList() {
    const container = document.getElementById('steps-container');
    document.getElementById('total-steps-count').innerText = steps.length;

    if (steps.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 px-4">
                <div class="w-12 h-12 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
                    <i data-lucide="map-pin-off" class="w-6 h-6"></i>
                </div>
                <p class="text-xs text-slate-400 font-medium">Aucun point d'étape</p>
                <p class="text-[11px] text-slate-500 mt-1">Cliquez sur la carte pour commencer votre itinéraire.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = '';

    steps.forEach((step, index) => {
        const isSelected = (index === currentStepIndex);

        const item = document.createElement('div');
        item.className = `p-2.5 rounded-xl border transition-all duration-150 cursor-pointer flex flex-col space-y-2 ${
            isSelected 
            ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-100 shadow-md' 
            : 'bg-slate-800/50 hover:bg-slate-800 border-slate-800 text-slate-300'
        }`;

        item.onclick = () => {
            currentStepIndex = index;
            saveStateToLocalStorage();
            renderAll();
        };

        const delta = index - currentStepIndex;
        const tagLabel = delta === 0 ? 'T0 (100%)' : `T${delta > 0 ? '+' : ''}${delta}`;

        const hasNextSegment = index < steps.length - 1;

        item.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                    <span class="w-5 h-5 rounded-md ${isSelected ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-700 text-slate-300'} flex items-center justify-center text-[10px] font-mono shrink-0">
                        ${index + 1}
                    </span>
                    <input type="text" value="${esc(step.title)}" 
                        onclick="event.stopPropagation()"
                        onchange="updateStepDetails(${index}, 'title', this.value)"
                        class="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-emerald-500 focus:bg-slate-950/50 text-xs font-medium focus:outline-none px-1 rounded text-slate-100 w-36 truncate">
                </div>
                <div class="flex items-center space-x-1 shrink-0">
                    <span class="text-[9px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-950 text-slate-500'}">
                        ${tagLabel}
                    </span>
                    <button onclick="removeStep(${index}, event)" class="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10" title="Supprimer l'étape">
                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>

            <input type="text" placeholder="+ Note / Action (ex: Prendre TP, Parchm...)" value="${esc(step.note)}" 
                onclick="event.stopPropagation()"
                onchange="updateStepDetails(${index}, 'note', this.value)"
                class="bg-slate-950/40 text-[11px] text-slate-400 border border-slate-800/80 rounded px-2 py-1 focus:outline-none focus:border-slate-700">

            <!-- Quête suivie + téléportation -->
            <div class="flex items-center flex-wrap gap-1 text-[10px]" onclick="event.stopPropagation()">
                <label class="flex items-center space-x-1 px-1.5 py-0.5 rounded border cursor-pointer" style="${step.questMain ? `border-color:${QUEST_COLORS.main}99;color:${QUEST_COLORS.main};background:${QUEST_COLORS.main}1a` : 'border-color:#1e293b;color:#64748b'}">
                    <input type="checkbox" ${step.questMain ? 'checked' : ''} onchange="updateStepDetails(${index}, 'questMain', this.checked)">
                    <span>Principale</span>
                </label>
                <label class="flex items-center space-x-1 px-1.5 py-0.5 rounded border cursor-pointer" style="${step.questSide ? `border-color:${QUEST_COLORS.side}99;color:${QUEST_COLORS.side};background:${QUEST_COLORS.side}1a` : 'border-color:#1e293b;color:#64748b'}" title="Reste coché pour les prochaines étapes tant que tu ne le décoches pas">
                    <input type="checkbox" ${step.questSide ? 'checked' : ''} onchange="updateStepDetails(${index}, 'questSide', this.checked)">
                    <span>Secondaire</span>
                </label>
                ${hasNextSegment ? `
                <label class="flex items-center space-x-1 px-1.5 py-0.5 rounded border cursor-pointer" style="${step.tpNext ? `border-color:${TP_COLOR}99;color:${TP_COLOR};background:${TP_COLOR}1a` : 'border-color:#1e293b;color:#64748b'}" title="Ligne hachurée vers l'étape suivante">
                    <input type="checkbox" ${step.tpNext ? 'checked' : ''} onchange="updateStepDetails(${index}, 'tpNext', this.checked)">
                    <span>⚡ TP suivant</span>
                </label>` : ''}
                <label class="flex items-center space-x-1 px-1.5 py-0.5 rounded border cursor-pointer" style="${step.tpActivate ? `border-color:${TP_COLOR}99;color:${TP_COLOR};background:${TP_COLOR}1a` : 'border-color:#1e293b;color:#64748b'}" title="Passage à proximité qui active le TP, sans ligne">
                    <input type="checkbox" ${step.tpActivate ? 'checked' : ''} onchange="updateStepDetails(${index}, 'tpActivate', this.checked)">
                    <span>⚡ Activer TP</span>
                </label>
            </div>

            <!-- Actions Bar for Search Zone & Curve control -->
            <div class="pt-1 flex items-center justify-between border-t border-slate-800/60 text-[10px]">
                
                <!-- Zone de fouille Toggle -->
                <button onclick="toggleStepSearchZone(${index}, event)" class="flex items-center space-x-1 px-2 py-0.5 rounded border ${step.hasZone ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}" title="Associer une zone de fouille à cette étape">
                    <i data-lucide="scan" class="w-3 h-3"></i>
                    <span>${step.hasZone ? 'Zone Active' : '+ Zone Fouille'}</span>
                </button>

                ${hasNextSegment ? `
                    <button onclick="resetBezierCurve(${index}, event)" class="text-slate-500 hover:text-amber-400 flex items-center space-x-0.5 px-1.5 py-0.5 rounded hover:bg-amber-500/10" title="Réinitialiser la courbe vers l'étape suivante">
                        <i data-lucide="spline" class="w-3 h-3"></i>
                        <span>Reset courbe</span>
                    </button>
                ` : ''}
            </div>

            ${step.hasZone ? `
                <div class="bg-slate-950/80 p-2 rounded-lg border border-amber-500/30 flex items-center justify-between space-x-2 text-[10px]" onclick="event.stopPropagation()">
                    <span class="text-amber-400 font-medium shrink-0">Rayon zone :</span>
                    <input type="range" min="50" max="1000" step="25" value="${step.zoneRadius || 250}" oninput="liveZoneRadius(${index}, this)" onchange="updateStepZoneRadius(${index}, this.value)" class="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-500">
                    <span class="text-slate-300 font-mono shrink-0">${step.zoneRadius || 250} px</span>
                </div>
            ` : ''}
        `;

        container.appendChild(item);
    });

    lucide.createIcons();
}


function renderOpacityPreviewBar() {
    const bar = document.getElementById('opacity-preview-bar');
    document.getElementById('opacity-info-label').innerText = `T-${settings.maxPastSteps} à T+${settings.maxFutureSteps}`;

    bar.innerHTML = `
        <div class="bg-slate-800 p-1 rounded text-slate-400">T-${settings.maxPastSteps}</div>
        <div class="bg-slate-800 p-1 rounded text-slate-300">T-1</div>
        <div class="bg-emerald-500/20 border border-emerald-500/50 p-1 rounded text-emerald-400 font-bold">T0</div>
        <div class="bg-slate-800 p-1 rounded text-slate-300">T+1</div>
        <div class="bg-slate-800 p-1 rounded text-slate-400">T+${settings.maxFutureSteps}</div>
    `;
}


function renderStepBanner() {
    const badge = document.getElementById('step-badge');
    const titleEl = document.getElementById('current-step-title');
    const noteEl = document.getElementById('current-step-note');

    if (steps.length === 0 || currentStepIndex === -1) {
        badge.innerText = 'T - 0';
        titleEl.innerText = 'Aucune étape créée';
        noteEl.innerText = 'Cliquez sur la carte ou ouvrez les paramètres.';
        return;
    }

    const current = steps[currentStepIndex];
    badge.innerText = `T - ${currentStepIndex + 1}`;
    titleEl.innerText = current.title + (current.hasZone ? ' (Zone de fouille active)' : '');
    noteEl.innerText = current.note ? `Note : ${current.note}` : 'Aucune note particulière';
}
