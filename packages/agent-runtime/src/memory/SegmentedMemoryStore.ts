export interface EpisodicItem {
  turn: number;
  role: 'user' | 'assistant' | 'tool';
  summary: string;
  filesInspected?: string[];
  filesModified?: string[];
  toolCalls?: string[];
  timestamp: number;
}

export interface LongTermFact {
  id: string;
  category: 'convention' | 'architecture' | 'dependency' | 'user_preference';
  content: string;
  tags: string[];
  confidence: number;
  source?: string;
  updatedAt: number;
}

export interface TaskPlanItem {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dependencies?: string[];
  notes?: string;
}

export class SegmentedMemoryStore {
  private episodic: EpisodicItem[] = [];
  private longTerm: Map<string, LongTermFact> = new Map();
  private taskPlan: TaskPlanItem[] = [];
  private currentGoal: string = '';

  constructor(options?: {
    initialFacts?: LongTermFact[];
    initialPlan?: TaskPlanItem[];
  }) {
    if (options?.initialFacts) {
      for (const fact of options.initialFacts) {
        this.longTerm.set(fact.id, fact);
      }
    }
    if (options?.initialPlan) {
      this.taskPlan = [...options.initialPlan];
    }
  }

  // --- 1. Episodic Memory (Current Session Turns) ---
  public recordEpisodic(item: Omit<EpisodicItem, 'timestamp'>): void {
    this.episodic.push({
      ...item,
      timestamp: Date.now(),
    });
  }

  public getEpisodicHistory(limit: number = 10): EpisodicItem[] {
    return this.episodic.slice(-limit);
  }

  public clearEpisodic(): void {
    this.episodic = [];
  }

  // --- 2. Long-Term Memory (Persistent Invariants & Conventions) ---
  public rememberFact(fact: Omit<LongTermFact, 'updatedAt'>): void {
    this.longTerm.set(fact.id, {
      ...fact,
      updatedAt: Date.now(),
    });
  }

  public forgetFact(factId: string): boolean {
    return this.longTerm.delete(factId);
  }

  public queryLongTerm(query: string, limit: number = 5): LongTermFact[] {
    const qLower = query.toLowerCase().trim();
    const qTerms = qLower.split(/\s+/).filter(Boolean);
    const facts = Array.from(this.longTerm.values());

    if (qTerms.length === 0) {
      return facts.slice(0, limit);
    }

    // Score facts by keyword and tag matches
    const scored = facts.map(f => {
      let score = 0;
      const contentLower = f.content.toLowerCase();
      for (const term of qTerms) {
        if (contentLower.includes(term)) score += 2;
        if (f.tags.some(t => t.toLowerCase().includes(term))) score += 3;
        if (f.category.toLowerCase().includes(term)) score += 1;
      }
      return { fact: f, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.fact);
  }

  public listAllFacts(): LongTermFact[] {
    return Array.from(this.longTerm.values());
  }

  // --- 3. Prospective Task Plan Memory ---
  public setGoal(goal: string): void {
    this.currentGoal = goal;
  }

  public getGoal(): string {
    return this.currentGoal;
  }

  public setTaskPlan(tasks: TaskPlanItem[]): void {
    this.taskPlan = [...tasks];
  }

  public updateTaskStatus(taskId: string, status: TaskPlanItem['status'], notes?: string): boolean {
    const target = this.taskPlan.find(t => t.id === taskId);
    if (!target) return false;
    target.status = status;
    if (notes) target.notes = notes;
    return true;
  }

  public getTaskPlan(): TaskPlanItem[] {
    return [...this.taskPlan];
  }

  /**
   * Formats a Qwen-Code-style compact unified prompt section for token-thrifty retrieval.
   */
  public formatContextPrompt(currentQuery?: string): string {
    const sections: string[] = [];

    // Long-Term Conventions Section
    const relevantFacts = currentQuery ? this.queryLongTerm(currentQuery, 4) : this.listAllFacts().slice(0, 4);
    if (relevantFacts.length > 0) {
      sections.push('### [Long-Term Guidelines & Architecture Invariants]');
      for (const f of relevantFacts) {
        sections.push(`- [${f.category.toUpperCase()}] ${f.content}`);
      }
    }

    // Prospective Task Plan Section
    if (this.currentGoal || this.taskPlan.length > 0) {
      sections.push('### [Task Plan & Milestones]');
      if (this.currentGoal) {
        sections.push(`Active Goal: ${this.currentGoal}`);
      }
      for (const t of this.taskPlan) {
        const marker = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[>]' : '[ ]';
        sections.push(`- ${marker} (${t.id}) ${t.description}`);
      }
    }

    // Recent Episodic Actions
    const recentTurns = this.getEpisodicHistory(3);
    if (recentTurns.length > 0) {
      sections.push('### [Recent Turn Digest]');
      for (const turn of recentTurns) {
        sections.push(`- Turn ${turn.turn} (${turn.role}): ${turn.summary.slice(0, 120)}`);
      }
    }

    return sections.join('\n\n');
  }
}
