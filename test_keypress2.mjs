import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

let slashMenuActive = false;

process.stdin.on('keypress', (s, key) => {
  if (slashMenuActive || rl.paused) return;
  if (s === '/' && (rl.line === '' || rl.line === '/')) {
    process.stdout.clearLine?.(0);
    process.stdout.cursorTo?.(0);
    
    setTimeout(() => {
      rl.line = '';
      rl.cursor = 0;
    }, 5);
    
    slashMenuActive = true;
    console.log('\n[SLASH MENU OPENED]');
    setTimeout(() => {
      slashMenuActive = false;
      rl.prompt();
    }, 1000);
  }
});

rl.prompt();

rl.on('line', async (line) => {
  rl.pause();
  console.log('User typed:', line);
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('AI response done.');
  
  rl.resume();
  rl.prompt();
});
