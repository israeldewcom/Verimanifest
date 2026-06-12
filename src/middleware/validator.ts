import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../utils/AppError';

export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    const result = schema.safeParse(data);
    
    if (!result.success) {
      const errors = result.error.flatten();
      throw AppError.badRequest('Validation failed', 'VALIDATION_ERROR', errors);
    }
    
    req[source] = result.data;
    next();
  };
};
