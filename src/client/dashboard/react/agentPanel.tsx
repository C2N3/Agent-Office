import React, { type ReactElement } from 'react';
import type {
  DashboardAgent,
  DashboardAgentHistoryEntry,
} from '../shared';
import { AgentCard } from '../agentCard/view';
import styles from './agentPanel.module.scss';

export function AgentPanel({
  agents,
  focusedAgentId,
  historyByAgent,
  onChangeAvatar,
  onDelete,
  onFocus,
  onRename,
  onTerminate,
  onUnregister,
}: {
  agents: DashboardAgent[];
  focusedAgentId: string | null;
  historyByAgent: Map<string, DashboardAgentHistoryEntry[]>;
  onChangeAvatar: (agentId: string, registryId: string) => void;
  onDelete: (registryId: string) => void;
  onFocus: (agentId: string | null) => void;
  onRename: (agentId: string, nickname: string) => boolean | Promise<boolean>;
  onTerminate: (agentId: string) => void;
  onUnregister: (registryId: string) => void;
}): ReactElement {
  if (agents.length === 0) {
    return (
      <div className="standby-state" id="standbyMessage">
        <div>No agents dispatched.</div>
        <div className={styles.standbyDetail}>Spawn an agent via CLI to populate roster.</div>
      </div>
    );
  }

  return (
    <>
      <div className="standby-state" hidden id="standbyMessage">
        <div>No agents dispatched.</div>
        <div className={styles.standbyDetail}>Spawn an agent via CLI to populate roster.</div>
      </div>
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          focused={focusedAgentId === agent.id}
          history={historyByAgent.get(agent.id) || []}
          onChangeAvatar={onChangeAvatar}
          onDelete={onDelete}
          onFocus={onFocus}
          onRename={onRename}
          onTerminate={onTerminate}
          onUnregister={onUnregister}
        />
      ))}
    </>
  );
}
