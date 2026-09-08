# Trade Lab UI

Nuxt 4 + Vue 3 + TypeScript 前端工程。公共基础设施与邮箱 / Google 登录已实现；研究创建和回测等业务界面仍为明确占位。

## 启动

Node 22 LTS、pnpm 10。原型 `prototype/` 是独立工程，不参与当前应用构建。

```bash
pnpm install
pnpm dev
```

访问 **http://localhost:6002**。真实登录需启动 6001 后端；设置 `NUXT_PUBLIC_API_ENABLED=false` 可离线预览，不需要配置代理。

| 地址                     | 页面                                      |
| ------------------------ | ----------------------------------------- |
| `/`                      | SSR 产品落地页与研究输入                  |
| `/new-task`              | 客户端工作台新研究页                      |
| `/conversations/preview` | 对话、Strategy、Replay 与 Runner 占位预览 |
| `/conversations/:id`     | 读取真实记录标题；消息与资产内容仍为占位  |
| `/login`                 | 邮箱验证码 / Google 登录                  |

工作台左下角打开个人信息与偏好弹窗；移动端展开侧栏后打开。语言设置和侧栏折叠可保存。输入草稿只保存到当前标签页；发送按钮只提示业务尚未接入，不创建模拟资产。登录页通过统一 HTTP 客户端连接真实接口。

工作台侧栏收起后只保留顶部展开入口；悬停时浮层预览，点击后固定展开并重新排布正文。对话页顶部保留标题，仅在侧栏收起时显示新研究快捷入口（从真实历史记录或详情接口读取，消息与资产内容尚未接入）。快捷例子点击后填入并聚焦输入框，侧栏底部使用已恢复的用户头像、昵称（缺失时邮箱）和 Free 套餐占位；头像缺失或加载失败时使用 `public/avatar-default.svg`。

研究历史已接入真实 API：`api.ts` 统一封装列表、详情、收藏/重命名与永久删除，`history-state.ts` 管理分页、取消、重试和写入状态，`history-store.ts` 负责登录用户生命周期。收藏请求 `scope=favorite`，历史请求 `scope=non_favorite`，两个分组独立分页；按服务端 `updated_at` 排序和 ID 去重，支持加载更多，不再请求全部记录后过滤或补充分页。写入成功后重新校验已加载分页，防止偏移分页因排序变化漏项。退出登录或切换账号会取消请求、清空数据，迟到响应不能写回。

重命名由 `HistoryRenameInput.vue` 原位编辑并全选文本；Enter 或失焦保存，Esc 取消，空名称保留原标题，输入法组合过程中不提交。保存失败保留输入，可再次提交。删除仅在确认后请求，携带 `X-Confirm-Delete: permanent` 和稳定幂等键，失败不会移除记录或跳转。离线模式显示提示，不再注入示例历史。Mock 仅位于 `tests/e2e/history-data.ts` 和 HTTP 测试拦截层。联调结果和契约差异见 [研究历史接口联调记录](docs/研究历史接口联调记录.md)。

侧栏可点击条目统一使用 `sidebar-item`，Hover、键盘聚焦和 `.is-selected` 选中态共用 `--color-bg-sidebar-interactive` 背景色。新研究及后续聊天历史链接使用 `class="sidebar-item" exact-active-class="is-selected"`，由 NuxtLink 按当前页面路由保持选中背景；头像入口仅使用交互反馈，不保留选中背景。

## 环境与联调

复制 `.env.example` 为 `.env` 后按需调整。默认无需 `.env` 即可启动。

| 变量                            | 用途                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `NUXT_PUBLIC_API_ENABLED`       | 默认 `true`，开启真实登录、认证恢复及工作台访问守卫；`false` 为离线预览 |
| `NUXT_PUBLIC_API_BASE`          | 本地默认 `http://localhost:6001/api`，生产默认 `/api`                   |
| `NUXT_API_BASE`                 | 服务端公开数据请求的绝对 API 地址                                       |
| `NUXT_PUBLIC_SITE_URL`          | canonical 等公开地址，生产配置实际站点域名                              |
| `NUXT_PUBLIC_ENABLE_DARK_THEME` | 默认 `false`；设为 `true` 可验证 dark/system 工程主题，非已定稿深色设计 |

本地统一使用 `localhost`，不要与 `127.0.0.1` 混用（Google 开发 OAuth 仅允许 localhost）。后端需允许 `http://localhost:6002` 的 CORS 凭据请求、业务方法及 Authorization / Idempotency-Key / X-Request-ID 等 Header，并暴露 Content-Disposition 供下载使用。开发 Cookie 关闭 Secure；生产 HTTPS Cookie 开启 Secure。前端不提供 API 代理或 BFF。

`/login` 提供邮箱输入 → 六位验证码，以及 Google 官方 GIS 按钮。验证码支持粘贴、自动提交、重发倒计时和错误重试；Google 第三方邮箱补验仍提交 `/auth/google`。成功后返回安全的 `returnTo` 路径（默认 `/new-task`），并携带当前访客研究草稿。已有会话访问登录页会直接返回工作台。

Google 从 `/auth/google/config` 获取 client ID 和 nonce。官方脚本加载失败时可重试或使用邮箱；没有 Apple 登录。普通邮箱登录和 Google credential 均不经过 Pinia 或浏览器持久存储，登录响应交给 `$acceptAuth()`。刷新时通过 HttpOnly Refresh Cookie 恢复，站内导航复用内存 Token。退出成功后清理会话并调用 GIS `disableAutoSelect()`。

正式政策链接通过 `NUXT_PUBLIC_TERMS_URL`、`NUXT_PUBLIC_PRIVACY_URL` 配置，两项齐全时展示同意说明与可点击链接；当前未提供正式文案，不生成虚假条款页面。Google SDK 集成依据：[官方 JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference)。

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

登录完成时，将后端 AuthResponse 交给 `$acceptAuth(result)`，不要自行存储 Token。`$restoreAuth()` 用于恢复，`$logout()` 先请求服务端撤销会话，成功后清理内存；请求客户端负责过期重试。实例由 Nuxt plugin 创建，不在 Node 进程级共享用户状态。

SSE 使用 `openEventStream(http, streamUrl, { signal, onEvent, isTerminal })`。帧解析只处理协议，业务模块负责 Snapshot、offset 与卡片归并；断线重连不重新发消息，EOF 不等于业务完成。使用作用域 AbortSignal 取消旧订阅。文件下载使用 `requestDownload`，再由浏览器 `saveDownload` 保存，代理与文件打包不在本工程实现。

## 替换 Logo

页面图标统一使用 `public/logo.svg`，直接替换该文件即可更新各处 Logo。`BrandMark.vue` 只负责图标与 Trade Lab 文字的组合，不再内嵌 SVG 路径。

当前图标是单色 SVG，通过 CSS mask 使用主题品牌色；保持透明背景，文件中只放图形。若未来换成多色 Logo，再将组件改为图片引用。浏览器标签图标独立保存在 `public/favicon.svg`，更换品牌时可同步替换。

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

尚未实现业务：研究创建与历史消息、Agent 事件归并、策略/Replay 真实内容、图表 SDK 和支付。对应界面均为占位，API 工厂仅提供已经核对的少量契约，不臆造全量后端类型。

架构依据：[前端整体架构方案](docs/Trade%20Lab%20前端整体架构方案.md)。

## 登录联调验证

- 2026-09-05：本地真实后端完成邮箱发码、校验登录、刷新恢复与退出；均成功返回。未保存验证码或 Token 到工程文件。
- Google：真实配置与 nonce 接口、官方 GIS 按钮加载已验证；账号授权后的真实 Google 登录仍需用户本人完成。自动化测试模拟 SDK credential，覆盖直接登录、nonce 失效重启和第三方邮箱补验。
- Playwright 在独立上下文拦截认证 API / Google SDK，不发送测试邮件；覆盖桌面与移动端的验证码、取消、重发、错误、跳转、会话恢复和原有占位页面。
