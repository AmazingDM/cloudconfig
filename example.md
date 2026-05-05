# 调用示例速查

把下面三个值替换成你的实际值：

```text
BASE_URL=https://your-worker-url
API_KEY=your-plain-api-key
SHARE_CODE=AbCdEfGhIjKlMnOp
```

注意：`API_KEY` 是明文 API Key，不是 D1 中保存的 `api_key_hash`。

## 1. 健康检查

```bash
curl https://your-worker-url/health
```

PowerShell：

```powershell
Invoke-RestMethod -Uri "https://your-worker-url/health"
```

## 2. 导出配置

Bash/curl：

```bash
curl -X POST https://your-worker-url/api/v1/config/export \
  -H "content-type: application/json" \
  -H "x-api-key: your-plain-api-key" \
  -d '{"config":{"theme":"dark","language":"zh-CN","window":{"width":1280,"height":720}},"metadata":{"clientVersion":"1.0.0","platform":"windows"}}'
```

PowerShell：

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

成功后记录返回的：

```json
{
  "data": {
    "configId": "...",
    "shareCode": "AbCdEfGhIjKlMnOp"
  }
}
```

## 3. 导入配置

Bash/curl：

```bash
curl -X POST https://your-worker-url/api/v1/config/import \
  -H "content-type: application/json" \
  -H "x-api-key: your-plain-api-key" \
  -d '{"shareCode":"AbCdEfGhIjKlMnOp"}'
```

PowerShell：

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

## 4. 生成 API Key 哈希

服务端数据库保存哈希，客户端调用传明文。

```bash
pnpm hash:api-key your-plain-api-key
```

把输出写入 `client_apps.api_key_hash`：

```bash
pnpm exec wrangler d1 execute DB --remote --command="insert into client_apps (app_id, app_name, api_key_hash, status) values ('desktop-client', '桌面客户端', '替换为哈希', 'active');"
```

更新已有客户端：

```bash
pnpm exec wrangler d1 execute DB --remote --command="update client_apps set api_key_hash='替换为新哈希', updated_at=current_timestamp where app_id='desktop-client';"
```

## 5. 异常验证

错误 API Key：

```bash
curl -X POST https://your-worker-url/api/v1/config/export \
  -H "content-type: application/json" \
  -H "x-api-key: wrong-key" \
  -d '{"config":{"theme":"dark"}}'
```

预期返回 `40101`。

错误短码：

```bash
curl -X POST https://your-worker-url/api/v1/config/import \
  -H "content-type: application/json" \
  -H "x-api-key: your-plain-api-key" \
  -d '{"shareCode":"AAAAAAAAAAAAAAAA"}'
```

预期返回 `40401`。
