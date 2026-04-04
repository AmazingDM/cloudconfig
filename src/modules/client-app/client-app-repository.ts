export type ClientAppRecord = {
  appId: string;
};

export interface ClientAppRepository {
  findActiveByApiKeyHash(apiKeyHash: string): Promise<ClientAppRecord | null>;
}

export class D1ClientAppRepository implements ClientAppRepository {
  public constructor(private readonly db: D1Database) {}

  public async findActiveByApiKeyHash(apiKeyHash: string): Promise<ClientAppRecord | null> {
    const row = await this.db
      .prepare(`
        select app_id
        from client_apps
        where api_key_hash = ? and status = 'active'
        limit 1
      `)
      .bind(apiKeyHash)
      .first<{ app_id: string }>();

    if (!row) {
      return null;
    }

    return {
      appId: row.app_id
    };
  }
}
