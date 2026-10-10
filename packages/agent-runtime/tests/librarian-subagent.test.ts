import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LibrarianSubagent } from '../src/exploration/LibrarianSubagent';
import type { Model } from '@agent-os/providers';

describe('LibrarianSubagent (Freebuff External Repo Exploration Pattern)', () => {
  const tmpScratch = path.join(os.tmpdir(), `test-librarian-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  const mockModel: Model = {
    id: 'mock-model',
    generate: async () => ({ text: 'The repository exports a client class.' }),
    stream: async function* () {
      yield { type: 'text_delta', text: '' };
    },
  };

  beforeEach(() => {
    fs.mkdirSync(tmpScratch, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpScratch)) {
      fs.rmSync(tmpScratch, { recursive: true, force: true });
    }
  });

  it('1. validates safe repository URLs and rejects shell injections and unsafe protocols', () => {
    const librarian = new LibrarianSubagent(mockModel, tmpScratch);

    expect(librarian.validateRepoUrl('https://github.com/anomalyco/opencode')).toBe(true);
    expect(librarian.validateRepoUrl('https://github.com/facebook/react.git')).toBe(true);

    // Rejections
    expect(librarian.validateRepoUrl('http://insecure.com/repo')).toBe(false);
    expect(librarian.validateRepoUrl('file:///etc/passwd')).toBe(false);
    expect(librarian.validateRepoUrl('https://github.com/owner/repo; rm -rf /')).toBe(false);
    expect(librarian.validateRepoUrl('https://github.com/owner/repo && echo pwned')).toBe(false);
    expect(librarian.validateRepoUrl('https://github.com/owner/repo | cat')).toBe(false);
  });

  it('2. throws immediately on invalid repository URL before spawning git', async () => {
    const librarian = new LibrarianSubagent(mockModel, tmpScratch);

    expect(
      librarian.investigate({
        repoUrl: 'file:///local/path',
        question: 'How does it work?',
      })
    ).rejects.toThrow(/Invalid or disallowed repository URL/);
  });

  it('3. cleans up ephemeral cloned directories on completion or demand', async () => {
    const librarian = new LibrarianSubagent(mockModel, tmpScratch);
    const testDir = path.join(tmpScratch, 'sample-clone-123');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Sample');

    expect(fs.existsSync(testDir)).toBe(true);
    await librarian.cleanup(testDir);
    expect(fs.existsSync(testDir)).toBe(false);
  });
});
