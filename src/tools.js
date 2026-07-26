import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, statSync, unlinkSync,
  rmSync, copyFileSync, renameSync, appendFileSync,
} from 'fs';
import { join, resolve, relative, dirname, extname, basename } from 'path';
import { execSync, spawn, exec } from 'child_process';
import { glob } from 'glob';
import { executeEnhancedTool } from './enhanced_tools.js';
import { mcpManager } from './mcp.js';
import config from './config.js';

/* ──────────────────────────────────────────────
   ────────────────────────────────────────────── */

export const TOOL_DEFINITIONS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Returns numbered lines. Optionally specify a line range.',
    parameters: {
      type: 'object',
      properties: {
        path:       { type: 'string',  description: 'File path (absolute or relative to CWD)' },
        start_line: { type: 'integer', description: 'First line to read (1-indexed, optional)' },
        end_line:   { type: 'integer', description: 'Last line to read (inclusive, optional)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file. Directories are created automatically.',
    parameters: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'Full contents to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Edit an existing file by finding exact text and replacing it. The old_text must match EXACTLY (including whitespace) and appear only once.',
    parameters: {
      type: 'object',
      properties: {
        path:     { type: 'string', description: 'File path to edit' },
        old_text: { type: 'string', description: 'Exact text to find (must be unique in file)' },
        new_text: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'multi_edit',
    description: 'Apply multiple find/replace edits to a single file in one atomic operation.',
    parameters: {
      type: 'object',
      properties: {
        path:  { type: 'string', description: 'File to edit' },
        edits: {
          type: 'array',
          description: 'Array of {old_text, new_text} edits to apply in order',
          items: {
            type: 'object',
            properties: {
              old_text: { type: 'string' },
              new_text: { type: 'string' },
            },
            required: ['old_text', 'new_text'],
          },
        },
      },
      required: ['path', 'edits'],
    },
  },
  {
    name: 'append_file',
    description: 'Append text to the end of a file. Creates the file if it does not exist.',
    parameters: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'Text to append' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory (recursive).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to delete' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_file',
    description: 'Move or rename a file or directory.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source path' },
        to:   { type: 'string', description: 'Destination path' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'copy_file',
    description: 'Copy a file to a new location.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source file' },
        to:   { type: 'string', description: 'Destination file' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command and return stdout/stderr. Use for running tests, builds, git, npm, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string',  description: 'Shell command to execute' },
        cwd:     { type: 'string',  description: 'Working directory (optional)' },
        timeout: { type: 'integer', description: 'Timeout in ms (default 30000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for a regex pattern across files. Returns matching lines with file:line:content.',
    parameters: {
      type: 'object',
      properties: {
        pattern:        { type: 'string',  description: 'Regex pattern to search for' },
        path:           { type: 'string',  description: 'Directory to search' },
        include:        { type: 'string',  description: 'Glob pattern for files to include (e.g. "**/*.js")' },
        case_sensitive: { type: 'boolean', description: 'Case-sensitive matching (default false)' },
      },
      required: ['pattern', 'path'],
    },
  },
  {
    name: 'find_files',
    description: 'Find files by glob pattern. Returns matching file paths.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "src/**/*.ts")' },
        cwd:     { type: 'string', description: 'Base directory (optional)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories with names, types, and sizes.',
    parameters: {
      type: 'object',
      properties: {
        path:      { type: 'string',  description: 'Directory path' },
        recursive: { type: 'boolean', description: 'List recursively (default false)' },
        max_depth: { type: 'integer', description: 'Max recursion depth (default 3)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_info',
    description: 'Get metadata about a file (size, modified time, type, line count).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch text content from an HTTP(S) URL. Useful for reading docs, APIs, or web pages.',
    parameters: {
      type: 'object',
      properties: {
        url:    { type: 'string', description: 'URL to fetch' },
        method: { type: 'string', description: 'HTTP method (default GET)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a new directory (with parents if needed).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create' },
      },
      required: ['path'],
    },
  },
  {
    name: 'tree',
    description: 'Display a directory structure as an ASCII tree.',
    parameters: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Root path (default .)' },
        max_depth: { type: 'number', description: 'Maximum recursion depth (default 3)' },
        show_hidden: { type: 'boolean', description: 'Include hidden files (default false)' },
      },
    },
  },
  {
    name: 'count_lines',
    description: 'Count lines, words, and characters in a file or set of files matching a glob.',
    parameters: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path or glob pattern' },
      },
      required: ['path'],
    },
  },
  {
    name: 'code_stats',
    description: 'Compute code statistics for a directory (file counts and line counts grouped by extension).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root directory (default .)' },
      },
    },
  },
  {
    name: 'git_status',
    description: 'Show the git status of the current repository.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'git_diff',
    description: 'Show git diff for the working tree or a specific file.',
    parameters: {
      type: 'object',
      properties: {
        path:   { type: 'string', description: 'Optional file path' },
        staged: { type: 'boolean', description: 'Show staged diff (default false)' },
      },
    },
  },
  {
    name: 'git_log',
    description: 'Show recent git commits.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of commits to show (default 10)' },
      },
    },
  },
  {
    name: 'git_commit',
    description: 'Stage all changes and create a git commit with the given message.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        add_all: { type: 'boolean', description: 'Run git add -A first (default true)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'json_query',
    description: 'Read a JSON file and extract a value by dot-path (e.g. "scripts.start").',
    parameters: {
      type: 'object',
      properties: {
        path:  { type: 'string', description: 'Path to JSON file' },
        query: { type: 'string', description: 'Dot-path inside the JSON (omit for full file)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'replace_in_files',
    description: 'Search and replace a string across multiple files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern:  { type: 'string', description: 'Glob pattern of files to update' },
        find:     { type: 'string', description: 'Exact text to find' },
        replace:  { type: 'string', description: 'Replacement text' },
        dry_run:  { type: 'boolean', description: 'Preview only (default false)' },
      },
      required: ['pattern', 'find', 'replace'],
    },
  },
  {
    name: 'analyze_codebase',
    description: 'Analyze project structure, dependencies, and provide insights.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root directory to analyze (default .)' },
        depth: { type: 'number', description: 'Analysis depth (default 5)' },
        focus: { type: 'string', description: 'Focus area (dependencies, structure, tests, etc.)' },
      },
    },
  },
  {
    name: 'generate_docs',
    description: 'Generate documentation from code comments and structure.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory or file to document' },
        format: { type: 'string', description: 'Output format (markdown, html, json)' },
        output: { type: 'string', description: 'Output file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'test_coverage',
    description: 'Run tests and analyze coverage (supports multiple test frameworks).',
    parameters: {
      type: 'object',
      properties: {
        framework: { type: 'string', description: 'Test framework (jest, mocha, etc.)' },
        config: { type: 'string', description: 'Config file path' },
        threshold: { type: 'number', description: 'Minimum coverage threshold' },
      },
    },
  },
  {
    name: 'dependency_check',
    description: 'Check for outdated, vulnerable, or unused dependencies.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project directory (default .)' },
        check: { type: 'string', description: 'What to check (outdated, vulnerabilities, unused)' },
      },
    },
  },
  {
    name: 'code_quality',
    description: 'Analyze code quality and suggest improvements.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to analyze' },
        ruleset: { type: 'string', description: 'Ruleset: basic, strict, custom (default basic)' },
      },
      required: ['path'],
    },
  },

  {
    name: 'remember',
    description: 'Save a durable fact about this project to persistent memory that survives across sessions. Use for user preferences, project conventions, architecture decisions, and setup quirks — not for one-off details.',
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'One concise fact to remember, written as a standalone sentence' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'forget',
    description: 'Remove saved facts from persistent memory whose text matches the given substring.',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Substring identifying the memory entries to delete' },
      },
      required: ['match'],
    },
  },

  /* ── MCP Management Tools ── */
  {
    name: 'mcp_list_servers',
    description: 'List all configured MCP servers and their connection status.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'mcp_add_server',
    description: 'Add and connect a new MCP server. Provide the name, command, and optional args/env.',
    parameters: {
      type: 'object',
      properties: {
        name:    { type: 'string', description: 'Server name (unique identifier)' },
        command: { type: 'string', description: 'Executable command to start the server' },
        args:    { type: 'array',  description: 'Command-line arguments', items: { type: 'string' } },
        env:     { type: 'object', description: 'Environment variables for the server process', additionalProperties: { type: 'string' } },
      },
      required: ['name', 'command'],
    },
  },
  {
    name: 'mcp_remove_server',
    description: 'Remove an MCP server configuration and disconnect it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name to remove' },
      },
      required: ['name'],
    },
  },
  {
    name: 'mcp_connect',
    description: 'Connect to an MCP server that is configured but disconnected.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name to connect' },
      },
      required: ['name'],
    },
  },
  {
    name: 'mcp_disconnect',
    description: 'Disconnect from an MCP server without removing its configuration.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name to disconnect' },
      },
      required: ['name'],
    },
  },
  {
    name: 'mcp_reconnect',
    description: 'Reconnect to an MCP server by disconnecting and connecting again.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name to reconnect' },
      },
      required: ['name'],
    },
  },
];

/* ──────────────────────────────────────────────
   Tool dispatcher
   ────────────────────────────────────────────── */

export async function executeTool(name, args) {
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch (e) {}
  }
  // Un-nest if proxy returned { input: "..." } or { input: { ... } }
  if (args && typeof args === 'object' && !args.path) {
    const wrapped = args.input || args.arguments || args.parameters;
    if (typeof wrapped === 'string') {
      try { args = JSON.parse(wrapped); } catch (e) {}
    } else if (wrapped && typeof wrapped === 'object') {
      args = wrapped;
    }
  }

  // Ensure args is always an object
  if (!args || typeof args !== 'object') args = {};

  // Route MCP management tools
  if (name.startsWith('mcp_')) {
    return executeMCPTool(name, args);
  }

  // Route MCP-provided tools
  const mcpServer = mcpManager.isMCPTool(name);
  if (mcpServer) {
    return mcpManager.executeTool(name, args);
  }

  // Validate required 'path' arg for tools that need it
  const needsPath = ['read_file','write_file','edit_file','multi_edit','append_file',
    'delete_file','list_directory','file_info','create_directory','count_lines',
    'search_files','tree','code_stats','code_quality'];
  if (needsPath.includes(name) && !args.path) {
    return { error: `Missing required parameter "path" for ${name}` };
  }
  if (['move_file','copy_file'].includes(name) && (!args.from || !args.to)) {
    return { error: `Missing required parameters "from" and "to" for ${name}` };
  }
  if (name === 'run_command' && !args.command) {
    return { error: 'Missing required parameter "command" for run_command' };
  }

  try {
    switch (name) {
      case 'read_file':      return readFile(args);
      case 'write_file':     return writeFile(args);
      case 'edit_file':      return editFile(args);
      case 'multi_edit':     return multiEdit(args);
      case 'append_file':    return appendFile(args);
      case 'delete_file':    return deleteFile(args);
      case 'move_file':      return moveFile(args);
      case 'copy_file':      return copyFile(args);
      case 'run_command':    return runCommand(args);
      case 'search_files':   return searchFiles(args);
      case 'find_files':     return findFiles(args);
      case 'list_directory': return listDirectory(args);
      case 'file_info':      return fileInfo(args);
      case 'fetch_url':      return fetchUrl(args);
      case 'create_directory': return createDirectory(args);
      case 'tree':           return tree(args);
      case 'count_lines':    return countLines(args);
      case 'git_status':     return gitStatus(args);
      case 'git_diff':       return gitDiff(args);
      case 'git_log':        return gitLog(args);
      case 'git_commit':     return gitCommit(args);
      case 'code_stats':     return codeStats(args);
      case 'json_query':     return jsonQuery(args);
      case 'replace_in_files': return replaceInFiles(args);
      case 'http_request':   return fetchUrl(args); // alias
      case 'analyze_codebase':   return analyzeCodebase(args);
      case 'generate_docs':      return generateDocs(args);
      case 'test_coverage':      return testCoverage(args);
      case 'dependency_check':   return dependencyCheck(args);
      case 'code_quality':       return executeEnhancedTool('code_quality', args);
      case 'remember':       return rememberFact(args);
      case 'forget':         return forgetFact(args);
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

/* ──────────────────────────────────────────────
   Implementations
   ────────────────────────────────────────────── */

async function analyzeCodebase({ path = '.', depth = 3, focus } = {}) {
  const include_deps = !focus || focus === 'dependencies' || focus === 'all';
  return executeEnhancedTool('analyze_codebase', { path, depth, include_deps });
}

async function generateDocs({ path, format = 'markdown', output } = {}) {
  return executeEnhancedTool('generate_docs', { source: path, format, output });
}

async function testCoverage({ framework = 'auto', config, threshold } = {}) {
  let test_command = 'npm test';
  if (framework && framework !== 'auto') {
    test_command = `npx ${framework}`;
    if (config) test_command += ` --config ${config}`;
  }
  return executeEnhancedTool('test_coverage', { test_command, output_format: 'text', min_coverage: threshold });
}

async function dependencyCheck({ path = '.', check = 'outdated' } = {}) {
  const check_vulnerabilities = check === 'vulnerabilities' || check === 'all' || check === 'outdated';
  return executeEnhancedTool('dependency_check', { path, check_vulnerabilities });
}

function readFile({ path: filePath, start_line, end_line }) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) return { error: `File not found: ${filePath}` };
  const content = readFileSync(abs, 'utf-8');
  const lines = content.split('\n');
  const total = lines.length;

  const s = Math.max(1, start_line || 1);
  const e = Math.min(total, end_line || total);
  const slice = lines.slice(s - 1, e);
  const w = String(e).length;

  const numbered = slice.map((line, i) => {
    const ln = String(s + i).padStart(w, ' ');
    return `${ln} │ ${line}`;
  }).join('\n');

  const truncated = (start_line || end_line) && (s > 1 || e < total);
  return {
    path: abs,
    lines: total,
    range: truncated ? `${s}-${e}` : 'full',
    content: numbered,
  };
}

function writeFile({ path: filePath, content }) {
  const abs = resolve(filePath);
  const dir = dirname(abs);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existed = existsSync(abs);
  writeFileSync(abs, content, 'utf-8');
  return {
    path: abs,
    action: existed ? 'updated' : 'created',
    bytes: Buffer.byteLength(content, 'utf-8'),
    lines: content.split('\n').length,
  };
}

function editFile({ path: filePath, old_text, new_text }) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) return { error: `File not found: ${filePath}` };
  if (!old_text) return { error: 'Missing old_text parameter' };
  const content = readFileSync(abs, 'utf-8');
  const idx = content.indexOf(old_text);
  if (idx === -1) return { error: 'old_text not found in file (must match exactly)' };
  const last = content.lastIndexOf(old_text);
  if (last !== idx) return { error: 'old_text appears multiple times — make it more specific' };
  const updated = content.slice(0, idx) + (new_text || '') + content.slice(idx + old_text.length);
  writeFileSync(abs, updated, 'utf-8');
  return {
    path: abs,
    action: 'edited',
    removed_lines: old_text.split('\n').length,
    added_lines: (new_text || '').split('\n').length,
  };
}

function multiEdit({ path: filePath, edits }) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) return { error: `File not found: ${filePath}` };
  if (!Array.isArray(edits)) return { error: 'edits must be an array' };
  let content = readFileSync(abs, 'utf-8');
  let applied = 0;
  for (const { old_text, new_text } of edits) {
    const idx = content.indexOf(old_text);
    if (idx === -1) return { error: `Edit ${applied + 1}: old_text not found` };
    if (content.lastIndexOf(old_text) !== idx) return { error: `Edit ${applied + 1}: old_text not unique` };
    content = content.slice(0, idx) + new_text + content.slice(idx + old_text.length);
    applied++;
  }
  writeFileSync(abs, content, 'utf-8');
  return { path: abs, action: 'multi-edited', edits_applied: applied };
}

function appendFile({ path: filePath, content }) {
  const abs = resolve(filePath);
  const dir = dirname(abs);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(abs, content, 'utf-8');
  return { path: abs, action: 'appended', bytes: Buffer.byteLength(content, 'utf-8') };
}

function deleteFile({ path: filePath }) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) return { error: `Path not found: ${filePath}` };
  const stat = statSync(abs);
  if (stat.isDirectory()) rmSync(abs, { recursive: true, force: true });
  else unlinkSync(abs);
  return { path: abs, action: 'deleted', type: stat.isDirectory() ? 'directory' : 'file' };
}

function moveFile({ from, to }) {
  const src = resolve(from);
  const dst = resolve(to);
  if (!existsSync(src)) return { error: `Source not found: ${from}` };
  const dir = dirname(dst);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  renameSync(src, dst);
  return { from: src, to: dst, action: 'moved' };
}

function copyFile({ from, to }) {
  const src = resolve(from);
  const dst = resolve(to);
  if (!existsSync(src)) return { error: `Source not found: ${from}` };
  const dir = dirname(dst);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  copyFileSync(src, dst);
  return { from: src, to: dst, action: 'copied' };
}

async function runCommand({ command, cwd: cmdCwd, timeout = 30000 }) {
  // Prevent suicidal commands that kill the CLI itself
  const lowerCmd = command.toLowerCase();
  if (
    (lowerCmd.includes('taskkill') || lowerCmd.includes('pkill') || lowerCmd.includes('killall') || lowerCmd.includes('tskill')) &&
    (lowerCmd.includes('node') || lowerCmd.includes('moralta'))
  ) {
    return {
      command,
      cwd: cmdCwd || process.cwd(),
      exit_code: 1,
      stdout: '',
      stderr: 'Safety violation: Artificial Intelligence is not permitted to kill the host Node.js process.',
    };
  }

  const opts = {
    encoding: 'utf-8',
    timeout,
    cwd: cmdCwd ? resolve(cmdCwd) : process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
    shell: true,
    windowsHide: true,
  };
  return new Promise((resolveResult) => {
    exec(command, opts, (error, stdout, stderr) => {
      if (error) {
        resolveResult({
          command,
          cwd: opts.cwd,
          exit_code: error.code ?? 1,
          stdout: (stdout || '').toString(),
          stderr: (stderr || error.message || '').toString(),
        });
      } else {
        resolveResult({
          command,
          cwd: opts.cwd,
          exit_code: 0,
          stdout: (stdout || '').toString(),
          stderr: (stderr || '').toString(),
        });
      }
    });
  });
}

async function searchFiles({ pattern, path: searchPath, include = '**/*', case_sensitive = false }) {
  const abs = resolve(searchPath);
  if (!existsSync(abs)) return { error: `Path not found: ${searchPath}` };
  if (!pattern) return { error: 'Missing required parameter "pattern"' };
  const flags = case_sensitive ? 'g' : 'gi';
  const re = new RegExp(pattern, flags);
  const files = await glob(include, {
    cwd: abs,
    nodir: true,
    ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.lock', '*.log'],
    absolute: true,
  });
  const matches = [];
  let scanned = 0;
  for (const f of files) {
    try {
      const stat = statSync(f);
      if (stat.size > 1024 * 1024) continue; // skip > 1MB
      const text = readFileSync(f, 'utf-8');
      scanned++;
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (re.test(line)) {
          matches.push({ file: relative(abs, f), line: i + 1, content: line.trim().slice(0, 200) });
        }
        re.lastIndex = 0;
      });
      if (matches.length > 200) return { pattern, path: abs, scanned, matches: matches.slice(0, 200), truncated: true };
    } catch {}
  }
  return { pattern, path: abs, scanned, matches, totalMatches: matches.length };
}

async function findFiles({ pattern, cwd: findCwd }) {
  const base = findCwd ? resolve(findCwd) : process.cwd();
  const files = await glob(pattern, {
    cwd: base,
    ignore: ['node_modules/**', '.git/**'],
    nodir: false,
  });
  return { pattern, cwd: base, total: files.length, files: files.slice(0, 500) };
}

function listDirectory({ path: dirPath, recursive = false, max_depth = 3 }) {
  const abs = resolve(dirPath);
  if (!existsSync(abs)) return { error: `Directory not found: ${dirPath}` };
  const entries = [];

  function walk(dir, depth) {
    if (depth > max_depth) return;
    let items;
    try { items = readdirSync(dir); } catch { return; }
    for (const item of items) {
      if (item === 'node_modules' || item === '.git') continue;
      const full = join(dir, item);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      const rel = relative(abs, full);
      if (stat.isDirectory()) {
        entries.push({ name: rel + '/', type: 'directory', size: 0 });
        if (recursive) walk(full, depth + 1);
      } else {
        entries.push({ name: rel, type: 'file', size: stat.size, sizeFmt: fmtSize(stat.size) });
      }
    }
  }
  walk(abs, 0);
  return { path: abs, total: entries.length, entries: entries.slice(0, 500) };
}

function fileInfo({ path: filePath }) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) return { error: `Not found: ${filePath}` };
  const stat = statSync(abs);
  const info = {
    path: abs,
    name: basename(abs),
    type: stat.isDirectory() ? 'directory' : 'file',
    size: stat.size,
    sizeFmt: fmtSize(stat.size),
    modified: stat.mtime.toISOString(),
    created: stat.birthtime.toISOString(),
  };
  if (stat.isFile() && stat.size < 5 * 1024 * 1024) {
    try {
      const content = readFileSync(abs, 'utf-8');
      info.lines = content.split('\n').length;
      info.extension = extname(abs);
    } catch {}
  }
  return info;
}

async function fetchUrl({ url, method = 'GET' }) {
  if (!url) return { error: 'Missing required parameter "url"' };
  try {
    const res = await fetch(url, { method });
    const text = await res.text();
    return {
      url,
      status: res.status,
      ok: res.ok,
      content_type: res.headers.get('content-type') || '',
      length: text.length,
      body: text.slice(0, 50000),
      truncated: text.length > 50000,
    };
  } catch (err) {
    return { error: `Failed to fetch ${url}: ${err.message}` };
  }
}

function fmtSize(b) {
  if (b < 1024) return b + 'B';
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + 'KB';
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + 'MB';
  return (b / 1024 ** 3).toFixed(1) + 'GB';
}

function createDirectory({ path: dirPath }) {
  const abs = resolve(dirPath);
  mkdirSync(abs, { recursive: true });
  return { path: abs, created: true };
}

function countLines({ path: filePath }) {
  const files = glob.sync(filePath);
  let totalLines = 0, totalWords = 0, totalChars = 0, fileCount = 0;
  const details = [];
  for (const f of files) {
    const abs = resolve(f);
    try {
      const stat = statSync(abs);
      if (!stat.isFile()) continue;
      const content = readFileSync(abs, 'utf-8');
      const lines = content.split('\n');
      const words = content.trim().split(/\s+/).filter(Boolean);
      const chars = content.length;
      totalLines += lines.length;
      totalWords += words.length;
      totalChars += chars;
      fileCount++;
      details.push({ path: f, lines: lines.length, words: words.length, chars });
    } catch {}
  }
  return { files: fileCount, totalLines, totalWords, totalChars, details };
}

function tree({ path: treePath = '.', max_depth = 3, show_hidden = false }) {
  const abs = resolve(treePath);
  if (!existsSync(abs)) return { error: `Path not found: ${treePath}` };
  const result = buildTree(abs, max_depth, true, 0, show_hidden);
  return { path: abs, tree: result };
}

function buildTree(dir, maxDepth, showFiles, currentDepth, showHidden = false) {
  if (currentDepth > maxDepth) return [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const items = [];
  for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!showHidden && ent.name.startsWith('.')) continue;
    if (ent.name === 'node_modules') continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      items.push({
        name: ent.name + '/',
        type: 'dir',
        children: buildTree(full, maxDepth, showFiles, currentDepth + 1, showHidden),
      });
    } else if (showFiles) {
      try {
        const stat = statSync(full);
        items.push({ name: ent.name, type: 'file', size: stat.size });
      } catch {
        items.push({ name: ent.name, type: 'file', size: 0 });
      }
    }
  }
  return items;
}

function gitStatus() {
  try {
    const status = execSync('git status --porcelain', { cwd: process.cwd(), encoding: 'utf-8' });
    const lines = status.trim().split('\n').filter(Boolean);
    const changes = lines.map(line => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3),
    }));
    return { changes, count: changes.length };
  } catch {
    return { error: 'Not a git repository or git not installed' };
  }
}

function gitDiff({ path: diffPath, staged = false }) {
  try {
    const flag = staged ? '--cached' : '';
    const filePart = diffPath && diffPath !== '.' ? `-- ${diffPath}` : '';
    const diff = execSync(`git diff ${flag} ${filePart}`, { cwd: process.cwd(), encoding: 'utf-8' });
    return { diff, lines: diff.split('\n').length };
  } catch {
    return { error: 'Not a git repository or git not installed' };
  }
}

function gitLog({ limit = 10 }) {
  try {
    const log = execSync(`git log --oneline -n ${limit}`, { cwd: process.cwd(), encoding: 'utf-8' });
    const commits = log.trim().split('\n').filter(Boolean).map(line => {
      const [hash, ...rest] = line.split(' ');
      return { hash, message: rest.join(' ') };
    });
    return { commits, count: commits.length };
  } catch {
    return { error: 'Not a git repository or git not installed' };
  }
}

function gitCommit({ message, add_all = true }) {
  if (!message) return { error: 'Missing commit message' };
  try {
    if (add_all) execSync('git add .', { cwd: process.cwd() });
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: process.cwd(), encoding: 'utf-8' });
    return { message: 'Committed successfully' };
  } catch (err) {
    return { error: 'Commit failed: ' + (err.stderr || err.message) };
  }
}

function codeStats({ path: statsPath = '.' }) {
  const absPath = resolve(statsPath);
  const files = glob.sync('**/*.{js,ts,jsx,tsx,py,java,go,rs,cpp,cs,php,rb,swift,css,html}', {
    cwd: absPath,
    ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
  });
  const stats = { totalFiles: 0, totalLines: 0, byExtension: {} };
  for (const f of files) {
    try {
      const abs = join(absPath, f);
      const content = readFileSync(abs, 'utf-8');
      const lines = content.split('\n').length;
      stats.totalLines += lines;
      stats.totalFiles++;
      const ext = extname(f).slice(1);
      stats.byExtension[ext] = (stats.byExtension[ext] || 0) + lines;
    } catch {}
  }
  return stats;
}

function jsonQuery({ path: jsonPath, query }) {
  const abs = resolve(jsonPath);
  if (!existsSync(abs)) return { error: `File not found: ${jsonPath}` };
  try {
    const data = JSON.parse(readFileSync(abs, 'utf-8'));
    if (!query) return { path: abs, value: data };
    const keys = query.split('.');
    let val = data;
    for (const k of keys) {
      if (val == null || typeof val !== 'object') return { error: `Key not found: ${query}` };
      val = val[k];
    }
    return { path: abs, query, value: val };
  } catch (err) {
    return { error: `Failed to parse JSON: ${err.message}` };
  }
}

async function replaceInFiles({ pattern, find, replace, dry_run = false }) {
  if (!find) return { error: 'Missing "find" parameter' };
  const files = await glob(pattern, {
    ignore: ['node_modules/**', '.git/**'],
    nodir: true,
  });
  const changed = [];
  const skipped = [];
  for (const f of files) {
    try {
      const abs = resolve(f);
      const content = readFileSync(abs, 'utf-8');
      if (!content.includes(find)) continue;
      const updated = content.split(find).join(replace || '');
      const count = (content.split(find).length - 1);
      if (!dry_run) writeFileSync(abs, updated, 'utf-8');
      changed.push({ file: f, replacements: count });
    } catch (err) {
      skipped.push({ file: f, error: err.message });
    }
  }
  return { pattern, find, replace: replace || '', dry_run, filesChanged: changed.length, details: changed, skipped: skipped.length > 0 ? skipped : undefined };
}

/* ──────────────────────────────────────────────
   Persistent memory
   ────────────────────────────────────────────── */

function rememberFact({ fact }) {
  if (config.get('enableMemory') === false) return { error: 'Memory is disabled (set enableMemory to true)' };
  const clean = String(fact ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return { error: 'Missing required parameter "fact"' };
  if (!config.appendMemory(clean)) return { error: 'Failed to write the memory file' };
  return { message: `Remembered: ${clean}`, path: config.memoryFile };
}

function forgetFact({ match }) {
  const needle = String(match ?? '').trim().toLowerCase();
  if (!needle) return { error: 'Missing required parameter "match"' };
  const lines = config.loadMemory().split('\n').filter(l => l.trim());
  const kept = lines.filter(l => !l.toLowerCase().includes(needle));
  const removed = lines.length - kept.length;
  if (!removed) return { message: `No memory entries matched "${match}"` };
  if (!config.saveMemory(kept.length ? kept.join('\n') + '\n' : '')) {
    return { error: 'Failed to write the memory file' };
  }
  return { message: `Forgot ${removed} memory entr${removed === 1 ? 'y' : 'ies'} matching "${match}"` };
}

/* ──────────────────────────────────────────────
   MCP Management tool dispatch
   ────────────────────────────────────────────── */

function executeMCPTool(name, args) {
  switch (name) {
    case 'mcp_list_servers': {
      const statuses = mcpManager.getStatus();
      if (statuses.length === 0) return { message: 'No MCP servers configured.' };
      return {
        message: 'MCP Servers:\n' + statuses.map(s =>
          `  ${s.connected ? '✓' : '✗'} ${s.name} (${s.tools} tools)`
        ).join('\n'),
        servers: statuses,
      };
    }
    case 'mcp_add_server': {
      if (!args.name || !args.command) return { error: 'Missing required parameters "name" and "command"' };
      return mcpManager.addServer(args.name, args.command, args.args || [], args.env || {});
    }
    case 'mcp_remove_server': {
      if (!args.name) return { error: 'Missing required parameter "name"' };
      return mcpManager.removeServer(args.name);
    }
    case 'mcp_connect': {
      if (!args.name) return { error: 'Missing required parameter "name"' };
      return mcpManager.reconnectServer(args.name);
    }
    case 'mcp_disconnect': {
      if (!args.name) return { error: 'Missing required parameter "name"' };
      return mcpManager.disconnectServer(args.name);
    }
    case 'mcp_reconnect': {
      if (!args.name) return { error: 'Missing required parameter "name"' };
      return mcpManager.reconnectServer(args.name);
    }
    default:
      return { error: `Unknown MCP tool: ${name}` };
  }
}

/**
 * Get ALL tool definitions including MCP-provided tools.
 * Call this instead of TOOL_DEFINITIONS when building the API request.
 */
export function getAllToolDefinitions() {
  const mcpTools = mcpManager.getToolDefinitions();
  return mcpTools.length > 0 ? [...TOOL_DEFINITIONS, ...mcpTools] : TOOL_DEFINITIONS;
}
