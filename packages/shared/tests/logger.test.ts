import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import { JsonLogger, logger, LogLevel } from '../src/logger';

describe('JsonLogger', () => {
  afterEach(() => {
    // Restore any mocks
  });

  it('should log info messages to stdout', () => {
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test-comp', 'test.event', 'test info', { foo: 'bar' });
    
    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logCall);
    
    expect(parsed.severity).toBe(LogLevel.INFO);
    expect(parsed.message).toBe('test info');
    expect(parsed.meta.foo).toBe('bar');
    expect(parsed.component).toBe('test-comp');
    expect(parsed.eventType).toBe('test.event');
    expect(parsed.timestamp).toBeDefined();
    
    consoleSpy.mockRestore();
  });

  it('should log error messages to stderr', () => {
    const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});
    logger.error('test-comp', 'test.error', 'test error', { code: 500 });
    
    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logCall);
    
    expect(parsed.severity).toBe(LogLevel.ERROR);
    expect(parsed.message).toBe('test error');
    expect(parsed.meta.code).toBe(500);
    
    consoleSpy.mockRestore();
  });
  
  it('should handle missing meta gracefully', () => {
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    logger.debug('test-comp', 'test.debug', 'just a debug');
    
    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logCall);
    
    expect(parsed.message).toBe('just a debug');
    expect(parsed.severity).toBe(LogLevel.DEBUG);
    expect(parsed.meta).toBeUndefined();
    
    consoleSpy.mockRestore();
  });
});
