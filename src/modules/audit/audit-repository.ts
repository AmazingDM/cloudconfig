export interface AuditRepository {
  insertLog(input: {
    appId?: string;
    action: string;
    requestId: string;
    ip: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export class D1AuditRepository implements AuditRepository {
  public constructor(private readonly db: D1Database) {}

  public async insertLog(input: {
    appId?: string;
    action: string;
    requestId: string;
    ip: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db
      .prepare(`
        insert into audit_logs (
          id,
          app_id,
          action,
          request_id,
          ip,
          resource_type,
          resource_id,
          metadata_json
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        input.appId ?? null,
        input.action,
        input.requestId,
        input.ip,
        input.resourceType,
        input.resourceId ?? null,
        JSON.stringify(input.metadata ?? {})
      )
      .run();
  }
}
