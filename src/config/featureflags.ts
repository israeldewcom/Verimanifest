import { initialize as ldInitialize, LDClient } from 'launchdarkly-node-server-sdk';
import { initialize as unleashInitialize, Unleash } from 'unleash-client';
import { environment } from './environment';
import logger from './logger';

class FeatureFlagService {
  private ldClient: LDClient | null = null;
  private unleashClient: Unleash | null = null;

  async initialize() {
    if (environment.LAUNCHDARKLY_SDK_KEY) {
      try {
        this.ldClient = ldInitialize(environment.LAUNCHDARKLY_SDK_KEY);
        await this.ldClient.waitForInitialization();
        logger.info('LaunchDarkly initialized');
      } catch (error) {
        logger.error('Failed to initialize LaunchDarkly', { error });
      }
    }

    if (environment.UNLEASH_API_URL) {
      try {
        this.unleashClient = unleashInitialize({
          url: environment.UNLEASH_API_URL,
          appName: 'verimanifest',
        });
        logger.info('Unleash initialized');
      } catch (error) {
        logger.error('Failed to initialize Unleash', { error });
      }
    }
  }

  async isEnabled(feature: string, user?: any): Promise<boolean> {
    if (this.ldClient) {
      try {
        return await this.ldClient.variation(feature, user || { key: 'anonymous' }, false);
      } catch (error) {
        logger.warn('LaunchDarkly evaluation failed, using defaults', { feature, error });
      }
    }

    if (this.unleashClient) {
      try {
        return this.unleashClient.isEnabled(feature);
      } catch (error) {
        logger.warn('Unleash evaluation failed, using defaults', { feature, error });
      }
    }

    const defaults: Record<string, boolean> = {
      'blockchain-verification': false,
      'ai-waste-classification': true,
      'marketplace': true,
      'advanced-analytics': true,
      'white-label': false,
      'multi-currency': false,
      'route-optimization': true,
      'tax-automation': true,
    };

    return defaults[feature] || false;
  }

  async getVariation(feature: string, user: any, defaultValue: any): Promise<any> {
    if (this.ldClient) {
      return await this.ldClient.variation(feature, user, defaultValue);
    }
    return defaultValue;
  }
}

export const featureFlags = new FeatureFlagService();
