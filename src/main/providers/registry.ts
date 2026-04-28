type ProviderDefinition = {
  id: string;
  label: string;
  cliCommand: string;
  processPattern: string;
  unixProcessPattern: string;
  windowsNodeProcessOnly?: boolean;
  rejectWindowsApps?: boolean;
  rejectMacApp?: boolean;
  supportsTranscriptStats: boolean;
  supportsLiveness: boolean;
  supportsActiveSessionFileRecovery: boolean;
  buildResumeCommand?: (sessionId: string) => string;
};

const DEFAULT_PROVIDER = 'claude';

const PROVIDER_DEFINITIONS: Record<string, ProviderDefinition> = Object.freeze({
  claude: Object.freeze({
    id: 'claude',
    label: 'Claude',
    cliCommand: 'claude',
    processPattern: 'claude',
    unixProcessPattern: 'node.*claude',
    windowsNodeProcessOnly: true,
    rejectWindowsApps: true,
    rejectMacApp: true,
    supportsTranscriptStats: true,
    supportsLiveness: true,
    supportsActiveSessionFileRecovery: false,
    buildResumeCommand: (sessionId) => `claude --resume ${sessionId}\r`,
  }),
  codex: Object.freeze({
    id: 'codex',
    label: 'Codex',
    cliCommand: 'codex',
    processPattern: 'codex',
    unixProcessPattern: 'codex',
    supportsTranscriptStats: true,
    supportsLiveness: true,
    supportsActiveSessionFileRecovery: true,
    buildResumeCommand: (sessionId) => `codex resume ${sessionId}\r`,
  }),
  gemini: Object.freeze({
    id: 'gemini',
    label: 'Gemini',
    cliCommand: 'gemini',
    processPattern: 'gemini',
    unixProcessPattern: 'gemini',
    supportsTranscriptStats: false,
    supportsLiveness: true,
    supportsActiveSessionFileRecovery: false,
  }),
});

const KNOWN_PROVIDERS = Object.freeze(Object.keys(PROVIDER_DEFINITIONS));

function isKnownProvider(provider: string | null | undefined): boolean {
  const normalized = String(provider || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROVIDER_DEFINITIONS, normalized);
}

function normalizeProvider(provider: string | null | undefined, fallback: string | null = DEFAULT_PROVIDER): string | null {
  const normalized = String(provider || '').trim().toLowerCase();
  if (isKnownProvider(normalized)) return normalized;
  if (fallback === null) return null;
  return isKnownProvider(fallback) ? fallback : DEFAULT_PROVIDER;
}

function getProviderDefinition(provider: string | null | undefined): ProviderDefinition {
  return PROVIDER_DEFINITIONS[normalizeProvider(provider) || DEFAULT_PROVIDER];
}

function getProviderDefinitionOrNull(provider: string | null | undefined): ProviderDefinition | null {
  const normalized = normalizeProvider(provider, null);
  return normalized ? PROVIDER_DEFINITIONS[normalized] : null;
}

function getProviderIds(): string[] {
  return [...KNOWN_PROVIDERS];
}

function buildProviderResumeCommand(provider: string | null | undefined, sessionId: string | null | undefined): string | null {
  if (!sessionId) return null;
  const definition = String(provider || '').trim()
    ? getProviderDefinitionOrNull(provider)
    : getProviderDefinition(DEFAULT_PROVIDER);
  if (!definition) return null;
  return definition.buildResumeCommand ? definition.buildResumeCommand(sessionId) : null;
}

function providerSupportsTranscriptStats(provider: string | null | undefined): boolean {
  return getProviderDefinitionOrNull(provider)?.supportsTranscriptStats || false;
}

function providerSupportsLiveness(provider: string | null | undefined): boolean {
  return getProviderDefinitionOrNull(provider)?.supportsLiveness || false;
}

function providerSupportsActiveSessionFileRecovery(provider: string | null | undefined): boolean {
  return getProviderDefinitionOrNull(provider)?.supportsActiveSessionFileRecovery || false;
}

export {
  DEFAULT_PROVIDER,
  KNOWN_PROVIDERS,
  PROVIDER_DEFINITIONS,
  buildProviderResumeCommand,
  getProviderDefinition,
  getProviderDefinitionOrNull,
  getProviderIds,
  isKnownProvider,
  normalizeProvider,
  providerSupportsActiveSessionFileRecovery,
  providerSupportsLiveness,
  providerSupportsTranscriptStats,
};
