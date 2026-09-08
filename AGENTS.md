# Trade Lab UI 项目入口

## 项目简介

Trade Lab 是面向量化策略研究的 AI Trade Agent，围绕 Conversation、Strategy、Replay 和 Runner 组织研究流程。本仓库负责前端界面、交互状态、公共页面 SSR 与 SEO；认证、Agent、回测和支付等核心业务由后端 API 承担。

技术栈为 Nuxt 4、Vue 3、TypeScript、Pinia、Nuxt UI 4、Tailwind CSS 4 和 Nuxt i18n。使用 Node 22（`>=22.13.0 <23`）与 pnpm 10，本地前端端口 `6002`，后端端口 `6001`，接口统一使用 `/api` 前缀。

## 当前实现状态

已实现：

- 公共落地页、登录页、响应式工作台壳、侧栏和全局账户设置弹窗。
- 邮箱验证码与 Google GIS 登录、Refresh Cookie 恢复、退出登录、路由守卫和访客草稿衔接。Google 使用官方按钮，没有 Apple 登录。
- 真实研究历史列表、收藏/取消收藏、原位重命名、永久删除、独立分页和当前对话标题读取；退出或切换用户清理私有数据。
- Agent 对话主流程：研究创建、访客发送后登录继续、普通消息、Markdown 流式回复、工具状态、批量澄清、消息分页与恢复、Strategy / Replay 卡片和真实资产概要。
- 统一 JSON HTTP、内存认证会话、幂等操作、取消与错误处理，以及 SSE 传输/重连、下载、Decimal 格式化和 Markdown 清洗基础设施。
- 中英文界面、偏好持久化、主题变量、图表适配接口与有界缓存、公共页面 SEO 基础。

仍为占位或待接入：

- Strategy、Replay、Runner 的真实内容、业务操作、图表引擎和播放控制。
- 套餐订阅、支付、积分余额与消耗记录。账户入口的 `Free` 是占位，不是后端订阅状态。
- 深色视觉设计、完整公开内容与 sitemap。深色主题只有工程基础，默认不开放。

不要把后端已有接口、测试 Mock 或占位组件描述成前端已经交付的完整业务。验证说明须区分真实接口、模拟测试和未验证的链路。

## 核心开发约定

1. 优先满足已确认需求的简单实现。沿用现有模块，不为统一形式增加 service、repository、entity 等同义包装；复杂交互抽 composable，可独立验证的数据规则抽纯函数。
2. 页面与布局负责组合功能。组件不直接调用 fetch、不嵌入业务 endpoint；模块 `api.ts` 封装路径、方法、参数和返回类型，composable/store 编排查询及交互。
3. 模块放在 `app/features/<module>/`，跨模块优先使用明确的公开入口。功能代码使用显式导入；`app/lib` 不能导入业务模块或 store；`shared/` 不依赖 Vue、浏览器对象或私密配置。
4. JSON 使用 `app/lib/http`，SSE 与下载使用共享认证的专用传输层。不要另建一套 axios/fetch 客户端或在组件中处理 Token 刷新。
5. 不增加 API 代理/BFF。本地浏览器直连 `http://localhost:6001/api`，由后端 CORS 支持；生产浏览器使用同源 `/api`。
6. 接口字段按文档和真实响应定义，不推测 endpoint，不全局转换 snake_case/camelCase。发现差异先核对，并明确反馈缺失能力；协议变更同步相关代码、测试和文档。
7. 保持唯一的数据归属，不把同一资源复制到 Pinia、`useAsyncData` 和组件三处。异步请求要处理取消、迟到响应、用户切换和失败重试，失败不能显示为保存成功。
8. `prototype/` 和参考项目独立于当前应用，不参与构建；不要把其示例数据复制进生产功能。当前历史 Mock 只用于 `tests/`；未接入的业务明确显示占位状态。
9. `.env` 不提交，示例配置只放无密钥的 `.env.example`。Token、验证码、Google credential 和敏感请求内容不进入日志或工程文件。
10. 最新明确的用户决策优先于历史设计稿和参考项目。更新受影响的项目说明，但不要无关重写或批量格式化参考文档。功能状态、目录或开发规则改变时维护本文件索引。

## 路由与渲染边界

| 入口                 | 布局 / 渲染                          | 职责                                       |
| -------------------- | ------------------------------------ | ------------------------------------------ |
| `/`                  | `public` / SSR                       | SEO 落地页、产品介绍和访客研究输入         |
| `/login`             | `auth` / noindex、no-store           | 邮箱与 Google 登录；品牌可返回落地页       |
| `/new-task`          | `workspace` / CSR、noindex、no-store | 常用工作台的新研究入口                     |
| `/conversations/:id` | `workspace` / CSR、noindex、no-store | 真实对话、快捷问答、消息卡片与资产概要面板 |
| 账户与套餐入口       | 全局 overlay                         | 页面内弹窗，桌面左侧页签、移动端适配       |

新增公开 SEO 页面放在 `app/pages/`，声明 `layout: 'public'` 并使用 `usePageSeo`；落地页与新研究页是两个页面，共用研究输入能力。私有用户数据不随公共页面 SSR 输出或进入共享缓存。Strategy/Replay 作为工作台面板扩展，避免为了开关面板重新挂载整个对话。

`ResearchEntry` 已作为可直接嵌入落地页及其他 SEO 页的公开入口，统一处理草稿、登录、创建和跳转：已登录直接发起对话，未登录在登录成功后自动继续原发送。页面只负责展示配置，保留公共 SSR，不重复编写发送业务；用法见 Agent 对话模块技术方案第 4.4 节。

## 代码索引地图

先定位任务对应入口，再沿调用链读取；不必每次读完全部文件。

| 要处理的内容                      | 优先查看                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 启动、模块、环境变量、SSR 规则    | `package.json`、`nuxt.config.ts`、`.env.example`                                                                                                                                  |
| 路由与布局                        | `app/pages/`、`app/layouts/`、`app/middleware/auth.ts`                                                                                                                            |
| 全局依赖与认证恢复                | `app/plugins/02.api.ts`                                                                                                                                                           |
| JSON 请求、错误、认证协调         | `app/lib/http/client.ts`、`session.ts`、`error.ts`；通用类型在 `shared/types/http.ts`                                                                                             |
| 邮箱/Google 登录与用户展示状态    | `app/features/auth/api.ts`、`google.ts`、`composables/useLogin.ts`、`stores/auth.ts`                                                                                              |
| 研究列表 API 与字段               | `app/features/conversation/api.ts`、`types.ts`                                                                                                                                    |
| 历史分页、写入和并发处理          | `app/features/conversation/history-state.ts`；用户生命周期在 `history-store.ts`                                                                                                   |
| 历史菜单、重命名与删除交互        | `app/features/conversation/components/ResearchHistory.vue`、`HistoryRenameInput.vue`                                                                                              |
| 工作台侧栏、Hover、折叠与 H5 抽屉 | `app/layouts/workspace.vue`、`app/components/common/WorkspaceNavigation.vue`                                                                                                      |
| 新研究输入与草稿                  | `app/features/conversation/components/ResearchEntry.vue`、`composables/useResearchEntry.ts`、`useResearchDraft.ts`                                                                |
| 对话与流式状态                    | `app/features/conversation/composables/useConversation.ts`、`useAgentRun.ts`、`message-state.ts`、`agent-events.ts`                                                               |
| 快捷问答与未决提交                | `app/features/conversation/clarification.ts`、`composables/useClarification.ts`、`submission.ts`                                                                                  |
| 消息界面与资产面板                | `app/features/conversation/components/ConversationWorkspace.vue`、`UserMessage.vue`、`AssistantMessage.vue`、`ConversationAssetPanel.vue`；样式 `app/assets/css/conversation.css` |
| 账户设置与全局弹窗                | `app/features/account/components/`、`app/stores/overlays.ts`、`app/components/shell/GlobalOverlays.vue`                                                                           |
| 全局偏好、主题及语言恢复          | `app/stores/preferences.ts`、`app/plugins/01.preferences.ts`、`app/composables/useTheme.ts`、`public/theme-init.js`                                                               |
| 尺寸、字体、配色与页面样式        | `app/assets/css/tokens.css`、`themes/light.css`、`themes/dark.css`、`main.css`；Nuxt UI 配置在 `app/app.config.ts`                                                                |
| 品牌、头像与公共控件              | `public/logo.svg`、`public/favicon.svg`、`public/avatar-default.svg`、`app/components/common/`、`app/components/ui/`                                                              |
| 界面文案与国际化                  | `i18n/locales/zh-CN.json`、`en-US.json`、`i18n/i18n.config.ts`                                                                                                                    |
| SSE、文件下载                     | `app/lib/sse/`、`app/lib/download/client.ts`                                                                                                                                      |
| 图表、精度、Markdown、存储与遥测  | `app/lib/chart/`、`format/`、`storage/`、`telemetry/`                                                                                                                             |
| SEO 与公共生命周期工具            | `app/composables/usePageSeo.ts`、`useDisposableScope.ts`、`useChart.ts`                                                                                                           |
| 测试与 HTTP Mock                  | `tests/unit/`、`tests/e2e/`、`tests/e2e/auth-fixtures.ts`、`history-data.ts`                                                                                                      |

## 状态、认证与传输约定

- Access Token 仅保存在当前 HTTP auth session 实例的内存中，不放 Pinia、localStorage、sessionStorage 或 SSR payload；Refresh Token 由后端写入 HttpOnly Cookie，前端 JS 不读取。
- `auth` store 只存用户与认证状态。登录结果交给 `$acceptAuth()`，恢复使用 `$restoreAuth()`，退出使用 `$logout()`；服务端撤销成功后再清理本地会话。站内路由切换复用 Token，整页刷新或新标签页通过 Refresh Cookie 恢复。
- HTTP/session 在 Nuxt plugin 内创建，不能在 Node 进程级共享用户状态。认证失效或用户切换时取消旧请求、清空私有缓存，迟到响应不得写回。
- 主题与语言偏好放非敏感 Cookie；侧栏折叠偏好放 localStorage；研究草稿放按用户隔离的 sessionStorage。局部菜单/输入状态留在组件，工作台面板状态留在作用域 controller。
- 使用 Nuxt 异步数据时，私有查询 key 以 `private:` 开头，并包含用户、资源、分页等影响结果的参数。历史模块现有独立状态控制器不再叠加另一份远程缓存。
- `http.requestJson<T>()` 返回已解包的 `data`。需要幂等的操作使用 `http.operation()`，重试保留同一操作句柄、请求体和幂等键；普通写请求不自动网络重试。
- SSE 传输与业务事件归并分层；重连使用原 Run 的 Snapshot 与字符 offset，不重新提交消息。EOF 不等于 Run 完成，断开前端订阅不等于取消后端任务。
- 金额、价格、数量与比率保留 Decimal 字符串，通过统一 formatter 展示；只有图表 adapter 边界按需转 number。图表 SDK 实例和连接不放 Pinia 或 SSR payload。

## 已确定的 Agent 对话契约

- 普通消息仅纯文本；用户气泡与 AI Markdown 分组件。使用 `marked` + `sanitize-html`，不从正文猜卡片或工具调用。
- 流式原文立即归并，展示层按吐字速度消费队列（60–180 字素/秒，每帧最多 4 个），大块内容不强制在固定时间内显示完；只更新变化的 Markdown 节点，保留已有段落、表格及代码块。历史和 Snapshot 立即展示，减少动态效果偏好下直接显示；消息增长时同步定位底部，不另加滚动缓动，上滚立即停止，输入浮层高度变化不触发跟随。生成期间工具区保留单行最小高度，空状态仅透明隐藏。
- 回复期间输入可编辑，但所有发送入口禁用；无暂停按钮、自动排队、发送中/成功标记。网络结果不明时保留原正文和幂等 key 重试，不直接丢弃并生成新 key。
- Clarification 只激活最新一轮的问题，紧贴输入框上方；统一提交 `structured_answers` 数组，使用响应的 `updated_messages` 恢复已答状态。普通文字继续不推断旧题已回答，旧题只读收起。
- 历史按 sequence 排序，实时层按消息 ID 覆盖；Snapshot 只替换当前 Run 覆盖层，Unicode offset 按 code point。终态校准失败保留已显示内容并提供恢复入口。
- 卡片按 ID 整体替换；面板开关不重建对话。Strategy / Replay 详情暂未接入，不生成假规则或指标。真实与模拟验证分开记录在 Agent 对话联调记录。
- 工作台页头统一固定为 48px，新建页与对话页共用同一高度，侧栏品牌和开关同步居中，切换路由不改变导航栏纵向位置；资产面板四周边距统一为 4px，桌面、全屏和小屏一致，内部页头高 44px。拖动直接使用面板左边框，悬停显示居中的浅色短线，拖动时短线加深并保持显示。鼠标左侧提示延迟 400ms 出现，开始拖动或离开边框时取消并隐藏。
- 资产面板开关沿用 `--motion-panel`（260ms）：从右向左展开、反向收起，桌面正文空间同步过渡；面板内容保持目标宽度，关闭后再隐藏。边框调宽不带缓动，减少动态效果偏好下跳过过渡，面板开关不重建消息和输入框。

## 已确定的研究历史契约

字段级定义以接口文档第 5 节为准，当前实现要保留以下边界：

- 收藏使用 `scope=favorite`，历史使用 `scope=non_favorite`，各自按 `page/size` 独立分页。`all` 只保留在通用 API，不通过拉取全部再本地过滤实现侧栏。
- 列表按服务端 `updated_at DESC` 排序并按 ID 去重；写入成功后重新校验已加载分页，避免排序变化导致偏移分页漏项。
- PATCH 的 `data` 直接是 `ConversationSummary`，GET 详情是 `data.conversation`。通过统一客户端后分别读取返回值本身和 `.conversation`。
- 标题 `title` 去掉首尾空白后按 Unicode 字符计数校验，上限 200。原位重命名开始时全选，Enter/失焦保存，Esc 取消；空输入取消修改，IME 组合中不提交，失败保留草稿。
- 永久删除需用户在 UI 确认，发送 `X-Confirm-Delete: permanent` 和稳定幂等键；成功后才移除记录。删除当前对话后转到 `/new-task`，失败保留当前页面并允许重试。

## 已确定的 UI 约定

- 颜色和排版使用全局语义 CSS 变量；字体集中在 `tokens.css`，后续替换从这里修改，不在各页面分散定义。深色设计未确认前保持 `NUXT_PUBLIC_ENABLE_DARK_THEME=false`。
- 全局滚动条使用透明轨道和淡灰色细滑块，悬停时略加深；颜色统一由 `tokens.css` 的滚动条变量控制，保留原生滚动及拖动能力。
- 对话正文与底部输入共用 736px 内容宽度、左右留白和滚动条占位；展开资产、拖动分屏及切换侧栏后仍保持左右对齐。桌面左右最小留白 30px，小屏 16px。
- Markdown 表格统一撑满正文内容宽度，宽表格在独立容器内横向滚动，不撑宽消息或页面。
- 对话输入框悬浮在消息区域底部，消息滚动区域延伸到页面底部；底部留白随输入及快捷问答区域的实际高度变化。输入浮层上沿为 32px 向上透明的画布色渐变，渐变不拦截滚动，回到最新消息按钮位于浮层上方，使用 36px 圆形向下箭头按钮，只显示图标并保留无障碍名称。
- 对话输入框最小 2 行，文字增减和自动折行时自适应高度，最多 16 行，超出后内部滚动；共享的新研究输入初始 3 行。草稿恢复和分屏宽度变化也要重新计算，输入浮层与消息底部留白同步更新。输入浮层高度变化不触发消息滚动，允许暂时遮挡消息；消息内容增长时仍按原有规则跟随。
- 用户可见界面文案同步维护中英文语言文件，当前采用无语言前缀路由。用户自己的研究标题不由前端自动翻译。
- Agent Clarification 使用紧贴输入框上方的快捷问答区，用户选择或填写答案后统一提交；协议名 `clarification_card` 不代表前端按聊天卡片展示。单题和多题统一提交 `reply_to_message_id + structured_answers`，成功后按 `updated_messages` 更新原题及答案。实现方案见对话模块技术方案，当前已接入并完成批量答案联调。
- 同会话在 Agent 回复全部结束前禁止发送下一条消息，输入框仍可编辑；普通发送与 Clarification 提交共用发送条件，不自动排队。本期不提供暂停/停止操作，后续后端支持暂停后，回复期间的发送按钮再切换为暂停按钮。
- 用户消息点击发送后立即按正常气泡展示，不显示“发送中”或成功标记；仅失败时显示轻量提示与重试入口。内部保留请求确认和防重复提交逻辑，失败不覆盖用户正在编辑的下一条草稿。
- Logo 单独保存在 `public/logo.svg`，由 `BrandMark.vue` 组合品牌文字；当前使用单色 CSS mask，替换图形不需逐页改 SVG。favicon 独立维护。
- 桌面侧栏宽度统一为 `--sidebar-width: 260px`；新研究条目 36px，历史条目 32px。Hover、键盘聚焦和选中态共用 `--color-bg-sidebar-interactive`，`/new-task` 的新研究入口有选中态。
- 收起后的 Hover 预览不推动正文、不加右侧阴影或横向展开动画；内容沿用完整侧栏，顶部只保留展开按钮。点击固定展开/收起才带布局过渡，收起动画经过静止鼠标不能重新触发 Hover，展开按钮保持连续不闪烁。
- 新研究快捷编辑按钮仅在对话页且侧栏收起时显示。H5 抽屉顶部为 Logo + Trade Lab 和关闭 X，不重复增加历史标题/说明。
- 历史分为收藏和历史两个可折叠组，无前导圆点。三点菜单仅保留收藏/取消收藏、重命名、删除，使用紧凑菜单和明确的灰色 Hover。
- 账户入口显示头像、昵称（缺失时邮箱）和套餐，目前套餐为 `Free` 占位。头像缺失或加载失败使用默认资源。设置弹窗提供账户/偏好、套餐、使用记录页签，升级入口统一为“升级套餐”。
- 桌面偏好下拉沿用 `PreferenceSelect.vue`：文字加下箭头、轻量菜单、选中项灰底和勾选标记。优先复用现有控件并保留键盘操作、焦点管理与移动端适配。

## 文档地图

| 文档                                                       | 何时读取                                           |
| ---------------------------------------------------------- | -------------------------------------------------- |
| [README](README.md)                                        | 安装、环境变量、请求用法与本地运行                 |
| [前端整体架构方案](docs/Trade%20Lab%20前端整体架构方案.md) | 新建模块、职责分层、SSR/状态/传输与主题边界        |
| [接口定义文档](docs/接口定义文档.md)                       | API 联调、DTO、认证、分页、SSE 和业务响应字段      |
| [MVP PRD](docs/Trade%20Lab%20MVP%20PRD.md)                 | 产品范围、核心对象、用户流程和验收要求             |
| [MVP 交互方案](docs/Trade%20Lab%20MVP%20交互方案.md)       | 页面、聊天卡片、工作台面板与交互状态               |
| [浅色版设计决策](docs/Trade%20Lab%20浅色版设计决策.md)     | 视觉方向、品牌、颜色、字体与组件设计原则           |
| [产品决策](docs/产品决策.md)                               | 产品概念、边界和历史取舍                           |
| [研究历史接口联调记录](docs/研究历史接口联调记录.md)       | 历史真实接入范围、分页行为、契约与验证方式         |
| [Agent 对话模块技术方案](docs/Agent%20对话模块技术方案.md) | 对话创建、发送、流式归并、卡片和历史恢复的实现计划 |

后端仓库的说明仅帮助理解后端实现，不将其目录规则或实现状态直接套用到前端。设计文档描述目标，当前是否接入要核对本仓库代码与验证记录。

## 本地开发与检查

```bash
pnpm install
pnpm dev               # http://localhost:6002
pnpm lint
pnpm typecheck
pnpm test              # Vitest
pnpm test:e2e          # Playwright，桌面与移动端
pnpm build
pnpm preview
```

- 本地访问使用 `localhost`，不要与 `127.0.0.1` 混用 Cookie/OAuth 来源。后端 CORS 需允许前端来源、凭据和业务请求头；不要用前端代理绕过接口配置。
- 默认连接真实后端；`NUXT_PUBLIC_API_ENABLED=false` 仅用于离线骨架预览，不模拟业务成功。环境变量含义见 `.env.example` 与 README；`NUXT_PUBLIC_*` 配置不能包含密钥。
- 实现变更运行 `pnpm lint`、`pnpm typecheck` 和相关测试；路由/布局变更运行 `pnpm test:e2e`；框架/配置变更运行 `pnpm build`。纯文档变更检查格式、链接和内容一致性即可。
- `pnpm check` 包含 lint、类型检查、单测和构建，不包含端到端测试。构建与 dev 都写 `.nuxt`，生产构建前停止 dev，结束后重启；不能并行运行二者。
- 使用 `pnpm format` 保持源码格式；仅改单个文档时可执行 `pnpm exec prettier --write AGENTS.md`。不要批量格式化 `docs/` 参考资料或独立原型。
- Playwright 可复用已启动的 6002 服务；首次使用按需执行 `pnpm exec playwright install chromium`。测试 Mock 仅用于隔离验证，不能替代真实后端联调。
- 接口联调同时核对实际请求/响应与 UI 更新、错误恢复和刷新持久化。临时数据使用专用测试账户，完成后清理；不修改现有用户研究来制造测试场景。不记录 Token 或验证码。

Agent 实现与验证：[Agent 对话接口联调记录](docs/Agent%20对话接口联调记录.md)。
