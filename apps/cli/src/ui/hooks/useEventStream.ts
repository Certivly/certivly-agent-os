import { useState, useEffect } from 'react';
import { UIEvent, EventBatcher } from '../../bridge/EventStreamAdapter';
import { ReplayAdapter } from '../../bridge/ReplayAdapter';
import { projectApprovalState, type ApprovalRequestData } from '../approval/ApprovalHelper';


export type AgentState = 'idle' | 'thinking' | 'executing_tools' | 'streaming_response' | 'complete';

export type ToolExecution = {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  result?: any;
  status: 'running' | 'completed' | 'error';
  durationMs?: number;
};

export type TodoItem = {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'normal' | 'high';
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  toolExecutions?: ToolExecution[];
  turn?: number;
  antiLoopIntervention?: string;
};

export type TraceNode = {
  id: string;
  type: string;
  name: string;
  children: TraceNode[];
};

export type UIProjection = {
  lastEvents: UIEvent[];
  activeSkills: string[];
  traceTree: TraceNode[];
  chatHistory: ChatMessage[];
  streamingBuffer: string;
  activeStreamingMessageId: string | null;
  activeMcpCount: number;
  agentState: AgentState;
  narrativeState?: any;
  narrativeSummary?: any;
  providerStatus: 'unknown' | 'ok' | 'error';
  providerError?: string;
  pendingApproval?: ApprovalRequestData | null;
  todos: TodoItem[];
  turnCount: number;
  tokenStats?: { input: number; output: number; total: number };
  activeModelId?: string;
};


export const reduceBatch = (batch: UIEvent[], state: UIProjection): UIProjection => {
  const newState = { 
    ...state, 
    lastEvents: [...state.lastEvents],
    chatHistory: [...state.chatHistory],
    traceTree: [...state.traceTree]
  };
  
  for (const event of batch) {
    // Normalization mapping
    let normalizedEvent = { ...event };
    
    if (event.type === 'skill.execution.started') {
      newState.activeSkills.push(event.payload?.skillId || 'unknown');
      newState.traceTree.push({ id: event.id, type: 'skill', name: event.payload?.skillId || 'unknown', children: [] });
    } else if (event.type === 'mcp.connection.started') {
      newState.activeMcpCount++;
    }

    if (event.type === 'provider.request.started') {
      newState.agentState = 'thinking';
      normalizedEvent.type = 'ui.thinking';
      normalizedEvent.payload = { text: 'Agent is thinking...' };
    } else if (event.type === 'tool.execution.started' || event.type === 'tool.call.started') {
      newState.agentState = 'executing_tools';
      normalizedEvent.type = 'ui.tool_run';
      const toolName = event.payload?.toolName || 'unknown';
      normalizedEvent.payload = { text: `Running tool: ${toolName}` };
      
      let targetMsgIdx = newState.chatHistory.findIndex(m => m.id === newState.activeStreamingMessageId);
      if (targetMsgIdx === -1) targetMsgIdx = newState.chatHistory.length - 1;

      const lastMsg = newState.chatHistory[targetMsgIdx];
      if (lastMsg && lastMsg.role === 'assistant') {
        const newToolExecutions = lastMsg.toolExecutions ? [...lastMsg.toolExecutions] : [];
        newToolExecutions.push({
          id: event.payload?.toolCallId || event.id,
          name: toolName,
          args: event.payload?.args,
          status: 'running',
        });
        newState.chatHistory[targetMsgIdx] = {
          ...lastMsg,
          toolExecutions: newToolExecutions
        };
      }
    } else if (event.type === 'tool.execution.result.captured' || event.type === 'tool.call.completed') {
      let targetMsgIdx = newState.chatHistory.findIndex(m => m.id === newState.activeStreamingMessageId);
      if (targetMsgIdx === -1) targetMsgIdx = newState.chatHistory.length - 1;

      const lastMsg = newState.chatHistory[targetMsgIdx];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolExecutions) {
        const callId = event.payload?.toolCallId;
        const toolName = event.payload?.toolName;
        const newToolExecutions = lastMsg.toolExecutions.map(t => {
          const isMatch = callId ? (t.id === callId || t.name === toolName) : (t.name === toolName && t.status === 'running');
          if (isMatch && t.status === 'running') {
            const isError = event.payload?.result?.isError || event.payload?.isError;
            return {
              ...t,
              status: isError ? ('error' as const) : ('completed' as const),
              result: event.payload?.result ?? event.payload
            };
          }
          return t;
        });
        newState.chatHistory[targetMsgIdx] = {
          ...lastMsg,
          toolExecutions: newToolExecutions
        };
      }
    } else if (event.type === 'llm.token.stream' || event.type === 'message.delta') {
      newState.agentState = 'streaming_response';
      const delta = event.payload?.delta || event.payload?.token || '';
      newState.streamingBuffer += delta;
      
      let targetMsgIdx = newState.chatHistory.findIndex(m => m.id === newState.activeStreamingMessageId);
      if (targetMsgIdx === -1) targetMsgIdx = newState.chatHistory.length - 1;

      const lastMsg = newState.chatHistory[targetMsgIdx];
      if (lastMsg && lastMsg.role === 'assistant') {
        newState.chatHistory[targetMsgIdx] = {
          ...lastMsg,
          content: newState.streamingBuffer,
          streaming: true
        };
      }
    } else if (event.type === 'todo.updated') {
      if (Array.isArray(event.payload?.todos)) {
        newState.todos = event.payload.todos;
      }
    } else if (event.type === 'agent.loop.turn.started') {
      newState.turnCount = event.payload?.turn ?? (newState.turnCount + 1);
    } else if (event.type === 'agent.loop.anti_loop_triggered') {
      const intervention = event.payload?.intervention || 'Anti-loop intervention triggered';
      let targetMsgIdx = newState.chatHistory.findIndex(m => m.id === newState.activeStreamingMessageId);
      if (targetMsgIdx === -1) targetMsgIdx = newState.chatHistory.length - 1;
      const lastMsg = newState.chatHistory[targetMsgIdx];
      if (lastMsg) {
        newState.chatHistory[targetMsgIdx] = {
          ...lastMsg,
          antiLoopIntervention: intervention,
        };
      }
    } else if (event.type === 'agent.loop.completed') {
      newState.agentState = 'idle';
      const summary = event.payload?.summary;
      if (summary) {
        if (summary.approxInputTokens || summary.approxOutputTokens) {
          newState.tokenStats = {
            input: summary.approxInputTokens || 0,
            output: summary.approxOutputTokens || 0,
            total: (summary.approxInputTokens || 0) + (summary.approxOutputTokens || 0),
          };
        }
      }
      let targetMsgIdx = newState.chatHistory.findIndex(m => m.id === newState.activeStreamingMessageId);
      if (targetMsgIdx === -1) targetMsgIdx = newState.chatHistory.length - 1;
      const lastMsg = newState.chatHistory[targetMsgIdx];
      if (lastMsg && lastMsg.role === 'assistant') {
        newState.chatHistory[targetMsgIdx] = {
          ...lastMsg,
          content: lastMsg.content || summary?.finalText || '',
          streaming: false,
        };
      }
      newState.streamingBuffer = '';
      newState.activeStreamingMessageId = null;
    } else if (event.type === 'provider.request.completed') {
      newState.agentState = 'complete';
      newState.streamingBuffer = ''; // reset buffer after completion
      
      let targetMsgIdx = newState.chatHistory.findIndex(m => m.id === newState.activeStreamingMessageId);
      if (targetMsgIdx === -1) targetMsgIdx = newState.chatHistory.length - 1;

      const lastMsg = newState.chatHistory[targetMsgIdx];
      if (lastMsg && lastMsg.role === 'assistant') {
        newState.chatHistory[targetMsgIdx] = {
          ...lastMsg,
          streaming: false
        };
      }
      newState.activeStreamingMessageId = null;
    } else if (event.type === 'message.responded') {
      newState.agentState = 'idle';
      
      let targetMsgIdx = newState.chatHistory.findIndex(m => m.id === newState.activeStreamingMessageId);
      if (targetMsgIdx === -1) targetMsgIdx = newState.chatHistory.length - 1;

      const lastMsg = newState.chatHistory[targetMsgIdx];
      if (lastMsg && lastMsg.role === 'assistant') {
        newState.chatHistory[targetMsgIdx] = {
          ...lastMsg,
          content: event.payload?.response || '',
          streaming: false
        };
      }
      newState.activeStreamingMessageId = null;
    } else if (event.type === 'message.received') {
      newState.agentState = 'idle';
      newState.chatHistory.push({ id: event.id, role: 'user', content: event.payload?.input || '' });
      const astId = event.id + '-ast';
      newState.chatHistory.push({ id: astId, role: 'assistant', content: '', toolExecutions: [], streaming: false });
      newState.activeStreamingMessageId = astId;
    } else if (event.type.startsWith('narrative.activity.')) {
      if (event.payload?.snapshot) {
        newState.narrativeState = event.payload.snapshot;
      }
    } else if (event.type === 'narrative.summary.generated') {
      if (event.payload?.summary) {
        newState.narrativeSummary = event.payload.summary;
      }
    } else if (event.type === 'provider.health.ok') {
      newState.providerStatus = 'ok';
    } else if (event.type === 'provider.health.failed') {
      newState.providerStatus = 'error';
      newState.providerError = event.payload?.error;
    } else if (event.type === 'approval.requested') {
      newState.pendingApproval = projectApprovalState(event.payload || {});
    } else if (event.type === 'approval.decided') {
      newState.pendingApproval = null;
    }

    
    // Developer mode filtered logs
    if (event.type !== 'llm.token.stream' && event.type !== 'message.delta') {
      newState.lastEvents.push(normalizedEvent);
    }
  } // END OF FOR LOOP
  
  // Truncate events for performance (windowing)
  if (newState.lastEvents.length > 200) {
    newState.lastEvents = newState.lastEvents.slice(-200);
  }

  if (newState.streamingBuffer.length > 20000) {
    newState.streamingBuffer = newState.streamingBuffer.slice(-20000);
  }

  if (newState.traceTree.length > 1000) {
    newState.traceTree = newState.traceTree.slice(-1000);
  }

  return newState;
};

export const useEventStream = (source: EventBatcher | ReplayAdapter | null) => {
  const [state, setState] = useState<UIProjection>({
    lastEvents: [],
    activeSkills: [],
    traceTree: [],
    chatHistory: [],
    streamingBuffer: '',
    activeStreamingMessageId: null,
    activeMcpCount: 0,
    agentState: 'idle',
    providerStatus: 'unknown',
    todos: [],
    turnCount: 0,
  });

  useEffect(() => {
    if (!source) return;

    const handler = (batch: UIEvent[]) => {
      setState(prev => reduceBatch(batch, prev));
    };

    source.subscribe(handler);
    
    // Since our simple EventBatcher doesn't have unsubscribe in the prompt, we'll assume it lives for the session
  }, [source]);

  return state;
};
