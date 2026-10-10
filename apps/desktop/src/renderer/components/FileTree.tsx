import React, { useState } from 'react';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  onOpenFile: (filePath: string) => void;
}

export const FileTreeItem: React.FC<{
  node: FileNode;
  depth?: number;
  onOpenFile: (filePath: string) => void;
}> = ({ node, depth = 0, onOpenFile }) => {
  const [isExpanded, setIsExpanded] = useState(depth === 0);

  const isDir = node.type === 'directory';

  const handleClick = () => {
    if (isDir) {
      setIsExpanded(!isExpanded);
    } else {
      onOpenFile(node.path);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          paddingLeft: `${depth * 14 + 8}px`,
          fontSize: '12px',
          color: isDir ? '#cbd5e1' : '#94a3b8',
          cursor: 'pointer',
          borderRadius: '4px',
          transition: 'background 0.1s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <span style={{ fontSize: '11px', width: '14px', opacity: 0.7 }}>
          {isDir ? (isExpanded ? '▾' : '▸') : '📄'}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </div>

      {isDir && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({ files, onOpenFile }) => {
  if (files.length === 0) {
    return (
      <div style={{ padding: '16px', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
        No files in workspace
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
      {files.map((node) => (
        <FileTreeItem key={node.path} node={node} depth={0} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
};
