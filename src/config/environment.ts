import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const environment = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  
  DATABASE_URL: requireEnv('DATABASE_URL'),
  DATABASE_READ_URL: process.env.DATABASE_READ_URL || requireEnv('DATABASE_URL'),
  
  REDIS_URL: requireEnv('REDIS_URL'),
  REDIS_CLUSTER_URLS: process.env.REDIS_CLUSTER_URLS?.split(',').filter(Boolean) || [],
  
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET'),
  JWT_EXPIRY: '15m',
  JWT_REFRESH_EXPIRY: '7d',
  
  AWS_REGION: requireEnv('AWS_REGION'),
  AWS_ACCESS_KEY: requireEnv('AWS_ACCESS_KEY'),
  AWS_SECRET_KEY: requireEnv('AWS_SECRET_KEY'),
  S3_BUCKET: requireEnv('S3_BUCKET'),
  CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN || '',
  
  SMTP_HOST: requireEnv('SMTP_HOST'),
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587'),
  SMTP_USER: requireEnv('SMTP_USER'),
  SMTP_PASS: requireEnv('SMTP_PASS'),
  
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',
  
  STRIPE_SECRET_KEY: requireEnv('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: requireEnv('STRIPE_WEBHOOK_SECRET'),
  STRIPE_STARTER_PRICE_ID: process.env.STRIPE_STARTER_PRICE_ID || '',
  STRIPE_PROFESSIONAL_PRICE_ID: process.env.STRIPE_PROFESSIONAL_PRICE_ID || '',
  STRIPE_ENTERPRISE_PRICE_ID: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
  USAGE_PRICE_ID_MANIFEST: process.env.USAGE_PRICE_ID_MANIFEST || '',
  
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
  
  ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL || '',
  ETHEREUM_PRIVATE_KEY: process.env.ETHEREUM_PRIVATE_KEY || '',
  MANIFEST_VERIFICATION_CONTRACT: process.env.MANIFEST_VERIFICATION_CONTRACT || '',
  HYPERLEDGER_CONNECTION_PROFILE: process.env.HYPERLEDGER_CONNECTION_PROFILE || '',
  
  TENSORFLOW_MODEL_PATH: process.env.TENSORFLOW_MODEL_PATH || '',
  WASTE_CLASSIFICATION_API: process.env.WASTE_CLASSIFICATION_API || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  
  AVALARA_ACCOUNT_ID: process.env.AVALARA_ACCOUNT_ID || '',
  AVALARA_LICENSE_KEY: process.env.AVALARA_LICENSE_KEY || '',
  TAXJAR_API_KEY: process.env.TAXJAR_API_KEY || '',
  
  LAUNCHDARKLY_SDK_KEY: process.env.LAUNCHDARKLY_SDK_KEY || '',
  UNLEASH_API_URL: process.env.UNLEASH_API_URL || '',
  
  VAULT_ADDR: process.env.VAULT_ADDR || '',
  VAULT_TOKEN: process.env.VAULT_TOKEN || '',
  
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  NEW_RELIC_LICENSE_KEY: process.env.NEW_RELIC_LICENSE_KEY || '',
  DD_API_KEY: process.env.DD_API_KEY || '',
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '',
  
  BCRYPT_SALT_ROUNDS: 12,
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  RATE_LIMIT_MAX_FREE: parseInt(process.env.RATE_LIMIT_MAX_FREE || '50'),
  RATE_LIMIT_MAX_STARTER: parseInt(process.env.RATE_LIMIT_MAX_STARTER || '200'),
  RATE_LIMIT_MAX_PROFESSIONAL: parseInt(process.env.RATE_LIMIT_MAX_PROFESSIONAL || '1000'),
  RATE_LIMIT_MAX_ENTERPRISE: parseInt(process.env.RATE_LIMIT_MAX_ENTERPRISE || '5000'),
  
  MANIFEST_OVERDUE_DAYS: 35,
  MAX_OFFLINE_SYNC_RETRIES: 5,
  OFFLINE_SYNC_RETRY_DELAY: 60000,
  
  PDF_TEMP_DIR: '/tmp/verimanifest-pdfs',
  
  WS_HEARTBEAT_INTERVAL: 30000,
  WS_MAX_CONNECTIONS: 10000,
  
  CACHE_TTL: 3600,
  SESSION_CACHE_TTL: 1800,
  LOCATION_CACHE_TTL: 300,

  GEOCODER_PROVIDER: process.env.GEOCODER_PROVIDER || 'google',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || '',

  WAREHOUSE_TYPE: process.env.WAREHOUSE_TYPE || 'bigquery',
  BIGQUERY_PROJECT_ID: process.env.BIGQUERY_PROJECT_ID || '',
  BIGQUERY_DATASET: process.env.BIGQUERY_DATASET || 'verimanifest',
  BIGQUERY_CLIENT_EMAIL: process.env.BIGQUERY_CLIENT_EMAIL || '',
  BIGQUERY_PRIVATE_KEY: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
  SNOWFLAKE_ACCOUNT: process.env.SNOWFLAKE_ACCOUNT || '',
  SNOWFLAKE_WAREHOUSE: process.env.SNOWFLAKE_WAREHOUSE || '',
  SNOWFLAKE_DATABASE: process.env.SNOWFLAKE_DATABASE || 'VERIMANIFEST',
  SNOWFLAKE_SCHEMA: process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
  SNOWFLAKE_USER: process.env.SNOWFLAKE_USER || '',
  SNOWFLAKE_PASSWORD: process.env.SNOWFLAKE_PASSWORD || '',

  MARKETPLACE_PLATFORM_FEE_PERCENT: parseFloat(process.env.MARKETPLACE_PLATFORM_FEE_PERCENT || '5'),

  WHITE_LABEL_DEFAULT_LOGO_URL: process.env.WHITE_LABEL_DEFAULT_LOGO_URL || '',
  WHITE_LABEL_DEFAULT_PRIMARY_COLOR: process.env.WHITE_LABEL_DEFAULT_PRIMARY_COLOR || '#2D3748',
  
  APP_URL: process.env.APP_URL || 'http://localhost:3001',
};
