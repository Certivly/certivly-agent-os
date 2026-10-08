import type { ApprovalRequest, ApprovalHandler } from '@agent-os/agent-runtime';

export interface PendingApprovalEntry {
  id: string;
  request: ApprovalRequest;
  resolve: (value: { approved: boolean; reason?: string }) => void;
  createdAt: number;
}

export class InteractiveApprovalBridge {
  private pending = new Map<string, PendingApprovalEntry>();

  /**
   * Request approval for a tool invocation.
   * Bound as an arrow function so it can be passed directly as an ApprovalHandler.
   */
  public requestApproval: ApprovalHandler = (
    req: ApprovalRequest
  ): Promise<{ approved: boolean; reason?: string }> => {
    return new Promise<{ approved: boolean; reason?: string }>((resolve) => {
      const id = req.toolCallId || `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry: PendingApprovalEntry = {
        id,
        request: req,
        resolve,
        createdAt: Date.now(),
      };
      this.pending.set(id, entry);
    });
  };

  /**
   * Checks if there are any approval requests currently awaiting user decision.
   */
  public hasPending(): boolean {
    return this.pending.size > 0;
  }

  /**
   * Returns all pending approval requests in order of creation.
   */
  public getPending(): PendingApprovalEntry[] {
    return Array.from(this.pending.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Decides a pending approval request.
   * Matches by exact id, toolCallId, prefixed id, or oldest pending if single.
   */
  public decide(id?: string, approved: boolean = true, reason?: string): boolean {
    if (this.pending.size === 0) {
      return false;
    }

    let targetKey: string | undefined;

    if (id) {
      if (this.pending.has(id)) {
        targetKey = id;
      } else {
        // Search by request toolCallId or variations
        for (const [key, entry] of this.pending.entries()) {
          if (
            entry.request.toolCallId === id ||
            entry.id === id ||
            id === `appr-${entry.request.toolCallId}` ||
            entry.id === `appr-${id}`
          ) {
            targetKey = key;
            break;
          }
        }
      }
    }

    // Fallback: If no match found by id but exactly 1 pending, resolve that one
    if (!targetKey && this.pending.size === 1) {
      targetKey = this.pending.keys().next().value;
    }

    if (!targetKey) {
      return false;
    }

    const entry = this.pending.get(targetKey)!;
    this.pending.delete(targetKey);
    entry.resolve({ approved, reason });
    return true;
  }

  /**
   * Cancel and reject all pending requests.
   */
  public cancelAll(reason: string = 'Cancelled'): void {
    for (const [key, entry] of this.pending.entries()) {
      entry.resolve({ approved: false, reason });
      this.pending.delete(key);
    }
  }
}
