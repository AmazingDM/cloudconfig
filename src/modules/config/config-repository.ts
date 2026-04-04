export type ConfigRecord = {
  id: string;
  contentJson: string;
  contentHash: string;
  contentSize: number;
  createdAt: string;
};

export type ShareRecord = {
  id: string;
  configId: string;
  shortCode: string;
  status: string;
  expiresAt: string | null;
  accessCount: number;
  createdAt: string;
};

export type ShareWithConfig = {
  share: ShareRecord;
  config: ConfigRecord;
};

export interface ConfigRepository {
  insertConfig(input: {
    id: string;
    contentJson: string;
    contentHash: string;
    contentSize: number;
  }): Promise<void>;
  insertShare(input: {
    id: string;
    configId: string;
    shortCode: string;
    status: string;
    expiresAt?: string | null;
  }): Promise<void>;
  findShareByShortCode(shortCode: string): Promise<ShareWithConfig | null>;
  incrementShareAccessCount(shareId: string): Promise<void>;
}

export class D1ConfigRepository implements ConfigRepository {
  public constructor(private readonly db: D1Database) {}

  public async insertConfig(input: {
    id: string;
    contentJson: string;
    contentHash: string;
    contentSize: number;
  }): Promise<void> {
    await this.db
      .prepare(`
        insert into configs (
          id,
          content_json,
          content_hash,
          content_size
        ) values (?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.contentJson,
        input.contentHash,
        input.contentSize
      )
      .run();
  }

  public async insertShare(input: {
    id: string;
    configId: string;
    shortCode: string;
    status: string;
    expiresAt?: string | null;
  }): Promise<void> {
    await this.db
      .prepare(`
        insert into config_shares (
          id,
          config_id,
          short_code,
          status,
          expires_at
        ) values (?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.configId,
        input.shortCode,
        input.status,
        input.expiresAt ?? null
      )
      .run();
  }

  public async findShareByShortCode(shortCode: string): Promise<ShareWithConfig | null> {
    const row = await this.db
      .prepare(`
        select
          s.id as share_id,
          s.config_id as share_config_id,
          s.short_code,
          s.status,
          s.expires_at,
          s.access_count,
          s.created_at as share_created_at,
          c.id as config_id,
          c.content_json,
          c.content_hash,
          c.content_size,
          c.created_at as config_created_at
        from config_shares s
        join configs c on c.id = s.config_id
        where s.short_code = ?
        limit 1
      `)
      .bind(shortCode)
      .first<{
        share_id: string;
        share_config_id: string;
        short_code: string;
        status: string;
        expires_at: string | null;
        access_count: number;
        share_created_at: string;
        config_id: string;
        content_json: string;
        content_hash: string;
        content_size: number;
        config_created_at: string;
      }>();

    if (!row) {
      return null;
    }

    return {
      share: {
        id: row.share_id,
        configId: row.share_config_id,
        shortCode: row.short_code,
        status: row.status,
        expiresAt: row.expires_at,
        accessCount: row.access_count,
        createdAt: row.share_created_at
      },
      config: {
        id: row.config_id,
        contentJson: row.content_json,
        contentHash: row.content_hash,
        contentSize: row.content_size,
        createdAt: row.config_created_at
      }
    };
  }

  public async incrementShareAccessCount(shareId: string): Promise<void> {
    await this.db
      .prepare(`
        update config_shares
        set access_count = access_count + 1
        where id = ?
      `)
      .bind(shareId)
      .run();
  }
}
