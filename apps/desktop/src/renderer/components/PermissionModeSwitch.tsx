import React from 'react';

export type PermissionMode = 'plan' | 'manual' | 'auto';

interface PermissionModeSwitchProps {
  mode: PermissionMode;
  onChangeMode: (mode: PermissionMode) => void;
}

export const PermissionModeSwitch: React.FC<PermissionModeSwitchProps> = ({
  mode,
  onChangeMode,
}) => {
  const modes: { id: PermissionMode; label: string; icon: string; desc: string; color: string }[] = [
    { id: 'plan', label: 'Plan', icon: '📝', desc: 'Read-only exploration & plan drafting', color: '#60a5fa' },
    { id: 'manual', label: 'Manual', icon: '🛡️', desc: 'Interactive approval required for changes', color: '#f59e0b' },
    { id: 'auto', label: 'Auto', icon: '⚡', desc: 'Autonomous execution & verified edits', color: '#10b981' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '3px',
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        gap: '2px',
      }}
    >
      {modes.map((m) => {
        const isActive = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChangeMode(m.id)}
            title={m.desc}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: isActive ? '#f8fafc' : '#94a3b8',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: isActive ? `0 0 10px ${m.color}33` : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: '11px' }}>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
};
