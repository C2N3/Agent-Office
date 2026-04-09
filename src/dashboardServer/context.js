"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clients = exports.refs = void 0;
exports.setAgentManager = setAgentManager;
exports.setSessionScanner = setSessionScanner;
exports.setHeatmapScanner = setHeatmapScanner;
exports.setAgentRegistry = setAgentRegistry;
exports.setDashboardWindow = setDashboardWindow;
exports.getRefs = getRefs;
exports.getClients = getClients;
exports.refs = {
    agentManager: null,
    sessionScanner: null,
    heatmapScanner: null,
    agentRegistryRef: null,
    missionControlWindow: null,
};
exports.clients = {
    wsClients: new Set(),
    sseClients: new Set(),
};
function setAgentManager(manager) {
    exports.refs.agentManager = manager;
}
function setSessionScanner(scanner) {
    exports.refs.sessionScanner = scanner;
}
function setHeatmapScanner(scanner) {
    exports.refs.heatmapScanner = scanner;
}
function setAgentRegistry(registry) {
    exports.refs.agentRegistryRef = registry;
}
function setDashboardWindow(window) {
    exports.refs.missionControlWindow = window;
}
function getRefs() {
    return exports.refs;
}
function getClients() {
    return exports.clients;
}
