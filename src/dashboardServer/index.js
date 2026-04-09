"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRefs = exports.broadcastUpdate = exports.broadcastSSE = exports.PORT = void 0;
exports.setAgentManager = setAgentManager;
exports.setSessionScanner = setSessionScanner;
exports.setHeatmapScanner = setHeatmapScanner;
exports.setAgentRegistry = setAgentRegistry;
exports.setDashboardWindow = setDashboardWindow;
exports.startServer = startServer;
exports.calculateStats = calculateStats;
const http_1 = __importDefault(require("http"));
const constants_js_1 = require("./constants.js");
Object.defineProperty(exports, "PORT", { enumerable: true, get: function () { return constants_js_1.PORT; } });
const broadcast_js_1 = require("./broadcast.js");
Object.defineProperty(exports, "broadcastSSE", { enumerable: true, get: function () { return broadcast_js_1.broadcastSSE; } });
Object.defineProperty(exports, "broadcastUpdate", { enumerable: true, get: function () { return broadcast_js_1.broadcastUpdate; } });
const context_js_1 = require("./context.js");
Object.defineProperty(exports, "getRefs", { enumerable: true, get: function () { return context_js_1.getRefs; } });
const routes_js_1 = require("./routes.js");
const websocket_js_1 = require("./websocket.js");
const stats_js_1 = require("./stats.js");
const server = http_1.default.createServer(routes_js_1.handleRequest);
(0, websocket_js_1.attachWebSocketUpgrade)(server);
function setAgentManager(manager) {
    (0, context_js_1.setAgentManager)(manager);
    (0, broadcast_js_1.attachAgentManagerBroadcasts)(manager);
}
function setSessionScanner(scanner) {
    (0, context_js_1.setSessionScanner)(scanner);
}
function setHeatmapScanner(scanner) {
    (0, context_js_1.setHeatmapScanner)(scanner);
}
function setAgentRegistry(registry) {
    (0, context_js_1.setAgentRegistry)(registry);
}
function setDashboardWindow(window) {
    (0, context_js_1.setDashboardWindow)(window);
}
function startServer() {
    server.listen(constants_js_1.PORT, () => {
        // Startup logging is handled elsewhere.
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[Dashboard Server] ❌ Port ${constants_js_1.PORT} already in use!`);
            console.error('[Dashboard Server] 💡 Another server is already running on this port.');
        }
        else {
            console.error('[Dashboard Server] ❌ Server error:', err);
        }
    });
    return server;
}
process.on('SIGINT', () => {
    const { wsClients } = require('./context.js').getClients();
    wsClients.forEach((client) => {
        try {
            client.close();
        }
        catch {
            // Ignore shutdown errors.
        }
    });
    wsClients.clear();
    server.close(() => {
        process.exit(0);
    });
});
function calculateStats() {
    return (0, stats_js_1.calculateStats)((0, context_js_1.getRefs)().agentManager);
}
if (require.main === module) {
    startServer();
}
