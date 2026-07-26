// Persistent-memory tests — run with: node test_memory.mjs
import assert from 'assert';
import { mkdtempSync, rmSync, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import config from './src/config.js';
import { executeTool, TOOL_DEFINITIONS } from './src/tools.js';
import { memorySection } from './src/index.js';

const projA = mkdtempSync(join(tmpdir(), 'moralta-a-'));
const projB = mkdtempSync(join(tmpdir(), 'moralta-b-'));
const origCwd = process.cwd();
const created = [];

try {
  // ── Project A remembers a fact ──
  process.chdir(projA);
  const fileA = config.memoryFile; created.push(fileA);
  const res = await executeTool('remember', { fact: 'This project uses ESM and Node 18+' });
  assert.ok(!res.error, `remember failed: ${res.error}`);
  assert.ok(existsSync(fileA), 'memory file should be created on disk');
  assert.match(config.loadMemory(), /uses ESM and Node 18/, 'fact must be readable back');

  // Duplicate facts are not stored twice
  await executeTool('remember', { fact: 'This project uses ESM and Node 18+' });
  const entries = config.loadMemory().split('\n').filter(l => l.trim());
  assert.strictEqual(entries.length, 1, 'duplicate fact must not be appended twice');

  // ── Scoping: project B must not see project A's memory ──
  process.chdir(projB);
  const fileB = config.memoryFile; created.push(fileB);
  assert.notStrictEqual(fileA, fileB, 'each project needs its own memory file');
  assert.strictEqual(config.loadMemory(), '', 'project B must start with empty memory');
  await executeTool('remember', { fact: 'Project B is a game prototype' });
  assert.ok(!config.loadMemory().includes('ESM'), 'projects must not share memory');

  // ── Persistence: re-reading from disk is what a new session does ──
  process.chdir(projA);
  assert.match(config.loadMemory(), /ESM/, 'project A memory must survive the switch away and back');

  // ── forget removes matching entries ──
  await executeTool('remember', { fact: 'Prefers tabs over spaces' });
  assert.strictEqual(config.loadMemory().split('\n').filter(l => l.trim()).length, 2);
  const f = await executeTool('forget', { match: 'tabs' });
  assert.ok(!f.error, `forget failed: ${f.error}`);
  assert.ok(!config.loadMemory().includes('tabs'), 'forgotten fact must be gone');
  assert.match(config.loadMemory(), /ESM/, 'forget must not remove unrelated facts');

  // ── The load-bearing link: saved facts must reach the system prompt ──
  const section = memorySection();
  assert.match(section, /ESM/, 'saved facts must be injected into the system prompt');
  assert.match(section, /remember/, 'prompt must tell the model how to save new facts');
  config.set('enableMemory', false);
  assert.strictEqual(memorySection(), '', 'enableMemory=false must disable injection');
  config.set('enableMemory', true);

  // ── Validation & registration ──
  assert.ok((await executeTool('remember', { fact: '   ' })).error, 'blank fact must be rejected');
  const names = TOOL_DEFINITIONS.map(d => d.name);
  assert.ok(names.includes('remember') && names.includes('forget'),
    'tools must be registered so they reach the model and the prompt tool list');

  console.log('memory: persists across sessions, scoped per project, dedupes, forgets');
} finally {
  process.chdir(origCwd);
  for (const f of created) { try { if (existsSync(f)) unlinkSync(f); } catch {} }
  rmSync(projA, { recursive: true, force: true });
  rmSync(projB, { recursive: true, force: true });
}
process.exit(0);
