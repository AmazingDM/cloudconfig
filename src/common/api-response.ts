import type { Context } from 'hono';

import type { AppEnv } from '../app/types';

export function success<T>(c: Context<AppEnv>, data: T, status: 200 | 201 = 200) {
  return c.json({
    code: 0,
    message: 'success',
    data,
    requestId: c.get('requestId')
  }, status);
}
