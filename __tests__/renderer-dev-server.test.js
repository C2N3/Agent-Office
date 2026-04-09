const EventEmitter = require('events');

jest.mock('http', () => {
  const EventEmitter = require('events');

  return {
    createServer: jest.fn(() => {
      const server = new EventEmitter();
      server.listen = jest.fn((port, cb) => { if (cb) cb(); });
      server.close = jest.fn((cb) => { if (cb) cb(); });
      return server;
    }),
    request: jest.fn(),
  };
});

const http = require('http');
const { startRendererDevServer } = require('../scripts/renderer-dev-server');

function createMockReqRes(url) {
  const req = new EventEmitter();
  req.method = 'GET';
  req.url = url;
  req.headers = { host: 'localhost:3001' };
  req.pipe = jest.fn();

  const res = {
    destroyed: false,
    headersSent: false,
    writableEnded: false,
    destroy: jest.fn((error) => {
      res.destroyed = true;
      res.destroyError = error;
    }),
    end: jest.fn((body) => {
      res.writableEnded = true;
      res.body = body;
    }),
    writeHead: jest.fn(() => {
      res.headersSent = true;
    }),
  };

  return { req, res };
}

function setupProxyRequest(configure = () => {}) {
  const proxyRequest = new EventEmitter();
  proxyRequest.end = jest.fn();
  proxyRequest.write = jest.fn();

  http.request.mockImplementation((options, callback) => {
    configure({ callback, options, proxyRequest });
    return proxyRequest;
  });

  startRendererDevServer({ apiOrigin: 'http://localhost:3000', port: 0 });

  return {
    handler: http.createServer.mock.calls.at(-1)[0],
    proxyRequest,
  };
}

describe('renderer-dev-server proxy errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 502 when upstream fails before the response starts', () => {
    const { handler, proxyRequest } = setupProxyRequest();
    const { req, res } = createMockReqRes('/api/agents');

    handler(req, res);
    const error = new Error('upstream down');
    proxyRequest.emit('error', error);

    expect(req.pipe).toHaveBeenCalledWith(proxyRequest);
    expect(res.writeHead).toHaveBeenCalledWith(502, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    expect(res.end).toHaveBeenCalledWith('Proxy error: upstream down');
    expect(res.destroy).not.toHaveBeenCalled();
  });

  test('destroys the response instead of rewriting headers after proxy response starts', () => {
    const proxyResponse = {
      headers: { 'content-type': 'application/json' },
      pipe: jest.fn(),
      statusCode: 200,
    };

    const { handler, proxyRequest } = setupProxyRequest(({ callback }) => {
      callback(proxyResponse);
    });
    const { req, res } = createMockReqRes('/api/agents');

    handler(req, res);
    const error = new Error('socket hang up');
    proxyRequest.emit('error', error);

    expect(res.writeHead).toHaveBeenCalledTimes(1);
    expect(res.writeHead).toHaveBeenCalledWith(200, proxyResponse.headers);
    expect(proxyResponse.pipe).toHaveBeenCalledWith(res);
    expect(res.destroy).toHaveBeenCalledWith(error);
    expect(res.end).not.toHaveBeenCalledWith('Proxy error: socket hang up');
  });
});
