import { URL } from 'url';
const { getConversationSummary, parseConversation } = require('../main/conversationParser.js') as {
  getConversationSummary: (transcriptPath: string) => any;
  parseConversation: (transcriptPath: string, options?: { limit?: number; offset?: number }) => any;
};
const { terminateAgentSession } = require('../main/sessionTermination.js') as {
  terminateAgentSession: (options: any) => Promise<any>;
};
import { getRefs } from './context.js';

interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
}

interface RequestLike {
  method?: string;
  url?: string;
}

const jsonHeader = { 'Content-Type': 'application/json' };

function handleGetAgentById(_req: RequestLike, res: ResponseLike, url: URL): void {
  const { agentManager, sessionScanner } = getRefs();
  if (!agentManager) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent manager not available' }));
    return;
  }
  const agentId = url.pathname.split('/').pop();
  const agent = agentManager.getAgent(agentId);
  if (!agent) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent not found' }));
    return;
  }
  const sessionStats = sessionScanner ? sessionScanner.getSessionStats(agentId) : null;
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify({ ...agent, sessionStats }));
}

function handleGetSessionHistory(_req: RequestLike, res: ResponseLike, registryId: string): void {
  const { agentRegistryRef } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }
  const enriched = agentRegistryRef.getSessionHistory(registryId).map((entry: any) => ({
    ...entry,
    summary: entry.transcriptPath ? getConversationSummary(entry.transcriptPath) : null,
  }));
  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(enriched));
}

function handleGetConversation(_req: RequestLike, res: ResponseLike, registryId: string, sessionId: string, url: URL): void {
  const { agentRegistryRef, agentManager } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, jsonHeader);
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }
  const entry = agentRegistryRef.findSessionHistoryEntry(registryId, sessionId);
  let transcriptPath = entry ? entry.transcriptPath : null;
  if (!transcriptPath && agentManager) {
    const agent = agentManager.getAgent(registryId);
    if (agent && (agent.sessionId === sessionId || agent.runtimeSessionId === sessionId || agent.resumeSessionId === sessionId) && agent.jsonlPath) {
      transcriptPath = agent.jsonlPath;
    }
  }

  if (!transcriptPath) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Transcript not found for this session' }));
    return;
  }

  const limit = parseInt(url.searchParams.get('limit') || '0', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const result = parseConversation(transcriptPath, { limit: limit || undefined, offset: offset || undefined });
  if (!result) {
    res.writeHead(404, jsonHeader);
    res.end(JSON.stringify({ error: 'Could not parse transcript file' }));
    return;
  }

  res.writeHead(200, jsonHeader);
  res.end(JSON.stringify(result));
}

async function handleTerminateAgent(_req: RequestLike, res: ResponseLike, agentId: string): Promise<void> {
  const { agentManager, agentRegistryRef, sessionPids, terminalManager, orchestrator } = getRefs();
  try {
    const result = await terminateAgentSession({
      agentId,
      agentManager,
      agentRegistry: agentRegistryRef,
      sessionPids,
      terminalManager,
      orchestrator,
      debugLog: console.log,
    });
    res.writeHead(result.success ? 200 : 404, jsonHeader);
    res.end(JSON.stringify(result));
  } catch (error: any) {
    res.writeHead(500, jsonHeader);
    res.end(JSON.stringify({ success: false, error: error.message }));
  }
}

export function handleAgentApiRoute(req: RequestLike, res: ResponseLike, url: URL): boolean {
  if (!url.pathname.startsWith('/api/agents/')) return false;
  const parts = url.pathname.replace('/api/agents/', '').split('/');
  if (req.method === 'POST' && parts.length === 2 && parts[1] === 'terminate') {
    handleTerminateAgent(req, res, parts[0]);
    return true;
  }
  if (req.method !== 'GET') return false;
  if (parts.length === 2 && parts[1] === 'history') {
    handleGetSessionHistory(req, res, parts[0]);
    return true;
  }
  if (parts.length === 3 && parts[1] === 'conversation') {
    handleGetConversation(req, res, parts[0], parts[2], url);
    return true;
  }
  handleGetAgentById(req, res, url);
  return true;
}
