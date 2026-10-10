import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { CommandPalette } from './CommandPalette';
import { CommandDispatcher } from '../commands/CommandDispatcher';

export const InputBar: React.FC<{
  mode: string;
  onSubmit: (val: string) => void;
  onToggleMode?: () => void;
}> = ({ mode, onSubmit, onToggleMode }) => {
  const [input, setInput] = useState('');
  const [blink, setBlink] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draftInput, setDraftInput] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setBlink(b => !b), 500);
    return () => clearInterval(interval);
  }, []);

  const isCommandInput = input.startsWith('/');

  // Reset palette index whenever input query changes
  useEffect(() => {
    if (isCommandInput) {
      setPaletteIndex(0);
    }
  }, [input, isCommandInput]);

  useInput((char, key) => {
    // Escape: clear command mode or dismiss slash
    if (key.escape) {
      if (input.startsWith('/')) {
        setInput('');
      }
      return;
    }

    // Ctrl+C: clear current line draft
    if (key.ctrl && char === 'c') {
      if (input.length > 0) {
        setInput('');
        return;
      }
      // If already empty, let Ink handle process exit
      return;
    }

    // Palette navigation when user typed '/'
    if (isCommandInput) {
      const matches = CommandDispatcher.searchCommands(input);

      if (key.upArrow) {
        if (matches.length > 0) {
          setPaletteIndex(prev => (prev > 0 ? prev - 1 : matches.length - 1));
        }
        return;
      }

      if (key.downArrow) {
        if (matches.length > 0) {
          setPaletteIndex(prev => (prev < matches.length - 1 ? prev + 1 : 0));
        }
        return;
      }

      // Tab: auto-complete the selected slash command
      if (key.tab) {
        if (matches.length > 0) {
          const selected = matches[Math.min(paletteIndex, matches.length - 1)];
          setInput(`/${selected.name} `);
        }
        return;
      }
    } else {
      // Normal input history navigation
      if (key.upArrow) {
        if (history.length > 0) {
          const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
          if (historyIndex === -1) {
            setDraftInput(input);
          }
          setHistoryIndex(nextIdx);
          setInput(history[nextIdx]);
        }
        return;
      }

      if (key.downArrow) {
        if (historyIndex !== -1) {
          const nextIdx = historyIndex + 1;
          if (nextIdx >= history.length) {
            setHistoryIndex(-1);
            setInput(draftInput);
          } else {
            setHistoryIndex(nextIdx);
            setInput(history[nextIdx]);
          }
        }
        return;
      }

      // Tab toggles Plan/Build mode when not in command input
      if (key.tab && onToggleMode) {
        onToggleMode();
        return;
      }
    }

    // Enter to submit
    if (key.return) {
      const trimmed = input.trim();
      if (trimmed) {
        setHistory(prev => [...prev.filter(h => h !== trimmed), trimmed]);
        setHistoryIndex(-1);
        setDraftInput('');
        onSubmit(trimmed);
        setInput('');
      }
      return;
    }

    // Backspace / delete
    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    // Regular character input
    if (char && !key.ctrl && !key.meta) {
      setInput(prev => prev + char);
    }
  });

  const isPlanMode = mode === 'plan';
  const modeBadge = isPlanMode ? '[PLAN MODE: Read-Only]' : '[BUILD MODE: Mutations Enabled]';
  const modeBadgeColor = isPlanMode ? 'yellow' : 'green';

  return (
    <Box flexDirection="column" paddingX={0} width="100%">
      {/* Command Palette Dropdown */}
      {isCommandInput && (
        <CommandPalette query={input} selectedIndex={paletteIndex} />
      )}

      {/* Input row */}
      <Box flexDirection="row" width="100%" justifyContent="space-between">
        <Box flexDirection="row">
          <Text color="blue">{input.startsWith('/') ? '/ ' : '❯ '}</Text>
          {input.length === 0 ? (
            <Text color="gray" dimColor>Ask a question, request a change, or type / for commands...</Text>
          ) : (
            <Text color="white">{input}</Text>
          )}
          {blink && <Text color="white" dimColor>▌</Text>}
        </Box>
        <Text color={modeBadgeColor} bold>{modeBadge}</Text>
      </Box>

      {/* Navigation hints */}
      <Box marginTop={0} width="100%" justifyContent="space-between">
        <Text color="gray" dimColor>
          {isCommandInput
            ? '↑↓ navigate commands · Tab to autocomplete · Enter to execute · Esc to cancel'
            : 'type message · / for commands · Tab: toggle mode · Ctrl+D: diff · Ctrl+T: todos'}
        </Text>
        <Text color="gray" dimColor>Ctrl+C: clear/exit</Text>
      </Box>
    </Box>
  );
};
