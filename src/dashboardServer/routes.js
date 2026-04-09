const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { adaptAgentToDashboard } = require('../dashboardAdapter');
const { loadOfficeLayoutManifest, resolveOfficeLayoutAssetPath } = require('../officeLayout');
const { parseConversation, getConversationSummary } = require('../main/conversationParser');
const { HTML_FILE, MIME_TYPES } = require('./constants');
const { calculateStats } = require('./stats');
const { getClients, getRefs } = require('./context');

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    handleAPIRequest(req, res, url);
    return;
  }

  if (pathname === '/ws') {
    res.writeHead(426);
    res.end('WebSocket connection required');
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) {
        console.error('[Dashboard Server] Error reading HTML:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname === '/pip') {
    const pipFile = path.join(__dirname, '..', '..', 'pip.html');
    fs.readFile(pipFile, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname.startsWith('/lib/')) {
    const libMap = {
      '/lib/xterm.js': 'node_modules/@xterm/xterm/lib/xterm.js',
      '/lib/xterm.css': 'node_modules/@xterm/xterm/css/xterm.css',
      '/lib/xterm-addon-fit.js': 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
      '/lib/xterm-addon-web-links.js': 'node_modules/@xterm/addon-web-links/lib/addon-web-links.js',
    };
    const mapped = libMap[pathname];
    if (mapped) {
      const baseDir = path.resolve(__dirname, '..', '..');
      const filePath = path.join(baseDir, mapped);
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        res.end(data);
      });
      return;
    }
  }

  if (pathname.startsWith('/public/') || pathname.startsWith('/src/office/')) {
    const baseDir = path.resolve(__dirname, '..', '..');
    const decoded = decodeURIComponent(pathname);
    const resolved = path.resolve(baseDir, decoded.slice(1));
    const rel = path.relative(baseDir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(resolved);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(resolved, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

function handleAPIRequest(req, res, url) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const routeKey = `${req.method} ${url.pathname}`;
  const handler = apiRoutes[routeKey];
  if (handler) {
    handler(req, res, url);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/office-layout/assets/')) {
    handleGetOfficeLayoutAsset(req, res, url);
    return;
  }

  if (url.pathname.startsWith('/api/agents/') && req.method === 'GET') {
    const agentSubParts = url.pathname.replace('/api/agents/', '').split('/');
    if (agentSubParts.length === 2 && agentSubParts[1] === 'history') {
      handleGetSessionHistory(req, res, agentSubParts[0]);
      return;
    }
    if (agentSubParts.length === 3 && agentSubParts[1] === 'conversation') {
      handleGetConversation(req, res, agentSubParts[0], agentSubParts[2], url);
      return;
    }
    handleGetAgentById(req, res, url);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

function handleSSE(req, res) {
  const { sseClients } = getClients();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
}

function handleGetAgents(req, res) {
  const { agentManager } = getRefs();
  if (!agentManager) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent manager not available' }));
    return;
  }
  const agents = agentManager.getAllAgents().map(adaptAgentToDashboard);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(agents));
}

function handleGetAgentById(req, res, url) {
  const { agentManager, sessionScanner } = getRefs();
  if (!agentManager) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent manager not available' }));
    return;
  }
  const agentId = url.pathname.split('/').pop();
  const agent = agentManager.getAgent(agentId);
  if (!agent) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent not found' }));
    return;
  }
  const sessionStats = sessionScanner ? sessionScanner.getSessionStats(agentId) : null;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...agent, sessionStats }));
}

function handleGetStats(req, res) {
  const { agentManager } = getRefs();
  const stats = calculateStats(agentManager);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(stats));
}

function handleGetSessions(req, res) {
  const { sessionScanner } = getRefs();
  const allStats = sessionScanner ? sessionScanner.getAllStats() : {};
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(allStats));
}

function handleGetArchivedAgents(req, res) {
  const { agentRegistryRef } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }

  const archived = agentRegistryRef.getArchivedAgents();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(archived));
}

function handleGetHeatmap(req, res, url) {
  const { heatmapScanner } = getRefs();
  if (!heatmapScanner) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Heatmap scanner not available' }));
    return;
  }
  const days = parseInt(url.searchParams.get('days') || '365', 10);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  const range = heatmapScanner.getRange(startStr, endStr);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ days: range, lastScan: heatmapScanner.lastScan }));
}

function handleGetHealth(req, res) {
  const { agentManager } = getRefs();
  const { sseClients, wsClients } = getClients();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: Date.now(),
    agents: agentManager ? agentManager.getAgentCount() : 0,
    sseClients: sseClients.size,
    wsClients: wsClients.size,
  }));
}

function handleGetAvatars(req, res) {
  const charDir = path.join(__dirname, '..', '..', 'public', 'characters');
  try {
    const files = fs.readdirSync(charDir)
      .filter((f) => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))
      .sort();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(files));
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('["avatar_0.webp"]');
  }
}

function handleGetOfficeLayout(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(loadOfficeLayoutManifest()));
}

function handleGetOfficeLayoutAsset(req, res, url) {
  const assetPrefix = '/api/office-layout/assets/';
  const assetPath = url.pathname.slice(assetPrefix.length);
  const resolved = resolveOfficeLayoutAssetPath(assetPath);

  if (!resolved) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(resolved);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function handleGetSessionHistory(req, res, registryId) {
  const { agentRegistryRef } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent registry not available' }));
    return;
  }
  const history = agentRegistryRef.getSessionHistory(registryId);
  const enriched = history.map((entry) => {
    const summary = entry.transcriptPath
      ? getConversationSummary(entry.transcriptPath)
      : null;
    return { ...entry, summary };
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(enriched));
}

function handleGetConversation(req, res, registryId, sessionId, url) {
  const { agentRegistryRef, agentManager } = getRefs();
  if (!agentRegistryRef) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
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
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Transcript not found for this session' }));
    return;
  }

  const limit = parseInt(url.searchParams.get('limit') || '0', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const result = parseConversation(transcriptPath, { limit: limit || undefined, offset: offset || undefined });

  if (!result) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Could not parse transcript file' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

const apiRoutes = {
  'GET /api/events': handleSSE,
  'GET /api/agents': handleGetAgents,
  'GET /api/stats': handleGetStats,
  'GET /api/sessions': handleGetSessions,
  'GET /api/archived-agents': handleGetArchivedAgents,
  'GET /api/archived-workspaces': handleGetArchivedAgents,
  'GET /api/heatmap': handleGetHeatmap,
  'GET /api/health': handleGetHealth,
  'GET /api/office-layout': handleGetOfficeLayout,
  'GET /api/avatars': handleGetAvatars,
};

module.exports = {
  apiRoutes,
  handleAPIRequest,
  handleRequest,
};
