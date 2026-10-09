import { useState } from 'react';

export type UIState = {
  mode: 'chat' | 'command' | 'replay' | 'debug' | 'plan';
  sessionId: string;
  focus: 'left' | 'center' | 'right';
};

export const useAgentSession = (initialSessionId: string) => {
  const [state, setState] = useState<UIState>({
    mode: 'chat',
    sessionId: initialSessionId,
    focus: 'center'
  });

  const setMode = (mode: UIState['mode']) => setState(s => ({ ...s, mode }));
  const setFocus = (focus: UIState['focus']) => setState(s => ({ ...s, focus }));

  return { state, setMode, setFocus };
};
