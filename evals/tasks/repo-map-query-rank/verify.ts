import { verifyToken } from './src/auth';

if (typeof verifyToken !== 'function') {
  console.error('verifyToken is not a function');
  process.exit(1);
}
if (!verifyToken('secret-token')) {
  console.error('verifyToken failed for valid token');
  process.exit(1);
}
if (verifyToken('wrong')) {
  console.error('verifyToken returned true for wrong token');
  process.exit(1);
}
console.log('Verification passed: verifyToken works correctly.');
process.exit(0);
