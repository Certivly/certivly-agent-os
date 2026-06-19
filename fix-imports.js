const fs = require('fs');
const path = require('path');

function replaceImports(dirPath, oldString, newString) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceImports(fullPath, oldString, newString);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(oldString)) {
        // Adjust the relative path based on directory depth
        // For src/stress or src/chaos it's 3 levels deep: ../../../daemon/src
        // For tests it's 2 levels deep: ../../daemon/src
        let replacement = newString;
        if (dirPath.includes('stress') || dirPath.includes('chaos') || dirPath.includes('diagnostics')) {
          replacement = '../../../daemon/src';
        } else if (dirPath.includes('benchmarks') || dirPath.includes('tests')) {
          replacement = '../../daemon/src';
        }

        content = content.replace(new RegExp(oldString, 'g'), replacement);
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

replaceImports('./packages/hardening', '@agent-os/daemon/src', '../../daemon/src');
