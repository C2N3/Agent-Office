// @ts-nocheck
/**
 * Provider-agnostic event processor.
 * Normalizes Claude/Codex events into a shared session lifecycle model.
 */

const path = require('path');

const isDistRuntime = __dirname.split(path.sep).includes('dist');
const eventProcessorBase = isDistRuntime
  ? './eventProcessor'
  : '../../dist/src/main/eventProcessor';
const { createSessionState } = require(`${eventProcessorBase}/sessionState`);
const { createEventHandlers } = require(`${eventProcessorBase}/handlers`);

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
