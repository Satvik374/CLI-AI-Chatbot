import readline from 'readline';

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
  console.log('Processing:', line);
  
  // Create a second readline interface, like getApproval does
  await new Promise(resolve => {
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl2.question('Approve? (y/n) ', ans => {
      rl2.close();
      resolve();
    });
  });

  console.log('Done.');
  rl.resume();
  rl.prompt();
});
