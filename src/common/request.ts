import type { Context } from 'hono';

import type { AppEnv } from '../app/types';

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
