import { describe, it, expect } from 'bun:test';
import { CommandDispatcher } from '../src/ui/commands/CommandDispatcher';

describe('CommandDispatcher (Phase 3)', () => {
  it('identifies non-command input properly', () => {
    expect(CommandDispatcher.isCommand('hello world')).toBe(false);
    expect(CommandDispatcher.dispatch('hello world').isCommand).toBe(false);
  });

  it('dispatches /plan with goal to plan mode action', () => {
    const res = CommandDispatcher.dispatch('/plan refactor auth flow');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('plan');
    expect(res.action).toBe('set_mode');
    expect(res.payload?.mode).toBe('plan');
    expect(res.payload?.goal).toBe('refactor auth flow');
    expect(res.message).toContain('Plan Mode');
  });

  it('dispatches /build with goal to manual/build mode action', () => {
    const res = CommandDispatcher.dispatch('/build fix typo in readme');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('build');
    expect(res.action).toBe('set_mode');
    expect(res.payload?.mode).toBe('manual');
    expect(res.payload?.goal).toBe('fix typo in readme');
    expect(res.message).toContain('Build Mode');
  });

  it('dispatches /diff to toggle_diff action', () => {
    const res = CommandDispatcher.dispatch('/diff');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('diff');
    expect(res.action).toBe('toggle_diff');
  });

  it('dispatches /compact to compact action', () => {
    const res = CommandDispatcher.dispatch('/compact');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('compact');
    expect(res.action).toBe('compact');
  });

  it('dispatches /model with modelId to set_model action', () => {
    const res = CommandDispatcher.dispatch('/model claude-3-5-sonnet');
    expect(res.isCommand).toBe(true);
    expect(res.action).toBe('set_model');
    expect(res.payload?.modelId).toBe('claude-3-5-sonnet');
  });

  it('handles /help and returns command list', () => {
    const res = CommandDispatcher.dispatch('/help');
    expect(res.isCommand).toBe(true);
    expect(res.action).toBe('help');
    expect(res.message).toContain('/plan');
    expect(res.message).toContain('/build');
    expect(res.message).toContain('/diff');
  });
});
