# Cloud Config API

Cloud Config API 是一个基于 Cloudflare Workers + D1 的软件配置导入/导出服务。客户端把当前配置提交到接口后会得到一个 16 位分享短码；另一台设备或同一软件实例再用短码取回完整 JSON 配置。

当前项目只提供 API，不提供网页后台。

## 能力范围

- `GET /health`：检查 Worker 与 D1 是否可用。
- `POST /api/v1/config/export`：导出配置并生成分享短码。
- `POST /api/v1/config/import`：通过分享短码导入配置。
- `x-api-key` 静态鉴权：请求头传明文 API Key，服务端用 PBKDF2-SHA256 验证 D1 中的 `client_apps.api_key_hash`。
- 配置大小限制：默认 `256KB`，由 `wrangler.jsonc` 中的 `MAX_CONFIG_BYTES` 控制。
- 导出请求体限制：默认 `272KB`，由 `MAX_EXPORT_REQUEST_BYTES` 控制，在 JSON 解析前拒绝明显超大的导出请求。
- app 内配置去重：同一 `app_id` 下相同 `JSON.stringify(config)` 文本返回已有短码，不重复保存配置正文。
- 数据落地：D1 保存配置正文、短码映射、客户端应用和审计日志。

## 技术栈

- Cloudflare Workers
- Cloudflare D1
- Hono
- TypeScript
- Zod
- Vitest
- Wrangler
- pnpm

## 项目结构

```text
.
|-- src/                         Worker 源码
|   |-- app/                     Hono 应用、路由和运行时类型
|   |-- common/                  响应、错误、哈希、请求工具
|   `-- modules/                 业务模块
|       |-- audit/               审计日志写入
|       |-- client-app/          API Key 鉴权
|       |-- config/              配置导入/导出
|       `-- share/               短码生成
|-- migrations/0001_init.sql     D1 表结构迁移
|-- seeds/client_apps.example.sql 客户端应用初始化 SQL 示例
|-- scripts/hash-api-key.ts      生成 API Key 哈希
|-- docs/                        详细文档
|-- tests/                       单元测试
|-- wrangler.jsonc               Worker 与 D1 配置
`-- package.json                 命令脚本与依赖
```

## 本地快速启动

前置要求：

- Node.js `>= 22`
- pnpm
- Cloudflare 账号和 Wrangler 登录态

安装依赖：

```bash
pnpm install
```

执行本地 D1 迁移：

```bash
pnpm d1:migrate:local
```

如需本地验证导出/导入接口，还需要按 [从 0 部署教程](docs/deployment.md#7-初始化客户端-api-key) 给本地 D1 插入 `client_apps`。

启动本地 Worker：

```bash
pnpm dev
```

本地默认地址通常是：

```text
http://127.0.0.1:8787
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

## 从 0 部署

首次部署请按完整教程执行：

- [从 0 部署教程](docs/deployment.md)

核心流程如下：

1. 安装依赖并登录 Cloudflare。
2. 创建 D1 数据库。
3. 将 D1 `database_id` 写入 `wrangler.jsonc`。
4. 执行 D1 远程迁移。
5. 生成 API Key 的 PBKDF2-SHA256 哈希。
6. 向 `client_apps` 表插入客户端应用。
7. 部署 Worker。
8. 使用接口调用示例验证 `/health`、导出和导入。

## API Key 规则

调用接口时传的是明文 API Key：

```text
x-api-key: your-plain-api-key
```

D1 中保存的是该明文的 PBKDF2-SHA256 哈希：

```bash
pnpm hash:api-key your-plain-api-key
```

不要把数据库里的哈希值当作 `x-api-key` 传给接口，除非你一开始就把这个哈希字符串本身当作明文 API Key 生成过哈希。

新生成的哈希格式为 `pbkdf2-sha256$迭代次数$salt$hash`。Worker 仍可验证旧版 64 位 SHA-256 哈希，便于已有环境平滑轮换到新格式。

## 调用示例

导出配置：

```bash
curl -X POST https://your-worker-url/api/v1/config/export \
  -H "content-type: application/json" \
  -H "x-api-key: your-plain-api-key" \
  -d '{"config":{"theme":"dark","language":"zh-CN"},"metadata":{"clientVersion":"1.0.0","platform":"windows"}}'
```

导入配置：

```bash
curl -X POST https://your-worker-url/api/v1/config/import \
  -H "content-type: application/json" \
  -H "x-api-key: your-plain-api-key" \
  -d '{"shareCode":"AbCdEfGhIjKlMnOp"}'
```

更多 Windows PowerShell、JavaScript/TypeScript、C# 示例见：

- [API 文档](docs/api.md)
- [客户端接入教程](docs/client-integration.md)
- [调用示例速查](example.md)

## 常用命令

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm d1:migrate:local
pnpm d1:migrate:remote
pnpm hash:api-key your-plain-api-key
pnpm dev
pnpm deploy:worker
```

## 文档索引

- [架构说明](docs/architecture.md)
- [从 0 部署教程](docs/deployment.md)
- [API 文档](docs/api.md)
- [客户端接入教程](docs/client-integration.md)
- [D1 结构说明](docs/d1-schema.md)
- [GitHub Actions 与自动部署](docs/github-actions.md)
- [安全策略](SECURITY.md)
- [更新日志](CHANGELOG.md)
