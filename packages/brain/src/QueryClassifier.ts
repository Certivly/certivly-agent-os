import { BrainQuery, QueryType } from './models';

export class QueryClassifier {
  /**
   * Classifies a BrainQuery string into a specific QueryType.
   * Uses heuristics to map query keywords to intents.
   */
  public classify(queryStr: string): QueryType {
    const lowerQuery = queryStr.toLowerCase();

    if (lowerQuery.includes('architecture') || lowerQuery.includes('design') || lowerQuery.includes('structure')) {
      return QueryType.ARCHITECTURE;
    }
    if (lowerQuery.includes('who calls') || lowerQuery.includes('where is') || lowerQuery.includes('symbol')) {
      return QueryType.SYMBOL;
    }
    if (lowerQuery.includes('depend') || lowerQuery.includes('import') || lowerQuery.includes('use')) {
      return QueryType.DEPENDENCY;
    }
    if (lowerQuery.includes('flow') || lowerQuery.includes('execution') || lowerQuery.includes('process')) {
      return QueryType.EXECUTION;
    }
    if (lowerQuery.includes('why') || lowerQuery.includes('history') || lowerQuery.includes('change')) {
      return QueryType.HISTORY;
    }
    if (lowerQuery.includes('convention') || lowerQuery.includes('pattern') || lowerQuery.includes('rule')) {
      return QueryType.CONVENTION;
    }
    if (lowerQuery.includes('bug') || lowerQuery.includes('issue') || lowerQuery.includes('error')) {
      return QueryType.BUG;
    }
    if (lowerQuery.includes('feature') || lowerQuery.includes('implement')) {
      return QueryType.FEATURE;
    }

    return QueryType.UNKNOWN;
  }
}
