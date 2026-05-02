
const CLAUDE_PATTERNS = [
  /context.*(full|exhaust|limit|exceeded)/i,
  /max.*context.*length.*exceeded/i,
  /conversation.*too.*long/i,
  /"type"\s*:\s*"error".*context/i,
  /token.*limit.*reached/i,
];

const CODEX_PATTERNS = [
  /context.*exhaust/i,
  /token.*limit.*reached/i,
  /maximum.*context/i,
];

const GEMINI_PATTERNS = [
  /context.*window/i,
  /token.*limit/i,
  /input.*too.*long/i,
];

export const PATTERNS_BY_PROVIDER = {
  claude: CLAUDE_PATTERNS,
  codex: CODEX_PATTERNS,
  gemini: GEMINI_PATTERNS,
};

export function detectContextExhaustion(buffer, provider) {
  const patterns = PATTERNS_BY_PROVIDER[provider] || [];

  for (const pattern of patterns) {
    const match = buffer.match(pattern);
    if (match) {
      return {
        isExhausted: true,
        confidence: 'high',
        evidence: match[0],
        provider,
      };
    }
  }

  return {
    isExhausted: false,
    confidence: 'low',
    evidence: '',
    provider,
  };
}
