import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export const notFound = (_req, res) => {
  res.status(404).json({ message: 'Route not found' });
};

export const errorHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: err.issues[0]?.message || 'Validation failed',
      issues: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  logger.error('http request failed', {
    requestId: req?.requestId,
    method: req?.method,
    path: req?.originalUrl,
    error: err,
  });
  return res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    requestId: req?.requestId,
  });
};
