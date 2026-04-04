# GitHub Actions 与自动部署

本文档说明如何为当前项目配置 GitHub CI 与自动部署到 Cloudflare Workers。

当前仓库已经包含以下工作流：

- [CI 工作流](/I:/Sora/CloudConfig/.github/workflows/ci.yml)
- [自动部署工作流](/I:/Sora/CloudConfig/.github/workflows/deploy.yml)

---

## 1. 工作流职责

### CI

文件：

- [ci.yml](/I:/Sora/CloudConfig/.github/workflows/ci.yml)

触发条件：

- 任意 `pull_request`
- 推送到 `main`

执行内容：

- 安装依赖
- 执行 `pnpm typecheck`
- 执行 `pnpm test`

用途：

- 确保每次提交至少通过类型检查和测试
- 在合并前拦截明显问题

### 自动部署

文件：

- [deploy.yml](/I:/Sora/CloudConfig/.github/workflows/deploy.yml)

触发条件：

- 推送到 `main`
- 手动触发 `workflow_dispatch`

执行内容：

1. 安装依赖
2. 执行类型检查
3. 执行单元测试
4. 执行 D1 远程迁移
5. 部署 Worker

用途：

- 把 `main` 分支作为生产发布源
- 保证部署前至少经过基础校验

---

## 2. 需要配置的 GitHub Secrets

在 GitHub 仓库中进入：

`Settings -> Secrets and variables -> Actions`

添加以下两个 Secret：

### `CLOUDFLARE_API_TOKEN`

用途：

- 让 GitHub Actions 在非交互环境下调用 Cloudflare API
- 用于执行 D1 远程迁移和 Worker 部署

创建方式：

1. 打开 Cloudflare Dashboard
2. 进入 `My Profile -> API Tokens`
3. 点击 `Create Token`
4. 选择 `Edit Cloudflare Workers` 模板
5. 将权限范围尽量收敛到目标账号

Cloudflare 官方说明：

- [GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

### `CLOUDFLARE_ACCOUNT_ID`

用途：

- 让 Wrangler 知道要部署到哪个 Cloudflare 账号

获取方式：

- 在 Cloudflare Dashboard 中查看目标账号的 Account ID

---

## 3. 推荐的 GitHub 配置方式

建议启用以下仓库策略：

### 3.1 保护 `main` 分支

建议在 GitHub 中为 `main` 分支启用：

- 必须通过 `CI` 工作流
- 禁止直接推送
- 通过 Pull Request 合并

这样可以保证：

- 未通过测试的代码无法进入生产部署链路
- 自动部署只会发生在通过审核并合并后的代码上

### 3.2 使用 `production` Environment

当前 [deploy.yml](/I:/Sora/CloudConfig/.github/workflows/deploy.yml) 中使用了：

```yaml
environment: production
```

因此建议在 GitHub 中创建 `production` Environment，并配置：

- 审批人
- 环境级 Secret
- 访问限制

这样可以让部署控制更严格。

---

## 4. 自动部署链路说明

当前部署工作流的实际顺序如下：

### 第一步：代码检出

使用：

```yaml
uses: actions/checkout@v4
```

### 第二步：安装 pnpm 与 Node.js

使用：

- `pnpm/action-setup@v4`
- `actions/setup-node@v4`

Node 版本固定为 `22`，与当前仓库要求一致。

### 第三步：安装依赖

执行：

```bash
pnpm install --frozen-lockfile
```

这样可以保证 CI 与开发环境使用同一份锁文件依赖版本。

### 第四步：类型检查与测试

执行：

```bash
pnpm typecheck
pnpm test
```

### 第五步：执行 D1 远程迁移

执行：

```bash
pnpm d1:migrate:remote
```

这一步会调用 `wrangler d1 migrations apply DB --remote`，把 `migrations/` 目录中的未应用迁移同步到远程 D1。

Cloudflare 官方说明：

- [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)

### 第六步：部署 Worker

执行：

```bash
pnpm deploy:worker
```

这一步本质上是运行：

```bash
wrangler deploy
```

Cloudflare 官方关于 GitHub Actions 部署 Workers 的说明：

- [GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

---

## 5. 首次启用自动部署的操作步骤

### 5.1 确保本地已验证部署

在开启 GitHub 自动部署前，建议先本地完成：

- `pnpm install`
- `pnpm typecheck`
- `pnpm test`
- `pnpm d1:migrate:local`
- `pnpm dev`

并确保：

- `wrangler.jsonc` 中的 `database_id` 已写成真实远程 D1 ID
- `client_apps` 表已有至少一条可用客户端记录

### 5.2 提交工作流文件

确保以下文件已经提交到仓库：

- [ci.yml](/I:/Sora/CloudConfig/.github/workflows/ci.yml)
- [deploy.yml](/I:/Sora/CloudConfig/.github/workflows/deploy.yml)

### 5.3 在 GitHub 添加 Secrets

添加：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### 5.4 推送到 `main`

当代码推送到 `main` 后：

1. `CI` 会自动运行
2. `Deploy To Cloudflare` 会自动运行
3. 工作流会先迁移 D1，再部署 Worker

---

## 6. 推荐的日常协作流程

建议使用以下流程：

1. 从 `main` 切分支开发
2. 提交 Pull Request
3. 等待 `CI` 通过
4. 审核后合并到 `main`
5. 由 `deploy.yml` 自动部署到 Cloudflare

这样做的好处：

- 测试和部署链路稳定
- 发布入口单一
- 可追踪每次线上变更来源

---

## 7. 如果你想区分测试环境和生产环境

当前仓库只配置了一个生产部署工作流。

如果后续需要 `staging + production` 两套环境，推荐做法是：

- `develop` 分支自动部署到 `staging`
- `main` 分支自动部署到 `production`
- 使用不同的 Worker 名称
- 使用不同的 D1 数据库
- 使用 GitHub 不同 Environment 与不同 Secret

当前版本暂未实现这一层拆分。

---

## 8. 常见问题

### 8.1 GitHub Actions 提示 Cloudflare 鉴权失败

重点检查：

- `CLOUDFLARE_API_TOKEN` 是否已配置
- `CLOUDFLARE_ACCOUNT_ID` 是否已配置
- Token 是否具备 Workers 与 D1 相关权限

### 8.2 部署阶段失败在 D1 迁移

重点检查：

- [wrangler.jsonc](/I:/Sora/CloudConfig/wrangler.jsonc) 中 `database_id` 是否为真实值
- 远程 D1 是否存在
- 当前 Cloudflare 账号是否有访问该 D1 的权限

### 8.3 `main` 推送后没有自动部署

重点检查：

- 是否真的推送到了 `main`
- GitHub Actions 是否启用
- 分支保护规则是否阻止了合并
- `deploy.yml` 是否被禁用

### 8.4 想手动重新部署

可以在 GitHub 仓库中打开：

`Actions -> Deploy To Cloudflare -> Run workflow`

因为当前工作流支持：

```yaml
workflow_dispatch:
```

---

## 9. 当前 CI/CD 设计结论

当前仓库已经采用以下规则：

- PR 和主分支提交都会跑基础校验
- 只有 `main` 会触发自动发布
- 发布前一定先做类型检查和测试
- 发布时会自动应用 D1 迁移
- 部署凭证全部保存在 GitHub Secrets 中，不写入仓库
