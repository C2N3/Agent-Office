export type NumericTokenUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  output_tokens?: number;
};

type TokenUsageSnapshot = Partial<AggregateTokenUsage> & Partial<NumericTokenUsage>;

export type AgentUsageLike = {
  model?: string | null;
  tokenUsage?: TokenUsageSnapshot | null;
};

export type AggregateTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  contextPercent: number;
};

const {
  calculateTokenCost,
  roundCost,
  getContextWindowSize,
} = require('../../pricing.js') as {
  calculateTokenCost: (usage: {
    input: number;
    cacheRead: number;
    cacheCreate: number;
    output: number;
  }, model: string) => number;
  roundCost: (value: number) => number;
  getContextWindowSize: (model?: string | null) => number;
};

export function computeTokenUsage(agent: AgentUsageLike, tokenUsage?: NumericTokenUsage | null): AggregateTokenUsage | null {
  if (!tokenUsage) return null;

  const current: AggregateTokenUsage = {
    inputTokens: Number((agent.tokenUsage as Partial<AggregateTokenUsage> | null | undefined)?.inputTokens) || 0,
    outputTokens: Number((agent.tokenUsage as Partial<AggregateTokenUsage> | null | undefined)?.outputTokens) || 0,
    estimatedCost: Number((agent.tokenUsage as Partial<AggregateTokenUsage> | null | undefined)?.estimatedCost) || 0,
    contextPercent: Number((agent.tokenUsage as Partial<AggregateTokenUsage> | null | undefined)?.contextPercent) || 0,
  };
  const directInputTokens = tokenUsage.input_tokens || 0;
  const cachedInputTokens = tokenUsage.cached_input_tokens || tokenUsage.cache_read_input_tokens || 0;
  const cacheCreationTokens = tokenUsage.cache_creation_input_tokens || 0;
  const totalInputDelta = directInputTokens + cachedInputTokens + cacheCreationTokens;
  const outputDelta = tokenUsage.output_tokens || 0;

  const inputTokens = current.inputTokens + totalInputDelta;
  const outputTokens = current.outputTokens + outputDelta;
  const estimatedCost = agent.model
    ? roundCost(current.estimatedCost + calculateTokenCost({
      input: directInputTokens,
      cacheRead: cachedInputTokens,
      cacheCreate: cacheCreationTokens,
      output: outputDelta,
    }, agent.model))
    : (current.estimatedCost || 0);

  const contextWindow = Number(getContextWindowSize(agent.model)) || 0;
  const contextPercent = contextWindow > 0 ? Math.min(100, Math.round((totalInputDelta / contextWindow) * 100)) : 0;

  return { inputTokens, outputTokens, estimatedCost, contextPercent };
}
