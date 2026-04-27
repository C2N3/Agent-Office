import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    calculateTokenCost,
    getTotalInputTokens,
    normalizeTokenUsage,
    roundCost,
} from '../pricing';

export function resolveTranscriptPath(filePath) {
    if (!filePath) return null;
    return filePath.startsWith('~')
        ? path.join(os.homedir(), filePath.slice(1))
        : filePath;
}

export function listJsonlFiles(dir) {
    if (!dir || !fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listJsonlFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            files.push(fullPath);
        }
    }

    return files;
}

export function parseJsonLines(content) {
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

export function getEntrySessionId(entry) {
    return entry?.sessionId
        || entry?.session_id
        || entry?.thread_id
        || entry?.payload?.id
        || entry?.payload?.thread_id
        || entry?.payload?.session_id
        || null;
}

function getEntryTimestamp(entry) {
    return entry?.timestamp || entry?.created_at || entry?.createdAt || null;
}

function makeEmptyStats() {
    return {
        model: null,
        sessionId: null,
        userMessages: 0,
        assistantMessages: 0,
        toolUses: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCost: 0,
        firstMessageAt: null,
        lastMessageAt: null,
        lastActivity: null,
    };
}

export function detectSessionFormat(entries, filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('/.codex/sessions/')) {
        return 'codex';
    }
    if (normalizedPath.includes('/.claude/')) {
        return 'claude';
    }

    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.type === 'session_meta' || entry.type === 'event_msg' || entry.type === 'response_item') {
            return 'codex';
        }
    }

    return 'claude';
}

function finalizeCost(stats) {
    stats.estimatedCost = roundCost(stats.estimatedCost);
    return stats;
}

export function parseClaudeEntries(entries) {
    const stats = makeEmptyStats();

    for (const entry of entries) {
        const timestamp = getEntryTimestamp(entry);
        if (timestamp) {
            if (!stats.firstMessageAt) stats.firstMessageAt = timestamp;
            stats.lastMessageAt = timestamp;
            stats.lastActivity = timestamp;
        }

        if (entry.isSidechain) continue;

        const sessionId = getEntrySessionId(entry);
        if (sessionId && !stats.sessionId) {
            stats.sessionId = sessionId;
        }

        if (entry.type === 'user') {
            stats.userMessages++;
        }

        if (entry.type === 'assistant' && entry.message) {
            stats.assistantMessages++;
            if (entry.message.model) stats.model = entry.message.model;

            const usage = normalizeTokenUsage(entry.message.usage);
            if (usage) {
                stats.cacheReadTokens += usage.cacheRead;
                stats.cacheCreationTokens += usage.cacheCreate;
                stats.inputTokens += getTotalInputTokens(usage);
                stats.outputTokens += usage.output;
                stats.estimatedCost += calculateTokenCost(usage, stats.model);
            }

            if (Array.isArray(entry.message.content)) {
                for (const block of entry.message.content) {
                    if (block.type === 'tool_use') {
                        stats.toolUses++;
                    }
                }
            }
        }
    }

    return finalizeCost(stats);
}

export function parseCodexEntries(entries) {
    const stats = makeEmptyStats();
    let turnHasAssistantMessage = false;
    let turnHasUserMessage = false;

    for (const entry of entries) {
        const timestamp = getEntryTimestamp(entry);
        if (timestamp) {
            if (!stats.firstMessageAt) stats.firstMessageAt = timestamp;
            stats.lastMessageAt = timestamp;
            stats.lastActivity = timestamp;
        }

        if (entry.isSidechain) continue;

        const sessionId = getEntrySessionId(entry);
        if (sessionId && !stats.sessionId) {
            stats.sessionId = sessionId;
        }

        if (entry.type === 'session_meta') {
            const payload = entry.payload || {};
            stats.model = payload.model || payload.model_slug || stats.model;
            continue;
        }

        if (entry.type === 'event_msg') {
            const payload = entry.payload || {};
            switch (payload.type) {
                case 'task_started':
                    stats.userMessages++;
                    turnHasUserMessage = true;
                    turnHasAssistantMessage = false;
                    break;

                case 'agent_message':
                    if (!turnHasAssistantMessage) {
                        stats.assistantMessages++;
                        turnHasAssistantMessage = true;
                    }
                    break;

                case 'token_count': {
                    const usage = normalizeTokenUsage(payload.info?.last_token_usage || null);
                    if (usage) {
                        stats.cacheReadTokens += usage.cacheRead;
                        stats.cacheCreationTokens += usage.cacheCreate;
                        stats.inputTokens += getTotalInputTokens(usage);
                        stats.outputTokens += usage.output;
                        stats.estimatedCost += calculateTokenCost(usage, stats.model);
                    }
                    break;
                }

                case 'task_complete':
                    if (turnHasUserMessage && !turnHasAssistantMessage) {
                        stats.assistantMessages++;
                        turnHasAssistantMessage = true;
                    }
                    turnHasUserMessage = false;
                    break;

                default:
                    break;
            }
            continue;
        }

        if (entry.type === 'response_item') {
            const payload = entry.payload || {};
            switch (payload.type) {
                case 'function_call':
                    stats.toolUses++;
                    break;

                case 'message':
                    if (!turnHasAssistantMessage) {
                        stats.assistantMessages++;
                        turnHasAssistantMessage = true;
                    }
                    break;

                default:
                    break;
            }
        }
    }

    return finalizeCost(stats);
}
