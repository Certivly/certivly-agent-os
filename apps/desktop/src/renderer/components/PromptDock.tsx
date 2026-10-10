import React, { useState, useRef, useEffect } from 'react';

interface PromptDockProps {
  onSend: (prompt: string) => void;
  onCancel?: () => void;
  isRunning: boolean;
  activeMode: string;
}

export const PromptDock: React.FC<PromptDockProps> = ({
  onSend,
  onCancel,
  isRunning,
  activeMode,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!text.trim() || isRunning) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const quickChips = [
    { label: '/review', prompt: 'Review recent changes and run code quality audit' },
    { label: '/research', prompt: 'Run autonomous deep research on: ' },
    { label: '/plan', prompt: 'Draft a step-by-step implementation plan for: ' },
    { label: '/doctor', prompt: 'Run AgentOS health diagnostics and provider checks' },
  ];

  return (
    <div
      style={{
        padding: '12px 24px 20px',
        backgroundColor: 'rgba(7, 9, 14, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Quick Action Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>QUICK:</span>
        {quickChips.map((chip) => (
          <button
            key={chip.label}
            onClick={() => setText(chip.prompt)}
            style={{
              padding: '2px 8px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              color: '#94a3b8',
              fontSize: '11px',
              fontFamily: 'monospace',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
              e.currentTarget.style.color = '#a5b4fc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Input Box Container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={`Instruct AgentOS (${activeMode.toUpperCase()} mode)... [Press Enter to send, Shift+Enter for newline]`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f8fafc',
            fontSize: '13px',
            resize: 'none',
            lineHeight: '1.5',
            maxHeight: '180px',
            fontFamily: 'inherit',
          }}
        />

        {isRunning ? (
          <button
            onClick={onCancel}
            title="Stop Generation"
            style={{
              padding: '6px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>⏹</span>
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: text.trim() ? '#6366f1' : 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '8px',
              color: text.trim() ? '#ffffff' : '#64748b',
              fontSize: '13px',
              fontWeight: 600,
              cursor: text.trim() ? 'pointer' : 'default',
              boxShadow: text.trim() ? '0 0 15px rgba(99, 102, 241, 0.4)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
};
