const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'packages');
const toDelete = ['seol', 'context', 'brain-v2', 'adaptive-runtime'];

for (const pkg of toDelete) {
  const p = path.join(root, pkg);
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log('Successfully deleted:', pkg);
    } else {
      console.log('Already deleted:', pkg);
    }
  } catch (e) {
    console.error('Failed to delete:', pkg, e.message);
  }
}
