export const DaemonMetrics = {
  UPTIME: 'daemon_uptime',
  CLIENTS: 'daemon_clients',
  SESSIONS: 'daemon_sessions',
  REPOSITORIES: 'daemon_repositories',
  REQUESTS: 'daemon_requests',
  REQUEST_DURATION: 'daemon_request_duration',
  CACHE_HITS: 'repository_cache_hits',
  CACHE_MISSES: 'repository_cache_misses',
  RECOVERIES: 'session_recoveries'
} as const;
