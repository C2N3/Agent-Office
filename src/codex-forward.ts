#!/usr/bin/env node
// @ts-nocheck
/**
 * Forward `codex exec --json` JSONL output to the local Codex event server.
 *
 * Example:
 *   codex exec --json "summarize the repo" | node dist/src/codex-forward.js
 */

const http = require('http');
const readline = require('readline');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.PIXEL_AGENT_CODEX_PORT || 47822);

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    model: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--cwd' && next) {
      options.cwd = next;
      i++;
    } else if (arg === '--host' && next) {
      options.host = next;
      i++;
    } else if (arg === '--port' && next) {
      options.port = Number(next) || DEFAULT_PORT;
      i++;
    } else if (arg === '--model' && next) {
      options.model = next;
      i++;
    }
  }

  return options;
}

function postEvent(options, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      hostname: options.host,
      port: options.port,
      path: '/codex-event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let threadId = null;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch (error) {
      process.stderr.write(`[codex-forward] invalid JSON line: ${error.message}\n`);
      continue;
    }

    if (event.type === 'thread.started' && event.thread_id) {
      threadId = event.thread_id;
    }

    const payload = {
      ...event,
      thread_id: event.thread_id || threadId || null,
      cwd: event.cwd || options.cwd,
      ...(options.model && !event.model ? { model: options.model } : {}),
    };

    if (!payload.thread_id && payload.type !== 'thread.started') {
      continue;
    }

    try {
      await postEvent(options, payload);
    } catch (error) {
      process.stderr.write(`[codex-forward] failed to post ${payload.type}: ${error.message}\n`);
    }
  }

  if (threadId) {
    try {
      await postEvent(options, {
        type: 'exec.completed',
        thread_id: threadId,
        cwd: options.cwd,
        ...(options.model ? { model: options.model } : {}),
      });
    } catch (error) {
      process.stderr.write(`[codex-forward] failed to post exec.completed: ${error.message}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[codex-forward] fatal: ${error.message}\n`);
  process.exitCode = 1;
});
