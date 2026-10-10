import { describe, it, expect } from 'bun:test';
import {
  stdlib,
  ToolError,
  ToolNotFoundError,
  ToolValidationError,
  ToolTimeoutError,
  SandboxValues,
  ConsoleUtils,
  NumberUtils,
  ObjectUtils,
  RegExpUtils,
} from '../src';

describe('CodeMode Extended Suite', () => {
  describe('ConsoleUtils', () => {
    it('captures structured log entries and formats output', () => {
      const consoleMock = new ConsoleUtils();
      consoleMock.log('hello', { id: 1 });
      consoleMock.warn('warning message');
      consoleMock.error('fatal error');

      const logs = consoleMock.getLogs();
      expect(logs.length).toBe(3);
      expect(logs[0].level).toBe('log');
      expect(logs[1].level).toBe('warn');
      expect(logs[2].level).toBe('error');

      const text = consoleMock.formatOutput();
      expect(text).toContain('[LOG] hello {"id":1}');
      expect(text).toContain('[WARN] warning message');
      expect(text).toContain('[ERROR] fatal error');
    });
  });

  describe('NumberUtils', () => {
    it('clamps, rounds, formats bytes and currency', () => {
      expect(NumberUtils.clamp(15, 0, 10)).toBe(10);
      expect(NumberUtils.clamp(-5, 0, 10)).toBe(0);
      expect(NumberUtils.round(3.14159, 2)).toBe(3.14);
      expect(NumberUtils.formatBytes(1024)).toBe('1 KB');
      expect(NumberUtils.formatBytes(1048576)).toBe('1 MB');
      expect(NumberUtils.formatCurrency(49.99)).toContain('49.99');
    });
  });

  describe('ObjectUtils', () => {
    it('deep clones, merges, picks, and omits with prototype protection', () => {
      const original = { a: 1, b: { c: 2, d: 3 }, e: 'test' };
      const cloned = ObjectUtils.deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned.b).not.toBe(original.b);

      const merged = ObjectUtils.deepMerge({ x: 1, y: { z: 2 } }, { y: { w: 3 } });
      expect(merged).toEqual({ x: 1, y: { z: 2, w: 3 } });

      const picked = ObjectUtils.pick(original, ['a', 'e']);
      expect(picked).toEqual({ a: 1, e: 'test' });

      const omitted = ObjectUtils.omit(original, ['b']);
      expect(omitted).toEqual({ a: 1, e: 'test' });

      expect(ObjectUtils.get(original, 'b.c')).toBe(2);
      expect(ObjectUtils.get(original, 'b.missing', 'defaultVal')).toBe('defaultVal');

      // Prototype pollution block
      const polluted = ObjectUtils.get(original, '__proto__.polluted');
      expect(polluted).toBeUndefined();
    });
  });

  describe('RegExpUtils', () => {
    it('escapes special characters and safely tests patterns', () => {
      const escaped = RegExpUtils.escape('hello.*+?^${}()|[]\\world');
      expect(escaped).toBe('hello\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\world');

      expect(RegExpUtils.isValid('^valid[0-9]+$')).toBe(true);
      expect(RegExpUtils.isValid('[unclosed')).toBe(false);

      expect(RegExpUtils.test('^[a-z]+$', 'abc')).toBe(true);
      expect(RegExpUtils.test('^[a-z]+$', '123')).toBe(false);
    });

    it('asynchronously replaces matches', async () => {
      const text = 'foo 10 bar 20';
      const result = await RegExpUtils.replaceAsync(text, /\d+/g, async (match) => {
        return String(Number(match) * 2);
      });
      expect(result).toBe('foo 20 bar 40');
    });
  });

  describe('ToolError Hierarchy', () => {
    it('serializes errors cleanly with error codes and diagnostics', () => {
      const notFound = new ToolNotFoundError('read_file');
      expect(notFound.code).toBe('TOOL_NOT_FOUND');
      expect(notFound.toolName).toBe('read_file');
      expect(notFound.toJSON().code).toBe('TOOL_NOT_FOUND');

      const validationErr = new ToolValidationError('edit_file', ['Missing path argument']);
      expect(validationErr.code).toBe('TOOL_VALIDATION_ERROR');
      expect(validationErr.details.issues).toEqual(['Missing path argument']);

      const timeoutErr = new ToolTimeoutError('bash', 5000);
      expect(timeoutErr.code).toBe('TOOL_TIMEOUT');
    });
  });

  describe('SandboxValues', () => {
    it('safely serializes circular references and functions', () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      const serialized = SandboxValues.serialize(circular);
      expect(serialized.a).toBe(1);
      expect(serialized.self).toBe('[Circular Reference]');
    });

    it('formats values as JSON string', () => {
      const out = SandboxValues.format({ key: 'val' });
      expect(out).toContain('"key": "val"');
    });
  });
});
