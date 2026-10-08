import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CheckDocsResult {
  valid: boolean;
  docCount: number;
  linkCount: number;
  commandSnippetCount: number;
  errors: string[];
}

export function checkDocs(workspaceRoot: string = process.cwd()): CheckDocsResult {
  const errors: string[] = [];
  let linkCount = 0;
  let commandSnippetCount = 0;

  // 1. Locate all markdown files in docs/ and root README.md
  const docsDir = path.join(workspaceRoot, 'docs');
  const mdFiles: string[] = [];

  const readmePath = path.join(workspaceRoot, 'README.md');
  if (fs.existsSync(readmePath)) {
    mdFiles.push(readmePath);
  }

  function collectMdFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectMdFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        mdFiles.push(fullPath);
      }
    }
  }

  collectMdFiles(docsDir);

  if (mdFiles.length === 0) {
    errors.push(`No markdown documentation files found in ${docsDir}`);
  }

  // 2. Scan each markdown file
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const codeBlockRegex = /```(bash|sh|powershell|text)?\n([\s\S]*?)```/g;

  for (const filePath of mdFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileDir = path.dirname(filePath);

    // Check links
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
      const linkTarget = match[2].trim();
      // Skip external URLs and anchors
      if (linkTarget.startsWith('http://') || linkTarget.startsWith('https://') || linkTarget.startsWith('#')) {
        continue;
      }

      linkCount++;
      // Strip anchor from target if present
      const targetWithoutAnchor = linkTarget.split('#')[0];
      if (!targetWithoutAnchor) continue; // Pure anchor link

      const resolvedTarget = path.resolve(fileDir, targetWithoutAnchor);
      if (!fs.existsSync(resolvedTarget)) {
        errors.push(`Broken link in ${path.relative(workspaceRoot, filePath)}: target "${linkTarget}" does not exist at "${path.relative(workspaceRoot, resolvedTarget)}"`);
      }
    }

    // Check command snippets in code blocks
    let codeMatch: RegExpExecArray | null;
    while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
      const lang = codeMatch[1];
      const snippet = codeMatch[2];

      if (lang === 'bash' || lang === 'sh' || lang === 'powershell') {
        const lines = snippet.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          commandSnippetCount++;

          // Syntax sanity check: quotes balance
          const singleQuotes = (trimmed.match(/'/g) || []).length;
          const doubleQuotes = (trimmed.match(/"/g) || []).length;

          if (singleQuotes % 2 !== 0) {
            errors.push(`Unbalanced single quotes in command snippet in ${path.relative(workspaceRoot, filePath)}: ${trimmed}`);
          }
          if (doubleQuotes % 2 !== 0) {
            errors.push(`Unbalanced double quotes in command snippet in ${path.relative(workspaceRoot, filePath)}: ${trimmed}`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    docCount: mdFiles.length,
    linkCount,
    commandSnippetCount,
    errors,
  };
}

if (import.meta.main) {
  const result = checkDocs();
  console.log(`Documentation Check: scanned ${result.docCount} docs, ${result.linkCount} relative links, ${result.commandSnippetCount} command snippets.`);
  if (!result.valid) {
    console.error(`Found ${result.errors.length} errors:`);
    for (const err of result.errors) {
      console.error(` - ${err}`);
    }
    process.exit(1);
  } else {
    console.log('All documentation links and snippets are valid.');
    process.exit(0);
  }
}
