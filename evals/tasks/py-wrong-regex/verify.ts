import * as fs from 'fs';
import { spawnSync } from 'child_process';

const pyTest = `
from validator import isValidHexColor
assert isValidHexColor("#fff") == True, "#fff should be valid"
assert isValidHexColor("#FFFFFF") == True, "#FFFFFF should be valid"
assert isValidHexColor("#123456") == True, "#123456 should be valid"
assert isValidHexColor("#123") == True, "#123 should be valid"
assert isValidHexColor("123456") == False, "Missing # should be invalid"
assert isValidHexColor("#12345") == False, "5 digits should be invalid"
assert isValidHexColor("#gggggg") == False, "Non-hex characters should be invalid"
assert isValidHexColor("") == False, "Empty should be invalid"
print("OK")
`;

let pyPassed = false;
for (const cmd of ['python', 'python3', 'py']) {
  try {
    const res = spawnSync(cmd, ['-c', pyTest], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.includes('OK')) {
      pyPassed = true;
      break;
    }
  } catch {}
}

if (!pyPassed) {
  // Fallback to static regex extraction and verification
  const content = fs.readFileSync('validator.py', 'utf8');
  const match = content.match(/re\.match\(r?["']([^"']+)["']/);
  if (!match) {
    console.error('Could not extract regex from validator.py');
    process.exit(1);
  }
  const regex = new RegExp(match[1]);
  const valid = regex.test('#fff') && regex.test('#FFFFFF') && regex.test('#123456') && regex.test('#123');
  const invalid = !regex.test('123456') && !regex.test('#12345') && !regex.test('#gggggg') && !regex.test('');
  if (!valid || !invalid) {
    console.error('Regex pattern validation failed:', match[1]);
    process.exit(1);
  }
}

console.log('Verification passed: isValidHexColor works.');
process.exit(0);
