import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

const CONFIG_DIR  = join(homedir(), '.moralta-claude');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const HISTORY_DIR = join(CONFIG_DIR, 'history');
const SESSIONS_DIR = join(CONFIG_DIR, 'sessions');
const MEMORY_DIR = join(CONFIG_DIR, 'memory');
const MCP_CONFIG_FILE = join(CONFIG_DIR, 'mcp-servers.json');

const MAX_MEMORY_ENTRIES = 200;  // keep memory from growing into the context budget

const DEFAULTS = {
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-20250514',
  apiFormat: 'anthropic',
  maxTokens: 8192,
  temperature: null,
  autoApprove: false,
  systemPrompt: '',
  showTokenUsage: true,
  maxConversationTurns: 200,
  debug: false,
  theme: 'cosmic',              // cosmic | ocean | sunset | mono | matrix
  streamingMarkdown: true,
  showThinking: true,
  compactMode: false,
  enableMemory: true,           // persist project memory
  confirmDangerous: true,       // always confirm rm/destructive cmds
  nativeTools: null,            // null = auto-detect (official APIs); true/false to force
  workspaceRoot: process.cwd(),
  editorCommand: process.platform === 'win32' ? 'notepad' : 'nano',
  diffStyle: 'unified',         // unified | side-by-side
  showLineNumbers: true,
  fileReadLimit: 2000,          // max lines to read at once
  enableSounds: false,
  customCommands: {},           // user-defined slash commands
  trustedCommands: ['ls','dir','pwd','cat','type','echo','node --version','npm --version','git status','git log','git diff'],
  yoloMode: false,
  gcloudProject: '',
  gcloudLocation: 'global',
  gcloudAccessToken: '',
  maxToolCalls: Infinity,
};

class Config {
  constructor() {
    if (!existsSync(CONFIG_DIR))  mkdirSync(CONFIG_DIR,  { recursive: true });
    if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
    if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
    if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
    this.values = { ...DEFAULTS };
    this.load();

    // Env overrides — generic provider keys are a fallback only; they must not
    // clobber an already-configured key/format (OPENAI_API_KEY is often set globally)
    if (!this.values.apiKey) {
      if (process.env.ANTHROPIC_API_KEY) { this.values.apiKey = process.env.ANTHROPIC_API_KEY; this.values.apiFormat = 'anthropic'; }
      else if (process.env.OPENAI_API_KEY) { this.values.apiKey = process.env.OPENAI_API_KEY; this.values.apiFormat = 'openai'; }
      else if (process.env.GCLOUD_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN) {
        this.values.gcloudAccessToken = process.env.GCLOUD_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN;
        this.values.apiFormat = 'gcloud';
      }
    }
    if (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) {
      this.values.gcloudProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    }
    if (process.env.GCLOUD_LOCATION || process.env.GOOGLE_CLOUD_LOCATION) {
      this.values.gcloudLocation = process.env.GCLOUD_LOCATION || process.env.GOOGLE_CLOUD_LOCATION;
    }
    if (process.env.MORALTA_API_KEY)     this.values.apiKey  = process.env.MORALTA_API_KEY;
    if (process.env.MORALTA_BASE_URL)    this.values.baseUrl = process.env.MORALTA_BASE_URL;
    if (process.env.MORALTA_MODEL)       this.values.model   = process.env.MORALTA_MODEL;
    if (process.env.MORALTA_API_FORMAT)  this.values.apiFormat = process.env.MORALTA_API_FORMAT;
    if (process.env.MORALTA_DEBUG === 'true' || process.env.MORALTA_DEBUG === '1') this.values.debug = true;
    else if (process.env.MORALTA_DEBUG === 'false' || process.env.MORALTA_DEBUG === '0') this.values.debug = false;
    if (process.env.MORALTA_THEME)       this.values.theme   = process.env.MORALTA_THEME;
  }

  load() {
    if (!existsSync(CONFIG_FILE)) return;
    try {
      const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
      this.values = { ...DEFAULTS, ...data };
    } catch {}
  }

  save() {
    try { writeFileSync(CONFIG_FILE, JSON.stringify(this.values, null, 2)); } catch {}
  }

  get(k)    { return this.values[k]; }
  set(k, v) { this.values[k] = v; this.save(); }
  reset() {
    const keep = {
      apiKey: this.values.apiKey,
      baseUrl: this.values.baseUrl,
      apiFormat: this.values.apiFormat,
      gcloudProject: this.values.gcloudProject,
      gcloudLocation: this.values.gcloudLocation,
      gcloudAccessToken: this.values.gcloudAccessToken,
    };
    this.values = { ...DEFAULTS, ...keep };
    this.save();
  }
  all()     { return { ...this.values }; }

  /**
   * Memory is scoped to the working directory, so notes about one project
   * never leak into another. Keyed by a hash of the absolute path
   * (lower-cased — Windows paths are case-insensitive).
   */
  _memoryPath() {
    const root = resolve(process.cwd());
    const name = basename(root).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'project';
    const hash = createHash('sha1').update(root.toLowerCase()).digest('hex').slice(0, 8);
    return join(MEMORY_DIR, `${name}-${hash}.md`);
  }

  loadMemory() {
    const fp = this._memoryPath();
    if (!existsSync(fp)) return '';
    try { return readFileSync(fp, 'utf8'); } catch { return ''; }
  }

  saveMemory(content) {
    try { writeFileSync(this._memoryPath(), content, 'utf8'); return true; } catch { return false; }
  }

  appendMemory(line) {
    const entry = `- [${new Date().toISOString().slice(0, 10)}] ${line}`;
    const lines = this.loadMemory().split('\n').filter(l => l.trim());
    if (lines.includes(entry)) return true;                 // already known
    lines.push(entry);
    return this.saveMemory(lines.slice(-MAX_MEMORY_ENTRIES).join('\n') + '\n');
  }

  get configDir()   { return CONFIG_DIR; }
  get historyDir()  { return HISTORY_DIR; }
  get sessionsDir() { return SESSIONS_DIR; }
  get memoryFile()  { return this._memoryPath(); }
  get mcpConfigFile() { return MCP_CONFIG_FILE; }
  get isConfigured() {
    if (this.values.apiFormat === 'gcloud') {
      return true; // gcloud token can be auto-retrieved via CLI or env
    }
    return !!this.values.apiKey || !!this.values.gcloudAccessToken;
  }

  /** Load MCP server configurations from disk */
  loadMCPServers() {
    if (!existsSync(MCP_CONFIG_FILE)) return [];
    try {
      const data = JSON.parse(readFileSync(MCP_CONFIG_FILE, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  /** Save MCP server configurations to disk */
  saveMCPServers(servers) {
    try { writeFileSync(MCP_CONFIG_FILE, JSON.stringify(servers, null, 2)); return true; } catch { return false; }
  }
}

export const config = new Config();
export default config;
