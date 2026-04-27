import { HOOK_SERVER_PORT, unregisterClaudeHooks } from '../hookRegistration.js';
import { startHookServer } from '../hookServer.js';
import { CODEX_EVENT_SERVER_PORT, startCodexEventServer } from '../providers/codex/eventServer.js';
import { createHookProcessor } from '../hookProcessor.js';
import { createCodexProcessor } from '../providers/codex/processor.js';
import { createCodexSessionMonitor } from '../providers/codex/sessionMonitor.js';
import { sharedSessionAllowlist } from '../orchestrator/sessionAllowlist.js';

export function autoRegisterProviders({ enabledProviders, debugLog }) {
  // Agent-Office no longer registers a global Claude hook. Migrate any
  // previously-installed entries out of ~/.claude/settings.json so upgrades
  // leave the user's config clean and stray hook events stop firing.
  if (enabledProviders.includes('claude')) {
    unregisterClaudeHooks(debugLog);
  }
}

export function createProviderProcessors({
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
      sessionAllowlist: sharedSessionAllowlist,
      detectPidByTranscript: (jsonlPath, callback) => detectProviderPidBySessionFile('codex', jsonlPath, callback),
    });
  }

  return { hookProcessor, codexProcessor, codexSessionMonitor };
}

export function startProviderServices({ hookProcessor, codexProcessor, codexSessionMonitor, debugLog, errorHandler }) {
  let hookServer = null;
  let codexEventServer = null;

  if (hookProcessor) {
    hookServer = startHookServer({
      processHookEvent: hookProcessor.processHookEvent,
      debugLog,
      HOOK_SERVER_PORT,
      errorHandler,
      sessionAllowlist: sharedSessionAllowlist,
    });
  }

  if (codexProcessor) {
    codexEventServer = startCodexEventServer({
      processCodexEvent: codexProcessor.processCodexEvent,
      debugLog,
      errorHandler,
      port: CODEX_EVENT_SERVER_PORT,
      sessionAllowlist: sharedSessionAllowlist,
    });
  }

  if (codexSessionMonitor) {
    codexSessionMonitor.start();
  }

  return { hookServer, codexEventServer };
}
