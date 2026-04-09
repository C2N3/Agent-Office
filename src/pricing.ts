// @ts-nocheck
/**
 * Model Pricing — shared across hookProcessor and sessionScanner
 */

'use strict';

const MODEL_ALIASES = {
    'gpt-5-codex': 'codex',
    'codex': 'codex',
};

const MODEL_PRICING = {
    'claude-opus-4-5': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
    'claude-opus-4-6': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-6': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
    // Codex models currently share the fallback pricing profile in this app.
    codex: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
};

const DEFAULT_PRICING = { input: 3 / 1_000_000, output: 15 / 1_000_000 };

const MODEL_CONTEXT_WINDOWS = {
    'claude-opus-4-5': 200000,
    'claude-sonnet-4-5': 200000,
    'claude-haiku-4-5': 200000,
    'claude-opus-4-6': 200000,
    'claude-sonnet-4-6': 200000,
    'claude-haiku-4-6': 200000,
    codex: 200000,
};

const DEFAULT_CONTEXT_WINDOW = 200000;

/**
 * @param {string|null|undefined} model
 * @returns {number}
 */
function normalizeModelName(model) {
    if (!model) return null;
    const key = String(model).trim();
    if (!key) return null;
    return MODEL_ALIASES[key] || key;
}

function getContextWindowSize(model) {
    const resolvedModel = normalizeModelName(model);
    if (!resolvedModel) return DEFAULT_CONTEXT_WINDOW;
    return MODEL_CONTEXT_WINDOWS[resolvedModel] || DEFAULT_CONTEXT_WINDOW;
}

/**
 * Round cost to 5 decimal places
 * @param {number} cost
 * @returns {number}
 */
function roundCost(cost) {
    return Math.round(cost * 100000) / 100000;
}

const CACHE_READ_DISCOUNT = 0.1;
const CACHE_CREATION_PREMIUM = 1.25;

/**
 * Calculate token cost with cache discount/premium
 * @param {{ input: number, cacheRead: number, cacheCreate: number, output: number }} tokens
 * @param {string|null} model
 * @returns {number}
 */
function calculateTokenCost({ input, cacheRead, cacheCreate, output }, model) {
    const resolvedModel = normalizeModelName(model);
    const pricing = (resolvedModel && MODEL_PRICING[resolvedModel]) || DEFAULT_PRICING;
    return input * pricing.input +
        cacheRead * pricing.input * CACHE_READ_DISCOUNT +
        cacheCreate * pricing.input * CACHE_CREATION_PREMIUM +
        output * pricing.output;
}

module.exports = { MODEL_ALIASES, MODEL_PRICING, DEFAULT_PRICING, MODEL_CONTEXT_WINDOWS, DEFAULT_CONTEXT_WINDOW, normalizeModelName, getContextWindowSize, roundCost, calculateTokenCost };
