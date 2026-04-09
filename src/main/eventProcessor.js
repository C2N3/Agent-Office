/**
 * Provider-agnostic event processor.
 * Normalizes Claude/Codex events into a shared session lifecycle model.
 */

const { createSessionState } = require('./eventProcessor/sessionState');
const { createEventHandlers } = require('./eventProcessor/handlers');

function createEventProcessor({
  agentManager,
  agentRegistry,
  sessionPids,
  debugLog,
  detectPidByTranscript,
  logPrefix = 'Event',
  createSource = 'event',
  updateSource = 'event',
}) {
  const state = createSessionState({
    agentManager,
    agentRegistry,
    sessionPids,
    debugLog,
    logPrefix,
    updateSource,
  });

  const handlers = createEventHandlers({
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

  return handlers;
}

module.exports = { createEventProcessor };
