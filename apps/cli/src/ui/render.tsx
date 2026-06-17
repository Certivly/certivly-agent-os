import React from 'react';
import { render } from 'ink';
import { App } from './App';
import { EventBatcher } from '../bridge/EventStreamAdapter';

export const mountInkApp = (sessionId: string, batcher: EventBatcher, onInput: (input: string, mode: string) => void) => {
  return render(<App sessionId={sessionId} batcher={batcher} onInput={onInput} />);
};
