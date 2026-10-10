import React, { useState } from 'react';
import { FileTree, FileNode } from './FileTree';

export interface SessionItem {
  id: string;
  title: string;
  createdAt: number;
  status?: string;
  messageCount?: number;
}

interface SidebarProps {
  activeTab: 'files' | 'sessions' | 'tasks' | 'skills';
  onChangeTab: (tab: 'files' | 'sessions' | 'tasks' | 'skills') => void;
  files: FileNode[];
  onOpenFile: (path: string) => void;
  sessions: SessionItem[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  skills: { id: string; name: string; description: string }[];
  agents: { id: string; name: string; description: string }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onChangeTab,
  files,
  onOpenFile,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  skills,
  agents,
}) => {
  const [sessionSearch, setSessionSearch] = useState('');

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(sessionSearch.toLowerCase()) || s.id.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  return (
    <aside
      style={{
        width: '280px',
        backgroundColor: 'rgba(7, 9, 14, 0.95)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 42px)',
        overflow: 'hidden',
      }}
    >
      {/* Tab Bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
        }}
      >
        {[
          { id: 'files', label: 'Files', icon: '📁' },
          { id: 'sessions', label: 'Sessions', icon: '💬' },
          { id: 'tasks', label: 'Tasks', icon: '📋' },
          { id: 'skills', label: 'Agents', icon: '⚡' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id as any)}
              style={{
                flex: 1,
                padding: '10px 4px',
                border: 'none',
                borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                color: isActive ? '#f8fafc' : '#64748b',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '13px' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* 1. Files Explorer */}
        {activeTab === 'files' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '8px' }}>
            <div style={{ padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Workspace Explorer
            </div>
            <FileTree files={files} onOpenFile={onOpenFile} />
          </div>
        )}

        {/* 2. Sessions History */}
        {activeTab === 'sessions' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '12px', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="Search sessions..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={onNewSession}
                title="Create New Session"
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#6366f1',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                +
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
              {filteredSessions.map((s) => {
                const isSelected = s.id === activeSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => onSelectSession(s.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? '#f8fafc' : '#cbd5e1',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.title || 'Untitled Session'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {new Date(s.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                      title="Delete Session"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '4px',
                        fontSize: '11px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Tasks */}
        {activeTab === 'tasks' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Execution Tasks & Plan
            </div>
            <div style={{ padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '8px' }}>
                Tasks generated during Plan mode appear here automatically.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#10b981' }}>
                <span>✓</span>
                <span>AgentOS Core Initialized</span>
              </div>
            </div>
          </div>
        )}

        {/* 4. Skills & Agents */}
        {activeTab === 'skills' && (
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                Subagent Teams
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {agents.map((ag) => (
                  <div
                    key={ag.id}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#a5b4fc' }}>{ag.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{ag.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                Skills & MCP Tools
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {skills.map((sk) => (
                  <div
                    key={sk.id}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#67e8f9' }}>{sk.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{sk.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
