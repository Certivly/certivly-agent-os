import { test, expect } from 'bun:test';
import { InputParser } from '../src/cli/InputParser';

test('InputParser parses chat message correctly', () => {
  const parsed = InputParser.parse('Hello world');
  expect(parsed.isCommand).toBe(false);
  expect(parsed.raw).toBe('Hello world');
});

test('InputParser parses simple command correctly', () => {
  const parsed = InputParser.parse('/skills');
  expect(parsed.isCommand).toBe(true);
  expect(parsed.command).toBe('skills');
});

test('InputParser parses command with positional args and kwargs', () => {
  const parsed = InputParser.parse('/trace session=abc123 depth=5 verbose=true targetFile');
  expect(parsed.isCommand).toBe(true);
  expect(parsed.command).toBe('trace');
  expect(parsed.args?.session).toBe('abc123');
  expect(parsed.args?.depth).toBe(5);
  expect(parsed.args?.verbose).toBe(true);
  expect(parsed.positional).toContain('targetFile');
});
