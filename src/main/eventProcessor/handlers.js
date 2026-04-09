"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventHandlers = createEventHandlers;
const path = __importStar(require("node:path"));
const tokenUsage_js_1 = require("./tokenUsage.js");
function createEventHandlers({ agentManager, agentRegistry, sessionPids, debugLog, detectPidByTranscript, logPrefix = 'Event', createSource = 'event', updateSource = 'event', state, }) {
    const { resolveSessionId, resolveAgentId, rememberSessionContext, getSessionContext, canBindRegistryAgent, cleanupSessionResources, enqueueSessionStart, flushPendingStarts: flushPendingStartsFromState, firstToolUseDone, sessionToRegistry, adoptSessionIdentity, } = state;
    function handlePidReconnect({ sessionId, toolName, toolInput, transcriptPath, }) {
        if (typeof detectPidByTranscript !== 'function')
            return;
        if (toolName !== 'Bash' || !toolInput)
            return;
        if (!/echo\s+\$(\$|PPID)/.test(toolInput.command || ''))
            return;
        const agent = agentManager && agentManager.getAgent(sessionId);
        const jsonlPath = (agent && agent.jsonlPath) || transcriptPath || null;
        debugLog(`[${logPrefix}] PID reconnect trigger: ${sessionId.slice(0, 8)} (echo detected)`);
        if (agent && !sessionPids.has(sessionId)) {
            agentManager.updateAgent({ ...agent, firstSeen: Date.now() }, updateSource);
        }
        detectPidByTranscript(jsonlPath, (result) => {
            if (typeof result === 'number') {
                sessionPids.set(sessionId, result);
                debugLog(`[${logPrefix}] PID reconnected: ${sessionId.slice(0, 8)} -> pid=${result}`);
            }
            else if (Array.isArray(result)) {
                const registeredPids = new Set(sessionPids.values());
                const newPid = result.find((pid) => !registeredPids.has(pid));
                if (newPid) {
                    sessionPids.set(sessionId, newPid);
                    debugLog(`[${logPrefix}] PID reconnected (fallback): ${sessionId.slice(0, 8)} -> pid=${newPid}`);
                }
            }
        });
    }
    function handleSessionStart(sessionId, cwd, pid = 0, options = {}) {
        sessionId = resolveSessionId(sessionId);
        const { isTeammate = false, isSubagent = false, initialState = 'Waiting', parentId = null, meta = {}, } = options;
        if (!agentManager) {
            enqueueSessionStart({ sessionId, cwd, pid, isTeammate, isSubagent, initialState, parentId, meta: meta });
            debugLog(`[${logPrefix}] SessionStart queued: ${sessionId.slice(0, 8)}`);
            return;
        }
        const cached = getSessionContext(sessionId);
        const resolvedCwd = cwd || cached.cwd || '';
        const resolvedMeta = {
            ...cached.meta,
            ...meta,
        };
        rememberSessionContext(sessionId, resolvedCwd, resolvedMeta);
        const registeredAgent = agentRegistry?.findByProjectPath?.(resolvedCwd) || null;
        if (registeredAgent && canBindRegistryAgent(registeredAgent)) {
            agentRegistry?.linkSession?.(registeredAgent.id, sessionId, resolvedMeta.jsonlPath || null, {
                runtimeSessionId: resolvedMeta.runtimeSessionId,
                resumeSessionId: resolvedMeta.resumeSessionId,
            });
            sessionToRegistry.set(sessionId, registeredAgent.id);
            agentManager.updateAgent({
                registryId: registeredAgent.id,
                sessionId,
                runtimeSessionId: resolvedMeta.runtimeSessionId !== undefined ? resolvedMeta.runtimeSessionId : sessionId,
                resumeSessionId: resolvedMeta.resumeSessionId,
                projectPath: resolvedCwd,
                displayName: registeredAgent.name,
                role: registeredAgent.role,
                avatarIndex: registeredAgent.avatarIndex,
                workspace: registeredAgent.workspace || null,
                isRegistered: true,
                state: initialState,
                provider: resolvedMeta.provider || null,
                jsonlPath: resolvedMeta.jsonlPath || null,
                model: resolvedMeta.model || null,
                permissionMode: resolvedMeta.permissionMode || null,
                source: resolvedMeta.source || null,
                agentType: resolvedMeta.agentType || null,
                isTeammate,
                isSubagent,
                parentId,
            }, createSource);
            debugLog(`[${logPrefix}] SessionStart -> registered agent: ${registeredAgent.id.slice(0, 8)} "${registeredAgent.name}" ← session ${sessionId.slice(0, 8)}`);
        }
        else {
            const displayName = resolvedCwd ? path.basename(resolvedCwd) : 'Agent';
            agentManager.updateAgent({
                sessionId,
                runtimeSessionId: resolvedMeta.runtimeSessionId !== undefined ? resolvedMeta.runtimeSessionId : sessionId,
                resumeSessionId: resolvedMeta.resumeSessionId,
                projectPath: resolvedCwd,
                displayName,
                state: initialState,
                provider: resolvedMeta.provider || null,
                jsonlPath: resolvedMeta.jsonlPath || null,
                model: resolvedMeta.model || null,
                permissionMode: resolvedMeta.permissionMode || null,
                source: resolvedMeta.source || null,
                agentType: resolvedMeta.agentType || null,
                teammateName: resolvedMeta.teammateName || null,
                teamName: resolvedMeta.teamName || null,
                isTeammate,
                isSubagent,
                parentId,
            }, createSource);
            debugLog(`[${logPrefix}] SessionStart -> ephemeral agent: ${sessionId.slice(0, 8)} (${displayName}) ${isTeammate ? '[Team]' : ''} ${isSubagent ? '[Sub]' : ''} (Parent: ${parentId ? parentId.slice(0, 8) : 'none'})`);
        }
        if (pid > 0) {
            sessionPids.set(sessionId, pid);
            return;
        }
        if (typeof detectPidByTranscript !== 'function') {
            return;
        }
        detectPidByTranscript(resolvedMeta.jsonlPath || null, (result) => {
            if (!result)
                return;
            if (typeof result === 'number') {
                sessionPids.set(sessionId, result);
                debugLog(`[${logPrefix}] SessionStart PID via transcript: ${sessionId.slice(0, 8)} -> pid=${result}`);
            }
            else if (Array.isArray(result)) {
                const registeredPids = new Set(sessionPids.values());
                const newPid = result.find((pidCandidate) => !registeredPids.has(pidCandidate));
                if (newPid) {
                    sessionPids.set(sessionId, newPid);
                    debugLog(`[${logPrefix}] SessionStart PID via fallback: ${sessionId.slice(0, 8)} -> pid=${newPid}`);
                }
            }
        });
    }
    function handleSessionEnd(sessionId) {
        sessionId = resolveSessionId(sessionId);
        const registryId = sessionToRegistry.get(sessionId);
        const agentKey = registryId || sessionId;
        cleanupSessionResources(sessionId);
        sessionToRegistry.delete(sessionId);
        if (!agentManager)
            return;
        const agent = agentManager.getAgent(agentKey);
        if (!agent) {
            debugLog(`[${logPrefix}] SessionEnd for unknown agent ${sessionId.slice(0, 8)}`);
            return;
        }
        if (registryId && agentRegistry) {
            agentRegistry.accumulateTokens?.(registryId, agent.tokenUsage);
            agentRegistry.unlinkSession?.(registryId);
            if (agentManager.transitionToOffline) {
                agentManager.transitionToOffline(agentKey);
            }
            debugLog(`[${logPrefix}] SessionEnd -> registered agent ${registryId.slice(0, 8)} → Offline`);
        }
        else {
            debugLog(`[${logPrefix}] SessionEnd -> removing ephemeral agent ${sessionId.slice(0, 8)}`);
            agentManager.removeAgent?.(agentKey);
        }
    }
    function processEvent(event) {
        if (!event)
            return;
        const sessionId = resolveSessionId(event.sessionId);
        const rawType = event.rawType || event.type;
        if (!sessionId)
            return;
        debugLog(`[${logPrefix}] ${rawType} session=${sessionId.slice(0, 8)}`);
        rememberSessionContext(sessionId, event.cwd || '', {
            provider: event.provider || null,
            jsonlPath: event.transcriptPath || null,
            runtimeSessionId: event.runtimeSessionId,
            resumeSessionId: event.resumeSessionId,
            model: event.model || null,
            permissionMode: event.permissionMode || null,
            source: event.source || null,
            agentType: event.agentType || null,
            teammateName: event.teammateName || null,
            teamName: event.teamName || null,
        });
        if (event.transcriptPath && agentRegistry) {
            const regId = sessionToRegistry.get(sessionId);
            if (regId) {
                agentRegistry.updateSessionTranscriptPath?.(regId, sessionId, event.transcriptPath);
            }
        }
        if (agentManager && event.type !== 'session.start' && event.type !== 'session.end') {
            const agentKey = resolveAgentId(sessionId);
            const existing = agentKey ? agentManager.getAgent(agentKey) : null;
            if (!existing) {
                debugLog(`[${logPrefix}] Auto-create from ${rawType}: ${sessionId.slice(0, 8)}`);
                const cached = getSessionContext(sessionId);
                handleSessionStart(sessionId, event.cwd || cached.cwd || '', event.pid || 0, {
                    isTeammate: !!event.isTeammate,
                    isSubagent: !!event.isSubagent,
                    initialState: 'Waiting',
                    parentId: event.parentId || null,
                    meta: {
                        provider: event.provider || cached.meta.provider || null,
                        jsonlPath: event.transcriptPath || cached.meta.jsonlPath || null,
                        runtimeSessionId: event.runtimeSessionId !== undefined ? event.runtimeSessionId : cached.meta.runtimeSessionId,
                        resumeSessionId: event.resumeSessionId !== undefined ? event.resumeSessionId : cached.meta.resumeSessionId,
                        model: event.model || cached.meta.model || null,
                        permissionMode: event.permissionMode || cached.meta.permissionMode || null,
                        source: event.source || cached.meta.source || null,
                        agentType: event.agentType || cached.meta.agentType || null,
                        teammateName: event.teammateName || cached.meta.teammateName || null,
                        teamName: event.teamName || cached.meta.teamName || null,
                    }
                });
            }
        }
        switch (event.type) {
            case 'session.start': {
                const sessionSource = event.source || 'startup';
                const sessionMeta = {
                    provider: event.provider || null,
                    jsonlPath: event.transcriptPath || null,
                    runtimeSessionId: event.runtimeSessionId,
                    resumeSessionId: event.resumeSessionId,
                    model: event.model || null,
                    permissionMode: event.permissionMode || null,
                    source: sessionSource,
                    agentType: event.agentType || null,
                };
                if (sessionSource !== 'startup' && agentManager) {
                    const existing = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (existing) {
                        const compactUpdate = {
                            ...existing,
                            sessionId,
                            runtimeSessionId: event.runtimeSessionId !== undefined ? event.runtimeSessionId : existing.runtimeSessionId,
                            resumeSessionId: event.resumeSessionId !== undefined ? event.resumeSessionId : existing.resumeSessionId,
                            state: 'Waiting',
                            jsonlPath: sessionMeta.jsonlPath || existing.jsonlPath,
                            model: sessionMeta.model || existing.model,
                            source: sessionSource,
                            provider: sessionMeta.provider || existing.provider || null,
                        };
                        if (sessionSource === 'compact') {
                            compactUpdate.tokenUsage = { ...(existing.tokenUsage || {}), contextPercent: 0 };
                        }
                        agentManager.updateAgent(compactUpdate, updateSource);
                        debugLog(`[${logPrefix}] SessionStart (${sessionSource}) -> updated existing agent ${sessionId.slice(0, 8)}`);
                        break;
                    }
                }
                handleSessionStart(sessionId, event.cwd || '', event.pid || 0, {
                    isTeammate: !!event.isTeammate,
                    isSubagent: !!event.isSubagent,
                    initialState: event.initialState || 'Waiting',
                    parentId: event.parentId || null,
                    meta: sessionMeta,
                });
                break;
            }
            case 'session.end':
                if (event.reason) {
                    debugLog(`[${logPrefix}] SessionEnd reason: ${event.reason} for ${sessionId.slice(0, 8)}`);
                }
                handleSessionEnd(sessionId);
                break;
            case 'prompt.submit':
                firstToolUseDone.delete(sessionId);
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        agentManager.updateAgent({ ...agent, sessionId, state: 'Thinking' }, updateSource);
                    }
                }
                break;
            case 'turn.complete':
                firstToolUseDone.delete(sessionId);
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        const updatedUsage = (0, tokenUsage_js_1.computeTokenUsage)(agent, event.tokenUsage);
                        agentManager.updateAgent({
                            ...agent,
                            sessionId,
                            state: 'Done',
                            currentTool: null,
                            lastMessage: event.lastAssistantMessage !== undefined ? event.lastAssistantMessage : agent.lastMessage,
                            ...(updatedUsage && { tokenUsage: updatedUsage }),
                        }, updateSource);
                    }
                }
                break;
            case 'usage.update':
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        const updatedUsage = (0, tokenUsage_js_1.computeTokenUsage)(agent, event.tokenUsage);
                        if (updatedUsage) {
                            agentManager.updateAgent({
                                ...agent,
                                sessionId,
                                tokenUsage: updatedUsage,
                            }, updateSource);
                        }
                    }
                }
                break;
            case 'message':
                if (agentManager && event.text !== undefined) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        agentManager.updateAgent({ ...agent, sessionId, lastMessage: event.text }, updateSource);
                    }
                }
                break;
            case 'tool.start':
                if (!firstToolUseDone.has(sessionId)) {
                    firstToolUseDone.set(sessionId, true);
                    if (event.suppressIfFirst) {
                        debugLog(`[${logPrefix}] Tool start ignored (first = session init)`);
                        break;
                    }
                }
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        agentManager.updateAgent({ ...agent, sessionId, state: 'Working', currentTool: event.toolName || null }, updateSource);
                    }
                }
                break;
            case 'tool.end':
                if (agentManager && firstToolUseDone.has(sessionId)) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        const updatedUsage = (0, tokenUsage_js_1.computeTokenUsage)(agent, event.tokenUsage);
                        agentManager.updateAgent({
                            ...agent,
                            sessionId,
                            state: 'Thinking',
                            currentTool: null,
                            ...(updatedUsage && { tokenUsage: updatedUsage }),
                        }, updateSource);
                    }
                }
                handlePidReconnect({
                    sessionId,
                    toolName: event.toolName,
                    toolInput: event.toolInput,
                    transcriptPath: event.transcriptPath,
                });
                break;
            case 'tool.error':
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        agentManager.updateAgent({ ...agent, sessionId, state: 'Error', currentTool: event.toolName || null }, updateSource);
                    }
                }
                break;
            case 'help':
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        agentManager.updateAgent({ ...agent, sessionId, state: 'Help', currentTool: event.toolName || null }, updateSource);
                    }
                }
                break;
            case 'notification':
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        agentManager.updateAgent({ ...agent, sessionId, state: event.state || 'Waiting' }, updateSource);
                    }
                }
                break;
            case 'subagent.start':
                if (event.subagentId) {
                    handleSessionStart(event.subagentId, event.cwd || '', 0, {
                        isTeammate: false,
                        isSubagent: true,
                        initialState: event.initialState || 'Working',
                        parentId: sessionId,
                        meta: {
                            provider: event.provider || null,
                            jsonlPath: event.transcriptPath || null,
                            agentType: event.agentType || null,
                        }
                    });
                    debugLog(`[${logPrefix}] SubagentStart: ${event.subagentId.slice(0, 8)} type=${event.agentType || 'unknown'} parent=${sessionId.slice(0, 8)}`);
                }
                break;
            case 'subagent.end':
                if (event.subagentId) {
                    if (event.lastAssistantMessage && agentManager) {
                        const subAgent = agentManager.getAgent(event.subagentId);
                        if (subAgent) {
                            agentManager.updateAgent({ ...subAgent, lastMessage: event.lastAssistantMessage, state: 'Done' }, updateSource);
                        }
                    }
                    handleSessionEnd(event.subagentId);
                }
                break;
            case 'teammate.idle': {
                const teammateName = event.teammateName || null;
                const teamName = event.teamName || null;
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        agentManager.updateAgent({
                            ...agent,
                            state: 'Waiting',
                            isTeammate: true,
                            teammateName,
                            teamName,
                            currentTool: null,
                        }, updateSource);
                    }
                    else {
                        handleSessionStart(sessionId, event.cwd || '', 0, {
                            isTeammate: true,
                            isSubagent: false,
                            initialState: 'Waiting',
                            parentId: null,
                            meta: {
                                provider: event.provider || null,
                                jsonlPath: event.transcriptPath || null,
                                teammateName,
                                teamName,
                            }
                        });
                    }
                }
                debugLog(`[${logPrefix}] TeammateIdle: ${sessionId.slice(0, 8)} name=${teammateName} team=${teamName}`);
                break;
            }
            case 'compact.start':
                debugLog(`[${logPrefix}] PreCompact (${event.trigger || 'unknown'}) for ${sessionId.slice(0, 8)}`);
                if (agentManager) {
                    const agent = agentManager.getAgent(resolveAgentId(sessionId) || sessionId);
                    if (agent) {
                        agentManager.updateAgent({ ...agent, sessionId, state: 'Thinking', firstSeen: Date.now() }, updateSource);
                    }
                }
                break;
            case 'meta':
                debugLog(`[${logPrefix}] Meta info: ${rawType} for ${sessionId.slice(0, 8)}`);
                break;
            case 'unknown':
            default:
                debugLog(`[${logPrefix}] Unknown: ${rawType} -> ${JSON.stringify(event.raw || {}).slice(0, 150)}`);
                break;
        }
    }
    function attachRegisteredAgent(registryAgent) {
        if (!agentManager || !agentRegistry || !registryAgent || !registryAgent.id)
            return null;
        if (!canBindRegistryAgent(registryAgent))
            return null;
        const { normalizePath } = require('../agentRegistry.js');
        const targetPath = normalizePath(registryAgent.projectPath);
        if (!targetPath)
            return null;
        const provider = registryAgent.provider || null;
        const candidates = (agentManager.getAllAgents ? agentManager.getAllAgents() : [])
            .filter((agent) => {
            if (!agent || agent.isRegistered)
                return false;
            if (!agent.sessionId)
                return false;
            if (normalizePath(agent.projectPath) !== targetPath)
                return false;
            if (provider && agent.provider && agent.provider !== provider)
                return false;
            return true;
        })
            .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
        const matched = candidates[0] || null;
        if (!matched)
            return null;
        const sessionId = matched.sessionId;
        agentRegistry.linkSession?.(registryAgent.id, sessionId, matched.jsonlPath || null, {
            runtimeSessionId: matched.runtimeSessionId !== undefined ? matched.runtimeSessionId : matched.sessionId,
            resumeSessionId: matched.resumeSessionId,
        });
        sessionToRegistry.set(sessionId, registryAgent.id);
        if (agentManager.removeAgent) {
            agentManager.removeAgent(matched.id);
        }
        agentManager.updateAgent({
            ...matched,
            registryId: registryAgent.id,
            sessionId,
            runtimeSessionId: matched.runtimeSessionId !== undefined ? matched.runtimeSessionId : matched.sessionId,
            resumeSessionId: matched.resumeSessionId,
            displayName: registryAgent.name,
            role: registryAgent.role,
            projectPath: registryAgent.projectPath,
            avatarIndex: registryAgent.avatarIndex,
            workspace: registryAgent.workspace || null,
            isRegistered: true,
            provider: matched.provider || registryAgent.provider || null,
        }, updateSource);
        debugLog(`[${logPrefix}] Attached live session ${sessionId.slice(0, 8)} -> registered agent ${registryAgent.id.slice(0, 8)}`);
        return sessionId;
    }
    return {
        processEvent,
        handleSessionStart,
        handleSessionEnd,
        attachRegisteredAgent,
        adoptSessionIdentity,
        flushPendingStarts: () => flushPendingStartsFromState(handleSessionStart),
        cleanup: () => {
            state.cleanup();
        },
        get firstToolUseDone() {
            return firstToolUseDone;
        },
        resolveSessionId,
    };
}
