import { z } from 'zod';

import { AppError, errorCodes } from '../../common/app-error';
import { sha256Hex } from '../../common/hash';
import { generateShortCode } from '../share/short-code';
import type { AuditRepository } from '../audit/audit-repository';
import type { ConfigRepository } from './config-repository';

const exportConfigSchema = z.object({
  config: z.unknown(),
  metadata: z.object({
    clientVersion: z.string().min(1).max(64).optional(),
    platform: z.string().min(1).max(64).optional()
  }).optional()
});

const importConfigSchema = z.object({
  shareCode: z.string().regex(/^[A-Za-z]{16}$/, '短码格式无效')
});

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('UNIQUE constraint failed') && message.includes('config_shares.short_code');
}

export class ConfigService {
  public constructor(
    private readonly repository: ConfigRepository,
    private readonly auditRepository: AuditRepository,
    private readonly maxConfigBytes: number
  ) {}

  public async exportConfig(input: {
    appId: string;
    requestId: string;
    ip: string;
    body: unknown;
  }): Promise<{ configId: string; shareCode: string }> {
    const parsed = exportConfigSchema.safeParse(input.body);
    if (!parsed.success) {
      throw new AppError('请求参数无效', 400, errorCodes.badRequest);
    }

    // 导出配置统一序列化为标准 JSON 文本，保证不同语言客户端都能稳定处理。
    const contentJson = JSON.stringify(parsed.data.config);
    if (typeof contentJson !== 'string') {
      throw new AppError('配置内容无法序列化为 JSON', 400, errorCodes.badRequest);
    }

    const contentSize = new TextEncoder().encode(contentJson).byteLength;
    if (contentSize > this.maxConfigBytes) {
      throw new AppError('配置内容超过允许大小', 400, errorCodes.configTooLarge);
    }

    const configId = crypto.randomUUID();
    await this.repository.insertConfig({
      id: configId,
      contentJson,
      contentHash: await sha256Hex(contentJson),
      contentSize
    });

    const shareId = crypto.randomUUID();
    const shareCode = await this.createShareWithRetry(configId, shareId, 5);

    await this.auditRepository.insertLog({
      appId: input.appId,
      action: 'config.export',
      requestId: input.requestId,
      ip: input.ip,
      resourceType: 'config',
      resourceId: configId,
      metadata: {
        shareCode,
        contentSize,
        metadata: parsed.data.metadata ?? null
      }
    });

    return {
      configId,
      shareCode
    };
  }

  public async importConfig(input: {
    appId: string;
    requestId: string;
    ip: string;
    body: unknown;
  }): Promise<{ configId: string; shareCode: string; config: unknown }> {
    const parsed = importConfigSchema.safeParse(input.body);
    if (!parsed.success) {
      throw new AppError('请求参数无效', 400, errorCodes.badRequest);
    }

    const record = await this.repository.findShareByShortCode(parsed.data.shareCode);
    if (!record || record.share.status !== 'active') {
      throw new AppError('分享短码无效或已失效', 404, errorCodes.invalidShareCode);
    }

    if (record.share.expiresAt && new Date(record.share.expiresAt).getTime() < Date.now()) {
      throw new AppError('分享短码无效或已失效', 404, errorCodes.invalidShareCode);
    }

    const config = JSON.parse(record.config.contentJson) as unknown;

    await this.repository.incrementShareAccessCount(record.share.id);
    await this.auditRepository.insertLog({
      appId: input.appId,
      action: 'config.import',
      requestId: input.requestId,
      ip: input.ip,
      resourceType: 'share',
      resourceId: record.share.id,
      metadata: {
        shareCode: record.share.shortCode
      }
    });

    return {
      configId: record.config.id,
      shareCode: record.share.shortCode,
      config
    };
  }

  private async createShareWithRetry(configId: string, shareId: string, maxRetries: number): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const shortCode = generateShortCode();

      try {
        // 短码冲突最终由 D1 的唯一索引兜底，业务层只做有限次数重试。
        await this.repository.insertShare({
          id: shareId,
          configId,
          shortCode,
          status: 'active',
          expiresAt: null
        });

        return shortCode;
      } catch (error) {
        if (!isUniqueConstraintError(error) || attempt === maxRetries - 1) {
          throw error;
        }
      }
    }

    throw new AppError('分享短码生成失败', 500, errorCodes.internalError);
  }
}
