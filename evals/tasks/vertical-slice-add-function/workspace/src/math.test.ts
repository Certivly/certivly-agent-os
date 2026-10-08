import { add } from './math';
import { describe, it, expect } from 'bun:test';

describe('math', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
