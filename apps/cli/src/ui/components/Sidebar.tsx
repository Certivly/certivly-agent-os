import React from 'react';
import { Box, Text } from 'ink';
import { UIProjection } from '../hooks/useEventStream';
import * as path from 'path';

export const Sidebar: React.FC<{ projection: UIProjection }> = ({ projection }) => {
  const cwd = process.cwd();
  
  return (
    <Box flexDirection="column" height="100%" justifyContent="space-between" paddingLeft={2}>
      <Box flexDirection="column">
        <Text bold>Context</Text>
        <Text color="gray">0 tokens</Text>
        <Text color="gray">0% used</Text>
        <Text color="gray">$0.00 spent</Text>
        
        <Box marginTop={1} flexDirection="column">
          <Text bold>LSP</Text>
          <Text color="gray">LSPs are disabled</Text>
        </Box>
      </Box>

      <Box flexDirection="column" overflow="hidden">
        <Text color="gray" wrap="truncate-end">/{cwd}</Text>
        <Text color="gray" dimColor>• AgentOS 1.0.0</Text>
      </Box>
    </Box>
  );
};
