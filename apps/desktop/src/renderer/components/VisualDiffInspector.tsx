import React from 'react';

export interface ApprovalItem {
  id: string;
  toolName: string;
  args: Record<string, any>;
  files?: string[];
  diff?: string;
  reason?: string;
}

interface VisualDiffInspectorProps {
  approval: ApprovalItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const VisualDiffInspector: React.FC<VisualDiffInspectorProps> = ({
  approval,
  onApprove,
  onReject,
}) => {
  const filePath = approval.files?.[0] || approval.args?.path || 'workspace change';

  const renderDiffLines = (diffText?: string) => {
    if (!diffText) return <div style={{ color: '#64748b' }}>No preview available</div>;
    const lines = diffText.split('\n');
    return lines.map((line, idx) => {
      let bg = 'transparent';
      let color = '#cbd5e1';
      if (line.startsWith('+') && !line.startsWith('+++')) {
        bg = 'rgba(16, 185, 129, 0.15)';
        color = '#34d399';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        bg = 'rgba(239, 68, 68, 0.15)';
        color = '#f87171';
      } else if (line.startsWith('@@')) {
        color = '#06b6d4';
      }

      return (
        <div
          key={idx}
          style={{
            backgroundColor: bg,
            color,
            padding: '1px 8px',
            whiteSpace: 'pre',
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: '1.4',
          }}
        >
          {line}
        </div>
      );
    });
  };

  return (
    <div
      style={{
        margin: '12px 0',
        borderRadius: '10px',
        backgroundColor: '#0a0e1a',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        boxShadow: '0 0 20px rgba(245, 158, 11, 0.15)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>🛡️</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
            MANUAL APPROVAL REQUIRED
          </span>
          <span style={{ color: '#64748b' }}>•</span>
          <code style={{ fontSize: '12px', color: '#f8fafc' }}>{filePath}</code>
        </div>
        <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>
          {approval.toolName}
        </span>
      </div>

      {/* Diff Box */}
      <div
        style={{
          maxHeight: '260px',
          overflowY: 'auto',
          backgroundColor: 'rgba(3, 7, 18, 0.7)',
          padding: '6px 0',
        }}
      >
        {renderDiffLines(approval.diff)}
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
        }}
      >
        <button
          onClick={() => onReject(approval.id)}
          style={{
            padding: '6px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '6px',
            color: '#fca5a5',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reject Changes
        </button>
        <button
          onClick={() => onApprove(approval.id)}
          style={{
            padding: '6px 18px',
            backgroundColor: '#10b981',
            border: 'none',
            borderRadius: '6px',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)',
          }}
        >
          Approve & Apply
        </button>
      </div>
    </div>
  );
};
