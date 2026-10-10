import React, { useState } from 'react';

export interface ToolCallData {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
  status: 'running' | 'success' | 'error';
  durationMs?: number;
}

interface ToolExecutionCardProps {
  tool: ToolCallData;
}

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({ tool }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getIcon = (name: string) => {
    switch (name) {
      case 'read_file': return '📖';
      case 'edit_file':
      case 'write_file':
      case 'apply_patch': return '✏️';
      case 'run_command': return '💻';
      case 'web_search': return '🔍';
      case 'delegate_subagent': return '🤖';
      default: return '⚡';
    }
  };

  const getArgsSummary = () => {
    if (!tool.args) return '';
    if (tool.args.path) return String(tool.args.path);
    if (tool.args.command) return String(tool.args.command);
    if (tool.args.query) return `"${String(tool.args.query)}"`;
    if (tool.args.task) return `"${String(tool.args.task)}"`;
    return JSON.stringify(tool.args);
  };

  return (
    <div
      style={{
        margin: '6px 0',
        borderRadius: '8px',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        fontSize: '12px',
      }}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          cursor: 'pointer',
          backgroundColor: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{getIcon(tool.name)}</span>
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{tool.name}</span>
          <span
            style={{
              color: '#94a3b8',
              fontFamily: 'monospace',
              fontSize: '11px',
              maxWidth: '380px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {getArgsSummary()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {tool.durationMs !== undefined && (
            <span style={{ fontSize: '10px', color: '#64748b' }}>{tool.durationMs}ms</span>
          )}
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor:
                tool.status === 'success'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : tool.status === 'error'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(245, 158, 11, 0.15)',
              color:
                tool.status === 'success'
                  ? '#34d399'
                  : tool.status === 'error'
                  ? '#f87171'
                  : '#fbbf24',
            }}
          >
            {tool.status.toUpperCase()}
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {isExpanded && (
        <div
          style={{
            padding: '10px 12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            backgroundColor: 'rgba(3, 7, 18, 0.5)',
            fontFamily: 'monospace',
            fontSize: '11px',
            overflowX: 'auto',
          }}
        >
          <div style={{ color: '#94a3b8', marginBottom: '6px' }}>Arguments:</div>
          <pre style={{ color: '#cbd5e1', marginBottom: '10px' }}>
            {JSON.stringify(tool.args, null, 2)}
          </pre>

          {tool.result !== undefined && (
            <>
              <div style={{ color: '#94a3b8', marginBottom: '6px' }}>Result / Output:</div>
              <pre
                style={{
                  color: '#e2e8f0',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {typeof tool.result === 'string'
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
};
