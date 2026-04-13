
const MODEL_PRICING = {
  'claude-opus-4-6': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4-6': { inputPerMillion: 0.8, outputPerMillion: 4 },
};

function roundCost(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function normalizeModelName(model) {
  return String(model || '').trim().toLowerCase();
}

function calculateTokenCost(usage, model) {
  const pricing = MODEL_PRICING[normalizeModelName(model)];
  if (!pricing) return 0;
  const inputTokens = (usage.input || 0) + (usage.cacheRead || 0) + (usage.cacheCreate || 0);
  const outputTokens = usage.output || 0;
  return (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;
}

function normalizeTokenUsage(rawUsage) {
  if (!rawUsage) return null;
  return {
    input: rawUsage.input_tokens ?? rawUsage.inputTokens ?? rawUsage.input ?? 0,
    output: rawUsage.output_tokens ?? rawUsage.outputTokens ?? rawUsage.output ?? 0,
    cacheRead: rawUsage.cache_read_input_tokens ?? rawUsage.cached_input_tokens ?? rawUsage.cacheRead ?? 0,
    cacheCreate: rawUsage.cache_creation_input_tokens ?? rawUsage.cacheCreate ?? 0,
  };
}

function applyUsage(day, usage, model) {
  if (!usage) return;

  const resolvedModel = normalizeModelName(model);
  const inputTokens = usage.input + usage.cacheRead + usage.cacheCreate;
  const entryCost = roundCost(calculateTokenCost({
    input: usage.input,
    cacheRead: usage.cacheRead,
    cacheCreate: usage.cacheCreate,
    output: usage.output,
  }, resolvedModel));

  day.inputTokens += inputTokens;
  day.outputTokens += usage.output;
  day.estimatedCost = roundCost(day.estimatedCost + entryCost);

  if (model) {
    if (!day.byModel[model]) {
      day.byModel[model] = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
    }
    day.byModel[model].inputTokens += inputTokens;
    day.byModel[model].outputTokens += usage.output;
    day.byModel[model].estimatedCost = roundCost(day.byModel[model].estimatedCost + entryCost);
  }
}

module.exports = { applyUsage, normalizeTokenUsage };
