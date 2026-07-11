import { AgentError } from '@agent-os/shared';

/** Thrown when SEOL optimization violates immutability constraints. */
export class OptimizationSafetyViolationError extends AgentError {
  constructor(message: string) {
    super(message, 'OptimizationSafetyViolationError');
  }
}
