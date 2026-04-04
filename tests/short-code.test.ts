import { describe, expect, it } from 'vitest';

import { generateShortCode } from '../src/modules/share/short-code';

describe('generateShortCode', () => {
  it('应生成 16 位大小写字母短码', () => {
    const code = generateShortCode();

    expect(code).toHaveLength(16);
    expect(code).toMatch(/^[A-Za-z]{16}$/);
  });

  it('连续生成结果应具备基础随机性', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateShortCode()));
    expect(codes.size).toBeGreaterThan(95);
  });
});
