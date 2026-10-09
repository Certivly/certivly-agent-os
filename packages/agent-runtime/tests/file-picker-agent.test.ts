import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FilePickerAgent } from '../src/exploration/FilePickerAgent';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('FilePickerAgent (Phase 1)', () => {
  it('discovers and ranks candidate files using cheap model response', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filepicker-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'jwt.ts'), 'export function verifyJwt() {}');
    fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'middleware.ts'), 'export function authMiddleware() {}');
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const main = 1;');

    const mockModel: Model = {
      id: 'fast-model',
      generate: async (req: GenerationRequest): Promise<GenerationResponse> => {
        return {
          text: JSON.stringify({
            candidates: [
              {
                path: 'src/auth/jwt.ts',
                relevanceScore: 0.98,
                reason: 'Handles token signature validation and expiration',
                suggestedAction: 'edit',
              },
              {
                path: 'src/auth/middleware.ts',
                relevanceScore: 0.85,
                reason: 'Intercepts incoming HTTP requests',
                suggestedAction: 'read_context',
              },
            ],
            summary: 'JWT Authentication subsystem',
          }),
          usage: { inputTokens: 120, outputTokens: 60 },
        };
      },
    };

    try {
      const picker = new FilePickerAgent(mockModel, tmpDir);
      const result = await picker.discoverRelevantFiles('Fix JWT token expiration bug');

      expect(result.candidates.length).toBe(2);
      expect(result.candidates[0].path).toBe('src/auth/jwt.ts');
      expect(result.candidates[0].relevanceScore).toBe(0.98);
      expect(result.candidates[1].path).toBe('src/auth/middleware.ts');
      expect(result.summary).toBe('JWT Authentication subsystem');
      expect(result.tokensUsed).toBe(180);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('falls back to heuristic keyword scoring when model returns invalid JSON', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filepicker-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'jwt.ts'), 'export function verifyJwt() {}');
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const main = 1;');

    const mockModel: Model = {
      id: 'fast-model',
      generate: async (): Promise<GenerationResponse> => {
        return {
          text: 'I could not format the output properly.',
          usage: { inputTokens: 50, outputTokens: 10 },
        };
      },
    };

    try {
      const picker = new FilePickerAgent(mockModel, tmpDir);
      const result = await picker.discoverRelevantFiles('fix jwt auth');

      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0].path).toBe('src/auth/jwt.ts');
      expect(result.candidates[0].suggestedAction).toBe('edit');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
