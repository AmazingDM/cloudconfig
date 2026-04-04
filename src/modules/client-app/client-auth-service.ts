import { AppError, errorCodes } from '../../common/app-error';
import { sha256Hex } from '../../common/hash';
import type { ClientAppRepository } from './client-app-repository';

export class ClientAuthService {
  public constructor(private readonly repository: ClientAppRepository) {}

  public async authenticate(apiKey: string | undefined): Promise<{ appId: string }> {
    if (!apiKey) {
      throw new AppError('缺少 x-api-key 请求头', 401, errorCodes.invalidApiKey);
    }

    const apiKeyHash = await sha256Hex(apiKey);
    const record = await this.repository.findActiveByApiKeyHash(apiKeyHash);

    if (!record) {
      throw new AppError('客户端鉴权失败', 401, errorCodes.invalidApiKey);
    }

    return {
      appId: record.appId
    };
  }
}
