import logger from './logger';

class FeatureFlagService {
  async initialize() {
    logger.info('Feature flags service initialized (mock)');
  }

  async isEnabled(feature: string, user?: any): Promise<boolean> {
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
    return defaultValue;
  }
}

export const featureFlags = new FeatureFlagService();
