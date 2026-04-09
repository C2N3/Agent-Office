"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeTokenUsage = computeTokenUsage;
const { calculateTokenCost, roundCost, getContextWindowSize, } = require('../../pricing.js');
function computeTokenUsage(agent, tokenUsage) {
    if (!tokenUsage)
        return null;
    const current = {
        inputTokens: Number(agent.tokenUsage?.inputTokens) || 0,
        outputTokens: Number(agent.tokenUsage?.outputTokens) || 0,
        estimatedCost: Number(agent.tokenUsage?.estimatedCost) || 0,
        contextPercent: Number(agent.tokenUsage?.contextPercent) || 0,
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
