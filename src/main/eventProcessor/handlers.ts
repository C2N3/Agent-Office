import type {
  AgentLike,
  AgentManagerLike,
  AgentRegistryLike,
  SessionPidsMap,
  SessionStateOptions,
} from './sessionState.js';

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
  const { createProcessEventHandler } = require('./process.js') as {
    createProcessEventHandler: (options: any) => (event: any) => void;
  };
  const { createSessionLifecycleHandlers } = require('./sessions.js') as {
    createSessionLifecycleHandlers: (options: any) => {
      handlePidReconnect: (event: any) => void;
      handleSessionStart: (sessionId: string, cwd: string, pid?: number, options?: Partial<SessionStateOptions>) => void;
      handleSessionEnd: (sessionId: string) => void;
      attachRegisteredAgent: (registryAgent: AgentLike | null | undefined) => string | null;
    };
  };

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
    resolveSessionId: state.resolveSessionId,
  };
}
