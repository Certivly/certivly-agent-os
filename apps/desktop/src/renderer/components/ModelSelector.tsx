import React, { useState } from 'react';

export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
}

interface ModelSelectorProps {
  activeModel: string;
  activeProvider: string;
  models: ModelItem[];
  onSelectModel: (modelId: string, provider: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  activeModel,
  activeProvider,
  models,
  onSelectModel,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          color: '#f8fafc',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)')}
      >
        <span style={{ color: '#06b6d4', fontSize: '13px' }}>🧠</span>
        <span style={{ fontWeight: 600 }}>{activeModel}</span>
        <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>
          ({activeProvider})
        </span>
        <span style={{ fontSize: '10px', opacity: 0.6 }}>▼</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '280px',
            maxHeight: '320px',
            overflowY: 'auto',
            backgroundColor: '#0d1322',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '10px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.7)',
            zIndex: 60,
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {models.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
              No models discovered. Set keys in Key Vault.
            </div>
          ) : (
            models.map((m) => {
              const isSelected = m.id === activeModel;
              return (
                <div
                  key={m.id}
                  onClick={() => {
                    onSelectModel(m.id, m.provider);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                    border: isSelected ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? '#a5b4fc' : '#e2e8f0' }}>
                      {m.name || m.id}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>{m.provider}</div>
                  </div>
                  {m.reasoning && (
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: 'rgba(6, 182, 212, 0.15)',
                        color: '#67e8f9',
                        fontWeight: 600,
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                      }}
                    >
                      THINKING
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
