// @ts-nocheck

const {
  calculateTokenCost,
  getContextWindowSize,
  getTotalInputTokens,
  normalizeTokenUsage,
  roundCost,
} = require('../../pricing');

function buildAccumulatedTokenUsage(agent, event) {
  const usage = normalizeTokenUsage(event.tokenUsage);
  if (!usage) return agent.tokenUsage || null;

  const current = agent.tokenUsage || {};
  const inputTokens = (Number(current.inputTokens) || 0) + getTotalInputTokens(usage);
  const outputTokens = (Number(current.outputTokens) || 0) + usage.output;
  const model = event.model || agent.model || null;
  const contextWindow = getContextWindowSize(model);
  const contextPercent = contextWindow > 0
    ? Math.min(100, Math.round((inputTokens / contextWindow) * 10000) / 100)
    : 0;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: (Number(current.cacheReadTokens) || 0) + usage.cacheRead,
    cacheCreationTokens: (Number(current.cacheCreationTokens) || 0) + usage.cacheCreate,
    estimatedCost: roundCost((Number(current.estimatedCost) || 0) + calculateTokenCost(usage, model)),
    contextPercent,
  };
}

function resetContextPercent(tokenUsage) {
  return tokenUsage ? { ...tokenUsage, contextPercent: 0 } : null;
}

module.exports = {
  buildAccumulatedTokenUsage,
  resetContextPercent,
};
