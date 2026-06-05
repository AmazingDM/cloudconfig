import { describe, expect, it } from 'vitest';

import { ConfigService } from '../src/modules/config/config-service';
import type { AuditRepository } from '../src/modules/audit/audit-repository';
import type { ConfigRepository, ShareWithConfig } from '../src/modules/config/config-repository';

class MemoryConfigRepository implements ConfigRepository {
  public readonly configs = new Map<string, {
    id: string;
    appId: string;
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
    appId: string;
    contentJson: string;
    contentHash: string;
    contentSize: number;
  }): Promise<void> {
    for (const config of this.configs.values()) {
      if (config.appId === input.appId && config.contentHash === input.contentHash) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: configs.app_id, configs.content_hash');
      }
    }

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

    for (const share of this.shares.values()) {
      if (share.configId === input.configId) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: config_shares.config_id');
      }
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

  public async findConfigByAppIdAndContentHash(appId: string, contentHash: string): Promise<{
    id: string;
    appId: string;
    contentJson: string;
    contentHash: string;
    contentSize: number;
    createdAt: string;
  } | null> {
    for (const config of this.configs.values()) {
      if (config.appId === appId && config.contentHash === contentHash) {
        return config;
      }
    }

    return null;
  }

  public async findShareByConfigId(configId: string): Promise<{
    id: string;
    configId: string;
    shortCode: string;
    status: string;
    expiresAt: string | null;
    accessCount: number;
    createdAt: string;
  } | null> {
    for (const share of this.shares.values()) {
      if (share.configId === configId) {
        return share;
      }
    }

    return null;
  }

  public async findShareByAppIdAndContentHash(appId: string, contentHash: string): Promise<ShareWithConfig | null> {
    const config = await this.findConfigByAppIdAndContentHash(appId, contentHash);
    if (!config) {
      return null;
    }

    const share = await this.findShareByConfigId(config.id);
    if (!share) {
      return null;
    }

    return {
      share,
      config
    };
  }

  public async findShareByAppIdAndShortCode(appId: string, shortCode: string): Promise<ShareWithConfig | null> {
    const share = this.shares.get(shortCode);
    if (!share) {
      return null;
    }

    const config = this.configs.get(share.configId);
    if (!config) {
      return null;
    }

    if (config.appId !== appId) {
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

  it('同一 app 重复导出相同配置时应返回旧短码', async () => {
    const repository = new MemoryConfigRepository();
    const auditRepository = new MemoryAuditRepository();
    const service = new ConfigService(repository, auditRepository, 256 * 1024);

    const first = await service.exportConfig({
      appId: 'desktop-client',
      requestId: 'req-duplicate-1',
      ip: '127.0.0.1',
      body: {
        config: {
          theme: 'dark',
          language: 'zh-CN'
        }
      }
    });

    const second = await service.exportConfig({
      appId: 'desktop-client',
      requestId: 'req-duplicate-2',
      ip: '127.0.0.1',
      body: {
        config: {
          theme: 'dark',
          language: 'zh-CN'
        }
      }
    });

    expect(second.configId).toBe(first.configId);
    expect(second.shareCode).toBe(first.shareCode);
    expect(repository.configs.size).toBe(1);
    expect(repository.shares.size).toBe(1);
  });

  it('不同 app 的相同配置不应复用短码', async () => {
    const repository = new MemoryConfigRepository();
    const auditRepository = new MemoryAuditRepository();
    const service = new ConfigService(repository, auditRepository, 256 * 1024);

    const desktop = await service.exportConfig({
      appId: 'desktop-client',
      requestId: 'req-app-1',
      ip: '127.0.0.1',
      body: {
        config: {
          theme: 'dark',
          language: 'zh-CN'
        }
      }
    });

    const portable = await service.exportConfig({
      appId: 'portable-client',
      requestId: 'req-app-2',
      ip: '127.0.0.1',
      body: {
        config: {
          theme: 'dark',
          language: 'zh-CN'
        }
      }
    });

    expect(portable.configId).not.toBe(desktop.configId);
    expect(portable.shareCode).not.toBe(desktop.shareCode);
    expect(repository.configs.size).toBe(2);
    expect(repository.shares.size).toBe(2);
  });

  it('导入时不允许跨 app 使用短码', async () => {
    const repository = new MemoryConfigRepository();
    const auditRepository = new MemoryAuditRepository();
    const service = new ConfigService(repository, auditRepository, 256 * 1024);

    const exported = await service.exportConfig({
      appId: 'desktop-client',
      requestId: 'req-owner',
      ip: '127.0.0.1',
      body: {
        config: {
          theme: 'dark'
        }
      }
    });

    await expect(service.importConfig({
      appId: 'portable-client',
      requestId: 'req-cross-app',
      ip: '127.0.0.1',
      body: {
        shareCode: exported.shareCode
      }
    })).rejects.toThrow('分享短码无效或已失效');
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
