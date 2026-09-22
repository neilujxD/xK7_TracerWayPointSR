// Tactical Map application state
let appWorkspace = 'route'; // 'route' | 'tactical'
let tacticalMode = 'edit';  // 'edit' | 'present'
let tacticalTool = 'route'; // 'route' | 'point'
let tacticalPointType = 'objective';

let tacticalStrategy = TacticalCore.createStrategy('Nouvelle stratégie', '');
let tacticalActivePhaseId = tacticalStrategy.phases[0].id;
let tacticalActiveGroupId = tacticalStrategy.groups[0].id;
let tacticalFocusGroupId = 'all';

// Groupes qui dessinent actuellement ensemble après une action "Joindre".
let tacticalJoinedGroupIds = [tacticalActiveGroupId];

// Noeud/point actuellement choisi pour l'action Déplacer.
let tacticalMoveTarget = null;

let tacticalLayers = [];
