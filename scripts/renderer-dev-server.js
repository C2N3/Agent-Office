#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { URL } = require('url');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function createDevClientScript() {
  return `
const source = new EventSource('/__dev/events');

function refreshCss(targetPath) {
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    const nextUrl = new URL(href, window.location.href);
    if (nextUrl.pathname !== targetPath) return;

    nextUrl.searchParams.set('v', String(Date.now()));
    link.href = nextUrl.pathname + nextUrl.search;
  });
}

source.onmessage = (event) => {
  try {
    const payload = JSON.parse(event.data);
    if (payload.type === 'css-update' && payload.path) {
      refreshCss(payload.path);
      return;
    }
  } catch (error) {
    console.warn('[renderer-dev] Invalid payload', error);
  }

  window.location.reload();
};

source.onerror = () => {
  console.warn('[renderer-dev] Lost HMR connection, falling back to page reload on reconnect.');
};
`.trim();
}

function startRendererDevServer({
  apiOrigin = process.env.DASHBOARD_API_ORIGIN || 'http://localhost:3000',
  port = Number(process.env.DASHBOARD_DEV_SERVER_PORT || 3001),
  projectRoot = path.join(__dirname, '..'),
} = {}) {
  const clients = new Set();
  const apiUrl = new URL(apiOrigin);
  const devClientScript = createDevClientScript();

  function injectDevClient(html) {
    const marker = '</body>';
    const injection = '  <script type="module" src="/__dev/client.js"></script>\n';
    return html.includes(marker)
      ? html.replace(marker, `${injection}${marker}`)
      : `${html}\n${injection}`;
  }

  function writeNotFound(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }

  function safeResolve(basePath, relativePath) {
    const resolved = path.resolve(basePath, relativePath);
    const rel = path.relative(basePath, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return null;
    }
    return resolved;
  }

  function resolvePublicFile(requestPath) {
    const relativePath = requestPath.replace(/^\/+/, '');
    if (requestPath.startsWith('/dist/')) {
      const distFile = safeResolve(projectRoot, relativePath);
      if (distFile && fs.existsSync(distFile) && fs.statSync(distFile).isFile()) {
        return distFile;
      }
      return null;
    }

    const distCandidate = safeResolve(path.join(projectRoot, 'dist'), relativePath);
    if (distCandidate && fs.existsSync(distCandidate) && fs.statSync(distCandidate).isFile()) {
      return distCandidate;
    }

    const sourceCandidate = safeResolve(projectRoot, relativePath);
    if (sourceCandidate && fs.existsSync(sourceCandidate) && fs.statSync(sourceCandidate).isFile()) {
      return sourceCandidate;
    }

    return null;
  }

  function serveFile(res, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';
    fs.readFile(filePath, (error, data) => {
      if (error) {
        writeNotFound(res);
        return;
      }

      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Type': contentType,
      });
      res.end(data);
    });
  }

  function writeProxyError(res, error) {
    if (res.destroyed || res.writableEnded) {
      return;
    }

    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Proxy error: ${error.message}`);
  }

  function proxyHttpRequest(req, res) {
    const targetUrl = new URL(req.url, apiUrl);
    const proxyRequest = http.request({
      protocol: apiUrl.protocol,
      hostname: apiUrl.hostname,
      port: apiUrl.port,
      method: req.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: {
        ...req.headers,
        host: apiUrl.host,
      },
    }, (proxyResponse) => {
      res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(res);
    });

    proxyRequest.on('error', (error) => {
      writeProxyError(res, error);
    });

    req.pipe(proxyRequest);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === '/__dev/events') {
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
      });
      res.write(': connected\n\n');
      clients.add(res);

      req.on('close', () => {
        clients.delete(res);
      });
      return;
    }

    if (pathname === '/__dev/client.js') {
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/javascript; charset=utf-8',
      });
      res.end(devClientScript);
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      fs.readFile(path.join(projectRoot, 'dashboard.html'), 'utf8', (error, html) => {
        if (error) {
          writeNotFound(res);
          return;
        }
        res.writeHead(200, {
          'Cache-Control': 'no-cache',
          'Content-Type': 'text/html; charset=utf-8',
        });
        res.end(injectDevClient(html));
      });
      return;
    }

    if (pathname === '/pip') {
      fs.readFile(path.join(projectRoot, 'pip.html'), 'utf8', (error, html) => {
        if (error) {
          writeNotFound(res);
          return;
        }
        res.writeHead(200, {
          'Cache-Control': 'no-cache',
          'Content-Type': 'text/html; charset=utf-8',
        });
        res.end(injectDevClient(html));
      });
      return;
    }

    if (pathname.startsWith('/api/') || pathname.startsWith('/lib/')) {
      proxyHttpRequest(req, res);
      return;
    }

    if (pathname.startsWith('/dist/') || pathname.startsWith('/public/')) {
      const filePath = resolvePublicFile(pathname);
      if (!filePath) {
        writeNotFound(res);
        return;
      }
      serveFile(res, filePath);
      return;
    }

    writeNotFound(res);
  });

  server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    if (requestUrl.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const upstream = net.connect(Number(apiUrl.port || 80), apiUrl.hostname, () => {
      const lines = [`GET ${requestUrl.pathname}${requestUrl.search} HTTP/1.1`];
      for (const [name, value] of Object.entries(req.headers)) {
        lines.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`);
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head?.length) {
        upstream.write(head);
      }
      socket.pipe(upstream).pipe(socket);
    });

    upstream.on('error', () => {
      socket.destroy();
    });
  });

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  return {
    broadcastUpdate(payload) {
      const message = `data: ${JSON.stringify(payload)}\n\n`;
      for (const client of clients) {
        client.write(message);
      }
    },
    close() {
      for (const client of clients) {
        client.end();
      }
      clients.clear();
      server.close();
    },
    port,
    ready,
    url: `http://localhost:${port}`,
  };
}

module.exports = {
  startRendererDevServer,
};

if (require.main === module) {
  startRendererDevServer();
}
