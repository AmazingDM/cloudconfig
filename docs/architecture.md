# 架构说明

Cloud Config API 是一个纯 API 服务，用于让软件客户端在不同设备或不同安装实例之间交换配置。

## 目标

系统解决两个动作：

- 导出：客户端把本地配置上传，服务端生成短码。
- 导入：客户端用短码取回完整配置。

系统不承担：

- 网页后台管理。
- 用户账号体系。
- 配置合并策略。
- 客户端本地配置读写。
- 长期高敏感凭据托管。

## 部署形态

```text
Software Client
      |
      | HTTPS + x-api-key
      v
Cloudflare Worker
      |
      | env.DB
      v
Cloudflare D1
```

组件职责：

| 组件 | 职责 |
| --- | --- |
| 软件客户端 | 读取/写入本地配置，调用导出/导入接口，展示或输入短码 |
| Cloudflare Worker | 鉴权、参数校验、配置大小校验、短码生成、业务编排、统一响应 |
| Cloudflare D1 | 保存配置正文、短码映射、客户端应用、审计日志 |
| Hono | 路由、中间件和错误处理 |
| Zod | 请求体结构校验 |

## 请求生命周期

每个请求都会先生成 `requestId`。成功和失败响应都会带回该 ID，审计日志中也会保存它，便于定位问题。

### 健康检查

```text
GET /health
  -> D1 执行 select 1
  -> 返回 { d1: "ok" }
```

### 导出配置

```text
POST /api/v1/config/export
  -> 校验 x-api-key
  -> 解析 JSON 请求体
  -> 校验 body.config 和 metadata
  -> JSON.stringify(config)
  -> 计算字节长度
  -> 超过 MAX_CONFIG_BYTES 则拒绝
  -> 计算 content_hash
  -> 按 app_id + content_hash 查询已有配置和短码
  -> 已存在则返回旧 configId + shareCode
  -> 不存在则写入 configs(app_id, content_json, content_hash)
  -> 生成 16 位短码并写入 config_shares
  -> 写入 audit_logs(config.export)
  -> 返回 configId + shareCode
```

### 导入配置

```text
POST /api/v1/config/import
  -> 校验 x-api-key
  -> 解析 JSON 请求体
  -> 校验 shareCode 格式
  -> 按 app_id + shareCode 查询 config_shares + configs
  -> 校验 share status / expires_at
  -> JSON.parse(content_json)
  -> config_shares.access_count + 1
  -> 写入 audit_logs(config.import)
  -> 返回 configId + shareCode + config
```

## 模块划分

| 路径 | 说明 |
| --- | --- |
| `src/index.ts` | Worker 默认导出入口 |
| `src/app/create-app.ts` | Hono 应用、路由、中间件、错误处理 |
| `src/app/types.ts` | Worker bindings 和 Hono variables 类型 |
| `src/common/api-response.ts` | 统一成功响应 |
| `src/common/app-error.ts` | 应用错误和业务错误码 |
| `src/common/hash.ts` | 配置内容 SHA-256 哈希工具 |
| `src/common/api-key-hash.ts` | API Key PBKDF2-SHA256 哈希生成与验证 |
| `src/common/request.ts` | IP 和配置大小读取 |
| `src/modules/client-app/*` | 客户端 API Key 鉴权 |
| `src/modules/config/*` | 配置导出/导入业务和 D1 访问 |
| `src/modules/share/short-code.ts` | 16 位短码生成 |
| `src/modules/audit/*` | 审计日志写入 |

## 数据模型关系

```text
client_apps
  | app_id
  |-- configs.app_id
  `-- audit_logs.app_id

configs.id
  ^
  |
config_shares.config_id
```

表职责：

| 表 | 职责 |
| --- | --- |
| `configs` | 保存 app 归属、完整配置 JSON 文本、内容哈希和字节大小 |
| `config_shares` | 保存 canonical 短码、配置映射、状态、过期时间和访问次数 |
| `client_apps` | 保存客户端应用和 API Key 哈希 |
| `audit_logs` | 记录导出/导入动作、请求 ID、客户端、IP 和元数据 |

## 鉴权设计

客户端发送：

```text
x-api-key: 明文 API Key
```

服务端处理：

1. 读取请求头。
2. 读取 active 客户端应用及其哈希。
3. 用明文 API Key 逐条验证 PBKDF2-SHA256 哈希：

```sql
select app_id, api_key_hash
from client_apps
where status = 'active';
```

这种设计避免 D1 保存明文 API Key，但它仍然是静态密钥机制。生产环境应为不同客户端、渠道和环境分配不同密钥。
旧版 64 位 SHA-256 哈希仍可验证，用于升级期兼容；新客户端应用和轮换后的密钥应使用 `pnpm hash:api-key` 生成的 PBKDF2-SHA256 格式。

## 短码设计

当前短码规则：

- 长度固定 16。
- 字符范围为 `A-Z` 和 `a-z`。
- 写入 `config_shares.short_code` 时由唯一索引兜底。
- 同一个 `app_id` 下，相同 `JSON.stringify(config)` 文本只保留一份 `configs` 和一个 canonical 短码。
- 不同 `app_id` 即使配置文本相同，也会生成彼此隔离的配置和短码。
- 发生唯一约束冲突时最多重试 5 次。
- 当前默认不过期，`expires_at` 保留给后续扩展。

## 配置大小限制

导出接口会先限制整个请求体大小，再对 `body.config` 执行 `JSON.stringify`，计算配置正文的 UTF-8 字节长度。

默认上限来自 `wrangler.jsonc`：

```jsonc
"MAX_CONFIG_BYTES": "262144"
```

也就是 `256KB`。

导出接口还会在 JSON 解析前检查整个请求体大小，默认来自：

```jsonc
"MAX_EXPORT_REQUEST_BYTES": "278528"
```

也就是 `272KB`，用于给 `config` 外层 envelope 和 `metadata` 留出空间。这个限制只能减少明显超大请求进入 JSON 解析，不能减少客户端上传完整配置的网络成本。

## 错误处理

所有业务错误使用统一结构：

```json
{
  "code": 40101,
  "message": "客户端鉴权失败",
  "data": null,
  "requestId": "..."
}
```

主要错误码见 [API 文档](api.md#错误码)。

## 设计约束

- 首版只支持导出和导入，不支持更新、删除、列表查询。
- 配置内容原样作为 JSON 文本保存，服务端不理解具体业务字段。
- 配置去重按 `app_id + SHA-256(JSON.stringify(config))` 精确匹配，不做 JSON 字段排序或语义归一化。
- 客户端负责决定导入后覆盖、合并还是提示用户选择。
- 静态 API Key 适合客户端到服务端的轻量鉴权，不等同于用户级权限系统。
- D1 中保存完整配置正文，不应存储长期高敏感凭据。

## 后续扩展方向

可以在不破坏现有接口的前提下扩展：

- 短码过期策略。
- 按 `app_id` 隔离短码可见性。
- 客户端版本兼容策略。
- 配置压缩或加密。
- 后台管理接口。
- 独立 staging/production 环境。
