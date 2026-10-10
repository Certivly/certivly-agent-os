import React, { useState, useRef, useEffect } from 'react';

interface TerminalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  workspaceRoot: string;
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({
  isOpen,
  onClose,
  serverUrl,
  workspaceRoot,
}) => {
  const [history, setHistory] = useState<{ cmd: string; out: string; err?: string; code?: number }[]>([
    { cmd: 'agentos --version', out: 'AgentOS v1.0.0 (High Performance Runtime)' },
  ]);
  const [inputCmd, setInputCmd] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, history]);

  const handleRunCommand = async (cmdToRun: string) => {
    const cmd = cmdToRun.trim();
    if (!cmd || isRunning) return;
    setIsRunning(true);
    setInputCmd('');

    try {
      const res = await fetch(`${serverUrl}/api/terminal/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      setHistory((prev) => [
        ...prev,
        {
          cmd,
          out: data.stdout || '',
          err: data.stderr || (data.success ? '' : 'Command failed'),
          code: data.exitCode,
        },
      ]);
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        { cmd, out: '', err: err.message || 'Execution failed', code: 1 },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  const quickCmds = ['bun test', 'git status', 'git diff', 'bun run build'];

  return (
    <div
      style={{
        height: '260px',
        backgroundColor: '#070a13',
        borderTop: '1px solid rgba(99, 102, 241, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.6)',
      }}
    >
      {/* Terminal Titlebar */}
      <div
        style={{
          padding: '6px 14px',
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px' }}>💻</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', textTransform: 'uppercase' }}>
            Terminal Console
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>•</span>
          <code style={{ fontSize: '10px', color: '#94a3b8' }}>{workspaceRoot}</code>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {quickCmds.map((qc) => (
            <button
              key={qc}
              onClick={() => handleRunCommand(qc)}
              disabled={isRunning}
              style={{
                padding: '2px 8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                color: '#94a3b8',
                fontSize: '10px',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              {qc}
            </button>
          ))}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Terminal Output Stream */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 14px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '12px',
          color: '#cbd5e1',
          lineHeight: '1.5',
        }}
      >
        {history.map((h, i) => (
          <div key={i} style={{ marginBottom: '8px' }}>
            <div style={{ color: '#06b6d4', fontWeight: 600 }}>$ {h.cmd}</div>
            {h.out && <pre style={{ color: '#f8fafc', whiteSpace: 'pre-wrap', margin: '2px 0' }}>{h.out}</pre>}
            {h.err && <pre style={{ color: '#f87171', whiteSpace: 'pre-wrap', margin: '2px 0' }}>{h.err}</pre>}
          </div>
        ))}
        {isRunning && (
          <div style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚡</span>
            <span>Running command...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Terminal Input Line */}
      <div
        style={{
          padding: '6px 14px',
          backgroundColor: 'rgba(11, 15, 25, 0.9)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontFamily: 'monospace',
        }}
      >
        <span style={{ color: '#10b981', fontWeight: 600 }}>agent-os$</span>
        <input
          type="text"
          placeholder="Enter command to run in workspace..."
          value={inputCmd}
          onChange={(e) => setInputCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRunCommand(inputCmd);
          }}
          disabled={isRunning}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f8fafc',
            fontFamily: 'inherit',
            fontSize: '12px',
          }}
        />
      </div>
    </div>
  );
};
