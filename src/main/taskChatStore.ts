/**
 * Task Chat Store
 * Persists per-agent chat transcripts under ~/.agent-office/task-chats/<id>.json.
 * Append-only; each entry carries a timestamp and optional taskId.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const PERSIST_DIR = path.join(os.homedir(), '.agent-office', 'task-chats');
const MAX_MESSAGES_PER_AGENT = 2000;

export type TaskChatMessageKind =
  | 'user'
  | 'assistant-text'
  | 'assistant-tool'
  | 'assistant-error'
  | 'status';

export type TaskChatMessage = {
  id: string;
  kind: TaskChatMessageKind;
  text: string;
  timestamp: number;
  taskId?: string | null;
};

function sanitize(id: string): string {
  return String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 200) || 'unknown';
}

function ensureDir(): void {
  if (!fs.existsSync(PERSIST_DIR)) {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
  }
}

function filePath(agentRegistryId: string): string {
  return path.join(PERSIST_DIR, `${sanitize(agentRegistryId)}.json`);
}

export function loadChatHistory(agentRegistryId: string): TaskChatMessage[] {
  try {
    const file = filePath(agentRegistryId);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as { messages?: TaskChatMessage[] };
    const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
    return messages.filter((message) => message && typeof message.text === 'string');
  } catch {
    return [];
  }
}

function writeChatHistory(agentRegistryId: string, messages: TaskChatMessage[]): void {
  try {
    ensureDir();
    const file = filePath(agentRegistryId);
    const tmp = `${file}.tmp`;
    const data = { version: 1, messages };
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch {
    // best-effort: swallow persistence errors so UI keeps working
  }
}

export function appendChatMessage(agentRegistryId: string, message: TaskChatMessage): TaskChatMessage {
  const messages = loadChatHistory(agentRegistryId);
  messages.push(message);
  const trimmed = messages.length > MAX_MESSAGES_PER_AGENT
    ? messages.slice(messages.length - MAX_MESSAGES_PER_AGENT)
    : messages;
  writeChatHistory(agentRegistryId, trimmed);
  return message;
}

export function clearChatHistory(agentRegistryId: string): void {
  try {
    const file = filePath(agentRegistryId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // best-effort
  }
}
