import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import config from './config.js';

/**
 * Manages a single conversation session's message history.
 * Can save to / load from disk, and compact older messages.
 */
export class ConversationHistory {
  constructor() {
    this.sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    this.messages  = [];
    this.created   = new Date();
  }

  /** Append a message to history */
  addMessage(role, content) {
    this.messages.push({ role, content });
  }

  /** Deep copy of messages for safe mutation by callers */
  getMessages() {
    try { return JSON.parse(JSON.stringify(this.messages)); } catch { return [...this.messages]; }
  }

  /** Wipe history */
  clear() { this.messages = []; }

  /**
   * Compact older turns into a summary message to save context.
   * Keeps the most recent `keepTurns` user/assistant pairs intact.
   */
  compact(keepTurns = 4) {
    if (this.messages.length < keepTurns * 2 + 2) return false;

    // Count user turns from the end to find the cut point
    let userTurnsSeen = 0;
    let cutIdx = this.messages.length;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user' && typeof this.messages[i].content === 'string') {
        userTurnsSeen++;
        if (userTurnsSeen >= keepTurns) { cutIdx = i; break; }
      }
    }

    // No usable cut point (e.g. history is mostly tool-result turns) —
    // bail out instead of compacting the entire conversation away.
    if (cutIdx <= 0 || cutIdx >= this.messages.length) return false;

    const old = this.messages.slice(0, cutIdx);
    const kept = this.messages.slice(cutIdx);

    // Build a terse summary of the compacted messages
    const summaryLines = [];
    for (const m of old) {
      const c = typeof m.content === 'string'
        ? m.content.slice(0, 120)
        : '(tool interaction)';
      summaryLines.push(`[${m.role}] ${c}`);
    }

    this.messages = [
      { role: 'user',      content: `[Conversation summary – earlier messages compacted]\n${summaryLines.join('\n')}` },
      { role: 'assistant', content: 'Understood. I have the context from our earlier conversation. Please continue.' },
      ...kept,
    ];

    return true;
  }

  /** Persist to disk. Returns the file path. */
  save() {
    const dir = config.historyDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fp = join(dir, `${this.sessionId}.json`);
    writeFileSync(
      fp,
      JSON.stringify({ id: this.sessionId, created: this.created, messages: this.messages }, null, 2),
    );
    return fp;
  }

  /** Load a previous session by id */
  static load(sessionId) {
    const fp = join(config.historyDir, `${sessionId}.json`);
    if (!existsSync(fp)) return null;
    try {
      const data = JSON.parse(readFileSync(fp, 'utf-8'));
      const h = new ConversationHistory();
      h.sessionId = data.id;
      h.messages  = data.messages || [];
      h.created   = new Date(data.created);
      return h;
    } catch { return null; }
  }
}

export default ConversationHistory;
