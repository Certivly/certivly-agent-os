import { metrics } from '@agent-os/metrics';

export const SEOLMetrics = {
  durationSaved: metrics.counter('execution_duration_saved'),
  graphReadsSaved: metrics.counter('graph_reads_saved'),
  wicerQueriesSaved: metrics.counter('wicer_queries_saved'),
  contextRebuildsAvoided: metrics.counter('context_rebuilds_avoided'),
  dependencyResolutionsSaved: metrics.counter('dependency_resolutions_saved'),
  optimizationSuccessRate: metrics.counter('optimization_success_rate')
};
