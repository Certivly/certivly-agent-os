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

  it('dispatches /todos to toggle_todos action', () => {
    const res = CommandDispatcher.dispatch('/todos');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('todos');
    expect(res.action).toBe('toggle_todos');
  });

  it('dispatches /librarian with repoUrl to librarian action', () => {
    const res = CommandDispatcher.dispatch('/librarian https://github.com/owner/repo inspect auth');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('librarian');
    expect(res.action).toBe('librarian');
    expect(res.payload?.repoUrl).toBe('https://github.com/owner/repo');
    expect(res.payload?.question).toBe('inspect auth');
  });

  it('dispatches /clear to clear action', () => {
    const res = CommandDispatcher.dispatch('/clear');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('clear');
    expect(res.action).toBe('clear');
  });

  it('searches and filters slash commands dynamically', () => {
    const all = CommandDispatcher.getAvailableCommands();
    expect(all.length).toBeGreaterThanOrEqual(10);

    const planMatches = CommandDispatcher.searchCommands('plan');
    expect(planMatches.some(c => c.name === 'plan')).toBe(true);

    const mcpMatches = CommandDispatcher.searchCommands('/mcp');
    expect(mcpMatches.some(c => c.name === 'mcp')).toBe(true);
  });

  it('handles /help and returns command list', () => {
    const res = CommandDispatcher.dispatch('/help');
    expect(res.isCommand).toBe(true);
    expect(res.action).toBe('help');
    expect(res.message).toContain('/plan');
    expect(res.message).toContain('/build');
    expect(res.message).toContain('/diff');
    expect(res.message).toContain('/todos');
    expect(res.message).toContain('/bugfix');
  });

  it('dispatches /bugfix with target to bugfix action', () => {
    const res = CommandDispatcher.dispatch('/bugfix tests/math.test.ts');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('bugfix');
    expect(res.action).toBe('bugfix');
    expect(res.payload?.target).toBe('tests/math.test.ts');
  });

  it('dispatches /undo and /revert to undo action', () => {
    const resUndo = CommandDispatcher.dispatch('/undo');
    expect(resUndo.isCommand).toBe(true);
    expect(resUndo.command).toBe('undo');
    expect(resUndo.action).toBe('undo');

    const resRevert = CommandDispatcher.dispatch('/revert snap_123');
    expect(resRevert.isCommand).toBe(true);
    expect(resRevert.command).toBe('revert');
    expect(resRevert.action).toBe('undo');
    expect(resRevert.payload?.targetId).toBe('snap_123');
  });

  it('dispatches /snapshots to snapshots action', () => {
    const res = CommandDispatcher.dispatch('/snapshots');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('snapshots');
    expect(res.action).toBe('snapshots');
  });

  it('dispatches /research with query to research action', () => {
    const res = CommandDispatcher.dispatch('/research Bun 1.1 terminal shell capabilities');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('research');
    expect(res.action).toBe('research');
    expect(res.payload?.query).toBe('Bun 1.1 terminal shell capabilities');
    expect(res.message).toContain('Deep Research');
  });

  it('dispatches /team deep-research to team action', () => {
    const res = CommandDispatcher.dispatch('/team deep-research React 19 compiler changes');
    expect(res.isCommand).toBe(true);
    expect(res.command).toBe('team');
    expect(res.action).toBe('team');
    expect(res.payload?.workflow).toBe('deep-research');
    expect(res.payload?.goal).toBe('React 19 compiler changes');
  });
});
