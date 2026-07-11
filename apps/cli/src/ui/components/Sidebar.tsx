import React from 'react';
import { Box, Text } from 'ink';
import { UIProjection } from '../hooks/useEventStream';

export const Sidebar: React.FC<{ projection: UIProjection }> = ({ projection }) => {
  const providerColor =
    projection.providerStatus === 'ok' ? 'green' :
    projection.providerStatus === 'error' ? 'red' : 'gray';

  const providerIcon =
    projection.providerStatus === 'ok' ? '●' :
    projection.providerStatus === 'error' ? '✗' : '○';

  const providerLabel =
    projection.providerStatus === 'ok' ? 'Connected' :
    projection.providerStatus === 'error' ? 'Disconnected' : 'Connecting...';

  const cwd = process.cwd();
  const shortCwd = cwd.split(/[\\/]/).pop() || cwd;

  return (
    <Box flexDirection="column" height="100%" justifyContent="space-between" paddingLeft={2}>
      <Box flexDirection="column">
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Provider</Text>
          <Text color={providerColor}>{providerIcon} {providerLabel}</Text>
          {projection.providerStatus === 'error' && projection.providerError && (
            <Text color="red" wrap="truncate-end" dimColor>
              {projection.providerError.length > 28
                ? projection.providerError.slice(0, 28) + '…'
                : projection.providerError}
            </Text>
          )}
        </Box>

        {projection.agentState !== 'idle' && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Status</Text>
            <Text color="yellow">{projection.agentState.replace(/_/g, ' ')}</Text>
          </Box>
        )}

        {projection.activeSkills.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Skills</Text>
            {projection.activeSkills.slice(-3).map((s, i) => (
              <Text key={i} color="cyan" dimColor>● {s}</Text>
            ))}
          </Box>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color="gray" dimColor wrap="truncate-end">{shortCwd}</Text>
        <Text color="gray" dimColor>AgentOS 1.0</Text>
      </Box>
    </Box>
  );
};
