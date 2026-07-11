import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

export const InputBar: React.FC<{ mode: string, onSubmit: (val: string) => void }> = ({ mode, onSubmit }) => {
  const [input, setInput] = useState('');
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setBlink(b => !b), 500);
    return () => clearInterval(interval);
  }, []);

  useInput((char, key) => {
    if (key.return) {
      onSubmit(input);
      setInput('');
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (char) {
      setInput(prev => prev + char);
    }
  });

  const placeholder = mode === 'command' ? 'command...' : 'message...';

  return (
    <Box flexDirection="column" paddingX={0} width="100%">
      <Box flexDirection="row" width="100%">
        <Text color="blue">{mode === 'command' ? '/ ' : '> '}</Text>
        <Text>{input || ''}</Text>
        {blink && <Text color="white" dimColor>▌</Text>}
      </Box>
      <Box marginTop={0} width="100%" justifyContent="space-between">
        <Text color="gray" dimColor>
          {mode === 'command' ? 'command mode · esc to exit' : 'type a message · / for commands'}
        </Text>
        <Text color="gray" dimColor>ctrl+c to quit</Text>
      </Box>
    </Box>
  );
};
