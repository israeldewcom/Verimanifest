export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public errorCode: string;
  public details?: any;
  constructor(message: string, statusCode: number, errorCode = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
  static badRequest(message: string, errorCode?: string, details?: any): AppError {
    return new AppError(message, 400, errorCode || 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }
  static forbidden(message = 'Insufficient permissions'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }
  static notFound(message = 'Resource not found'): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }
  static conflict(message: string): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }
  static tooMany(message = 'Too many requests'): AppError {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS');
  }
  static internal(message = 'Internal server error'): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}
