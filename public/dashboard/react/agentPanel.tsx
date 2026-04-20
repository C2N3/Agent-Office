import React, { type ReactElement } from 'react';
import type { DashboardAgent } from '../shared.js';
import { AgentCard } from '../agentCard/view.js';

export function AgentPanel({
  agents,
  focusedAgentId,
}: {
  agents: DashboardAgent[];
  focusedAgentId: string | null;
}): ReactElement {
  if (agents.length === 0) {
    return (
      <div className="standby-state" id="standbyMessage">
        <div>No agents dispatched.</div>
        <div style={{ fontSize: '0.7rem', marginTop: '6px' }}>Spawn an agent via CLI to populate roster.</div>
      </div>
    );
  }

  return (
    <>
      <div className="standby-state" id="standbyMessage" style={{ display: 'none' }}>
        <div>No agents dispatched.</div>
        <div style={{ fontSize: '0.7rem', marginTop: '6px' }}>Spawn an agent via CLI to populate roster.</div>
      </div>
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} focused={focusedAgentId === agent.id} />
      ))}
    </>
  );
}
