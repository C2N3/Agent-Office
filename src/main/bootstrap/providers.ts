
const { HOOK_SERVER_PORT, registerClaudeHooks } = require('../hookRegistration');
const { startHookServer } = require('../hookServer');
const { CODEX_EVENT_SERVER_PORT, startCodexEventServer } = require('../codexEventServer');
const { createHookProcessor } = require('../hookProcessor');
const { createCodexProcessor } = require('../codexProcessor');
const { createCodexSessionMonitor } = require('../codexSessionMonitor');

function autoRegisterProviders({ enabledProviders, debugLog }) {
  if (enabledProviders.includes('claude')) {
    registerClaudeHooks(debugLog);
  }
}

function createProviderProcessors({
  enabledProviders,
  agentManager,
  agentRegistry,
  sessionPids,
  debugLog,
  detectClaudePidByTranscript,
  detectProviderPidBySessionFile,
}) {
  let hookProcessor = null;
  let codexProcessor = null;
  let codexSessionMonitor = null;

  if (enabledProviders.includes('claude')) {
    hookProcessor = createHookProcessor({
      agentManager,
      agentRegistry,
      sessionPids,
      debugLog,
      detectClaudePidByTranscript,
    });
  }

  if (enabledProviders.includes('codex')) {
    codexProcessor = createCodexProcessor({
      agentManager,
      agentRegistry,
      sessionPids,
      debugLog,
      detectPidByTranscript: (jsonlPath, callback) => detectProviderPidBySessionFile('codex', jsonlPath, callback),
    });
    codexSessionMonitor = createCodexSessionMonitor({
      codexProcessor,
      agentManager,
      debugLog,
    });
  }

  return { hookProcessor, codexProcessor, codexSessionMonitor };
}

function startProviderServices({ hookProcessor, codexProcessor, codexSessionMonitor, debugLog, errorHandler }) {
  let hookServer = null;
  let codexEventServer = null;

  if (hookProcessor) {
    hookServer = startHookServer({
      processHookEvent: hookProcessor.processHookEvent,
      debugLog,
      HOOK_SERVER_PORT,
      errorHandler,
    });
  }

  if (codexProcessor) {
    codexEventServer = startCodexEventServer({
      processCodexEvent: codexProcessor.processCodexEvent,
      debugLog,
      errorHandler,
      port: CODEX_EVENT_SERVER_PORT,
    });
  }

  if (codexSessionMonitor) {
    codexSessionMonitor.start();
  }

  return { hookServer, codexEventServer };
}

module.exports = {
  autoRegisterProviders,
  createProviderProcessors,
  startProviderServices,
};
