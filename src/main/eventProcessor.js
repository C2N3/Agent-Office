/**
 * Provider-agnostic event processor.
 * Normalizes Claude/Codex events into a shared session lifecycle model.
 */

const { createSessionState } = require('../../dist/src/main/eventProcessor/sessionState');
const { createEventHandlers } = require('../../dist/src/main/eventProcessor/handlers');

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
  });
}

module.exports = { createEventProcessor };
