import { describe, expect, it } from 'vitest';

import { createApiKeyHash } from '../src/common/api-key-hash';
import { ClientAuthService } from '../src/modules/client-app/client-auth-service';
import type { ClientAppRecord, ClientAppRepository } from '../src/modules/client-app/client-app-repository';

class MemoryClientAppRepository implements ClientAppRepository {
  public constructor(private readonly records: ClientAppRecord[]) {}

  public async listActiveWithApiKeyHashes(): Promise<ClientAppRecord[]> {
    return this.records;
  }
}

describe('ClientAuthService', () => {
  it('应使用 PBKDF2 格式哈希完成客户端鉴权', async () => {
    const apiKeyHash = await createApiKeyHash('plain-secret-api-key');
    const service = new ClientAuthService(new MemoryClientAppRepository([{
      appId: 'desktop-client',
      apiKeyHash
    }]));

    await expect(service.authenticate('plain-secret-api-key')).resolves.toEqual({
      appId: 'desktop-client'
    });
    await expect(service.authenticate('wrong-api-key')).rejects.toThrow('客户端鉴权失败');
  });
});
