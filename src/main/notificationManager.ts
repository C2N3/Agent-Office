/**
 * Desktop Notification Manager
 * Shows native OS notifications for important agent state changes
 * (Done, Help, Error) — visible even when the dashboard window is closed.
 */

import { Notification } from 'electron';

/** States that trigger a desktop notification */
const NOTIFY_STATES = new Set(['Done', 'Help', 'Error']);

/** Human-readable labels & urgency per state */
const STATE_INFO: Record<string, { title: string; urgency: 'critical' | 'low' | 'normal' }> = {
  Done:  { title: '작업 완료', urgency: 'normal' },
  Help:  { title: '도움 요청', urgency: 'critical' },
  Error: { title: '오류 발생', urgency: 'critical' },
};

/** Throttle window per agent (ms) — avoid notification spam */
const THROTTLE_MS = 5_000;

export class NotificationManager {
  private _lastNotify: Map<string, number> = new Map();
  private _enabled: boolean = true;
  private _debugLog: (msg: string) => void;

  constructor(debugLog: (msg: string) => void = console.log) {
    this._debugLog = debugLog;
  }

  /** Enable / disable notifications at runtime */
  setEnabled(enabled: boolean) {
    this._enabled = enabled;
  }

  /**
   * Called on every agent-updated event.
   * Only shows a notification when the state is in NOTIFY_STATES
   * and enough time has passed since the last notification for that agent.
   */
  onAgentStateChanged(agent: {
    id: string;
    displayName: string;
    state: string;
    currentTool?: string;
    lastMessage?: string;
    isSubagent?: boolean;
  }) {
    if (!this._enabled) return;
    if (!Notification.isSupported()) return;
    if (!NOTIFY_STATES.has(agent.state)) return;

    // Skip subagent notifications — parent will aggregate
    if (agent.isSubagent) return;

    // Throttle per agent
    const now = Date.now();
    const lastTime = this._lastNotify.get(agent.id) || 0;
    if (now - lastTime < THROTTLE_MS) return;
    this._lastNotify.set(agent.id, now);

    const info = STATE_INFO[agent.state];
    const name = agent.displayName || 'Agent';

    let body = `${name}`;
    if (agent.state === 'Help') {
      body = agent.lastMessage
        ? `${name}: ${agent.lastMessage.slice(0, 120)}`
        : `${name} — 사용자 입력 대기중`;
    } else if (agent.state === 'Error') {
      body = agent.currentTool
        ? `${name}: ${agent.currentTool} 실행 중 오류`
        : `${name} — 오류가 발생했습니다`;
    } else if (agent.state === 'Done') {
      body = `${name} — 작업이 완료되었습니다`;
    }

    const notification = new Notification({
      title: `Agent Office — ${info.title}`,
      body,
      urgency: info.urgency,
      silent: agent.state === 'Done',  // Done is quiet, Help/Error make sound
    });

    notification.show();
    this._debugLog(`[NotificationManager] ${info.title}: ${name} (${agent.state})`);
  }

  /** Clean up throttle map for removed agents */
  onAgentRemoved(agentId: string) {
    this._lastNotify.delete(agentId);
  }

  /** Clear all state */
  cleanup() {
    this._lastNotify.clear();
  }
}
