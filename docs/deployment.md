# 从 0 部署教程

本文档从空 Cloudflare 环境开始，说明如何把本项目部署成可供软件客户端调用的配置导入/导出 API。

最终你会得到：

- 一个 Cloudflare Worker API 地址。
- 一个绑定到 Worker 的 D1 数据库。
- 已创建的 `configs`、`config_shares`、`client_apps`、`audit_logs` 表。
- 至少一个可用客户端 API Key。
- 可直接复制验证的导出、导入调用命令。

## 1. 部署前准备

本项目不需要传统服务器、Docker、PM2、Redis 或 PostgreSQL。

需要准备：

- Node.js `22` 或更高版本。
- pnpm。
- Cloudflare 账号。
- 账号具备 Workers 与 D1 权限。
- 本地可以运行 Wrangler 登录流程。

确认版本：

```bash
node --version
pnpm --version
pnpm exec wrangler --version
```

如果还没有安装 pnpm：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## 2. 克隆并安装项目

进入项目根目录后安装依赖：

```bash
pnpm install
```

先跑一次基础校验：

```bash
pnpm typecheck
pnpm test
```

这两步应当先通过，再继续部署。

## 3. 登录 Cloudflare

本地交互登录：

```bash
pnpm exec wrangler login
```

确认当前账号：

```bash
pnpm exec wrangler whoami
```

## 4. 创建 D1 数据库

当前 `wrangler.jsonc` 绑定名固定为 `DB`，数据库名称建议使用：

```text
cloud_config_db
```

创建数据库：

```bash
pnpm exec wrangler d1 create cloud_config_db
```

Wrangler 会输出类似：

```text
[[d1_databases]]
binding = "DB"
database_name = "cloud_config_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把输出中的 `database_id` 写入 `wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "cloud_config_db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "preview_database_id": "cloud-config-db-local",
    "migrations_dir": "migrations"
  }
]
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `binding` | Worker 代码中通过 `env.DB` 访问的 D1 绑定名，必须保持为 `DB` |
| `database_name` | Cloudflare D1 数据库名称 |
| `database_id` | 远程 D1 数据库 ID，必须替换为真实值 |
| `preview_database_id` | Wrangler 本地/预览数据库标识 |
| `migrations_dir` | D1 迁移目录 |

## 5. 理解 Worker 配置

`wrangler.jsonc` 中关键配置：

```jsonc
{
  "name": "cloud-config-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-04",
  "workers_dev": true,
  "vars": {
    "APP_NAME": "Cloud Config API",
    "MAX_CONFIG_BYTES": "262144"
  }
}
```

说明：

| 字段 | 说明 |
| --- | --- |
| `name` | Worker 名称，影响部署后的默认 `workers.dev` 地址 |
| `main` | Worker 入口文件 |
| `workers_dev` | 是否启用默认 `workers.dev` 域名 |
| `APP_NAME` | `GET /` 返回的服务名 |
| `MAX_CONFIG_BYTES` | 单份配置 JSON 序列化后的最大字节数，默认 `262144`，即 `256KB` |

## 6. 执行 D1 迁移

先执行本地迁移，便于后续本地开发验证：

```bash
pnpm d1:migrate:local
```

再执行远程迁移：

```bash
pnpm d1:migrate:remote
```

确认远程表已创建：

```bash
pnpm exec wrangler d1 execute DB --remote --command="select name from sqlite_master where type='table' order by name;"
```

应能看到：

```text
audit_logs
client_apps
config_shares
configs
```

## 7. 初始化客户端 API Key

业务接口通过 `x-api-key` 鉴权。

重要规则：

- 软件客户端请求头传明文 API Key。
- D1 只保存明文 API Key 的 SHA-256 哈希。
- Worker 会对请求头里的明文 API Key 再计算哈希并匹配数据库。

### 7.1 准备明文 API Key

示例：

```text
desktop-client-prod-2026-05-05-001
```

建议命名包含：

- 客户端类型，例如 `desktop-client`
- 环境，例如 `dev`、`staging`、`prod`
- 日期或版本号
- 随机片段

不要把生产明文 API Key 提交到仓库。

### 7.2 生成哈希

```bash
pnpm hash:api-key desktop-client-prod-2026-05-05-001
```

输出示例：

```text
0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### 7.3 插入客户端应用

推荐直接执行 SQL 命令，避免把生产哈希写回示例文件。

先插入远程 D1：

```bash
pnpm exec wrangler d1 execute DB --remote --command="insert into client_apps (app_id, app_name, api_key_hash, status) values ('desktop-client', '桌面客户端', '替换为上一步输出的哈希', 'active');"
```

如果要在本地 `pnpm dev` 中验证导出/导入，也需要插入本地 D1：

```bash
pnpm exec wrangler d1 execute DB --local --command="insert into client_apps (app_id, app_name, api_key_hash, status) values ('desktop-client', '桌面客户端', '替换为上一步输出的哈希', 'active');"
```

如果你要先编辑 SQL 文件，也可以复制 `seeds/client_apps.example.sql`，替换里面的 `api_key_hash` 后分别执行：

```bash
pnpm exec wrangler d1 execute DB --remote --file=./seeds/client_apps.example.sql
pnpm exec wrangler d1 execute DB --local --file=./seeds/client_apps.example.sql
```

检查远程结果：

```bash
pnpm exec wrangler d1 execute DB --remote --command="select app_id, app_name, status, created_at from client_apps;"
```

检查本地结果：

```bash
pnpm exec wrangler d1 execute DB --local --command="select app_id, app_name, status, created_at from client_apps;"
```

### 7.4 更新或轮换 API Key

生成新哈希后更新原客户端。远程 D1：

```bash
pnpm exec wrangler d1 execute DB --remote --command="update client_apps set api_key_hash='替换为新哈希', updated_at=current_timestamp where app_id='desktop-client';"
```

本地 D1：

```bash
pnpm exec wrangler d1 execute DB --local --command="update client_apps set api_key_hash='替换为新哈希', updated_at=current_timestamp where app_id='desktop-client';"
```

禁用旧客户端：

```bash
pnpm exec wrangler d1 execute DB --remote --command="update client_apps set status='disabled', updated_at=current_timestamp where app_id='desktop-client';"
```

重新启用：

```bash
pnpm exec wrangler d1 execute DB --remote --command="update client_apps set status='active', updated_at=current_timestamp where app_id='desktop-client';"
```

## 8. 本地开发验证

启动本地 Worker：

```bash
pnpm dev
```

默认地址通常是：

```text
http://127.0.0.1:8787
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

PowerShell：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8787/health"
```

本地验证导出：

如果这里返回 `40101`，优先确认本地 D1 也已经插入 `client_apps`，不能只插入远程 D1。

```bash
curl -X POST http://127.0.0.1:8787/api/v1/config/export \
  -H "content-type: application/json" \
  -H "x-api-key: desktop-client-prod-2026-05-05-001" \
  -d '{"config":{"theme":"dark","language":"zh-CN","window":{"width":1280,"height":720}},"metadata":{"clientVersion":"1.0.0","platform":"windows"}}'
```

PowerShell：

```powershell
$ApiKey = "desktop-client-prod-2026-05-05-001"
$Body = @{
  config = @{
    theme = "dark"
    language = "zh-CN"
    window = @{
      width = 1280
      height = 720
    }
  }
  metadata = @{
    clientVersion = "1.0.0"
    platform = "windows"
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8787/api/v1/config/export" `
  -Headers @{ "x-api-key" = $ApiKey } `
  -ContentType "application/json" `
  -Body $Body
```

记录返回的 `shareCode` 后验证导入：

```bash
curl -X POST http://127.0.0.1:8787/api/v1/config/import \
  -H "content-type: application/json" \
  -H "x-api-key: desktop-client-prod-2026-05-05-001" \
  -d '{"shareCode":"替换为导出接口返回的短码"}'
```

## 9. 部署 Worker

远程 D1 迁移和客户端应用都准备好后部署：

```bash
pnpm deploy:worker
```

部署成功后 Wrangler 会输出 Worker 地址，例如：

```text
https://cloud-config-api.<your-subdomain>.workers.dev
```

后文记为：

```text
BASE_URL=https://your-worker-url
```

## 10. 上线后验证

健康检查：

```bash
curl https://your-worker-url/health
```

导出配置：

```bash
curl -X POST https://your-worker-url/api/v1/config/export \
  -H "content-type: application/json" \
  -H "x-api-key: desktop-client-prod-2026-05-05-001" \
  -d '{"config":{"theme":"dark","language":"zh-CN"},"metadata":{"clientVersion":"1.0.0","platform":"windows"}}'
```

导入配置：

```bash
curl -X POST https://your-worker-url/api/v1/config/import \
  -H "content-type: application/json" \
  -H "x-api-key: desktop-client-prod-2026-05-05-001" \
  -d '{"shareCode":"AbCdEfGhIjKlMnOp"}'
```

检查短码访问计数：

```bash
pnpm exec wrangler d1 execute DB --remote --command="select short_code, access_count, status, created_at from config_shares order by created_at desc limit 10;"
```

检查审计日志：

```bash
pnpm exec wrangler d1 execute DB --remote --command="select action, app_id, request_id, resource_type, resource_id, created_at from audit_logs order by created_at desc limit 20;"
```

## 11. 软件客户端接入

客户端只需要保存两个配置项：

```text
CloudConfigBaseUrl=https://your-worker-url
CloudConfigApiKey=your-plain-api-key
```

导出按钮流程：

1. 读取当前软件配置。
2. 调用 `POST /api/v1/config/export`。
3. 展示返回的 `shareCode`。

导入按钮流程：

1. 用户输入 16 位短码。
2. 本地先校验 `^[A-Za-z]{16}$`。
3. 调用 `POST /api/v1/config/import`。
4. 拿到 `config` 后由客户端决定覆盖或合并本地配置。

详细客户端代码示例见：

- [客户端接入教程](client-integration.md)
- [API 文档](api.md)
- [调用示例速查](../example.md)

## 12. 自动部署

仓库包含：

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

当前工作流监听 `main` 分支。如果你的仓库默认分支仍是 `master`，有两种选择：

- 把默认分支切换/重命名为 `main`。
- 或把两个 workflow 中的 `branches: [main]` 改成你的实际默认分支。

启用自动部署需要在 GitHub Actions Secrets 中配置：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

详细说明见 [GitHub Actions 与自动部署](github-actions.md)。

## 13. 常见故障

### `wrangler d1 create` 成功但迁移失败

检查：

- `wrangler.jsonc` 的 `database_id` 是否已经替换。
- 当前账号是否是创建 D1 的同一账号。
- Wrangler 是否已登录。

### 接口返回 `40101`

原因通常是 API Key 错误：

- 请求头缺少 `x-api-key`。
- 传的是哈希值，不是明文 API Key。
- D1 中的 `client_apps.status` 不是 `active`。
- 明文 API Key 与 D1 中保存的哈希不匹配。

可重新生成哈希并更新：

```bash
pnpm hash:api-key your-plain-api-key
pnpm exec wrangler d1 execute DB --remote --command="update client_apps set api_key_hash='替换为新哈希', status='active', updated_at=current_timestamp where app_id='desktop-client';"
```

### 接口返回 `40002`

配置超过 `MAX_CONFIG_BYTES`。当前默认限制：

```jsonc
"MAX_CONFIG_BYTES": "262144"
```

建议先减少客户端导出的配置范围，不要直接大幅提高限制。

### 接口返回 `40401`

短码不可用：

- 用户输入错误。
- 短码不存在。
- 短码记录状态不是 `active`。
- 未来如果启用过期时间，短码可能已过期。

### 本地正常，远程失败

优先检查：

- 是否执行 `pnpm d1:migrate:remote`。
- 远程 D1 是否插入 `client_apps`。
- 客户端调用的是否是最新 Worker URL。
- `wrangler.jsonc` 中的 `database_id` 是否指向正确 D1。

## 14. 发布检查清单

- 已执行 `pnpm install`。
- 已执行 `pnpm typecheck`。
- 已执行 `pnpm test`。
- 已创建远程 D1。
- `wrangler.jsonc` 已填入真实 `database_id`。
- 已执行 `pnpm d1:migrate:remote`。
- `client_apps` 至少有一个 `active` 客户端。
- 已确认调用时传明文 API Key。
- 已部署 Worker。
- 已验证 `/health`。
- 已验证导出接口。
- 已验证导入接口。
- 已检查 `config_shares` 和 `audit_logs`。
