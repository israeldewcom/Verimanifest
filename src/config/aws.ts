import { S3Client } from '@aws-sdk/client-s3';
import { environment } from './environment';

export const s3Client = new S3Client({
  region: environment.AWS_REGION,
  credentials: {
    accessKeyId: environment.AWS_ACCESS_KEY,
    secretAccessKey: environment.AWS_SECRET_KEY,
  },
});
