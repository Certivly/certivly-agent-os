import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

export const InputBar: React.FC<{ mode: string, onSubmit: (val: string) => void }> = ({ mode, onSubmit }) => {
  const [input, setInput] = useState('');
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(b => !b);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useInput((char, key) => {
    if (key.return) {
      onSubmit(input);
      setInput('');
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (char && char !== '/') { // Avoid typing '/' in chat mode catching the transition
      setInput(prev => prev + char);
    }
  });

  return (
    <Box flexDirection="column" paddingX={0} width="100%">
      <Box flexDirection="row" width="100%">
        <Text color="blue">{mode === 'command' ? '| /' : '| '} </Text>
        <Text>{input}</Text>
        {blink && <Text color="white">▌</Text>}
      </Box>
      <Box marginTop={0} width="100%" justifyContent="space-between">
        <Box>
          <Text color="blue" dimColor>AgentOS</Text>
          <Text color="gray" dimColor> - Default Model</Text>
        </Box>
        <Text color="gray" dimColor>ctrl+c exit</Text>
      </Box>
    </Box>
  );
};
