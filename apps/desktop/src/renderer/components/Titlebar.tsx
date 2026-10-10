import React, { useState, useEffect } from 'react';

interface TitlebarProps {
  workspaceRoot: string;
  onOpenDirectory: () => void;
  onOpenKeyVault: () => void;
  serverStatus: 'connected' | 'connecting' | 'disconnected';
  activeModel: string;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  workspaceRoot,
  onOpenDirectory,
  onOpenKeyVault,
  serverStatus,
  activeModel,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = Boolean(window.agentos);

  useEffect(() => {
    if (window.agentos?.isMaximized) {
      window.agentos.isMaximized().then(setIsMaximized).catch(() => {});
    }
  }, []);

  const handleMinimize = () => window.agentos?.windowMinimize();
  const handleMaximize = () => {
    window.agentos?.windowMaximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.agentos?.windowClose();

  const folderName = workspaceRoot ? workspaceRoot.split(/[/\\]/).filter(Boolean).pop() : 'No Workspace';

  return (
    <header
      style={
        {
          height: '42px',
          backgroundColor: '#07090e',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          userSelect: 'none',
          WebkitAppRegion: 'drag',
          position: 'relative',
          zIndex: 50,
        } as any
      }
    >
      {/* Left: Brand & Workspace Folder */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '5px',
              background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
              boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
            }}
          />
          <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px' }}>
            AGENT<span style={{ color: '#06b6d4' }}>OS</span>
          </span>
          <span
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              padding: '1px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              fontWeight: 600,
            }}
          >
            DESKTOP
          </span>
        </div>

        {/* Workspace Folder Pill */}
        <button
          onClick={onOpenDirectory}
          title={`Click to switch workspace: ${workspaceRoot}`}
          style={
            {
              WebkitAppRegion: 'no-drag',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#cbd5e1',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            } as any
          }
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')}
        >
          <span style={{ opacity: 0.6 }}>📁</span>
          <span style={{ fontWeight: 500, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folderName}
          </span>
        </button>
      </div>

      {/* Center: Active Model & Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            borderRadius: '12px',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11px',
            color: '#94a3b8',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: serverStatus === 'connected' ? '#10b981' : serverStatus === 'connecting' ? '#f59e0b' : '#ef4444',
              boxShadow: serverStatus === 'connected' ? '0 0 6px #10b981' : 'none',
            }}
          />
          <span>{serverStatus === 'connected' ? 'Core Ready' : serverStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{activeModel}</span>
        </div>
      </div>

      {/* Right: Key Vault & Window Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onOpenKeyVault}
          style={
            {
              WebkitAppRegion: 'no-drag',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '6px',
              color: '#a5b4fc',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            } as any
          }
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.25)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(99, 102, 241, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <span>🔑</span>
          <span>Key Vault</span>
        </button>

        {/* Electron Window Controls (Minimize, Maximize, Close) */}
        {isElectron && (
          <div style={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' } as any}>
            <button
              onClick={handleMinimize}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              ─
            </button>
            <button
              onClick={handleMaximize}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {isMaximized ? '❐' : '□'}
            </button>
            <button
              onClick={handleClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#ef4444';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
