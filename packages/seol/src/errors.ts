import { AgentError } from '@agent-os/shared';

export class SeolSafetyViolationError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'SeolSafetyViolationError';
  }
}
