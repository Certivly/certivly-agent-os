export const SandboxEvents = {
  CREATED: 'sandbox.created',
  DESTROYED: 'sandbox.destroyed',
  
  COMMAND_STARTED: 'sandbox.command.started',
  COMMAND_COMPLETED: 'sandbox.command.completed',
  
  FILE_READ: 'sandbox.file.read',
  FILE_WRITTEN: 'sandbox.file.written',
  FILE_DELETED: 'sandbox.file.deleted',
  
  PATCH_GENERATED: 'sandbox.patch.generated',
  
  VALIDATION_STARTED: 'sandbox.validation.started',
  VALIDATION_COMPLETED: 'sandbox.validation.completed',
  VALIDATION_PASSED: 'sandbox.validation.passed',
  VALIDATION_FAILED: 'sandbox.validation.failed'
};
