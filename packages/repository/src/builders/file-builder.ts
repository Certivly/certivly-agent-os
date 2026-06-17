import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { FileNode } from '../models';

export class FileGraphBuilder {
  public buildFileNode(absolutePath: string, rootDir: string): FileNode | null {
    try {
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) return null;

      const content = fs.readFileSync(absolutePath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const ext = path.extname(absolutePath).toLowerCase();
      
      let language = 'unknown';
      if (ext === '.ts' || ext === '.tsx') language = 'typescript';
      else if (ext === '.js' || ext === '.jsx') language = 'javascript';
      else if (ext === '.json') language = 'json';
      else if (ext === '.md') language = 'markdown';

      const fileNode: FileNode = {
        fileId: absolutePath,
        path: path.relative(rootDir, absolutePath).replace(/\\/g, '/'),
        extension: ext,
        language,
        size: stats.size,
        hash,
        lastModified: stats.mtimeMs,
        parentDirectory: path.dirname(absolutePath),
        imports: [] // Will be populated by DependencyGraphBuilder
      };

      return fileNode;
    } catch (e) {
      console.error(`Failed to process file ${absolutePath}`, e);
      return null;
    }
  }

  public scanDirectory(dir: string, rootDir: string, ignorePatterns: string[] = ['node_modules', '.git', 'dist']): FileNode[] {
    const results: FileNode[] = [];
    
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (ignorePatterns.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        results.push(...this.scanDirectory(fullPath, rootDir, ignorePatterns));
      } else if (entry.isFile()) {
        const node = this.buildFileNode(fullPath, rootDir);
        if (node) results.push(node);
      }
    }

    return results;
  }
}
