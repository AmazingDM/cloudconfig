# Cloudflare 部署文档

本文档基于当前仓库的实际实现编写，适用于将本项目部署为：

- 运行时：Cloudflare Workers
- 数据库：Cloudflare D1
- 接口形态：纯 API
- 接入方：软件客户端

部署目标是让你最终获得一个可直接给软件调用的 API 地址，并完成以下能力初始化：

- 导出配置接口可用
- 导入配置接口可用
- D1 数据表已创建
- 客户端 `API Key` 已录入

如果你准备通过 GitHub 自动部署到 Cloudflare，请同时阅读：

- [docs/github-actions.md](/I:/Sora/CloudConfig/docs/github-actions.md)

---

## 1. 架构说明

当前项目部署后包含以下组件：

- Worker：负责接收 `export/import` API 请求
- D1：保存配置正文、短码映射、客户端应用信息、审计日志

当前版本不依赖：

- 传统服务器
- PM2
- Docker
- PostgreSQL
- Redis

---

## 2. 前置条件

开始前请确认以下条件已满足：

- 已安装 Node.js 22 或更高版本
- 已安装 pnpm
- 已具备 Cloudflare 账号
- 已有 Cloudflare Workers 与 D1 的可用权限

建议先确认本地版本：

```bash
node --version
pnpm --version
pnpm exec wrangler --version
```

---

## 3. 项目关键文件

部署过程中会用到以下文件：

- [wrangler.jsonc](/I:/Sora/CloudConfig/wrangler.jsonc)
- [migrations/0001_init.sql](/I:/Sora/CloudConfig/migrations/0001_init.sql)
- [seeds/client_apps.example.sql](/I:/Sora/CloudConfig/seeds/client_apps.example.sql)
- [package.json](/I:/Sora/CloudConfig/package.json)

其中：

- `wrangler.jsonc` 负责 Worker 与 D1 绑定配置
- `migrations/0001_init.sql` 负责初始化数据库结构
- `seeds/client_apps.example.sql` 用于初始化客户端应用数据

---

## 4. 第一次部署完整流程

### 4.1 安装依赖

在项目根目录执行：

```bash
pnpm install
```

建议安装完成后先做一次静态检查：

```bash
pnpm typecheck
pnpm test
```

如果这两步失败，不要继续部署，先修复本地环境或代码问题。

### 4.2 登录 Cloudflare

执行：

```bash
pnpm exec wrangler login
```

浏览器会弹出 Cloudflare 授权页面。授权成功后，Wrangler 会在本地保存登录态。

可用以下命令确认登录状态：

```bash
pnpm exec wrangler whoami
```

### 4.3 创建 D1 数据库

执行：

```bash
pnpm exec wrangler d1 create cloud-config-db
```

执行成功后，终端会输出类似内容：

```text
database_name = "cloud-config-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

你需要把返回的 `database_id` 填入 [wrangler.jsonc](/I:/Sora/CloudConfig/wrangler.jsonc) 里的这段配置：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "cloud-config-db",
    "database_id": "replace-with-your-d1-database-id",
    "preview_database_id": "cloud-config-db-local",
    "migrations_dir": "migrations"
  }
]
```

必须替换的字段：

- `database_id`

可以保留不改的字段：

- `binding`
- `database_name`
- `preview_database_id`
- `migrations_dir`

### 4.4 检查 Wrangler 配置

当前 [wrangler.jsonc](/I:/Sora/CloudConfig/wrangler.jsonc) 中与部署强相关的字段如下：

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

字段说明：

- `name`：Worker 名称，决定最终服务标识
- `main`：Worker 入口文件
- `compatibility_date`：Cloudflare 运行时兼容日期
- `workers_dev`：是否启用默认的 `workers.dev` 地址
- `APP_NAME`：服务名称
- `MAX_CONFIG_BYTES`：单份配置允许的最大字节数，当前默认 `262144`，即 `256KB`

如果你需要调整配置大小限制，可以修改：

```jsonc
"MAX_CONFIG_BYTES": "262144"
```

但当前系统设计就是按 `256KB` 上限开发的，不建议上线前随意放大。

### 4.5 执行本地 D1 迁移

本地开发和预验证先执行：

```bash
pnpm d1:migrate:local
```

该命令会根据 [migrations/0001_init.sql](/I:/Sora/CloudConfig/migrations/0001_init.sql) 初始化本地预览数据库。

### 4.6 执行远程 D1 迁移

确认 `database_id` 已写入 `wrangler.jsonc` 后，执行：

```bash
pnpm d1:migrate:remote
```

该命令会把迁移脚本应用到 Cloudflare 远程 D1。

执行完成后，可以手动确认表是否存在：

```bash
pnpm exec wrangler d1 execute DB --remote --command="select name from sqlite_master where type='table' order by name;"
```

你应当能看到以下核心表：

- `configs`
- `config_shares`
- `client_apps`
- `audit_logs`

### 4.7 生成客户端 API Key 哈希

系统不会保存明文 `API Key`，只保存其 SHA-256 哈希。

先准备一个给软件客户端使用的明文 `API Key`，例如：

```text
desktop-client-prod-xxxxxxxx
```

然后执行：

```bash
pnpm hash:api-key desktop-client-prod-xxxxxxxx
```

终端会输出一段哈希值，例如：

```text
3f9f...abcd
```

### 4.8 初始化 client_apps 数据

打开 [seeds/client_apps.example.sql](/I:/Sora/CloudConfig/seeds/client_apps.example.sql)，将其中的：

```sql
'replace-with-sha256-hash'
```

替换为你上一步生成的真实哈希值。

如有需要，也可以一并修改：

- `app_id`
- `app_name`

替换完成后执行：

```bash
pnpm exec wrangler d1 execute DB --remote --file=./seeds/client_apps.example.sql
```

然后检查是否插入成功：

```bash
pnpm exec wrangler d1 execute DB --remote --command="select app_id, app_name, status from client_apps;"
```

### 4.9 本地启动 Worker 进行预验证

执行：

```bash
pnpm dev
```

Wrangler 会启动本地开发服务，通常地址为：

```text
http://127.0.0.1:8787
```

先检查健康接口：

```bash
curl http://127.0.0.1:8787/health
```

预期返回类似：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "d1": "ok"
  },
  "requestId": "..."
}
```

### 4.10 本地验证导出接口

示例命令：

```bash
curl -X POST http://127.0.0.1:8787/api/v1/config/export ^
  -H "content-type: application/json" ^
  -H "x-api-key: desktop-client-prod-xxxxxxxx" ^
  -d "{\"config\":{\"theme\":\"dark\",\"language\":\"zh-CN\"}}"
```

预期返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "configId": "uuid",
    "shareCode": "AbCdEfGhIjKlMnOp"
  },
  "requestId": "..."
}
```

请记录返回的 `shareCode`。

### 4.11 本地验证导入接口

将上一步得到的短码代入：

```bash
curl -X POST http://127.0.0.1:8787/api/v1/config/import ^
  -H "content-type: application/json" ^
  -H "x-api-key: desktop-client-prod-xxxxxxxx" ^
  -d "{\"shareCode\":\"AbCdEfGhIjKlMnOp\"}"
```

预期返回完整配置对象。

### 4.12 正式部署到 Cloudflare

当本地验证通过后，执行：

```bash
pnpm deploy
```

部署成功后，Wrangler 会输出 Worker 的可访问地址。

如果 `workers_dev` 仍为 `true`，通常会得到一个类似地址：

```text
https://cloud-config-api.<subdomain>.workers.dev
```

该地址就是软件客户端最终调用的 API 基础地址。

---

## 5. 上线后的验证流程

部署完成后，建议按以下顺序验证：

### 5.1 检查健康接口

```bash
curl https://your-worker-url/health
```

### 5.2 检查导出接口

```bash
curl -X POST https://your-worker-url/api/v1/config/export ^
  -H "content-type: application/json" ^
  -H "x-api-key: desktop-client-prod-xxxxxxxx" ^
  -d "{\"config\":{\"theme\":\"dark\"}}"
```

### 5.3 检查导入接口

使用返回的 `shareCode` 再执行导入：

```bash
curl -X POST https://your-worker-url/api/v1/config/import ^
  -H "content-type: application/json" ^
  -H "x-api-key: desktop-client-prod-xxxxxxxx" ^
  -d "{\"shareCode\":\"AbCdEfGhIjKlMnOp\"}"
```

### 5.4 检查 D1 数据

导出和导入各执行一次后，可以查询 D1：

```bash
pnpm exec wrangler d1 execute DB --remote --command="select short_code, access_count, status from config_shares order by created_at desc limit 10;"
```

以及：

```bash
pnpm exec wrangler d1 execute DB --remote --command="select action, request_id, resource_type from audit_logs order by created_at desc limit 20;"
```

---

## 6. 日常发布流程

后续每次发布建议固定为以下步骤：

### 6.1 本地检查

```bash
pnpm install
pnpm typecheck
pnpm test
```

### 6.2 如有数据库变更，先执行远程迁移

```bash
pnpm d1:migrate:remote
```

### 6.3 部署 Worker

```bash
pnpm deploy
```

### 6.4 发布后抽样验证

- `/health`
- 导出接口
- 导入接口
- D1 最近审计日志

---

## 7. 版本升级与数据库变更原则

### 7.1 新增数据库结构时

不要修改已有迁移文件，应该新增新的迁移文件，例如：

```text
migrations/0002_xxx.sql
```

这样做的好处：

- 本地和远程环境迁移顺序一致
- 可追溯
- 不会破坏已部署环境

### 7.2 修改接口行为时

如果软件客户端已经接入，接口变更应遵循：

- 优先向后兼容
- 不随意改字段名
- 不删除已发布字段

当前软件接入重点接口为：

- `POST /api/v1/config/export`
- `POST /api/v1/config/import`

---

## 8. 故障排查

### 8.1 `wrangler d1 migrations apply` 失败

优先检查：

- `wrangler.jsonc` 中 `database_id` 是否已替换
- 当前 Cloudflare 账号是否有 D1 权限
- 是否已执行 `wrangler login`

### 8.2 导出接口返回 `40101`

说明客户端 `API Key` 无效。请检查：

- 请求头是否包含 `x-api-key`
- 明文 `API Key` 是否与哈希初始化时对应
- `client_apps` 表中该记录是否仍为 `active`

### 8.3 导出接口返回 `40002`

说明配置超过系统大小限制。当前限制来自：

```jsonc
"MAX_CONFIG_BYTES": "262144"
```

也就是 `256KB`。

### 8.4 导入接口返回 `40401`

说明短码不存在、状态不可用或已过期。

首版默认不过期，因此一般应重点检查：

- 短码是否输错
- 导出是否成功写入
- `config_shares` 表中是否存在对应记录

### 8.5 本地能跑，远程不能跑

重点检查：

- 是否执行了 `pnpm d1:migrate:remote`
- 远程 D1 是否插入了 `client_apps`
- 发布的 Worker 地址是否正确
- 软件客户端是否仍调用旧地址

---

## 9. 安全建议

上线时请遵循以下规则：

- 为不同客户端环境使用不同 `API Key`
- 不要把明文 `API Key` 提交到仓库
- 明文 `API Key` 只在客户端构建流程或安全配置中使用
- 泄露后立即更新 `client_apps` 中的哈希值
- 不要无限制提高 `MAX_CONFIG_BYTES`

---

## 10. 发布前检查清单

- 已执行 `pnpm install`
- 已执行 `pnpm typecheck`
- 已执行 `pnpm test`
- `wrangler.jsonc` 中 `database_id` 已替换为真实值
- 已执行 `pnpm d1:migrate:remote`
- `client_apps` 已插入至少一条有效客户端记录
- 本地已验证 `/health`
- 本地已验证导出接口
- 本地已验证导入接口
- 已获得正式 Worker 访问地址

---

## 11. 当前部署命令速查

### 登录

```bash
pnpm exec wrangler login
```

### 查看账号

```bash
pnpm exec wrangler whoami
```

### 创建 D1

```bash
pnpm exec wrangler d1 create cloud-config-db
```

### 本地迁移

```bash
pnpm d1:migrate:local
```

### 远程迁移

```bash
pnpm d1:migrate:remote
```

### 生成 API Key 哈希

```bash
pnpm hash:api-key your-plain-api-key
```

### 本地开发

```bash
pnpm dev
```

### 正式部署

```bash
pnpm deploy
```
