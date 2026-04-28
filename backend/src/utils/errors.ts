export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);
export const Unauthorized = (message = 'Unauthorized') =>
  new AppError(401, 'unauthorized', message);
export const Forbidden = (message = 'Forbidden') => new AppError(403, 'forbidden', message);
export const NotFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const Conflict = (message: string) => new AppError(409, 'conflict', message);
export const TooMany = (message = 'Too many requests') =>
  new AppError(429, 'too_many_requests', message);
