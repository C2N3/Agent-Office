/**
 * Session Scanner
 * Parses JSONL transcripts to extract token/cost/session statistics and
 * supplements them into the agentManager.
 */

'use strict';

const fs = require('fs');
const { getCodexSessionRoots } = require('./main/providers/codex/paths');
const { normalizeProvider, providerSupportsTranscriptStats } = require('./main/providers/registry');
const {
    detectSessionFormat,
    getEntrySessionId,
    listJsonlFiles,
    parseClaudeEntries,
    parseCodexEntries,
    parseJsonLines,
    resolveTranscriptPath,
} = require('./sessionScanner/parser');

type SessionStats = {
    model: string | null;
    sessionId: string | null;
    userMessages: number;
    assistantMessages: number;
    toolUses: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    estimatedCost: number;
    firstMessageAt: string | null;
    lastMessageAt: string | null;
    lastActivity: string | null;
};

class SessionScanner {
    declare agentManager: any;
    declare debugLog: (message: string) => void;
    declare scanInterval: NodeJS.Timeout | null;
    declare lastScanResults: Map<string, SessionStats>;

    /**
     * @param {import('./agentManager')} agentManager
     * @param {(msg: string) => void} [debugLog]
     */
    constructor(agentManager, debugLog: (message: string) => void = () => { }) {
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
            const provider = normalizeProvider(agent.provider, agent.provider ? null : undefined);
            if (!provider) continue;
            if (!providerSupportsTranscriptStats(provider)) continue;

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
    parseSessionFile(filePath, options: { providerHint?: string } = {}) {
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

export { SessionScanner };
module.exports = SessionScanner;
