import { takeElements } from './src/array-slice';

const items = ['a', 'b', 'c', 'd', 'e'];
const taken = takeElements(items, 3);

if (taken.length !== 3 || taken[0] !== 'a' || taken[1] !== 'b' || taken[2] !== 'c') {
  console.error(`Expected 3 elements ['a', 'b', 'c'], but got:`, taken);
  process.exit(1);
}

const empty = takeElements([], 2);
if (empty.length !== 0) {
  console.error(`Expected 0 elements, but got:`, empty);
  process.exit(1);
}

console.log('Verification passed: takeElements correctly honors count.');
process.exit(0);
