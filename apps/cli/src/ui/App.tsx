import React, { useMemo, useState, useEffect } from 'react';
import { Box, useInput, useStdout, Text } from 'ink';
import { MainExecutionPanel } from './components/MainExecutionPanel';
import { InputBar } from './components/InputBar';
import { Sidebar } from './components/Sidebar';
import { DiffPanel } from './components/DiffPanel';
import { CommandDispatcher } from './commands/CommandDispatcher';
import { useAgentSession } from './hooks/useAgentSession';
import { useEventStream } from './hooks/useEventStream';
import { EventBatcher } from '../bridge/EventStreamAdapter';

export const App: React.FC<{ 
  sessionId: string;
  batcher: EventBatcher; 
  onInput: (input: string, mode: string) => void;
  onApprove?: (changeSetId: string) => Promise<void>;
  onReject?: (changeSetId: string) => Promise<void>;
}> = ({ sessionId, batcher, onInput, onApprove, onReject }) => {
  const { state, setMode, setFocus } = useAgentSession(sessionId);
  const projection = useEventStream(batcher);
  const { stdout } = useStdout();
  const [height, setHeight] = useState((stdout && stdout.rows) ? stdout.rows : 24);
  const [showDiff, setShowDiff] = useState(false);

  const handleApprove = async (msgId: string) => {
    const msg = projection.chatHistory.find(m => m.id === msgId);
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content);
      const changeSetId = data.changeSetId || data.patchBundle?.id || data.id;
      if (changeSetId && onApprove) {
        await onApprove(changeSetId);
      }
    } catch (err) {
      console.error("[App] Failed to approve changeSet:", err);
    }
  };

  const handleReject = async (msgId: string) => {
    const msg = projection.chatHistory.find(m => m.id === msgId);
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content);
      const changeSetId = data.changeSetId || data.patchBundle?.id || data.id;
      if (changeSetId && onReject) {
        await onReject(changeSetId);
      }
    } catch (err) {
      console.error("[App] Failed to reject changeSet:", err);
    }
  };

  useEffect(() => {
    if (!stdout || typeof stdout.on !== 'function') return;
    const onResize = () => setHeight(stdout.rows || 24);
    stdout.on('resize', onResize);
    return () => {
      if (stdout && typeof stdout.off === 'function') {
        stdout.off('resize', onResize);
      }
    };
  }, [stdout]);

  useInput((char, key) => {
    // Diff Panel Toggle (Ctrl+D)
    if (key.ctrl && char === 'd') {
      setShowDiff((prev) => !prev);
      return;
    }

    // Focus system
    if (key.ctrl && char === '1') setFocus('left');
    if (key.ctrl && char === '2') setFocus('center');
    if (key.ctrl && char === '3') setFocus('right');

    if (state.mode === 'chat' || state.mode === 'plan') {
      if (char === '/') setMode('command');
    } else if (state.mode === 'command') {
      if (key.escape) setMode('chat');
    } else if (state.mode === 'replay') {
      if (char === ' ') { /* play/pause */ }
      if (key.leftArrow) { /* step back */ }
      if (key.rightArrow) { /* step forward */ }
      if (key.escape) setMode('chat');
    }
  });

  const handleSubmit = (input: string) => {
    if (CommandDispatcher.isCommand(input)) {
      const result = CommandDispatcher.dispatch(input);
      if (result.action === 'set_mode' && result.payload?.mode) {
        setMode(result.payload.mode);
        if (result.payload.goal) {
          onInput(result.payload.goal, result.payload.mode);
        }
        return;
      }
      if (result.action === 'toggle_diff') {
        setShowDiff((prev) => !prev);
        return;
      }
    }
    onInput(input, state.mode);
    if (state.mode === 'command') setMode('chat');
  };

  return (
    <Box flexDirection="column" width="100%" height={Math.max(1, height - 1)}>
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        <Box flexDirection="column" width="80%" paddingRight={2} paddingBottom={1}>
          <MainExecutionPanel 
            executionLog={projection.chatHistory} 
            streamingBuffer={projection.streamingBuffer} 
            agentState={projection.agentState} 
            narrativeState={projection.narrativeState}
            narrativeSummary={projection.narrativeSummary}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </Box>

        <Box flexDirection="column" width="20%">
          <Sidebar projection={projection} />
        </Box>
      </Box>

      {showDiff && (
        <Box width="100%">
          <DiffPanel diff={projection.narrativeSummary || ''} />
        </Box>
      )}

      <Box width="100%">
        <InputBar
          mode={state.mode}
          onSubmit={handleSubmit}
          onToggleMode={() => setMode(state.mode === 'plan' ? 'chat' : 'plan')}
        />
      </Box>
    </Box>
  );
};
