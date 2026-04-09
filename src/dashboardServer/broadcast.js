"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastSSE = broadcastSSE;
exports.broadcastUpdate = broadcastUpdate;
exports.attachAgentManagerBroadcasts = attachAgentManagerBroadcasts;
exports.getAgentManager = getAgentManager;
const { adaptAgentToDashboard } = require('../dashboardAdapter.js');
const context_js_1 = require("./context.js");
const wiredManagers = new WeakSet();
function broadcastSSE(type, data) {
    const { sseClients } = (0, context_js_1.getClients)();
    const payload = `event: ${type}\ndata: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
    for (const res of sseClients) {
        try {
            res.write(payload);
        }
        catch {
            sseClients.delete(res);
        }
    }
}
function broadcastUpdate(type, data) {
    const { wsClients } = (0, context_js_1.getClients)();
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    wsClients.forEach((client) => {
        if (client.readyState === 1) {
            try {
                client.send(message);
            }
            catch (error) {
                console.error('[Dashboard] Error sending to client:', error.message);
            }
        }
    });
}
function attachAgentManagerBroadcasts(manager) {
    if (!manager || wiredManagers.has(manager))
        return;
    wiredManagers.add(manager);
    manager.on('agent-added', (agent) => {
        const adapted = adaptAgentToDashboard(agent);
        broadcastSSE('agent.created', adapted);
        broadcastUpdate('agent-added', adapted);
    });
    manager.on('agent-updated', (agent) => {
        const adapted = adaptAgentToDashboard(agent);
        broadcastSSE('agent.updated', adapted);
        broadcastUpdate('agent-updated', adapted);
    });
    manager.on('agent-removed', (data) => {
        broadcastSSE('agent.removed', data);
        broadcastUpdate('agent-removed', data);
    });
}
function getAgentManager() {
    return (0, context_js_1.getRefs)().agentManager;
}
