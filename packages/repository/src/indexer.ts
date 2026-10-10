import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventStore } from '@agent-os/events';
import { metrics } from '@agent-os/metrics';
import { SymbolExtractor } from './builders/symbol-builder';
import { DependencyGraphBuilder } from './builders/dependency-builder';
import { CallGraphBuilder } from './builders/call-builder';
import { RepositoryGraphSnapshot, FileNode, SymbolNode, DependencyEdge, CallEdge } from './models';
import { ParserRegistry } from '@agent-os/parser';

export const DEFAULT_SKIP_DIRS = ['.git', 'node_modules', '.agentos', 'dist', 'build', '.idea'];
export const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

export interface FileIndexCacheRecord {
  path: string;
  hash: string;
  mtimeMs: number;
  size: number;
  fileNode: FileNode;
  symbols: SymbolNode[];
  dependencies: DependencyEdge[];
  calls: CallEdge[];
}

export interface IndexStats {
  totalFiles: number;
  parsedFiles: number;
  cachedFiles: number;
  durationMs: number;
}

export function isBinaryFile(filePath: string, buffer?: Buffer): boolean {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.tiff',
    '.pdf', '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib', '.wasm', '.bin', '.dat',
    '.db', '.sqlite', '.sqlite3',
    '.mp3', '.mp4', '.avi', '.mov', '.wav',
    '.ttf', '.woff', '.woff2', '.eot',
  ];
  const ext = path.extname(filePath).toLowerCase();
  if (binaryExtensions.includes(ext)) {
    return true;
  }
  if (buffer) {
    const checkLength = Math.min(buffer.length, 512);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) return true;
    }
  }
  return false;
}

export function parseGitignore(rootDir: string): (relPath: string) => boolean {
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return () => false;
  }
  const content = fs.readFileSync(gitignorePath, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  const patterns = lines.map(rule => {
    let pat = rule.replace(/\\/g, '/');
    if (pat.endsWith('/')) {
      pat = pat.slice(0, -1);
    }
    return pat;
  });

  return (relPath: string) => {
    const normalized = relPath.replace(/\\/g, '/');
    const segments = normalized.split('/');
    for (const pat of patterns) {
      if (segments.includes(pat) || normalized === pat || normalized.startsWith(pat + '/')) {
        return true;
      }
      if (pat.startsWith('*.')) {
        const ext = pat.slice(1);
        if (normalized.endsWith(ext)) return true;
      }
    }
    return false;
  };
}

export class RepositoryIndexer {
  private symbolExtractor = new SymbolExtractor();
  private dependencyBuilder = new DependencyGraphBuilder();
  private callBuilder = new CallGraphBuilder();
  private parserRegistry = new ParserRegistry();
  private parserInitialized = false;

  public lastIndexStats?: IndexStats;

  constructor(private eventStore: EventStore) {}

  private async ensureParserInitialized(): Promise<void> {
    if (!this.parserInitialized) {
      await this.parserRegistry.initialize();
      this.parserInitialized = true;
    }
  }

  public async indexRepository(rootDir: string): Promise<RepositoryGraphSnapshot> {
    const startMs = performance.now();
    const resolvedRoot = path.resolve(rootDir);

    // Initialize parser registry ONCE per indexer instance
    await this.ensureParserInitialized();

    // 1. Load cache from .agentos/index/cache.json
    const cacheDir = path.join(resolvedRoot, '.agentos', 'index');
    const cacheFile = path.join(cacheDir, 'cache.json');
    let cache: Record<string, FileIndexCacheRecord> = {};
    if (fs.existsSync(cacheFile)) {
      try {
        cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch (_err: unknown) {
        cache = {};
      }
    }

    const nextCache: Record<string, FileIndexCacheRecord> = {};
    const isIgnored = parseGitignore(resolvedRoot);

    // 2. Scan workspace files respecting ignore rules
    const candidateFiles: string[] = [];
    const scanDir = (currentDir: string) => {
      if (!fs.existsSync(currentDir)) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (DEFAULT_SKIP_DIRS.includes(entry.name)) continue;

        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(resolvedRoot, fullPath).replace(/\\/g, '/');

        if (isIgnored(relPath)) continue;

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          candidateFiles.push(fullPath);
        }
      }
    };

    scanDir(resolvedRoot);

    const filesMap = new Map<string, FileNode>();
    const symbolsMap = new Map<string, SymbolNode>();
    const fileSymbolsMap = new Map<string, string[]>();
    const allDependencies: DependencyEdge[] = [];
    const allCalls: CallEdge[] = [];

    let parsedFilesCount = 0;
    let cachedFilesCount = 0;

    // 3. Process candidate files
    for (const fullPath of candidateFiles) {
      const relPath = path.relative(resolvedRoot, fullPath).replace(/\\/g, '/');
      const stats = fs.statSync(fullPath);

      // Skip large files (> 1MB)
      if (stats.size > MAX_FILE_SIZE) {
        continue;
      }

      // Check binary extension before reading
      if (isBinaryFile(fullPath)) {
        continue;
      }

      const cachedRecord = cache[relPath];
      let useCache = false;

      // Quick mtime & size check
      if (cachedRecord && cachedRecord.mtimeMs === stats.mtimeMs && cachedRecord.size === stats.size) {
        useCache = true;
      }

      if (useCache && cachedRecord) {
        // Cache HIT: Reuse cached symbols, dependencies, and calls without re-reading or re-parsing
        cachedFilesCount++;
        filesMap.set(cachedRecord.fileNode.fileId, cachedRecord.fileNode);

        const symbolIds: string[] = [];
        for (const s of cachedRecord.symbols) {
          symbolsMap.set(s.symbolId, s);
          symbolIds.push(s.symbolId);
        }
        fileSymbolsMap.set(cachedRecord.fileNode.fileId, symbolIds);

        allDependencies.push(...cachedRecord.dependencies);
        allCalls.push(...cachedRecord.calls);

        nextCache[relPath] = cachedRecord;
      } else {
        // Cache MISS: Read file content ONCE
        const fileBuffer = fs.readFileSync(fullPath);
        if (isBinaryFile(fullPath, fileBuffer)) {
          continue;
        }

        const sourceCode = fileBuffer.toString('utf8');
        const hash = crypto.createHash('sha256').update(sourceCode).digest('hex');

        // Check if content hash matches cached record (e.g. touched timestamp without content change)
        if (cachedRecord && cachedRecord.hash === hash) {
          cachedFilesCount++;
          cachedRecord.mtimeMs = stats.mtimeMs;
          filesMap.set(cachedRecord.fileNode.fileId, cachedRecord.fileNode);

          const symbolIds: string[] = [];
          for (const s of cachedRecord.symbols) {
            symbolsMap.set(s.symbolId, s);
            symbolIds.push(s.symbolId);
          }
          fileSymbolsMap.set(cachedRecord.fileNode.fileId, symbolIds);

          allDependencies.push(...cachedRecord.dependencies);
          allCalls.push(...cachedRecord.calls);

          nextCache[relPath] = cachedRecord;
          continue;
        }

        // Parse file
        parsedFilesCount++;
        const ext = path.extname(fullPath).toLowerCase();
        let language = 'unknown';
        if (ext === '.ts' || ext === '.tsx') language = 'typescript';
        else if (ext === '.js' || ext === '.jsx') language = 'javascript';
        else if (ext === '.py') language = 'python';
        else if (ext === '.go') language = 'go';
        else if (ext === '.rs') language = 'rust';
        else if (ext === '.json') language = 'json';
        else if (ext === '.md') language = 'markdown';

        const fileNode: FileNode = {
          fileId: fullPath,
          path: relPath,
          extension: ext,
          language,
          size: stats.size,
          hash,
          lastModified: stats.mtimeMs,
          parentDirectory: path.dirname(fullPath),
          imports: [],
        };
        filesMap.set(fullPath, fileNode);

        const parsedAst = this.parserRegistry.parseFile(fullPath, sourceCode);
        let extractedSymbols: SymbolNode[] = [];
        let extractedDeps: DependencyEdge[] = [];
        let extractedCalls: CallEdge[] = [];

        if (parsedAst) {
          extractedSymbols = this.symbolExtractor.extractSymbols(parsedAst, fullPath);
          extractedDeps = this.dependencyBuilder.extractDependencies(parsedAst, fullPath);
          extractedCalls = this.callBuilder.extractCallEdges(parsedAst, fullPath);
        }

        fileSymbolsMap.set(fullPath, extractedSymbols.map(s => s.symbolId));
        for (const s of extractedSymbols) {
          symbolsMap.set(s.symbolId, s);
        }
        allDependencies.push(...extractedDeps);
        allCalls.push(...extractedCalls);

        nextCache[relPath] = {
          path: relPath,
          hash,
          mtimeMs: stats.mtimeMs,
          size: stats.size,
          fileNode,
          symbols: extractedSymbols,
          dependencies: extractedDeps,
          calls: extractedCalls,
        };
      }
    }

    // 4. Save updated cache to disk
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(nextCache, null, 2), 'utf8');

    const duration = performance.now() - startMs;
    this.lastIndexStats = {
      totalFiles: filesMap.size,
      parsedFiles: parsedFilesCount,
      cachedFiles: cachedFilesCount,
      durationMs: duration,
    };

    // 5. Emit one summary event per batch
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'repository.index.summary',
      timestamp: new Date().toISOString(),
      requestId: 'internal',
      sessionId: 'internal',
      source: 'repository',
      payload: {
        rootDir: resolvedRoot,
        totalFiles: filesMap.size,
        parsedFiles: parsedFilesCount,
        cachedFiles: cachedFilesCount,
        durationMs: duration,
      },
      version: '1.0',
    });

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      files: filesMap,
      symbols: symbolsMap,
      dependencies: allDependencies,
      calls: allCalls,
      fileSymbols: fileSymbolsMap,
      symbolDefinitions: symbolsMap,
    };
  }
}
