const test = require('node:test');
const assert = require('node:assert/strict');
const RouteCore = require('../js/core.js');

test('legacy array routes are normalized without losing compatibility', () => {
    const route = RouteCore.normalizeRouteData([
        { lat: 10, lng: 20, title: 'A', note: 'B' }
    ], {
        fallbackName: 'Legacy',
        mapsDir: 'images/maps/',
        settingsDefaults: { maxPastSteps: 3, maxFutureSteps: 3 }
    });

    assert.equal(route.version, 2);
    assert.equal(route.name, 'Legacy');
    assert.equal(route.steps.length, 1);
    assert.equal(route.steps[0].questMain, true);
    assert.equal(route.steps[0].questSide, false);
});

test('route signatures detect quest and teleport changes', () => {
    const base = [{
        lat: 1, lng: 2, title: 'Step', note: '',
        controlLat: null, controlLng: null,
        hasZone: false, zoneRadius: 250,
        questMain: true, questSide: false,
        tpNext: false, tpActivate: false
    }];

    const changedQuest = [{ ...base[0], questSide: true }];
    const changedTp = [{ ...base[0], tpNext: true }];

    assert.notEqual(RouteCore.stepsSignature(base), RouteCore.stepsSignature(changedQuest));
    assert.notEqual(RouteCore.stepsSignature(base), RouteCore.stepsSignature(changedTp));
});

test('unsafe map paths are rejected', () => {
    assert.equal(RouteCore.isSafeMapPath('images/maps/Altgard.webp', 'images/maps/'), true);
    assert.equal(RouteCore.isSafeMapPath('images/maps/../secret.webp', 'images/maps/'), false);
    assert.equal(RouteCore.isSafeMapPath('../Altgard.webp', 'images/maps/'), false);
});

test('invalid coordinates are dropped and user text is bounded', () => {
    const route = RouteCore.normalizeRouteData({
        name: 'Example',
        steps: [
            { lat: '10', lng: 2 },
            { lat: 1, lng: 2, title: 'x'.repeat(200), note: 'y'.repeat(700) }
        ]
    }, { mapsDir: 'images/maps/' });

    assert.equal(route.steps.length, 1);
    assert.equal(route.steps[0].title.length, 120);
    assert.equal(route.steps[0].note.length, 500);
});

test('exported routes use schema V2 and clamp settings', () => {
    const data = RouteCore.exportRouteData(
        'Route',
        [{ lat: 1, lng: 2, title: 'Step' }],
        'images/maps/Altgard.webp',
        { maxPastSteps: 99, maxFutureSteps: -5, hideOutOfScope: true }
    );

    assert.equal(data.version, 2);
    assert.equal(data.settings.maxPastSteps, 10);
    assert.equal(data.settings.maxFutureSteps, 0);
    assert.equal(data.settings.hideOutOfScope, true);
});


test('automatic titles are renumbered while custom titles are preserved', () => {
    const route = RouteCore.normalizeRouteData({
        name: 'Numbering',
        steps: [
            { lat: 1, lng: 1, title: 'Étape 1' },
            { lat: 2, lng: 2, title: '' },
            { lat: 3, lng: 3, title: 'Étape 2' },
            { lat: 4, lng: 4, title: 'Prendre le TP' }
        ]
    }, { mapsDir: 'images/maps/' });

    assert.equal(route.steps[0].title, 'Étape 1');
    assert.equal(route.steps[1].title, 'Étape 2');
    assert.equal(route.steps[2].title, 'Étape 3');
    assert.equal(route.steps[3].title, 'Prendre le TP');
});
