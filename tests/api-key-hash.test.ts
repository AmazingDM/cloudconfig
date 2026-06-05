import { describe, expect, it } from 'vitest';

import { createApiKeyHash, verifyApiKeyHash } from '../src/common/api-key-hash';

describe('api key hash helpers', () => {
  it('应生成 PBKDF2 格式哈希并只验证原始 API Key', async () => {
    const hash = await createApiKeyHash('plain-secret-api-key');

    expect(hash).toMatch(/^pbkdf2-sha256\$\d+\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
    await expect(verifyApiKeyHash('plain-secret-api-key', hash)).resolves.toBe(true);
    await expect(verifyApiKeyHash('wrong-api-key', hash)).resolves.toBe(false);
  });

  it('应兼容验证旧版 SHA-256 十六进制哈希', async () => {
    const legacySha256Hash = '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b';

    await expect(verifyApiKeyHash('secret', legacySha256Hash)).resolves.toBe(true);
    await expect(verifyApiKeyHash('wrong-api-key', legacySha256Hash)).resolves.toBe(false);
  });
});
