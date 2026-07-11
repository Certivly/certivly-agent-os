const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'packages');
const toDelete = ['seol', 'context', 'brain-v2'];

for (const pkg of toDelete) {
  const p = path.join(root, pkg);
  try {
    fs.rmSync(p, { recursive: true, force: true });
    console.log('Deleted:', pkg);
  } catch (e) {
    console.error('Failed:', pkg, e.message);
  }
}
