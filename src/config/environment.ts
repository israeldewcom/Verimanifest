import dotenv from 'dotenv';
dotenv.config();

export const environment = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://verimanifest:verimanifest@localhost:5432/verimanifest',
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  JWT_EXPIRY: '15m',
  JWT_REFRESH_EXPIRY: '7d',
  
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY || 'dummy',
  AWS_SECRET_KEY: process.env.AWS_SECRET_KEY || 'dummy',
  S3_BUCKET: process.env.S3_BUCKET || 'verimanifest-documents',
  
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',
  
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  USAGE_PRICE_ID_MANIFEST: process.env.USAGE_PRICE_ID_MANIFEST || '',
  
  BCRYPT_SALT_ROUNDS: 12,
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX_FREE: 50,
  MANIFEST_OVERDUE_DAYS: 35,
  
  CACHE_TTL: 3600,
  LOCATION_CACHE_TTL: 300,
  WS_HEARTBEAT_INTERVAL: 30000,
  
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
  
  MARKETPLACE_PLATFORM_FEE_PERCENT: 5,
  WHITE_LABEL_DEFAULT_LOGO_URL: process.env.WHITE_LABEL_DEFAULT_LOGO_URL || '',
  WHITE_LABEL_DEFAULT_PRIMARY_COLOR: process.env.WHITE_LABEL_DEFAULT_PRIMARY_COLOR || '#2D3748',
  APP_URL: process.env.APP_URL || 'http://localhost:3001',
  
  ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL || '',
  ETHEREUM_PRIVATE_KEY: process.env.ETHEREUM_PRIVATE_KEY || '',
  MANIFEST_VERIFICATION_CONTRACT: process.env.MANIFEST_VERIFICATION_CONTRACT || '',
  
  AVALARA_ACCOUNT_ID: process.env.AVALARA_ACCOUNT_ID || '',
  AVALARA_LICENSE_KEY: process.env.AVALARA_LICENSE_KEY || '',
  TAXJAR_API_KEY: process.env.TAXJAR_API_KEY || '',
};
