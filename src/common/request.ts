import type { Context } from 'hono';

import type { AppEnv } from '../app/types';
import { AppError, errorCodes } from './app-error';

const requestEncoder = new TextEncoder();
const defaultExportRequestEnvelopeBytes = 16 * 1024;

export function getClientIp(c: Context<AppEnv>): string {
  const direct = c.req.header('cf-connecting-ip');
  if (direct) {
    return direct;
  }

  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }

  return 'unknown';
}

export function getMaxConfigBytes(value?: string): number {
  if (!value) {
    return 256 * 1024;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 256 * 1024;
}

export function getMaxExportRequestBytes(maxConfigBytes: number, value?: string): number {
  if (!value) {
    return maxConfigBytes + defaultExportRequestEnvelopeBytes;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : maxConfigBytes + defaultExportRequestEnvelopeBytes;
}

export async function readJsonWithByteLimit(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new AppError('请求体超过允许大小', 400, errorCodes.configTooLarge);
    }
  }

  const text = await request.text();
  const actualBytes = requestEncoder.encode(text).byteLength;
  if (actualBytes > maxBytes) {
    throw new AppError('请求体超过允许大小', 400, errorCodes.configTooLarge);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError('请求体必须是合法 JSON', 400, errorCodes.badRequest);
  }
}
