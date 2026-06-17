import React from 'react';
import { Box, Text } from 'ink';

export const StatusBar: React.FC<{ sessionId: string, mode: string, streamStatus: string, replayState: string, mcpCount: number }> = ({ sessionId, mode, streamStatus, replayState, mcpCount }) => {
  return (
    <Box borderStyle="single" paddingX={1} borderColor="gray">
      <Text>
        Session: {sessionId} | Mode: {mode} | Stream: {streamStatus} | Replay: {replayState} | MCP: {mcpCount} active
      </Text>
    </Box>
  );
};
