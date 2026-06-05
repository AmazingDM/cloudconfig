import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

function migrationPath(name: string): string {
  return resolve(process.cwd(), 'migrations', name);
}

function execMigration(db: DatabaseSync, name: string): void {
  db.exec(readFileSync(migrationPath(name), 'utf8'));
}

function rows<T extends Record<string, unknown>>(db: DatabaseSync, sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

describe('D1 migrations', () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('0002 应在创建唯一索引前折叠旧库重复配置和重复短码关系', () => {
    db = new DatabaseSync(':memory:');
    execMigration(db, '0001_init.sql');

    db.exec(`
      insert into configs (id, content_json, content_hash, content_size, created_at) values
        ('cfg-old-1', '{"theme":"dark"}', 'same-hash', 16, '2026-01-01 00:00:00'),
        ('cfg-old-2', '{"theme":"dark"}', 'same-hash', 16, '2026-01-02 00:00:00'),
        ('cfg-old-3', '{"theme":"light"}', 'other-hash', 17, '2026-01-03 00:00:00');

      insert into config_shares (id, config_id, short_code, created_at) values
        ('share-old-1', 'cfg-old-1', 'Aaaaaaaaaaaaaaaa', '2026-01-01 00:00:00'),
        ('share-old-2', 'cfg-old-2', 'Bbbbbbbbbbbbbbbb', '2026-01-02 00:00:00'),
        ('share-old-3', 'cfg-old-3', 'Cccccccccccccccc', '2026-01-03 00:00:00'),
        ('share-old-4', 'cfg-old-3', 'Dddddddddddddddd', '2026-01-04 00:00:00');
    `);

    execMigration(db, '0002_app_scoped_config_dedupe.sql');

    expect(rows(db, `
      select app_id, content_hash, count(*) as count
      from configs
      group by app_id, content_hash
      having count(*) > 1
    `)).toEqual([]);
    expect(rows(db, `
      select config_id, count(*) as count
      from config_shares
      group by config_id
      having count(*) > 1
    `)).toEqual([]);

    expect(rows(db, 'select id from configs order by id')).toEqual([
      { id: 'cfg-old-1' },
      { id: 'cfg-old-3' }
    ]);
    expect(rows(db, 'select short_code, config_id from config_shares order by short_code')).toEqual([
      { short_code: 'Aaaaaaaaaaaaaaaa', config_id: 'cfg-old-1' },
      { short_code: 'Cccccccccccccccc', config_id: 'cfg-old-3' }
    ]);

    expect(() => db?.exec(`
      insert into configs (id, app_id, content_json, content_hash, content_size)
      values ('cfg-new-duplicate', '', '{"theme":"dark"}', 'same-hash', 16)
    `)).toThrow(/UNIQUE constraint failed/);
    expect(() => db?.exec(`
      insert into config_shares (id, config_id, short_code)
      values ('share-new-duplicate', 'cfg-old-1', 'Eeeeeeeeeeeeeeee')
    `)).toThrow(/UNIQUE constraint failed/);
  });

  it('0002 应折叠无法关联 configs 的重复短码关系', () => {
    db = new DatabaseSync(':memory:');
    execMigration(db, '0001_init.sql');
    db.exec('pragma foreign_keys = off');

    db.exec(`
      insert into config_shares (id, config_id, short_code, created_at) values
        ('share-orphan-1', 'missing-config', 'Aaaaaaaaaaaaaaaa', '2026-01-01 00:00:00'),
        ('share-orphan-2', 'missing-config', 'Bbbbbbbbbbbbbbbb', '2026-01-02 00:00:00');
    `);

    execMigration(db, '0002_app_scoped_config_dedupe.sql');

    expect(rows(db, 'select id, config_id, short_code from config_shares')).toEqual([
      {
        id: 'share-orphan-1',
        config_id: 'missing-config',
        short_code: 'Aaaaaaaaaaaaaaaa'
      }
    ]);
    expect(() => db?.exec(`
      insert into config_shares (id, config_id, short_code)
      values ('share-new-duplicate', 'missing-config', 'Cccccccccccccccc')
    `)).toThrow(/UNIQUE constraint failed/);
  });
});
