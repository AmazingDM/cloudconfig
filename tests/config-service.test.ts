import { describe, expect, it } from 'vitest';

import { ConfigService } from '../src/modules/config/config-service';
import type { AuditRepository } from '../src/modules/audit/audit-repository';
import type { ConfigRepository, ShareWithConfig } from '../src/modules/config/config-repository';

class MemoryConfigRepository implements ConfigRepository {
  public readonly configs = new Map<string, {
    id: string;
    contentJson: string;
    contentHash: string;
    contentSize: number;
    createdAt: string;
  }>();

  public readonly shares = new Map<string, {
    id: string;
    configId: string;
    shortCode: string;
    status: string;
    expiresAt: string | null;
    accessCount: number;
    createdAt: string;
  }>();

  public async insertConfig(input: {
    id: string;
    contentJson: string;
    contentHash: string;
    contentSize: number;
  }): Promise<void> {
    this.configs.set(input.id, {
      ...input,
      createdAt: new Date().toISOString()
    });
  }

  public async insertShare(input: {
    id: string;
    configId: string;
    shortCode: string;
    status: string;
    expiresAt?: string | null;
  }): Promise<void> {
    if (this.shares.has(input.shortCode)) {
      throw new Error('D1_ERROR: UNIQUE constraint failed: config_shares.short_code');
    }

    this.shares.set(input.shortCode, {
      id: input.id,
      configId: input.configId,
      shortCode: input.shortCode,
      status: input.status,
      expiresAt: input.expiresAt ?? null,
      accessCount: 0,
      createdAt: new Date().toISOString()
    });
  }

  public async findShareByShortCode(shortCode: string): Promise<ShareWithConfig | null> {
    const share = this.shares.get(shortCode);
    if (!share) {
      return null;
    }

    const config = this.configs.get(share.configId);
    if (!config) {
      return null;
    }

    return {
      share,
      config
    };
  }

  public async incrementShareAccessCount(shareId: string): Promise<void> {
    for (const [shortCode, share] of this.shares.entries()) {
      if (share.id === shareId) {
        this.shares.set(shortCode, {
          ...share,
          accessCount: share.accessCount + 1
        });
      }
    }
  }
}

class MemoryAuditRepository implements AuditRepository {
  public readonly logs: Array<Record<string, unknown>> = [];

  public async insertLog(input: {
    appId?: string;
    action: string;
    requestId: string;
    ip: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.logs.push(input);
  }
}

describe('ConfigService', () => {
  it('应支持导出后再导入配置', async () => {
    const repository = new MemoryConfigRepository();
    const auditRepository = new MemoryAuditRepository();
    const service = new ConfigService(repository, auditRepository, 256 * 1024);

    const exported = await service.exportConfig({
      appId: 'desktop-client',
      requestId: 'req-1',
      ip: '127.0.0.1',
      body: {
        config: {
          theme: 'dark',
          language: 'zh-CN'
        }
      }
    });

    const imported = await service.importConfig({
      appId: 'desktop-client',
      requestId: 'req-2',
      ip: '127.0.0.1',
      body: {
        shareCode: exported.shareCode
      }
    });

    expect(imported.shareCode).toBe(exported.shareCode);
    expect(imported.config).toEqual({
      theme: 'dark',
      language: 'zh-CN'
    });
  });

  it('应拒绝超过大小限制的配置', async () => {
    const repository = new MemoryConfigRepository();
    const auditRepository = new MemoryAuditRepository();
    const service = new ConfigService(repository, auditRepository, 20);

    await expect(service.exportConfig({
      appId: 'desktop-client',
      requestId: 'req-3',
      ip: '127.0.0.1',
      body: {
        config: {
          large: 'this-is-too-large-for-limit'
        }
      }
    })).rejects.toThrow('配置内容超过允许大小');
  });
});
