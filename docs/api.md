# 接口文档

## 公共约定

### 请求头

所有业务接口都需要：

```text
x-api-key: <客户端 API Key>
content-type: application/json
```

### 响应结构

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "requestId": "uuid"
}
```

## POST /api/v1/config/export

### 说明

导出客户端当前配置并获取短码。

### 请求体

```json
{
  "config": {
    "theme": "dark",
    "language": "zh-CN"
  },
  "metadata": {
    "clientVersion": "1.0.0",
    "platform": "windows"
  }
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "configId": "uuid",
    "shareCode": "AbCdEfGhIjKlMnOp"
  },
  "requestId": "uuid"
}
```

### 失败场景

- `40101`：缺少或错误的 `API Key`
- `40000`：请求体格式错误
- `40002`：配置内容超过大小限制

## POST /api/v1/config/import

### 说明

根据短码导入完整配置。

### 请求体

```json
{
  "shareCode": "AbCdEfGhIjKlMnOp"
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "configId": "uuid",
    "shareCode": "AbCdEfGhIjKlMnOp",
    "config": {
      "theme": "dark",
      "language": "zh-CN"
    }
  },
  "requestId": "uuid"
}
```

### 失败场景

- `40101`：缺少或错误的 `API Key`
- `40000`：请求体格式错误
- `40401`：短码不存在或不可用

## GET /health

### 说明

检查 Worker 与 D1 绑定是否可用。

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "d1": "ok"
  },
  "requestId": "uuid"
}
```
