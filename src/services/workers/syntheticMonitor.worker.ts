import { syntheticMonitor } from '../services/syntheticMonitor';
import logger from '../config/logger';

async function run() {
  try {
    const result = await syntheticMonitor.runHealthCheck();
    if (!result.checks || Object.values(result.checks).some((c: any) => !c.success)) {
      logger.error('Initial synthetic health check failed', result);
    } else {
      logger.info('Initial synthetic health check passed');
    }
    await syntheticMonitor.runCriticalPathTest();
  } catch (error) {
    logger.error('Synthetic monitor startup failed', { error });
  }
}

run();

setInterval(async () => {
  try {
    await syntheticMonitor.runHealthCheck();
  } catch (error) {
    logger.error('Synthetic monitor error', { error });
  }
}, 5 * 60 * 1000);

logger.info('Synthetic monitor worker started');
