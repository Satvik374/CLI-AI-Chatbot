import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { COMMANDS } from './commands.js';

/* ═══════════════════════════════════════════════════════════════
   SLASH COMMAND MENU — Claude Code-style autocomplete
   ═══════════════════════════════════════════════════════════════
   Shows a floating command picker above the prompt when
   the user types '/'. Supports:
   • Arrow key navigation (↑ / ↓)
   • Filtering as you type
   • Enter to select
   • Escape to dismiss
   • Tab to autocomplete
   ═══════════════════════════════════════════════════════════════ */

const MAX_VISIBLE = 10;  // max items visible at once

const COLORS = {
  border:      '#374151',
  borderActive:'#D97757',
  bg:          '#111827',
  bgSelected:  '#1E1B4B',
  cmd:         '#F4A672',
  cmdSelected: '#FCD34D',
  desc:        '#9CA3AF',
  descSel:     '#E5E7EB',
  highlight:   '#FBBF24',
  arrow:       '#D97757',
  title:       '#D97757',
  badge:       '#A78BFA',
  dim:         '#4B5563',
  scrollbar:   '#D97757',
  scrollTrack: '#1F2937',
};

/**
 * Build the list of commands with metadata
 */
function getCommandList() {
  return Object.entries(COMMANDS).map(([cmd, info]) => ({
    cmd,
    desc: info.desc,
    searchText: (cmd + ' ' + info.desc).toLowerCase(),
  }));
}

/**
 * Filter commands based on the current query
 */
function filterCommands(query) {
  const allCmds = getCommandList();
  if (!query || query === '/') return allCmds;

  const q = query.toLowerCase();
  // Must start with /
  if (!q.startsWith('/')) return [];

  const search = q.slice(1); // strip the /
  return allCmds.filter(c =>
    c.cmd.slice(1).startsWith(search) ||
    c.desc.toLowerCase().includes(search)
  );
}

function visibleLen(s) { return stripAnsi(s).length; }

/**
 * Clip a raw (unstyled) string, keeping the tail — where the cursor is.
 * A line that wraps occupies two terminal rows, which throws off the
 * line-count the redraw relies on, so typed input must never wrap.
 */
function clip(s, max) {
  if (max < 2) return '';
  return s.length <= max ? s : '…' + s.slice(-(max - 1));
}

/**
 * Render the menu to an array of strings (one per line)
 */
function renderMenu(filtered, selectedIndex, query, scrollOffset) {
  const lines = [];
  const w = Math.min(Math.max(process.stdout.columns || 80, 44) - 6, 64);

  // Header
  const titleText = chalk.hex(COLORS.title).bold('⚡ Commands');
  const filterBadge = query.length > 1
    ? '  ' + chalk.bgHex('#1E3A5F').hex('#BFDBFE')(` ${clip(query, 24)} `) + ' '
    : '';
  const countBadge = chalk.hex(COLORS.dim)(`${filtered.length} result${filtered.length !== 1 ? 's' : ''}`);
  const headerInner = ` ${titleText}${filterBadge}`;
  const headerPad = Math.max(1, w - visibleLen(headerInner) - visibleLen(countBadge) - 2);

  lines.push(chalk.hex(COLORS.borderActive)('  ╭') + headerInner + ' '.repeat(headerPad) + countBadge + ' ' + chalk.hex(COLORS.borderActive)('╮'));

  if (filtered.length === 0) {
    const noMatch = chalk.hex(COLORS.dim).italic('  No matching commands');
    const pad = Math.max(1, w - visibleLen(noMatch));
    lines.push(chalk.hex(COLORS.border)('  │') + noMatch + ' '.repeat(pad) + chalk.hex(COLORS.border)('│'));
    lines.push(chalk.hex(COLORS.borderActive)('  ╰') + chalk.hex(COLORS.border)('─'.repeat(w + 1)) + chalk.hex(COLORS.borderActive)('╯'));
    return lines;
  }

  // Determine visible window
  const visibleCount = Math.min(filtered.length, MAX_VISIBLE);
  const start = scrollOffset;
  const end = start + visibleCount;
  const hasScrollUp = start > 0;
  const hasScrollDown = end < filtered.length;

  // Scroll indicator top
  if (hasScrollUp) {
    const upText = chalk.hex(COLORS.dim)('  ↑ more commands above');
    const pad = Math.max(1, w - visibleLen(upText));
    lines.push(chalk.hex(COLORS.border)('  │') + upText + ' '.repeat(pad) + chalk.hex(COLORS.border)('│'));
  }

  // Command rows
  for (let i = start; i < end; i++) {
    const item = filtered[i];
    const isSelected = i === selectedIndex;

    const pointer  = isSelected
      ? chalk.hex(COLORS.arrow).bold(' ❯ ')
      : '   ';
    const cmdText  = isSelected
      ? chalk.hex(COLORS.cmdSelected).bold(item.cmd)
      : chalk.hex(COLORS.cmd)(item.cmd);
    const descText = isSelected
      ? chalk.hex(COLORS.descSel)(item.desc)
      : chalk.hex(COLORS.desc)(item.desc);

    const dot = chalk.hex(COLORS.dim)(' · ');
    const inner = `${pointer}${cmdText}${dot}${descText}`;
    const pad = Math.max(1, w - visibleLen(inner));

    // Selection highlight bar
    const borderChar = isSelected ? chalk.hex(COLORS.borderActive)('│') : chalk.hex(COLORS.border)('│');
    if (isSelected) {
      lines.push(borderChar + chalk.bgHex(COLORS.bgSelected)(' ') + inner + chalk.bgHex(COLORS.bgSelected)(' '.repeat(pad)) + borderChar);
    } else {
      lines.push(chalk.hex(COLORS.border)('  │') + inner + ' '.repeat(pad) + chalk.hex(COLORS.border)('│'));
    }
  }

  // Scroll indicator bottom
  if (hasScrollDown) {
    const downText = chalk.hex(COLORS.dim)(`  ↓ ${filtered.length - end} more below`);
    const pad = Math.max(1, w - visibleLen(downText));
    lines.push(chalk.hex(COLORS.border)('  │') + downText + ' '.repeat(pad) + chalk.hex(COLORS.border)('│'));
  }

  // Footer with hints
  const hints = `${chalk.hex(COLORS.dim)(' ↑↓')} ${chalk.hex(COLORS.desc)('navigate')}  ${chalk.hex(COLORS.dim)('⏎')} ${chalk.hex(COLORS.desc)('select')}  ${chalk.hex(COLORS.dim)('esc')} ${chalk.hex(COLORS.desc)('dismiss')}`;
  const hintPad = Math.max(1, w - visibleLen(hints));
  lines.push(chalk.hex(COLORS.border)('  │') + hints + ' '.repeat(hintPad) + chalk.hex(COLORS.border)('│'));

  // Bottom border
  lines.push(chalk.hex(COLORS.borderActive)('  ╰') + chalk.hex(COLORS.border)('─'.repeat(w + 1)) + chalk.hex(COLORS.borderActive)('╯'));

  return lines;
}

/**
 * SlashMenu — interactive command autocomplete
 *
 * Hooks into raw stdin keypresses and renders a floating
 * menu above the prompt line.
 */
export class SlashMenu {
  constructor(rl, promptStr) {
    this.rl = rl;
    this.promptStr = promptStr;
    this.active = false;
    this.query = '';
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.filtered = [];
    this.lastRenderedLines = 0;
    this._onKeypress = null;
  }

  /**
   * Attach keypress listener to stdin.
   * Returns a promise that resolves with the selected command
   * string, or null if dismissed.
   */
  open(initialQuery = '/') {
    this.active = true;
    this.query = initialQuery;
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.filtered = filterCommands(this.query);
    this.lastRenderedLines = 0;

    return new Promise((resolve) => {
      // We need raw mode for keypress detection
      const wasRawMode = process.stdin.isRaw;
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      this._draw();

      this._onKeypress = (chunk) => {
        if (!this.active) return;

        const key = chunk.toString();
        const hex = Buffer.from(key).toString('hex');

        // Arrow Up: ESC [ A
        if (hex === '1b5b41') {
          this.selectedIndex = Math.max(0, this.selectedIndex - 1);
          this._adjustScroll();
          this._draw();
          return;
        }

        // Arrow Down: ESC [ B
        if (hex === '1b5b42') {
          this.selectedIndex = Math.min(this.filtered.length - 1, this.selectedIndex + 1);
          this._adjustScroll();
          this._draw();
          return;
        }

        // Home / Ctrl+A — jump to top
        if (hex === '1b5b48' || key === '\x01') {
          this.selectedIndex = 0;
          this._adjustScroll();
          this._draw();
          return;
        }

        // End / Ctrl+E — jump to bottom
        if (hex === '1b5b46' || key === '\x05') {
          this.selectedIndex = Math.max(0, this.filtered.length - 1);
          this._adjustScroll();
          this._draw();
          return;
        }

        // Page Up
        if (hex === '1b5b357e') {
          this.selectedIndex = Math.max(0, this.selectedIndex - MAX_VISIBLE);
          this._adjustScroll();
          this._draw();
          return;
        }

        // Page Down
        if (hex === '1b5b367e') {
          this.selectedIndex = Math.min(this.filtered.length - 1, this.selectedIndex + MAX_VISIBLE);
          this._adjustScroll();
          this._draw();
          return;
        }

        // Any other escape sequence (ignore gracefully)
        if (hex.startsWith('1b5b') || hex.startsWith('1b4f')) {
          return;
        }

        // Standalone Escape (just 0x1B)
        if (key === '\x1B' && hex === '1b') {
          this._dismiss();
          cleanup(null);
          return;
        }

        // Enter / Return
        if (key === '\r' || key === '\n') {
          const selected = this.filtered[this.selectedIndex];
          this._dismiss();
          cleanup(selected ? selected.cmd : null);
          return;
        }

        // Tab — autocomplete to selection
        if (key === '\t') {
          const selected = this.filtered[this.selectedIndex];
          if (selected) {
            this.query = selected.cmd;
            this.filtered = filterCommands(this.query);
            this.selectedIndex = 0;
            this.scrollOffset = 0;
            this._draw();
          }
          return;
        }

        // Backspace (0x7F on most terminals, 0x08 on some)
        if (key === '\x7F' || key === '\b' || hex === '08') {
          if (this.query.length <= 1) {
            // Backspace past the '/' dismisses the menu
            this._dismiss();
            cleanup(null);
            return;
          }
          this.query = this.query.slice(0, -1);
          this.filtered = filterCommands(this.query);
          this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
          this.scrollOffset = 0;
          this._adjustScroll();
          this._draw();
          return;
        }

        // Ctrl+C
        if (key === '\x03') {
          this._dismiss();
          cleanup(null);
          return;
        }

        // Regular character or pasted text (multi-character)
        {
          let printable = key
            .replace(/\x1B\[200~/g, '').replace(/\x1B\[201~/g, '')
            .replace(/[\r\n]/g, '');
          let filtered = '';
          for (const ch of printable) {
            if (ch >= ' ' && ch <= '~') filtered += ch;
          }
          if (filtered.length > 0) {
            this.query += filtered;
            this.filtered = filterCommands(this.query);
            this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
            this.scrollOffset = 0;
            this._adjustScroll();
            this._draw();
            return;
          }
        }
      };

      process.stdin.on('data', this._onKeypress);

      const cleanup = (result) => {
        this.active = false;
        if (this._onKeypress) {
          process.stdin.removeListener('data', this._onKeypress);
          this._onKeypress = null;
        }
        // Restore raw mode synchronously — no drain hack needed
        if (process.stdin.setRawMode) {
          try { process.stdin.setRawMode(!!wasRawMode); } catch {}
        }
        // Pause stdin to prevent buffered keystrokes leaking
        process.stdin.pause();
        resolve(result);
      };
    });
  }

  _adjustScroll() {
    // Ensure selectedIndex is visible
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
    const visibleCount = Math.min(this.filtered.length, MAX_VISIBLE);
    if (this.selectedIndex >= this.scrollOffset + visibleCount) {
      this.scrollOffset = this.selectedIndex - visibleCount + 1;
    }
  }

  _draw() {
    // First, clear previous render
    this._clearPrevious();

    const menuLines = renderMenu(this.filtered, this.selectedIndex, this.query, this.scrollOffset);

    // Build the input line to show below the menu (clipped so it can't wrap)
    const room = (process.stdout.columns || 80) - visibleLen(this.promptStr) - 5;
    const inputLine = `  ${this.promptStr}${chalk.hex('#F9FAFB')(clip(this.query, room))}${chalk.hex('#D97757').bold('▎')}`;

    // Move cursor up if we already rendered, draw the menu, then the prompt
    // We render: menu lines + input line
    const output = [...menuLines, inputLine].join('\n');
    process.stdout.write(output);

    this.lastRenderedLines = menuLines.length + 1; // +1 for input line
  }

  _clearPrevious() { clearRendered(this); }

  _dismiss() {
    this._clearPrevious();
  }
}

/**
 * Erase a previous menu render.
 * The cursor sits at the END of the last rendered line (output is joined with
 * '\n' and has no trailing newline), so we move up count-1 lines to reach the
 * first one. Moving up `count` overshoots and eats the line above the menu on
 * every redraw — which chewed through the banner as you typed.
 */
function clearRendered(menu) {
  const n = menu.lastRenderedLines;
  if (n > 0) {
    process.stdout.write(n > 1 ? `\x1B[${n - 1}F` : '\r');
    process.stdout.write('\x1B[0J'); // clear from cursor to end of screen
  }
  menu.lastRenderedLines = 0;
}

/**
 * Check if a line looks like the start of a slash command
 */
export function shouldOpenSlashMenu(line) {
  return line === '/';
}

/* ═══════════════════════════════════════════════════════════════
   CONFIG KEY DESCRIPTIONS — human-friendly labels
   ═══════════════════════════════════════════════════════════════ */

const CONFIG_DESCRIPTIONS = {
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
  customCommands:       'User-defined slash commands',
  trustedCommands:      'Auto-approved shell commands',
};

/** Commands that should open a sub-menu instead of running directly */
export const COMMANDS_WITH_SUBMENU = new Set(['/config', '/model', '/theme']);

/* ═══════════════════════════════════════════════════════════════
   SUB-MENU — generic key-value picker for config, model, theme
   ═══════════════════════════════════════════════════════════════ */

/**
 * Render a generic sub-menu with key-value items
 */
function renderSubMenu(items, selectedIndex, title, scrollOffset, filterQuery) {
  const lines = [];
  const w = Math.min(Math.max(process.stdout.columns || 80, 44) - 6, 72);

  // Header
  const titleText = chalk.hex(COLORS.title).bold(`⚙ ${title}`);
  const filterBadge = filterQuery
    ? '  ' + chalk.bgHex('#1E3A5F').hex('#BFDBFE')(` ${clip(filterQuery, 24)} `) + ' '
    : '';
  const countBadge = chalk.hex(COLORS.dim)(`${items.length} option${items.length !== 1 ? 's' : ''}`);
  const headerInner = ` ${titleText}${filterBadge}`;
  const headerPad = Math.max(1, w - visibleLen(headerInner) - visibleLen(countBadge) - 2);

  lines.push(chalk.hex(COLORS.borderActive)('  ╭') + headerInner + ' '.repeat(headerPad) + countBadge + ' ' + chalk.hex(COLORS.borderActive)('╮'));

  if (items.length === 0) {
    const noMatch = chalk.hex(COLORS.dim).italic('  No matching options');
    const pad = Math.max(1, w - visibleLen(noMatch));
    lines.push(chalk.hex(COLORS.border)('  │') + noMatch + ' '.repeat(pad) + chalk.hex(COLORS.border)('│'));
    lines.push(chalk.hex(COLORS.borderActive)('  ╰') + chalk.hex(COLORS.border)('─'.repeat(w + 1)) + chalk.hex(COLORS.borderActive)('╯'));
    return lines;
  }

  const visibleCount = Math.min(items.length, MAX_VISIBLE);
  const start = scrollOffset;
  const end = start + visibleCount;
  const hasScrollUp = start > 0;
  const hasScrollDown = end < items.length;

  if (hasScrollUp) {
    const upText = chalk.hex(COLORS.dim)('  ↑ more options above');
    const pad = Math.max(1, w - visibleLen(upText));
    lines.push(chalk.hex(COLORS.border)('  │') + upText + ' '.repeat(pad) + chalk.hex(COLORS.border)('│'));
  }

  // Compute key column width
  const keyW = Math.min(22, Math.max(...items.map(i => i.key.length)) + 1);

  for (let i = start; i < end; i++) {
    const item = items[i];
    const isSelected = i === selectedIndex;

    const pointer = isSelected
      ? chalk.hex(COLORS.arrow).bold(' ❯ ')
      : '   ';

    const keyText = isSelected
      ? chalk.hex(COLORS.cmdSelected).bold(item.key.padEnd(keyW))
      : chalk.hex(COLORS.cmd)(item.key.padEnd(keyW));

    // Format value based on type
    let valDisplay = String(item.value);
    if (valDisplay.length > w - keyW - 12) valDisplay = valDisplay.slice(0, w - keyW - 15) + '…';
    if (item.key === 'apiKey' && valDisplay.length > 12) {
      valDisplay = valDisplay.slice(0, 8) + '••••' + valDisplay.slice(-4);
    }

    const valText = isSelected
      ? chalk.hex('#FBBF24')(valDisplay)
      : chalk.hex(COLORS.desc)(valDisplay);

    const dot = chalk.hex(COLORS.dim)(' = ');
    const inner = `${pointer}${keyText}${dot}${valText}`;
    const pad = Math.max(1, w - visibleLen(inner));

    const borderChar = isSelected ? chalk.hex(COLORS.borderActive)('│') : chalk.hex(COLORS.border)('│');
    if (isSelected) {
      lines.push(borderChar + chalk.bgHex(COLORS.bgSelected)(' ') + inner + chalk.bgHex(COLORS.bgSelected)(' '.repeat(pad)) + borderChar);
    } else {
      lines.push(chalk.hex(COLORS.border)('  │') + inner + ' '.repeat(pad) + chalk.hex(COLORS.border)('│'));
    }
  }

  if (hasScrollDown) {
    const downText = chalk.hex(COLORS.dim)(`  ↓ ${items.length - end} more below`);
    const pad = Math.max(1, w - visibleLen(downText));
    lines.push(chalk.hex(COLORS.border)('  │') + downText + ' '.repeat(pad) + chalk.hex(COLORS.border)('│'));
  }

  // Description of selected item
  const sel = items[selectedIndex];
  if (sel && sel.desc) {
    const descLine = `  ${chalk.hex('#7DD3FC').italic(sel.desc)}`;
    const descPad = Math.max(1, w - visibleLen(descLine));
    lines.push(chalk.hex(COLORS.border)('  │') + descLine + ' '.repeat(descPad) + chalk.hex(COLORS.border)('│'));
  }

  // Footer hints
  const hints = `${chalk.hex(COLORS.dim)(' ↑↓')} ${chalk.hex(COLORS.desc)('navigate')}  ${chalk.hex(COLORS.dim)('⏎')} ${chalk.hex(COLORS.desc)('edit')}  ${chalk.hex(COLORS.dim)('esc')} ${chalk.hex(COLORS.desc)('back')}`;
  const hintPad = Math.max(1, w - visibleLen(hints));
  lines.push(chalk.hex(COLORS.border)('  │') + hints + ' '.repeat(hintPad) + chalk.hex(COLORS.border)('│'));

  lines.push(chalk.hex(COLORS.borderActive)('  ╰') + chalk.hex(COLORS.border)('─'.repeat(w + 1)) + chalk.hex(COLORS.borderActive)('╯'));

  return lines;
}

/**
 * Render an inline value editor
 */
function renderValueEditor(key, value, cursorPos, desc) {
  const lines = [];
  const w = Math.min(Math.max(process.stdout.columns || 80, 44) - 6, 72);

  const titleText = chalk.hex(COLORS.title).bold(`✏  Edit: ${key}`);
  lines.push(chalk.hex('#FBBF24')('  ╭') + ` ${titleText} ` + chalk.hex('#FBBF24')('─'.repeat(Math.max(1, w - visibleLen(titleText) - 4))) + chalk.hex('#FBBF24')('╮'));

  if (desc) {
    const descLine = `  ${chalk.hex('#7DD3FC').italic(desc)}`;
    const descPad = Math.max(1, w - visibleLen(descLine));
    lines.push(chalk.hex(COLORS.border)('  │') + descLine + ' '.repeat(descPad) + chalk.hex(COLORS.border)('│'));
  }

  // Value input field with cursor
  const before = value.slice(0, cursorPos);
  const cursor = cursorPos < value.length ? value[cursorPos] : ' ';
  const after = cursorPos < value.length ? value.slice(cursorPos + 1) : '';

  const valLine = `  ${chalk.hex('#F9FAFB')(before)}${chalk.bgHex('#D97757').hex('#FFFFFF').bold(cursor)}${chalk.hex('#F9FAFB')(after)}`;
  const valPad = Math.max(1, w - visibleLen(valLine));
  lines.push(chalk.hex(COLORS.border)('  │') + valLine + ' '.repeat(valPad) + chalk.hex(COLORS.border)('│'));

  // Type hint
  const typeHint = typeof value === 'string' ? 'text' : typeof value;
  const hintLine = `  ${chalk.hex(COLORS.dim)(`type: ${typeHint}`)}`;
  const hintPad = Math.max(1, w - visibleLen(hintLine));
  lines.push(chalk.hex(COLORS.border)('  │') + hintLine + ' '.repeat(hintPad) + chalk.hex(COLORS.border)('│'));

  // Footer
  const hints = `${chalk.hex(COLORS.dim)(' ⏎')} ${chalk.hex(COLORS.desc)('save')}  ${chalk.hex(COLORS.dim)('esc')} ${chalk.hex(COLORS.desc)('cancel')}`;
  const footPad = Math.max(1, w - visibleLen(hints));
  lines.push(chalk.hex(COLORS.border)('  │') + hints + ' '.repeat(footPad) + chalk.hex(COLORS.border)('│'));

  lines.push(chalk.hex('#FBBF24')('  ╰') + chalk.hex(COLORS.border)('─'.repeat(w + 1)) + chalk.hex('#FBBF24')('╯'));

  return lines;
}

/* ═══════════════════════════════════════════════════════════════
   SubMenu — interactive config/option picker
   ═══════════════════════════════════════════════════════════════ */

export class SubMenu {
  constructor(promptStr) {
    this.promptStr = promptStr;
    this.active = false;
    this.lastRenderedLines = 0;
  }

  /**
   * Open a sub-menu that shows key-value items.
   * Returns { key, value, action } or null if dismissed.
   * action: 'select' | 'edit' | 'back'
   */
  openPicker(items, title = 'Options') {
    this.active = true;
    let selectedIndex = 0;
    let scrollOffset = 0;
    let filterQuery = '';
    let filteredItems = items;
    this.lastRenderedLines = 0;

    return new Promise((resolve) => {
      const wasRawMode = process.stdin.isRaw;
      if (process.stdin.setRawMode) process.stdin.setRawMode(true);
      process.stdin.resume();

      const draw = () => {
        this._clearPrevious();
        const menuLines = renderSubMenu(filteredItems, selectedIndex, title, scrollOffset, filterQuery);
        const output = menuLines.join('\n');
        process.stdout.write(output);
        this.lastRenderedLines = menuLines.length;
      };

      draw();

      const adjustScroll = () => {
        if (selectedIndex < scrollOffset) scrollOffset = selectedIndex;
        const vis = Math.min(filteredItems.length, MAX_VISIBLE);
        if (selectedIndex >= scrollOffset + vis) scrollOffset = selectedIndex - vis + 1;
      };

      const applyFilter = () => {
        if (!filterQuery) {
          filteredItems = items;
        } else {
          const q = filterQuery.toLowerCase();
          filteredItems = items.filter(i =>
            i.key.toLowerCase().includes(q) ||
            (i.desc || '').toLowerCase().includes(q)
          );
        }
        selectedIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 1));
        scrollOffset = 0;
        adjustScroll();
      };

      const onData = (chunk) => {
        if (!this.active) return;
        const key = chunk.toString();
        const hex = Buffer.from(key).toString('hex');

        // Arrow keys
        if (hex === '1b5b41') { selectedIndex = Math.max(0, selectedIndex - 1); adjustScroll(); draw(); return; }
        if (hex === '1b5b42') { selectedIndex = Math.min(filteredItems.length - 1, selectedIndex + 1); adjustScroll(); draw(); return; }
        if (hex === '1b5b48' || key === '\x01') { selectedIndex = 0; adjustScroll(); draw(); return; }
        if (hex === '1b5b46' || key === '\x05') { selectedIndex = Math.max(0, filteredItems.length - 1); adjustScroll(); draw(); return; }
        if (hex === '1b5b357e') { selectedIndex = Math.max(0, selectedIndex - MAX_VISIBLE); adjustScroll(); draw(); return; }
        if (hex === '1b5b367e') { selectedIndex = Math.min(filteredItems.length - 1, selectedIndex + MAX_VISIBLE); adjustScroll(); draw(); return; }
        if (hex.startsWith('1b5b') || hex.startsWith('1b4f')) return;

        // Escape
        if (key === '\x1B' && hex === '1b') { cleanup(null); return; }

        // Enter
        if (key === '\r' || key === '\n') {
          const sel = filteredItems[selectedIndex];
          cleanup(sel ? { key: sel.key, value: sel.value, action: 'select' } : null);
          return;
        }

        // Backspace
        if (key === '\x7F' || key === '\b' || hex === '08') {
          if (filterQuery.length > 0) {
            filterQuery = filterQuery.slice(0, -1);
            applyFilter();
            draw();
          }
          return;
        }

        // Ctrl+C
        if (key === '\x03') { cleanup(null); return; }

        // Regular character or pasted text → filter
        {
          let printable = key
            .replace(/\x1B\[200~/g, '').replace(/\x1B\[201~/g, '')
            .replace(/[\r\n]/g, '');
          let chars = '';
          for (const ch of printable) {
            if (ch >= ' ' && ch <= '~') chars += ch;
          }
          if (chars.length > 0) {
            filterQuery += chars;
            applyFilter();
            draw();
            return;
          }
        }
      };

      process.stdin.on('data', onData);

      const cleanup = (result) => {
        this.active = false;
        process.stdin.removeListener('data', onData);
        // Restore raw mode synchronously
        if (process.stdin.setRawMode) {
          try { process.stdin.setRawMode(!!wasRawMode); } catch {}
        }
        process.stdin.pause();
        this._clearPrevious();
        resolve(result);
      };
    });
  }

  /**
   * Open an inline value editor for a single config key.
   * Returns the new value string, or null if cancelled.
   */
  openEditor(key, currentValue, desc) {
    this.active = true;
    let value = String(currentValue ?? '');
    let cursorPos = value.length;
    this.lastRenderedLines = 0;

    return new Promise((resolve) => {
      const wasRawMode = process.stdin.isRaw;
      if (process.stdin.setRawMode) process.stdin.setRawMode(true);
      process.stdin.resume();

      const draw = () => {
        this._clearPrevious();
        const editorLines = renderValueEditor(key, value, cursorPos, desc);
        process.stdout.write(editorLines.join('\n'));
        this.lastRenderedLines = editorLines.length;
      };

      draw();

      const onData = (chunk) => {
        if (!this.active) return;
        const k = chunk.toString();
        const hex = Buffer.from(k).toString('hex');

        // Arrow Left
        if (hex === '1b5b44') { cursorPos = Math.max(0, cursorPos - 1); draw(); return; }
        // Arrow Right
        if (hex === '1b5b43') { cursorPos = Math.min(value.length, cursorPos + 1); draw(); return; }
        // Home
        if (hex === '1b5b48' || k === '\x01') { cursorPos = 0; draw(); return; }
        // End
        if (hex === '1b5b46' || k === '\x05') { cursorPos = value.length; draw(); return; }
        // Other escape sequences
        if (hex.startsWith('1b5b') || hex.startsWith('1b4f')) return;

        // Escape → cancel
        if (k === '\x1B' && hex === '1b') { cleanup(null); return; }

        // Enter → save
        if (k === '\r' || k === '\n') { cleanup(value); return; }

        // Backspace
        if (k === '\x7F' || k === '\b' || hex === '08') {
          if (cursorPos > 0) {
            value = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
            cursorPos--;
          }
          draw();
          return;
        }

        // Delete key
        if (hex === '1b5b337e') {
          if (cursorPos < value.length) {
            value = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
          }
          draw();
          return;
        }

        // Ctrl+C → cancel
        if (k === '\x03') { cleanup(null); return; }

        // Ctrl+U → clear line
        if (k === '\x15') { value = ''; cursorPos = 0; draw(); return; }

        // Regular character OR pasted text (multi-character)
        // Strip bracketed paste escape sequences if present
        let printable = k
          .replace(/\x1B\[200~/g, '')  // bracketed paste start
          .replace(/\x1B\[201~/g, '')  // bracketed paste end
          .replace(/\r\n/g, '')        // strip CR/LF from paste
          .replace(/\r/g, '')
          .replace(/\n/g, '');

        // Filter to only printable chars
        let filtered = '';
        for (const ch of printable) {
          if (ch >= ' ' && ch <= '~') filtered += ch;
        }

        if (filtered.length > 0) {
          value = value.slice(0, cursorPos) + filtered + value.slice(cursorPos);
          cursorPos += filtered.length;
          draw();
          return;
        }
      };

      process.stdin.on('data', onData);

      const cleanup = (result) => {
        this.active = false;
        process.stdin.removeListener('data', onData);
        // Drain any buffered input (e.g. lingering Enter key) before restoring mode
        const drain = (chunk) => { /* discard */ };
        process.stdin.on('data', drain);
        setTimeout(() => {
          process.stdin.removeListener('data', drain);
          if (process.stdin.setRawMode) process.stdin.setRawMode(!!wasRawMode);
          this._clearPrevious();
          resolve(result);
        }, 20);
      };
    });
  }

  _clearPrevious() { clearRendered(this); }
}
