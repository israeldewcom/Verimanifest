import winston from 'winston';
import { environment } from './environment';

const logger = winston.createLogger({
  level: environment.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'verimanifest-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});

if (environment.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ filename: 'error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'combined.log' }));
  
  if (process.env.CLOUDWATCH_LOG_GROUP) {
    const CloudWatchTransport = require('winston-cloudwatch');
    logger.add(new CloudWatchTransport({
      logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
      logStreamName: process.env.CLOUDWATCH_LOG_STREAM || 'verimanifest-api',
      awsRegion: environment.AWS_REGION,
    }));
  }
}

export default logger;
