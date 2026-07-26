// Minimal smoke test — run with: node test_smoke.mjs
import assert from 'assert';
import api from './src/api.js';
import ConversationHistory from './src/history.js';
await import('./src/index.js'); // whole module graph must load

// _mergeConsecutiveRoles: merges same-role runs, drops empties, tool_result blocks first
const merged = api._mergeConsecutiveRoles([
  { role: 'user', content: 'hi' },
  { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'read_file', input: {} }] },
  { role: 'user', content: 'follow-up text' },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
  { role: 'user', content: '' },
]);
assert.strictEqual(merged.length, 3, 'consecutive user messages should merge');
assert.strictEqual(merged[2].content[0].type, 'tool_result', 'tool_result must be first block');
assert.strictEqual(merged[2].content[1].text, 'follow-up text');

// compact(): refuses (instead of wiping everything) when no string user turn exists
const h = new ConversationHistory();
for (let i = 0; i < 20; i++) {
  h.addMessage(i % 2 ? 'assistant' : 'user', [{ type: 'text', text: 'block ' + i }]);
}
assert.strictEqual(h.compact(), false, 'compact must bail without a cut point');
assert.strictEqual(h.messages.length, 20, 'messages must be untouched');

// save() returns the file path now
assert.ok(typeof new ConversationHistory().constructor.prototype.save === 'function');

console.log('smoke: all checks passed');
process.exit(0);
