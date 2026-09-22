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

    const VERSION = 2;
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

    function cleanNode(point) {
        if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
        const controlLat = Number.isFinite(point.controlLat) ? point.controlLat : null;
        const controlLng = Number.isFinite(point.controlLng) ? point.controlLng : null;
        return {
            lat: point.lat,
            lng: point.lng,
            controlLat: controlLat !== null && controlLng !== null ? controlLat : null,
            controlLng: controlLat !== null && controlLng !== null ? controlLng : null
        };
    }

    function normalizeTracks(rawPath) {
        if (!Array.isArray(rawPath) || !rawPath.length) return [];

        // Tactical V1 stored one flat path. V2 stores multiple independent tracks.
        const tracks = Array.isArray(rawPath[0]) ? rawPath : [rawPath];
        return tracks
            .map(track => Array.isArray(track) ? track.map(cleanNode).filter(Boolean) : [])
            .filter(track => track.length);
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
                    paths[phase.id] = normalizeTracks(rawPath);
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
        if (colors.length >= 3) return '#050505';
        const rgbs = colors.map(hexToRgb);
        return rgbToHex([0, 1, 2].map(channel =>
            rgbs.reduce((sum, rgb) => sum + rgb[channel], 0) / rgbs.length
        ));
    }

    function samePoint(a, b, tolerance) {
        const t = tolerance == null ? 4 : tolerance;
        return !!a && !!b && Math.hypot(a.lat - b.lat, a.lng - b.lng) <= t;
    }

    function allSegments(strategy, phaseId) {
        const segments = [];
        strategy.groups.forEach(group => {
            const tracks = group.paths[phaseId] || [];
            tracks.forEach((track, trackIndex) => {
                for (let i = 0; i < track.length - 1; i++) {
                    segments.push({
                        group,
                        trackIndex,
                        index: i,
                        a: track[i],
                        b: track[i + 1]
                    });
                }
            });
        });
        return segments;
    }

    function segmentOwners(strategy, phaseId, a, b, tolerance) {
        const owners = new Map();
        allSegments(strategy, phaseId).forEach(segment => {
            if ((samePoint(segment.a, a, tolerance) && samePoint(segment.b, b, tolerance))
                || (samePoint(segment.a, b, tolerance) && samePoint(segment.b, a, tolerance))) {
                owners.set(segment.group.id, segment.group);
            }
        });
        return [...owners.values()];
    }

    function tracksForGroup(group, phaseId) {
        if (!Array.isArray(group.paths[phaseId])) group.paths[phaseId] = [];
        return group.paths[phaseId];
    }

    function startTrack(group, phaseId, point) {
        const node = cleanNode(point);
        if (!node) return null;
        const track = [node];
        tracksForGroup(group, phaseId).push(track);
        return track;
    }

    function lastTrack(group, phaseId) {
        const tracks = tracksForGroup(group, phaseId);
        return tracks.length ? tracks[tracks.length - 1] : null;
    }

    function ensureTrackAt(group, phaseId, point, tolerance) {
        let track = lastTrack(group, phaseId);
        const node = cleanNode(point);
        if (!node) return null;
        if (!track || !track.length || !samePoint(track[track.length - 1], node, tolerance || 0.1)) {
            track = startTrack(group, phaseId, node);
        }
        return track;
    }

    return Object.freeze({
        VERSION, GROUP_PALETTE, POINT_TYPES,
        createStrategy, normalizeStrategy, addPhase, addGroup,
        mixColors, samePoint, allSegments, segmentOwners,
        tracksForGroup, startTrack, lastTrack, ensureTrackAt
    });
});
