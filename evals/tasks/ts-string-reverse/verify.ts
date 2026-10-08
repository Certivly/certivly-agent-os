import { reverseWords } from './src/reverse';

if (reverseWords('hello world') !== 'world hello') {
  console.error(`reverseWords('hello world') failed, got: "${reverseWords('hello world')}"`);
  process.exit(1);
}

if (reverseWords('  quick   brown  fox  ') !== 'fox brown quick') {
  console.error(`reverseWords with whitespace failed, got: "${reverseWords('  quick   brown  fox  ')}"`);
  process.exit(1);
}

if (reverseWords('   ') !== '') {
  console.error(`reverseWords('   ') failed, got: "${reverseWords('   ')}"`);
  process.exit(1);
}

console.log('Verification passed: reverseWords works correctly.');
process.exit(0);
