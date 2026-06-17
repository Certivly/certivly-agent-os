import React, { memo, useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ChatMessage, AgentState } from '../hooks/useEventStream';

export const ChatRenderer = memo(({ msg }: { msg: ChatMessage }) => {
  if (msg.role === 'user') {
    return (
      <Box flexDirection="row" marginY={1}>
        <Text color="blue">| </Text>
        <Text color="white">{msg.content}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={0}>
      {msg.toolExecutions && msg.toolExecutions.length > 0 && (
        <Box flexDirection="column" marginY={1}>
          {msg.toolExecutions.map((tool, i) => (
            <Text key={i} color="blue" dimColor={tool.status === 'running'}>
              ■ {tool.name} {tool.status === 'running' ? '...' : ''}
            </Text>
          ))}
        </Box>
      )}
      <Text>{msg.content}</Text>
    </Box>
  );
});

export const MainExecutionPanel: React.FC<{ executionLog: ChatMessage[], streamingBuffer: string, agentState: AgentState }> = ({ executionLog, streamingBuffer, agentState }) => {
  const [scrollOffset, setScrollOffset] = useState(0);

  useInput((char, key) => {
    if (key.pageUp) {
      setScrollOffset(s => s + 5);
    }
    if (key.pageDown) {
      setScrollOffset(s => Math.max(0, s - 5));
    }
    if (key.upArrow && key.shift) {
      setScrollOffset(s => s + 2);
    }
    if (key.downArrow && key.shift) {
      setScrollOffset(s => Math.max(0, s - 2));
    }
  });

  useEffect(() => {
    setScrollOffset(0);
  }, [executionLog.length, streamingBuffer]);

  const endIdx = executionLog.length - scrollOffset;
  const startIdx = Math.max(0, endIdx - 50);
  const visibleLog = executionLog.slice(startIdx, endIdx);

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box flexDirection="column" paddingX={0} flexGrow={1}>
        {scrollOffset > 0 && <Text color="yellow" dimColor>(SCROLLED UP)</Text>}
        <Box flexDirection="column" marginTop={0} flexGrow={1} overflow="hidden" justifyContent="flex-end">
          {visibleLog.map(msg => (
            <ChatRenderer key={msg.id} msg={msg} />
          ))}
          {scrollOffset === 0 && agentState === 'thinking' && <Text color="yellow">+ Thought: processing...</Text>}
        </Box>
      </Box>
      {scrollOffset > 0 && (
        <Box flexDirection="column" width={1} justifyContent="center" paddingLeft={1}>
          <Text color="cyan">↑</Text>
          <Text color="cyan">|</Text>
          <Text color="cyan">↓</Text>
        </Box>
      )}
    </Box>
  );
};
