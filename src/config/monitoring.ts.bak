import * as Sentry from '@sentry/node';
import { environment } from './environment';
import logger from './logger';

export function initializeMonitoring() {
  if (environment.SENTRY_DSN) {
    Sentry.init({
      dsn: environment.SENTRY_DSN,
      environment: environment.NODE_ENV,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app: require('express')() }),
      ],
    });
    logger.info('Sentry initialized');
  }

  if (environment.DD_API_KEY) {
    const tracer = require('dd-trace');
    tracer.init({
      service: 'verimanifest-api',
      env: environment.NODE_ENV,
      version: '5.1.0',
      profiling: true,
      runtimeMetrics: true,
      logInjection: true,
    });
    logger.info('Datadog APM initialized');
  }

  if (environment.NEW_RELIC_LICENSE_KEY) {
    require('newrelic');
    logger.info('New Relic initialized');
  }
}
