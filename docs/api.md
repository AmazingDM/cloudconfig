# API 文档

本文档描述当前 Worker 暴露的 HTTP 接口、鉴权方式、请求/响应结构和调用示例。

## 基础信息

本地开发地址通常为：

```text
http://127.0.0.1:8787
```

正式部署后地址以 Wrangler 输出为准，常见格式为：

```text
https://cloud-config-api.<your-subdomain>.workers.dev
```

后文用变量表示：

```text
BASE_URL=https://your-worker-url
API_KEY=your-plain-api-key
```

## 鉴权

业务接口必须携带请求头：

```text
x-api-key: <明文 API Key>
content-type: application/json
```

注意：

- `x-api-key` 传明文 API Key。
- D1 的 `client_apps.api_key_hash` 保存的是该明文 API Key 的 PBKDF2-SHA256 哈希。
- Worker 收到请求后会读取 `status = 'active'` 的客户端应用，并用 `x-api-key` 逐条验证哈希。
- 不要把数据库中的哈希值直接当作 `x-api-key`，否则会按明文再次验证，导致鉴权失败。
- Worker 仍兼容旧版 64 位 SHA-256 哈希，建议已有环境逐步轮换成 `pbkdf2-sha256$迭代次数$salt$hash` 格式。

生成哈希：

```bash
pnpm hash:api-key your-plain-api-key
```

## 通用响应

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "requestId": "uuid"
}
```

失败响应：

```json
{
  "code": 40000,
  "message": "请求参数无效",
  "data": null,
  "requestId": "uuid"
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | 业务错误码，`0` 表示成功 |
| `message` | string | 结果描述 |
| `data` | any | 成功数据；失败时为 `null` |
| `requestId` | string | 每次请求生成的追踪 ID，可用于排查审计日志 |

## 错误码

| HTTP 状态 | 业务码 | 场景 | 常见处理 |
| --- | ---: | --- | --- |
| `400` | `40000` | 请求体不是合法 JSON，或字段格式不符合要求 | 检查 JSON 和字段名 |
| `400` | `40002` | 导出请求体超过 `MAX_EXPORT_REQUEST_BYTES`，或配置 JSON 序列化后超过 `MAX_CONFIG_BYTES` | 压缩配置或调低导出范围 |
| `401` | `40101` | 缺少或错误的 `x-api-key` | 确认传的是明文 API Key |
| `404` | `40400` | 路由不存在 | 检查 URL |
| `404` | `40401` | 短码不存在、非 active 或已过期 | 提示用户重新导出 |
| `500` | `50000` | 服务端内部错误 | 记录 `requestId` 后排查 Worker/D1 |

## GET /

返回服务基础信息。

### 请求

```bash
curl https://your-worker-url/
```

### 响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "name": "Cloud Config API",
    "runtime": "cloudflare-workers"
  },
  "requestId": "..."
}
```

## GET /health

检查 Worker 是否能访问 D1。

### 请求

```bash
curl https://your-worker-url/health
```

### 响应

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

## POST /api/v1/config/export

导出客户端当前配置，并返回可分享短码。

同一个 `app_id` 下，相同 `JSON.stringify(config)` 文本会返回已有 `configId` 和 `shareCode`，不会重复生成配置正文或新短码。`app_id` 来自 `x-api-key` 对应的客户端应用，不读取请求体字段。

### 请求体

```json
{
  "config": {
    "theme": "dark",
    "language": "zh-CN",
    "window": {
      "width": 1280,
      "height": 720
    }
  },
  "metadata": {
    "clientVersion": "1.0.0",
    "platform": "windows"
  }
}
```

字段说明：

| 字段 | 必填 | 类型 | 限制 | 说明 |
| --- | --- | --- | --- | --- |
| `config` | 是 | any JSON value | 序列化后默认不超过 `256KB` | 客户端配置正文 |
| `metadata` | 否 | object | 仅审计记录使用 | 附加客户端信息 |
| `metadata.clientVersion` | 否 | string | `1..64` 字符 | 客户端版本 |
| `metadata.platform` | 否 | string | `1..64` 字符 | 平台，例如 `windows` |

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "configId": "019f9d1d-4d46-7f00-a6cc-1bbf7b7f3d35",
    "shareCode": "AbCdEfGhIjKlMnOp"
  },
  "requestId": "..."
}
```

### Bash/curl 示例

```bash
curl -X POST "$BASE_URL/api/v1/config/export" \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"config":{"theme":"dark","language":"zh-CN","window":{"width":1280,"height":720}},"metadata":{"clientVersion":"1.0.0","platform":"windows"}}'
```

### Windows PowerShell 示例

```powershell
$BaseUrl = "https://your-worker-url"
$ApiKey = "your-plain-api-key"

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
  -Uri "$BaseUrl/api/v1/config/export" `
  -Headers @{ "x-api-key" = $ApiKey } `
  -ContentType "application/json" `
  -Body $Body
```

### JavaScript/TypeScript 示例

```ts
type ExportResponse = {
  code: number;
  message: string;
  data: {
    configId: string;
    shareCode: string;
  } | null;
  requestId: string;
};

export async function exportConfig(baseUrl: string, apiKey: string, config: unknown) {
  const response = await fetch(`${baseUrl}/api/v1/config/export`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      config,
      metadata: {
        clientVersion: '1.0.0',
        platform: 'windows'
      }
    })
  });

  const payload = await response.json() as ExportResponse;
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(`${payload.message} requestId=${payload.requestId}`);
  }

  return payload.data.shareCode;
}
```

## POST /api/v1/config/import

根据短码导入完整配置。

短码按 `app_id` 隔离。请求使用的 `x-api-key` 必须属于创建该短码的客户端应用，否则会按无效短码处理。

### 请求体

```json
{
  "shareCode": "AbCdEfGhIjKlMnOp"
}
```

字段说明：

| 字段 | 必填 | 类型 | 限制 | 说明 |
| --- | --- | --- | --- | --- |
| `shareCode` | 是 | string | 必须匹配 `^[A-Za-z]{16}$` | 导出接口返回的 16 位短码 |

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "configId": "019f9d1d-4d46-7f00-a6cc-1bbf7b7f3d35",
    "shareCode": "AbCdEfGhIjKlMnOp",
    "config": {
      "theme": "dark",
      "language": "zh-CN",
      "window": {
        "width": 1280,
        "height": 720
      }
    }
  },
  "requestId": "..."
}
```

### Bash/curl 示例

```bash
curl -X POST "$BASE_URL/api/v1/config/import" \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"shareCode":"AbCdEfGhIjKlMnOp"}'
```

### Windows PowerShell 示例

```powershell
$BaseUrl = "https://your-worker-url"
$ApiKey = "your-plain-api-key"
$ShareCode = "AbCdEfGhIjKlMnOp"

$Body = @{
  shareCode = $ShareCode
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/v1/config/import" `
  -Headers @{ "x-api-key" = $ApiKey } `
  -ContentType "application/json" `
  -Body $Body
```

### C# HttpClient 示例

```csharp
using System.Net.Http.Json;
using System.Text.Json;

public sealed class CloudConfigClient
{
    private readonly HttpClient _http;
    private readonly string _apiKey;

    public CloudConfigClient(HttpClient http, string baseUrl, string apiKey)
    {
        _http = http;
        _http.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        _apiKey = apiKey;
    }

    public async Task<string> ExportAsync(object config, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/v1/config/export");
        request.Headers.Add("x-api-key", _apiKey);
        request.Content = JsonContent.Create(new
        {
            config,
            metadata = new
            {
                clientVersion = "1.0.0",
                platform = "windows"
            }
        });

        using var response = await _http.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<ApiResponse<ExportData>>(cancellationToken: cancellationToken);
        if (!response.IsSuccessStatusCode || payload?.Code != 0 || payload.Data is null)
        {
            throw new InvalidOperationException(payload?.Message ?? response.ReasonPhrase);
        }

        return payload.Data.ShareCode;
    }

    public async Task<JsonElement> ImportAsync(string shareCode, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/v1/config/import");
        request.Headers.Add("x-api-key", _apiKey);
        request.Content = JsonContent.Create(new { shareCode });

        using var response = await _http.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<ApiResponse<ImportData>>(cancellationToken: cancellationToken);
        if (!response.IsSuccessStatusCode || payload?.Code != 0 || payload.Data is null)
        {
            throw new InvalidOperationException(payload?.Message ?? response.ReasonPhrase);
        }

        return payload.Data.Config;
    }

    private sealed record ApiResponse<T>(int Code, string Message, T? Data, string RequestId);
    private sealed record ExportData(string ConfigId, string ShareCode);
    private sealed record ImportData(string ConfigId, string ShareCode, JsonElement Config);
}
```

## 调用顺序建议

导出配置：

1. 客户端读取本地配置。
2. 调用 `POST /api/v1/config/export`。
3. 展示 `shareCode` 给用户。
4. 用户复制或手动输入短码。

导入配置：

1. 用户输入 16 位短码。
2. 客户端先在本地校验格式：只允许大小写英文字母，长度必须是 16。
3. 调用 `POST /api/v1/config/import`。
4. 客户端拿到 `config` 后自行决定覆盖、合并或弹窗确认。

## 验证异常场景

错误 API Key：

```bash
curl -X POST "$BASE_URL/api/v1/config/export" \
  -H "content-type: application/json" \
  -H "x-api-key: wrong-key" \
  -d '{"config":{"theme":"dark"}}'
```

预期：

```json
{
  "code": 40101,
  "message": "客户端鉴权失败",
  "data": null,
  "requestId": "..."
}
```

错误短码：

```bash
curl -X POST "$BASE_URL/api/v1/config/import" \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"shareCode":"AAAAAAAAAAAAAAAA"}'
```

预期：

```json
{
  "code": 40401,
  "message": "分享短码无效或已失效",
  "data": null,
  "requestId": "..."
}
```

错误 JSON：

```bash
curl -X POST "$BASE_URL/api/v1/config/export" \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"config":'
```

预期返回 `40000`。
