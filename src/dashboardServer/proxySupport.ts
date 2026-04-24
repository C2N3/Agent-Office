export interface ProxyResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: any): void;
  on?(event: string, listener: (...args: any[]) => void): void;
}

export interface ProxyRequestLike {
  on?(event: string, listener: (...args: any[]) => void): void;
}

export const CENTRAL_PROXY_TIMEOUT_MS = 15000;

export function writeJSON(res: ProxyResponseLike, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function writeProxyError(res: ProxyResponseLike, targetUrl: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error || 'Central server request failed');
  writeJSON(res, 502, {
    error: {
      message,
      targetUrl,
    },
  });
}

export function createProxyRequestAbort(
  req: ProxyRequestLike,
  res: ProxyResponseLike,
  timeoutMs = CENTRAL_PROXY_TIMEOUT_MS,
): {
  signal: AbortSignal;
  wasTimedOut(): boolean;
  cleanup(): void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;
  req.on?.('aborted', () => controller.abort());
  res.on?.('close', () => controller.abort());
  return {
    signal: controller.signal,
    wasTimedOut: () => timedOut,
    cleanup: () => {
      if (timeout) clearTimeout(timeout);
    },
  };
}
