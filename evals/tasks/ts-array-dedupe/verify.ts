import { dedupeByKey } from './src/dedupe';

const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
  { id: 1, name: 'Alice Duplicate' },
  { id: 3, name: 'Charlie' },
];

const deduped = dedupeByKey(users, 'id');

if (deduped.length !== 3) {
  console.error(`Expected 3 items, got ${deduped.length}`);
  process.exit(1);
}

if (deduped[0].name !== 'Alice' || deduped[1].name !== 'Bob' || deduped[2].name !== 'Charlie') {
  console.error('Incorrect deduplication order or values:', deduped);
  process.exit(1);
}

if (users.length !== 4) {
  console.error('Original array was mutated');
  process.exit(1);
}

console.log('Verification passed: dedupeByKey works correctly.');
process.exit(0);
