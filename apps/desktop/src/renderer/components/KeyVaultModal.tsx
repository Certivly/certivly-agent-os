import React, { useState, useEffect } from 'react';

export interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  hasKey: boolean;
  maskedKey?: string;
  baseUrl?: string;
  defaultBaseUrl?: string;
  models?: string[];
  docUrl?: string;
}

interface KeyVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  onKeysChanged?: () => void;
}

export const KeyVaultModal: React.FC<KeyVaultModalProps> = ({
  isOpen,
  onClose,
  serverUrl,
  onKeysChanged,
}) => {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('anthropic');
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [baseUrlInputs, setBaseUrlInputs] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testingStatus, setTestingStatus] = useState<Record<string, { loading?: boolean; success?: boolean; message?: string; latencyMs?: number }>>({});
  const [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      loadProviders();
    }
  }, [isOpen]);

  const loadProviders = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/keys`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
        const baseUrls: Record<string, string> = {};
        for (const p of data) {
          if (p.baseUrl) baseUrls[p.id] = p.baseUrl;
        }
        setBaseUrlInputs(baseUrls);
      }
    } catch (_err) {
      void _err;
    }
  };

  if (!isOpen) return null;

  const currentP = providers.find((p) => p.id === selectedProvider) || providers[0] || {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    hasKey: false,
    models: ['claude-3-7-sonnet', 'claude-3-5-sonnet'],
  };

  const handleTestConnection = async (providerId: string) => {
    setTestingStatus((prev) => ({ ...prev, [providerId]: { loading: true } }));
    const apiKey = keyInputs[providerId] || '';
    const baseUrl = baseUrlInputs[providerId] || undefined;

    try {
      const res = await fetch(`${serverUrl}/api/keys/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey, baseUrl }),
      });
      const data = await res.json();
      setTestingStatus((prev) => ({
        ...prev,
        [providerId]: {
          loading: false,
          success: data.success,
          message: data.message,
          latencyMs: data.latencyMs,
        },
      }));
    } catch (err: any) {
      setTestingStatus((prev) => ({
        ...prev,
        [providerId]: {
          loading: false,
          success: false,
          message: err.message || 'Network error',
        },
      }));
    }
  };

  const handleSaveKey = async (providerId: string) => {
    setSavingStatus((prev) => ({ ...prev, [providerId]: true }));
    const apiKey = keyInputs[providerId];
    const baseUrl = baseUrlInputs[providerId];

    try {
      const res = await fetch(`${serverUrl}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey, baseUrl }),
      });
      if (res.ok) {
        await loadProviders();
        setKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
        onKeysChanged?.();
      }
    } catch (_err) {
      void _err;
    } finally {
      setSavingStatus((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleRemoveKey = async (providerId: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/keys/${providerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadProviders();
        setKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
        onKeysChanged?.();
      }
    } catch (_err) {
      void _err;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.82)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '920px',
          height: '600px',
          backgroundColor: '#0d1322',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(99, 102, 241, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(6, 182, 212, 0.3))',
                border: '1px solid rgba(99, 102, 241, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              🔑
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.3px' }}>
                Key Vault & Providers
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8' }}>
                Configure credentials, local proxies, and test connectivity in real-time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body: Left Sidebar + Right Settings */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Provider List */}
          <div
            style={{
              width: '260px',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(11, 15, 25, 0.6)',
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {providers.map((p) => {
              const isSelected = p.id === selectedProvider;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProvider(p.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                    border: isSelected ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#fff' : '#cbd5e1' }}>
                      {p.name}
                    </span>
                  </div>
                  {p.hasKey ? (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      READY
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', color: '#64748b' }}>NO KEY</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Provider Detail Pane */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>{currentP.name}</h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Provider Type: <code style={{ color: '#06b6d4' }}>{currentP.type}</code>
                </span>
              </div>
              {currentP.hasKey && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                  <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>Active in Vault</span>
                </div>
              )}
            </div>

            {/* Current Configured Key Status */}
            {currentP.hasKey && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: 600, textTransform: 'uppercase' }}>Current Key</div>
                  <code style={{ fontSize: '13px', color: '#f8fafc' }}>{currentP.maskedKey || '••••••••••••••••'}</code>
                </div>
                <button
                  onClick={() => handleRemoveKey(currentP.id)}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#fca5a5',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Remove Key
                </button>
              </div>
            )}

            {/* API Key Input */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                {currentP.hasKey ? 'Update API Key' : 'Enter API Key'}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type={showKey[currentP.id] ? 'text' : 'password'}
                  placeholder={currentP.hasKey ? 'Leave blank to keep existing key' : `Paste ${currentP.name} API key...`}
                  value={keyInputs[currentP.id] || ''}
                  onChange={(e) => setKeyInputs({ ...keyInputs, [currentP.id]: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => setShowKey({ ...showKey, [currentP.id]: !showKey[currentP.id] })}
                  style={{
                    padding: '0 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  {showKey[currentP.id] ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Base URL (Crucial for Ollama, LM Studio, or custom proxies) */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Custom Base URL (Optional / Local Proxies)
              </label>
              <input
                type="text"
                placeholder={currentP.defaultBaseUrl || 'https://api.provider.com/v1'}
                value={baseUrlInputs[currentP.id] || ''}
                onChange={(e) => setBaseUrlInputs({ ...baseUrlInputs, [currentP.id]: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
            </div>

            {/* Live Connection Test & Latency Ping */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => handleTestConnection(currentP.id)}
                disabled={testingStatus[currentP.id]?.loading}
                style={{
                  padding: '9px 16px',
                  backgroundColor: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  borderRadius: '8px',
                  color: '#67e8f9',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>⚡</span>
                <span>{testingStatus[currentP.id]?.loading ? 'Testing Ping...' : 'Test Connection'}</span>
              </button>

              <button
                onClick={() => handleSaveKey(currentP.id)}
                disabled={savingStatus[currentP.id]}
                style={{
                  padding: '9px 20px',
                  backgroundColor: '#6366f1',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)',
                }}
              >
                {savingStatus[currentP.id] ? 'Saving...' : 'Save Credentials'}
              </button>

              {/* Ping Result Feedback Badge */}
              {testingStatus[currentP.id] && !testingStatus[currentP.id]?.loading && (
                <div
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: testingStatus[currentP.id]?.success
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${
                      testingStatus[currentP.id]?.success
                        ? 'rgba(16, 185, 129, 0.4)'
                        : 'rgba(239, 68, 68, 0.4)'
                    }`,
                    color: testingStatus[currentP.id]?.success ? '#34d399' : '#f87171',
                  }}
                >
                  <span>{testingStatus[currentP.id]?.success ? '✓' : '✕'}</span>
                  <span>
                    {testingStatus[currentP.id]?.success
                      ? `Connected (${testingStatus[currentP.id]?.latencyMs}ms)`
                      : testingStatus[currentP.id]?.message}
                  </span>
                </div>
              )}
            </div>

            {/* Available Models Preview */}
            {currentP.models && currentP.models.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Available Models
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {currentP.models.map((m) => (
                    <span
                      key={m}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#cbd5e1',
                        fontFamily: 'monospace',
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
