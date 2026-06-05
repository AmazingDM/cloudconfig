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
  return message.includes('UNIQUE constraint failed');
}

function isShortCodeUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return isUniqueConstraintError(error) && message.includes('config_shares.short_code');
}

function isConfigHashUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return isUniqueConstraintError(error)
    && (
      message.includes('configs.app_id')
      || message.includes('configs.content_hash')
      || message.includes('idx_configs_app_hash_unique')
    );
}

function isShareConfigUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return isUniqueConstraintError(error)
    && (
      message.includes('config_shares.config_id')
      || message.includes('idx_config_shares_config_id_unique')
    );
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

    const contentHash = await sha256Hex(contentJson);
    const existingShare = await this.repository.findShareByAppIdAndContentHash(input.appId, contentHash);
    if (existingShare) {
      await this.insertExportAudit({
        appId: input.appId,
        requestId: input.requestId,
        ip: input.ip,
        configId: existingShare.config.id,
        shareCode: existingShare.share.shortCode,
        contentSize,
        metadata: parsed.data.metadata ?? null,
        deduplicated: true,
        reusedShareCode: true
      });

      return {
        configId: existingShare.config.id,
        shareCode: existingShare.share.shortCode
      };
    }

    const config = await this.insertConfigOrReuse({
      appId: input.appId,
      contentJson,
      contentHash,
      contentSize
    });

    const share = await this.createShareWithRetry(config.configId, 5);

    await this.insertExportAudit({
      appId: input.appId,
      requestId: input.requestId,
      ip: input.ip,
      configId: config.configId,
      shareCode: share.shareCode,
      contentSize,
      metadata: parsed.data.metadata ?? null,
      deduplicated: config.reused || share.reused,
      reusedShareCode: share.reused
    });

    return {
      configId: config.configId,
      shareCode: share.shareCode
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

    const record = await this.repository.findShareByAppIdAndShortCode(input.appId, parsed.data.shareCode);
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

  private async insertConfigOrReuse(input: {
    appId: string;
    contentJson: string;
    contentHash: string;
    contentSize: number;
  }): Promise<{
    configId: string;
    reused: boolean;
  }> {
    const configId = crypto.randomUUID();

    try {
      await this.repository.insertConfig({
        id: configId,
        appId: input.appId,
        contentJson: input.contentJson,
        contentHash: input.contentHash,
        contentSize: input.contentSize
      });

      return {
        configId,
        reused: false
      };
    } catch (error) {
      if (!isConfigHashUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.repository.findConfigByAppIdAndContentHash(input.appId, input.contentHash);
      if (!existing) {
        throw error;
      }

      return {
        configId: existing.id,
        reused: true
      };
    }
  }

  private async createShareWithRetry(configId: string, maxRetries: number): Promise<{
    shareCode: string;
    reused: boolean;
  }> {
    const existingShare = await this.repository.findShareByConfigId(configId);
    if (existingShare) {
      return {
        shareCode: existingShare.shortCode,
        reused: true
      };
    }

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const shareId = crypto.randomUUID();
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

        return {
          shareCode: shortCode,
          reused: false
        };
      } catch (error) {
        if (isShareConfigUniqueConstraintError(error)) {
          const existing = await this.repository.findShareByConfigId(configId);
          if (existing) {
            return {
              shareCode: existing.shortCode,
              reused: true
            };
          }
        }

        if (!isShortCodeUniqueConstraintError(error) || attempt === maxRetries - 1) {
          throw error;
        }
      }
    }

    throw new AppError('分享短码生成失败', 500, errorCodes.internalError);
  }

  private async insertExportAudit(input: {
    appId: string;
    requestId: string;
    ip: string;
    configId: string;
    shareCode: string;
    contentSize: number;
    metadata: Record<string, unknown> | null;
    deduplicated: boolean;
    reusedShareCode: boolean;
  }): Promise<void> {
    await this.auditRepository.insertLog({
      appId: input.appId,
      action: 'config.export',
      requestId: input.requestId,
      ip: input.ip,
      resourceType: 'config',
      resourceId: input.configId,
      metadata: {
        shareCode: input.shareCode,
        contentSize: input.contentSize,
        deduplicated: input.deduplicated,
        reusedShareCode: input.reusedShareCode,
        metadata: input.metadata
      }
    });
  }
}
