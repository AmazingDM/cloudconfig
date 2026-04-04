import { Hono } from 'hono';

import type { AppEnv } from './types';
import { AppError, errorCodes } from '../common/app-error';
import { success } from '../common/api-response';
import { getClientIp, getMaxConfigBytes } from '../common/request';
import { D1AuditRepository } from '../modules/audit/audit-repository';
import { ClientAuthService } from '../modules/client-app/client-auth-service';
import { D1ClientAppRepository } from '../modules/client-app/client-app-repository';
import { D1ConfigRepository } from '../modules/config/config-repository';
import { ConfigService } from '../modules/config/config-service';

function createServices(env: AppEnv['Bindings']) {
  const configRepository = new D1ConfigRepository(env.DB);
  const auditRepository = new D1AuditRepository(env.DB);

  return {
    clientAuthService: new ClientAuthService(new D1ClientAppRepository(env.DB)),
    configService: new ConfigService(
      configRepository,
      auditRepository,
      getMaxConfigBytes(env.MAX_CONFIG_BYTES)
    )
  };
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });

  app.onError((error, c) => {
    const appError = error instanceof AppError
      ? error
      : new AppError('服务器内部错误', 500, errorCodes.internalError);

    return c.json({
      code: appError.code,
      message: appError.message,
      data: null,
      requestId: c.get('requestId')
    }, appError.statusCode as 400 | 401 | 404 | 500);
  });

  app.notFound((c) => {
    return c.json({
      code: 40400,
      message: '接口不存在',
      data: null,
      requestId: c.get('requestId')
    }, 404);
  });

  app.get('/', (c) => {
    return success(c, {
      name: c.env.APP_NAME ?? 'Cloud Config API',
      runtime: 'cloudflare-workers'
    });
  });

  app.get('/health', async (c) => {
    await c.env.DB.prepare('select 1 as ok').first();

    return success(c, {
      d1: 'ok'
    });
  });

  app.use('/api/v1/config/*', async (c, next) => {
    const services = createServices(c.env);
    const identity = await services.clientAuthService.authenticate(c.req.header('x-api-key'));
    c.set('clientApp', identity);
    await next();
  });

  app.post('/api/v1/config/export', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError('请求体必须是合法 JSON', 400, errorCodes.badRequest);
    }

    const services = createServices(c.env);
    const result = await services.configService.exportConfig({
      appId: c.get('clientApp')!.appId,
      requestId: c.get('requestId'),
      ip: getClientIp(c),
      body
    });

    return success(c, result);
  });

  app.post('/api/v1/config/import', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError('请求体必须是合法 JSON', 400, errorCodes.badRequest);
    }

    const services = createServices(c.env);
    const result = await services.configService.importConfig({
      appId: c.get('clientApp')!.appId,
      requestId: c.get('requestId'),
      ip: getClientIp(c),
      body
    });

    return success(c, result);
  });

  return app;
}
