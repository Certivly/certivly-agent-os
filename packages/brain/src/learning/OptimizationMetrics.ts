import { metrics } from '@agent-os/metrics';

export const OptimizationMetrics = {
  durationSaved:                metrics.counter('optimization_duration_saved_ms'),
  graphReadsSaved:              metrics.counter('optimization_graph_reads_saved'),
  wicerQueriesSaved:            metrics.counter('optimization_wicer_queries_saved'),
  contextRebuildsAvoided:       metrics.counter('optimization_context_rebuilds_avoided'),
  dependencyResolutionsSaved:   metrics.counter('optimization_dependency_resolutions_saved'),
  optimizationSuccessRate:      metrics.counter('optimization_success_rate')
};
