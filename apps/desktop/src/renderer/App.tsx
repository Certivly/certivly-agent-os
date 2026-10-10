import React, { useState, useEffect, useRef } from 'react';
import { Titlebar } from './components/Titlebar';
import { Sidebar, SessionItem } from './components/Sidebar';
import { ModelSelector, ModelItem } from './components/ModelSelector';
import { PermissionModeSwitch, PermissionMode } from './components/PermissionModeSwitch';
import { KeyVaultModal } from './components/KeyVaultModal';
import { ChatView, ChatMessage } from './components/ChatView';
import { PromptDock } from './components/PromptDock';
import { CommandPaletteModal, CommandItem } from './components/CommandPaletteModal';
import { TerminalDrawer } from './components/TerminalDrawer';
import { ApprovalItem } from './components/VisualDiffInspector';
import { ToolCallData } from './components/ToolExecutionCard';
import { FileNode } from './components/FileTree';

export const App: React.FC = () => {
  const [serverUrl, setServerUrl] = useState<string>('http://127.0.0.1:3456');
  const [serverStatus, setServerStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [activeModel, setActiveModel] = useState<string>('claude-3-7-sonnet');
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');
  const [models, setModels] = useState<ModelItem[]>([]);
  const [mode, setMode] = useState<PermissionMode>('manual');

  // Sidebar & Files
  const [sidebarTab, setSidebarTab] = useState<'files' | 'sessions' | 'tasks' | 'skills'>('sessions');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFileContent, setSelectedFileContent] = useState<{ path: string; content: string } | null>(null);

  // Sessions & Chat
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [activeApprovals, setActiveApprovals] = useState<ApprovalItem[]>([]);

  // Modals & Terminal & Palette
  const [isKeyVaultOpen, setIsKeyVaultOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [skills, setSkills] = useState<{ id: string; name: string; description: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string; description: string }[]>([]);

  const sseRef = useRef<EventSource | null>(null);

  // 1. Resolve Server URL and initial bootstrap
  useEffect(() => {
    async function init() {
      let url = 'http://127.0.0.1:3456';
      if (window.agentos?.getServerUrl) {
        try {
          const res = await window.agentos.getServerUrl();
          if (res) url = res;
        } catch (_err) {
          void _err;
        }
      } else if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) {
        url = window.location.origin;
      }
      setServerUrl(url);
      await checkServerAndLoad(url);
    }
    init();

    // Listen to global shortcuts (Cmd/Ctrl+K for palette, Ctrl+` for terminal)
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);

    // Listen to native menu shortcuts from Electron
    let unsubMenu: (() => void) | undefined;
    if (window.agentos?.onMenuAction) {
      unsubMenu = window.agentos.onMenuAction((action) => {
        if (action === 'open-key-vault') setIsKeyVaultOpen(true);
        if (action === 'new-session') handleNewSession();
        if (action === 'set-mode-plan') handleChangeMode('plan');
        if (action === 'set-mode-manual') handleChangeMode('manual');
        if (action === 'set-mode-auto') handleChangeMode('auto');
        if (action === 'open-directory') handleOpenDirectory();
      });
    }

    return () => {
      window.removeEventListener('keydown', handleGlobalKey);
      unsubMenu?.();
    };
  }, []);

  const checkServerAndLoad = async (url: string) => {
    try {
      setServerStatus('connecting');
      const healthRes = await fetch(`${url}/api/health`);
      if (healthRes.ok) {
        const health = await healthRes.json();
        setServerStatus('connected');
        setWorkspaceRoot(health.workspaceRoot || '');
        if (health.activeModel) setActiveModel(health.activeModel);
        if (health.activeProvider) setActiveProvider(health.activeProvider);
        if (health.permissionMode) setMode(health.permissionMode);
        await Promise.all([
          loadModels(url),
          loadSessions(url),
          loadWorkspaceTree(url),
          loadSkillsAndAgents(url),
        ]);
      } else {
        setServerStatus('disconnected');
      }
    } catch (_err) {
      setServerStatus('disconnected');
    }
  };

  const loadModels = async (url: string) => {
    try {
      const res = await fetch(`${url}/api/models`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        if (data.activeModel) setActiveModel(data.activeModel);
        if (data.activeProvider) setActiveProvider(data.activeProvider);
      }
    } catch (_err) {
      void _err;
    }
  };

  const loadSessions = async (url: string) => {
    try {
      const res = await fetch(`${url}/api/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data || []);
        if (data && data.length > 0 && !activeSessionId) {
          selectSession(data[0].id, url);
        } else if (data && data.length === 0) {
          handleNewSession(url);
        }
      }
    } catch (_err) {
      void _err;
    }
  };

  const loadWorkspaceTree = async (url: string) => {
    try {
      const res = await fetch(`${url}/api/workspace/tree`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.tree || []);
      }
    } catch (_err) {
      void _err;
    }
  };

  const loadSkillsAndAgents = async (url: string) => {
    try {
      const [skRes, agRes] = await Promise.all([
        fetch(`${url}/api/skills`).catch(() => null),
        fetch(`${url}/api/agents`).catch(() => null),
      ]);
      if (skRes?.ok) {
        const d = await skRes.json();
        setSkills(d.skills || []);
      }
      if (agRes?.ok) {
        const d = await agRes.json();
        setAgents(d.agents || []);
      }
    } catch (_err) {
      void _err;
    }
  };

  // 2. Session Management & SSE Streams
  const selectSession = async (sessionId: string, url = serverUrl) => {
    setActiveSessionId(sessionId);
    setActiveApprovals([]);
    setIsStreaming(false);
    setStreamingContent('');

    // Close previous SSE
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    // Load session messages
    try {
      const res = await fetch(`${url}/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const mappedMsgs: ChatMessage[] = (data.messages || []).map((m: any) => ({
          id: m.id || String(Math.random()),
          role: m.role || 'assistant',
          content: m.content || '',
          timestamp: m.timestamp,
        }));
        setMessages(mappedMsgs);
      }
    } catch (_err) {
      void _err;
    }

    // Connect SSE Stream
    connectSessionSse(sessionId, url);
  };

  const connectSessionSse = (sessionId: string, url: string) => {
    const es = new EventSource(`${url}/api/sessions/${sessionId}/events`);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleSseEvent(msg);
      } catch (_err) {
        void _err;
      }
    };

    es.onerror = () => {
      // SSE auto-reconnects
    };
  };

  const handleSseEvent = (msg: { event: string; data: any }) => {
    const { event, data } = msg;

    if (event === 'agent.loop.started') {
      setIsStreaming(true);
      setStreamingContent('');
    } else if (event === 'agent.token') {
      setIsStreaming(true);
      setStreamingContent((prev) => prev + (data.token || ''));
    } else if (event === 'agent.loop.completed' || event === 'agent.loop.failed') {
      setIsStreaming(false);
      setStreamingContent('');
      if (activeSessionId) {
        // Refresh session messages
        fetch(`${serverUrl}/api/sessions/${activeSessionId}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.messages) {
              setMessages(
                d.messages.map((m: any) => ({
                  id: m.id || String(Math.random()),
                  role: m.role || 'assistant',
                  content: m.content || '',
                }))
              );
            }
          })
          .catch(() => {});
      }
    } else if (event === 'approval.requested') {
      setActiveApprovals((prev) => [
        ...prev.filter((a) => a.id !== data.id),
        {
          id: data.id,
          toolName: data.toolName,
          args: data.args,
          files: data.files,
          diff: data.diff,
        },
      ]);
    } else if (event === 'approval.decided') {
      setActiveApprovals((prev) => prev.filter((a) => a.id !== data.id && a.id !== data.approvalId));
    }
  };

  const handleNewSession = async (url = serverUrl) => {
    try {
      const res = await fetch(`${url}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Conversation' }),
      });
      if (res.ok) {
        const session = await res.json();
        setSessions((prev) => [session, ...prev]);
        selectSession(session.id, url);
      }
    } catch (_err) {
      void _err;
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await fetch(`${serverUrl}/api/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        if (remaining.length > 0) {
          selectSession(remaining[0].id);
        } else {
          handleNewSession();
        }
      }
    } catch (_err) {
      void _err;
    }
  };

  const handleForkSession = async () => {
    if (!activeSessionId) return;
    const current = sessions.find((s) => s.id === activeSessionId);
    try {
      const res = await fetch(`${serverUrl}/api/sessions/${activeSessionId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Branch of ${current?.title || 'Session'}` }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions((prev) => [data.session, ...prev]);
        selectSession(data.sessionId);
        setExportNotice(`🌿 Forked session: ${data.session.title}`);
        setTimeout(() => setExportNotice(null), 3000);
      }
    } catch (_err) {
      void _err;
    }
  };

  const handleExportSession = async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`${serverUrl}/api/sessions/${activeSessionId}/export`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${activeSessionId}.md`;
        a.click();
        URL.revokeObjectURL(downloadUrl);
        setExportNotice(`📥 Exported transcript: ${activeSessionId}.md`);
        setTimeout(() => setExportNotice(null), 3000);
      }
    } catch (_err) {
      void _err;
    }
  };

  const handleSendPrompt = async (prompt: string) => {
    if (!activeSessionId) return;

    // Append user message optimistically
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingContent('AgentOS is thinking...');

    try {
      await fetch(`${serverUrl}/api/sessions/${activeSessionId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode }),
      });
    } catch (err: any) {
      setIsStreaming(false);
      setStreamingContent('');
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Failed to execute prompt: ${err.message}`,
        },
      ]);
    }
  };

  const handleApprove = async (approvalId: string) => {
    try {
      await fetch(`${serverUrl}/api/sessions/${activeSessionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, approved: true }),
      });
      setActiveApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    } catch (_err) {
      void _err;
    }
  };

  const handleReject = async (approvalId: string) => {
    try {
      await fetch(`${serverUrl}/api/sessions/${activeSessionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, approved: false, reason: 'Rejected by user in manual review' }),
      });
      setActiveApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    } catch (_err) {
      void _err;
    }
  };

  const handleCancelExecution = async () => {
    if (!activeSessionId) return;
    try {
      await fetch(`${serverUrl}/api/sessions/${activeSessionId}/cancel`, { method: 'POST' });
      setIsStreaming(false);
      setStreamingContent('');
    } catch (_err) {
      void _err;
    }
  };

  const handleSelectModel = async (modelId: string, provider: string) => {
    setActiveModel(modelId);
    setActiveProvider(provider);
    try {
      await fetch(`${serverUrl}/api/models/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, provider }),
      });
    } catch (_err) {
      void _err;
    }
  };

  const handleChangeMode = async (newMode: PermissionMode) => {
    setMode(newMode);
    try {
      await fetch(`${serverUrl}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionMode: newMode }),
      });
    } catch (_err) {
      void _err;
    }
  };

  const handleOpenDirectory = async () => {
    if (window.agentos?.selectDirectory) {
      const chosen = await window.agentos.selectDirectory({ title: 'Select Workspace Directory' });
      if (chosen) {
        setWorkspaceRoot(chosen);
        loadWorkspaceTree(serverUrl);
      }
    }
  };

  const handleOpenFile = async (filePath: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/workspace/file?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedFileContent({ path: filePath, content: data.content });
      }
    } catch (_err) {
      void _err;
    }
  };

  const paletteCommands: CommandItem[] = [
    {
      id: 'new-session',
      title: 'New Chat Session',
      category: 'Session',
      icon: '➕',
      shortcut: 'Ctrl+N',
      action: () => handleNewSession(),
    },
    {
      id: 'fork-session',
      title: 'Fork / Branch Current Session',
      category: 'Session',
      icon: '🌿',
      action: () => handleForkSession(),
    },
    {
      id: 'export-session',
      title: 'Export Session Transcript (Markdown)',
      category: 'Session',
      icon: '📥',
      action: () => handleExportSession(),
    },
    {
      id: 'toggle-terminal',
      title: 'Toggle Embedded Terminal',
      category: 'Developer',
      icon: '💻',
      shortcut: 'Ctrl+`',
      action: () => setIsTerminalOpen((prev) => !prev),
    },
    {
      id: 'key-vault',
      title: 'API Keys & Provider Vault',
      category: 'Settings',
      icon: '🔑',
      shortcut: 'Ctrl+,',
      action: () => setIsKeyVaultOpen(true),
    },
    {
      id: 'open-workspace',
      title: 'Open Workspace Directory...',
      category: 'Workspace',
      icon: '📁',
      shortcut: 'Ctrl+O',
      action: () => handleOpenDirectory(),
    },
    {
      id: 'refresh-files',
      title: 'Refresh Workspace File Tree',
      category: 'Workspace',
      icon: '🔄',
      action: () => loadWorkspaceTree(serverUrl),
    },
    {
      id: 'mode-plan',
      title: 'Switch Mode to: Plan (Read-Only)',
      category: 'Modes',
      icon: '🛡️',
      action: () => handleChangeMode('plan'),
    },
    {
      id: 'mode-manual',
      title: 'Switch Mode to: Manual Review (Diff Gates)',
      category: 'Modes',
      icon: '⚡',
      action: () => handleChangeMode('manual'),
    },
    {
      id: 'mode-auto',
      title: 'Switch Mode to: Autonomous (Speed Execution)',
      category: 'Modes',
      icon: '🚀',
      action: () => handleChangeMode('auto'),
    },
    ...models.map((m) => ({
      id: `model-${m.id}`,
      title: `Switch Model to ${m.name} (${m.provider})`,
      category: 'Models',
      icon: '🧠',
      action: () => handleSelectModel(m.id, m.provider),
    })),
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#0b0f19',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Frameless Glass Titlebar */}
      <Titlebar
        workspaceRoot={workspaceRoot}
        onOpenDirectory={handleOpenDirectory}
        onOpenKeyVault={() => setIsKeyVaultOpen(true)}
        serverStatus={serverStatus}
        activeModel={activeModel}
      />

      {/* Main App Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <Sidebar
          activeTab={sidebarTab}
          onChangeTab={setSidebarTab}
          files={files}
          onOpenFile={handleOpenFile}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={selectSession}
          onNewSession={() => handleNewSession()}
          onDeleteSession={handleDeleteSession}
          skills={skills}
          agents={agents}
        />

        {/* Center Chat & Execution Console */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#07090e',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Top Control Bar: Model Selector + Mode Switcher */}
          <div
            style={{
              padding: '8px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(11, 15, 25, 0.7)',
            }}
          >
            <ModelSelector
              activeModel={activeModel}
              activeProvider={activeProvider}
              models={models}
              onSelectModel={handleSelectModel}
            />

            <PermissionModeSwitch mode={mode} onChangeMode={handleChangeMode} />
          </div>

          {/* Interactive Chat Stream & Approvals */}
          <ChatView
            sessionId={activeSessionId}
            sessionTitle={sessions.find((s) => s.id === activeSessionId)?.title}
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            activeApprovals={activeApprovals}
            onApprove={handleApprove}
            onReject={handleReject}
            onForkSession={handleForkSession}
            onExportSession={handleExportSession}
            onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
            isTerminalOpen={isTerminalOpen}
            onSelectSuggestion={handleSendPrompt}
          />

          {/* Prompt Input Dock */}
          <PromptDock
            onSend={handleSendPrompt}
            onCancel={handleCancelExecution}
            isRunning={isStreaming}
            activeMode={mode}
          />

          {/* Terminal Drawer Embedded at Bottom */}
          <TerminalDrawer
            isOpen={isTerminalOpen}
            onClose={() => setIsTerminalOpen(false)}
            serverUrl={serverUrl}
            workspaceRoot={workspaceRoot}
          />
        </main>
      </div>

      {/* Key Vault & Provider Settings Modal */}
      <KeyVaultModal
        isOpen={isKeyVaultOpen}
        onClose={() => setIsKeyVaultOpen(false)}
        serverUrl={serverUrl}
        onKeysChanged={() => loadModels(serverUrl)}
      />

      {/* Global Command Palette (Cmd/Ctrl+K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={paletteCommands}
      />

      {/* Notification Toast for Session Fork / Export */}
      {exportNotice && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #6366f1',
            boxShadow: '0 8px 32px rgba(99, 102, 241, 0.35)',
            color: '#f8fafc',
            padding: '8px 20px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 100,
            backdropFilter: 'blur(12px)',
          }}
        >
          {exportNotice}
        </div>
      )}

      {/* Code Inspector Drawer for Clicked Files */}
      {selectedFileContent && (
        <div
          style={{
            position: 'fixed',
            top: 42,
            right: 0,
            bottom: 0,
            width: '650px',
            backgroundColor: 'rgba(13, 19, 34, 0.96)',
            backdropFilter: 'blur(16px)',
            borderLeft: '1px solid rgba(99, 102, 241, 0.3)',
            boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.7)',
            zIndex: 80,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📄</span>
              <code style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                {selectedFileContent.path}
              </code>
            </div>
            <button
              onClick={() => setSelectedFileContent(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
          <pre
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#cbd5e1',
              lineHeight: '1.5',
            }}
          >
            {selectedFileContent.content}
          </pre>
        </div>
      )}
    </div>
  );
};
