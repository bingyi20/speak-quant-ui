# SpeakQuant UI

Nuxt 4 + Vue 3 + TypeScript 前端工程。已接入邮箱及 Google GIS 登录、研究历史和 Agent 对话主流程；策略与回测详情工作区已接入；回测执行/重试/取消等写操作仍待实现。

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
| `/login`                                     | Google 官方 GIS 按钮与邮箱验证码登录                                                                                                                                                        |

工作台左下角打开个人信息与偏好弹窗；移动端展开侧栏后打开。设置导航只保留“常规 / General”和消耗记录；退出登录使用头像与账户信息同一行右侧的图标按钮，悬停或键盘聚焦显示文字提示。账户卡片展示真实订阅、右上角紧凑的金色“升级 / Upgrade”按钮和下方“积分 / Credits”，权益加载前显示 `—`，不展示每日赠送、每日刷新或重置说明。消耗记录按需加载分页流水，简洁展示活动、时间及正负积分变动，增加积分以金黄色突出，不提供详情入口。“语言 / Language”采用上方标题、下方浅底下拉；其后的“主题 / Theme”采用浅色、深色、自动（Light / Dark / Auto）三个带图标的选项卡。默认只可选择浅色，其余选项禁用；开启工程主题开关后可选。侧栏账户行右侧“升级”默认打开月度套餐页，其余账户行区域打开设置；账户卡片“升级”打开同一全屏套餐页签，关闭后恢复该入口焦点，积分加购通过弹窗内页签切换。语言设置和侧栏折叠可保存。输入草稿按用户与会话保存在当前标签页；发送会创建真实对话，访客先登录后继续。登录页通过统一 HTTP 客户端连接真实接口。

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

`/login` 提供 Google 官方 GIS 按钮及邮箱输入 → 六位验证码。验证码支持粘贴、自动提交、重发倒计时和错误重试。成功后返回安全的 `returnTo` 路径（默认 `/new-task`），并携带当前访客研究草稿。已有会话访问登录页会直接返回工作台。

Google 登录等待初始会话恢复结束后再挂载 GIS，避免游客 Refresh 401 清理请求时取消首次 Google 配置请求。随后从 `/auth/google/config` 获取 client ID 和 nonce，通过 `https://accounts.google.com/gsi/client` 加载官方 SDK，使用 FedCM 按钮；callback credential 提交 `/auth/google`。首次使用非 Gmail / Google Workspace 邮箱时，按后端返回邮箱发送验证码，再将同一 credential 与验证码一起提交 Google 登录接口。nonce 失效后重载按钮并获取新 challenge；准备失败时显示重试，邮箱入口保持可用。此流程只登录身份，不请求 Gmail、Drive 等额外权限，没有 Apple 登录。普通邮箱登录和 Google credential 均不经过 Pinia 或浏览器持久存储，登录响应交给 `$acceptAuth()`。刷新时通过 HttpOnly Refresh Cookie 恢复，站内导航复用内存 Token。工作台主动退出在服务端撤销成功后清理会话、返回当前语言落地页，并在已加载 GIS 时调用 `disableAutoSelect()`；撤销失败时不主动清理会话，可再次尝试，会话失效仍进入登录恢复流程。

Google Cloud 使用 Web application 客户端，在 Authorized JavaScript origins 中加入实际前端来源，正式站点为 `https://speakquant.com`；后端配置匹配的 `GOOGLE_CLIENT_ID` 与 `CORS_ORIGINS`。当前使用浏览器 callback，不需要为此流程新增 redirect URI 或 Client Secret。Google Auth Platform 的 Audience 发布状态、Branding 信息及可能的验证由控制台管理，前端没有 Testing / Production 开关。配置存在和模拟测试通过均不代表正式 Google 授权已验收。

登录页始终通过新标签页打开对应语言的条款、隐私页面，保留登录状态；入口及验证码步骤均提供同意服务条款、已阅读隐私政策的告知。后端在登录事务中按 `TERMS_VERSION`、`PRIVACY_VERSION` 保存用户的接受记录；当前默认版本均为 `2026-10-08`，发布时核对生产环境与公开政策日期一致。可选 `NUXT_PUBLIC_TERMS_URL`、`NUXT_PUBLIC_PRIVACY_URL` 用于正式外链覆盖。Google SDK 集成依据：[官方 JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference)。

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

页面 Logo 与浏览器标签页图标统一使用独立文件 `public/logo.svg`：实心四角星嵌入左上开口的等厚正圆环，表达从 idea 到研究验证、迭代的闭环。`BrandMark.vue` 只负责图标与 SpeakQuant 文字的组合，不内嵌 SVG 路径。

当前图标是透明底、单色 SVG，页面通过 CSS mask 使用主题品牌色，标签页由 `nuxt.config.ts` 的 `rel="icon"` 引用同一文件，不再独立维护 favicon 图案。两处 URL 共用 `?v=idea-loop` 版本标识，后续替换资源时同步更新以刷新浏览器缓存；若未来换成多色 Logo，再将组件改为图片引用。

## 主题

`tokens.css` 管尺寸/排版，`themes/light.css`、`dark.css` 使用相同的语义键。`useTheme` 是模式入口，Cookie 保存偏好，首屏脚本在渲染前解析系统模式；Nuxt UI、自定义 CSS 使用相同变量。设置页显示 Light / Dark / Auto 三个选项，默认仅 Light 可选；`NUXT_PUBLIC_ENABLE_DARK_THEME=true` 时允许选择 Dark / Auto。深色目前为工程验证配色，不代表已定稿设计。

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

本地验证构建产物时使用 `NUXT_PUBLIC_API_BASE=http://localhost:6001/api HOST=127.0.0.1 PORT=6002 node .output/server/index.mjs`，使浏览器仍直连本地 API；生产默认 `/api`，由现有部署路由处理。

`/new-task`、`/conversations/**`、`/billing/payment-return` 为 CSR + noindex + no-store，`/` 保留 SSR。后续公开页面放在 `app/pages`，声明 `layout: 'public'` 并调用 `usePageSeo`。已提供 `/sitemap.xml`、`/robots.txt`、双语 canonical/hreflang 和分享图；协议与联系页公开可访问，保持不索引。详见[公开站点技术方案](docs/公开站点技术方案.md)。

生产环境的 systemd、Nginx、发布与排障流程见[生产部署](docs/生产部署.md)。

## 当前边界

已实现可独立测试的 HTTP / 会话协调、幂等、取消、SSE parser 与重连、下载、Decimal 格式化、Markdown 清洗、偏好、全局弹层、响应式页面壳和 SEO 基础。

已实现 Agent 对话：新建研究、访客发送衔接登录、纯文本消息、Markdown 流式回复、工具状态、批量澄清、历史分页和断流恢复。用户消息先正常显示，仅失败时提示；AI 回复结束前输入仍可编辑，但不能发送，没有暂停按钮。Markdown 复用 `marked` 与 `sanitize-html`，不自写解析器。

Strategy / Replay 卡片可展开侧边面板。Strategy 的 Header 切换当前/历史版本，以变更摘要识别节点，同步更新 Design、只读代码和回测记录；回测默认展示所选版本，可手动查看全部并标记所选版本。Design 共用 Agent Markdown 排版，代码支持高亮与复制；策略和 Replay 支持覆盖整个页面的全屏查看。回测详情提供全宽 K 线、播放与事件定位、洞察/交易/成交明细、报告、冻结策略往返、上下文追问；运行包下载原实现保留，首发默认隐藏入口。返回策略保留版本、列表范围、滚动与焦点。多周期按服务端能力清单启用。前端回测执行/重试/取消、策略恢复、Runner 运行控制仍待接入；订阅支付及会员／积分数据已通过本地 Sandbox 验证，前端已发布生产，Live 付款尚未验证，发布范围见[生产部署](docs/生产部署.md#2026-10-30-升级确认与付款模式前端发布)。实现契约见[策略详情模块技术方案](docs/策略详情模块技术方案.md)与[回测详情模块技术方案](docs/回测详情模块技术方案.md)，回测验证见[回测详情联调记录](docs/回测详情联调记录.md)。真实联调与测试范围见 [Agent 对话接口联调记录](docs/Agent%20对话接口联调记录.md)。

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

订阅已接入后端 Basic／Pro／Max 套餐、真实账户与积分、加购报价、升级确认、Stripe 同页付款与成功后整页返回原地址。`/pricing`、`/zh-CN/pricing` 与工作台弹窗完整复用 `features/billing/PricingContent`。会话恢复后加载权益，付款回站、Run 结束与页面重新激活后刷新；未完成操作按用户保存原参数与幂等键，刷新后恢复查询。积分不足在输入框上方提示并直达套餐／加购，不自动重发。账户设置消耗记录已接入 `/credits/ledger` 分页，只展示活动、紧凑时间及实际积分增减，不将预占当消费。实现及真实／模拟验证边界见[订阅与积分模块技术方案](docs/订阅与积分模块技术方案.md)。

升级确认采用独立居中弹窗，直接读取报价内当前套餐快照、默认卡尾号及预计新计费周期。立即支付提交 `saved_method`，其它支付方式提交 `stripe_page`，需要付款时均在当前标签页跳转；Stripe 页面未付订单使用同单 `payment-page` 续开。未知结果保留原接口、参数、模式和幂等 Key；已支付订单不打开旧链接，只有 `paid + fulfilled` 才作为完成。真实／模拟联调范围见订阅专项文档。

本地／生产后端部署配置分别设置以下返回地址，创建付款时前端不传返回 URL：

```dotenv
BILLING_SUCCESS_URL=http://localhost:6002/billing/payment-return?order_id={order_id}
BILLING_CANCEL_URL=http://localhost:6002/pricing?payment_cancelled=true&order_id={order_id}
BILLING_PORTAL_RETURN_URL=http://localhost:6002/pricing
```

生产将来源替换为正式 HTTPS 域名；后端需独立运行 Stripe 回调与账务 Worker。前端只消费托管支付 URL，不配置 Stripe Secret Key。成功回站路由为 CSR、noindex、no-store，恢复认证并核实本人订单后整页加载原地址，订阅／设置弹窗默认关闭，不恢复页签或其他交互状态；Stripe 手动返回直接回价格页，套餐界面不常驻查单或展示订阅信息／刷新区。旧 Checkout 的返回地址已冻结，修改后端配置并重启仅影响新订单。

## 登录联调验证

- 2026-09-05：本地真实后端完成邮箱发码、校验登录、刷新恢复与退出；均成功返回。未保存验证码或 Token 到工程文件。
- Google：2026-10-12 恢复官方 GIS 按钮及已有登录流程，取代 2026-10-09 的灰色待上线占位。保留原登录布局、邮箱入口、条款与隐私链接。
- Playwright 在独立上下文拦截认证 API 与 GIS SDK，不发送测试邮件或执行真实 Google 授权。覆盖桌面与模拟手机的验证码、取消、重发、错误、跳转、会话恢复，以及 Google 登录、nonce 重载、第三方邮箱补验、退出清理和英文键盘操作；正式域名真实授权结果单独记录于下方。
- 2026-10-12 主动退出落地页：lint、typecheck、14 项 HTTP 单测及 30 项桌面／模拟手机 E2E 通过，覆盖邮箱／Google 登录后退出、对话页退出失败重试、中英文落地页、语言偏好保留、弹窗关闭和退出后私有页访问守卫。退出成功不经过登录页，刷新落地页保持游客状态。认证、历史和 GIS 使用测试拦截，未重新构建或部署。
- 2026-10-12：恢复 GIS 入口并修复 Refresh 401 取消首次配置请求的竞争后，lint、typecheck、115 项单测和生产构建通过；登录、公共页面及工作台回归共 59 项通过、1 项按平台跳过（小屏/横屏用例只在 mobile 执行，该版本通过）。延迟 Refresh 401 用例在修复前复现提前发出 Google 配置请求，修复后桌面与模拟手机均验证恢复结束后只获取一次配置，无需重试即可登录。认证与 GIS 使用 Mock，未由这组测试验证真实 Google 授权或生产部署。
- 2026-10-12 生产更新：后端 `7fa3ba6`、前端 `bd9ff01` 已部署，正式域名路由、健康检查、Google 配置及安全 nonce Cookie 检查通过。Chrome 真实 GIS/FedCM 登录、刷新恢复、退出后私有页返回登录页均成功；后端只读确认该账号的 Google 身份唯一且已验证、条款及隐私接受版本均为 `2026-10-08`，会话已通过 logout 撤销。Audience 已为 `In production`，域名所有权已验证，Google 品牌已验证并发布、正在向用户显示。公共用户支持邮箱及开发者联系邮箱均为 `support@speakquant.com`，配置管理使用 OAuth 专用权限 `roles/oauthconfig.editor`；首次 Cloud 确认与最终健康复验均已完成。后续更换 Logo 需重新验证并发布品牌。详见[生产部署验收](docs/生产部署.md#验收与排查)。
