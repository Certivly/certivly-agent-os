import React from 'react';
import { Box, Text } from 'ink';

export interface DiffPanelProps {
  diff: string;
  maxLines?: number;
  title?: string;
}

export const DiffPanel: React.FC<DiffPanelProps> = ({
  diff,
  maxLines = 20,
  title = 'Pending Changeset Diff',
}) => {
  if (!diff || diff.trim() === '') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray" dimColor>[Diff Panel] No active sandbox changes</Text>
      </Box>
    );
  }

  const lines = diff.split('\n');
  const displayLines = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={0}>
      <Box justifyContent="space-between" marginBottom={0}>
        <Text color="cyan" bold>{title}</Text>
        <Text color="gray" dimColor>{lines.length} lines</Text>
      </Box>
      <Box flexDirection="column">
        {displayLines.map((line, index) => {
          if (line.startsWith('+++') || line.startsWith('---')) {
            return (
              <Text key={index} color="yellow" bold>
                {line}
              </Text>
            );
          }
          if (line.startsWith('@@')) {
            return (
              <Text key={index} color="magenta">
                {line}
              </Text>
            );
          }
          if (line.startsWith('+')) {
            return (
              <Text key={index} color="green">
                {line}
              </Text>
            );
          }
          if (line.startsWith('-')) {
            return (
              <Text key={index} color="red">
                {line}
              </Text>
            );
          }
          return (
            <Text key={index} color="gray">
              {line}
            </Text>
          );
        })}
      </Box>
      {remaining > 0 && (
        <Text color="gray" dimColor>
          ... ({remaining} more lines truncated)
        </Text>
      )}
    </Box>
  );
};
