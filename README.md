# Siiway Workbench (TypeScript)

一个基于 TypeScript 的网页工作台骨架：
- 前端：React + Vite + Zustand
- 鉴权：`Prism` 的 OAuth 2.0 / OpenID Connect（通过 BFF 托管登录会话）
- 数据：`Glint` 的 team-scoped Todo API（通过 BFF 代理）

## 一期目标

- 打通登录 -> 进入工作台 -> 拉取待办链路
- 提供最小可运行前端壳层与状态管理
- 提供可执行测试，便于后续联调和扩展

## 项目结构

```
src/
  auth/              前端鉴权适配（mock 或 BFF 会话）
  todo/              前端 todo 适配（走 BFF）
  mocks/             本地 mock 数据源
  features/          业务 UI 组件
  state/             全局状态管理（zustand）
  core/              类型定义与 HTTP 工具
  test/              测试初始化
bff/
  server.ts          BFF 服务入口
  oidc.ts            兼容性的 OIDC 发现/授权/回调验证（保留）
  sessionStore.ts    服务端会话存储
  mockGlint.ts       BFF mock 的 Todo 数据
```

## 环境变量

### 前端 `.env`

复制 `.env.example` 为 `.env`：

```
VITE_USE_MOCK=true
VITE_API_BASE_URL=/api
VITE_PRISM_CONFIG_PATH=/auth/config
VITE_PRISM_CALLBACK_PATH=/auth/callback
VITE_PRISM_LOGOUT_PATH=/auth/logout
VITE_PRISM_SESSION_PATH=/auth/me
VITE_GLINT_TODOS_PATH=/workbench/todos
```

### BFF `.env.bff`

复制 `.env.bff.example` 为 `.env.bff`：

```
BFF_PORT=3001
BFF_USE_MOCK=true
WORKBENCH_REWRITE_ENABLED=true
FRONTEND_ORIGIN=http://localhost:5173
SESSION_COOKIE_NAME=wb_sid

PRISM_ISSUER_URL=https://prism.example.com
PRISM_CLIENT_ID=workbench-web
PRISM_CLIENT_SECRET=
PRISM_REDIRECT_URI=http://localhost:5173/
PRISM_SCOPES=openid profile email teams:read

GLINT_BASE_URL=https://glint.example.com
```

## 重写方案文档（基于 Prism/Glint 源码）

- `docs/rewrite/01-contracts.md`
- `docs/rewrite/02-architecture.md`
- `docs/rewrite/03-roadmap.md`
- `docs/rewrite/04-issues.md`

## 快速开始

```bash
npm install
npm run bff:dev
npm run dev
```

> 本地开发默认 `VITE_USE_MOCK=true` + `BFF_USE_MOCK=true`，不依赖外部服务即可跑通。

## 接入真实 Prism + Glint

1. 将 `VITE_USE_MOCK=false`，前端先请求 `/api/auth/config` 获取 Prism 配置。
2. 前端按 PKCE 跳转 Prism，回调后把 `code + codeVerifier` 提交到 `/api/auth/callback`。
3. BFF 使用 `@siiway/prism` 的 `PrismClient` 完成 `exchangeCode`、`getUserInfo`、`teams.oauthList`，并写入会话 Cookie。
4. BFF 提供 `/api/workbench/context`（读/切换 team+set），并代理 Glint 的 `GET /api/teams/:teamId/sets/:setId/todos`、`POST /api/teams/:teamId/sets/:setId/todos`、`PATCH /api/teams/:teamId/todos/:id`。
5. 前端通过 `/api/auth/me` 获取登录态与当前团队/set，再通过 `/api/workbench/todos` 展示工作台。

## 常用命令

```bash
npm run bff:check
npm run dev
npm run test
npm run build
npm run preview
```

