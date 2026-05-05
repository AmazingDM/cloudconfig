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
  -> 写入 configs
  -> 生成 16 位短码
  -> 写入 config_shares
  -> 写入 audit_logs(config.export)
  -> 返回 configId + shareCode
```

### 导入配置

```text
POST /api/v1/config/import
  -> 校验 x-api-key
  -> 解析 JSON 请求体
  -> 校验 shareCode 格式
  -> 查询 config_shares + configs
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
| `src/common/hash.ts` | SHA-256 哈希工具 |
| `src/common/request.ts` | IP 和配置大小读取 |
| `src/modules/client-app/*` | 客户端 API Key 鉴权 |
| `src/modules/config/*` | 配置导出/导入业务和 D1 访问 |
| `src/modules/share/short-code.ts` | 16 位短码生成 |
| `src/modules/audit/*` | 审计日志写入 |

## 数据模型关系

```text
client_apps
  | app_id
  v
audit_logs.app_id

configs.id
  ^
  |
config_shares.config_id
```

表职责：

| 表 | 职责 |
| --- | --- |
| `configs` | 保存完整配置 JSON 文本、内容哈希和字节大小 |
| `config_shares` | 保存短码、配置映射、状态、过期时间和访问次数 |
| `client_apps` | 保存客户端应用和 API Key 哈希 |
| `audit_logs` | 记录导出/导入动作、请求 ID、客户端、IP 和元数据 |

## 鉴权设计

客户端发送：

```text
x-api-key: 明文 API Key
```

服务端处理：

1. 读取请求头。
2. 计算 SHA-256 十六进制哈希。
3. 查询 `client_apps`：

```sql
select app_id
from client_apps
where api_key_hash = ? and status = 'active'
limit 1;
```

这种设计避免 D1 保存明文 API Key，但它仍然是静态密钥机制。生产环境应为不同客户端、渠道和环境分配不同密钥。

## 短码设计

当前短码规则：

- 长度固定 16。
- 字符范围为 `A-Z` 和 `a-z`。
- 写入 `config_shares.short_code` 时由唯一索引兜底。
- 发生唯一约束冲突时最多重试 5 次。
- 当前默认不过期，`expires_at` 保留给后续扩展。

## 配置大小限制

导出接口不会按原始请求体大小判断，而是先对 `body.config` 执行 `JSON.stringify`，再计算 UTF-8 字节长度。

默认上限来自 `wrangler.jsonc`：

```jsonc
"MAX_CONFIG_BYTES": "262144"
```

也就是 `256KB`。

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
