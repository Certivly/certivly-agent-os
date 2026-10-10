import React from 'react';
import { Box, Text } from 'ink';
import type { TodoItem } from '../hooks/useEventStream';

export interface TodoPanelProps {
  todos: TodoItem[];
  collapsed?: boolean;
}

export const TodoPanel: React.FC<TodoPanelProps> = ({ todos, collapsed = false }) => {
  if (!todos || todos.length === 0) {
    return null;
  }

  const completedCount = todos.filter(t => t.status === 'completed').length;
  const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
  const percent = Math.round((completedCount / todos.length) * 100);

  if (collapsed) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1} marginY={0}>
        <Text color="gray" dimColor>
          [Tasks Checklist] {completedCount}/{todos.length} done ({percent}%) · Ctrl+T to expand
        </Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      marginY={0}
      width="100%"
    >
      <Box justifyContent="space-between" marginBottom={0}>
        <Box flexDirection="row">
          <Text color="green" bold>▾ Tasks & Progress </Text>
          <Text color="gray">({completedCount}/{todos.length} completed · {percent}%)</Text>
        </Box>
        <Text color="gray" dimColor>Ctrl+T toggle</Text>
      </Box>

      <Box flexDirection="column" marginTop={0}>
        {todos.map((todo, idx) => {
          let statusIcon = '[ ]';
          let statusColor = 'gray';
          let isBold = false;

          if (todo.status === 'completed') {
            statusIcon = '[✓]';
            statusColor = 'green';
          } else if (todo.status === 'in_progress') {
            statusIcon = '[●]';
            statusColor = 'yellow';
            isBold = true;
          } else if (todo.status === 'cancelled') {
            statusIcon = '[-]';
            statusColor = 'red';
          }

          return (
            <Box key={todo.id || idx} flexDirection="row" width="100%">
              <Text color={statusColor} bold={isBold}>
                {statusIcon} {idx + 1}. {todo.title}
              </Text>
              {todo.priority === 'high' && (
                <Text color="red" dimColor> [HIGH]</Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
