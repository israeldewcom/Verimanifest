import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { environment } from './environment';
import logger from './logger';

export function initializeTracing() {
  if (!environment.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.info('OpenTelemetry not configured');
    return;
  }

  const traceExporter = new OTLPTraceExporter({
    url: environment.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'verimanifest-api',
      [SemanticResourceAttributes.SERVICE_VERSION]: '5.1.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment.NODE_ENV,
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-ioredis': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
      }),
    ],
  });

  sdk.start();
  logger.info('OpenTelemetry tracing initialized');

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => logger.info('OpenTelemetry tracing shut down'))
      .catch((error) => logger.error('Error shutting down OpenTelemetry', { error }));
  });
}
