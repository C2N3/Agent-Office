const { adaptAgentToDashboard } = require('../dashboardAdapter.js') as {
  adaptAgentToDashboard: (agent: any) => any;
};
import { getClients, getRefs } from './context.js';

const wiredManagers = new WeakSet<object>();

export function broadcastSSE(type: string, data: unknown): void {
  const { sseClients } = getClients();
  const payload = `event: ${type}\ndata: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

export function broadcastUpdate(type: string, data: unknown): void {
  const { wsClients } = getClients();
  const message = JSON.stringify({ type, data, timestamp: Date.now() });

  wsClients.forEach((client: any) => {
    if (client.readyState === 1) {
      try {
        client.send(message);
      } catch (error: any) {
        console.error('[Dashboard] Error sending to client:', error.message);
      }
    }
  });
}

export function attachAgentManagerBroadcasts(manager: any): void {
  if (!manager || wiredManagers.has(manager)) return;
  wiredManagers.add(manager);

  manager.on('agent-added', (agent: any) => {
    const adapted = adaptAgentToDashboard(agent);
    broadcastSSE('agent.created', adapted);
    broadcastUpdate('agent-added', adapted);
  });
  manager.on('agent-updated', (agent: any) => {
    const adapted = adaptAgentToDashboard(agent);
    broadcastSSE('agent.updated', adapted);
    broadcastUpdate('agent-updated', adapted);
  });
  manager.on('agent-removed', (data: any) => {
    broadcastSSE('agent.removed', data);
    broadcastUpdate('agent-removed', data);
  });
}

export function getAgentManager(): any {
  return getRefs().agentManager;
}
