import { capitalize } from './src/string-utils';

if (capitalize('hello') !== 'Hello') {
  console.error(`capitalize('hello') failed: expected 'Hello', got '${capitalize('hello')}'`);
  process.exit(1);
}

if (capitalize('world') !== 'World') {
  console.error(`capitalize('world') failed: expected 'World', got '${capitalize('world')}'`);
  process.exit(1);
}

if (capitalize('') !== '') {
  console.error(`capitalize('') failed: expected '', got '${capitalize('')}'`);
  process.exit(1);
}

console.log('Verification passed: capitalize works correctly.');
process.exit(0);
