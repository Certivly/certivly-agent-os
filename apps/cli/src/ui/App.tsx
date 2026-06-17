import React, { useMemo, useState, useEffect } from 'react';
import { Box, useInput, useStdout, Text } from 'ink';
import { MainExecutionPanel } from './components/MainExecutionPanel';
import { InputBar } from './components/InputBar';
import { Sidebar } from './components/Sidebar';
import { useAgentSession } from './hooks/useAgentSession';
import { useEventStream } from './hooks/useEventStream';
import { EventBatcher } from '../bridge/EventStreamAdapter';

export const App: React.FC<{ sessionId: string, batcher: EventBatcher, onInput: (input: string, mode: string) => void }> = ({ sessionId, batcher, onInput }) => {
  const { state, setMode, setFocus } = useAgentSession(sessionId);
  const projection = useEventStream(batcher);
  const { stdout } = useStdout();
  const [height, setHeight] = useState(stdout.rows || 24);

  useEffect(() => {
    const onResize = () => setHeight(stdout.rows);
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
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
    <Box flexDirection="column" width="100%" height={height}>
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        <Box flexDirection="column" width="80%" paddingRight={2} paddingBottom={1}>
          <MainExecutionPanel 
            executionLog={projection.chatHistory} 
            streamingBuffer={projection.streamingBuffer} 
            agentState={projection.agentState} 
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
