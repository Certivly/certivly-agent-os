import { parseCsvRow } from './src/csv';

const simple = parseCsvRow('a,b,c');
if (JSON.stringify(simple) !== JSON.stringify(['a', 'b', 'c'])) {
  console.error('Simple parse failed:', simple);
  process.exit(1);
}

const quoted = parseCsvRow('1,"hello, world",3');
if (JSON.stringify(quoted) !== JSON.stringify(['1', 'hello, world', '3'])) {
  console.error('Quoted comma parse failed:', quoted);
  process.exit(1);
}

const escaped = parseCsvRow('"say ""hi""",end');
if (JSON.stringify(escaped) !== JSON.stringify(['say "hi"', 'end'])) {
  console.error('Escaped quotes failed:', escaped);
  process.exit(1);
}

console.log('Verification passed: parseCsvRow works correctly.');
process.exit(0);
