// Redraw-stability test for the slash menu — run with: node test_slashmenu.mjs
// Simulates a terminal's cursor row while the real render code draws, and
// asserts repeated redraws never creep upward (which ate the banner).
import assert from 'assert';
import { SlashMenu, SubMenu } from './src/slashmenu.js';

let row = 0;
const realWrite = process.stdout.write.bind(process.stdout);
// Track only what moves the cursor vertically: ESC[<n>F (up n, col 0) and '\n'
const capture = (s) => {
  for (const m of String(s).matchAll(/\x1B\[(\d*)F|\n/g)) {
    if (m[0] === '\n') row++;
    else row -= (m[1] === '' ? 1 : parseInt(m[1], 10));
  }
  return true;
};

const menu = new SlashMenu(null, 'moralta > ');
menu.filtered = [
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/clear', desc: 'Clear conversation history' },
  { cmd: '/model', desc: 'View or change the model' },
];
menu.query = '/';

process.stdout.write = capture;
try {
  menu._draw();                       // first paint
  const topAfterFirst = row - (menu.lastRenderedLines - 1);

  // Type a long string one char at a time, exactly like the reported repro
  for (const ch of 'sadawadawdadawadwadaw') {
    menu.query += ch;
    menu.filtered = menu.query === '/s' ? [{ cmd: '/sessions', desc: 'List saved sessions' }] : [];
    menu._draw();
    const top = row - (menu.lastRenderedLines - 1);
    if (top !== topAfterFirst) {
      process.stdout.write = realWrite;
      assert.fail(`menu drifted ${topAfterFirst - top} row(s) up after typing '${ch}'`);
    }
  }

  menu._dismiss();
  const afterDismiss = row;

  // SubMenu shares the same eraser
  const sub = new SubMenu('moralta > ');
  row = 0; sub.lastRenderedLines = 7;
  sub._clearPrevious();
  process.stdout.write = realWrite;

  assert.strictEqual(afterDismiss, topAfterFirst, 'dismiss must land on the menu top row');
  assert.strictEqual(row, -6, 'clearing 7 lines must move up exactly 6');
  assert.strictEqual(sub.lastRenderedLines, 0, 'clearing must reset the line count');
} finally {
  process.stdout.write = realWrite;
}

console.log('slashmenu: redraw stable across 21 keystrokes, no upward drift');
process.exit(0);
