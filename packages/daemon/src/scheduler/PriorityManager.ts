export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

export class PriorityManager {
  public static getPriorityForType(requestType: string): RequestPriority {
    switch (requestType) {
      case 'DAEMON_RECOVERY':
        return RequestPriority.CRITICAL;
      case 'PATCH_VALIDATION':
      case 'SYNCHRONOUS_COMMAND':
        return RequestPriority.HIGH;
      case 'CHAT_MESSAGE':
      case 'EXECUTE':
        return RequestPriority.NORMAL;
      case 'BACKGROUND_INDEXING':
      case 'MEMORY_DISTILLATION':
        return RequestPriority.LOW;
      default:
        return RequestPriority.NORMAL;
    }
  }
}
