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


const TacticalCore = require('../js/tactical-core.js');

test('tactical strategies keep independent group paths for each phase', () => {
    const strategy = TacticalCore.createStrategy('War plan', 'images/maps/Altgard.webp');
    const phase2 = TacticalCore.addPhase(strategy, 'Engagement');
    const blue = TacticalCore.addGroup(strategy, 'Groupe Bleu', '#3b82f6');

    strategy.groups[0].paths[phase2.id].push({ lat: 10, lng: 20 });
    blue.paths[phase2.id].push({ lat: 30, lng: 40 });

    assert.equal(strategy.groups[0].paths[phase2.id].length, 1);
    assert.equal(blue.paths[phase2.id].length, 1);
    assert.notDeepEqual(strategy.groups[0].paths[phase2.id], blue.paths[phase2.id]);
});

test('shared tactical segments report all owning groups', () => {
    const strategy = TacticalCore.createStrategy('Shared', '');
    const phaseId = strategy.phases[0].id;
    const red = strategy.groups[0];
    const blue = TacticalCore.addGroup(strategy, 'Bleu', '#3b82f6');
    red.paths[phaseId] = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
    blue.paths[phaseId] = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }];

    const owners = TacticalCore.segmentOwners(
        strategy, phaseId,
        { lat: 1, lng: 1 }, { lat: 2, lng: 2 }, 0.1
    );

    assert.deepEqual(owners.map(group => group.id).sort(), [red.id, blue.id].sort());
});

test('shared tactical group colors are mixed deterministically', () => {
    assert.equal(TacticalCore.mixColors(['#ff0000', '#0000ff']), '#800080');
});

test('tactical normalization removes invalid path points and memberships', () => {
    const strategy = TacticalCore.createStrategy('Normalize', '');
    const group = strategy.groups[0];
    const phase = strategy.phases[0];
    const normalized = TacticalCore.normalizeStrategy({
        name: 'Imported',
        map: 'images/maps/Altgard.webp',
        phases: [phase],
        groups: [{
            id: group.id,
            name: group.name,
            color: group.color,
            paths: {
                [phase.id]: [
                    { lat: 10, lng: 20 },
                    { lat: 'bad', lng: 20 }
                ]
            }
        }],
        points: [{
            id: 'p1',
            type: 'engage',
            label: 'Combat',
            lat: 5,
            lng: 6,
            phaseId: phase.id,
            groupIds: [group.id, 'missing']
        }]
    }, '');

    assert.equal(normalized.groups[0].paths[phase.id].length, 1);
    assert.deepEqual(normalized.points[0].groupIds, [group.id]);
});
