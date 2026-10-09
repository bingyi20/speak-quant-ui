# SpeakQuant UI

Nuxt 4 + Vue 3 + TypeScript 前端工程。已接入邮箱 / Google 登录、研究历史和 Agent 对话主流程；策略与回测详情工作区已接入；回测执行/重试/取消等写操作仍待实现。

产品名称统一为 **SpeakQuant**。仓库目录、既有文档路径和浏览器偏好／草稿的 `trade-*` 存储标识继续沿用，保留已有链接、偏好和未提交输入。

## 启动

Node 22 LTS、pnpm 10。原型 `prototype/` 是独立工程，不参与当前应用构建。

```bash
pnpm install
pnpm dev
```

访问 **http://localhost:6002**。真实登录需启动 6001 后端；设置 `NUXT_PUBLIC_API_ENABLED=false` 可离线预览，不需要配置代理。

| 地址                                         | 页面                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`、`/zh-CN`                                | SSR 英文／中文产品落地页与研究输入                                                                                                                                              |
| `/pricing`、`/privacy`、`/terms`、`/contact` | SSR 价格及协议／联系页；中文对应 `/zh-CN/...`，双语政策已按用户提供信息重写，生产发布与提审核对见专项文档；取消退款已合入价格页，`/refunds` 跳转到对应语言的 `/pricing#billing` |
| `/new-task`                                  | 客户端工作台新研究页                                                                                                                                                            |
| `/conversations/:id`                         | 真实消息、Agent 流式回复、快捷问答与资产面板                                                                                                                                    |
| `/login`                                     | 邮箱验证码 / Google 登录                                                                                                                                                        |

工作台左下角打开个人信息与偏好弹窗；移动端展开侧栏后打开。侧栏账户行右侧“升级”默认打开月度套餐页，其余账户行区域打开设置；账户设置中的“升级套餐”打开全屏套餐页签，积分加购通过弹窗内页签切换。语言设置和侧栏折叠可保存。输入草稿按用户与会话保存在当前标签页；发送会创建真实对话，访客先登录后继续。登录页通过统一 HTTP 客户端连接真实接口。

工作台侧栏收起后只保留顶部展开入口；悬停时浮层预览，点击后固定展开并重新排布正文。对话页顶部保留标题，仅在侧栏收起时显示新研究快捷入口（从真实历史记录或详情接口读取）。快捷例子点击后填入并聚焦输入框，侧栏底部使用已恢复的用户头像、昵称（缺失时邮箱）和 Free 套餐占位；头像缺失或加载失败时使用 `public/avatar-default.svg`。

研究历史已接入真实 API：`api.ts` 统一封装列表、详情、收藏/重命名与永久删除，`history-state.ts` 管理分页、取消、重试和写入状态，`history-store.ts` 负责登录用户生命周期。收藏请求 `scope=favorite`，历史请求 `scope=non_favorite`，两个分组独立分页；按服务端 `updated_at` 排序和 ID 去重，支持加载更多，不再请求全部记录后过滤或补充分页。写入成功后重新校验已加载分页，防止偏移分页因排序变化漏项。退出登录或切换账号会取消请求、清空数据，迟到响应不能写回。

重命名由 `HistoryRenameInput.vue` 原位编辑并全选文本；Enter 或失焦保存，Esc 取消，空名称保留原标题，输入法组合过程中不提交。保存失败保留输入，可再次提交。删除仅在确认后请求，携带 `X-Confirm-Delete: permanent` 和稳定幂等键，失败不会移除记录或跳转。离线模式显示提示，不再注入示例历史。Mock 仅位于 `tests/e2e/history-data.ts` 和 HTTP 测试拦截层。联调结果和契约差异见 [研究历史接口联调记录](docs/研究历史接口联调记录.md)。

侧栏可点击条目统一使用 `sidebar-item`，Hover、键盘聚焦和 `.is-selected` 选中态共用 `--color-bg-sidebar-interactive` 背景色。新研究及后续聊天历史链接使用 `class="sidebar-item" exact-active-class="is-selected"`，由 NuxtLink 按当前页面路由保持选中背景；头像入口仅使用交互反馈，不保留选中背景。

## 环境与联调

复制 `.env.example` 为 `.env` 后按需调整。默认无需 `.env` 即可启动。

| 变量                                                      | 用途                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NUXT_PUBLIC_API_ENABLED`                                 | 默认 `true`，开启真实登录、认证恢复及工作台访问守卫；`false` 为离线预览                                                              |
| `NUXT_PUBLIC_API_BASE`                                    | 本地默认 `http://localhost:6001/api`，生产默认 `/api`                                                                                |
| `NUXT_API_BASE`                                           | 服务端公开数据请求的绝对 API 地址                                                                                                    |
| `NUXT_PUBLIC_SITE_URL`                                    | canonical 等公开地址，默认 https://speakquant.com，生产不可配置 localhost                                                            |
| `NUXT_PUBLIC_OPERATOR_NAME` / `NUXT_PUBLIC_SUPPORT_EMAIL` | 公开运营公司与支持邮箱，默认 `Nanhao Labs Inc`、`support@speakquant.com`，可按部署覆盖；信息缺失时显示草案，发布时清理旧邮箱环境覆盖，详见公开站点方案 |
| `NUXT_PUBLIC_OPERATOR_REGISTRATION_NUMBER` / `NUXT_PUBLIC_OPERATOR_REGISTERED_ADDRESS` | 公司注册号与注册地址，默认采用公司秘书卡信息；用于政策和联系页，不代表实际办公地址 |
| `NUXT_PUBLIC_ENABLE_RUNNER_DOWNLOAD`                      | 默认 false，首发隐藏运行包下载入口；不改变后端接口权限                                                                               |
| `NUXT_PUBLIC_ENABLE_DARK_THEME`                           | 默认 `false`；设为 `true` 可验证 dark/system 工程主题，非已定稿深色设计                                                              |

本地统一使用 `localhost`，不要与 `127.0.0.1` 混用（Google 开发 OAuth 仅允许 localhost）。后端需允许 `http://localhost:6002` 的 CORS 凭据请求、业务方法及 Authorization / Idempotency-Key / X-Request-ID 等 Header，并暴露 Content-Disposition 供下载使用。开发 Cookie 关闭 Secure；生产 HTTPS Cookie 开启 Secure。前端不提供 API 代理或 BFF。

`/login` 提供邮箱输入 → 六位验证码，以及 Google 官方 GIS 按钮。验证码支持粘贴、自动提交、重发倒计时和错误重试；Google 第三方邮箱补验仍提交 `/auth/google`。成功后返回安全的 `returnTo` 路径（默认 `/new-task`），并携带当前访客研究草稿。已有会话访问登录页会直接返回工作台。

Google 从 `/auth/google/config` 获取 client ID 和 nonce。官方脚本加载失败时可重试或使用邮箱；没有 Apple 登录。普通邮箱登录和 Google credential 均不经过 Pinia 或浏览器持久存储，登录响应交给 `$acceptAuth()`。刷新时通过 HttpOnly Refresh Cookie 恢复，站内导航复用内存 Token。退出成功后清理会话并调用 GIS `disableAutoSelect()`。

登录页始终通过新标签页打开对应语言的条款、隐私页面，保留登录状态；入口及验证码步骤均提供同意服务条款、已阅读隐私政策的告知；尚未同步后端协议版本及同意记录，发布前需核对实际版本和可追溯接受流程。可选 `NUXT_PUBLIC_TERMS_URL`、`NUXT_PUBLIC_PRIVACY_URL` 用于正式外链覆盖。Google SDK 集成依据：[官方 JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference)。

## 目录职责

- `app/pages` / `layouts`：路由、SEO、public/workspace/auth 布局。
- `app/features`：功能模块，组件、API 类型和交互逻辑就近维护，公开入口显式导入。
- `app/lib/http`：唯一 JSON 请求底座、API 错误、地址校验、内存认证会话。
- `app/lib/sse` / `download`：共享 HTTP 认证的流传输和文件处理。
- `app/stores`：全局偏好与弹窗；认证 store 位于 auth 模块，只保存用户和状态。
- `app/components`：基础按钮、异步状态、Markdown、分栏等公共组件。
- `app/lib/chart`：Lightweight Charts 5.2.0 客户端适配器、有界行情视野与原始页缓存。
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

页面图标统一使用 `public/logo.svg`，直接替换该文件即可更新各处 Logo。`BrandMark.vue` 只负责图标与 SpeakQuant 文字的组合，不再内嵌 SVG 路径。

当前图标是单色 SVG，通过 CSS mask 使用主题品牌色；保持透明背景，文件中只放图形。若未来换成多色 Logo，再将组件改为图片引用。浏览器标签图标独立保存在 `public/favicon.svg`，更换品牌时可同步替换。

## 主题

`tokens.css` 管尺寸/排版，`themes/light.css`、`dark.css` 使用相同的语义键。`useTheme` 是模式入口，Cookie 保存偏好，首屏脚本在渲染前解析系统模式；Nuxt UI、自定义 CSS 使用相同变量。深色目前为工程验证配色，默认不显示选择入口。

如未来接入 CSP，需要为当前的同源 `theme-init.js` 配置允许策略。图表已通过 `ChartAdapter.applyTheme` 同步主题，不要在页面直接依赖 SDK。

## 快速预览 Agent 问答

运行 `pnpm preview:questions`，会打开独立的 Chromium 窗口，自动进入五题问答，无需登录或触发真实 Agent。直接测试选择、切题、自定义回答、关闭重开和提交；顶部明确标注“模拟数据”，点击“重新开始”可重置。窗口可调整大小检查响应式效果，关闭窗口或在终端按 Ctrl+C 结束。

预览复用 `tests/e2e` 的接口夹具，所有业务 API 均在该浏览器上下文中拦截，未模拟的接口返回预览错误，不向真实后端发送业务请求。Mock 与预览工具只存在于 `tests/preview/`，不增加生产路由；复制预览 URL 到普通浏览器不会携带 Mock。开发服务未启动时会自动启动，已启动时复用。首次缺少浏览器时运行 `pnpm exec playwright install chromium`。

`QUESTIONS_PREVIEW_CHECK=1 pnpm preview:questions` 以无界面模式检查进入和重置后退出；日常 `pnpm test:e2e` 不会启动交互预览。

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

`pnpm check` 顺序执行 lint、类型检查、单测和构建，不包含端到端测试。端到端测试自动启动 6002 开发服务，已有服务则复用。生产构建与开发服务不要同时写同一份 `.nuxt` 目录；构建后重启开发服务。

代码格式使用 `pnpm format`；局部修改只格式化涉及文件，不批量重排 `docs/` 参考资料或独立原型。

接口联调同时核对请求/响应、UI 更新、失败恢复与刷新持久化。使用专用测试账户和临时数据，验证后清理，不修改现有用户研究来制造场景；不记录 Token、验证码或敏感正文。测试 Mock 仅用于隔离验证，不能代替真实后端联调，结果分别写入对应联调记录。

部署 `.output` 的 Nuxt 服务端产物，生产可使用：

```bash
HOST=127.0.0.1 PORT=6002 node .output/server/index.mjs
```

`/new-task`、`/conversations/**` 为 CSR + noindex + no-store，`/` 保留 SSR。后续公开页面放在 `app/pages`，声明 `layout: 'public'` 并调用 `usePageSeo`。已提供 `/sitemap.xml`、`/robots.txt`、双语 canonical/hreflang 和分享图；协议与联系页公开可访问，保持不索引。详见[公开站点技术方案](docs/公开站点技术方案.md)。

## 当前边界

已实现可独立测试的 HTTP / 会话协调、幂等、取消、SSE parser 与重连、下载、Decimal 格式化、Markdown 清洗、偏好、全局弹层、响应式页面壳和 SEO 基础。

已实现 Agent 对话：新建研究、访客发送衔接登录、纯文本消息、Markdown 流式回复、工具状态、批量澄清、历史分页和断流恢复。用户消息先正常显示，仅失败时提示；AI 回复结束前输入仍可编辑，但不能发送，没有暂停按钮。Markdown 复用 `marked` 与 `sanitize-html`，不自写解析器。

Strategy / Replay 卡片可展开侧边面板。Strategy 的 Header 切换当前/历史版本，以变更摘要识别节点，同步更新 Design、只读代码和回测记录；回测默认展示所选版本，可手动查看全部并标记所选版本。Design 共用 Agent Markdown 排版，代码支持高亮与复制；策略和 Replay 支持覆盖整个页面的全屏查看。回测详情提供全宽 K 线、播放与事件定位、洞察/交易/成交明细、报告、冻结策略往返、上下文追问；运行包下载原实现保留，首发默认隐藏入口。返回策略保留版本、列表范围、滚动与焦点。多周期按服务端能力清单启用。前端回测执行/重试/取消、策略恢复、Runner 运行控制、支付及会员/积分数据仍待接入。实现契约见[策略详情模块技术方案](docs/策略详情模块技术方案.md)与[回测详情模块技术方案](docs/回测详情模块技术方案.md)，回测验证见[回测详情联调记录](docs/回测详情联调记录.md)。真实联调与测试范围见 [Agent 对话接口联调记录](docs/Agent%20对话接口联调记录.md)。

公开 SEO 页面可以直接嵌入下面的组件，统一处理草稿、登录、创建与跳转，页面继续使用 SSR：

```vue
<script setup lang="ts">
import { ResearchEntry } from '~/features/conversation'
</script>

<template>
  <ResearchEntry
    :show-examples="false"
    placeholder="描述你的研究想法…"
  />
</template>
```

架构依据：[前端整体架构方案](docs/Trade%20Lab%20前端整体架构方案.md)。

订阅 UI 已实现 Free / Pro / Max、积分加购与支付待上线提示，数据暂为静态目录；支付入口显示尚未开放，不创建订单或改变会员／余额。独立 `/pricing` 与 `/zh-CN/pricing` 和工作台弹窗完整复用 `features/billing` 的 `PricingContent`；已登录时显示相同的 Free 当前套餐预览，访客显示禁用的免费套餐及 Free 加购费率示例，不提供研究跳转。付费套餐与有效加购统一显示支付待上线提示。价格规则、组件契约及测试边界见[订阅与积分模块技术方案](docs/订阅与积分模块技术方案.md)。

## 登录联调验证

- 2026-09-05：本地真实后端完成邮箱发码、校验登录、刷新恢复与退出；均成功返回。未保存验证码或 Token 到工程文件。
- Google：真实配置与 nonce 接口、官方 GIS 按钮加载已验证；账号授权后的真实 Google 登录仍需用户本人完成。自动化测试模拟 SDK credential，覆盖直接登录、nonce 失效重启和第三方邮箱补验。
- Playwright 在独立上下文拦截认证 API / Google SDK，不发送测试邮件；覆盖桌面与移动端的验证码、取消、重发、错误、跳转、会话恢复及工作台页面。
