import type {
  AgentManagerLike,
  AgentRegistryLike,
  SessionPidsMap,
} from './sessionState.js';
import { createProcessEventHandler } from './process.js';
import { createSessionLifecycleHandlers } from './sessions.js';

type SessionState = ReturnType<typeof import('./sessionState.js').createSessionState>;

type EventHandlerOptions = {
  agentManager?: AgentManagerLike | null;
  agentRegistry?: AgentRegistryLike | null;
  sessionPids: SessionPidsMap;
  debugLog: (message: string) => void;
  detectPidByTranscript?: ((jsonlPath: string | null, callback: (result: number | number[] | null) => void) => void) | null;
  logPrefix?: string;
  createSource?: string;
  updateSource?: string;
  state: SessionState;
  getTaskCompletionHandler?: (() => ((info: any) => void) | null) | null;
};

export function createEventHandlers({
  agentManager,
  agentRegistry,
  sessionPids,
  debugLog,
  detectPidByTranscript,
  logPrefix = 'Event',
  createSource = 'event',
  updateSource = 'event',
  state,
  getTaskCompletionHandler,
}: EventHandlerOptions) {
  const lifecycle = createSessionLifecycleHandlers({
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    detectPidByTranscript,
    logPrefix,
    createSource,
    updateSource,
    state,
  });

  return {
    processEvent: createProcessEventHandler({
      agentManager,
      agentRegistry,
      debugLog,
      logPrefix,
      updateSource,
      state,
      getTaskCompletionHandler,
      ...lifecycle,
    }),
    handleSessionStart: lifecycle.handleSessionStart,
    handleSessionEnd: lifecycle.handleSessionEnd,
    attachRegisteredAgent: lifecycle.attachRegisteredAgent,
    adoptSessionIdentity: state.adoptSessionIdentity,
    flushPendingStarts: () => state.flushPendingStarts(lifecycle.handleSessionStart as any),
    cleanup: () => {
      state.cleanup();
    },
    get firstToolUseDone() {
      return state.firstToolUseDone;
    },
    resolveAgentId: state.resolveAgentId,
    resolveSessionId: state.resolveSessionId,
  };
}
