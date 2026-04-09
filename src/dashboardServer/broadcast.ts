const { adaptAgentToDashboard } = require('../dashboardAdapter.js') as {
  adaptAgentToDashboard: (agent: any) => any;
};
import { getClients, getRefs } from './context.js';

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue | undefined };

const wiredManagers = new WeakSet<object>();

export function broadcastSSE(type: string, data: SerializableValue): void {
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

export function broadcastUpdate(type: string, data: SerializableValue): void {
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

export function attachOrchestratorBroadcasts(orchestrator: any): void {
  if (!orchestrator) return;

  const events = ['task:created', 'task:updated', 'task:running', 'task:succeeded', 'task:failed', 'task:retrying', 'task:cancelled'];
  for (const event of events) {
    const sseType = event.replace(':', '.');
    orchestrator.on(event, (task: any) => {
      broadcastSSE(sseType, task);
      broadcastUpdate(event, task);
    });
  }
}

export function getAgentManager(): any {
  return getRefs().agentManager;
}
