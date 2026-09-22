// Application Global State
let currentMode = 'edit'; // 'edit' or 'play'

let autoCenter = true;

let isMapReady = false; // Guard preventing state overwrite before image load

let availableMaps = [];   // noms de fichiers trouvés dans MAPS_DIR

let scanMethod = '';

let availableRoutes = [];

let routesScanMethod = '';


// Saved Routes Library
let routePresets = {
    "Itinéraire Principal": []
};

let currentRouteName = "Itinéraire Principal";

let steps = [];

let currentStepIndex = -1;
