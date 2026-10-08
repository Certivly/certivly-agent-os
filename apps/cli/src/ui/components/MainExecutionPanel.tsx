import React, { memo, useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ChatMessage, AgentState } from '../hooks/useEventStream';
import { ApprovalView } from './ApprovalView';

export const ChatRenderer = memo(({
  msg,
  onApprove,
  onReject
}: {
  msg: ChatMessage;
  onApprove?: (msgId: string) => void;
  onReject?: (msgId: string) => void;
}) => {
  if (msg.role === 'user') {
    return (
      <Box marginY={1}>
        <Text color="cyan" bold>You  </Text>
        <Text>{msg.content}</Text>
      </Box>
    );
  }

  // Try to parse JSON response and render a clean summary
  if (msg.content.trim().startsWith('{') && msg.content.trim().endsWith('}')) {
    try {
      const data = JSON.parse(msg.content);

      // Has real file patches or changeset — show approval view
      const patches = data.patchBundle?.patches || (data.files ? data.files : []);
      if (data.changeSetId || patches.length > 0) {
        return (
          <ApprovalView
            data={data}
            onApprove={() => onApprove?.(msg.id)}
            onReject={() => onReject?.(msg.id)}
          />
        );
      }

      // Provider connection error
      if (data.error || (typeof msg.content === 'string' && msg.content.startsWith('Provider connection failed'))) {
        return (
          <Box marginY={1}>
            <Text color="red">✗ </Text>
            <Text color="red">{data.error || msg.content}</Text>
          </Box>
        );
      }

      // Execution result — show clean status
      const isError = !!data.executionResult?.error;
      const resultMsg = data.executionResult?.error
        ? `Error: ${data.executionResult.error}`
        : data.executionResult?.success === false
          ? 'Task failed — no changes produced.'
          : 'Done. No workspace modifications requested.';

      const taskCount = data.planSummary?.tasks ?? data.executionResult?.tasksCompleted ?? 0;
      const riskScore = data.planSummary?.riskScore ?? 0;

      return (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text color={isError ? 'red' : 'green'}>{isError ? '✗ ' : '✓ '}</Text>
            <Text>{resultMsg}</Text>
          </Box>
          {(taskCount > 0 || riskScore > 0) && (
            <Text color="gray" dimColor>  {taskCount} task{taskCount !== 1 ? 's' : ''} · risk score {riskScore}</Text>
          )}
        </Box>
      );
    } catch (_err) {
      // best-effort: fallback to standard message rendering if tool execution metadata is not JSON
    }
  }

  // Provider error plain string
  if (typeof msg.content === 'string' && msg.content.startsWith('Provider connection failed')) {
    return (
      <Box marginY={1}>
        <Text color="red">✗ {msg.content}</Text>
      </Box>
    );
  }

  // Empty placeholder while streaming hasn't started yet
  if (!msg.content && msg.streaming === false) return null;

  // Normal assistant text / streaming
  return (
    <Box flexDirection="column" marginY={1}>
      {msg.toolExecutions && msg.toolExecutions.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {msg.toolExecutions.map((tool, i) => (
            <Text key={i} color={tool.status === 'completed' ? 'green' : 'blue'} dimColor>
              {tool.status === 'completed' ? '✓' : '●'} {tool.name}
            </Text>
          ))}
        </Box>
      )}
      {msg.content && <Text>{msg.content}</Text>}
      {msg.streaming && <Text color="yellow" dimColor>▌</Text>}
    </Box>
  );
});

export const MainExecutionPanel: React.FC<{
  executionLog: ChatMessage[],
  streamingBuffer: string,
  agentState: AgentState,
  narrativeState?: any,
  narrativeSummary?: any,
  onApprove?: (msgId: string) => void,
  onReject?: (msgId: string) => void
}> = ({ executionLog, streamingBuffer, agentState, narrativeState, narrativeSummary, onApprove, onReject }) => {
  const [scrollOffset, setScrollOffset] = useState(0);

  useInput((char, key) => {
    if (key.pageUp) setScrollOffset(s => s + 5);
    if (key.pageDown) setScrollOffset(s => Math.max(0, s - 5));
    if (key.upArrow && key.shift) setScrollOffset(s => s + 2);
    if (key.downArrow && key.shift) setScrollOffset(s => Math.max(0, s - 2));
  });

  useEffect(() => {
    setScrollOffset(0);
  }, [executionLog.length, streamingBuffer]);

  const endIdx = executionLog.length - scrollOffset;
  const startIdx = Math.max(0, endIdx - 50);
  const visibleLog = executionLog.slice(startIdx, endIdx);

  const renderNarrative = () => {
    if (!narrativeState?.activities?.length) return null;
    return (
      <Box flexDirection="column" marginY={1}>
        {narrativeState.activities.map((act: any, i: number) => (
          <Text key={i} color={act.status === 'completed' ? 'green' : (act.status === 'failed' ? 'red' : 'blue')}>
            {act.status === 'completed' ? '✓ ' : (act.status === 'failed' ? '✗ ' : '● ')}
            {act.message}{act.status === 'active' ? '...' : ''}
          </Text>
        ))}
      </Box>
    );
  };

  const renderSummary = () => {
    if (!narrativeSummary) return null;
    return (
      <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="green" padding={1}>
        <Text color="green" bold>✓ {narrativeSummary.objective}</Text>
        {narrativeSummary.reasoning?.map((r: string, i: number) => (
          <Text key={i} color="gray">• {r}</Text>
        ))}
      </Box>
    );
  };

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box flexDirection="column" paddingX={0} flexGrow={1}>
        {scrollOffset > 0 && <Text color="yellow" dimColor>↑ scrolled — shift+↓ to return</Text>}
        <Box flexDirection="column" marginTop={0} flexGrow={1} overflow="hidden" justifyContent="flex-end">
          {visibleLog.map(msg => (
            <ChatRenderer
              key={msg.id}
              msg={msg}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
          {renderNarrative()}
          {renderSummary()}
          {scrollOffset === 0 && agentState === 'thinking' && (
            <Text color="yellow" dimColor>● thinking...</Text>
          )}
          {scrollOffset === 0 && agentState === 'executing_tools' && (
            <Text color="blue" dimColor>● running tools...</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
