export type ClientAppRecord = {
  appId: string;
  apiKeyHash: string;
};

export interface ClientAppRepository {
  listActiveWithApiKeyHashes(): Promise<ClientAppRecord[]>;
}

export class D1ClientAppRepository implements ClientAppRepository {
  public constructor(private readonly db: D1Database) {}

  public async listActiveWithApiKeyHashes(): Promise<ClientAppRecord[]> {
    const result = await this.db
      .prepare(`
        select app_id, api_key_hash
        from client_apps
        where status = 'active'
      `)
      .all<{ app_id: string; api_key_hash: string }>();

    return result.results.map((row) => ({
      appId: row.app_id,
      apiKeyHash: row.api_key_hash
    }));
  }
}
