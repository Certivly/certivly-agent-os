import React, { memo, useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ChatMessage, AgentState, ToolExecution } from '../hooks/useEventStream';
import { ApprovalView } from './ApprovalView';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const useSpinner = (active: boolean) => {
  const [frameIdx, setFrameIdx] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setFrameIdx(f => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    const elapsedTimer = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
      clearInterval(elapsedTimer);
    };
  }, [active]);

  return { frame: SPINNER_FRAMES[frameIdx], elapsed: elapsedSeconds };
};

const formatToolArgs = (args?: Record<string, unknown>): string => {
  if (!args || Object.keys(args).length === 0) return '';
  const entries = Object.entries(args).slice(0, 2);
  const parts = entries.map(([k, v]) => {
    const valStr = typeof v === 'string' ? `"${v.length > 25 ? v.slice(0, 22) + '...' : v}"` : String(v);
    return `${k}: ${valStr}`;
  });
  return parts.join(', ');
};

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
        <Text color="white">{msg.content}</Text>
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
  if (!msg.content && msg.streaming === false && (!msg.toolExecutions || msg.toolExecutions.length === 0)) return null;

  // Normal assistant text / streaming
  return (
    <Box flexDirection="column" marginY={1}>
      {/* Tool executions list */}
      {msg.toolExecutions && msg.toolExecutions.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {msg.toolExecutions.map((tool: ToolExecution, i: number) => {
            const argText = formatToolArgs(tool.args);
            const argDisplay = argText ? ` (${argText})` : '';

            if (tool.status === 'running') {
              return (
                <Text key={i} color="cyan">
                  ● running {tool.name}{argDisplay}...
                </Text>
              );
            }
            if (tool.status === 'error') {
              return (
                <Text key={i} color="red">
                  ✗ {tool.name}{argDisplay} (error)
                </Text>
              );
            }
            return (
              <Text key={i} color="green" dimColor>
                ✓ {tool.name}{argDisplay}
              </Text>
            );
          })}
        </Box>
      )}

      {/* Anti-loop intervention banner */}
      {msg.antiLoopIntervention && (
        <Box borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
          <Text color="yellow" bold>⚠️ [Anti-Loop Monitor] </Text>
          <Text color="yellow">{msg.antiLoopIntervention}</Text>
        </Box>
      )}

      {/* Assistant textual response */}
      {msg.content && <Text color="white">{msg.content}</Text>}
      {msg.streaming && <Text color="cyan" dimColor>▌</Text>}
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
  const isBusy = agentState === 'thinking' || agentState === 'executing_tools';
  const spinner = useSpinner(isBusy);

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
            <Text color="yellow">
              {spinner.frame} Thinking... ({spinner.elapsed}s)
            </Text>
          )}
          {scrollOffset === 0 && agentState === 'executing_tools' && (
            <Text color="blue">
              {spinner.frame} Running tools... ({spinner.elapsed}s)
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
