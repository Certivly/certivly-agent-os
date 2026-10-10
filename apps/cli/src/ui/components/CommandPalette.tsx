import React from 'react';
import { Box, Text } from 'ink';
import { CommandDispatcher, type CommandEntry } from '../commands/CommandDispatcher';

export interface CommandPaletteProps {
  query: string;
  selectedIndex: number;
  maxVisible?: number;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  query,
  selectedIndex,
  maxVisible = 6,
}) => {
  const matches = CommandDispatcher.searchCommands(query);

  if (matches.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text color="gray" dimColor>No matching slash commands for "{query}"</Text>
      </Box>
    );
  }

  // Windowing for long lists
  const safeSelected = Math.max(0, Math.min(selectedIndex, matches.length - 1));
  const startIdx = Math.max(0, Math.min(safeSelected - Math.floor(maxVisible / 2), matches.length - maxVisible));
  const visible = matches.slice(startIdx, startIdx + maxVisible);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
      width="100%"
    >
      <Box justifyContent="space-between" marginBottom={0}>
        <Text color="cyan" bold>⌨ Slash Commands</Text>
        <Text color="gray" dimColor>↑↓ navigate · Tab/Enter select · Esc close</Text>
      </Box>

      {visible.map((cmd, idx) => {
        const actualIndex = startIdx + idx;
        const isSelected = actualIndex === safeSelected;

        return (
          <Box key={cmd.name} flexDirection="row" justifyContent="space-between" width="100%">
            <Box flexDirection="row">
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {isSelected ? '❯ ' : '  '}
                {cmd.syntax.padEnd(22, ' ')}
              </Text>
              <Text color="gray" dimColor={!isSelected}>
                {cmd.description}
              </Text>
            </Box>
            <Text color={cmd.category === 'Mode' ? 'yellow' : cmd.category === 'Intelligence' ? 'magenta' : 'blue'} dimColor={!isSelected}>
              [{cmd.category}]
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
