/**
 * MCP (Model Context Protocol) integration for Moralta Claude.
 *
 * Provides:
 *  - MCPClient: connects to a single MCP server via stdio JSON-RPC
 *  - MCPManager: manages multiple servers, aggregates tools, routes calls
 *  - Singleton `mcpManager` exported for use by tools.js and index.js
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import config from './config.js';

/* ──────────────────────────────────────────────
   MCPClient — stdio JSON-RPC transport
   ────────────────────────────────────────────── */

class MCPClient extends EventEmitter {
  /**
   * @param {string} name  — server name (from config)
   * @param {object} opts  — { command, args[], env{} }
   */
  constructor(name, opts) {
    super();
    this.name = name;
    this.opts = opts;
    this.process = null;
    this.connected = false;
    this._buffer = '';
    this._pending = new Map(); // seq -> { resolve, reject, timer }
    this._seq = 0;
    this._capabilities = {};
    this._tools = [];         // discovered tools
    this._closed = false;
  }

  /** Connect and initialize the server */
  async connect() {
    if (this.connected) return;
    this._closed = false;

    const { command, args = [], env = {} } = this.opts;

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      shell: false,
    });

    this.process.stdout.on('data', (chunk) => this._onData(chunk));
    this.process.stderr.on('data', (chunk) => {
      // MCP servers often log debug info to stderr — forward it
      if (config.get('debug')) {
        console.error(`[MCP:${this.name} stderr]`, chunk.toString().trimEnd());
      }
    });

    this.process.on('error', (err) => {
      this.connected = false;
      this._rejectAll(err.message);
      this.emit('error', err);
    });

    this.process.on('exit', (code) => {
      this.connected = false;
      if (!this._closed) {
        this._rejectAll(`Server exited with code ${code}`);
        this.emit('disconnect', code);
      }
    });

    // Initialize handshake
    const initResult = await this._request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'moralta-claude', version: '3.0.0' },
    });

    this._capabilities = initResult?.capabilities || {};
    this.connected = true;

    // Send initialized notification
    this._sendNotification('notifications/initialized', {});

    // Discover tools
    await this._discoverTools();

    this.emit('connect');
    return this._tools;
  }

  /** Disconnect gracefully */
  disconnect() {
    this._closed = true;
    this.connected = false;
    this._rejectAll('Server disconnected');
    if (this.process) {
      try { this.process.stdin.end(); } catch {}
      try { this.process.kill(); } catch {}
      this.process = null;
    }
    this._tools = [];
    this._capabilities = {};
  }

  /** Call an MCP tool */
  async callTool(name, args = {}) {
    if (!this.connected) throw new Error(`MCP server "${this.name}" is not connected`);
    return this._request('tools/call', { name, arguments: args });
  }

  /** Get current tool list */
  get tools() { return this._tools; }
  get isConnected() { return this.connected; }
  get serverName() { return this.name; }

  /* ─── private ─── */

  async _discoverTools() {
    try {
      const result = await this._request('tools/list', {});
      this._tools = (result?.tools || []).map(t => ({
        ...t,
        _mcpServer: this.name,
        inputSchema: t.inputSchema || t.input_schema || {},
      }));
    } catch (err) {
      this._tools = [];
      if (config.get('debug')) {
        console.error(`[MCP:${this.name}] tools/list failed:`, err.message);
      }
    }
  }

  _onData(chunk) {
    this._buffer += chunk.toString();
    const lines = this._buffer.split('\n');
    // Keep the last partial line in the buffer
    this._buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this._handleMessage(msg);
      } catch {
        if (config.get('debug')) {
          console.error(`[MCP:${this.name}] Failed to parse: ${trimmed.slice(0, 200)}`);
        }
      }
    }
  }

  _handleMessage(msg) {
    // Response to a request
    if (msg.id != null) {
      const pending = this._pending.get(msg.id);
      if (pending) {
        this._pending.delete(msg.id);
        if (pending.timer) clearTimeout(pending.timer);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || 'MCP error'));
        } else {
          pending.resolve(msg.result || {});
        }
      }
      return;
    }
    // Notification (no id) — ignore for now
  }

  _request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this._seq;
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

      this._pending.set(id, { resolve, reject, timer: null });

      // 30s timeout
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after 30s`));
      }, 30000);
      this._pending.get(id).timer = timer;

      if (this.process && this.process.stdin.writable) {
        this.process.stdin.write(msg);
      } else {
        this._pending.delete(id);
        clearTimeout(timer);
        reject(new Error('MCP stdin not writable'));
      }
    });
  }

  _sendNotification(method, params = {}) {
    if (this.process && this.process.stdin.writable) {
      const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
      this.process.stdin.write(msg);
    }
  }

  _rejectAll(reason) {
    for (const [id, pending] of this._pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this._pending.clear();
  }
}

/* ──────────────────────────────────────────────
   MCPManager — multi-server lifecycle
   ────────────────────────────────────────────── */

class MCPManager {
  constructor() {
    this._servers = new Map(); // name -> MCPClient
  }

  /** Load config and connect all configured servers */
  async connectAll() {
    const cfgs = config.loadMCPServers();
    const results = [];
    for (const cfg of cfgs) {
      if (!cfg.name || !cfg.command) continue;
      const client = new MCPClient(cfg.name, { command: cfg.command, args: cfg.args || [], env: cfg.env || {} });
      this._servers.set(cfg.name, client);
      try {
        await client.connect();
        results.push({ name: cfg.name, status: 'connected', tools: client.tools.length });
      } catch (err) {
        results.push({ name: cfg.name, status: 'error', error: err.message });
      }
    }
    return results;
  }

  /** Get tool definitions from all connected servers in TOOL_DEFINITIONS format */
  getToolDefinitions() {
    const defs = [];
    for (const client of this._servers.values()) {
      if (!client.isConnected) continue;
      for (const tool of client.tools) {
        defs.push({
          name: tool.name,
          description: tool.description || `MCP tool from ${client.name}`,
          parameters: {
            type: 'object',
            properties: (tool.inputSchema?.properties) || {},
            required: tool.inputSchema?.required || [],
          },
          _mcpServer: client.name,
        });
      }
    }
    return defs;
  }

  /** Check if a tool name belongs to an MCP server */
  isMCPTool(name) {
    for (const client of this._servers.values()) {
      if (!client.isConnected) continue;
      if (client.tools.some(t => t.name === name)) return client.name;
    }
    return null;
  }

  /** Execute an MCP tool by name */
  async executeTool(name, args) {
    const serverName = this.isMCPTool(name);
    if (!serverName) return { error: `MCP tool "${name}" not found on any server` };

    const client = this._servers.get(serverName);
    if (!client || !client.isConnected) return { error: `Server "${serverName}" is not connected` };

    try {
      const result = await client.callTool(name, args);
      return formatMCPResult(result);
    } catch (err) {
      return { error: err.message };
    }
  }

  /** Add a new MCP server config and optionally connect */
  async addServer(name, command, args = [], env = {}) {
    const cfgs = config.loadMCPServers();
    if (cfgs.find(c => c.name === name)) {
      return { error: `Server "${name}" already configured` };
    }
    cfgs.push({ name, command, args, env });
    config.saveMCPServers(cfgs);

    // Connect immediately
    const client = new MCPClient(name, { command, args, env });
    this._servers.set(name, client);
    try {
      await client.connect();
      return { name, status: 'connected', tools: client.tools.length };
    } catch (err) {
      return { name, status: 'error', error: err.message };
    }
  }

  /** Remove an MCP server config and disconnect */
  async removeServer(name) {
    // Disconnect if connected
    const client = this._servers.get(name);
    if (client) {
      client.disconnect();
      this._servers.delete(name);
    }

    const cfgs = config.loadMCPServers();
    const idx = cfgs.findIndex(c => c.name === name);
    if (idx === -1) return { error: `Server "${name}" not found` };
    cfgs.splice(idx, 1);
    config.saveMCPServers(cfgs);
    return { name, status: 'removed' };
  }

  /** Disconnect a server without removing config */
  disconnectServer(name) {
    const client = this._servers.get(name);
    if (!client) return { error: `Server "${name}" not found` };
    client.disconnect();
    return { name, status: 'disconnected' };
  }

  /** Reconnect a server */
  async reconnectServer(name) {
    const client = this._servers.get(name);
    if (client) client.disconnect();

    const cfgs = config.loadMCPServers();
    const cfg = cfgs.find(c => c.name === name);
    if (!cfg) return { error: `Server "${name}" not configured` };

    const newClient = new MCPClient(name, { command: cfg.command, args: cfg.args || [], env: cfg.env || {} });
    this._servers.set(name, newClient);
    try {
      await newClient.connect();
      return { name, status: 'connected', tools: newClient.tools.length };
    } catch (err) {
      return { name, status: 'error', error: err.message };
    }
  }

  /** Get status of all servers */
  getStatus() {
    const statuses = [];
    for (const [name, client] of this._servers) {
      statuses.push({
        name,
        connected: client.isConnected,
        tools: client.tools.length,
      });
    }
    // Also include configured-but-not-yet-connected servers
    const cfgs = config.loadMCPServers();
    for (const cfg of cfgs) {
      if (!this._servers.has(cfg.name)) {
        statuses.push({ name: cfg.name, connected: false, tools: 0 });
      }
    }
    return statuses;
  }

  /** Shut down all servers */
  disconnectAll() {
    for (const client of this._servers.values()) {
      client.disconnect();
    }
    this._servers.clear();
  }
}

/* ──────────────────────────────────────────────
   MCP result → Moralta result formatting
   ────────────────────────────────────────────── */

function formatMCPResult(result) {
  if (!result) return { content: '(no result)' };
  if (result.error) return { error: result.error };

  // MCP content is an array of content blocks: [{ type: 'text', text }, { type: 'resource', resource }]
  if (Array.isArray(result.content)) {
    const textParts = result.content
      .filter(c => c.type === 'text')
      .map(c => c.text);
    const resourceParts = result.content
      .filter(c => c.type === 'resource')
      .map(c => {
        const r = c.resource || {};
        return r.text || r.blob || JSON.stringify(r);
      });

    const combined = [...textParts, ...resourceParts].join('\n\n');
    return { content: combined || '(empty result)', isError: result.isError };
  }

  return { content: JSON.stringify(result, null, 2) };
}

/* ──────────────────────────────────────────────
   Singleton export
   ────────────────────────────────────────────── */

export const mcpManager = new MCPManager();
export default mcpManager;