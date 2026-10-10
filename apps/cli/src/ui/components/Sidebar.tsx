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

  const totalTodos = projection.todos?.length || 0;
  const completedTodos = projection.todos?.filter(t => t.status === 'completed').length || 0;

  return (
    <Box flexDirection="column" height="100%" justifyContent="space-between" paddingLeft={2}>
      <Box flexDirection="column">
        {/* Provider Status */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="white">Provider</Text>
          <Text color={providerColor}>{providerIcon} {providerLabel}</Text>
          {projection.activeModelId && (
            <Text color="cyan" dimColor wrap="truncate-end">{projection.activeModelId}</Text>
          )}
          {projection.providerStatus === 'error' && projection.providerError && (
            <Text color="red" wrap="truncate-end" dimColor>
              {projection.providerError.length > 28
                ? projection.providerError.slice(0, 28) + '…'
                : projection.providerError}
            </Text>
          )}
        </Box>

        {/* Turn & Status */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="white">Execution</Text>
          <Text color={projection.agentState === 'idle' ? 'green' : 'yellow'}>
            {projection.turnCount > 0 ? `Turn ${projection.turnCount} · ` : ''}
            {projection.agentState.replace(/_/g, ' ')}
          </Text>
          {projection.tokenStats && (
            <Text color="gray" dimColor>
              {projection.tokenStats.total > 1000
                ? `${(projection.tokenStats.total / 1000).toFixed(1)}k tokens`
                : `${projection.tokenStats.total} tokens`}
            </Text>
          )}
        </Box>

        {/* Tasks Progress */}
        {totalTodos > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="white">Checklist</Text>
            <Text color="green">
              {completedTodos}/{totalTodos} done ({Math.round((completedTodos / totalTodos) * 100)}%)
            </Text>
          </Box>
        )}

        {/* Active Skills */}
        {projection.activeSkills.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="white">Skills</Text>
            {projection.activeSkills.slice(-3).map((s, i) => (
              <Text key={i} color="cyan" dimColor>● {s}</Text>
            ))}
          </Box>
        )}
      </Box>

      {/* Footer & Keybindings */}
      <Box flexDirection="column">
        <Text color="gray" dimColor bold>Shortcuts</Text>
        <Text color="gray" dimColor>/  commands</Text>
        <Text color="gray" dimColor>Tab  plan/build</Text>
        <Text color="gray" dimColor>^D  view diff</Text>
        <Text color="gray" dimColor>^T  tasks list</Text>
        <Box marginTop={1}>
          <Text color="gray" dimColor wrap="truncate-end">{shortCwd} · AgentOS</Text>
        </Box>
      </Box>
    </Box>
  );
};
