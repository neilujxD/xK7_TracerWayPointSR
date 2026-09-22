// Tactical Map application state
let appWorkspace = 'route'; // 'route' | 'tactical'
let tacticalMode = 'edit';  // 'edit' | 'present'
let tacticalTool = 'route'; // 'route' | 'point'
let tacticalPointType = 'objective';

let tacticalStrategy = TacticalCore.createStrategy('Nouvelle stratégie', '');
let tacticalActivePhaseId = tacticalStrategy.phases[0].id;
let tacticalActiveGroupId = tacticalStrategy.groups[0].id;
let tacticalFocusGroupId = 'all';

let tacticalLayers = [];
