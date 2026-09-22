/*
 * Pure route-model helpers.
 *
 * This file intentionally has no DOM/Leaflet dependency so the same rules are
 * used by the browser and by the automated tests.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RouteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const ROUTE_SCHEMA_VERSION = 2;
    const DEFAULT_ZONE_RADIUS = 250;
    const MAX_ZONE_RADIUS = 1000;
    const MIN_ZONE_RADIUS = 50;

    function finiteNumber(value) {
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    function clampInteger(value, min, max, fallback) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    }

    function normalizeStep(step, index) {
        if (!step || typeof step !== 'object') return null;

        const lat = finiteNumber(step.lat);
        const lng = finiteNumber(step.lng);
        if (lat === null || lng === null) return null;

        const controlLat = finiteNumber(step.controlLat);
        const controlLng = finiteNumber(step.controlLng);
        const hasControl = controlLat !== null && controlLng !== null;

        return {
            id: finiteNumber(step.id) ?? Date.now() + index + Math.random(),
            lat,
            lng,
            title: String(step.title ?? '').slice(0, 120),
            note: String(step.note ?? '').slice(0, 500),
            controlLat: hasControl ? controlLat : null,
            controlLng: hasControl ? controlLng : null,
            hasZone: Boolean(step.hasZone),
            zoneRadius: clampInteger(
                step.zoneRadius,
                MIN_ZONE_RADIUS,
                MAX_ZONE_RADIUS,
                DEFAULT_ZONE_RADIUS
            ),
            questMain: step.questMain === undefined ? true : Boolean(step.questMain),
            questSide: Boolean(step.questSide),
            tpNext: Boolean(step.tpNext),
            tpActivate: Boolean(step.tpActivate)
        };
    }

    function sanitizeRouteName(value, fallbackName) {
        const fallback = String(fallbackName || 'Itinéraire importé').trim() || 'Itinéraire importé';
        return (String(value || fallback).trim().slice(0, 80) || fallback);
    }

    function isSafeMapPath(path, mapsDir) {
        return typeof path === 'string'
            && path.startsWith(mapsDir)
            && !path.includes('..')
            && !path.includes('\\');
    }

    function normalizeRouteData(data, options) {
        const opts = options || {};
        const mapsDir = opts.mapsDir || 'images/maps/';
        const defaults = opts.settingsDefaults || {};
        const rawSteps = Array.isArray(data)
            ? data
            : (data && Array.isArray(data.steps) ? data.steps : null);

        if (!rawSteps) throw new Error('Format d\'itinéraire invalide.');

        const steps = rawSteps
            .map((step, index) => normalizeStep(step, index))
            .filter(Boolean);

        const source = data && !Array.isArray(data) ? data : {};
        const name = sanitizeRouteName(
            source.name || source.routeName,
            opts.fallbackName || 'Itinéraire importé'
        );

        const rawMap = source.map || (source.settings && source.settings.mapImagePath) || null;
        const map = isSafeMapPath(rawMap, mapsDir) ? rawMap : null;

        let opacity = null;
        if (source.settings && typeof source.settings === 'object') {
            opacity = {
                maxPastSteps: clampInteger(source.settings.maxPastSteps, 0, 10, defaults.maxPastSteps ?? 3),
                maxFutureSteps: clampInteger(source.settings.maxFutureSteps, 0, 10, defaults.maxFutureSteps ?? 3),
                hideOutOfScope: Boolean(source.settings.hideOutOfScope)
            };
        }

        return {
            version: ROUTE_SCHEMA_VERSION,
            name,
            steps,
            map,
            opacity
        };
    }

    function withRenumberedAutomaticTitles(list) {
        return (Array.isArray(list) ? list : []).map((step, index) => {
            if (!step || typeof step !== 'object') return step;
            const title = String(step.title ?? '').trim();
            const isAutomatic = title === '' || /^Étape\s+\d+$/i.test(title);
            return isAutomatic ? { ...step, title: `Étape ${index + 1}` } : step;
        });
    }


    function comparableStep(step) {
        return [
            step.lat,
            step.lng,
            step.title || '',
            step.note || '',
            step.controlLat ?? null,
            step.controlLng ?? null,
            Boolean(step.hasZone),
            Number(step.zoneRadius) || DEFAULT_ZONE_RADIUS,
            step.questMain === undefined ? true : Boolean(step.questMain),
            Boolean(step.questSide),
            Boolean(step.tpNext),
            Boolean(step.tpActivate)
        ];
    }

    function stepsSignature(list) {
        return JSON.stringify((Array.isArray(list) ? list : []).map(comparableStep));
    }

    function exportRouteData(name, steps, map, settings) {
        return {
            version: ROUTE_SCHEMA_VERSION,
            name: sanitizeRouteName(name, 'Itinéraire'),
            map: isSafeMapPath(map, 'images/maps/') ? map : null,
            settings: {
                maxPastSteps: clampInteger(settings && settings.maxPastSteps, 0, 10, 3),
                maxFutureSteps: clampInteger(settings && settings.maxFutureSteps, 0, 10, 3),
                hideOutOfScope: Boolean(settings && settings.hideOutOfScope)
            },
            steps: Array.isArray(steps) ? steps.map((step, index) => normalizeStep(step, index)).filter(Boolean) : []
        };
    }

    return Object.freeze({
        ROUTE_SCHEMA_VERSION,
        normalizeStep,
        normalizeRouteData,
        withRenumberedAutomaticTitles,
        stepsSignature,
        exportRouteData,
        isSafeMapPath,
        clampInteger
    });
});
