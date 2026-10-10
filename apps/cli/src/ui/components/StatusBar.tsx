import React from 'react';
import { Box, Text } from 'ink';

export interface StatusBarProps {
  sessionId?: string;
  mode?: string;
  modelId?: string;
  streamStatus?: string;
  replayState?: string;
  mcpCount?: number;
  todosCount?: { completed: number; total: number };
}

export const StatusBar: React.FC<StatusBarProps> = ({
  sessionId,
  mode = 'manual',
  modelId,
  streamStatus,
  replayState,
  mcpCount = 0,
  todosCount,
}) => {
  const isPlan = mode === 'plan';
  const modeLabel = isPlan ? '[PLAN]' : '[BUILD]';
  const modeColor = isPlan ? 'yellow' : 'green';

  return (
    <Box
      flexDirection="row"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      <Box flexDirection="row">
        <Text color={modeColor} bold>{modeLabel} </Text>
        {modelId && <Text color="cyan">· {modelId} </Text>}
        {todosCount && todosCount.total > 0 && (
          <Text color="green">· {todosCount.completed}/{todosCount.total} tasks </Text>
        )}
        {mcpCount > 0 && <Text color="magenta">· MCP: {mcpCount} </Text>}
        {streamStatus && <Text color="gray">· {streamStatus} </Text>}
      </Box>
      <Box flexDirection="row">
        <Text color="gray" dimColor>Tab: Mode · Ctrl+D: Diff · Ctrl+T: Tasks · /: Cmds</Text>
      </Box>
    </Box>
  );
};
