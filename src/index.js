import readline from 'readline';
import chalk   from 'chalk';
import ora     from 'ora';

import config              from './config.js';
import api                 from './api.js';
import { TOOL_DEFINITIONS, executeTool, getAllToolDefinitions } from './tools.js';
import {
  renderBanner, renderSessionInfo, renderDivider,
  renderToolCall, renderToolResult, renderApprovalPrompt,
  renderUsage, renderError, renderSuccess, renderWarning,
  renderTip, getPromptPrefix, renderPromptHeader, renderTurnHeader, renderUserMessage,
  gradientText, thinkingText, applyTheme, matrixRain,
  StreamRenderer, CodeWriteAnimation, isCodeWriteTool, t,
} from './ui.js';
import { processCommand }  from './commands.js';
import ConversationHistory  from './history.js';
import { SlashMenu, SubMenu, COMMANDS_WITH_SUBMENU } from './slashmenu.js';
import mcpManager from './mcp.js';
import {
  RECOMMENDED_GCLOUD_MODELS,
  getGCloudProject,
  getGCloudLocation,
  getGCloudAuthStatus,
} from './gcloud.js';

/* ──────────────────────────────────────────────
   Default system prompt
   ────────────────────────────────────────────── */

function defaultSystem(_maxTokens) {
  const isNativeTools = api.nativeTools;

  const toolCallInstructions = isNativeTools ? '' : `

## How to Call Tools

To use a tool, output a JSON code block in EXACTLY this format:

\`\`\`json
{"name": "tool_name", "input": { ...parameters... }}
\`\`\`

Example — list the current directory:
\`\`\`json
{"name": "list_directory", "input": {"path": "."}}
\`\`\`

Example — read a file:
\`\`\`json
{"name": "read_file", "input": {"path": "src/index.js"}}
\`\`\`

You can call multiple tools by outputting multiple JSON code blocks in one response.
After each tool runs, you will receive the result as a [Tool Result] message.`;

  const toolList = getAllToolDefinitions()
    .map(d => {
      const params = Object.entries(d.parameters?.properties || {})
        .map(([k]) => (d.parameters?.required || []).includes(k) ? `${k} (required)` : `${k} (opt)`)
        .join(', ');
      const desc = (d.description || '').split('\n')[0];
      return `- **${d.name}** — ${desc}${params ? ` Params: ${params}` : ''}`;
    })
    .join('\n');

  return `You are Moralta Claude, a powerful AI coding assistant running in the user's terminal.
You have access to tools to interact with the file system and run commands. Use them directly to complete tasks.

## Available Tools

${toolList}
${toolCallInstructions}

## Rules

1. When asked to DO something, USE TOOLS IMMEDIATELY — never just describe what you would do.
2. Always read files before editing them to understand the current content.
3. Write complete implementations — no TODOs or placeholders.
4. Be efficient: list directories first, then read only the files you need.
5. After completing operations, provide a concise summary.
6. NEVER output raw JSON, brackets, or code blocks as your entire response. Always include natural language.
7. Always respond with natural language explanations alongside your tool usage.

## Environment
- CWD: ${process.cwd()}
- OS: ${process.platform}
- Time: ${new Date().toISOString()}`;
}

export function memorySection() {
  if (config.get('enableMemory') === false) return '';
  const mem = config.loadMemory().trim();
  const facts = mem
    ? `\n\nWhat you already know about this project — trust these unless the user corrects you:\n\n${mem.split('\n').slice(-100).join('\n')}`
    : '';
  return `\n\n## Project Memory\n\nYou have persistent memory for this project that survives across sessions. When you learn a durable fact — the user's preferences, project conventions, architecture decisions, environment quirks — call the \`remember\` tool to save it. Use \`forget\` when a saved fact becomes wrong. Do not save one-off trivia.${facts}`;
}

/* ──────────────────────────────────────────────
   Setup wizard (first-run)
   ────────────────────────────────────────────── */

async function setupWizard() {
  console.log();
  console.log(t.primary.bold('  ╭─── Moralta Claude · First-Run Setup ─────────────────────╮'));
  console.log(t.primary.bold('  │') + t.text('  Configure your API connection to get started.           ') + t.primary.bold('│'));
  console.log(t.primary.bold('  ╰──────────────────────────────────────────────────────────╯'));
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  // 1 — API format
  console.log(`  ${t.dim('Choose API format / engine:')}`);
  console.log(`  ${t.highlight('1.')} Anthropic (Claude API)`);
  console.log(`  ${t.highlight('2.')} OpenAI-compatible (OpenRouter, LM Studio, Ollama, vLLM …)`);
  console.log(`  ${t.highlight('3.')} Google Cloud (Vertex AI / Gcloud Gemini Models)`);
  const fmt = await ask(`  ${t.primary('Choice [1]:')} `);
  
  let apiFormat = 'anthropic';
  if (fmt.trim() === '2') apiFormat = 'openai';
  else if (fmt.trim() === '3') apiFormat = 'gcloud';

  let key = '';
  let url = '';
  let mdl = '';

  if (apiFormat === 'gcloud') {
    const defaultProj = getGCloudProject();
    const proj = await ask(`\n  ${t.primary(`Google Cloud Project ID${defaultProj ? ` [${defaultProj}]` : ''}:`)} `);
    const location = await ask(`  ${t.primary('Google Cloud Region [us-central1]:')} `);
    const token = await ask(`  ${t.primary('Gcloud Access Token (leave blank to auto-use gcloud CLI):')} `);

    if (proj.trim() || defaultProj) config.values.gcloudProject = proj.trim() || defaultProj;
    config.values.gcloudLocation = location.trim() || 'us-central1';
    if (token.trim()) config.values.gcloudAccessToken = token.trim();

    mdl = await ask(`  ${t.primary('Model [gemini-2.5-flash]:')} `);
    mdl = mdl.trim() || 'gemini-2.5-flash';
  } else {
    key = await ask(`\n  ${t.primary('API Key:')} `);
    const defUrl = apiFormat === 'anthropic' ? 'https://api.anthropic.com' : 'https://openrouter.ai/api';
    url = await ask(`  ${t.primary(`Base URL [${defUrl}]:`)} `);

    const defModel = apiFormat === 'anthropic' ? 'claude-sonnet-4-20250514' : 'anthropic/claude-sonnet-4-20250514';
    mdl = await ask(`  ${t.primary(`Model [${defModel}]:`)} `);
    mdl = mdl.trim() || defModel;
    url = url.trim() || defUrl;
  }

  rl.close();

  config.values.apiFormat = apiFormat;
  if (key.trim()) config.values.apiKey = key.trim();
  if (url) config.values.baseUrl = url;
  if (mdl) config.values.model = mdl;
  config.save();
  renderSuccess('Configuration saved!');
}

/* ──────────────────────────────────────────────
   Approval prompt
   ────────────────────────────────────────────── */

const DESTRUCTIVE_CMD = /\b(rm|rmdir|del|rd|format|mkfs|dd)\b|--force|-rf\b/i;
let _pendingApproval = null;

function getApproval(toolName, input) {
  if (config.get('yoloMode')) return Promise.resolve(true);
  if (config.get('autoApprove')) {
    // confirmDangerous: even in auto-approve, destructive actions get a prompt
    const destructive = config.get('confirmDangerous') &&
      (toolName === 'delete_file' ||
       (toolName === 'run_command' && DESTRUCTIVE_CMD.test(input?.command || '')));
    if (!destructive) return Promise.resolve(true);
  }

  return new Promise(resolve => {
    // Create a one-shot readline that shares stdin properly
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    _pendingApproval = { rl: rl2, resolve };
    rl2.question(renderApprovalPrompt(toolName, input), ans => {
      _pendingApproval = null;
      rl2.close();
      const a = ans.trim().toLowerCase();
      if (a === 'a' || a === 'always') {
        config.set('autoApprove', true);
        renderWarning('Auto-approve enabled for this session.');
        resolve(true);
      } else {
        resolve(a === '' || a === 'y' || a === 'yes');
      }
    });
  });
}

/* ──────────────────────────────────────────────
   Stream a single API turn → may produce tool calls
   Returns { text, toolCalls[] }
   ────────────────────────────────────────────── */

async function streamOneTurn(messages, systemPrompt) {
  let fullText = '';
  const toolCalls = [];
  const renderer  = new StreamRenderer();
  let wasTruncated = false;

  let spinnerStopped = false;
  // discardStdin: false — ora's stdin discarder drops raw mode when it stops,
  // which silently kills the '/' keypress interception after the first turn
  const spinner = ora({ text: thinkingText(), spinner: 'dots', color: 'yellow', discardStdin: false }).start();
  function stopSpinner() {
    if (!spinnerStopped) { spinner.stop(); spinnerStopped = true; }
  }

  let assistantHeaderRendered = false;

  try {
    const stream = api.stream(messages, getAllToolDefinitions(), systemPrompt);

    for await (const ev of stream) {
      if (!assistantHeaderRendered && (ev.type === 'text' || ev.type === 'tool_start')) {
        stopSpinner();
        renderTurnHeader('assistant');
        assistantHeaderRendered = true;
      }

      switch (ev.type) {
        case 'text':
          stopSpinner();
          renderer.write(ev.text);
          fullText += ev.text;
          break;

        case 'tool_start':
          stopSpinner();
          break;

        case 'tool_end':
          toolCalls.push({ id: ev.id, name: ev.name, input: ev.input, signature: ev.signature });
          break;

        case 'truncated':
          wasTruncated = true;
          break;

        case 'usage':
          stopSpinner();
          renderer.end();
          if (config.get('showTokenUsage') !== false) renderUsage(ev);
          break;

        case 'done':
          break;
      }
    }
  } catch (err) {
    stopSpinner();
    renderer.end();
    throw err;
  }

  stopSpinner();

  // ── Detect bracket-only / junk output ──
  const trimmed = fullText.trim();
  // Aggressive check for proxy/format errors (e.g. returning only "{}" or "[]")
  const isBracketJunk = /^[\[\]{}(),;\s]*$/.test(trimmed) && trimmed.length > 0 && trimmed.length < 20;

  if (isBracketJunk && toolCalls.length === 0) {
    // Model returned only brackets with no tool calls — likely a proxy/format issue
    renderWarning(`Model returned only: "${trimmed}" — this may indicate an API/proxy issue.`);
    renderWarning('Try: /config → Change apiFormat, model, or baseUrl.');
    fullText = '';  // Don't pollute history with bracket junk
  } else if (isBracketJunk && toolCalls.length > 0) {
    // Tool calls present but text is just brackets — just suppress the text
    fullText = '';
  }

  const debug = config.get('debug');
  if (debug) {
    console.error(`[DEBUG] streamOneTurn result: text=${fullText.length} chars, toolCalls=${toolCalls.length}, truncated=${wasTruncated}`);
    for (const tc of toolCalls) {
      console.error(`[DEBUG]   tool: ${tc.name} id=${tc.id} input=${JSON.stringify(tc.input).slice(0, 100)}`);
    }
    if (fullText && toolCalls.length === 0) {
      console.error(`[DEBUG]   Text preview (first 200): ${fullText.slice(0, 200)}`);
    }
  }

  return { text: fullText, toolCalls, truncated: wasTruncated };
}

/* ──────────────────────────────────────────────
   Full message processing loop (handles tool-call chains)
   ────────────────────────────────────────────── */

/* ──────────────────────────────────────────────
   Aggressive fallback: extract tool calls from raw text
   Handles many patterns used by models/proxies that don't
   use native tool calling:
     1. Full Anthropic JSON response embedded in text
     2. XML-style tags: <tool_use>, <invoke>, <function_call>, <tool_call>
     3. JSON code blocks with tool schemas
     4. Bare JSON objects with {name, input} structure
     5. Anthropic content arrays [{type:"tool_use",...}]
   ────────────────────────────────────────────── */

// Every tool executeTool can actually run — derived from the definitions so the
// fallback extractor never silently drops a valid call (was a hardcoded 6-tool subset).
const KNOWN_TOOLS = new Set(TOOL_DEFINITIONS.map(d => d.name));
function isKnownTool(name) {
  return KNOWN_TOOLS.has(name) || !!mcpManager.isMCPTool(name);
}

function makeId() {
  return 'call_' + Math.random().toString(36).slice(2, 9);
}

/** Sanitize smart/curly quotes that break JSON.parse */
function sanitizeJsonQuotes(str) {
  return str
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')   // "" „ ‟ ″ ‶ → "
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")   // '' ‚ ‛ ′ ‵ → '
    .replace(/[\u2013\u2014]/g, '-')                            // – — → -
    .replace(/\u2026/g, '...');                                  // … → ...
}

/** Try JSON.parse with smart-quote fallback */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    try {
      return JSON.parse(sanitizeJsonQuotes(str));
    } catch {
      return null;
    }
  }
}

function extractToolCallsFromText(text) {
  const found = [];
  if (!text) return found;

  // ── 1) Full Anthropic response JSON ──
  // {"id":"msg_...","content":[...]}  or  {"message":{"content":[...]}}
  for (const pattern of [
    /\{\s*"(?:message|id)"[\s\S]*?"content"\s*:\s*\[[\s\S]*?\]\s*\}/g,
  ]) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        const parsed = safeJsonParse(m);
        if (parsed) {
          const content = parsed.message?.content || parsed.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use' && block.name && isKnownTool(block.name)) {
                found.push({
                  id: block.id || makeId(),
                  name: block.name,
                  input: block.input || {},
                });
              }
            }
          }
        }
      }
    }
  }
  if (found.length) return found;

  // ── 2) XML-style tool tags ──
  // <tool_use>, <invoke>, <function_call>, <tool_call>, <invoke>
  const xmlPatterns = [
    /<tool_use[^>]*>([\s\S]*?)<\/tool_use>/gi,
    /<invoke[^>]*>([\s\S]*?)<\/invoke>/gi,
    /<function_call[^>]*>([\s\S]*?)<\/function_call>/gi,
    /<tool_call[^>]*>([\s\S]*?)<\/tool_call>/gi,
    /<invoke[^>]*>([\s\S]*?)<\/antml:invoke>/gi,
  ];

  for (const pat of xmlPatterns) {
    let m;
    while ((m = pat.exec(text)) !== null) {
      const inner = m[1].trim();
      // Try parsing inner as JSON
      try {
        const p = JSON.parse(inner);
        const name = p.name || p.function || p.tool;
        const input = p.input || p.arguments || p.parameters || p.params || {};
        if (name && isKnownTool(name)) {
          found.push({ id: p.id || makeId(), name, input: typeof input === 'string' ? JSON.parse(input) : input });
        }
      } catch {
        // Try extracting name and parameters from XML attributes or inner XML
        const nameMatch = inner.match(/(?:"name"|name)\s*[:=]\s*"([^"]+)"/);
        const inputMatch = inner.match(/(?:"input"|"arguments"|input|arguments)\s*[:=]\s*(\{[\s\S]*\})/);
        if (nameMatch && isKnownTool(nameMatch[1])) {
          let input = {};
          if (inputMatch) { try { input = JSON.parse(inputMatch[1]); } catch {} }
          found.push({ id: makeId(), name: nameMatch[1], input });
        }
      }
    }
  }
  if (found.length) return found;

  // Also check for XML like <tool_name name="read_file"><parameter name="path">file.js</parameter></tool_name>
  const xmlToolMatch = text.match(/<(\w+)\s+name="(\w+)">([\s\S]*?)<\/\1>/g);
  if (xmlToolMatch) {
    for (const m of xmlToolMatch) {
      const nameMatch = m.match(/name="(\w+)"/);
      if (nameMatch && isKnownTool(nameMatch[1])) {
        const input = {};
        const paramMatches = m.matchAll(/<parameter\s+name="(\w+)">([\s\S]*?)<\/parameter>/g);
        for (const pm of paramMatches) {
          input[pm[1]] = pm[2].trim();
        }
        if (Object.keys(input).length > 0) {
          found.push({ id: makeId(), name: nameMatch[1], input });
        }
      }
    }
  }
  if (found.length) return found;

  // ── 3) JSON inside code blocks ──
  // ```json { "name": "read_file", "input": { "path": "..." } } ```
  const codeBlockPattern = /```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?\s*```/g;
  let cbm;
  while ((cbm = codeBlockPattern.exec(text)) !== null) {
    const blockContent = cbm[1].trim();
    // Could be a single object or an array
    const parsed = safeJsonParse(blockContent);
    if (parsed) {
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const name = item.name || item.function || item.tool;
        const input = item.input || item.arguments || item.parameters || item.params;
        if (name && isKnownTool(name) && input) {
          found.push({ id: item.id || makeId(), name, input: typeof input === 'string' ? safeJsonParse(input) || {} : input });
        }
      }
    }
  }
  if (found.length) return found;

  // ── 4) Robust Object Extraction (Brace-counting parser) ──
  // Replaces finicky regex non-greedy extraction with true text iteration
  const manualRegex = /\{\s*"(?:name|tool|function)"\s*:\s*"(\w+)"/g;
  let objectMatch;
  while ((objectMatch = manualRegex.exec(text)) !== null) {
    const startIndex = objectMatch.index;
    let braceCount = 0;
    let inString = false;
    let escape = false;
    let endIndex = -1;
    
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          if (braceCount === 0) { endIndex = i; break; }
        }
      }
    }
    
    if (endIndex !== -1) {
      const jsonStr = text.substring(startIndex, endIndex + 1);
      const parsed = safeJsonParse(jsonStr);
      if (parsed && (parsed.name || parsed.tool || parsed.function)) {
        const name = parsed.name || parsed.tool || parsed.function;
        const input = parsed.input || parsed.arguments || parsed.parameters || {};
        if (isKnownTool(name)) {
          found.push({ id: parsed.id || makeId(), name, input });
        }
        manualRegex.lastIndex = endIndex + 1;
      }
    } else {
      // Unterminated block!
      const trailing = text.substring(startIndex);
      const attempts = [
        trailing + '}',
        trailing + '"}',
        trailing + '"]}',
        trailing.replace(/[\s\r\n]+$/, '') + '"}',
        trailing.replace(/[\s\r\n]+$/, '') + '}]}'
      ];
      for (const attempt of attempts) {
        const parsed = safeJsonParse(attempt);
        if (parsed) {
          const name = parsed.name || parsed.tool || parsed.function;
          const input = parsed.input || parsed.arguments || parsed.parameters || {};
          if (isKnownTool(name)) {
            found.push({ id: parsed.id || makeId(), name, input });
          }
          break; // successfully repaired!
        }
      }
    }
  }
  if (found.length) return found;

  // ── 5) Anthropic content array in text ──
  // [{"type":"tool_use","name":"read_file","input":{...}}]
  const arrayPattern = /\[\s*\{[\s\S]*?"type"\s*:\s*"tool_use"[\s\S]*?\}\s*\]/g;
  const arrayMatches = text.match(arrayPattern);
  if (arrayMatches) {
    for (const am of arrayMatches) {
      try {
        const parsed = JSON.parse(am);
        for (const block of parsed) {
          if (block.type === 'tool_use' && block.name && isKnownTool(block.name)) {
            found.push({ id: block.id || makeId(), name: block.name, input: block.input || {} });
          }
        }
      } catch {}
    }
  }

  return found;
}

async function processUserMessage(ctx) {
  const ms = config.get('maxTokens') || 4096;
  // Rebuilt each turn so facts saved mid-conversation are visible on the next one
  const systemPrompt = (config.get('systemPrompt') || defaultSystem(ms)) + memorySection();
  let iterations = 0;
  const MAX_ITERATIONS = config.get('maxToolCalls') || Infinity;
  let nudgeCount = 0;            // track how many times we nudged (cap at 3)
  const recentToolCalls = new Map();  // track tool signatures to detect infinite loops

  while (iterations++ < MAX_ITERATIONS) {
    // ── Context size check ──
    // Estimate current context size and compact if needed
    const messages = ctx.history.getMessages();
    const estimatedTokens = JSON.stringify(messages).length / 3.5; // rough char-to-token ratio
    if (estimatedTokens > 80000 && messages.length > 10) {
      // Compact old tool results to prevent context explosion
      _compactOldResults(ctx.history);
      renderWarning(`Context compacted (was ~${Math.round(estimatedTokens/1000)}k tokens) to free space.`);
    }

    let { text, toolCalls, truncated } = await streamOneTurn(ctx.history.getMessages(), systemPrompt);

    // ── Auto-continue on truncation ──
    // If the response was cut off due to max_tokens, automatically ask the model to continue
    if (truncated && !toolCalls.length) {
      renderWarning('Response truncated (hit max_tokens limit). Auto-continuing...');
      if (text) {
        ctx.history.addMessage('assistant', text);
      }
      ctx.history.addMessage('user',
        'Your response was cut off. Continue EXACTLY from where you stopped. ' +
        'Do NOT repeat what you already wrote. Just output the remaining content.'
      );
      continue;
    }

    // Track whether tool calls came from native API or text extraction
    let isNativeToolCalls = toolCalls.length > 0;

    // ── Fallback tool extraction from text ──
    if (toolCalls.length === 0 && text) {
      const extracted = extractToolCallsFromText(text);
      if (extracted.length > 0) {
        toolCalls = extracted;
        isNativeToolCalls = false;
        let cleanText = text;
        cleanText = cleanText.replace(/<(?:tool_use|invoke|function_call|tool_call|antml:invoke)[^>]*>[\s\S]*?<\/(?:tool_use|invoke|function_call|tool_call|antml:invoke)>/gi, '');
        cleanText = cleanText.replace(/```(?:json|javascript|js)?\s*\n?\s*\{[\s\S]*?"(?:name|tool|function)"[\s\S]*?\}\s*\n?\s*```/g, '');
        cleanText = cleanText.replace(/\{\s*"(?:name|tool|function)"\s*:\s*"\w+"[\s\S]*?"(?:input|arguments|parameters)"\s*:[\s\S]*?\}/g, '');
        cleanText = cleanText.replace(/\{\s*"(?:message|id)"[\s\S]*?"content"\s*:\s*\[[\s\S]*?\]\s*\}/g, '');
        cleanText = cleanText.replace(/\[[\s\S]*?"type"\s*:\s*"tool_use"[\s\S]*?\]/g, '');
        cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();
        text = cleanText;
      }
    }

    // ── Filter out bracket-only / junk text before adding to history ──
    const textTrimmed = text.trim();
    const isJunkText = /^[\[\]{}(),;\s]*$/.test(textTrimmed);
    if (isJunkText) text = '';

    // Build assistant content block
    if (isNativeToolCalls) {
      const assistantContent = [];
      if (text) assistantContent.push({ type: 'text', text });
      for (const tc of toolCalls)
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input, signature: tc.signature });
      if (assistantContent.length)
        ctx.history.addMessage('assistant', assistantContent);
    } else {
      if (text) {
        ctx.history.addMessage('assistant', text);
      } else if (toolCalls.length) {
        // Keep user/assistant roles alternating even when the reply was only tool-call JSON
        ctx.history.addMessage('assistant', `(Calling tools: ${toolCalls.map(c => c.name).join(', ')})`);
      }
    }

    // ── Lazy response auto-nudge ──
    // Nudge ONLY when the reply is a first-person promise to act ("I'll read
    // the file", "Let me check X") that stopped without calling tools.
    // Greetings, answers, and offers ("let me know...") must never trigger it,
    // and a reply that ends by asking the user a question is conversation.
    if (!toolCalls.length && text && nudgeCount < 3) {
      const PLAN_RE = /\b(?:let me (?!know\b)\w|i(?:['’])?ll (?:now |first |go |start|begin|read|check|look|take|examine|explore)|i will (?:now |first |go |start|begin|read|check|look|take|examine|explore)|i(?:['’])?m going to |let(?:['’])?s (?:start|begin)|i need to (?:read|check|look|see|explore|examine))/i;
      const looksLikePlan = PLAN_RE.test(text);
      const asksUser = /\?\s*$/.test(text.trim());
      const isShort = text.length < 800;

      if (looksLikePlan && !asksUser && isShort) {
        nudgeCount++;
        renderWarning(`AI described a plan without acting — nudging to use tools (attempt ${nudgeCount}/3)...`);
        ctx.history.addMessage('user',
          api.nativeTools
            ? 'STOP PLANNING. You must use tools RIGHT NOW. Do not describe what you will do — actually call the tools.'
            : 'STOP PLANNING. You must use tools RIGHT NOW. Do not describe what you will do — actually do it.\n\n' +
              'Output one or more tool calls as JSON blocks. For example:\n\n' +
              '```json\n{"name": "write_file", "input": {"path": "src/ui.js", "content": "...file content..."}}\n```\n\n' +
              'Do NOT say "let me" or "I will". Just output the tool call JSON blocks immediately.'
        );
        continue;
      }
    }

    // If no tool calls, we're done
    if (!toolCalls.length) break;

    // ── Deduplicate read-only tool calls to prevent infinite loops ──
    // Skipped calls still get a tool_result: in native mode the API rejects the
    // whole conversation if any tool_use id is left unanswered.
    const READ_TOOLS = new Set(['read_file', 'list_directory', 'search_files']);
    const results = [];
    const runnableCalls = [];
    for (const tc of toolCalls) {
      const sig = tc.name + ':' + JSON.stringify(tc.input);
      const count = (recentToolCalls.get(sig) || 0) + 1;
      recentToolCalls.set(sig, count);
      if (READ_TOOLS.has(tc.name) && count > 10) {
        renderWarning(`Skipping duplicate ${tc.name} call (already read 10 times).`);
        results.push({ toolId: tc.id, name: tc.name, result: {
          error: 'Duplicate call skipped — this exact result is already in the conversation above. Do not repeat it; continue with the task.',
        } });
        continue;
      }
      runnableCalls.push(tc);
    }

    // Execute each tool call
    for (const tc of runnableCalls) {
      renderToolCall(tc.name, tc.input);

      const approved = await getApproval(tc.name, tc.input);
      if (approved) {
        // Start code-write animation for file-writing tools
        let codeAnim = null;
        try {
          if (isCodeWriteTool(tc.name)) {
            const filePath = tc.input?.path || tc.input?.from || '';
            codeAnim = new CodeWriteAnimation(tc.name, filePath);
            codeAnim.start();
          }

          const result = await executeTool(tc.name, tc.input);

          renderToolResult(tc.name, result);
          results.push({ toolId: tc.id, name: tc.name, result });
        } finally {
          if (codeAnim) codeAnim.stop();
        }
      } else {
        renderToolResult(tc.name, { error: 'Rejected by user' }, false);
        results.push({ toolId: tc.id, name: tc.name, result: { error: 'User rejected this tool call' } });
      }
    }

    // ── Send tool results back to the model ──
    if (isNativeToolCalls) {
      // Native mode: structured tool_result blocks
      const structured = results.map(r => {
        // Format content as readable text, not raw JSON
        let contentStr;
        if (r.result.error) {
          contentStr = 'Error: ' + r.result.error;
        } else if (r.result.content && typeof r.result.content === 'string') {
          // File content — truncate if very long
          const lines = r.result.content.split('\n');
          if (lines.length > 80) {
            contentStr = lines.slice(0, 40).join('\n') +
              `\n\n... (${lines.length - 60} lines omitted for brevity) ...\n\n` +
              lines.slice(-20).join('\n');
          } else {
            contentStr = r.result.content;
          }
          if (r.result.lines) contentStr += `\n(${r.result.lines} total lines)`;
        } else if (r.result.message) {
          contentStr = r.result.message;
        } else if (r.result.entries) {
          const listing = r.result.entries
            .slice(0, 40)
            .map(e => `${e.type === 'dir' ? '[DIR]' : '     '} ${e.name}${e.size ? ` (${e.size})` : ''}`)
            .join('\n');
          const extra = r.result.total > 40 ? `\n... and ${r.result.total - 40} more entries` : '';
          contentStr = listing + extra + `\nTotal: ${r.result.total} entries`;
        } else if (r.result.matches) {
          const matchList = r.result.matches.slice(0, 20)
            .map(m => `${m.file}:${m.line}: ${m.content}`).join('\n');
          contentStr = matchList + `\n${r.result.totalMatches} matches${r.result.truncated ? ' (truncated)' : ''}`;
        } else if (r.result.stdout != null) {
          const out = (r.result.stdout || '').split('\n');
          const truncOut = out.length > 40 ? out.slice(0, 40).join('\n') + `\n... (${out.length} lines)` : r.result.stdout;
          contentStr = `Exit code: ${r.result.exit_code}\n${truncOut || '(no output)'}${r.result.stderr ? '\nStderr: ' + r.result.stderr.slice(0, 300) : ''}`;
        } else {
          // Fallback: stringify but keep it brief
          contentStr = JSON.stringify(r.result, null, 2).slice(0, 500);
        }

        return {
          type: 'tool_result',
          tool_use_id: r.toolId,
          content: contentStr,
          ...(r.result.error ? { is_error: true } : {}),
        };
      });
      ctx.history.addMessage('user', structured);
    } else {
      // Fallback mode: plain text results with AGGRESSIVE truncation
      const textParts = results.map(r => {
        const header = `[Result of ${r.name}]`;
        if (r.result.error) return `${header}\nError: ${r.result.error}`;
        if (r.result.message) return `${header}\n${r.result.message}`;
        if (r.result.content) {
          const lines = r.result.content.split('\n');
          if (lines.length > 40) {
            // Only show first 20 and last 10 lines to save context
            const preview = [
              ...lines.slice(0, 20),
              `\n... (${lines.length - 30} lines omitted) ...\n`,
              ...lines.slice(-10),
            ].join('\n');
            return `${header} (${lines.length} lines, showing summary)\n${preview}`;
          }
          return `${header}\n${r.result.content}`;
        }
        if (r.result.entries) {
          const listing = r.result.entries
            .slice(0, 30)
            .map(e => `  ${e.type === 'dir' ? '[DIR]' : '     '} ${e.name}${e.size ? ` (${e.size})` : ''}`)
            .join('\n');
          const extra = r.result.total > 30 ? `\n  ... and ${r.result.total - 30} more entries` : '';
          return `${header}\n${listing}${extra}\nTotal: ${r.result.total} entries`;
        }
        if (r.result.matches) {
          const matchList = r.result.matches.slice(0, 15).map(m => `  ${m.file}:${m.line}: ${m.content}`).join('\n');
          return `${header}\n${matchList}\n${r.result.totalMatches} matches${r.result.truncated ? ' (truncated)' : ''}`;
        }
        if (r.result.stdout != null) {
          const out = (r.result.stdout || '').split('\n');
          const truncOut = out.length > 30 ? out.slice(0, 30).join('\n') + `\n... (${out.length} lines)` : r.result.stdout;
          return `${header}\nExit code: ${r.result.exit_code}\n${truncOut || '(no output)'}${r.result.stderr ? '\nStderr: ' + r.result.stderr.slice(0, 200) : ''}`;
        }
        return `${header}\n${JSON.stringify(r.result).slice(0, 300)}`;
      });

      ctx.history.addMessage('user',
        textParts.join('\n\n') +
        '\n\nContinue with the task. Output tool calls as ```json blocks with {"name": "...", "input": {...}}.'
      );
    }
  }

  if (iterations >= MAX_ITERATIONS)
    renderWarning('Reached maximum tool-call iterations. Stopping.');
}

/** Compact old tool results in history to reduce context size */
function _compactOldResults(history) {
  const msgs = history.getMessages();
  if (msgs.length < 12) return;

  // Keep first 2 and last 10 messages intact, compact everything in between
  for (let i = 2; i < msgs.length - 10; i++) {
    const msg = msgs[i];

    // String content — compact tool results
    if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.includes('[Result of ')) {
      const compacted = msg.content
        .split('\n')
        .filter(line => line.startsWith('[Result of ') || line.startsWith('Total:') || line.startsWith('Error:') || line.trim() === '')
        .join('\n')
        .trim();
      msg.content = compacted + '\n(Full output was provided earlier but compacted to save context.)';
    }

    // Array content — compact tool_result blocks (native mode)
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > 300) {
          block.content = block.content.slice(0, 150) + '\n... (compacted) ...\n' + block.content.slice(-100);
        }
      }
    }

    // String assistant content — truncate long responses
    if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.length > 300) {
      msg.content = msg.content.slice(0, 200) + '... (compacted)';
    }

    // Array assistant content — compact tool_use blocks (native mode)
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      msg.content = msg.content.map(block => {
        if (block.type === 'text' && block.text && block.text.length > 200) {
          return { ...block, text: block.text.slice(0, 150) + '... (compacted)' };
        }
        if (block.type === 'tool_use' && block.input) {
          const compactInput = {};
          for (const [k, v] of Object.entries(block.input)) {
            if (typeof v === 'string' && v.length > 100) {
              compactInput[k] = v.slice(0, 80) + '... (truncated)';
            } else {
              compactInput[k] = v;
            }
          }
          return { ...block, input: compactInput };
        }
        return block;
      });
    }
  }

  // Write compacted messages back (getMessages returns a deep clone now)
  history.messages = msgs;
}

/* ──────────────────────────────────────────────
   Main REPL
   ────────────────────────────────────────────── */

export async function main() {
  config.load();
  applyTheme(config.get('theme'));

  // First-run setup
  if (!config.isConfigured) await setupWizard();

  // Banner + session info
  const history = new ConversationHistory();

  if (config.get('theme') === 'matrix') await matrixRain();
  renderBanner();

  // Connect MCP servers from config
  try {
    const mcpResults = await mcpManager.connectAll();
    for (const r of mcpResults) {
      if (r.status === 'connected') {
        renderSuccess(`MCP: ${r.name} connected (${r.tools} tools)`);
      } else if (r.status === 'error') {
        renderWarning(`MCP: ${r.name} — ${r.error}`);
      }
    }
  } catch (err) {
    renderWarning(`MCP init: ${err.message}`);
  }

  renderSessionInfo({
    model: config.get('model'),
    baseUrl: config.get('baseUrl'),
    format: config.get('apiFormat'),
    cwd: process.cwd(),
    autoApprove: config.get('autoApprove'),
    sessionId: history.sessionId,
  });
  console.log();
  renderTurnHeader('assistant');
  console.log(`  ${chalk.hex('#D97757')('┃')}  ${t.bright('Hello! How can I help you build today?')}`);
  console.log(`  ${chalk.hex('#D97757')('╰─')}${chalk.hex('#C084FC').bold('❯')}\n`);

  const PROMPT_DISPLAY = `${chalk.dim('│')}  ${gradientText('moralta', 'claude')} ${chalk.hex('#818CF8')('❯')} `;

  const rl = readline.createInterface({
    input : process.stdin,
    output: process.stdout,
    prompt: getPromptPrefix(),
  });

  const ctx = { messages: history.messages, api, history };
  const slashMenu = new SlashMenu(rl, PROMPT_DISPLAY);
  const subMenu = new SubMenu(PROMPT_DISPLAY);

  /** Show directory + prompt */
  function showPrompt() {
    // Heal stdin state — spinners and one-shot readlines (approval prompts)
    // can leave raw mode off, so single keypresses would stop being delivered
    if (process.stdin.isTTY && !process.stdin.isRaw) {
      try { process.stdin.setRawMode(true); } catch {}
    }
    renderPromptHeader();
    rl.prompt();
  }

  /* ── Intercept '/' keypress for instant slash menu ── */
  let slashMenuActive = false;

  /** Build config items for the sub-menu */
  function getConfigItems() {
    const configDescriptions = {
      apiKey:               'API authentication key',
      baseUrl:              'API endpoint base URL',
      model:                'AI model identifier',
      apiFormat:            'API format (anthropic / openai)',
      maxTokens:            'Max response tokens',
      temperature:          'Sampling temperature (0-1)',
      autoApprove:          'Auto-approve tool calls',
      systemPrompt:         'Custom system prompt',
      showTokenUsage:       'Show token usage after responses',
      maxConversationTurns: 'Max conversation turns',
      debug:                'Enable debug logging',
      theme:                'UI color theme',
      streamingMarkdown:    'Stream markdown formatting',
      showThinking:         'Show thinking indicator',
      compactMode:          'Compact output mode',
      enableMemory:         'Persistent project memory',
      confirmDangerous:     'Confirm dangerous commands',
      workspaceRoot:        'Project workspace directory',
      editorCommand:        'External editor command',
      diffStyle:            'Diff display style',
      showLineNumbers:      'Show line numbers in output',
      fileReadLimit:        'Max lines to read from files',
      enableSounds:         'Enable sound effects',
    };
    return Object.entries(config.all())
      .filter(([k]) => !['customCommands', 'trustedCommands'].includes(k))
      .map(([k, v]) => ({
        key: k,
        value: v,
        desc: configDescriptions[k] || '',
      }));
  }

  /** Handle config sub-menu: pick key → edit value */
  async function handleConfigSubMenu() {
    while (true) {
      const items = getConfigItems();
      const picked = await subMenu.openPicker(items, 'Configuration');
      if (!picked) break; // Escaped, go back

      // Open editor for the selected key
      const desc = items.find(i => i.key === picked.key)?.desc || '';
      const newValue = await subMenu.openEditor(picked.key, picked.value, desc);
      if (newValue !== null) {
        // Convert types
        let parsedValue = newValue;
        if (newValue === 'true') parsedValue = true;
        else if (newValue === 'false') parsedValue = false;
        else if (newValue === 'null') parsedValue = null;
        else if (!isNaN(Number(newValue)) && newValue.trim() !== '') parsedValue = Number(newValue);

        config.set(picked.key, parsedValue);
        config.save();
        console.log();
        renderSuccess(`Set ${picked.key} = ${JSON.stringify(parsedValue)}`);
      }
      // Loop back to config picker (so user can edit more keys)
    }
  }

  /** Handle model sub-menu */
  async function handleModelSubMenu() {
    const models = [
      { key: 'gemini-3.6-flash',            value: 'Google — flagship Gemini 3.6 fast & smart', desc: 'Next-gen flagship fast Gemini text model' },
      { key: 'gemini-3.5-flash',            value: 'Google — high speed Gemini 3.5', desc: 'High performance low latency Gemini 3.5 model' },
      { key: 'gemini-3.5-flash-lite',       value: 'Google — ultra lightweight Gemini 3.5', desc: 'Super fast lightweight Gemini 3.5 model' },
      { key: 'gemini-2.5-pro',              value: 'Google — flagship Gemini 2.5 reasoning', desc: 'Flagship reasoning & multi-modal model' },
      { key: 'gemini-2.5-flash',            value: 'Google — high performance Gemini 2.5', desc: 'High-speed Gemini 2.5 model' },
      { key: 'gemini-2.0-flash',            value: 'Google — fast & smart general model', desc: 'Fast, highly reliable Gemini 2.0 model' },
      { key: 'claude-3-7-sonnet@20250219',  value: 'Vertex AI — Claude 3.7 Sonnet', desc: 'Anthropic Claude 3.7 on Google Cloud Vertex' },
      { key: 'claude-sonnet-4-20250514',    value: 'Anthropic — flagship coding', desc: 'Best balance of speed and intelligence' },
      { key: 'claude-opus-4-20250514',      value: 'Anthropic — most powerful', desc: 'Most capable model, slower' },
      { key: 'claude-3-5-sonnet-20241022',  value: 'Anthropic — fast & smart', desc: 'Previous gen flagship' },
      { key: 'gpt-4o',                      value: 'OpenAI — flagship', desc: 'OpenAI flagship model' },
      { key: 'deepseek-chat',               value: 'DeepSeek — high value', desc: 'Strong and affordable' },
    ];
    // Highlight current model
    const current = config.get('model');
    for (const m of models) {
      if (m.key === current) m.value = '★ ' + m.value + ' (current)';
    }
    const picked = await subMenu.openPicker(models, 'Select Model');
    if (picked) {
      config.set('model', picked.key);
      config.save();
      console.log();
      renderSuccess(`Model set to ${picked.key}`);
    }
  }

  /** Handle gcloud sub-menu */
  async function handleGCloudSubMenu() {
    const items = [
      { key: 'Status', value: 'Check Google Cloud Auth & Project status', desc: 'Shows project, location, account & token health' },
      { key: 'Use Gcloud Format', value: 'Switch apiFormat to gcloud', desc: 'Activates Google Cloud Vertex AI API engine' },
      { key: 'Select Gemini / Gcloud Model', value: 'Choose text model', desc: 'Pick Gemini 3.6 Flash, 3.5 Flash, 2.5 Pro, Claude on Vertex...' },
      { key: 'Set Project ID', value: getGCloudProject() || '(not set)', desc: 'Configure Google Cloud Project ID' },
      { key: 'Set Region', value: getGCloudLocation(), desc: 'Configure Google Cloud region (default us-central1)' },
      { key: 'Set Access Token', value: config.get('gcloudAccessToken') ? 'Custom token set' : 'Auto via gcloud CLI', desc: 'Set explicit OAuth access token' },
      { key: 'Login Help', value: 'Authentication instructions', desc: 'How to run gcloud auth login' },
    ];
    const picked = await subMenu.openPicker(items, 'Google Cloud');
    if (!picked) return;

    if (picked.key === 'Status') {
      await processCommand('/gcloud status', ctx);
    } else if (picked.key === 'Use Gcloud Format') {
      await processCommand('/gcloud use', ctx);
    } else if (picked.key === 'Select Gemini / Gcloud Model') {
      await handleModelSubMenu();
    } else if (picked.key === 'Set Project ID') {
      const val = await subMenu.openEditor('gcloudProject', getGCloudProject(), 'Google Cloud Project ID');
      if (val !== null) {
        config.set('gcloudProject', val);
        config.save();
        renderSuccess(`Google Cloud Project set to ${val}`);
      }
    } else if (picked.key === 'Set Region') {
      const val = await subMenu.openEditor('gcloudLocation', getGCloudLocation(), 'Google Cloud Region (e.g. us-central1)');
      if (val !== null) {
        config.set('gcloudLocation', val);
        config.save();
        renderSuccess(`Google Cloud Location set to ${val}`);
      }
    } else if (picked.key === 'Set Access Token') {
      const val = await subMenu.openEditor('gcloudAccessToken', config.get('gcloudAccessToken') || '', 'Google Cloud Access Token (ya29...)');
      if (val !== null) {
        config.set('gcloudAccessToken', val);
        config.set('apiFormat', 'gcloud');
        config.save();
        renderSuccess('Google Cloud access token set and apiFormat changed to gcloud.');
      }
    } else if (picked.key === 'Login Help') {
      await processCommand('/gcloud login', ctx);
    }
  }

  /** Handle theme sub-menu */
  async function handleThemeSubMenu() {
    const themes = [
      { key: 'default', value: 'Clean default theme', desc: 'Standard Moralta look' },
      { key: 'cosmic',  value: 'Deep space vibes', desc: 'Dark with purple and blue accents' },
      { key: 'ocean',   value: 'Cool blue depths', desc: 'Blue and teal accents' },
      { key: 'sunset',  value: 'Warm evening glow', desc: 'Orange and pink accents' },
      { key: 'dark',    value: 'Pure dark mode', desc: 'Minimal, high contrast' },
      { key: 'neon',    value: 'Cyberpunk neon', desc: 'Bright neon colors on dark' },
      { key: 'matrix',  value: 'Green code rain', desc: 'Hacker aesthetic' },
    ];
    const current = config.get('theme') || 'default';
    for (const t of themes) {
      if (t.key === current) t.value = '★ ' + t.value + ' (current)';
    }
    const picked = await subMenu.openPicker(themes, 'Select Theme');
    if (picked) {
      config.set('theme', picked.key);
      config.save();
      applyTheme(picked.key);
      if (picked.key === 'matrix') await matrixRain();
      console.log();
      renderSuccess(`Theme set to ${picked.key}.`);
    }
  }

  async function handleSlashMenu() {
    slashMenuActive = true;
    rl.pause();

    try {
      const selected = await slashMenu.open('/');
      if (selected) {
        // Check if this command has a sub-menu
        if (selected === '/config') {
          await handleConfigSubMenu();
        } else if (selected === '/model') {
          await handleModelSubMenu();
        } else if (selected === '/gcloud') {
          await handleGCloudSubMenu();
        } else if (selected === '/theme') {
          await handleThemeSubMenu();
        } else {
          console.log(); // newline after menu
          const result = await processCommand(selected, ctx);
          if (result.handled) {
            if (result.clearMessages) { history.clear(); ctx.messages = history.messages; }
            if (result.compact) {
              if (history.compact()) { ctx.messages = history.messages; renderSuccess('Conversation compacted.'); }
              else renderWarning('Not enough messages to compact.');
            }
          }
        }
      }
    } catch (err) {
      renderError(err.message);
    }

    slashMenuActive = false;
    // Discard whatever leaked into readline's buffer while the menu owned stdin
    rl.line = '';
    if (typeof rl.cursor === 'number') rl.cursor = 0;
    rl.resume();
    showPrompt();
  }

  // Intercept '/' typed on an empty line → open slash menu immediately
  process.stdin.on('keypress', (s, key) => {
    // Ignore any input while slash menu is active or if we are not at the prompt (e.g., AI is streaming or waiting for approval)
    if (slashMenuActive || rl.paused) return;

    // Detect '/' if it's the only character on the line
    if (s === '/' && (rl.line === '' || rl.line === '/')) {
      // Clear the prompt line to make room for the menu
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);

      // Launch the slash menu (async, takes over stdin)
      // rl.pause() inside handleSlashMenu() stops further input processing
      handleSlashMenu();
    }
  });

  showPrompt();

  let multiLineBuf = '';
  let multiLine    = false;

  rl.on('line', async (line) => {
    // Ignore leaked keystrokes while slash menu / config editor is active
    if (slashMenuActive) return;

    // Multi-line continuation
    if (line.endsWith('\\')) {
      multiLineBuf += line.slice(0, -1) + '\n';
      multiLine = true;
      process.stdout.write(`${chalk.hex('#6B7280')('  ...')} `);
      return;
    }

    const input = multiLine ? multiLineBuf + line : line;
    multiLineBuf = '';
    multiLine    = false;

    if (!input.trim()) { showPrompt(); return; }

    // Lone '/' + Enter opens the command menu — guaranteed fallback that works
    // even if raw-keypress interception is unavailable
    if (input.trim() === '/') {
      await handleSlashMenu();
      return;
    }

    // Slash commands (typed fully, e.g. /help, /exit)
    if (input.trim().startsWith('/')) {
      const result = await processCommand(input, ctx);
      if (result.handled) {
        if (result.clearMessages) { history.clear(); ctx.messages = history.messages; }
        if (result.compact) {
          if (history.compact()) { ctx.messages = history.messages; renderSuccess('Conversation compacted.'); }
          else renderWarning('Not enough messages to compact.');
        }
        showPrompt();
        return;
      }
    }

    // Regular user message
    abortSuppressed = false; // Reset abort flag before processing
    rl.pause();
    renderTurnHeader('user');
    renderUserMessage(input);
    history.addMessage('user', input);

    try {
      await processUserMessage(ctx);
    } catch (err) {
      if (!abortSuppressed) renderError(err?.message || String(err || 'Unknown error'));
    }

    // Persist after every turn — exit-only saves lose the session on a crash
    try { history.save(); } catch {}

    console.log(); // breathing room
    rl.resume();
    showPrompt();
  });

  rl.on('close', () => {
    history.save();
    mcpManager.disconnectAll();
    console.log(`\n  ${t.primary('Session saved. Goodbye! 👋')}\n`);
    process.exit(0);
  });

  // Graceful Ctrl+C — first press cancels stream, second press exits
  let lastSigInt = 0;
  let abortSuppressed = false;
  process.on('SIGINT', () => {
    // If a slash menu or sub-menu is active, let it handle cleanup
    if (slashMenuActive) return;

    const now = Date.now();
    if (now - lastSigInt < 2000) {
      // Double Ctrl+C within 2s → exit
      history.save();
      mcpManager.disconnectAll();
      console.log(`\n  ${t.primary('Session saved. Goodbye! 👋')}\n`);
      process.exit(0);
    }
    lastSigInt = now;
    abortSuppressed = true;
    // Cancel a pending approval prompt (its promise would otherwise hang forever)
    if (_pendingApproval) {
      const p = _pendingApproval;
      _pendingApproval = null;
      try { p.rl.close(); } catch {}
      p.resolve(false);
    }
    api.abort();
    console.log();
    console.log(t.dim('  (Press Ctrl+C again to exit, or type /exit)'));
    rl.resume();
    showPrompt();
    // Reset the abort flag after the in-flight catch has time to check it
    setTimeout(() => { abortSuppressed = false; }, 200);
  });
}
