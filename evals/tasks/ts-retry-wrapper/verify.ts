import { retryWithBackoff } from './src/retry';

let attempts = 0;
async function flakySuccess(): Promise<string> {
  attempts++;
  if (attempts < 3) {
    throw new Error(`Attempt ${attempts} failed`);
  }
  return 'ok';
}

const res = await retryWithBackoff(flakySuccess, 3);
if (res !== 'ok' || attempts !== 3) {
  console.error(`Expected 'ok' after 3 attempts, got '${res}' with ${attempts} attempts`);
  process.exit(1);
}

let failAttempts = 0;
async function alwaysFails(): Promise<void> {
  failAttempts++;
  throw new Error('Always failed');
}

let caught = false;
try {
  await retryWithBackoff(alwaysFails, 2);
} catch (err: any) {
  caught = true;
  if (err.message !== 'Always failed') {
    console.error('Wrong error message rethrown:', err);
    process.exit(1);
  }
}

if (!caught || failAttempts !== 3) { // 1 initial + 2 retries = 3 attempts
  console.error(`Expected error caught after 3 attempts, caught=${caught}, failAttempts=${failAttempts}`);
  process.exit(1);
}

console.log('Verification passed: retryWithBackoff works correctly.');
process.exit(0);
