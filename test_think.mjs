import { StreamRenderer } from './src/ui.js';

const renderer = new StreamRenderer();
const output = `
<think>
I need to calculate the value of pi.
Let's see...
3.14159...
</think>
The value of pi is approximately 3.14159.
`;

for (const line of output.split('\n')) {
  renderer.write(line + '\n');
}
renderer.end();
