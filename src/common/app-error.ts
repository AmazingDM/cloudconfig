export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: number;

  public constructor(message: string, statusCode = 500, code = 50000) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const errorCodes = {
  badRequest: 40000,
  invalidApiKey: 40101,
  invalidShareCode: 40401,
  configTooLarge: 40002,
  internalError: 50000
} as const;
