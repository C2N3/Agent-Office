export const CENTRAL_SERVER_REQUEST_TIMEOUT_MS = 5000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = CENTRAL_SERVER_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let timedOut = false;
  let abortFromUpstream: (() => void) | null = null;

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      abortFromUpstream = () => controller.abort(upstreamSignal.reason);
      upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
    }
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut && error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (upstreamSignal && abortFromUpstream) {
      upstreamSignal.removeEventListener('abort', abortFromUpstream);
    }
  }
}
