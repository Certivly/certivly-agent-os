export interface RuntimeEvent<T = any> {
  id: string;
  eventType: string;
  timestamp: string;
  requestId: string;
  sessionId: string;
  source: string;
  payload: T;
  version: string;
}

export interface EventEnvelope<T = any> {
  event: RuntimeEvent<T>;
  metadata: EventMetadata;
}

export interface EventMetadata {
  persistedAt: string;
  sequenceNumber?: number;
}
