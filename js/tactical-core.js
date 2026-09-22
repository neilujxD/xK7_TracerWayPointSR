/*
 * Tactical Map core model.
 * Pure helpers only: no DOM or Leaflet dependency.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TacticalCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = 1;
    const GROUP_PALETTE = Object.freeze([
        '#ef4444', '#3b82f6', '#22c55e', '#eab308',
        '#a855f7', '#f97316', '#06b6d4', '#ec4899'
    ]);
    const POINT_TYPES = Object.freeze({
        engage: { label: 'Combat', icon: 'swords' },
        regroup: { label: 'Regroupement', icon: 'users' },
        wait: { label: 'Temporisation', icon: 'hourglass' },
        retreat: { label: 'Repli', icon: 'undo-2' },
        defend: { label: 'Défense', icon: 'shield' },
        objective: { label: 'Objectif', icon: 'flag' },
        alert: { label: 'Attention', icon: 'triangle-alert' }
    });

    function id(prefix) {
        return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function createStrategy(name, mapPath) {
        const phaseId = id('phase');
        const groupId = id('group');
        return {
            version: VERSION,
            name: String(name || 'Nouvelle stratégie').slice(0, 100),
            map: typeof mapPath === 'string' ? mapPath : '',
            phases: [{ id: phaseId, name: 'Phase 1' }],
            groups: [{
                id: groupId,
                name: 'Groupe Rouge',
                color: GROUP_PALETTE[0],
                paths: { [phaseId]: [] }
            }],
            points: []
        };
    }

    function normalizePoint(raw, validGroups, validPhases) {
        if (!raw || typeof raw !== 'object') return null;
        if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
        const phaseId = validPhases.has(raw.phaseId) ? raw.phaseId : [...validPhases][0];
        const groupIds = Array.isArray(raw.groupIds)
            ? [...new Set(raw.groupIds.filter(groupId => validGroups.has(groupId)))]
            : [];
        const type = POINT_TYPES[raw.type] ? raw.type : 'objective';
        return {
            id: String(raw.id || id('point')),
            type,
            label: String(raw.label || POINT_TYPES[type].label).slice(0, 120),
            note: String(raw.note || '').slice(0, 300),
            lat: raw.lat,
            lng: raw.lng,
            phaseId,
            groupIds
        };
    }

    function normalizeStrategy(raw, fallbackMap) {
        if (!raw || typeof raw !== 'object') throw new Error('Stratégie invalide');

        const phases = Array.isArray(raw.phases) && raw.phases.length
            ? raw.phases.map((phase, index) => ({
                id: String(phase && phase.id || id('phase')),
                name: String(phase && phase.name || `Phase ${index + 1}`).slice(0, 80)
            }))
            : [{ id: id('phase'), name: 'Phase 1' }];

        const phaseIds = new Set(phases.map(phase => phase.id));
        const groups = Array.isArray(raw.groups) && raw.groups.length
            ? raw.groups.map((group, index) => {
                const paths = {};
                phases.forEach(phase => {
                    const rawPath = group && group.paths && Array.isArray(group.paths[phase.id])
                        ? group.paths[phase.id]
                        : [];
                    paths[phase.id] = rawPath
                        .filter(point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng))
                        .map(point => ({ lat: point.lat, lng: point.lng }));
                });
                return {
                    id: String(group && group.id || id('group')),
                    name: String(group && group.name || `Groupe ${index + 1}`).slice(0, 80),
                    color: /^#[0-9a-f]{6}$/i.test(group && group.color || '')
                        ? group.color
                        : GROUP_PALETTE[index % GROUP_PALETTE.length],
                    paths
                };
            })
            : createStrategy('', fallbackMap).groups;

        const groupIds = new Set(groups.map(group => group.id));
        const points = (Array.isArray(raw.points) ? raw.points : [])
            .map(point => normalizePoint(point, groupIds, phaseIds))
            .filter(Boolean);

        return {
            version: VERSION,
            name: String(raw.name || 'Stratégie importée').slice(0, 100),
            map: typeof raw.map === 'string' ? raw.map : (fallbackMap || ''),
            phases,
            groups,
            points
        };
    }

    function addPhase(strategy, name) {
        const phase = { id: id('phase'), name: String(name || `Phase ${strategy.phases.length + 1}`).slice(0, 80) };
        strategy.phases.push(phase);
        strategy.groups.forEach(group => { group.paths[phase.id] = []; });
        return phase;
    }

    function addGroup(strategy, name, color) {
        const group = {
            id: id('group'),
            name: String(name || `Groupe ${strategy.groups.length + 1}`).slice(0, 80),
            color: color || GROUP_PALETTE[strategy.groups.length % GROUP_PALETTE.length],
            paths: {}
        };
        strategy.phases.forEach(phase => { group.paths[phase.id] = []; });
        strategy.groups.push(group);
        return group;
    }

    function hexToRgb(hex) {
        const value = parseInt(hex.slice(1), 16);
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }

    function rgbToHex(rgb) {
        return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    }

    function mixColors(colors) {
        if (!colors.length) return '#94a3b8';
        if (colors.length === 1) return colors[0];
        const rgbs = colors.map(hexToRgb);
        return rgbToHex([0,1,2].map(channel => rgbs.reduce((sum, rgb) => sum + rgb[channel], 0) / rgbs.length));
    }

    function samePoint(a, b, tolerance) {
        const t = tolerance == null ? 4 : tolerance;
        return Math.hypot(a.lat - b.lat, a.lng - b.lng) <= t;
    }

    function segmentOwners(strategy, phaseId, a, b, tolerance) {
        return strategy.groups.filter(group => {
            const path = group.paths[phaseId] || [];
            for (let i = 0; i < path.length - 1; i++) {
                const x = path[i], y = path[i + 1];
                if ((samePoint(x, a, tolerance) && samePoint(y, b, tolerance))
                    || (samePoint(x, b, tolerance) && samePoint(y, a, tolerance))) {
                    return true;
                }
            }
            return false;
        });
    }

    return Object.freeze({
        VERSION, GROUP_PALETTE, POINT_TYPES,
        createStrategy, normalizeStrategy, addPhase, addGroup,
        mixColors, samePoint, segmentOwners
    });
});
