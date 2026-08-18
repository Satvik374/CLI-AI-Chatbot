import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import boxen from 'boxen';
import figures from 'figures';
import Table from 'cli-table3';
import { highlight } from 'cli-highlight';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/* ═══════════════════════════════════════════════════════════════
   ENHANCED COLOR SYSTEM — Claude Code inspired theme
   ═══════════════════════════════════════════════════════════════ */

const PALETTES = {
  cool:       ['#C084FC','#A78BFA','#818CF8','#6366F1','#4F46E5','#3B82F6','#0EA5E9','#06B6D4','#14B8A6'],
  blueTeal:   ['#60A5FA','#3B82F6','#0EA5E9','#06B6D4','#14B8A6','#10B981'],
  purpleBlue: ['#E879F9','#C084FC','#A78BFA','#818CF8','#6366F1','#4F46E5','#3B82F6'],
  neon:       ['#A78BFA','#C084FC','#E879F9','#F472B6','#FB7185'],
  fire:       ['#FEF08A','#FDE047','#FACC15','#F59E0B','#F97316','#EF4444'],
  warm:       ['#FDE68A','#FBBF24','#F59E0B','#EF4444','#EC4899','#D946EF','#A855F7'],
  mint:       ['#6EE7B7','#34D399','#10B981','#059669'],
  sunset:     ['#FCA5A5','#F87171','#EF4444','#DC2626','#B91C1C'],
  ocean:      ['#7DD3FC','#38BDF8','#0EA5E9','#0284C7','#0369A1'],
  aurora:     ['#22D3EE','#34D399','#A3E635','#FACC15','#FB7185','#E879F9'],
  claude:     ['#F4A672','#E8895A','#D97757','#C9663F','#B85535','#A04428'],
  ember:      ['#FFD27D','#FFA76A','#FF7E5F','#E85D52','#C94B4B'],
  galaxy:     ['#312E81','#4338CA','#6D28D9','#A21CAF','#BE185D','#9F1239'],
  amber:      ['#FCD34D','#FB923C','#F97316','#EA580C'],
  indigo:     ['#818CF8','#6366F1','#4F46E5','#4338CA'],
};

export const t = {
  // Brand
  primary   : chalk.hex('#D97757'),   // Claude orange
  secondary : chalk.hex('#A78BFA'),
  accent    : chalk.hex('#06B6D4'),

  // Semantic
  success   : chalk.hex('#10B981'),
  warning   : chalk.hex('#F59E0B'),
  error     : chalk.hex('#EF4444'),
  info      : chalk.hex('#3B82F6'),

  // Text
  text      : chalk.hex('#E5E7EB'),
  muted     : chalk.hex('#6B7280'),
  dim       : chalk.hex('#4B5563'),
  subtle    : chalk.hex('#9CA3AF'),
  bright    : chalk.hex('#F9FAFB'),

  // Tools
  tool      : chalk.hex('#A78BFA'),
  toolName  : chalk.hex('#C084FC').bold,
  param     : chalk.hex('#7DD3FC'),
  paramVal  : chalk.hex('#FCD34D'),

  // Code
  codeBg    : chalk.bgHex('#1F2937'),
  codeText  : chalk.hex('#E5E7EB'),
  codeKw    : chalk.hex('#C084FC'),
  codeStr   : chalk.hex('#86EFAC'),
  codeNum   : chalk.hex('#FCD34D'),
  codeCmt   : chalk.hex('#6B7280').italic,

  // Diff
  diffAdd   : chalk.hex('#10B981'),
  diffDel   : chalk.hex('#EF4444'),
  diffCtx   : chalk.hex('#6B7280'),

  // UI chrome
  border    : chalk.hex('#374151'),
  borderHi  : chalk.hex('#D97757'),
  user      : chalk.hex('#60A5FA').bold,
  assistant : chalk.hex('#D97757').bold,

  // Utility
  bold      : chalk.bold,
  highlight : chalk.hex('#FBBF24'),
  faint     : chalk.hex('#374151'),
  code      : chalk.hex('#E5E7EB'),

  // Badges
  userBadge : (s) => chalk.bgHex('#1E3A5F').hex('#BFDBFE').bold(` ${s} `),
  aiBadge   : (s) => chalk.bgHex('#3B1F0B').hex('#FED7AA').bold(` ${s} `),
  okBadge   : (s) => chalk.bgHex('#064E3B').hex('#A7F3D0').bold(` ${s} `),
  warnBadge : (s) => chalk.bgHex('#78350F').hex('#FDE68A').bold(` ${s} `),
  errBadge  : (s) => chalk.bgHex('#7F1D1D').hex('#FECACA').bold(` ${s} `),
  infoBadge : (s) => chalk.bgHex('#1E3A8A').hex('#BFDBFE').bold(` ${s} `),
};

const THEME_PRESETS = {
  cosmic: {
    primary: '#D97757', secondary: '#A78BFA', accent: '#06B6D4',
    border: '#374151', borderHi: '#D97757', palette: 'claude',
    userBg: '#1E3A5F', aiBg: '#3B1F0B', bg: '#16121F',
  },
  ocean: {
    primary: '#0EA5E9', secondary: '#14B8A6', accent: '#67E8F9',
    border: '#164E63', borderHi: '#06B6D4', palette: 'blueTeal',
    userBg: '#0C4A6E', aiBg: '#064E3B', bg: '#04121C',
  },
  sunset: {
    primary: '#F97316', secondary: '#EC4899', accent: '#FCD34D',
    border: '#7C2D12', borderHi: '#FB923C', palette: 'warm',
    userBg: '#7C2D12', aiBg: '#701A75', bg: '#190C08',
  },
  matrix: {
    primary: '#22C55E', secondary: '#84CC16', accent: '#34D399',
    border: '#14532D', borderHi: '#22C55E', palette: 'mint',
    userBg: '#052E16', aiBg: '#064E3B', bg: '#021208',
  },
  neon: {
    primary: '#E879F9', secondary: '#22D3EE', accent: '#F472B6',
    border: '#4C1D95', borderHi: '#E879F9', palette: 'neon',
    userBg: '#312E81', aiBg: '#831843', bg: '#140420',
  },
  dark: {
    primary: '#E5E7EB', secondary: '#9CA3AF', accent: '#60A5FA',
    border: '#374151', borderHi: '#9CA3AF', palette: 'indigo',
    userBg: '#111827', aiBg: '#1F2937', bg: '#0B0E12',
  },
  default: {
    primary: '#D97757', secondary: '#A78BFA', accent: '#06B6D4',
    border: '#374151', borderHi: '#D97757', palette: 'claude',
    userBg: '#1E3A5F', aiBg: '#3B1F0B', bg: '#16121F',
  },
};

let activeTheme = { name: 'cosmic', ...THEME_PRESETS.cosmic };

/* ── Terminal background — OSC 11 sets it, OSC 111 restores the user's own ── */
let _bgApplied = false;
function setTerminalBg(hex) {
  if (!hex || !process.stdout.isTTY) return; // don't spray escapes into pipes
  process.stdout.write(`\x1b]11;${hex}\x07`);
  if (!_bgApplied) {
    _bgApplied = true;
    // covers every exit path, including process.exit()
    process.on('exit', () => { try { process.stdout.write('\x1b]111\x07'); } catch {} });
  }
}

export function applyTheme(name = 'cosmic') {
  const next = THEME_PRESETS[name] || THEME_PRESETS.cosmic;
  activeTheme = { name: THEME_PRESETS[name] ? name : 'cosmic', ...next };
  setTerminalBg(activeTheme.bg);

  t.primary = chalk.hex(activeTheme.primary);
  t.secondary = chalk.hex(activeTheme.secondary);
  t.accent = chalk.hex(activeTheme.accent);
  t.border = chalk.hex(activeTheme.border);
  t.borderHi = chalk.hex(activeTheme.borderHi);
  t.user = chalk.hex(activeTheme.accent).bold;
  t.assistant = chalk.hex(activeTheme.primary).bold;
  t.userBadge = (s) => chalk.bgHex(activeTheme.userBg).hex('#BFDBFE').bold(` ${s} `);
  t.aiBadge = (s) => chalk.bgHex(activeTheme.aiBg).hex('#FED7AA').bold(` ${s} `);
  return activeTheme;
}

/* ───────────────────── Gradient utilities ───────────────────── */

function hexToRgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex([r,g,b]) {
  const s = n => n.toString(16).padStart(2,'0');
  return '#' + s(r) + s(g) + s(b);
}
function lerpColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([
    Math.round(A[0] + (B[0]-A[0])*t),
    Math.round(A[1] + (B[1]-A[1])*t),
    Math.round(A[2] + (B[2]-A[2])*t),
  ]);
}

export function gradientText(text, paletteName = 'purpleBlue') {
  const pal = PALETTES[paletteName] || PALETTES.purpleBlue;
  const chars = [...text];
  if (chars.length <= 1) return chalk.hex(pal[0])(text);
  return chars.map((c, i) => {
    if (c === ' ' || c === '\n') return c;
    const pos = (i / (chars.length - 1)) * (pal.length - 1);
    const lo  = Math.floor(pos);
    const hi  = Math.min(lo + 1, pal.length - 1);
    const col = lerpColor(pal[lo], pal[hi], pos - lo);
    return chalk.hex(col)(c);
  }).join('');
}

export function gradientLine(width, palette = 'purpleBlue', char = '─') {
  return gradientText(char.repeat(width), palette);
}

/* ───────────────────── Terminal width helpers ───────────────────── */

export function termWidth() {
  return Math.max(40, Math.min(process.stdout.columns || 100, 140));
}

function visibleLen(s) { return stripAnsi(s).length; }

function padCenter(text, width) {
  const len = visibleLen(text);
  if (len >= width) return text;
  const total = width - len;
  const left  = Math.floor(total / 2);
  return ' '.repeat(left) + text + ' '.repeat(total - left);
}

function padRight(text, width) {
  const len = visibleLen(text);
  if (len >= width) return text;
  return text + ' '.repeat(width - len);
}

function truncate(s, max) {
  if (visibleLen(s) <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function wrapText(text, width) {
  const out = [];
  for (const para of text.split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      if (visibleLen(line + (line ? ' ' : '') + word) > width) {
        if (line) out.push(line);
        line = word;
      } else {
        line = line ? line + ' ' + word : word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function shortenPath(p, max = 50) {
  if (!p) return '';
  const home = os.homedir();
  let s = p;
  try {
    if (p.startsWith(home)) {
      s = '~' + p.slice(home.length);
    }
  } catch (e) {}
  
  s = s.replace(/\\/g, '/');
  if (s.length <= max) return s;
  
  const parts = s.split('/');
  if (parts.length <= 3) {
    return '…' + s.slice(-(max - 3));
  }
  return parts[0] + '/…/' + parts.slice(-2).join('/');
}

function getGitBranch() {
  try {
    const branch = execSync('git branch --show-current', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 250,
    }).trim();
    return branch || '';
  } catch {
    return '';
  }
}

function badge(label, fg = '#E5E7EB', bg = '#1F2937') {
  return chalk.bgHex(bg).hex(fg).bold(` ${label} `);
}

/* ═══════════════════════════════════════════════════════════════
   MATRIX RAIN — full-screen digital-rain splash (matrix theme)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Play a Matrix-style falling-binary animation, then clear the screen.
 * Terminals can't animate *behind* interactive text, so this runs as a
 * short splash over the theme background.
 */
export function matrixRain(durationMs = 2200) {
  if (!process.stdout.isTTY) return Promise.resolve();
  const out  = process.stdout;
  const cols = Math.max(20, out.columns || 80);
  const rows = Math.max(10, out.rows || 24);

  const head  = chalk.hex('#B6FFCE').bold;
  const mid   = chalk.hex('#22C55E');
  const tail  = chalk.hex('#166534');
  const faint = chalk.hex('#0B3B21');
  const bit   = () => (Math.random() < 0.5 ? '0' : '1');

  // Roughly every other column carries a drop, staggered across the full
  // height (and above it) so even tall windows fill with rain immediately
  const drops = [];
  for (let x = 1; x <= cols; x++) {
    if (Math.random() < 0.55) {
      drops.push({ x, y: Math.floor(Math.random() * rows * 2) - rows, len: 5 + Math.floor(Math.random() * 10) });
    }
  }

  // Alternate screen buffer: the rain plays on its own blank screen and the
  // terminal restores the original content afterwards — a plain ESC[2J leaves
  // frozen rain frames in Windows Terminal's scrollback.
  out.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l');

  return new Promise(resolve => {
    const timer = setInterval(() => {
      let buf = '';
      for (const d of drops) {
        d.y += 1;
        const put = (y, s) => { if (y >= 1 && y <= rows) buf += `\x1b[${y};${d.x}H${s}`; };
        put(d.y, head(bit()));
        put(d.y - 1, mid(bit()));
        put(d.y - Math.floor(d.len / 2), tail(bit()));
        put(d.y - d.len + 1, faint(bit()));
        put(d.y - d.len, ' ');                       // erase the tail end
        if (d.y - d.len > rows) {                    // respawn above the screen
          d.y = -Math.floor(Math.random() * 10);
          d.len = 5 + Math.floor(Math.random() * 10);
        }
      }
      out.write(buf);
    }, 60);

    setTimeout(() => {
      clearInterval(timer);
      out.write('\x1b[?1049l\x1b[?25h'); // leave alt screen (restores prior content), show cursor
      resolve();
    }, durationMs);
  });
}

/* ═══════════════════════════════════════════════════════════════
   BANNER & SESSION INFO
   ═══════════════════════════════════════════════════════════════ */

const LOGO = [
'  ███╗   ███╗ ██████╗ ██████╗  █████╗ ██╗  ████████╗ █████╗ ',
'  ████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██║  ╚══██╔══╝██╔══██╗',
'  ██╔████╔██║██║   ██║██████╔╝███████║██║     ██║   ███████║',
'  ██║╚██╔╝██║██║   ██║██╔══██╗██╔══██║██║     ██║   ██╔══██║',
'  ██║ ╚═╝ ██║╚██████╔╝██║  ██║██║  ██║███████╗██║   ██║  ██║',
'  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═╝',
];

const COMPACT_LOGO = [
'  ╭─╮╭─╮╭─╮╭─╮╭─╮╭╮ ╭─╮╭─╮',
'  │││││ ││┬╯├─┤│ │ │ ├─┤',
'  ╵ ╵╰─╯╵ ╵╵ ╵╰─╯ ╵ ╵ ╵',
];

export function renderBanner({ version = '3.0.0', tagline = 'AI Coding Assistant' } = {}) {
  const w = termWidth();
  console.log();

  const useCompact = w < 70;
  const logo = useCompact ? COMPACT_LOGO : LOGO;

  // Logo with gradient + subtle shadow effect (dim duplicate offset)
  for (const line of logo) console.log(gradientText(line, activeTheme.palette));

  // Sub-line with refined typography
  const dot   = chalk.hex('#4B5563')('·');
  const spark = chalk.hex('#FBBF24')('✦');
  const star  = chalk.hex('#A78BFA')('✧');

  const taglineStyled = gradientText(tagline, activeTheme.name === 'matrix' ? 'mint' : 'purpleBlue');
  const versionBadge  = chalk.bgHex('#1F2937').hex('#FCD34D').bold(` v${version} `);
  const themeBadge    = chalk.bgHex('#111827').hex(activeTheme.accent).bold(` ${activeTheme.name} `);
  const poweredBy     = `${t.muted('vibe coding terminal')} ${dot} ${t.primary.bold('Moralta AI')}`;

  const sub = `   ${spark}  ${chalk.bold(taglineStyled)}  ${dot}  ${poweredBy}  ${dot}  ${versionBadge} ${themeBadge}`;
  console.log(sub);

  // Quick-tip line
  const tip = `   ${star}  ${t.subtle('Type')} ${chalk.hex('#A78BFA').bold('/help')} ${t.subtle('for commands')} ${dot} ${chalk.hex('#A78BFA').bold('/clear')} ${t.subtle('to reset')} ${dot} ${chalk.hex('#A78BFA').bold('Ctrl+C')} ${t.subtle('to exit')}`;
  console.log(tip);

  // Decorative shimmer divider just under the logo
  const lineW = Math.min(w - 4, 70);
  console.log('  ' + gradientLine(lineW, activeTheme.palette, '━'));
  console.log();
}

export function renderSessionInfo(opts = {}) {
  const {
    model = 'unknown',
    cwd = process.cwd(),
    apiFormat,
    format,                    // alias
    baseUrl,
    autoApprove = false,
    sessionId = '—',
  } = opts;

  const fmt = apiFormat || format || 'anthropic';
  const w   = termWidth();
  const boxW = Math.min(w - 4, 78);

  const modeLabel = autoApprove
    ? chalk.bgHex('#78350F').hex('#FDE68A').bold(' AUTO ') + ' ' + t.warning('approve all')
    : chalk.bgHex('#064E3B').hex('#A7F3D0').bold(' SAFE ') + ' ' + t.success('confirm each');

  const dot = (color) => chalk.hex(color)('●');
  const branch = getGitBranch();

  // Two-column layout (label : value) using fixed key column width
  const rows = [
    [`${dot(activeTheme.primary)} Model`,     t.bright(model)],
    [`${dot(activeTheme.secondary)} API`,       t.bright(fmt) + (baseUrl ? t.dim('  →  ' + truncate(baseUrl, boxW - 28)) : '')],
    [`${dot(activeTheme.accent)} Workspace`, t.bright(shortenPath(cwd, boxW - 18))],
    [`${dot('#F472B6')} Branch`,    branch ? t.bright(branch) : t.dim('not a git repo')],
    [`${dot('#FBBF24')} Mode`,      modeLabel],
    [`${dot('#10B981')} Session`,   t.dim(sessionId)],
  ];

  const keyW = Math.max(...rows.map(([k]) => visibleLen(k)));
  const lines = rows.map(([k, v]) => `${padRight(t.muted(k), keyW + 6)}${v}`);

  const box = boxen(lines.join('\n'), {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin:  { top: 0, bottom: 0, left: 2, right: 0 },
    borderStyle: 'round',
    borderColor: activeTheme.borderHi,
    title: t.primary.bold('◆ Session'),
    titleAlignment: 'left',
    width: boxW,
  });
  console.log(box);
}

export function renderWelcomePanel({ model, autoApprove = false } = {}) {
  const w = termWidth();
  const boxW = Math.min(w - 4, 78);
  const left = [
    `${t.primary('┃')} ${t.bright('Ready to build.')}`,
    `${t.primary('┃')} ${t.muted('Describe a change, paste an error, or type')} ${t.secondary.bold('/')} ${t.muted('for the command palette.')}`,
  ];
  const mode = autoApprove ? t.warning('auto-approve') : t.success('approval prompts');
  const footer = `${badge('AI', '#FED7AA', activeTheme.aiBg)} ${t.dim(truncate(model || 'unknown model', 32))}  ${t.dim('mode')} ${mode}`;
  const box = boxen([...left, '', footer].join('\n'), {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 1, bottom: 1, left: 2, right: 0 },
    borderStyle: 'round',
    borderColor: activeTheme.border,
    title: t.secondary.bold('✦ Workspace Online'),
    titleAlignment: 'left',
    width: boxW,
  });
  console.log(box);
}

/** Render the compact help footer shown after the session card */
export function renderHelpFooter() {
  const w = termWidth();
  const boxW = Math.min(w - 4, 78);
  const kbd = (k) => chalk.bgHex('#1F2937').hex('#E5E7EB').bold(` ${k} `);

  const tips = [
    `${kbd('/help')}  show all commands         ${kbd('/cost')}   token usage`,
    `${kbd('/auto')}  toggle auto-approve       ${kbd('/clear')}  reset chat`,
    `${kbd('Ctrl+C')} cancel current request    ${kbd('\\')}      multi-line input`,
  ];

  const box = boxen(tips.join('\n'), {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin:  { top: 0, bottom: 1, left: 2, right: 0 },
    borderStyle: 'round',
    borderColor: activeTheme.border,
    title: t.secondary.bold('✦ Quick Tips'),
    titleAlignment: 'left',
    width: boxW,
  });
  console.log(box);
}

export function renderDivider(palette = 'claude') {
  const w = termWidth() - 4;
  console.log('  ' + gradientLine(w, palette === 'claude' ? activeTheme.palette : palette));
}

export function renderTip(text) {
  if (!text) {
    text = `Type ${t.accent('/help')} to see commands, or just describe what you want to build.`;
  }
  console.log(`  ${chalk.hex('#FBBF24')('✦')} ${t.muted(text)}`);
}

export function renderSuccess(text) {
  console.log(`  ${t.success(figures.tick)} ${t.text(text)}`);
}

export function renderError(text) {
  console.log(`  ${t.errBadge('ERROR')} ${t.error(text)}`);
}

export function renderWarning(text) {
  console.log(`  ${t.warning(figures.warning)} ${t.warning(text)}`);
}

export function renderInfo(text) {
  console.log(`  ${t.info(figures.info)} ${t.text(text)}`);
}

/* ═══════════════════════════════════════════════════════════════
   PROMPT PREFIX
   ═══════════════════════════════════════════════════════════════ */

/**
 * A two-line shell-style prompt:
 *   ╭─ ~/path/to/project ─ main
 *   ╰─❯
 */
export function renderPromptHeader() {
  const cwd = shortenPath(process.cwd(), 60);
  const arrow = chalk.hex('#D97757')('─');
  const pathSeg = chalk.hex('#A78BFA')(cwd);
  console.log(`  ${chalk.hex('#D97757')('╭─')} ${pathSeg} ${arrow}${arrow}`);
}

export function getPromptPrefix() {
  return `  ${chalk.hex('#D97757')('╰─')}${chalk.hex('#C084FC').bold('❯')} `;
}

export function renderTurnHeader(role) {
  const w = termWidth();
  const date = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (role === 'user') {
    const label = chalk.bgHex('#1F2937').hex('#60A5FA').bold(' YOU ');
    console.log(`\n  ${label} ${t.dim('·')} ${t.dim(date)}`);
  } else {
    const label = gradientText('MORALTA AI', 'amber');
    const spark = chalk.hex('#FBBF24')('✦');
    console.log(`\n  ${spark} ${chalk.bold(label)} ${t.dim('·')} ${t.dim(date)}`);
  }
}

export function renderUserMessage(text) {
  const lines = wrapText(text, termWidth() - 10);
  lines.forEach(line => {
    console.log(`  ${chalk.hex('#60A5FA')('│')}  ${t.bright(line)}`);
  });
}

export function renderAssistantHeader() {
  // Deprecated in favor of renderTurnHeader('assistant')
}

/* ═══════════════════════════════════════════════════════════════
   TOOL CALL / RESULT RENDERING
   ═══════════════════════════════════════════════════════════════ */

const TOOL_ICONS = {
  read_file:       '📖',
  write_file:      '📝',
  edit_file:       '✏️ ',
  run_command:     '⚡',
  search_files:    '🔍',
  list_directory:  '📁',
  multi_edit:      '🔀',
  append_file:     '➕',
  delete_file:     '🗑️ ',
  move_file:       '➡️ ',
  copy_file:       '📋',
  fetch_url:       '🌐',
  find_files:      '🧭',
  file_info:       'ℹ️ ',
  default:         '🔧',
};

const TOOL_VERBS = {
  read_file:      'Reading',
  write_file:     'Writing',
  edit_file:      'Editing',
  run_command:    'Executing',
  search_files:   'Searching',
  list_directory: 'Listing',
  multi_edit:     'Editing',
  append_file:    'Appending to',
  delete_file:    'Deleting',
  move_file:      'Moving',
  copy_file:      'Copying',
  fetch_url:      'Fetching',
  find_files:     'Finding',
  file_info:      'Inspecting',
};

function toolIcon(name) { return TOOL_ICONS[name] || TOOL_ICONS.default; }
function toolVerb(name) { return TOOL_VERBS[name] || 'Running'; }

/** Pull the most useful "target" out of input for a one-line summary */
function toolTarget(name, input) {
  if (!input || typeof input !== 'object') return '';
  if (input.path)    return input.path;
  if (input.command) return input.command;
  if (input.pattern) return input.pattern;
  if (input.url)     return input.url;
  if (input.from && input.to) return `${input.from} → ${input.to}`;
  return '';
}

// Track timing per tool call for nicer result lines
const _toolTimers = new Map();
let _toolCallCounter = 0;

export function renderToolCall(name, input) {
  const id    = ++_toolCallCounter;
  _toolTimers.set(name + ':' + id, Date.now());

  const icon   = toolIcon(name);
  const verb   = toolVerb(name);
  const target = toolTarget(name, input);
  const w      = termWidth();
  const boxW   = Math.min(w - 6, 96);

  // Clean Header
  const targetStr = target ? '  ' + chalk.hex('#D1D5DB')(truncate(target, boxW - 24)) : '';
  const head = `  ${icon}  ${chalk.hex('#C084FC').bold(verb)} ${chalk.hex('#A78BFA')(name)}${targetStr}`;

  console.log(head);

  // Render non-target params underneath cleanly
  const extras = [];
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (['path','command','pattern','url','from','to','content','new_text','old_text','explanation'].includes(k)) continue;
      if (v === undefined || v === null) continue;
      extras.push(`${t.dim('│')}   ${t.param(k)}${t.dim(':')} ${t.paramVal(_short(v))}`);
    }
    // Show content size
    if (typeof input.content === 'string') {
      const ln = input.content.split('\n').length;
      extras.push(`${t.dim('│')}   ${t.param('size')}${t.dim(':')} ${t.paramVal(input.content.length.toLocaleString() + ' chars, ' + ln + ' lines')}`);
    }
    if (typeof input.new_text === 'string' || typeof input.old_text === 'string') {
      const oldL = (input.old_text || '').split('\n').length;
      const newL = (input.new_text || '').split('\n').length;
      extras.push(`${t.dim('│')}   ${t.param('delta')}${t.dim(':')} ${t.diffDel('-' + oldL)} ${t.diffAdd('+' + newL)} ${t.dim('lines')}`);
    }
    if (input.explanation) {
      extras.push(`${t.dim('│')}   ${t.dim('purpose ▸')} ${t.muted(truncate(input.explanation, boxW - 20))}`);
    }
  }
  for (const e of extras) console.log(`  ${e}`);

  return id;
}

function _short(v) {
  if (typeof v === 'string') return v.length > 60 ? JSON.stringify(v.slice(0, 57) + '…') : JSON.stringify(v);
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }
  return String(v);
}

function formatParams(input) {
  if (!input || typeof input !== 'object') return [];
  const lines = [];
  for (const [key, val] of Object.entries(input)) {
    let v;
    if (val === null || val === undefined) v = t.dim('null');
    else if (typeof val === 'string') {
      const trimmed = val.length > 80 ? val.slice(0, 77) + '…' : val;
      v = t.paramVal(JSON.stringify(trimmed));
    } else if (typeof val === 'object') {
      v = t.paramVal(JSON.stringify(val).slice(0, 80));
    } else {
      v = t.paramVal(String(val));
    }
    lines.push(`${t.param(key)}: ${v}`);
  }
  return lines;
}

/**
 * Render a tool result. Compatible with TWO calling conventions:
 *   renderToolResult(name, result, ok = true)        // explicit
 *   renderToolResult(result)                          // legacy: name inferred from result
 */
export function renderToolResult(arg1, arg2, ok = true) {
  let name, result;
  if (typeof arg1 === 'string') {
    name = arg1; result = arg2;
  } else {
    result = arg1; name = (result && result.tool) || '';
  }

  // Detect error from result shape
  let isOk = ok;
  if (result && typeof result === 'object' && result.error) isOk = false;

  // Find the most recent timer for this tool
  let elapsed = '';
  for (const [k, ts] of [..._toolTimers.entries()].reverse()) {
    if (k.startsWith(name + ':')) {
      elapsed = ' ' + t.dim(`(${_fmtDuration(Date.now() - ts)})`);
      _toolTimers.delete(k);
      break;
    }
  }

  // ── Build a friendly human-readable summary ──
  if (isOk && result && typeof result === 'object') {
    const filePath = result.path ? _shortPath(result.path) : '';

    // File write/create
    if ((name === 'write_file' || name === 'append_file') && filePath) {
      const action = result.action === 'created' ? 'Created' : 'Wrote';
      const info = [];
      if (result.lines) info.push(`${result.lines} lines`);
      if (result.bytes) info.push(_fmtBytes(result.bytes));
      const detail = info.length ? t.dim(` (${info.join(', ')})`) : '';
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')(action)} ${chalk.hex('#FCD34D')(filePath)}${detail}${elapsed}\n`);
      return;
    }

    // File edit
    if (name === 'edit_file' && filePath) {
      const info = [];
      if (result.edits_applied) info.push(`${result.edits_applied} edits`);
      if (result.lines) info.push(`${result.lines} lines`);
      const detail = info.length ? t.dim(` (${info.join(', ')})`) : '';
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')('Edited')} ${chalk.hex('#FCD34D')(filePath)}${detail}${elapsed}\n`);
      return;
    }

    // Multi-edit
    if (name === 'multi_edit' && filePath) {
      const info = result.edits_applied ? `${result.edits_applied} edits` : '';
      const detail = info ? t.dim(` (${info})`) : '';
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')('Edited')} ${chalk.hex('#FCD34D')(filePath)}${detail}${elapsed}\n`);
      return;
    }

    // File delete
    if (name === 'delete_file' && filePath) {
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')('Deleted')} ${chalk.hex('#FCD34D')(filePath)}${elapsed}\n`);
      return;
    }

    // File move/copy
    if ((name === 'move_file' || name === 'copy_file') && result.from) {
      const verb = name === 'move_file' ? 'Moved' : 'Copied';
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')(verb)} ${chalk.hex('#FCD34D')(_shortPath(result.from))} → ${chalk.hex('#FCD34D')(_shortPath(result.to))}${elapsed}\n`);
      return;
    }

    // Create directory
    if (name === 'create_directory' && filePath) {
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')('Created dir')} ${chalk.hex('#FCD34D')(filePath)}${elapsed}\n`);
      return;
    }

    // Run command
    if (name === 'run_command') {
      const code = result.exitCode ?? result.exit_code;
      const codeStr = code === 0 ? t.success('exit 0') : t.warning(`exit ${code}`);
      const outLines = (result.stdout || '').split('\n').filter(Boolean).length;
      const info = outLines > 0 ? t.dim(` · ${outLines} lines output`) : '';
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')('Ran')} ${codeStr}${info}${elapsed}\n`);
      return;
    }

    // Read file
    if (name === 'read_file' && filePath) {
      const info = [];
      if (result.lines) info.push(`${result.lines} lines`);
      if (result.range && result.range !== 'full') info.push(`range ${result.range}`);
      const detail = info.length ? t.dim(` (${info.join(', ')})`) : '';
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')('Read')} ${chalk.hex('#FCD34D')(filePath)}${detail}${elapsed}\n`);
      return;
    }

    // Search files
    if (name === 'search_files' && result.matches) {
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')('Found')} ${chalk.hex('#FCD34D')(`${result.totalMatches || result.matches.length} matches`)}${elapsed}\n`);
      return;
    }

    // List directory
    if (name === 'list_directory' && result.entries) {
      console.log(`  ${t.dim('╰─')} ${t.success('✓')} ${chalk.hex('#10B981')('Listed')} ${chalk.hex('#FCD34D')(`${result.total ?? result.entries.length} entries`)}${elapsed}\n`);
      return;
    }
  }

  // ── Error case ──
  if (!isOk && result) {
    const err = (result.error || result.message || result);
    const errStr = t.error(truncate(String(err), 80));
    const labelName = name ? t.muted(name) + ' ' : '';
    console.log(`  ${t.dim('╰─')} ${t.error('✗')} ${chalk.hex('#EF4444')('Failed')} ${labelName}${t.dim('·')} ${errStr}${elapsed}\n`);
    return;
  }

  // ── Generic fallback ──
  const sym  = isOk ? t.success('✓') : t.error('✗');
  const verb = isOk ? chalk.hex('#10B981')('Complete') : chalk.hex('#EF4444')('Failed');
  const labelName = name ? t.muted(name) + ' ' : '';
  let summary = '';

  if (isOk && result) {
    if (typeof result === 'string') {
      const lines = result.split('\n').length;
      summary = t.dim(`· ${lines} line${lines === 1 ? '' : 's'}`);
    } else if (typeof result === 'object') {
      const bits = [];
      if (result.action)       bits.push(result.action);
      if (result.lines)        bits.push(`${result.lines} lines`);
      if (result.bytes)        bits.push(`${_fmtBytes(result.bytes)}`);
      if (result.message && bits.length === 0) bits.push(truncate(String(result.message), 60));
      if (bits.length) summary = t.dim('· ' + bits.join(' · '));
    }
  }

  console.log(`  ${t.dim('╰─')} ${sym} ${verb} ${labelName}${summary}${elapsed}\n`);
}

/** Shorten an absolute path to a relative/readable form */
function _shortPath(p) {
  if (!p) return '';
  const cwd = process.cwd();
  if (p.startsWith(cwd)) {
    const rel = p.slice(cwd.length).replace(/^[\\/]+/, '');
    return rel || '.';
  }
  // Shorten home dir
  const home = os.homedir();
  if (p.startsWith(home)) return '~' + p.slice(home.length).replace(/\\/g, '/');
  return p;
}

function _fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
}

function _fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)}KB`;
  return `${(n/1024/1024).toFixed(2)}MB`;
}

/**
 * Render the approval prompt. Backwards compatible:
 *   renderApprovalPrompt(name, input)   – preferred
 *   renderApprovalPrompt(name)          – legacy (no params box)
 */
export function renderApprovalPrompt(name, input) {
  const icon = toolIcon(name);
  const verb = toolVerb(name);
  const target = toolTarget(name, input);
  const w = Math.min(termWidth() - 6, 88);

  const reqBadge = chalk.bgHex('#78350F').hex('#FDE68A').bold(' ⚠ APPROVAL REQUIRED ');
  console.log(`\n  ${reqBadge}`);

  const headline = `  ${icon}  ${chalk.hex('#FCD34D').bold(verb)} ${chalk.hex('#FBBF24')(name)}`;
  const targetLine = target
    ? `  ${t.dim('│')}   ${t.dim('target ▸')} ${chalk.hex('#FDE68A').bold(truncate(target, w - 14))}`
    : '';

  const params = (input && typeof input === 'object')
    ? formatParams(input).slice(0, 6).map(l => `  ${t.dim('│')}   ` + l)
    : [];

  const sections = [headline];
  if (targetLine) sections.push(targetLine);
  if (params.length) sections.push(`  ${t.dim('│')}`, ...params);

  // Add hint line at bottom
  sections.push(`  ${t.dim('│')}`);
  sections.push(`  ${t.dim('│')}   ${t.dim('This action will modify your system. Review carefully.')}`);

  console.log(sections.join('\n'));

  const yes  = chalk.bgHex('#064E3B').hex('#A7F3D0').bold(' Y ');
  const no   = chalk.bgHex('#7F1D1D').hex('#FECACA').bold(' N ');
  const all  = chalk.bgHex('#1E3A8A').hex('#BFDBFE').bold(' A ');
  return `  ${chalk.hex('#FBBF24')('?')} ${t.bright('Approve?')}  ${yes} ${t.muted('yes')}   ${no} ${t.muted('no')}   ${all} ${t.muted('always')}  ${t.dim('›')} `;
}

/* ═══════════════════════════════════════════════════════════════
   USAGE / COST
   ═══════════════════════════════════════════════════════════════ */

export function renderUsage({ inputTokens = 0, outputTokens = 0, cost = 0 }) {
  const parts = [
    `${chalk.hex('#60A5FA')('↑')} ${t.subtle(inputTokens.toLocaleString())} ${t.dim('in')}`,
    `${chalk.hex('#34D399')('↓')} ${t.subtle(outputTokens.toLocaleString())} ${t.dim('out')}`,
    `${chalk.hex('#FBBF24')('$')} ${t.subtle(cost.toFixed(4))}`,
  ];
  console.log(`  ${t.dim('└─')} ${parts.join(t.dim('  ·  '))}\n`);
}

export function renderCostTable({ inputTokens, outputTokens, cost, turns, model }) {
  const table = new Table({
    chars: {
      'top':'─','top-mid':'┬','top-left':'╭','top-right':'╮',
      'bottom':'─','bottom-mid':'┴','bottom-left':'╰','bottom-right':'╯',
      'left':'│','left-mid':'├','mid':'─','mid-mid':'┼',
      'right':'│','right-mid':'┤','middle':'│',
    },
    style: { head: [], border: ['gray'] },
    colWidths: [22, 30],
  });
  table.push(
    [t.muted('Model'),         t.bright(model)],
    [t.muted('Turns'),         t.bright(String(turns))],
    [t.muted('Input tokens'),  t.accent(inputTokens.toLocaleString())],
    [t.muted('Output tokens'), t.accent(outputTokens.toLocaleString())],
    [t.muted('Total tokens'),  t.bright((inputTokens+outputTokens).toLocaleString())],
    [t.muted('Estimated cost'),t.success('$' + cost.toFixed(4))],
  );
  console.log(table.toString());
}

/* ═══════════════════════════════════════════════════════════════
   STREAM RENDERER — markdown-aware live text printer
   ═══════════════════════════════════════════════════════════════ */

export class StreamRenderer {
  constructor() {
    this.buffer = '';
    this.printed = false;
    this.inCodeBlock = false;
    this.codeBuffer = '';
    this.codeLang = '';
    this.inThinkingBlock = false;
    this.inTable = false;
    this.tableLines = [];
    this.consecutiveBlankLines = 0;
  }

  /** Feed a chunk of streamed text. Inline-format & print line by line. */
  write(chunk) {
    if (!chunk) return;
    this.buffer += chunk;

    // Process complete lines only
    const idx = this.buffer.lastIndexOf('\n');
    if (idx === -1) return;
    const ready  = this.buffer.slice(0, idx + 1);
    this.buffer  = this.buffer.slice(idx + 1);

    for (const line of ready.split('\n').slice(0, -1)) {
      this.printLine(line);
    }
  }

  /** Flush any buffered text. */
  end() {
    if (this.buffer) { this.printLine(this.buffer); this.buffer = ''; }
    if (this.inCodeBlock && this.codeBuffer) {
      this.flushCodeBlock();
    }
    if (this.inTable && this.tableLines.length) {
      this.flushTable();
    }
    if (this.printed) console.log();
  }

  printLine(line) {
    let isThinkingLine = this.inThinkingBlock;
    let renderLine = line;

    if (!this.inCodeBlock) {
      if (renderLine.includes('<think>')) {
        this.inThinkingBlock = true;
        isThinkingLine = true;
        renderLine = renderLine.replace('<think>', '');
        process.stdout.write(`  ${chalk.hex('#6B7280')('│')} ${chalk.hex('#A78BFA').italic('🤔 Thinking...')}\n`);
        this.printed = true;
      }

      if (renderLine.includes('</think>')) {
        this.inThinkingBlock = false;
        isThinkingLine = true;
        renderLine = renderLine.replace('</think>', '');
      }

      if (!renderLine.trim() && (line.includes('<think>') || line.includes('</think>'))) {
        return;
      }
    }

    const fence = renderLine.match(/^```(\w*)\s*$/);
    if (fence) {
      if (this.inTable) this.flushTable();
      if (!this.inCodeBlock) {
        this.inCodeBlock = true;
        this.codeLang = fence[1] || '';
        this.codeBuffer = '';
      } else {
        this.flushCodeBlock();
        this.inCodeBlock = false;
        this.codeLang = '';
      }
      this.printed = true;
      return;
    }
    if (this.inCodeBlock) {
      this.codeBuffer += renderLine + '\n';
      return;
    }

    // Markdown Table detection (lines starting and ending with |)
    const isTableLine = /^\s*\|.*\|\s*$/.test(renderLine);
    if (isTableLine) {
      this.inTable = true;
      this.tableLines.push(renderLine);
      return;
    } else if (this.inTable) {
      this.flushTable();
    }

    // Skip bracket-only junk lines
    if (/^[\[\]{}\(\),;\s]*$/.test(renderLine) && renderLine.trim().length > 0 && renderLine.trim().length < 10) {
      return;
    }

    // Collapse consecutive blank lines — allow max 1 empty line
    if (!renderLine.trim()) {
      this.consecutiveBlankLines++;
      if (this.consecutiveBlankLines > 1) return;
      process.stdout.write('\n');
      this.printed = true;
      return;
    }
    this.consecutiveBlankLines = 0;

    if (isThinkingLine) {
      process.stdout.write(`  ${chalk.hex('#6B7280')('│')} ${chalk.dim(renderLine)}\n`);
    } else {
      const formatted = this.formatLine(renderLine);
      process.stdout.write(`  ${formatted}\n`);
    }
    this.printed = true;
  }

  flushTable() {
    if (!this.tableLines.length) return;
    const lines = [...this.tableLines];
    this.tableLines = [];
    this.inTable = false;

    const rows = lines.map(l =>
      l.split('|').slice(1, -1).map(c => c.trim())
    ).filter(r => r.length > 0 && !r.every(c => /^:?-+:?$/.test(c)));

    if (!rows.length) return;

    const headers = rows[0];
    const bodyRows = rows.slice(1);

    try {
      const tableStr = renderTable(headers, bodyRows.map(r => r.map(c => this.inline(c))));
      for (const tLine of tableStr.split('\n')) {
        console.log(`  ${tLine}`);
      }
    } catch {
      for (const raw of lines) {
        console.log(`  ${this.inline(raw)}`);
      }
    }
    this.printed = true;
  }

  flushCodeBlock() {
    const lang = this.codeLang || 'plaintext';
    const code = this.codeBuffer.replace(/\n$/, '');

    // Hide tool call code blocks
    if (lang.toLowerCase() === 'json' || lang === 'plaintext') {
      let parsed = null;
      try { parsed = JSON.parse(code); } catch {}
      if (!parsed) {
        const sanitized = code
          .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
          .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
          .replace(/[\u2013\u2014]/g, '-')
          .replace(/\u2026/g, '...');
        try { parsed = JSON.parse(sanitized); } catch {}
      }

      if (parsed) {
        const isToolCall = Array.isArray(parsed)
          ? parsed.some(p => p && (p.type === 'tool_use' || (p.name && (p.input || p.arguments))))
          : (parsed && (parsed.type === 'tool_use' || (parsed.name && (parsed.input || parsed.arguments))));

        if (isToolCall) {
          this.codeBuffer = '';
          return;
        }
      } else {
        const looksLikeToolCall = /^\s*[\[{]/.test(code) &&
          /"name"\s*:\s*"(?:write_file|read_file|edit_file|run_command|search_files|list_directory|multi_edit|delete_file|append_file|create_directory|move_file|copy_file|analyze_codebase|generate_docs|test_coverage|dependency_check|code_quality)"/.test(code) &&
          /"(?:input|arguments)"\s*:/.test(code);
        if (looksLikeToolCall) {
          this.codeBuffer = '';
          return;
        }
      }
    }

    let highlighted;
    try {
      highlighted = highlight(code, { language: lang, ignoreIllegals: true });
    } catch {
      highlighted = t.codeText(code);
    }
    const lines = highlighted.split('\n');
    const gutterW = String(lines.length).length;
    const rawLines = code.split('\n');
    const maxLineLen = Math.max(...rawLines.map(l => visibleLen(l)));
    const termW = termWidth();
    const boxW = Math.max(48, Math.min(termW - 8, Math.max(maxLineLen + gutterW + 10, 64)));

    // Header chrome with window control buttons
    const dots =
      chalk.hex('#FF5F57')('●') + ' ' +
      chalk.hex('#FEBC2E')('●') + ' ' +
      chalk.hex('#28C840')('●');
    const langLabel = chalk.hex('#A78BFA').bold(lang);
    const lineCount = t.dim(`${lines.length} ln`);
    const headInner = ` ${dots}  ${langLabel}`;
    const fillTop = Math.max(2, boxW - visibleLen(headInner) - visibleLen(lineCount) - 4);

    const top    = t.dim('  ╭─') + headInner + t.dim(' ' + '─'.repeat(fillTop) + ' ') + lineCount + t.dim('─╮');
    const bottom = t.dim('  ╰─' + '─'.repeat(boxW - 4) + '─╯');

    console.log(top);
    lines.forEach((ln, i) => {
      const num = t.dim(String(i + 1).padStart(gutterW, ' '));
      const codeLen = visibleLen(ln);
      const pad = ' '.repeat(Math.max(0, boxW - codeLen - gutterW - 8));
      console.log(t.dim('  │ ') + num + t.dim(' │ ') + ln + pad + t.dim(' │'));
    });
    console.log(bottom);
    this.codeBuffer = '';
  }

  formatLine(line) {
    // Headers
    let m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      const level = m[1].length;
      const cleanTxt = m[2].replace(/^[█▓▸]\s*/, '');
      const txt = this.inline(cleanTxt);
      if (level === 1) return chalk.hex('#D97757').bold('█ ' + txt);
      if (level === 2) return chalk.hex('#A78BFA').bold('▓ ' + txt);
      if (level === 3) return chalk.hex('#7DD3FC').bold('▸ ' + txt);
      return chalk.bold(txt);
    }
    // Bullets
    m = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (m) return m[1] + chalk.hex('#D97757')('•') + ' ' + this.inline(m[3]);
    // Numbered
    m = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (m) return m[1] + chalk.hex('#A78BFA').bold(m[2] + '.') + ' ' + this.inline(m[3]);
    // Blockquote
    m = line.match(/^>\s?(.*)$/);
    if (m) return chalk.hex('#A78BFA')('│ ') + t.muted(this.inline(m[1]));
    // Horizontal rule
    if (/^---+$/.test(line)) return gradientLine(termWidth() - 4, 'claude');
    // Task list
    m = line.match(/^(\s*)- \[( |x|X)\]\s+(.+)$/);
    if (m) {
      const checked = m[2].toLowerCase() === 'x';
      const box = checked ? t.success('☑') : t.muted('☐');
      const txt = checked ? chalk.strikethrough(t.muted(m[3])) : this.inline(m[3]);
      return m[1] + box + ' ' + txt;
    }

    return this.inline(line);
  }

  inline(text) {
    if (!text) return text;
    // 1. Inline code: `code`
    text = text.replace(/`([^`]+)`/g, (_, c) =>
      chalk.bgHex('#1F2937').hex('#FCD34D')(` ${c.trim()} `)
    );
    // 2. Bold: **bold** or __bold__
    text = text.replace(/(\*\*|__)(.*?)\1/g, (_, __, c) => chalk.bold(c));
    // 3. Italic: *italic* or _italic_
    text = text.replace(/(\*|_)(.*?)\1/g, (_, __, c) => chalk.italic(c));
    // 4. Strikethrough: ~~text~~
    text = text.replace(/~~(.*?)~~/g, (_, c) => chalk.strikethrough(c));
    // 5. Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, url) => {
      if (url.startsWith('file://') || url.startsWith('http')) {
        return chalk.hex('#7DD3FC').underline(txt) + t.dim(` (${url})`);
      }
      return chalk.hex('#7DD3FC').underline(txt);
    });
    return text;
  }
}

/* ═══════════════════════════════════════════════════════════════
   BOX & TABLE HELPERS
   ═══════════════════════════════════════════════════════════════ */

export function drawBox(content, opts = {}) {
  return boxen(content, {
    padding: 1,
    margin: { top: 0, bottom: 1, left: 2, right: 0 },
    borderStyle: 'round',
    borderColor: opts.color || 'gray',
    title: opts.title,
    titleAlignment: opts.titleAlign || 'left',
    width: opts.width,
    ...opts,
  });
}

export function renderHelpTable(rows) {
  const table = new Table({
    chars: {
      'top':'─','top-mid':'┬','top-left':'╭','top-right':'╮',
      'bottom':'─','bottom-mid':'┴','bottom-left':'╰','bottom-right':'╯',
      'left':'│','left-mid':'├','mid':'─','mid-mid':'┼',
      'right':'│','right-mid':'┤','middle':'│',
    },
    head: [t.toolName('Command'), t.toolName('Description')],
    style: { head: [], border: ['gray'] },
    colWidths: [16, 56],
  });
  for (const [cmd, desc] of rows) {
    table.push([t.accent(cmd), t.text(desc)]);
  }
  console.log(table.toString());
}

/* ═══════════════════════════════════════════════════════════════
   DIFF RENDERER
   ═══════════════════════════════════════════════════════════════ */

export function renderDiff(patch) {
  if (!patch) return;
  const lines = patch.split('\n');
  const w = termWidth() - 6;
  
  console.log('  ' + t.dim('╭' + '─'.repeat(w) + '╮'));
  for (const line of lines) {
    const cleanLine = truncate(line, w - 4);
    const pad = ' '.repeat(Math.max(0, w - visibleLen(cleanLine) - 2));
    
    if (line.startsWith('+++') || line.startsWith('---')) {
      console.log('  ' + t.dim('│ ') + t.muted(cleanLine) + pad + t.dim(' │'));
    } else if (line.startsWith('@@')) {
      const seg = chalk.bgHex('#1E1B4B').hex('#A78BFA').bold(' ' + cleanLine + ' ');
      const segPad = ' '.repeat(Math.max(0, w - visibleLen(seg) - 2));
      console.log('  ' + t.dim('│ ') + seg + segPad + t.dim(' │'));
    } else if (line.startsWith('+')) {
      const seg = chalk.bgHex('#052E16').hex('#86EFAC')(cleanLine);
      const segPad = ' '.repeat(Math.max(0, w - visibleLen(seg) - 2));
      console.log('  ' + t.dim('│ ') + seg + segPad + t.dim(' │'));
    } else if (line.startsWith('-')) {
      const seg = chalk.bgHex('#450A0A').hex('#FCA5A5')(cleanLine);
      const segPad = ' '.repeat(Math.max(0, w - visibleLen(seg) - 2));
      console.log('  ' + t.dim('│ ') + seg + segPad + t.dim(' │'));
    } else {
      console.log('  ' + t.dim('│ ') + t.diffCtx(cleanLine) + pad + t.dim(' │'));
    }
  }
  console.log('  ' + t.dim('╰' + '─'.repeat(w) + '╯'));
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BAR
   ═══════════════════════════════════════════════════════════════ */

export function renderStatusBar({ model, tokens, cost, mode }) {
  const w = termWidth();
  const left  = `  ${chalk.hex('#10B981')('●')} ${t.muted(model)}`;
  const right = `${t.muted('tokens')} ${t.subtle(tokens.toLocaleString())}  ${t.dim('│')}  ${t.muted('cost')} ${t.success('$'+cost.toFixed(4))}  ${t.dim('│')}  ${t.muted('mode')} ${mode === 'auto' ? t.warning(mode) : t.success(mode)}  `;
  const lLen = visibleLen(left);
  const rLen = visibleLen(right);
  const pad  = Math.max(1, w - lLen - rLen);
  console.log(left + ' '.repeat(pad) + right);
}

/* ═══════════════════════════════════════════════════════════════
   SPINNER FRAMES — for export usage
   ═══════════════════════════════════════════════════════════════ */

export const SPINNER_CLAUDE = {
  interval: 80,
  frames: ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'].map(f => chalk.hex('#D97757')(f)),
};

export const SPINNER_PULSE = {
  interval: 120,
  frames: ['◐','◓','◑','◒'].map(f => chalk.hex('#A78BFA')(f)),
};

export const SPINNER_SHIMMER = {
  interval: 90,
  frames: [
    chalk.hex('#D97757')('✦'),
    chalk.hex('#E8895A')('✧'),
    chalk.hex('#A78BFA')('✦'),
    chalk.hex('#7DD3FC')('✧'),
    chalk.hex('#A78BFA')('✦'),
    chalk.hex('#E8895A')('✧'),
  ],
};

/* ═══════════════════════════════════════════════════════════════
   CODE WRITE ANIMATION — plays while AI writes/edits code
   ═══════════════════════════════════════════════════════════════ */

const CODE_SYMBOLS = [
  'const ', 'let ', 'function ', 'import ', 'export ',
  'return ', 'if (', 'for (', 'class ', 'async ',
  '=> {', '};', '});', '] = ', '...', '/**',
  '<div', '</>', 'await ', 'new ', '.map(', '.then(',
  'try {', 'catch', 'module.', 'require(',
];

const WRITE_VERBS = [
  'Generating code', 'Writing code', 'Crafting code',
  'Composing code', 'Building code', 'Synthesizing code',
];

export class CodeWriteAnimation {
  constructor(toolName, filePath) {
    this.toolName = toolName;
    this.filePath = filePath || '';
    this.interval = null;
    this.frame = 0;
    this.startTime = Date.now();
  }

  start() {
    const w = Math.min(termWidth() - 6, 72);
    const fileBase = path.basename(this.filePath);
    const verb = toolVerb(this.toolName);

    this.interval = setInterval(() => {
      this.frame++;
      const sym = CODE_SYMBOLS[this.frame % CODE_SYMBOLS.length];
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

      // Build a shimmer progress bar
      const barW = Math.min(16, w - 40);
      const pos = this.frame % (barW * 2);
      const barChars = [];
      for (let i = 0; i < barW; i++) {
        const dist = Math.abs(i - (pos < barW ? pos : barW * 2 - pos));
        if (dist === 0)      barChars.push(chalk.hex('#D97757')('█'));
        else if (dist === 1) barChars.push(chalk.hex('#C084FC')('▓'));
        else if (dist === 2) barChars.push(chalk.hex('#818CF8')('▒'));
        else                 barChars.push(chalk.hex('#374151')('░'));
      }
      const bar = barChars.join('');

      // Sparkle effect
      const sparkles = ['✦', '✧', '⟡', '◇', '❖'];
      const sparkle = chalk.hex('#FBBF24')(sparkles[this.frame % sparkles.length]);

      // Build the status line
      const codeSnippet = chalk.hex('#86EFAC').dim(sym.padEnd(10));
      const fileInfo = fileBase ? chalk.hex('#A78BFA').bold(truncate(fileBase, 15)) : t.muted('working…');
      const timeBit = t.dim(`${elapsed}s`);
      
      const line = `  ${t.dim('│')}   ${sparkle} ${fileInfo} ${bar} ${codeSnippet} ${timeBit}`;

      // Overwrite current line robustly
      if (process.stdout.clearLine) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(line);
      } else {
        // Fallback for terminals that don't support clearLine
        process.stdout.write('\r' + line);
      }
    }, 100);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Clear the animation line
    if (process.stdout.clearLine) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    } else {
      process.stdout.write('\r' + ' '.repeat(termWidth()) + '\r');
    }
  }
}

/** Check if a tool name is a code-writing tool */
export function isCodeWriteTool(name) {
  return ['write_file', 'edit_file', 'multi_edit', 'append_file'].includes(name);
}

/** Random "thinking" phrase to keep the wait friendly */
const THINKING_PHRASES = [
  'Thinking', 'Reasoning', 'Analyzing', 'Composing', 'Pondering',
  'Crafting', 'Working', 'Considering',  'Reflecting', 'Planning', 'Synthesizing', 'Architecting',
  'Debugging', 'Innovating', 'Brainstorming', 'Reviewing',
];
export function thinkingText() {
  const w = THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
  return chalk.hex('#D97757').italic(`  ${w}…`);
}

/* ═══════════════════════════════════════════════════════════════
   TABLE & KEY-VALUE RENDERERS
   ═══════════════════════════════════════════════════════════════ */

export function renderTable(headers, rows) {
  const table = new Table({
    chars: {
      'top':'─','top-mid':'┬','top-left':'╭','top-right':'╮',
      'bottom':'─','bottom-mid':'┴','bottom-left':'╰','bottom-right':'╯',
      'left':'│','left-mid':'├','mid':'─','mid-mid':'┼',
      'right':'│','right-mid':'┤','middle':'│',
    },
    head: headers.map(h => t.toolName(h)),
    style: { head: [], border: ['gray'] },
  });
  for (const row of rows) {
    table.push(row);
  }
  return table.toString();
}

export function renderKeyValue(obj) {
  const maxKeyLen = Math.max(...Object.keys(obj).map(k => k.length));
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    const pad = ' '.repeat(maxKeyLen - key.length + 1);
    lines.push(`  ${t.dim(key)}${pad}${t.text(String(value))}`);
  }
  return lines.join('\n');
}

/* ═══════════════════════════════════════════════════════════════
   GOODBYE
   ═══════════════════════════════════════════════════════════════ */

export function renderGoodbye() {
  const w = termWidth();
  const lineW = Math.min(w - 4, 64);
  console.log();
  console.log('  ' + gradientLine(lineW, 'claude', '━'));
  const msg = '  ' + chalk.hex('#FBBF24')('✦') + ' ' +
              gradientText('Session saved. Until next time!', 'claude') + ' ' +
              chalk.hex('#FBBF24')('✦');
  console.log(msg);
  console.log('  ' + gradientLine(lineW, 'claude', '━'));
  console.log();
}

export default {
  t, gradientText, gradientLine, termWidth,
  renderBanner, renderSessionInfo, renderHelpFooter, renderDivider,
  renderTip, renderSuccess, renderError, renderWarning, renderInfo,
  renderToolCall, renderToolResult, renderApprovalPrompt,
  renderUsage, renderCostTable, renderStatusBar,
  renderDiff, renderHelpTable, renderAssistantHeader,
  renderTable, renderKeyValue,
  getPromptPrefix, renderPromptHeader, drawBox,
  StreamRenderer, CodeWriteAnimation, isCodeWriteTool,
  SPINNER_CLAUDE, SPINNER_PULSE, SPINNER_SHIMMER,
  thinkingText, renderGoodbye,
};
