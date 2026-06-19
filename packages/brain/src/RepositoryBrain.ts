import { BrainQuery, BrainResponse } from './models';
import { QueryClassifier } from './QueryClassifier';
import { RetrievalPlanner } from './RetrievalPlanner';
import { HybridRetriever } from './retrieval/HybridRetriever';
import { KnowledgeScorer } from './KnowledgeScorer';
import { KnowledgeRanker } from './KnowledgeRanker';
import { ContextAssembler } from './ContextAssembler';
import { RetrievalSession } from './RetrievalSession';
import { LearningFeedbackEngine } from './LearningFeedbackEngine';

// Assuming we have an event emitter from packages/events
export interface EventEmitter {
  emit(event: string, payload: any): void;
}

export class RepositoryBrain {
  private queryClassifier: QueryClassifier;
  private retrievalPlanner: RetrievalPlanner;
  private hybridRetriever: HybridRetriever;
  private knowledgeScorer: KnowledgeScorer;
  private knowledgeRanker: KnowledgeRanker;
  private contextAssembler: ContextAssembler;
  private feedbackEngine: LearningFeedbackEngine;
  private eventEmitter?: EventEmitter;

  constructor(
    hybridRetriever: HybridRetriever,
    eventEmitter?: EventEmitter
  ) {
    this.queryClassifier = new QueryClassifier();
    this.retrievalPlanner = new RetrievalPlanner();
    this.hybridRetriever = hybridRetriever;
    this.knowledgeScorer = new KnowledgeScorer();
    this.knowledgeRanker = new KnowledgeRanker();
    this.contextAssembler = new ContextAssembler();
    this.feedbackEngine = new LearningFeedbackEngine();
    this.eventEmitter = eventEmitter;
  }

  /**
   * The core entry point for answering questions from the repository intelligence engine.
   */
  public async answer(query: BrainQuery): Promise<BrainResponse> {
    const session = new RetrievalSession(query);
    
    this.emitEvent('brain.query.started', { sessionId: session.id, query });

    // Step 1: Classify
    const intent = this.queryClassifier.classify(query.query);
    query.intent = intent;

    // Step 2: Plan
    const plan = this.retrievalPlanner.plan(query);

    // Step 3: Retrieve
    this.emitEvent('brain.retrieval.started', { sessionId: session.id, plan });
    const retrievedItems = await this.hybridRetriever.retrieve(query, plan);
    session.retrievedItems = retrievedItems;
    this.emitEvent('brain.retrieval.completed', { sessionId: session.id, count: retrievedItems.length });

    // Step 4: Score & Rank
    const scoredItems = this.knowledgeScorer.score(query, retrievedItems);
    const rankedKnowledge = this.knowledgeRanker.rank(query, scoredItems);
    session.rankedKnowledge = rankedKnowledge;

    // Step 5: Assemble Context
    const context = this.contextAssembler.assemble(query, rankedKnowledge);
    session.context = context;
    this.emitEvent('brain.context.assembled', { sessionId: session.id, score: context.score });

    // Step 6: Learning Feedback
    this.feedbackEngine.observeRetrieval(rankedKnowledge);

    this.emitEvent('brain.answer.generated', { sessionId: session.id, duration: session.getDuration() });

    return session.toResponse();
  }

  private emitEvent(event: string, payload: any): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event, payload);
    }
  }
}
