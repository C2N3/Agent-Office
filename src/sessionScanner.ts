// @ts-nocheck
// -nocheck
/**
 * Session Scanner
 * Parses JSONL transcripts to extract token/cost/session statistics and
 * supplements them into the agentManager.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getCodexSessionRoots } = require('./main/codexPaths');
const { roundCost, calculateTokenCost, normalizeModelName } = require('./pricing');

function resolveTranscriptPath(filePath) {
    if (!filePath) return null;
    return filePath.startsWith('~')
        ? path.join(os.homedir(), filePath.slice(1))
        : filePath;
}

function listJsonlFiles(dir) {
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

function parseJsonLines(content) {
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

function getEntrySessionId(entry) {
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

function normalizeTokenUsage(rawUsage) {
    if (!rawUsage) return null;

    const input = rawUsage.input_tokens
        ?? rawUsage.inputTokens
        ?? rawUsage.input
        ?? 0;
    const output = rawUsage.output_tokens
        ?? rawUsage.outputTokens
        ?? rawUsage.output
        ?? 0;
    const cacheRead = rawUsage.cache_read_input_tokens
        ?? rawUsage.cached_input_tokens
        ?? rawUsage.cacheRead
        ?? 0;
    const cacheCreate = rawUsage.cache_creation_input_tokens
        ?? rawUsage.cacheCreate
        ?? 0;

    return {
        input,
        output,
        cacheRead,
        cacheCreate,
    };
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

function detectSessionFormat(entries, filePath) {
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
    stats.estimatedCost = roundCost(calculateTokenCost({
        input: stats.inputTokens - stats.cacheReadTokens - stats.cacheCreationTokens,
        cacheRead: stats.cacheReadTokens,
        cacheCreate: stats.cacheCreationTokens,
        output: stats.outputTokens,
    }, normalizeModelName(stats.model)));
    return stats;
}

function parseClaudeEntries(entries) {
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
                stats.inputTokens += usage.input + usage.cacheRead + usage.cacheCreate;
                stats.outputTokens += usage.output;
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

function parseCodexEntries(entries) {
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
                        stats.inputTokens += usage.input + usage.cacheRead + usage.cacheCreate;
                        stats.outputTokens += usage.output;
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

class SessionScanner {
    /**
     * @param {import('./agentManager')} agentManager
     * @param {(msg: string) => void} [debugLog]
     */
    constructor(agentManager, debugLog = () => { }) {
        this.agentManager = agentManager;
        this.debugLog = debugLog;
        this.scanInterval = null;
        /** @type {Map<string, SessionStats>} agentId → last scan result */
        this.lastScanResults = new Map();
    }

    /**
     * Start periodic scanning
     * @param {number} intervalMs Scan interval (default 60 seconds)
     */
    start(intervalMs = 60_000) {
        this.debugLog('[SessionScanner] Started');
        this.scanAll();
        this.scanInterval = setInterval(() => this.scanAll(), intervalMs);
    }

    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        this.debugLog('[SessionScanner] Stopped');
    }

    /** Scan all agents' JSONL files and update statistics */
    scanAll() {
        if (!this.agentManager) return;
        const agents = this.agentManager.getAllAgents();
        const codexSessionStats = this._scanCodexSessionFiles();
        let updated = 0;

        for (const agent of agents) {
            const provider = agent.provider || 'claude';
            if (agent.provider && provider !== 'claude' && provider !== 'codex') continue;

            let stats = null;
            if (provider === 'codex') {
                const sessionKey = agent.sessionId || agent.id;
                stats = codexSessionStats.get(sessionKey) || null;
                if (!stats && agent.jsonlPath) {
                    stats = this.parseSessionFile(agent.jsonlPath, { providerHint: 'codex' });
                }
            } else {
                if (!agent.jsonlPath) continue;
                stats = this.parseSessionFile(agent.jsonlPath, { providerHint: 'claude' });
            }

            if (!stats) continue;

            try {
                this.lastScanResults.set(agent.id, stats);

                const cur = agent.tokenUsage || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
                if (stats.inputTokens > cur.inputTokens || stats.outputTokens > cur.outputTokens) {
                    this.agentManager.updateAgent({
                        ...agent,
                        tokenUsage: {
                            inputTokens: stats.inputTokens,
                            outputTokens: stats.outputTokens,
                            estimatedCost: stats.estimatedCost,
                        },
                        model: agent.model || stats.model || null,
                    }, 'scanner');
                    updated++;
                }
            } catch (e) {
                this.debugLog(`[SessionScanner] Error scanning ${agent.jsonlPath || agent.sessionId || agent.id}: ${e.message}`);
            }
        }

        if (updated > 0) {
            this.debugLog(`[SessionScanner] Updated ${updated} agent(s) from JSONL scan`);
        }
    }

    /**
     * Parse a single JSONL file
     * @param {string} filePath transcript_path value (may include ~/... format)
     * @param {{ providerHint?: string }} [options]
     * @returns {SessionStats | null}
     */
    parseSessionFile(filePath, options = {}) {
        const resolvedPath = resolveTranscriptPath(filePath);
        if (!resolvedPath) return null;

        let content;
        try {
            content = fs.readFileSync(resolvedPath, 'utf-8');
        } catch {
            return null;
        }

        const entries = parseJsonLines(content);
        if (entries.length === 0) return null;

        const format = options.providerHint || detectSessionFormat(entries, resolvedPath);
        const stats = format === 'codex'
            ? parseCodexEntries(entries)
            : parseClaudeEntries(entries);

        if (!stats.sessionId) {
            stats.sessionId = getEntrySessionId(entries[0]) || null;
        }

        if (!stats.model) {
            const firstModelEntry = entries.find((entry) =>
                entry?.message?.model || entry?.payload?.model || entry?.payload?.model_slug
            );
            stats.model = firstModelEntry?.message?.model
                || firstModelEntry?.payload?.model
                || firstModelEntry?.payload?.model_slug
                || null;
        }

        return stats;
    }

    /**
     * Scan Codex session files and return stats keyed by session id.
     * @returns {Map<string, SessionStats>}
     */
    _scanCodexSessionFiles() {
        const statsBySessionId = new Map();
        const roots = getCodexSessionRoots();

        for (const root of roots) {
            for (const filePath of listJsonlFiles(root)) {
                try {
                    const stats = this.parseSessionFile(filePath, { providerHint: 'codex' });
                    if (stats && stats.sessionId) {
                        statsBySessionId.set(stats.sessionId, stats);
                    }
                } catch (e) {
                    this.debugLog(`[SessionScanner] Error scanning Codex file ${filePath}: ${e.message}`);
                }
            }
        }

        return statsBySessionId;
    }

    /**
     * Return scan statistics for a specific agent
     * @param {string} agentId
     * @returns {SessionStats | null}
     */
    getSessionStats(agentId) {
        return this.lastScanResults.get(agentId) || null;
    }

    /**
     * Return all scan results (for dashboard API)
     * @returns {Record<string, SessionStats>}
     */
    getAllStats() {
        return Object.fromEntries(this.lastScanResults);
    }
}

/**
 * @typedef {Object} SessionStats
 * @property {string|null} model
 * @property {string|null} sessionId
 * @property {number} userMessages
 * @property {number} assistantMessages
 * @property {number} toolUses
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheReadTokens
 * @property {number} cacheCreationTokens
 * @property {number} estimatedCost
 * @property {string|null} firstMessageAt
 * @property {string|null} lastMessageAt
 * @property {string|null} lastActivity
 */

module.exports = SessionScanner;
