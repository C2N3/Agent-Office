// @ts-nocheck
'use strict';

const DEFAULT_CONTEXT_WINDOW = 200_000;

const DEFAULT_PRICING = {
  inputPerMillion: 3,
  outputPerMillion: 15,
  cacheReadPerMillion: 0.3,
  cacheCreatePerMillion: 3.75,
};

const MODEL_PRICING = {
  'claude-opus-4-6': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheCreatePerMillion: 18.75,
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheCreatePerMillion: 3.75,
  },
  'claude-sonnet-4-5': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheCreatePerMillion: 3.75,
  },
  'claude-haiku-4-6': {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheCreatePerMillion: 1,
  },
  codex: {
    inputPerMillion: 1.25,
    outputPerMillion: 10,
    cacheReadPerMillion: 0.125,
    cacheCreatePerMillion: 1.25,
  },
};

const MODEL_CONTEXT_WINDOWS = Object.fromEntries(
  Object.keys(MODEL_PRICING).map((model) => [model, DEFAULT_CONTEXT_WINDOW])
);

function normalizeModelName(model) {
  const normalized = String(model || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'codex' || normalized.includes('codex')) return 'codex';
  return normalized;
}

function getContextWindowSize(model) {
  return MODEL_CONTEXT_WINDOWS[normalizeModelName(model)] || DEFAULT_CONTEXT_WINDOW;
}

function toTokenCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeTokenUsage(rawUsage) {
  if (!rawUsage || typeof rawUsage !== 'object') return null;
  return {
    input: toTokenCount(rawUsage.input_tokens ?? rawUsage.inputTokens ?? rawUsage.input ?? rawUsage.prompt_tokens),
    output: toTokenCount(rawUsage.output_tokens ?? rawUsage.outputTokens ?? rawUsage.output ?? rawUsage.completion_tokens),
    cacheRead: toTokenCount(
      rawUsage.cache_read_input_tokens
        ?? rawUsage.cached_input_tokens
        ?? rawUsage.cacheReadTokens
        ?? rawUsage.cacheRead
    ),
    cacheCreate: toTokenCount(
      rawUsage.cache_creation_input_tokens
        ?? rawUsage.cacheCreationInputTokens
        ?? rawUsage.cacheCreationTokens
        ?? rawUsage.cacheCreate
    ),
  };
}

function roundCost(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function calculateTokenCost(rawUsage, model) {
  const usage = normalizeTokenUsage(rawUsage);
  if (!usage) return 0;

  const pricing = MODEL_PRICING[normalizeModelName(model)] || DEFAULT_PRICING;
  const cacheReadRate = pricing.cacheReadPerMillion ?? pricing.inputPerMillion;
  const cacheCreateRate = pricing.cacheCreatePerMillion ?? pricing.inputPerMillion;

  return roundCost((
    usage.input * pricing.inputPerMillion
    + usage.output * pricing.outputPerMillion
    + usage.cacheRead * cacheReadRate
    + usage.cacheCreate * cacheCreateRate
  ) / 1_000_000);
}

function getTotalInputTokens(usage) {
  if (!usage) return 0;
  return usage.input + usage.cacheRead + usage.cacheCreate;
}

module.exports = {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_PRICING,
  MODEL_CONTEXT_WINDOWS,
  MODEL_PRICING,
  calculateTokenCost,
  getContextWindowSize,
  getTotalInputTokens,
  normalizeModelName,
  normalizeTokenUsage,
  roundCost,
};
