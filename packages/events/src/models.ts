export interface RuntimeEvent {
  id: string;
  eventType: string;
  timestamp: string;
  requestId: string;
  sessionId: string;
  source: string;
  payload: any;
  version: string;
}

export interface EventEnvelope {
  event: RuntimeEvent;
  metadata: EventMetadata;
}

export interface EventMetadata {
  persistedAt: string;
  sequenceNumber?: number;
}
