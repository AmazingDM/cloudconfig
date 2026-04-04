# D1 结构说明

## configs

保存完整配置正文。

字段：

- `id`：配置主键
- `content_json`：原始 JSON 文本
- `content_hash`：正文摘要
- `content_size`：字节长度
- `created_at`：创建时间

## config_shares

保存短码与配置的映射关系。

字段：

- `id`：分享记录主键
- `config_id`：关联配置主键
- `short_code`：16 位分享短码
- `status`：当前状态
- `expires_at`：过期时间，首版默认为空
- `access_count`：访问次数
- `created_at`：创建时间

## client_apps

保存客户端应用的鉴权信息。

字段：

- `app_id`：应用标识
- `app_name`：应用名称
- `api_key_hash`：`API Key` 的 SHA-256 哈希值
- `status`：状态
- `created_at`：创建时间
- `updated_at`：更新时间

## audit_logs

保存关键操作审计信息。

字段：

- `id`：日志主键
- `app_id`：调用应用
- `action`：动作名称
- `request_id`：请求追踪 ID
- `ip`：调用 IP
- `resource_type`：资源类型
- `resource_id`：资源标识
- `metadata_json`：附加元数据
- `created_at`：创建时间
