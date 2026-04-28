import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { ZodError } from 'zod';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid request',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
}
