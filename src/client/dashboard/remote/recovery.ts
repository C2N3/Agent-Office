export function isLoopbackCentralServer(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.trim().toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export function createRoomAccessSecret(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random generation is unavailable in this runtime');
  }
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `ao_${hex}`;
}
