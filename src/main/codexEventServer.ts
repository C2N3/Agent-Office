// @ts-nocheck
/**
 * HTTP ingestion server for Codex exec --json events.
 */

const http = require('http');
const Ajv = require('ajv');

const MAX_BODY_SIZE = 1024 * 1024;
const CODEX_EVENT_SERVER_PORT = Number(process.env.PIXEL_AGENT_CODEX_PORT || 47822);

function startCodexEventServer({ processCodexEvent, debugLog, errorHandler, port = CODEX_EVENT_SERVER_PORT }) {
  const schema = {
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string' },
      thread_id: { type: 'string' },
      session_id: { type: 'string' },
      cwd: { type: 'string' },
      model: { type: 'string' },
      usage: { type: 'object' },
      item: { type: 'object' },
      reason: { type: 'string' },
    },
    additionalProperties: true,
  };

  const ajv = new Ajv();
  const validate = ajv.compile(schema);

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/codex-event') {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        res.writeHead(413);
        res.end();
        req.destroy();
      }
    });

    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      try {
        const data = JSON.parse(body);
        const sessionId = data.thread_id || data.session_id || '';
        debugLog(`[Codex] <- ${data.type || '?'} session=${sessionId.slice(0, 8) || '?'} `);

        if (!validate(data)) {
          debugLog(`[Codex] Validation FAILED for ${data.type}: ${JSON.stringify(validate.errors)}`);
          return;
        }

        processCodexEvent(data);
      } catch (error) {
        errorHandler.capture(error, {
          code: 'E010',
          category: 'PARSE',
          severity: 'WARNING',
        });
        debugLog(`[Codex] Parse error: ${error.message}`);
      }
    });
  });

  server.on('error', (error) => debugLog(`[Codex] Server error: ${error.message}`));
  server.listen(port, '127.0.0.1', () => {
    debugLog(`[Codex] Event server listening on port ${port}`);
  });

  return server;
}

module.exports = { CODEX_EVENT_SERVER_PORT, startCodexEventServer };
