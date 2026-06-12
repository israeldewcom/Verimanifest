import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});
register.registerMetric(httpRequestDurationMicroseconds);

export const activeManifestsGauge = new client.Gauge({
  name: 'active_manifests_total',
  help: 'Total number of active manifests',
  labelNames: ['status'],
});
register.registerMetric(activeManifestsGauge);

export const queueJobsGauge = new client.Gauge({
  name: 'queue_jobs_total',
  help: 'Total jobs in queues',
  labelNames: ['queue', 'status'],
});
register.registerMetric(queueJobsGauge);

export const complianceViolationsCounter = new client.Counter({
  name: 'compliance_violations_total',
  help: 'Total number of compliance violations detected',
  labelNames: ['type'],
});
register.registerMetric(complianceViolationsCounter);

export const blockchainTransactionsCounter = new client.Counter({
  name: 'blockchain_transactions_total',
  help: 'Total number of blockchain transactions',
  labelNames: ['status'],
});
register.registerMetric(blockchainTransactionsCounter);

export const manifestsCreatedCounter = new client.Counter({
  name: 'manifests_created_total',
  help: 'Total number of manifests created',
  labelNames: ['plan'],
});
register.registerMetric(manifestsCreatedCounter);

export const driverLocationUpdatesCounter = new client.Counter({
  name: 'driver_location_updates_total',
  help: 'Total number of GPS location updates received',
});
register.registerMetric(driverLocationUpdatesCounter);
