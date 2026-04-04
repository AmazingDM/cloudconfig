# Cloud Config API

基于 Cloudflare Workers 与 D1 的软件配置导入导出 API 服务。

## 项目说明

该服务只对外暴露 API，供软件客户端直接接入：

- 用户在软件中点击“导出配置”后，软件调用导出接口获取短码
- 用户在软件中输入短码后，软件调用导入接口获取完整配置

首版运行架构如下：

- Cloudflare Workers：承接 API 请求
- Cloudflare D1：保存配置正文、短码映射、客户端应用和审计日志
- Hono：组织 Worker 路由与中间件

## 核心能力

- 静态 `API Key` 鉴权
- 16 位大小写英文字母短码
- 单份配置默认限制为 `256KB`
- 统一 JSON 响应结构
- D1 迁移脚本

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 登录 Cloudflare

```bash
pnpm exec wrangler login
```

### 3. 创建 D1 数据库

```bash
pnpm exec wrangler d1 create cloud-config-db
```

将命令输出中的 `database_id` 填入 [wrangler.jsonc](/I:/Sora/CloudConfig/wrangler.jsonc)。

### 4. 执行本地迁移

```bash
pnpm d1:migrate:local
```

### 5. 启动本地开发

```bash
pnpm dev
```

本地默认地址通常为 `http://127.0.0.1:8787`。

## 部署步骤

### 1. 执行远程迁移

```bash
pnpm d1:migrate:remote
```

### 2. 部署 Worker

```bash
pnpm deploy:worker
```

## 初始化客户端应用

先生成明文 `API Key` 的哈希值：

```bash
pnpm hash:api-key your-plain-api-key
```

然后将结果写入 `client_apps` 表。示例 SQL 见 [seeds/client_apps.example.sql](/I:/Sora/CloudConfig/seeds/client_apps.example.sql)。

## 核心接口

- `POST /api/v1/config/export`
- `POST /api/v1/config/import`
- `GET /health`

详细接口说明见 [docs/api.md](/I:/Sora/CloudConfig/docs/api.md)。

## 文档索引

- [架构说明](/I:/Sora/CloudConfig/docs/architecture.md)
- [接口文档](/I:/Sora/CloudConfig/docs/api.md)
- [部署文档](/I:/Sora/CloudConfig/docs/deployment.md)
- [GitHub Actions 文档](/I:/Sora/CloudConfig/docs/github-actions.md)
- [D1 结构说明](/I:/Sora/CloudConfig/docs/d1-schema.md)
