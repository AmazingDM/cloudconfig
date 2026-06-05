# D1 结构说明

数据库迁移文件位于：

```text
migrations/0001_init.sql
migrations/0002_app_scoped_config_dedupe.sql
```

当前 Worker 通过 `wrangler.jsonc` 中的 D1 binding `DB` 访问数据库。

## 表关系

```text
configs.id
  |
  `-- config_shares.config_id

client_apps.app_id
  |-- configs.app_id
  `-- audit_logs.app_id
```

## configs

保存完整配置正文。

建表：

```sql
create table if not exists configs (
  id text primary key,
  app_id text not null,
  content_json text not null,
  content_hash text not null,
  content_size integer not null,
  created_at text not null default current_timestamp
);
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text | 配置主键，Worker 使用 UUID |
| `app_id` | text | 配置所属客户端应用，来自 `x-api-key` 鉴权结果 |
| `content_json` | text | `body.config` 标准序列化后的 JSON 文本 |
| `content_hash` | text | `content_json` 的 SHA-256 十六进制摘要 |
| `content_size` | integer | `content_json` 的 UTF-8 字节长度 |
| `created_at` | text | 创建时间 |

唯一约束：

```sql
create unique index if not exists idx_configs_app_hash_unique
on configs(app_id, content_hash);
```

写入时机：

- `POST /api/v1/config/export`

同一个 `app_id` 下，相同 `content_hash` 只保存一条 `configs`。不同 `app_id` 的相同配置不会共享。

## config_shares

保存短码与配置的映射关系。

建表：

```sql
create table if not exists config_shares (
  id text primary key,
  config_id text not null,
  short_code text not null unique,
  status text not null default 'active',
  expires_at text null,
  access_count integer not null default 0,
  created_at text not null default current_timestamp,
  foreign key (config_id) references configs(id) on delete cascade
);
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text | 分享记录主键，Worker 使用 UUID |
| `config_id` | text | 关联 `configs.id` |
| `short_code` | text | 16 位大小写英文字母短码，唯一 |
| `status` | text | 当前状态，现有业务使用 `active` |
| `expires_at` | text/null | 过期时间，当前默认 `null` |
| `access_count` | integer | 导入成功次数 |
| `created_at` | text | 创建时间 |

索引：

```sql
create index if not exists idx_config_shares_config_id on config_shares(config_id);
create index if not exists idx_config_shares_status on config_shares(status);
create unique index if not exists idx_config_shares_config_id_unique on config_shares(config_id);
```

写入时机：

- `POST /api/v1/config/export`

同一个 `config_id` 只会有一个 canonical 短码；重复导出相同配置会返回旧短码。

更新时机：

- `POST /api/v1/config/import` 成功后 `access_count + 1`

## client_apps

保存客户端应用和 API Key 哈希。

建表：

```sql
create table if not exists client_apps (
  app_id text primary key,
  app_name text not null,
  api_key_hash text not null unique,
  status text not null default 'active',
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `app_id` | text | 客户端应用标识，例如 `desktop-client` |
| `app_name` | text | 客户端展示名称 |
| `api_key_hash` | text | 明文 API Key 的 PBKDF2-SHA256 哈希；旧 64 位 SHA-256 十六进制哈希仅用于兼容 |
| `status` | text | `active` 才允许调用业务接口 |
| `created_at` | text | 创建时间 |
| `updated_at` | text | 更新时间 |

索引：

```sql
create index if not exists idx_client_apps_status on client_apps(status);
```

鉴权查询：

```sql
select app_id, api_key_hash
from client_apps
where status = 'active';
```

## audit_logs

保存关键操作审计信息。

建表：

```sql
create table if not exists audit_logs (
  id text primary key,
  app_id text null,
  action text not null,
  request_id text not null,
  ip text not null,
  resource_type text not null,
  resource_id text null,
  metadata_json text not null default '{}',
  created_at text not null default current_timestamp
);
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text | 日志主键，Worker 使用 UUID |
| `app_id` | text/null | 调用客户端 |
| `action` | text | 动作名，例如 `config.export`、`config.import` |
| `request_id` | text | 响应中返回的请求追踪 ID |
| `ip` | text | 调用 IP，优先取 `cf-connecting-ip` |
| `resource_type` | text | 资源类型，例如 `config`、`share` |
| `resource_id` | text/null | 资源 ID |
| `metadata_json` | text | 附加元数据 JSON |
| `created_at` | text | 创建时间 |

索引：

```sql
create index if not exists idx_audit_logs_request_id on audit_logs(request_id);
```

写入动作：

| 接口 | action | resource_type |
| --- | --- | --- |
| `POST /api/v1/config/export` | `config.export` | `config` |
| `POST /api/v1/config/import` | `config.import` | `share` |

## 常用 SQL

### 查看所有表

```bash
pnpm exec wrangler d1 execute DB --remote --command="select name from sqlite_master where type='table' order by name;"
```

### 查看客户端应用

```bash
pnpm exec wrangler d1 execute DB --remote --command="select app_id, app_name, status, created_at, updated_at from client_apps order by created_at desc;"
```

### 新增客户端应用

先生成哈希：

```bash
pnpm hash:api-key your-plain-api-key
```

再插入远程 D1：

```bash
pnpm exec wrangler d1 execute DB --remote --command="insert into client_apps (app_id, app_name, api_key_hash, status) values ('desktop-client', '桌面客户端', '替换为哈希', 'active');"
```

如果要用 `pnpm dev` 本地验证业务接口，也要插入本地 D1：

```bash
pnpm exec wrangler d1 execute DB --local --command="insert into client_apps (app_id, app_name, api_key_hash, status) values ('desktop-client', '桌面客户端', '替换为哈希', 'active');"
```

### 更新客户端 API Key

远程 D1：

```bash
pnpm exec wrangler d1 execute DB --remote --command="update client_apps set api_key_hash='替换为新哈希', updated_at=current_timestamp where app_id='desktop-client';"
```

本地 D1：

```bash
pnpm exec wrangler d1 execute DB --local --command="update client_apps set api_key_hash='替换为新哈希', updated_at=current_timestamp where app_id='desktop-client';"
```

### 禁用客户端

```bash
pnpm exec wrangler d1 execute DB --remote --command="update client_apps set status='disabled', updated_at=current_timestamp where app_id='desktop-client';"
```

### 查看最近短码

```bash
pnpm exec wrangler d1 execute DB --remote --command="select short_code, status, access_count, created_at from config_shares order by created_at desc limit 20;"
```

### 查看最近审计日志

```bash
pnpm exec wrangler d1 execute DB --remote --command="select action, app_id, request_id, resource_type, resource_id, created_at from audit_logs order by created_at desc limit 20;"
```

### 按 requestId 查审计日志

```bash
pnpm exec wrangler d1 execute DB --remote --command="select * from audit_logs where request_id='替换为响应里的 requestId';"
```

### 清空配置业务数据

如果当前环境还没有大规模部署，且需要切换到按 `app_id + content_hash` 去重的新版本，可以在执行 `0002` 迁移前清空业务数据：

```bash
pnpm exec wrangler d1 execute DB --remote --command="delete from config_shares;"
pnpm exec wrangler d1 execute DB --remote --command="delete from configs;"
pnpm exec wrangler d1 execute DB --remote --command="delete from audit_logs;"
```

这条命令会保留 `client_apps`，因此现有 API Key 仍可继续使用。如果要连 API Key 一起重建，再额外清空 `client_apps` 并重新插入客户端应用。

## 迁移原则

已经部署过的迁移文件不要回改。后续数据库变更应新增文件，例如：

```text
migrations/0002_add_xxx.sql
```

原因：

- Wrangler 通过迁移历史判断哪些脚本已执行。
- 回改旧迁移不能可靠影响已部署数据库。
- 新增迁移更容易审计和回滚。
