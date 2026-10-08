import { ChangeSetApplier, ChangeSetStore } from '@agent-os/patch-engine';
import type { EventBus } from '@agent-os/shared';

export interface ApprovalHandlerOptions {
  eventBus?: EventBus;
  sessionId?: string;
  workspaceRoot?: string;
  store?: ChangeSetStore;
}

export async function handleApprove(
  changeSetId: string,
  options: ApprovalHandlerOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const store = options.store ?? new ChangeSetStore();
  const sessionId = options.sessionId ?? 'default';
  const workspaceRoot = options.workspaceRoot ?? process.cwd();

  try {
    const changeSet = store.load(changeSetId);
    if (!changeSet) {
      const errMsg = `[Approval Error]: ChangeSet ${changeSetId} not found. Was the run completed?`;
      options.eventBus?.publish('message.responded', {
        sessionId,
        response: errMsg,
      });
      return { success: false, error: errMsg };
    }

    const applier = new ChangeSetApplier();
    const result = await applier.applyChangeSet(workspaceRoot, changeSet);

    if (!result.applied) {
      const reasons = result.conflicts
        .map(c => `${c.path}: ${c.reason}`)
        .concat(result.errors)
        .join('; ');
      const errMsg = `[Approval Error]: Failed to apply changeset: ${reasons || 'unknown conflict'}`;
      options.eventBus?.publish('message.responded', {
        sessionId,
        response: errMsg,
      });
      return { success: false, error: errMsg };
    }

    const successMsg = `[Applied] ${changeSet.files.length} file(s) changed. Run ID: ${changeSetId}`;
    options.eventBus?.publish('message.responded', {
      sessionId,
      response: successMsg,
    });
    options.eventBus?.publish('approval.decided', {
      sessionId,
      changeSetId,
      approved: true,
    });

    return { success: true };
  } catch (err: any) {
    const errMsg = `[Approval Error]: ${err.message || String(err)}`;
    options.eventBus?.publish('message.responded', {
      sessionId,
      response: errMsg,
    });
    return { success: false, error: errMsg };
  }
}

export async function handleReject(
  changeSetId: string,
  options: ApprovalHandlerOptions = {}
): Promise<void> {
  const store = options.store ?? new ChangeSetStore();
  const sessionId = options.sessionId ?? 'default';

  store.delete(changeSetId);

  const responseMsg = `[Rejected] ChangeSet ${changeSetId} discarded.`;
  options.eventBus?.publish('message.responded', {
    sessionId,
    response: responseMsg,
  });
  options.eventBus?.publish('approval.decided', {
    sessionId,
    changeSetId,
    approved: false,
    reason: 'User rejected changeset',
  });
}
