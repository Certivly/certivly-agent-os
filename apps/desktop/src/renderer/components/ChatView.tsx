import React, { useEffect, useRef } from 'react';
import { ToolExecutionCard, ToolCallData } from './ToolExecutionCard';
import { VisualDiffInspector, ApprovalItem } from './VisualDiffInspector';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  toolCalls?: ToolCallData[];
}

interface ChatViewProps {
  messages: ChatMessage[];
  streamingContent?: string;
  isStreaming: boolean;
  activeApprovals: ApprovalItem[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSelectSuggestion?: (prompt: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  streamingContent,
  isStreaming,
  activeApprovals,
  onApprove,
  onReject,
  onSelectSuggestion,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, activeApprovals]);

  const suggestions = [
    'Analyze workspace codebase and explain architectural patterns',
    'Run deep research on current dependencies and optimal configurations',
    'Audit repository for dead code, unused packages, and potential bugs',
    'Generate test coverage report and suggest missing test cases',
  ];

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {messages.length === 0 && !streamingContent && (
        <div
          style={{
            margin: 'auto',
            maxWidth: '600px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
              boxShadow: '0 0 25px rgba(99, 102, 241, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
            }}
          >
            ⚡
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
              AgentOS Desktop
            </h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.6' }}>
              Autonomous coding intelligence with key vault, permission gates, and visual diff reviews.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginTop: '8px' }}>
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSuggestion?.(s)}
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  lineHeight: '1.4',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = '#cbd5e1';
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Render Historic Messages */}
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start',
              width: '100%',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: isUser ? '10px 16px' : '14px 18px',
                borderRadius: '12px',
                backgroundColor: isUser ? '#6366f1' : 'rgba(15, 23, 42, 0.75)',
                border: isUser ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                color: '#f8fafc',
                fontSize: '13px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                boxShadow: isUser ? '0 0 15px rgba(99, 102, 241, 0.3)' : 'none',
              }}
            >
              {msg.content}

              {/* Tool Execution Cards inside message */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {msg.toolCalls.map((t) => (
                    <ToolExecutionCard key={t.id} tool={t} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Live Streaming Content with Glowing Cursor */}
      {isStreaming && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
          <div
            style={{
              maxWidth: '85%',
              padding: '14px 18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.15)',
              color: '#f8fafc',
              fontSize: '13px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
            }}
          >
            {streamingContent || 'AgentOS is thinking...'}
            <span className="pulsing-cursor" />
          </div>
        </div>
      )}

      {/* Active Diff Approval Modals/Cards */}
      {activeApprovals.map((appr) => (
        <VisualDiffInspector
          key={appr.id}
          approval={appr}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}

      <div ref={bottomRef} />
    </div>
  );
};
