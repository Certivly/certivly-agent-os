import { calculateDiscount } from './src/pricing';

if (typeof calculateDiscount !== 'function') {
  console.error('calculateDiscount is not a function');
  process.exit(1);
}

const res = calculateDiscount(100);
if (Math.abs(res - 80) > 0.001) {
  console.error(`calculateDiscount(100) failed: expected 80, got ${res}`);
  process.exit(1);
}

console.log('Verification passed: calculateDiscount works correctly.');
process.exit(0);
