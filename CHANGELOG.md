# 更新日志

本文档记录项目的重要变更。

## [Unreleased]

### 变更

- 导出接口按 `app_id + content_hash` 精确去重，同一 app 重复导出相同配置会返回已有短码
- 导入接口按 `app_id + shareCode` 查询，避免不同客户端应用之间共享短码
- 导出接口增加 JSON 解析前的请求体大小限制 `MAX_EXPORT_REQUEST_BYTES`
- API Key 哈希升级为 PBKDF2-SHA256，并兼容验证旧版 64 位 SHA-256 哈希

### 文档

- 重写 README，补充项目结构、API Key 规则、快速启动和文档索引
- 完善从 0 部署教程，补充 D1 创建、迁移、API Key 初始化、上线验证和故障排查
- 扩展 API 文档，补充错误码、请求字段、PowerShell、TypeScript 和 C# 调用示例
- 新增客户端接入教程，说明导出/导入交互流程、客户端代码示例和验收清单
- 补充 D1 表结构、常用 SQL、API Key 轮换和迁移原则说明
- 清理根目录调用示例，明确 `x-api-key` 应传明文 API Key

## [0.1.0] - 2026-04-04

### 新增

- 初始化 Cloudflare Workers + Hono + D1 项目骨架
- 实现软件配置导出接口 `POST /api/v1/config/export`
- 实现软件配置导入接口 `POST /api/v1/config/import`
- 实现静态 `API Key` 鉴权
- 实现 16 位大小写字母短码生成
- 实现 D1 数据表迁移脚本
- 补充仓库级说明文档、安全文档和部署文档
