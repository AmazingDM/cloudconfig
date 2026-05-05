# 客户端接入教程

本文档面向软件客户端开发者，说明如何把配置导出/导入能力接入到应用中。

## 1. 客户端需要保存的配置

客户端只需要两个服务端配置项：

```text
CloudConfigBaseUrl=https://your-worker-url
CloudConfigApiKey=your-plain-api-key
```

说明：

- `CloudConfigBaseUrl` 是 Worker 部署后的地址，不带结尾 `/` 也可以。
- `CloudConfigApiKey` 是明文 API Key。
- D1 里保存的是该明文 API Key 的 SHA-256 哈希，不是客户端要传的值。

## 2. 导出流程

推荐交互：

1. 用户点击“导出配置”。
2. 客户端读取当前本地配置。
3. 客户端调用 `POST /api/v1/config/export`。
4. 成功后展示 `shareCode`。
5. 用户复制短码，或把短码输入到另一台设备。

接口返回的 `configId` 可以用于日志排查，不需要展示给普通用户。

## 3. 导入流程

推荐交互：

1. 用户点击“导入配置”。
2. 用户输入 16 位短码。
3. 客户端本地先校验短码格式：`^[A-Za-z]{16}$`。
4. 客户端调用 `POST /api/v1/config/import`。
5. 客户端拿到 `config`。
6. 客户端提示用户确认覆盖，或按自身策略合并本地配置。

导入接口只返回 JSON 配置正文，不会决定客户端如何落盘。

## 4. TypeScript 示例

```ts
type ApiResponse<T> = {
  code: number;
  message: string;
  data: T | null;
  requestId: string;
};

type ExportData = {
  configId: string;
  shareCode: string;
};

type ImportData<TConfig> = {
  configId: string;
  shareCode: string;
  config: TConfig;
};

export class CloudConfigClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  public async exportConfig(config: unknown): Promise<string> {
    const payload = await this.post<ExportData>('/api/v1/config/export', {
      config,
      metadata: {
        clientVersion: '1.0.0',
        platform: 'windows'
      }
    });

    return payload.shareCode;
  }

  public async importConfig<TConfig>(shareCode: string): Promise<TConfig> {
    if (!/^[A-Za-z]{16}$/.test(shareCode)) {
      throw new Error('短码格式无效');
    }

    const payload = await this.post<ImportData<TConfig>>('/api/v1/config/import', {
      shareCode
    });

    return payload.config;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json() as ApiResponse<T>;
    if (!response.ok || payload.code !== 0 || payload.data === null) {
      throw new Error(`${payload.message} requestId=${payload.requestId}`);
    }

    return payload.data;
  }
}
```

使用：

```ts
const client = new CloudConfigClient(
  'https://your-worker-url',
  'your-plain-api-key'
);

const shareCode = await client.exportConfig({
  theme: 'dark',
  language: 'zh-CN'
});

const config = await client.importConfig<typeof localConfig>(shareCode);
```

## 5. C# 示例

适用于 .NET 客户端。

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
            throw new InvalidOperationException($"{payload?.Message ?? response.ReasonPhrase} requestId={payload?.RequestId}");
        }

        return payload.Data.ShareCode;
    }

    public async Task<JsonElement> ImportAsync(string shareCode, CancellationToken cancellationToken = default)
    {
        if (shareCode.Length != 16 || shareCode.Any(c => (c < 'A' || c > 'Z') && (c < 'a' || c > 'z')))
        {
            throw new ArgumentException("短码格式无效", nameof(shareCode));
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "api/v1/config/import");
        request.Headers.Add("x-api-key", _apiKey);
        request.Content = JsonContent.Create(new { shareCode });

        using var response = await _http.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<ApiResponse<ImportData>>(cancellationToken: cancellationToken);
        if (!response.IsSuccessStatusCode || payload?.Code != 0 || payload.Data is null)
        {
            throw new InvalidOperationException($"{payload?.Message ?? response.ReasonPhrase} requestId={payload?.RequestId}");
        }

        return payload.Data.Config;
    }

    private sealed record ApiResponse<T>(int Code, string Message, T? Data, string RequestId);
    private sealed record ExportData(string ConfigId, string ShareCode);
    private sealed record ImportData(string ConfigId, string ShareCode, JsonElement Config);
}
```

如果使用依赖注入，可以注册一个客户端工厂：

```csharp
services.AddHttpClient();

services.AddSingleton(provider =>
{
    var configuration = provider.GetRequiredService<IConfiguration>();
    var httpClientFactory = provider.GetRequiredService<IHttpClientFactory>();

    return new CloudConfigClient(
        httpClientFactory.CreateClient(),
        configuration["CloudConfig:BaseUrl"]!,
        configuration["CloudConfig:ApiKey"]!
    );
});
```

如果不使用依赖注入：

```csharp
using var http = new HttpClient();
var client = new CloudConfigClient(http, "https://your-worker-url", "your-plain-api-key");
var shareCode = await client.ExportAsync(localConfig);
var imported = await client.ImportAsync(shareCode);
```

## 6. Windows PowerShell 验证脚本

```powershell
$BaseUrl = "https://your-worker-url"
$ApiKey = "your-plain-api-key"

$ExportBody = @{
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

$ExportResult = Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/v1/config/export" `
  -Headers @{ "x-api-key" = $ApiKey } `
  -ContentType "application/json" `
  -Body $ExportBody

$ShareCode = $ExportResult.data.shareCode
$ShareCode

$ImportBody = @{
  shareCode = $ShareCode
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/v1/config/import" `
  -Headers @{ "x-api-key" = $ApiKey } `
  -ContentType "application/json" `
  -Body $ImportBody
```

## 7. 客户端错误处理建议

建议把 HTTP 状态和业务 `code` 一起处理：

| code | 客户端提示 |
| ---: | --- |
| `40000` | 配置数据格式不正确，请升级客户端或重试 |
| `40002` | 配置太大，请减少导出内容 |
| `40101` | 当前客户端未授权，请检查服务配置 |
| `40401` | 短码无效或已失效，请重新导出 |
| `50000` | 服务暂时不可用，请稍后重试 |

同时记录：

- `requestId`
- HTTP 状态码
- `code`
- `message`
- 当前客户端版本
- 当前 API Base URL

不要记录明文 API Key。

## 8. 客户端配置安全建议

- 生产 API Key 不要硬编码在公开仓库。
- 不同环境使用不同 API Key，例如 dev/staging/prod 分离。
- 如果客户端可以被用户直接反编译，静态 API Key 只能作为轻量访问控制，不能当作用户级权限。
- API Key 泄露后，立即生成新 Key，更新 D1 哈希并发布客户端配置。
- 不要把账号密码、Token、Cookie 等长期高敏感凭据放进导出的配置。

## 9. 接入验收清单

- 客户端 Base URL 配置正确。
- 客户端传的是明文 API Key。
- D1 中保存的是明文 API Key 的 SHA-256 哈希。
- 导出接口能返回 `shareCode`。
- 导入接口能按 `shareCode` 返回完整 `config`。
- 错误 API Key 会得到 `40101`。
- 错误短码会得到 `40401`。
- 客户端日志会记录 `requestId`，但不记录明文 API Key。
