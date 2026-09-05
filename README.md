# Trade Lab UI

Nuxt 4 + Vue 3 + TypeScript 前端工程。当前为可运行的架构骨架：页面可访问，公共基础设施已实现，登录、研究创建和回测等业务界面使用明确占位。

## 启动

Node 22 LTS、pnpm 10。原型 `prototype/` 是独立工程，不参与当前应用构建。

```bash
pnpm install
pnpm dev
```

访问 **http://127.0.0.1:6002**。无须启动后端、创建账户或配置代理。

| 地址                     | 页面                                       |
| ------------------------ | ------------------------------------------ |
| `/`                      | SSR 产品落地页与研究输入                   |
| `/new-task`              | 客户端工作台新研究页                       |
| `/conversations/preview` | 对话、Strategy、Replay 与 Runner 占位预览  |
| `/conversations/:id`     | 研究详情路由骨架；当前不读取 ID 对应的数据 |
| `/login`                 | 登录占位页                                 |

工作台左下角打开个人信息与偏好弹窗；移动端通过右上角设置按钮打开。语言设置和侧栏折叠可保存。输入草稿只保存到当前标签页；发送按钮只提示业务尚未接入，不创建模拟资产。登录控件在占位阶段禁用。

## 环境与联调

复制 `.env.example` 为 `.env` 后按需调整。默认无需 `.env` 即可启动。

| 变量                            | 用途                                                                        |
| ------------------------------- | --------------------------------------------------------------------------- |
| `NUXT_PUBLIC_API_ENABLED`       | 默认 `false`。`true` 开启真实认证恢复及工作台访问守卫，不代表业务页面已接入 |
| `NUXT_PUBLIC_API_BASE`          | 本地默认 `http://127.0.0.1:6001/api`，生产默认 `/api`                       |
| `NUXT_API_BASE`                 | 服务端公开数据请求的绝对 API 地址                                           |
| `NUXT_PUBLIC_SITE_URL`          | canonical 等公开地址，生产配置实际站点域名                                  |
| `NUXT_PUBLIC_ENABLE_DARK_THEME` | 默认 `false`；设为 `true` 可验证 dark/system 工程主题，非已定稿深色设计     |

本地使用 `127.0.0.1`，不与 localhost 混用。后端需允许 `http://127.0.0.1:6002` 的 CORS 凭据请求、业务方法及 Authorization / Idempotency-Key / X-Request-ID 等 Header，并暴露 Content-Disposition 供下载使用。开发 Cookie 关闭 Secure；生产 HTTPS Cookie 开启 Secure。前端不提供 API 代理或 BFF。

真实认证恢复失败会显示恢复失败状态，不会生成假用户。开启联调模式前需已有有效后端 Refresh Cookie；Google/邮箱登录页面尚未接入。

## 目录职责

- `app/pages` / `layouts`：路由、SEO、public/workspace/auth 布局。
- `app/features`：功能模块，组件、API 类型和交互逻辑就近维护，公开入口显式导入。
- `app/lib/http`：唯一 JSON 请求底座、API 错误、地址校验、内存认证会话。
- `app/lib/sse` / `download`：共享 HTTP 认证的流传输和文件处理。
- `app/stores`：全局偏好与弹窗；认证 store 位于 auth 模块，只保存用户和状态。
- `app/components`：基础按钮、异步状态、Markdown、分栏等公共组件。
- `app/lib/chart`：SDK 接口与有界缓存。未选用/加载真实图表引擎。
- `i18n`：中英文静态消息，共享 SSR 与客户端配置；当前体量小，直接打包以避免首屏异步语言加载。
- `shared`：通用协议类型，不依赖 Vue。
- `tests`：HTTP、会话、SSE、下载、精度、安全边界以及浏览器路径测试。

## 统一请求的用法

组件不写 URL 或 fetch。API 函数接收统一客户端，在模块 composable 内使用：

```ts
// features/example/api.ts
import type { HttpClient } from '~/lib/http/client'

export const createExampleApi = (http: HttpClient) => ({
  read: (signal?: AbortSignal) => http.requestJson<Example>('/example', { signal }),
})
```

以上 `/example` 仅说明模式，不是现有业务端点。页面首屏数据由模块 composable 使用 `useAsyncData` 包装 API，key 带用户、资源、分页及语言；私有 key 使用 `private:` 前缀，退出时统一清理。业务请求默认需要认证，公开请求显式 `auth: false`。

有副作用且要求幂等的 API 使用 `http.operation<T>(path, options)`。**保留同一操作句柄**，重试调用其 `execute()`，不要每次重新创建句柄；请求体和幂等 key 保持不变。超出 24 小时拒绝重发，交业务层核实状态。普通写请求不自动网络重试。

登录业务接入后，将后端 AuthResponse 交给 `$acceptAuth(result)`，不要自行存储 Token。`$restoreAuth()` 用于恢复，`$logout()` 先请求服务端撤销会话，成功后清理内存；请求客户端负责过期重试。实例由 Nuxt plugin 创建，不在 Node 进程级共享用户状态。

SSE 使用 `openEventStream(http, streamUrl, { signal, onEvent, isTerminal })`。帧解析只处理协议，业务模块负责 Snapshot、offset 与卡片归并；断线重连不重新发消息，EOF 不等于业务完成。使用作用域 AbortSignal 取消旧订阅。文件下载使用 `requestDownload`，再由浏览器 `saveDownload` 保存，代理与文件打包不在本工程实现。

## 主题

`tokens.css` 管尺寸/排版，`themes/light.css`、`dark.css` 使用相同的语义键。`useTheme` 是模式入口，Cookie 保存偏好，首屏脚本在渲染前解析系统模式；Nuxt UI、自定义 CSS 使用相同变量。深色目前为工程验证配色，默认不显示选择入口。

如未来接入 CSP，需要为当前的同源 `theme-init.js` 配置允许策略。图表接入时实现 `ChartAdapter.applyTheme`，不要在页面直接依赖 SDK。

## 检查与构建

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm preview
```

`pnpm check` 顺序执行 lint、类型检查、单测和构建。端到端测试自动启动 6002 开发服务，已有服务则复用。生产构建与开发服务不要同时写同一份 `.nuxt` 目录；构建后重启开发服务。

部署 `.output` 的 Nuxt 服务端产物，生产可使用：

```bash
HOST=127.0.0.1 PORT=6002 node .output/server/index.mjs
```

`/new-task`、`/conversations/**` 为 CSR + noindex + no-store，`/` 保留 SSR。后续公开页面放在 `app/pages`，声明 `layout: 'public'` 并调用 `usePageSeo`。sitemap、公开文章及营销内容扩展在后续阶段完成。

## 当前边界

已实现可独立测试的 HTTP / 会话协调、幂等、取消、SSE parser 与重连、下载、Decimal 格式化、Markdown 清洗、偏好、全局弹层、响应式页面壳和 SEO 基础。

尚未实现业务：邮箱/Google 登录交互、研究创建与历史数据、Agent 事件归并、策略/Replay 真实内容、图表 SDK 和支付。对应界面均为占位，API 工厂仅提供已经核对的少量契约，不臆造全量后端类型。

架构依据：[前端整体架构方案](docs/Trade%20Lab%20前端整体架构方案.md)。
