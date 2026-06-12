import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/AppError';
import { environment } from '../config/environment';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const errorId = uuidv4();
  
  if (err instanceof AppError) {
    logger.warn('Operational error', {
      errorId,
      errorCode: err.errorCode,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      userId: (req as any).user?.userId,
    });
    
    return res.status(err.statusCode).json({
      success: false,
      errorId,
      errorCode: err.errorCode,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
  }

  logger.error('Unhandled error', {
    errorId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.userId,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  res.status(err.status || 500).json({
    success: false,
    errorId,
    errorCode: 'INTERNAL_ERROR',
    message: environment.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(environment.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
