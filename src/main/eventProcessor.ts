/**
 * Provider-agnostic event processor.
 * Normalizes Claude/Codex events into a shared session lifecycle model.
 */

import { createSessionState } from './eventProcessor/sessionState.js';
import { createEventHandlers } from './eventProcessor/handlers.js';

export function createEventProcessor({
  agentManager,
  agentRegistry,
  sessionPids,
  debugLog,
  detectPidByTranscript,
  logPrefix = 'Event',
  createSource = 'event',
  updateSource = 'event',
  getTaskCompletionHandler,
}) {
  const state = createSessionState({
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    logPrefix,
    updateSource,
  });

  return createEventHandlers({
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    detectPidByTranscript,
    logPrefix,
    createSource,
    updateSource,
    state,
    getTaskCompletionHandler,
  });
}
