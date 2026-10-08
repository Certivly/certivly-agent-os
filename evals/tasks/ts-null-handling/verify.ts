import { getDisplayName } from './src/user';

if (getDisplayName(null) !== 'Anonymous') {
  console.error('Failed null check: expected "Anonymous"');
  process.exit(1);
}

if (getDisplayName(undefined) !== 'Anonymous') {
  console.error('Failed undefined check: expected "Anonymous"');
  process.exit(1);
}

if (getDisplayName({ id: '1' }) !== 'Anonymous') {
  console.error('Failed empty profile check: expected "Anonymous"');
  process.exit(1);
}

if (getDisplayName({ id: '2', profile: { name: 'Alice' } }) !== 'Alice') {
  console.error('Failed name check: expected "Alice"');
  process.exit(1);
}

console.log('Verification passed: getDisplayName safely handles null/undefined.');
process.exit(0);
