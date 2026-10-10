/**
 * Token Counter and Estimator.
 * Provides fast, offline token estimations based on character / word heuristics,
 * specialized by model family (Claude, GPT, Gemini, Llama/Ollama).
 */
export class TokenCounter {
  /**
   * Estimates tokens for plain text string using model-family heuristics.
   * Standard English text averages ~4 characters per token (0.25 tokens/char).
   * Code averages ~3.2 characters per token (0.31 tokens/char).
   */
  public static estimate(text: string, options: { isCode?: boolean; model?: string } = {}): number {
    if (!text || text.length === 0) return 0;

    const isCode = options.isCode ?? this.detectIsCode(text);
    const charsPerToken = isCode ? 3.3 : 4.0;
    
    // Slight adjustments based on known model tokenizers
    const model = (options.model ?? '').toLowerCase();
    let multiplier = 1.0;
    if (model.includes('claude')) {
      // Claude tokenizer is slightly more compact on english prose (~3.8 char/token)
      multiplier = 1.05;
    } else if (model.includes('deepseek') || model.includes('qwen')) {
      // CJK characters take more tokens per char if present
      multiplier = this.containsCjk(text) ? 1.4 : 1.0;
    }

    const estimated = Math.ceil((text.length / charsPerToken) * multiplier);
    return Math.max(1, estimated);
  }

  /**
   * Estimates tokens for an array of chat messages.
   * Accounts for message framing overhead (~4 tokens per message).
   */
  public static estimateMessages(
    messages: Array<{ role: string; content: string }>,
    options: { model?: string } = {}
  ): number {
    let total = 0;
    for (const msg of messages) {
      total += 4; // Envelope overhead (<|im_start|>role ... <|im_end|>)
      total += this.estimate(msg.role, options);
      total += this.estimate(msg.content, options);
    }
    total += 3; // Priming tokens
    return total;
  }

  /**
   * Checks if content is likely code.
   */
  private static detectIsCode(text: string): boolean {
    const codeIndicators = ['{', '}', ';', 'const ', 'let ', 'function', 'class ', 'import ', 'def ', 'return '];
    let hits = 0;
    for (const ind of codeIndicators) {
      if (text.includes(ind)) hits++;
      if (hits >= 3) return true;
    }
    return false;
  }

  /**
   * Checks if string contains Chinese/Japanese/Korean characters.
   */
  private static containsCjk(text: string): boolean {
    return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(text);
  }
}
