import { isActiveAgent, type AgentRecord, type RegistryLike } from './agentPayload';

type RegistryListener = [string, (...args: any[]) => void];

export function registerConnectorRegistryListeners(
  registry: RegistryLike | null,
  sendAgentUpsert: (agent: AgentRecord) => void,
  sendAgentRemove: (agentId: string) => void,
): RegistryListener[] {
  if (!registry?.on) return [];
  const onUpsert = (agent: AgentRecord) => {
    const agentId = agent?.id;
    if (isActiveAgent(agent)) {
      sendAgentUpsert(agent);
    } else if (agentId) {
      sendAgentRemove(agentId);
    }
  };
  const onRemove = (agentOrId: AgentRecord | string) => {
    const agentId = typeof agentOrId === 'string' ? agentOrId : agentOrId?.id;
    if (agentId) sendAgentRemove(agentId);
  };
  const listeners: RegistryListener[] = [
    ['agent-created', onUpsert],
    ['agent-updated', onUpsert],
    ['agent.updated', onUpsert],
    ['agent-enabled-changed', onUpsert],
    ['agent-archived', onRemove],
    ['agent-deleted', onRemove],
    ['agent.removed', onRemove],
  ];
  for (const [event, listener] of listeners) {
    registry.on(event, listener);
  }
  return listeners;
}

export function unregisterConnectorRegistryListeners(
  registry: RegistryLike | null,
  listeners: RegistryListener[],
): void {
  if (!registry?.off) return;
  for (const [event, listener] of listeners) {
    registry.off(event, listener);
  }
}
