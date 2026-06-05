import { AppError, errorCodes } from '../../common/app-error';
import { verifyApiKeyHash } from '../../common/api-key-hash';
import type { ClientAppRepository } from './client-app-repository';

export class ClientAuthService {
  public constructor(private readonly repository: ClientAppRepository) {}

  public async authenticate(apiKey: string | undefined): Promise<{ appId: string }> {
    if (!apiKey) {
      throw new AppError('缺少 x-api-key 请求头', 401, errorCodes.invalidApiKey);
    }

    const records = await this.repository.listActiveWithApiKeyHashes();
    for (const record of records) {
      if (await verifyApiKeyHash(apiKey, record.apiKeyHash)) {
        return {
          appId: record.appId
        };
      }
    }

    throw new AppError('客户端鉴权失败', 401, errorCodes.invalidApiKey);
  }
}
