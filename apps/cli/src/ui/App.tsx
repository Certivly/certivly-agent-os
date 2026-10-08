import React, { useMemo, useState, useEffect } from 'react';
import { Box, useInput, useStdout, Text } from 'ink';
import { MainExecutionPanel } from './components/MainExecutionPanel';
import { InputBar } from './components/InputBar';
import { Sidebar } from './components/Sidebar';
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
    // Global Debug Toggle
    if (key.ctrl && char === 'd') {
      setMode(state.mode === 'debug' ? 'chat' : 'debug');
      return;
    }

    // Focus system
    if (key.ctrl && char === '1') setFocus('left');
    if (key.ctrl && char === '2') setFocus('center');
    if (key.ctrl && char === '3') setFocus('right');

    if (state.mode === 'chat') {
      if (char === '/') setMode('command');
      // ctrl+c to cancel stream is usually process.exit in ink, we'll intercept if possible, but default is exit.
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

      <Box width="100%">
        <InputBar mode={state.mode} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
};
