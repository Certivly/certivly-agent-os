import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { AgentRuntime } from '@agent-os/agent-runtime';
import { logger } from '@agent-os/shared';

interface ChatProps {
  runtime: AgentRuntime;
  sessionId: string;
  onExit: () => void;
}

export const ChatApp = ({ runtime, sessionId, onExit }: ChatProps) => {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useInput((char, key) => {
    if (key.return) {
      if (input.toLowerCase() === 'exit') {
        onExit();
        return;
      }
      if (input.trim() && !isProcessing) {
        handleSend();
      }
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else {
      setInput(prev => prev + char);
    }
  });

  const handleSend = async () => {
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsProcessing(true);

    try {
      // Pass true for streaming
      const response = await runtime.handleRequest(sessionId, userMsg, true);
      
      if (typeof response === 'string') {
        setMessages(prev => [...prev, { role: 'agent', content: response }]);
      } else {
        // It's an AsyncIterable
        let currentContent = '';
        setMessages(prev => [...prev, { role: 'agent', content: '' }]);
        for await (const chunk of response) {
          currentContent += chunk;
          setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1].content = currentContent;
            return newMsgs;
          });
        }
      }
    } catch (e: any) {
      logger.error('cli', 'chat.error', `Error processing request: ${e.message}`);
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${e.message}` }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green">Started chat session: {sessionId}</Text>
      <Text color="gray">Type 'exit' to quit.</Text>
      <Box flexDirection="column" marginY={1}>
        {messages.map((m, i) => (
          <Text key={i}>
            <Text color={m.role === 'user' ? 'blue' : m.role === 'agent' ? 'yellow' : 'red'}>
              {m.role === 'user' ? 'You: ' : m.role === 'agent' ? 'Agent: ' : 'System: '}
            </Text>
            {m.content}
          </Text>
        ))}
      </Box>
      <Box>
        <Text color="cyan">Prompt: </Text>
        <Text>{input}</Text>
      </Box>
      {isProcessing && <Text color="yellow">Agent is thinking...</Text>}
    </Box>
  );
};
