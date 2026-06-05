import { describe, expect, it } from 'vitest';

import { getMaxExportRequestBytes, readJsonWithByteLimit } from '../src/common/request';

describe('request helpers', () => {
  it('未配置导出请求体上限时应给 config 上限保留 envelope 空间', () => {
    expect(getMaxExportRequestBytes(20)).toBe(20 + 16 * 1024);
  });

  it('应在解析 JSON 前拒绝超过 content-length 上限的请求体', async () => {
    const request = new Request('https://example.test/api/v1/config/export', {
      method: 'POST',
      headers: {
        'content-length': '64',
        'content-type': 'application/json'
      },
      body: '{"config":{"large":"value"}}'
    });

    await expect(readJsonWithByteLimit(request, 20)).rejects.toThrow('请求体超过允许大小');
  });

  it('应按实际 UTF-8 字节数拒绝超过上限的请求体', async () => {
    const request = new Request('https://example.test/api/v1/config/export', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: '{"config":{"large":"这是一个过大的请求体"}}'
    });

    await expect(readJsonWithByteLimit(request, 20)).rejects.toThrow('请求体超过允许大小');
  });

  it('应返回合法 JSON 请求体', async () => {
    const request = new Request('https://example.test/api/v1/config/export', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: '{"config":{"theme":"dark"}}'
    });

    await expect(readJsonWithByteLimit(request, 128)).resolves.toEqual({
      config: {
        theme: 'dark'
      }
    });
  });
});
