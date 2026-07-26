import readline from 'readline';

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  const origTtyWrite = rl._ttyWrite.bind(rl);
  rl._ttyWrite = function(s, key) {
    if (s === '/' && rl.line === '') {
      console.log('\n[SLASH MENU OPENED]');
      rl.prompt();
      return;
    }
    origTtyWrite(s, key);
  };

  rl.prompt();

  rl.on('line', async (line) => {
    rl.pause();
    console.log('User typed:', line);
    
    // Simulate AI delay
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('AI response done.');
    
    rl.resume();
    rl.prompt();
  });
}

main();
