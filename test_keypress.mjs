import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

process.stdin.on('keypress', (s, key) => {
  console.log(`\n[KEYPRESS] s=${s}, rl.line='${rl.line}', rl.cursor=${rl.cursor}`);
  rl.prompt();
});

rl.prompt();

rl.on('line', (line) => {
  console.log('Line:', line);
  rl.prompt();
});
