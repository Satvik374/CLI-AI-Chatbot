import config from './config.js';
import { t, drawBox, gradientText, renderInfo, renderDivider, renderSuccess, renderWarning, renderError, renderTable, renderKeyValue, applyTheme, matrixRain } from './ui.js';
import { TOOL_DEFINITIONS } from './tools.js';
import { mcpManager } from './mcp.js';
import { readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { executeEnhancedTool } from './enhanced_tools.js';
import {
  getGCloudAuthStatus,
  getGCloudProject,
  getGCloudLocation,
  getGCloudAccessToken,
  refreshGCloudToken,
  saveGCloudCredentialsObj,
  RECOMMENDED_GCLOUD_MODELS,
} from './gcloud.js';

/* ──────────────────────────────────────────────
   Version from package.json
   ────────────────────────────────────────────── */

let _version = '3.0.0';
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  _version = pkg.version;
} catch {} // fallback to default

/* ──────────────────────────────────────────────
   Slash-command registry
   ────────────────────────────────────────────── */

export const COMMANDS = {
  '/help'    : { desc: 'Show available commands & shortcuts',    handler: cmdHelp },
  '/clear'   : { desc: 'Clear conversation history',             handler: cmdClear },
  '/compact' : { desc: 'Compact conversation to save context',   handler: cmdCompact },
  '/config'  : { desc: 'View or set a config key',               handler: cmdConfig },
  '/model'   : { desc: 'View or change the model',               handler: cmdModel },
  '/models'  : { desc: 'List recommended models (Gemini, Claude, GPT)', handler: cmdModels },
  '/gcloud'  : { desc: 'Google Cloud Auth, Project, Region & Models setup', handler: cmdGCloud },
  '/cost'    : { desc: 'Show session token / cost usage',        handler: cmdCost },
  '/auto'    : { desc: 'Toggle auto-approve for tool calls',     handler: cmdAuto },
  '/yolo'    : { desc: 'Toggle YOLO mode (auto-approve all)',    handler: cmdYolo },
  '/system'  : { desc: 'View or set the system prompt',          handler: cmdSystem },
  '/history' : { desc: 'Show conversation turn summary',         handler: cmdHistory },
  '/sessions': { desc: 'List saved sessions',                    handler: cmdSessions },
  '/save'    : { desc: 'Save the current session to disk',       handler: cmdSave },
  '/load'    : { desc: 'Load a saved session',                   handler: cmdLoad },
  '/resume'  : { desc: 'Resume the most recent session',         handler: cmdResume },
  '/memory'  : { desc: 'View / add / clear persistent memory',   handler: cmdMemory },
  '/tools'   : { desc: 'List all available tools',               handler: cmdTools },
  '/theme'   : { desc: 'Change UI theme',                        handler: cmdTheme },
  '/reset'   : { desc: 'Reset config to defaults',               handler: cmdReset },
  '/status'  : { desc: 'Show full status dashboard',             handler: cmdStatus },
  '/about'   : { desc: 'About Moralta Claude',                   handler: cmdAbout },
  '/project' : { desc: 'Project management commands',                handler: cmdProject },
  '/debug'   : { desc: 'Enhanced debugging tools',                   handler: cmdDebug },
  '/profile' : { desc: 'Performance profiling',                     handler: cmdProfile },
  '/exit'    : { desc: 'Exit Moralta Claude',                    handler: cmdExit },
  '/quit'    : { desc: 'Exit Moralta Claude',                    handler: cmdExit },
  '/mcp'     : { desc: 'Manage MCP servers (list, add, remove, status, reconnect)', handler: cmdMCP },
};

/* ──────────────────────────────────────────────
   Dispatcher
   ────────────────────────────────────────────── */

export async function processCommand(input, ctx) {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return { handled: false };

  const [cmd, ...args] = trimmed.split(/\s+/);
  const entry = COMMANDS[cmd.toLowerCase()];
  if (!entry) {
    renderError(`Unknown command: ${cmd}`);
    renderInfo(`Type ${t.codeKw('/help')} for the list of commands.`);
    return { handled: true };
  }
  return (await entry.handler(args, ctx)) || { handled: true };
}

/* ══════════════════════════════════════════════
   Handlers
   ══════════════════════════════════════════════ */

function cmdHelp() {
  console.log();
  console.log(gradientText('  ⚡ MORALTA CLAUDE — COMMAND REFERENCE', ['#A78BFA', '#22D3EE']));
  console.log();

  const rows = Object.entries(COMMANDS).map(([cmd, info]) => [t.codeKw(cmd), t.dim(info.desc)]);
  console.log(renderTable(['Command', 'Description'], rows));

  console.log();
  console.log(t.bold('  ⌨  Keyboard Shortcuts'));
  console.log(t.dim('  ───────────────────────────'));
  const shortcuts = [
    ['Ctrl+C',          'Cancel current request / exit'],
    ['Ctrl+L',          'Clear screen'],
    ['Ctrl+D',          'Exit'],
    ['↑ / ↓',           'Browse input history'],
    ['Tab',              'Autocomplete commands'],
    ['Shift+Enter',     'Multiline input (when supported)'],
    ['Esc',             'Cancel pending approval'],
  ];
  for (const [k, v] of shortcuts) {
    console.log(`  ${t.accent(k.padEnd(14))}  ${t.dim(v)}`);
  }
  console.log();
  return { handled: true };
}

function cmdClear(_, ctx) {
  if (ctx?.history) {
    ctx.history.clear();
    renderSuccess('Conversation history cleared.');
  }
  return { handled: true };
}

function cmdCompact(_, ctx) {
  if (ctx?.history) {
    const before = ctx.history.messages.length;
    if (ctx.history.compact()) {
      renderSuccess(`Compacted history: ${before} → ${ctx.history.messages.length} messages.`);
    } else {
      renderWarning('Not enough messages to compact.');
    }
  }
  return { handled: true };
}

function cmdConfig(args) {
  if (args.length === 0) {
    console.log();
    console.log(t.bold('  ⚙  Configuration'));
    console.log(t.dim('  ──────────────────'));
    const safe = { ...config.values };
    if (safe.apiKey) safe.apiKey = safe.apiKey.slice(0, 12) + '••••••' + safe.apiKey.slice(-4);
    console.log(renderKeyValue(safe));
    console.log();
    return { handled: true };
  }
  const [key, ...rest] = args;
  if (rest.length === 0) {
    const v = config.get(key);
    if (v === undefined) renderWarning(`No such key: ${key}`);
    else renderInfo(`${t.codeKw(key)} = ${t.accent(JSON.stringify(v))}`);
    return { handled: true };
  }
  let value = rest.join(' ');
  if (value === 'true') value = true;
  else if (value === 'false') value = false;
  else if (!isNaN(Number(value)) && value.trim() !== '') value = Number(value);
  config.set(key, value);
  config.save();
  renderSuccess(`Set ${t.codeKw(key)} = ${t.accent(JSON.stringify(value))}`);
  return { handled: true };
}

function cmdModel(args) {
  if (args.length === 0) {
    renderInfo(`Current model: ${t.accent(config.get('model'))}`);
    renderInfo(`API format:    ${t.accent(config.get('apiFormat'))}`);
    return { handled: true };
  }
  const m = args.join(' ').trim();
  config.set('model', m);
  config.save();
  renderSuccess(`Model set to ${t.accent(m)}`);
  return { handled: true };
}

function cmdModels() {
  console.log();
  console.log(t.bold('  🧠 Recommended Models (Google Cloud Gemini, Anthropic, OpenAI)'));
  console.log(t.dim('  ─────────────────────────────────────────────────────────────'));
  const models = [
    ['gemini-3.6-flash',                 'Google — flagship Gemini 3.6 fast & smart'],
    ['gemini-3.5-flash',                 'Google — high speed Gemini 3.5'],
    ['gemini-3.5-flash-lite',            'Google — ultra lightweight Gemini 3.5'],
    ['gemini-2.5-pro',                   'Google — flagship Gemini 2.5 reasoning'],
    ['gemini-2.5-flash',                 'Google — high performance Gemini 2.5'],
    ['gemini-2.0-flash',                 'Google — fast & smart general model'],
    ['claude-3-7-sonnet@20250219',       'Vertex AI — Claude 3.7 Sonnet on Gcloud'],
    ['claude-sonnet-4-20250514',         'Anthropic API — flagship coding'],
    ['claude-3-5-sonnet-20241022',       'Anthropic API — fast & smart'],
    ['gpt-4o',                            'OpenAI — flagship'],
    ['deepseek-chat',                     'DeepSeek — high value'],
  ];
  console.log(renderTable(['Model ID', 'Notes'], models.map(([m, n]) => [t.accent(m), t.dim(n)])));
  console.log();
  console.log(t.dim('  Use ') + t.codeKw('/model <id>') + t.dim(' to switch.'));
  console.log();
  return { handled: true };
}

async function cmdGCloud(args) {
  const sub = (args[0] || 'status').toLowerCase();
  const rest = args.slice(1).join(' ').trim();

  switch (sub) {
    case 'status': {
      const status = getGCloudAuthStatus();
      console.log();
      console.log(gradientText('  ☁  GOOGLE CLOUD STATUS', ['#4285F4', '#34A853']));
      console.log();
      console.log(renderKeyValue({
        'Authenticated': status.authenticated ? t.success('✓ Connected') : t.warning('✗ Not Authenticated'),
        'Account':       status.account || '—',
        'Project ID':    status.project || t.warning('(not set)'),
        'Location':      status.location,
        'Token Source':  status.tokenSource,
        'API Format':    config.get('apiFormat') === 'gcloud' ? t.success('gcloud (active)') : config.get('apiFormat'),
        'Active Model':  config.get('model'),
      }));
      console.log();
      console.log(t.dim('  Subcommands: status, use, login, project <id>, location <region>, token <token>, models'));
      console.log();
      break;
    }
    case 'use':
    case 'enable': {
      config.set('apiFormat', 'gcloud');
      const proj = getGCloudProject();
      if (!proj) {
        renderWarning('API format set to gcloud. Note: Google Cloud Project ID is not set yet. Set it using: /gcloud project <project-id>');
      } else {
        renderSuccess(`API format switched to ${t.accent('gcloud')} (Project: ${t.accent(proj)}).`);
      }
      break;
    }
    case 'login': {
      renderInfo('Google Cloud Authentication setup:');
      renderInfo('If gcloud CLI is installed, authenticate in your terminal by running:');
      console.log(t.codeKw('  gcloud auth application-default login'));
      console.log(t.codeKw('  gcloud auth login'));
      renderInfo('Or set your Google Cloud Access Token directly:');
      console.log(t.codeKw('  /gcloud token <your-access-token>'));
      break;
    }
    case 'token': {
      if (!rest) {
        const token = getGCloudAccessToken();
        if (token) {
          renderSuccess(`Current Access Token: ${t.accent(token.slice(0, 15) + '••••••••' + token.slice(-5))}`);
        } else {
          renderWarning('No Google Cloud access token found.');
        }
      } else if (rest.startsWith('{')) {
        try {
          const credsObj = JSON.parse(rest);
          saveGCloudCredentialsObj(credsObj);
          renderSuccess(`Google Cloud Authorized User credentials JSON loaded! (Project: ${t.accent(getGCloudProject())})`);
        } catch (err) {
          renderError('Invalid credentials JSON: ' + err.message);
        }
      } else {
        config.set('gcloudAccessToken', rest);
        config.set('apiFormat', 'gcloud');
        config.save();
        refreshGCloudToken();
        renderSuccess('Google Cloud access token updated and apiFormat set to gcloud.');
      }
      break;
    }
    case 'project': {
      if (!rest) {
        renderInfo(`Current Google Cloud Project: ${t.accent(getGCloudProject() || '(not set)')}`);
      } else {
        config.set('gcloudProject', rest);
        config.save();
        renderSuccess(`Google Cloud Project set to ${t.accent(rest)}`);
      }
      break;
    }
    case 'location':
    case 'region': {
      if (!rest) {
        renderInfo(`Current Google Cloud Location: ${t.accent(getGCloudLocation())}`);
      } else {
        config.set('gcloudLocation', rest);
        config.save();
        renderSuccess(`Google Cloud Location set to ${t.accent(rest)}`);
      }
      break;
    }
    case 'models': {
      console.log();
      console.log(gradientText('  🤖 GOOGLE CLOUD & GEMINI TEXT AI MODELS', ['#4285F4', '#EA4335']));
      console.log(t.dim('  ──────────────────────────────────────────────'));
      const rows = RECOMMENDED_GCLOUD_MODELS.map(m => [t.accent(m.id), t.bold(m.name), t.dim(m.desc)]);
      console.log(renderTable(['Model ID', 'Name', 'Description'], rows));
      console.log();
      console.log(t.dim('  Use ') + t.codeKw('/model <model-id>') + t.dim(' to switch to any model.'));
      console.log();
      break;
    }
    default: {
      renderError(`Unknown subcommand: ${sub}`);
      renderInfo('Available: status, use, login, project, location, token, models');
    }
  }

  return { handled: true };
}

function cmdCost(_, ctx) {
  if (ctx?.api) {
    const a = ctx.api;
    console.log();
    console.log(t.bold('  💰 Session Usage'));
    console.log(t.dim('  ─────────────────'));
    console.log(renderKeyValue({
      'Input tokens':  a.totalInputTokens.toLocaleString(),
      'Output tokens': a.totalOutputTokens.toLocaleString(),
      'Total tokens':  (a.totalInputTokens + a.totalOutputTokens).toLocaleString(),
      'Estimated cost': '$' + a.totalCost.toFixed(4),
    }));
    console.log();
  }
  return { handled: true };
}

function cmdAuto() {
  const v = !config.get('autoApprove');
  config.set('autoApprove', v);
  config.save();
  renderSuccess(`Auto-approve is now ${v ? t.success('ON ✓') : t.warning('OFF')}`);
  return { handled: true };
}

function cmdYolo() {
  const v = !config.get('yoloMode');
  config.set('yoloMode', v);
  config.set('autoApprove', v);
  config.save();
  if (v) {
    renderWarning('YOLO MODE ENABLED — All tool calls auto-approved including dangerous ones!');
  } else {
    renderSuccess('YOLO mode disabled.');
  }
  return { handled: true };
}

function cmdSystem(args) {
  if (args.length === 0) {
    const sp = config.get('systemPrompt') || '(default)';
    console.log();
    console.log(t.bold('  📜 System Prompt'));
    console.log(t.dim('  ─────────────────'));
    console.log('  ' + sp.split('\n').join('\n  '));
    console.log();
    return { handled: true };
  }
  const sp = args.join(' ');
  if (sp.toLowerCase() === 'default' || sp.toLowerCase() === 'reset') {
    config.set('systemPrompt', '');
    config.save();
    renderSuccess('System prompt reset to default.');
  } else {
    config.set('systemPrompt', sp);
    config.save();
    renderSuccess('System prompt updated.');
  }
  return { handled: true };
}

function cmdHistory(_, ctx) {
  if (!ctx?.history) return { handled: true };
  const msgs = ctx.history.messages;
  console.log();
  console.log(t.bold(`  📚 Conversation History — ${msgs.length} messages`));
  console.log(t.dim('  ────────────────────────────────────'));
  msgs.forEach((m, i) => {
    const role = m.role === 'user' ? t.userBadge('USER') : m.role === 'assistant' ? t.aiBadge('AI') : t.dim('SYS');
    let preview = '';
    if (typeof m.content === 'string') preview = m.content;
    else if (Array.isArray(m.content)) {
      preview = m.content.map(c => c.text || c.type || '').join(' ');
    }
    preview = preview.replace(/\s+/g, ' ').slice(0, 80);
    console.log(`  ${t.dim(String(i + 1).padStart(3))} ${role}  ${preview}${preview.length === 80 ? '…' : ''}`);
  });
  console.log();
  return { handled: true };
}

function cmdSessions() {
  try {
    const dir = config.historyDir;
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    if (files.length === 0) { renderInfo('No saved sessions found.'); return { handled: true }; }
    console.log();
    console.log(t.bold('  💾 Saved Sessions'));
    console.log(t.dim('  ──────────────────'));
    const rows = files.map(f => {
      const stat = statSync(join(dir, f));
      return [t.accent(f.replace('.json', '')), t.dim(stat.mtime.toLocaleString()), t.dim((stat.size / 1024).toFixed(1) + ' KB')];
    });
    console.log(renderTable(['Session ID', 'Modified', 'Size'], rows));
    console.log();
    console.log(t.dim('  Use ') + t.codeKw('/load <id>') + t.dim(' to restore.'));
    console.log();
  } catch (e) { renderError(e.message); }
  return { handled: true };
}

function cmdSave(_, ctx) {
  if (!ctx?.history) return { handled: true };
  try {
    const path = ctx.history.save();
    renderSuccess(`Session saved → ${t.dim(path)}`);
  } catch (e) { renderError(e.message); }
  return { handled: true };
}

async function cmdLoad(args, ctx) {
  if (args.length === 0) { renderWarning('Usage: /load <session-id>'); return { handled: true }; }
  if (!ctx?.history) return { handled: true };
  try {
    const ConversationHistory = (await import('./history.js')).default;
    const loaded = ConversationHistory.load(args[0]);
    if (!loaded) { renderError('Session not found.'); return { handled: true }; }
    ctx.history.messages = loaded.messages;
    ctx.history.sessionId = loaded.sessionId;
    renderSuccess(`Loaded session ${t.accent(args[0])} with ${loaded.messages.length} messages.`);
  } catch (e) { renderError(e.message); }
  return { handled: true };
}

async function cmdResume(_, ctx) {
  if (!ctx?.history) return { handled: true };
  try {
    const dir = config.historyDir;
    const current = `${ctx.history.sessionId}.json`;
    const prev = readdirSync(dir)
      .filter(f => f.endsWith('.json') && f !== current)
      .map(f => ({ f, m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0];

    if (!prev) { renderInfo('No previous session to resume.'); return { handled: true }; }

    const ConversationHistory = (await import('./history.js')).default;
    const loaded = ConversationHistory.load(prev.f.replace(/\.json$/, ''));
    if (!loaded || !loaded.messages.length) { renderWarning('The previous session was empty.'); return { handled: true }; }

    ctx.history.messages = loaded.messages;
    ctx.messages = loaded.messages;
    renderSuccess(`Resumed ${t.accent(loaded.sessionId)} — ${loaded.messages.length} messages restored.`);
  } catch (e) { renderError(e.message); }
  return { handled: true };
}

function cmdMemory(args) {
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'clear') {
    config.saveMemory('');
    renderSuccess('Project memory cleared.');
    return { handled: true };
  }
  if (sub === 'add') {
    const fact = args.slice(1).join(' ').trim();
    if (!fact) { renderWarning('Usage: /memory add <fact>'); return { handled: true }; }
    config.appendMemory(fact);
    renderSuccess('Remembered.');
    return { handled: true };
  }

  const mem = config.loadMemory().trim();
  console.log();
  console.log(t.bold('  🧠 Project Memory'));
  console.log(t.dim('  ───────────────────'));
  console.log(t.dim('  ' + config.memoryFile));
  console.log();
  if (!mem) {
    renderInfo('Empty — facts get saved here as the AI learns them.');
  } else {
    for (const line of mem.split('\n')) console.log('  ' + t.text(line));
  }
  if (config.get('enableMemory') === false) {
    renderWarning('Memory is currently disabled (enableMemory = false).');
  }
  console.log();
  console.log(t.dim('  Subcommands: ') + t.codeKw('add <fact>') + t.dim(', ') + t.codeKw('clear'));
  console.log();
  return { handled: true };
}

function cmdTools() {
  const mcpDefs = mcpManager.getToolDefinitions();
  const totalTools = TOOL_DEFINITIONS.length + mcpDefs.length;
  console.log();
  console.log(t.bold(`  🔧 Available Tools (${totalTools})`));
  console.log(t.dim('  ──────────────────────────'));
  const rows = TOOL_DEFINITIONS.map(td => [t.tool(td.name), t.dim(td.description.split('.')[0])]);
  for (const md of mcpDefs) {
    rows.push([t.tool(md.name), t.dim(`[MCP: ${md._mcpServer}] ${(md.description || '').split('.')[0]}`)]);
  }
  console.log(renderTable(['Tool', 'Description'], rows));
  console.log();
  return { handled: true };
}

async function cmdTheme(args) {
  const themes = ['default', 'dark', 'neon', 'matrix', 'cosmic', 'ocean', 'sunset'];
  if (args.length === 0) {
    renderInfo(`Current theme: ${t.accent(config.get('theme') || 'default')}`);
    renderInfo(`Available: ${themes.map(x => t.codeKw(x)).join(', ')}`);
    return { handled: true };
  }
  const th = args[0];
  if (!themes.includes(th)) { renderError(`Unknown theme: ${th}`); return { handled: true }; }
  config.set('theme', th);
  config.save();
  applyTheme(th);
  if (th === 'matrix') await matrixRain();
  renderSuccess(`Theme set to ${t.accent(th)}.`);
  return { handled: true };
}

function cmdReset() {
  config.reset();
  config.save();
  renderSuccess('Config reset (API credentials preserved).');
  return { handled: true };
}

function cmdStatus(_, ctx) {
  console.log();
  console.log(gradientText('  📊 STATUS DASHBOARD', ['#22D3EE', '#A78BFA']));
  console.log();
  const a = ctx?.api;
  const h = ctx?.history;
  const statusObj = {
    'Model':         config.get('model'),
    'API Format':    config.get('apiFormat'),
    'Base URL':      config.get('baseUrl'),
    'Auto-approve':  config.get('autoApprove') ? '✓ ON' : '✗ OFF',
    'YOLO mode':     config.get('yoloMode') ? '⚠ ON' : '✗ OFF',
    'Theme':         config.get('theme') || 'default',
    'Session ID':    h?.sessionId || '—',
    'Messages':      h?.messages.length ?? 0,
    'Input tokens':  a?.totalInputTokens.toLocaleString() ?? 0,
    'Output tokens': a?.totalOutputTokens.toLocaleString() ?? 0,
    'Total cost':    '$' + (a?.totalCost.toFixed(4) ?? '0.0000'),
  };
  if (config.get('apiFormat') === 'gcloud') {
    statusObj['Gcloud Project']  = getGCloudProject() || '(not set)';
    statusObj['Gcloud Location'] = getGCloudLocation();
  }
  console.log(renderKeyValue(statusObj));
  console.log();
  return { handled: true };
}

function cmdAbout() {
  console.log();
  console.log(drawBox(
    gradientText(`MORALTA CLAUDE v${_version}`, ['#A78BFA', '#22D3EE']) + '\n' +
    t.dim('A powerful CLI AI coding assistant\n') +
    t.dim('Inspired by Claude Code\n\n') +
    t.accent('Features: ') + t.dim('streaming, tool use, multi-API, themes, sessions') + '\n' +
    t.accent('License: ') + t.dim('MIT'),
    { padding: 1, borderColor: '#A78BFA' }
  ));
  console.log();
  return { handled: true };
}

let profileStartTime = null;
let profileEndTime = null;
let isProfiling = false;
let isTracing = false;

async function cmdProject(args) {
  console.log();
  console.log(gradientText('  📁 PROJECT MANAGEMENT', ['#10B981', '#22D3EE']));
  console.log();
  
  const subCmd = args.length > 0 ? args[0].toLowerCase() : '';
  const subArgs = args.slice(1);
  
  if (!subCmd || subCmd === 'help') {
    renderInfo('Project commands:');
    renderInfo('  • project init    - Initialize project analysis');
    renderInfo('  • project deps    - Analyze dependencies');
    renderInfo('  • project docs    - Generate documentation');
    renderInfo('  • project test    - Run tests with coverage');
    return { handled: true };
  }
  
  switch (subCmd) {
    case 'init': {
      renderInfo('Initializing project analysis...');
      const res = await executeEnhancedTool('analyze_codebase', { path: '.', depth: 3, include_deps: true });
      if (res.error) {
        renderError(res.error);
      } else {
        renderSuccess('Project analysis complete.');
        console.log(renderKeyValue({
          'Root Directory': res.path,
          'Dependencies Found': res.dependencies?.total ?? 0,
          'Top-level Items': Object.keys(res.structure || {}).filter(k => k !== 'node_modules' && k !== '.git').join(', ')
        }));
      }
      break;
    }
    case 'deps': {
      renderInfo('Analyzing dependencies...');
      const res = await executeEnhancedTool('dependency_check', { path: '.', check_vulnerabilities: true });
      if (res.error) {
        renderError(res.error);
      } else {
        renderSuccess(`Found ${res.count} dependencies:`);
        if (res.dependencies && res.dependencies.length > 0) {
          console.log('  ' + res.dependencies.join(', '));
        }
      }
      break;
    }
    case 'docs': {
      renderInfo('Generating documentation...');
      const res = await executeEnhancedTool('generate_docs', { source: '.', format: 'markdown', output: './docs.md' });
      if (res.error) {
        renderError(res.error);
      } else {
        renderSuccess(`Documentation successfully generated at ${t.accent(res.output)} (${(res.size / 1024).toFixed(2)} KB).`);
      }
      break;
    }
    case 'test': {
      renderInfo('Running tests with coverage...');
      const res = await executeEnhancedTool('test_coverage', { test_command: 'npm test', output_format: 'text' });
      if (!res.success) {
        renderWarning(`Tests failed or no tests found: ${res.error || ''}`);
        if (res.output) console.log(res.output);
      } else {
        renderSuccess('Tests completed successfully.');
        if (res.output) console.log(res.output);
      }
      break;
    }
    default:
      renderError(`Unknown project subcommand: ${subCmd}`);
  }
  
  console.log();
  return { handled: true };
}

function cmdDebug(args) {
  console.log();
  console.log(gradientText('  🐞 DEBUG TOOLS', ['#F59E0B', '#EF4444']));
  console.log();
  
  if (args.length === 0 || args[0] === 'help') {
    renderInfo('Debug commands:');
    renderInfo('  • debug log      - Toggle / Show debug logs');
    renderInfo('  • debug profile  - Toggle performance profiling');
    renderInfo('  • debug trace    - Toggle execution tracing');
    return { handled: true };
  }
  
  const subCmd = args[0].toLowerCase();
  
  switch (subCmd) {
    case 'log': {
      const dbg = !config.get('debug');
      config.set('debug', dbg);
      config.save();
      renderSuccess(`Debug logs are now ${dbg ? t.success('ON ✓') : t.warning('OFF')}`);
      break;
    }
    case 'profile':
      isProfiling = !isProfiling;
      if (isProfiling) {
        profileStartTime = Date.now();
        renderSuccess('Performance profiling started.');
      } else {
        profileEndTime = Date.now();
        const elapsed = ((profileEndTime - profileStartTime) / 1000).toFixed(3);
        renderSuccess(`Performance profiling stopped. Elapsed time: ${t.accent(elapsed + 's')}`);
      }
      break;
    case 'trace':
      isTracing = !isTracing;
      renderSuccess(`Execution tracing is now ${isTracing ? t.success('ON ✓') : t.warning('OFF')}`);
      break;
    default:
      renderError(`Unknown debug subcommand: ${subCmd}`);
  }
  
  console.log();
  return { handled: true };
}

function cmdProfile(args) {
  console.log();
  console.log(gradientText('  ⚡ PERFORMANCE PROFILING', ['#8B5CF6', '#EC4899']));
  console.log();
  
  if (args.length === 0 || args[0] === 'help') {
    renderInfo('Profiling commands:');
    renderInfo('  • profile start  - Start profiling session');
    renderInfo('  • profile stop   - Stop profiling session');
    renderInfo('  • profile report - Show profiling report');
    return { handled: true };
  }
  
  const subCmd = args[0].toLowerCase();
  
  switch (subCmd) {
    case 'start':
      isProfiling = true;
      profileStartTime = Date.now();
      renderSuccess('Performance profiling session started.');
      break;
    case 'stop':
      if (!isProfiling || !profileStartTime) {
        renderWarning('No active profiling session. Use profile start first.');
      } else {
        isProfiling = false;
        profileEndTime = Date.now();
        const elapsed = ((profileEndTime - profileStartTime) / 1000).toFixed(3);
        renderSuccess(`Performance profiling session stopped. Elapsed time: ${t.accent(elapsed + 's')}`);
      }
      break;
    case 'report':
      if (profileStartTime) {
        const end = isProfiling ? Date.now() : profileEndTime;
        const elapsed = ((end - profileStartTime) / 1000).toFixed(3);
        console.log(renderKeyValue({
          'Status': isProfiling ? 'Profiling Active' : 'Profiling Stopped',
          'Start Time': new Date(profileStartTime).toLocaleTimeString(),
          'Duration': elapsed + 's',
          'Memory Usage': (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB'
        }));
      } else {
        renderInfo('No profiling data available. Start a session with profile start.');
      }
      break;
    default:
      renderError(`Unknown profile subcommand: ${subCmd}`);
  }
  
  console.log();
  return { handled: true };
}

/* ──────────────────────────────────────────────
   MCP commands
   ────────────────────────────────────────────── */

async function cmdMCP(args) {
  const sub = args.length > 0 ? args[0].toLowerCase() : 'status';

  switch (sub) {
    case 'list':
    case 'status': {
      const statuses = mcpManager.getStatus();
      console.log();
      console.log(t.bold('  🔌 MCP Servers'));
      console.log(t.dim('  ─────────────────'));
      if (statuses.length === 0) {
        renderInfo('No MCP servers configured. Use "add" to add one.');
      } else {
        for (const s of statuses) {
          const icon = s.connected ? t.success('✓') : t.warning('✗');
          console.log(`  ${icon} ${t.accent(s.name)} — ${s.tools} tool${s.tools !== 1 ? 's' : ''}${s.connected ? '' : t.dim(' (disconnected)')}`);
        }
        renderSuccess(`${statuses.length} server${statuses.length > 1 ? 's' : ''} configured`);
      }
      console.log();
      console.log(t.dim('  Subcommands: list, add, remove, reconnect, help'));
      console.log();
      break;
    }
    case 'add': {
      const name = args[1];
      const command = args[2];
      if (!name || !command) {
        renderWarning('Usage: /mcp add <name> <command> [args...]');
        break;
      }
      const extraArgs = args.slice(3);
      try {
        const r = await mcpManager.addServer(name, command, extraArgs);
        if (r.error) renderError(r.error);
        else renderSuccess(`MCP server "${name}" connected (${r.tools} tools)`);
      } catch (e) { renderError(e.message); }
      break;
    }
    case 'remove': {
      const name = args[1];
      if (!name) { renderWarning('Usage: /mcp remove <name>'); break; }
      try {
        const r = await mcpManager.removeServer(name);
        if (r.error) renderError(r.error);
        else renderSuccess(`MCP server "${name}" removed.`);
      } catch (e) { renderError(e.message); }
      break;
    }
    case 'reconnect': {
      const name = args[1];
      if (!name) { renderWarning('Usage: /mcp reconnect <name>'); break; }
      try {
        const r = await mcpManager.reconnectServer(name);
        if (r.error) renderError(r.error);
        else renderSuccess(`MCP server "${name}" reconnected (${r.tools} tools)`);
      } catch (e) { renderError(e.message); }
      break;
    }
    case 'help':
    default:
      console.log();
      console.log(t.bold('  🔌 MCP Commands'));
      console.log(t.dim('  ────────────────'));
      renderInfo('/mcp list      — List configured servers');
      renderInfo('/mcp status    — Show connection status');
      renderInfo('/mcp add <name> <command> [args...] — Add and connect a server');
      renderInfo('/mcp remove <name> — Remove a server');
      renderInfo('/mcp reconnect <name> — Reconnect a server');
      renderInfo('');
      renderInfo('MCP servers can also be managed by the AI using mcp_* tools.');
      console.log();
      break;
  }
  return { handled: true };
}

function cmdExit(_, ctx) {
  try { ctx?.history?.save(); } catch {}
  mcpManager.disconnectAll();
  console.log();
  console.log(gradientText('  ✦ Goodbye! Happy coding! ✦', ['#A78BFA', '#22D3EE', '#10B981']));
  console.log();
  process.exit(0);
}
