import React, { type ReactElement } from 'react';
import type {
  DashboardAgent,
  DashboardAgentHistoryEntry,
} from '../shared.js';
import { AgentCard } from '../agentCard/view.js';
import styles from './agentPanel.module.scss';

export function AgentPanel({
  agents,
  focusedAgentId,
  historyByAgent,
  onAssignTask,
  onChangeAvatar,
  onDelete,
  onFocus,
  onFormTeam,
  onMergeWorkspace,
  onOpenHistory,
  onRemoveWorkspace,
  onTerminate,
  onUnregister,
}: {
  agents: DashboardAgent[];
  focusedAgentId: string | null;
  historyByAgent: Map<string, DashboardAgentHistoryEntry[]>;
  onAssignTask: (agentId: string) => void;
  onChangeAvatar: (agentId: string, registryId: string) => void;
  onDelete: (registryId: string) => void;
  onFocus: (agentId: string | null) => void;
  onFormTeam: (agentId: string, registryId: string) => void;
  onMergeWorkspace: (registryId: string, branch: string) => void;
  onOpenHistory: (registryId: string, agentName: string) => void;
  onRemoveWorkspace: (registryId: string, branch: string) => void;
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
          onAssignTask={onAssignTask}
          onChangeAvatar={onChangeAvatar}
          onDelete={onDelete}
          onFocus={onFocus}
          onFormTeam={onFormTeam}
          onMergeWorkspace={onMergeWorkspace}
          onOpenHistory={onOpenHistory}
          onRemoveWorkspace={onRemoveWorkspace}
          onTerminate={onTerminate}
          onUnregister={onUnregister}
        />
      ))}
    </>
  );
}
