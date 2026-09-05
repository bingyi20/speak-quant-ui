# Trade Lab MVP 产品需求文档（PRD）

> 文档状态：Draft V1.1  
> 更新日期：2026-07-23  
> 产品阶段：Crypto MVP  
> 产品名称：Trade Lab（暂定）  
> 上位决策文档：[`产品决策.md`](./产品决策.md)

---

## 1. 文档目的

本文档定义 Trade Lab MVP 的产品目标、业务流程、页面结构、交互规则、状态、异常处理与验收标准，用于让设计、开发和测试明确产品最终应呈现的行为。

本文档只描述“产品要实现什么”，不规定技术架构、接口、框架、模型或具体工程实现。

---

## 2. 产品概述

### 2.1 一句话定位

> **3 分钟，验证你的交易想法。**

Trade Lab 是面向交易者的 **Trading Research Workspace**。用户通过自然语言描述策略想法，产品协助其形成可验证的策略、完成历史回测、通过 Replay 理解策略行为、持续调整当前策略，并最终将选定的 Strategy 代码交付为包含通用 Runner 的本地运行包。

### 2.2 核心价值

用户购买的不是 AI、代码或回测计算，而是：

- 更快验证交易想法
- 更低成本地试错
- 看懂策略为什么赚钱或亏钱
- 获得更可信的研究结论
- 将研究成果交付为可持续运行的策略

### 2.3 核心闭环

`Idea → Strategy → Backtest → Replay → Insight → Adjust → New Replay → Runner`

### 2.4 Aha Moment

用户在 Replay 中看到关键交易事件，并通过 AI Explain 理解：

> 策略在什么市场状态下生效、为什么触发交易、为什么盈利或亏损，以及下一步值得验证什么。

完成回测本身不等于产生 Aha Moment。

---

## 3. 产品目标与非目标

### 3.1 MVP 目标

1. 让目标用户无需编程即可把交易想法转化为可验证策略。
2. 尽可能让用户在 3 分钟内获得第一次有效研究反馈。
3. 通过 Replay + AI Explain 建立对策略行为的理解，而非只提供收益指标。
4. 让用户与 AI 协同发现问题、调整当前策略并继续验证。
5. 将验证后的策略交付为包含通用 Runner 的本地运行包。

### 3.2 非目标

MVP 不提供：

- 新闻、社交媒体、链上数据等非 OHLCV 历史数据策略
- 多币种组合策略
- 自动调优
- Monte Carlo、Walk Forward 等高级量化研究
- 社区、策略市场、跟单与策略分享
- 云端托管自动交易
- 收益保证或投资建议
- 团队工作区
- 全局 Strategy Assets 资产库或策略管理中心
- 独立 Replay Compare 页面或双 Replay 同步比较
- Runner 客户端内的安装、模拟、实盘与运行交互设计
- Subscription、Usage、积分和定价页面

---

## 4. 目标用户

### 4.1 核心用户

有实际 Crypto 交易经验，能理解 K 线、成交量和常用技术指标，有自己的策略想法，但缺乏编程能力或不愿花时间搭建回测环境的主动交易者。

### 4.2 用户特征

- 使用现货或合约交易
- 可能同时研究做多和做空策略
- 熟悉均线、RSI、MACD、突破、成交量等概念
- 当前主要依赖主观观察、TradingView 或手工复盘
- 希望快速判断一个想法是否值得继续研究
- 不一定理解代码、回测工程或 AI Token

### 4.3 语言与市场

- MVP 支持中文和英文输入、界面与 AI 协作。
- AI 默认跟随用户当前产品语言回复。
- 长期面向海外全球用户；早期可优先服务海外中文用户。
- MVP 聚焦虚拟货币市场。

---

## 5. 核心产品概念

### 5.1 Strategy Conversation

一个 Conversation 对应一个 Strategy，也是用户持续研究该策略的唯一上下文。

一个 Strategy Conversation 包含：

- 当前 Strategy
- Strategy History
- Conversation History
- Replay History
- Replay 与 AI Insight

产品不在同一个 Conversation 中管理多个独立策略。

一个 Conversation 在 MVP 中只产生两类用户资产：

1. **Strategy**：当前工作策略及其已形成的历史策略节点。
2. **Replay**：每次完成回测后生成的完整回测记录与播放资产。

右侧资产入口打开一个统一列表：第一张固定为当前 Strategy 卡片，下方按时间倒序展示全部 Replay 卡片。Conversation 中的快捷卡片也可以打开对应详情。

### 5.2 Strategy

Strategy 是当前唯一有效、可以继续通过 Agent 修改和运行回测的策略产物。

每个 Strategy 状态由两部分组成：

1. **Strategy Design.md**：AI 生成的策略设计文档，描述目标、逻辑、交易规则、关键数值、风控和限制。
2. **Strategy Code Files**：与设计文档一致的实际执行代码及代码内配置。

产品不提供独立的 Strategy Parameters 实体、参数面板或参数版本。均线周期、阈值、止损比例、仓位逻辑等均属于 Strategy Design.md 与 Strategy Code Files 的组成部分。

回测区间、历史数据周期、初始资金、手续费、滑点等单次验证条件属于 Backtest Conditions，不属于 Strategy。

业务规则：

- 用户和 AI 可以持续修改 Strategy。
- Strategy 详情全部只读；用户只能通过 Agent 对话提出修改，由 AI 同步更新 Strategy Design.md 与 Strategy Code Files。
- 系统保存 Strategy 最新状态，保证用户离开后可以继续研究。
- 没有完成回测的连续修改不形成历史策略节点。
- 未回测修改只显示为“当前策略存在未验证修改”。
- 本次会话内可以提供简单撤销；关闭或离开后不承诺恢复每一个未回测中间状态。
- 用户可以将某个历史策略节点的 Strategy Design.md 与 Strategy Code Files 恢复到当前 Strategy；执行前需提示当前未回测修改可能丢失。
- 恢复只复制策略设计与代码，不恢复或移动任何 Replay、回测条件和回测结果。
- 恢复操作本身不形成历史策略节点，也不产生 Replay。恢复后的当前 Strategy 需要完成回测，才形成新的历史策略节点。
- 一个已经形成的历史策略节点可以使用不同 Backtest Conditions 运行多次，并关联多条 Replay。

### 5.3 Conversation History

Conversation History 保存用户与 AI 的研究对话，用于解释当前策略如何形成。

- 对话消息不是策略快照。
- 未回测的策略中间状态不因对话存在而进入 Replay History。
- 用户可以通过对话理解修改原因，但可恢复的历史 Strategy 状态来自已经完成过回测的历史策略节点。

### 5.4 Replay Record

一次回测完成后形成一个 Replay。Replay 同时是回测记录、结果报告与可播放研究资产，不再把一次回测拆分为多种用户对象。

每个 Replay 保存：

- 所属 Strategy Conversation
- 本次回测实际使用的 Strategy Design.md 与 Strategy Code Files
- 回测条件
- 相对上一 Replay 或初始策略的变化摘要
- 回测结果
- 交易记录
- K 线播放数据与关键事件
- AI Explain 与研究结论
- 创建时间和发起来源

业务规则：

- 只有实际完成回测的当前 Strategy 工作状态才形成历史策略节点。
- Replay 必须明确关联本次回测使用的历史策略节点。
- 多条 Replay 可以关联同一个历史策略节点，只因回测区间、数据周期或其他 Backtest Conditions 不同而产生不同结果。
- 每个 Replay 都可以查看指标、交易记录、K 线播放、AI Explain 和报告。
- Replay 的全部内容只读，不支持修改、覆盖、恢复或重新激活。
- 用户可以通过 Replay 进入其关联的历史策略节点，并将该节点的 Strategy Design.md 与 Strategy Code Files 恢复到当前 Strategy。
- 恢复操作只覆盖当前 Strategy，不修改历史策略节点或原 Replay，也不会立即创建历史节点或 Replay。
- 同一策略连续回测多次，形成多条独立 Replay Record。
- 回测失败或取消只保留为 Conversation 状态消息，不生成 Replay 资产。
- No Trades 生成一条无交易 Replay，作为有效研究结论展示。
- Replay 默认以 AI 生成的语义名称展示，例如“增加成交量过滤”，不使用 V1/V2 编号。
- 大量 Replay 按日期或研究阶段折叠，并由 AI 生成阶段摘要。

### 5.5 Runner 与交付包

Runner 是用于在用户本地执行策略的通用执行器，不是 Strategy 的专属实例，也不是需要长期保存的快照或用户资产。

用户发起下载时，产品根据客户端环境选择兼容的 Runner，并与某一历史策略节点的 Strategy Code Files 临时组装为下载包。

- Runner 下载包的核心来源是历史策略节点中的 Strategy Code Files，不是 Replay。
- 当用户从某条 Replay 点击下载时，产品取用的是该 Replay 所关联历史策略节点的 Strategy Code Files；Replay 只是下载入口和验证证据。
- 同一历史策略节点可以对应多条 Replay，也可以从其中任意一条 Replay 发起相同策略的 Runner 下载。
- 下载包是一次按需生成的交付物，不形成新的历史节点，也不进入资产列表。
- 同一份 Strategy Code Files 可以重复生成下载包；Runner 本身不因此产生版本或快照。
- 下载包必须标明 Strategy 来源；若从 Replay 发起，还应展示入口 Replay 及其回测时间，帮助用户确认这份代码曾如何被验证。
- Strategy 后续继续变化，不影响用户已经下载到本地的策略代码与配置。
- MVP 只允许打包已经形成历史策略节点的 Strategy Code Files。Replay 只用于证明该策略节点已被验证，不是 Runner 的构建依赖。
- Runner 首次运行默认为模拟模式；用户可以主动开启实盘，实盘不得默认开启。
- API Key 只保存在用户本地。

---

## 6. MVP 策略能力边界

### 6.1 支持范围

- 单币种策略
- 现货策略
- 合约策略
- 做多与做空
- 杠杆
- 单周期与多周期条件
- OHLCV：开、高、低、收、成交量
- 基于 OHLCV 可计算的常用技术指标
- 固定金额或账户资金百分比仓位
- 止盈、止损和规则出场
- 分批出场与减仓
- 单一方向持仓
- 平仓后反手

### 6.2 暂缓范围

- 分批进场
- 持仓中继续加仓
- 同时持有多空双向仓位
- 多币种或投资组合策略
- 新闻、情绪、链上数据
- 依赖外部基本面数据的条件

### 6.3 不支持请求的处理

用户输入包含不支持能力时，AI 必须：

1. 明确指出无法验证的条件。
2. 解释当前支持的数据范围。
3. 尽可能提出不歪曲原意的替代研究方式。
4. 未得到用户确认前，不得擅自删除关键条件并开始回测。

示例：

> MVP 暂不支持链上巨鲸转账数据。可以只验证其中基于价格和成交量的部分，也可以先保存想法，待该数据能力开放后继续研究。

---

## 7. 信息架构与页面清单

MVP 包含以下页面或核心视图：

1. Landing / New Conversation Home
2. Login（Google / Email Verification Code）
3. Conversation Shell
4. Strategy Clarify / Rule Summary
5. Agent 发起回测
6. Conversation Streaming Progress
7. Replay Workspace
8. Conversation History Sidebar
9. Runner Download Entry

登录后的产品框架采用三段式：左侧 Conversation History、中央 Conversation、右侧 Strategy / Replay Panel。MVP 不提供跨会话汇总所有策略的全局资产入口。

---

## 8. 端到端业务流程

### 8.1 首次研究主流程

1. 用户进入 Landing Page。
2. 用户输入自然语言策略想法，或选择示例后修改。
3. 用户点击输入框右下角的发送图标。
4. 未登录用户进入登录界面；默认使用 Google 登录，用户也可选择邮箱验证码登录。成功后恢复原始输入。
5. AI 判断策略是否可验证、是否存在关键歧义。
6. 若无关键歧义，系统整理 Strategy 和回测条件。
7. 若有关键歧义，AI 只询问会显著改变策略含义的问题。
8. 用户回答后，AI 更新 Strategy 和回测条件。
9. 用户明确要求验证且关键条件清晰时，AI 直接调用回测工具；存在关键歧义或数据量过大时，先用自然语言或 Clarification 向用户确认。
10. 回测开始后立即在 Conversation 中生成 Replay 卡片，并通过卡片状态和动态文本展示执行过程。
11. 回测完成后更新同一张 Replay 卡片，并自动在右侧半屏打开 Replay Workspace。
12. 新 Replay 首次打开时默认从回测起点进入策略回放并自动快速播放；普通区间快速通过，关键节点适当停留，用户可以随时跳过并直接查看完整结果。
13. AI 解释关键交易、整体表现、有效场景与失效场景。
14. AI 或用户提出新的策略修改方向。
15. 用户与 AI 继续调整 Strategy；未回测修改不形成历史节点。
16. 用户再次表达验证意图后，Agent 按相同规则决定直接执行或先 Clarify。
17. 新回测完成后生成新的 Replay；当前 Strategy 尚未形成历史节点时，同时形成新的历史策略节点。
18. 用户可以切换查看历史 Replay、直接询问 Agent 比较历史结果、从历史策略节点恢复 Strategy Design.md 与 Strategy Code Files，或基于历史策略节点生成 Runner 下载包。

### 8.2 老用户返回流程

1. 用户重新进入产品后，默认进入 New Conversation 输入界面，而不是自动打开最近 Strategy。
2. 左侧 Conversation History 可以展开，展示历史聊天。
3. 用户点击某条历史聊天后，进入该完整 Strategy Conversation。
4. Conversation 恢复对应 Strategy、对话上下文和未完成状态。
5. 右侧资产入口打开统一列表，第一张为当前 Strategy，下方为全部 Replay。
6. 用户可以继续对话、重新回测、查看 Replay、询问 Agent 比较历史结果或生成 Runner 下载包。

### 8.3 AI 主动协同流程

1. AI 分析当前回测结果和交易行为。
2. 发现明确模式、风险或改进机会时，主动输出洞察。
3. AI 说明发现的证据、建议修改内容、预期改善和可能代价。
4. AI 展示差异后应用到 Strategy，并明确标记尚未验证。
5. 如果用户希望保留原策略并独立研究新方向，AI 建议在新 Conversation 中创建 Strategy。
6. 用户要求验证后，Agent 在条件清晰时直接运行回测；否则先 Clarify。
7. 回测完成时生成对应 Replay Record；未运行回测的临时修改不进入历史。
8. 新 Replay 完成后，AI 比较新旧结果并说明建议是否得到验证。

---

## 9. 功能需求

## 9.1 Landing / New Conversation Home

### 目标

让用户尽快开启新的策略研究对话，不被产品介绍、资产管理或复杂配置打断。

### 页面内容

- 核心文案：“3 分钟，验证你的交易想法。”
- 大型自然语言输入框
- 输入框右下角的发送图标按钮
- 3～6 个 Quick Examples
- 中文/英文切换
- 必要的登录入口
- 简短风险声明

登录用户重新进入产品时：

- 默认打开空白 New Conversation 输入界面。
- 不自动跳转最近一次 Strategy Conversation。
- 左侧提供可折叠的 Conversation History。
- 右侧 Strategy / Replay Panel 在尚未形成 Strategy 时保持隐藏或空状态。

### 输入框交互

- 支持多行输入。
- 支持中文与英文。
- 示例可一键填入输入框，填入后允许继续编辑。
- 空输入时主按钮不可执行，并提示用户描述策略。
- 输入不需要符合固定模板。
- 提交后必须保留原始文本，即使发生登录、刷新或返回。
- 发送按钮不显示“验证策略”等文字，只展示向上的箭头图标。
- 按钮位于输入框右下角，使用圆角方形承载，视觉形态参考常见 Agent 对话发送按钮。
- 有有效输入时按钮进入强调色可用状态；无输入或正在提交时使用不可用状态。
- 点击发送按钮与在允许提交的场景使用键盘快捷提交具有相同行为。

### 不应出现

- 复杂功能导航
- 复杂回测配置表单
- 代码编辑器
- 大量指标与专业配置
- 夸大收益的案例

### 验收标准

- 用户可以在首页直接提交自然语言策略。
- 未登录用户完成登录后，原始输入不丢失。
- 示例策略可以一键进入输入框并继续编辑。
- 页面主行为始终是“输入并发送交易想法”。
- 返回用户进入产品后可以直接开始新 Conversation。

---

## 9.2 登录

### 业务规则

- MVP 支持 Google 登录和邮箱验证码登录。
- Google 登录是默认主入口，使用更突出的主按钮展示。
- 邮箱验证码登录是清晰可见的次级入口，不隐藏在更多菜单中。
- MVP 不提供邮箱密码登录，不引入设置密码、忘记密码和重置密码流程。
- 首次回测前必须登录。
- 登录用于保存 Strategy Conversation、Strategy 最新状态、Strategy History、Conversation History 和 Replay History。
- 登录取消或失败后，保留用户原始输入，并允许重试或返回修改。
- Google 登录失败或用户无法使用 Google 时，可以直接切换到邮箱验证码登录。
- 邮箱验证码登录需要覆盖验证码发送、输入、错误、过期、重新发送和未收到邮件等状态。
- 用户通过 Google 与邮箱验证码使用同一个已验证邮箱时，应进入同一账号，不应产生两份 Conversation History。

### 登录界面

信息与操作顺序：

1. 主按钮：“使用 Google 继续 / Continue with Google”
2. 分隔提示：“或 / OR”
3. 邮箱输入框
4. 次级按钮：“使用邮箱继续 / Continue with Email”
5. 服务条款与隐私政策提示

选择邮箱后进入验证码输入状态，支持返回修改邮箱。

### 登录触发

- 未登录用户进入 New Conversation 时可以正常输入策略。
- 未登录用户主动点击登录或发送消息时，进入独立 Login Page。
- 进入登录页前保存用户已经输入的策略和原始操作；登录成功后自动返回并继续。
- 未登录首页可以尝试展示 Google One Tap / FedCM 账号提示作为可选快捷入口。
- One Tap 由 Google 和浏览器控制，可能不展示；用户关闭后不阻断继续输入。
- 产品不得依赖 One Tap，Google 官方登录按钮与邮箱验证码始终通过 Login Page 提供。
- H5 WebView 或部分移动环境不支持 One Tap 时，直接使用 Login Page。

### 验收标准

- 登录成功后自动继续被中断的策略流程。
- 登录失败时提供明确提示和重试入口。
- 用户不需要重新输入登录前的策略想法。
- 用户无需使用 Google 也能完成注册和登录。
- Google 登录始终是默认主入口，邮箱验证码入口无需额外展开即可发现。
- 同一已验证邮箱通过两种方式登录时，不产生重复账号或两套研究历史。

---

## 9.3 Strategy 理解与 Clarify

### 9.3.1 Rule Summary

AI 将用户想法整理为可阅读的策略规则卡片，至少覆盖适用项：

- Strategy 名称
- 交易标的
- 现货/合约
- 做多/做空
- 主执行周期
- 辅助判断周期
- 入场条件
- 出场条件
- 止盈/止损
- 仓位方式
- 杠杆
- 使用的指标、阈值和关键数值
- 默认回测条件
- 系统采用的假设

### 9.3.2 信息分类

AI 将缺失信息分为：

#### A. 必须 Clarify

缺失后无法唯一理解策略，或不同解释会显著改变策略行为，例如：

- “跌了就买”但未定义下跌条件
- 同时存在互相冲突的入场或出场规则
- 无法判断用户要做现货还是使用做空/杠杆的合约

#### B. 可采用默认值

不改变策略核心含义，但影响回测环境，例如：

- 回测时间范围
- 初始资金
- 手续费和滑点假设

此类信息不阻断回测，但采用的默认值必须在 Replay 中可见。

#### C. 可由上下文推断

用户已经通过自然语言或历史对话明确表达的信息，不重复询问。

### 9.3.3 Clarify 交互

- 一次优先询问 1～2 个最关键问题。
- 能提供清晰选项时使用快捷选项，同时允许自定义输入。
- 每轮回答后更新 Rule Summary。
- 用户可以直接编辑 AI 理解错误的规则。
- 不得为了补齐所有表单字段而连续追问。
- 当用户已表达验证意图且策略与回测范围足够明确时，直接调用回测工具。

### 9.3.4 Agent 发起回测

- `replay_run` 是 Agent Tool。只有用户已表达回测、验证、比较等明确意图时，Agent 才能调用；不能因为 Strategy 刚生成便擅自运行。
- Strategy、交易标的、市场类型、主周期和时间范围等关键条件清晰时，Agent 直接创建 Replay 并开始回测，不额外插入固定确认卡。
- 会显著改变策略含义或结果的字段存在歧义时，Agent 先询问。短小且互斥的选择优先使用 Clarification 快捷选项；开放式、需要解释或没有合适按钮价值的问题使用自然语言。
- 预计数据量超过系统阈值时不得直接创建 Replay，Agent 应说明成本或等待影响，并建议缩小范围；用户明确坚持后才按原范围执行。
- 初始资金默认使用 10,000 USDT；手续费、滑点等次级条件使用系统默认值，不因用户未填写而触发 Clarify。
- Replay 从创建起即作为唯一回测资产，状态依次更新为 `queued/running/completed/failed/cancelled`；Conversation 中只展示这一张 Replay 卡片。
- `replay_confirmation` Renderer 和传统确认接口只作为未来高级参数表单的预留能力，不进入当前 Agent 主流程。

### 验收标准

- 用户已要求回测且条件明确时，无需回答无关问题或再次点击确认即可开始。
- 存在关键歧义时不会在未处理的情况下直接回测。
- 默认值和推断内容清晰可见。
- 用户能够纠正 AI 对策略的理解。
- 用户没有表达回测意图时，Agent 不擅自执行。
- Agent 使用的条件与最终 Replay 展示的回测条件一致。

---

## 9.4 回测配置

### 配置项

- Strategy 当前状态
- 交易标的
- 市场类型：现货/合约
- 做多/做空方向
- 主周期与辅助周期
- 回测时间范围
- 初始资金
- 仓位方式
- 杠杆
- 手续费假设
- 滑点假设
- 合约相关成本及风险条件

### 默认值原则

- 能从策略语义推断时优先使用用户表达。
- 不能推断但不会改变核心策略逻辑时采用产品默认值。
- 所有默认值在 Replay 中持续可见。
- 用户修改回测条件后可以重新确认并产生新 Replay。
- Backtest Conditions 或 Strategy 设计发生变化时都不会立即形成历史节点；只有实际完成回测后才形成 Replay，必要时同时形成新的历史策略节点。

### MVP 默认回测档案

用户未明确说明时，MVP 按以下规则处理：

- 交易标的：用户未指定时默认使用 BTC/USDT，并在 Replay 条件中标记其来源为默认值。
- 市场类型：仅包含普通买入/卖出且没有做空、杠杆语义时默认现货；出现做空或杠杆时使用合约。
- K 线周期：无法从策略表达或上下文确定时必须 Clarify，不擅自选择。
- 回测区间：截至最新可用历史数据的最近 12 个月。
- 初始资金：用户未主动指定时固定采用 10,000 USDT，并标记为默认值；缺失初始资金不触发 Clarify。
- 仓位：每次使用当前账户权益的 10%；用户可以修改。
- 杠杆：未指定时为 1×。
- 手续费：采用当前市场类型的标准费用假设，并展示实际采用值。
- 滑点：默认单边 0.05%，并允许用户修改。
- 合约成本：采用产品当前可提供的历史值或明确的统一假设，并在结果中标注来源类型。

默认档案用于减少首次回测阻力，不代表推荐交易配置。任何默认值都必须在 Replay 和报告中可见。

初始资金主要用于形成统一、可复现的回测基准。默认使用按账户权益百分比计算的仓位时，结果展示应优先使用收益率、回撤率等归一化指标。若策略使用固定金额下单、最低下单金额或其他会让资金规模显著影响结果的规则，产品必须说明初始资金对结果的影响。

### 合约特别规则

- 结果中必须明确展示杠杆。
- 必须考虑并展示强平事件。
- 发生强平时，Timeline、交易记录和 AI Explain 均需标记。
- 不得把强平展示为普通止损。
- 合约成本假设必须在报告中可见。

### 多周期展示规则

- Strategy 必须明确区分“执行周期”和“判断周期”。
- Replay 主图默认使用执行周期。
- 来自其他周期的条件在事件说明和规则状态中展示其周期，例如“4h 趋势条件已满足”。
- 用户查看入场/出场事件时，必须能知道每个周期分别贡献了什么判断。
- 不要求将多个完整 K 线图同时铺在首屏，以免削弱 Replay 主体。

---

## 9.5 Conversation 内回测进度

回测开始后不进入独立进度页面，也不展示固定进度面板。AI 在 Conversation 中像执行工具调用一样，动态输出当前过程。

建议的动态文本阶段：

1. 正在理解并检查策略
2. 正在准备历史市场数据
3. 正在执行策略验证
4. 正在整理交易记录
5. 正在生成 Replay 与关键洞察

交互规则：

- 进度内容与触发本次回测的 Agent 回复和 Replay 卡片保持连续。
- 当前阶段可以更新、完成并进入下一阶段，不重复发送大量独立消息。
- 文案只描述用户能理解的研究过程，不展示代码编译、服务、队列等内部工程术语。
- 回测失败时直接在 Conversation 中说明原因，并提供重试或修改入口。
- 回测成功后，进度区域完成并紧接着输出 Replay 卡片。
- 回测失败或取消不生成 Replay 资产。

验收标准：

- 用户无需离开 Conversation 即可了解当前进行到哪一步。
- 动态阶段顺序与实际研究过程一致，不展示虚假完成状态。
- 成功后一定产生可点击的 Replay 卡片；失败后存在明确下一步。

---

## 9.6 Replay Asset / Workspace

### 页面目标

Replay 是一次回测完成后产生的唯一回测资产，同时承载回测结果、K 线播放、交易记录、Timeline 和 AI 洞察。产品只提供统一的 Replay Workspace。

Replay 是一份可播放、可定位、可解释、可追溯的策略实验报告。整体预览负责展示完整实验结果；策略回放负责说明这些结果如何发生。Replay 不承担手动练盘或模拟下单功能。

详细交互以统一的 [`Trade Lab MVP 交互方案.md`](./Trade%20Lab%20MVP%20交互方案.md) 为准。

### Replay 卡片

- 回测完成后，AI 在 Conversation 中输出一张 Replay 卡片。
- 卡片展示 Replay 名称、交易标的、周期、回测区间、核心结果和生成时间。
- 卡片是该次回测在 Conversation 中的永久入口。
- 点击卡片后在右侧打开对应 Replay。
- No Trades 也生成 Replay 卡片，并明确标记“没有触发交易”。
- 失败或取消的回测不生成 Replay 卡片。

### 资产入口与 Conversation 卡片

Replay 有两个等价入口：

1. 回测完成时出现在 Conversation 中的 Replay 卡片。
2. 当前 Conversation 右侧统一资产列表中的 Replay 卡片。

右侧资产入口只打开一个列表：

1. 第一张固定展示当前 Strategy 卡片。
2. 下方以“回测记录 · N”分组展示全部 Replay 卡片。

两种卡片必须通过类型文字、图标、信息结构和分组位置明显区分，不得只依靠颜色：

- Strategy 卡片使用文档类图标，展示 Strategy 名称、当前状态、更新时间和已关联 Replay 数量，不展示收益指标。
- Replay 卡片使用播放或 K 线类图标，展示交易标的、周期、回测区间、收益率、最大回撤率和生成时间。

Strategy 首次形成或完成一次有明确意义的修改后，AI 可以在 Conversation 中输出“Strategy 已生成 / 已更新”摘要卡。该卡片记录当时发生的修改，但其中的“打开当前 Strategy”始终打开最新 Strategy，不代表历史策略节点。

Replay 卡片永久关联对应的只读 Replay Record。

### 右侧面板交互

- Replay 生成后自动在右侧展开，默认占据页面右侧约 50% 宽度。
- Conversation 保留在左侧，用户可以边查看 Replay 边继续对话。
- Replay 面板与 Conversation 之间有可拖动的竖向分隔线，用户可以左右调整宽度。
- Replay 右上角提供全屏按钮；点击后临时全屏展示 Replay。
- 退出全屏后恢复到此前的右侧半屏宽度。
- 关闭 Replay 面板后，Conversation 恢复主要空间；用户可通过 Replay 卡片或右侧历史入口再次打开。
- 右侧同时只展示一个资产详情；打开其他 Strategy 或 Replay 时替换当前详情。
- 点击右侧资产入口时先打开较窄的统一资产列表；点击 Strategy 或 Replay 卡片后，面板展开为默认约 50% 宽度的详情。
- 资产详情左上角提供“返回资产列表”，关闭详情不会改变中央 Conversation 的位置。
- Strategy 与 Replay 使用不同图标、名称和状态标签；不得仅依靠颜色区分。

### 推荐布局

- 顶部：Replay 名称、Strategy 摘要、回测指标和回测条件
- 中央主体：K 线图与交易事件
- 底部：Replay Timeline 与播放控制
- Replay 内右侧或右下区域：AI Explain 与关键洞察
- 可展开区域：策略规则、详细指标、交易记录、回测假设

K 线必须是 Replay 期间的视觉主体。

### 整体预览与策略回放

Replay Workspace 包含两种明确模式：

1. **整体预览**：完整历史 K 线可见；Timeline、事件 Marker 和 AI 洞察用于定位与分析，不隐藏所选时刻之后的 K 线。
2. **策略回放**：当前时刻之后的 K 线隐藏；播放控制出现，Timeline 指针决定当前回放进度。

用户必须能明确知道当前模式。播放控制只在策略回放中完整出现，用户可以随时退出回放并恢复完整 K 线。

新 Replay 生成后首次自动打开时，从回测起点进入策略回放并自动快速播放；始终提供“直接查看结果 / 跳过回放”。用户以后再次打开历史 Replay 时默认进入整体预览，不重复自动播放。No Trades Replay 首次打开时直接进入整体预览。

### 首屏信息层级

首屏优先回答：

1. 策略总体发生了什么？
2. 策略为什么盈利或亏损？
3. 在什么市场状态下有效或失效？
4. 下一步值得验证什么？

### 结果摘要

至少展示：

- 总收益率与净收益率
- 最大回撤率
- 交易次数
- 胜率
- 盈亏比或 Profit Factor
- 最佳/最差交易
- 手续费等成本影响
- 做多/做空表现拆分（适用时）
- 强平次数（适用时）
- 回测时间范围及数据最新时间

绝对净盈亏金额作为次级信息展示，并同时标明初始资金，不占据首屏最主要的结论位置。

指标必须配合易懂说明，不以单一收益率作为结论。收益率、回撤率等比例指标用于帮助用户理解和比较策略，不意味着忽略交易次数、费用、风险暴露与样本量。

顶部核心指标始终标记并展示“完整回测”结果，不随 Timeline 定位或回放进度变化。当前时刻的仓位、累计收益、当前回撤和持仓盈亏在 K 线与 Timeline 之间作为独立动态状态展示。

### 数据时间提示

- Replay 只基于历史数据。
- 必须展示本次数据的起止时间和最新数据时间。
- 如果历史数据存在延迟，例如最新数据可能延迟约 1 天，应在回测条件与 Replay 中明确提示。
- 不得让用户误以为 Replay 是实时行情或模拟直播。

### 播放行为

- Replay 在回测完成后生成，不参与回测计算。
- 新 Replay 首次自动打开时默认从回测起点快速播放；历史 Replay 再次打开时默认整体预览。
- 播放时按时间顺序推进 K 线。
- 普通区间快速通过。
- 到达关键节点时自动降速或短暂停留，然后继续播放。
- 用户可随时播放、暂停、调整倍速和拖动 Timeline。
- 回放时当前时刻之后的 K 线隐藏。
- 用户退出回放后恢复完整 K 线，并保留退出时刻作为整体预览的当前定位。
- 播放自然结束后自动进入整体预览。

### 播放控制

至少包含：

- Play / Pause
- Replay from Start
- Speed
- Timeline Drag
- 上一个关键事件
- 下一个关键事件
- 当前时间 / 总时间范围

### 关键节点

- Buy / Long Entry
- Sell / Exit
- Partial Exit / Reduce Position
- Short Entry
- Buy to Cover
- Stop Loss
- Take Profit
- Liquidation
- 市场状态发生关键变化
- Biggest Win
- Biggest Loss

### 关键节点停留

到达关键节点时：

- K 线定位并高亮相关区域。
- 对应 Marker 高亮。
- 展示事件类型、方向、价格、仓位和触发规则。
- AI Explain 同步更新。
- 短暂停留后自动继续。
- 用户主动暂停、拖动或选择事件时，取消自动继续。

### Timeline

- Timeline 始终以固定长度展示整个历史回测区间，不支持缩放。
- K 线图的缩放和平移只改变图表视野，不改变 Timeline 的长度、起止时间、日期刻度范围或 Marker 相对位置。
- 不同事件类型拥有可区分的 Marker。
- Marker 密集时应支持聚合或简化，避免无法点击。
- 整体预览中点击或拖动 Timeline 只移动 K 线定位，所选时刻之后的 K 线继续可见。
- 策略回放中拖动 Timeline 会改变回放截止时刻，当前时刻之后的 K 线隐藏。
- 点击 Marker 后，Chart、Replay 时间和 AI Explain 同步定位。
- 用户拖动 Timeline 时实时预览对应日期/位置。
- 回放中松开 Timeline 后定位到该时刻，并保持暂停状态，避免错过查看内容。

### Explain 内容

AI 只在关键时刻解释：

- 为什么触发买入/卖出/做空/平仓
- 为什么发生部分平仓，以及平仓前后的仓位变化
- 哪些规则已经满足
- 哪些条件阻止了交易
- 止损、止盈或强平为什么发生
- 当前交易的结果
- 市场状态如何影响策略

AI 不应对每根 K 线持续旁白。

### 用户追问

用户可针对当前时刻追问：

- 为什么这里买入？
- 为什么这里没有交易？
- 这次亏损的主要原因是什么？
- 如果修改某个条件会发生什么？

AI 回答必须基于当前 Strategy、所查看的 Replay Record、其关联的历史策略节点、回测条件和已发生的历史数据，不得把猜测描述成已验证结果。

### 点击 AI 洞察

- 每条关键洞察应关联具体时间点或时间区间。
- 点击洞察时暂停当前播放并进入整体预览。
- 恢复完整历史 K 线，不隐藏洞察时刻之后的数据。
- 将对应 K 线或时间区间移动到视图中央并高亮。
- Timeline、交易 Marker 和洞察证据同步定位。
- 洞察可以提供“从该事件前开始回放”和“询问 Agent”作为后续动作。

### 验收标准

- Replay 可以完整播放、暂停、倍速和拖动。
- 关键节点会自动放慢或停留。
- Chart、Timeline、事件与 Explain 始终同步。
- 用户主动定位后不会被自动播放立即带走。
- Replay 明确标注为历史数据，不产生实时行情误解。

---

## 9.7 AI Research Collaborator

### 角色

AI 是协同研发策略的研究伙伴，不只是命令执行器。它应主动发现、解释和修改当前 Strategy，并识别何时应建议用户新开 Conversation。

### AI 应主动提供

- 策略整体表现总结
- 主要盈利与亏损来源
- 有效和失效的市场状态
- 异常交易行为
- 成本、回撤、杠杆或强平风险
- 值得继续验证的修改方向
- 新旧 Replay 结果对比

### 建议必须包含

- 发现了什么及其依据
- 建议修改哪条策略逻辑或关键数值
- 预期可能改善什么
- 可能牺牲什么或引入什么风险
- 该判断是已验证结论还是待验证假设

### AI 修改 Strategy

- AI 可以在对话中准备修改方案并展示规则差异。
- 应用修改后，Strategy 标记为“存在未验证修改”。
- 未运行回测的修改不进入 Strategy History。
- AI 不得在用户不知情时修改策略。
- AI 不得一次自动生成大量修改方案或进行自动调优。
- 用户可以继续修改、撤销本次会话操作、准备回测或放弃修改。

### 新开 Strategy Conversation

- 用户只是改变研究方向时，默认直接修改当前 Strategy；已经完成回测的旧状态仍保留在 Strategy History。
- 用户明确要求保留原策略并独立研究新策略时，建议新开 Conversation。
- 新 Conversation 拥有独立的 Strategy、Conversation History 和 Replay History。
- AI 不在当前 Conversation 内创建或维护第二个独立策略。

### 用户控制

- 用户可以要求 AI 仅解释、不修改。
- 用户可以从 Strategy History 或 Replay 进入历史策略节点，并请求恢复该节点的 Strategy Design.md 与 Strategy Code Files。
- 用户可以手动恢复，也可以要求 Agent 执行恢复。
- 任何恢复操作都必须先展示来源和影响并由用户确认，不得静默覆盖当前 Strategy。

---

## 9.8 Strategy 与 Replay History

### 修改入口

- Conversation 中自然语言修改
- AI 建议卡片中的“应用修改”或“准备回测”
- Strategy 详情中的“通过 Agent 修改”
- 历史策略详情或 Replay 详情中的“恢复为当前 Strategy”

### 操作与记录规则

| 用户或 AI 操作 | 产品结果 |
| --- | --- |
| 通过 Agent 修改 Strategy 但未完成回测 | 同步更新当前 Strategy Design.md 与 Strategy Code Files，不形成历史节点 |
| 修改回测时间、资金或费用但未运行 | 更新当前回测配置，不形成历史节点 |
| 当前工作状态第一次完成回测 | 形成新的历史策略节点，并新增 Replay |
| 当前 Strategy 未变化，再次使用其他 Backtest Conditions 完成回测 | 不新增历史策略节点，只在当前节点下新增 Replay |
| AI 提出策略改进或方向调整 | 展示差异后更新 Strategy |
| 用户要求保留原策略并独立研究 | 在新 Conversation 中创建 Strategy |
| 手动或通过 Agent 恢复历史策略节点 | 将该节点的 Strategy Design.md 与 Strategy Code Files 复制为当前 Strategy；不新增历史节点或 Replay |
| 恢复后继续修改但未回测 | 只更新当前 Strategy，不新增历史节点或 Replay |
| 恢复后完成回测 | 形成新的历史策略节点并新增 Replay；原节点及其 Replay 保持不变 |
| 选择 Replay 生成 Runner 下载包 | 取用其关联历史策略节点的 Strategy Code Files，与兼容 Runner 按需组装，不新增资产 |

### Strategy 当前状态交互

- 每个 Conversation 只有一个 Strategy 当前状态。
- Strategy 详情不提供直接编辑能力。
- 顶部显示“已验证”“存在未验证修改”或“从历史恢复，尚未重新回测”。
- 用户离开后恢复 Strategy 最新状态，但历史中不逐条展示未回测修改。
- 从历史恢复后，当前 Strategy 可以显示来源历史节点，但不得把来源节点标记为“正在使用”或移动其历史位置。
- 来源历史节点原有的 Replay 继续保留在原节点下，不复制到当前 Strategy。
- 当前 Strategy 可以提示“相同设计与代码历史上已有 N 条 Replay”，但必须同时说明“恢复后尚未产生新 Replay”。

### Strategy History 交互

- Strategy 详情左上角提供当前/历史策略状态切换器。
- 第一项固定为“当前 Strategy”，下方按时间倒序展示此前形成的历史策略节点。
- 当前 Strategy 已与最新历史节点一致时，不在历史列表中重复展示同一个节点；当前 Strategy 后续被修改或从其他节点恢复后，原节点继续作为历史节点保留。
- 历史节点使用 AI 生成的语义名称、形成时间和 Replay 数量，不使用 V1/V2 编号。
- 点击历史节点后，仍在 Strategy 详情中展示与当前 Strategy 相同的页面结构，但明确标记“历史状态 · 只读”。
- 历史详情展示当时冻结的 Strategy Design.md，以及使用该节点运行的 Replay 概要列表。
- 历史详情不展示 Strategy Code Files，不提供任何直接编辑控件。
- 点击某条 Replay 概要后打开对应 Replay Workspace。
- 历史详情提供“恢复为当前 Strategy”和“生成 Runner 下载包”。

恢复确认必须说明：

- 将恢复哪一个历史策略节点。
- 当前未回测修改将被覆盖且不会形成历史节点。
- 恢复 Strategy Design.md 与 Strategy Code Files。
- 不恢复回测区间、初始资金、费用、滑点、Replay 或回测结果。
- 本次操作不会自动执行回测。

恢复完成后：

- 当前 Strategy 更新为历史节点中的 Strategy Design.md 与 Strategy Code Files。
- 历史节点、历史顺序和所有 Replay 保持原样。
- 不新增历史策略节点或 Replay。
- Agent 在 Conversation 中输出恢复完成摘要，并提供“打开当前 Strategy”“继续修改”“准备回测”。

### Replay History 交互

- 每次成功回测形成一条 Replay Record。
- AI 根据本次变化和研究目标自动生成 Replay 名称与摘要。
- Replay 卡片展示创建时间、策略设计变化摘要、回测条件和核心结果。
- 点击 Replay 卡片打开对应 Replay Workspace。
- Replay Workspace 支持查看其关联的历史策略节点、询问 Agent 分析历史结果以及生成 Runner 下载包。
- 历史默认按时间倒序，并可按研究阶段折叠。
- 折叠分组由 AI 总结尝试方向、有效发现和被放弃的假设。
- 未运行回测的修改不出现在历史列表中。

### Replay 名称与描述

Replay 完成后，AI 自动生成：

- 简短语义名称
- 本次研究目标
- 相对上一历史策略节点或初始策略的设计与逻辑变化
- 回测范围和核心结果
- 已验证洞察
- 风险、局限和下一步建议

用户可以修改 Replay 名称，但不能修改 Replay Record、其关联的历史策略节点、回测条件或结果。

### 验收标准

- 用户侧不出现 V1/V2 或正式版本编号等概念。
- 未回测修改不会产生历史节点。
- 每条 Replay 都能查看对应策略设计、指标、K 线播放、交易记录和 Explain。
- 用户可以通过历史策略节点或 Replay 恢复 Strategy Design.md 与 Strategy Code Files，但不能修改或恢复 Replay 本身。
- 一个 Conversation 始终只维护一个 Strategy 当前状态。
- 用户希望保留独立策略时，新开 Conversation，而不是在当前对话增加第二个策略。
- AI 修改策略时，用户始终知道发生了什么。

---

## 9.9 Replay 比较边界

MVP 不提供独立 Replay Compare 页面、双 Replay 布局或同步 K 线比较。

用户可以在 Conversation 中直接要求 Agent 比较任意历史 Replay。AI 回答时应明确：

- Strategy Design 差异
- 回测条件是否一致
- 收益、回撤、交易次数、成本和样本量差异
- 哪些结论可以直接比较，哪些因条件不同不能直接下结论

比较结果作为 Conversation 回复，不生成新的比较资产。

---

## 9.10 Conversation Shell 与 History Sidebar

### 整体布局

- 左侧：可展开/收起的 Conversation History Sidebar
- 中央：New Conversation 输入界面或已选择的完整 Conversation
- 右侧：当前 Conversation 的 Strategy / Replay Asset Panel

### 左侧 Conversation History

- 顶部固定提供“新对话”。
- 仅展示历史 Conversation，不展示独立的全局 Strategy 资产列表。
- 每条记录以 Conversation 标题为主要信息；标题可由 AI 根据最初研究想法生成。
- 历史区只分为“收藏”和“全部”两个列表；两个列表均按最近更新时间倒序。
- 已收藏 Conversation 同时保留在“全部”中，收藏区只作为快捷入口。
- 点击记录后恢复完整 Conversation 及其 Strategy 上下文。
- 每条 Conversation 右侧提供三点菜单，包含收藏/取消收藏、重命名和删除。
- 删除后不可恢复，必须二次确认并明确说明将同时永久删除该 Conversation 下的 Strategy、历史策略节点、Conversation History 和 Replay History。
- 左侧栏支持展开和收起。
- 账户入口固定在左侧栏底部，不放在产品右上角。
- MVP 不在列表直接展示回测状态、策略收益、Runner 状态或 Replay 数量。
- 已经下载到用户本地的运行包不受 Conversation 删除影响。

### 中央 Conversation

- New Conversation 状态只展示策略输入主任务和必要示例。
- 历史 Conversation 状态恢复完整消息、当前 Strategy 和未完成交互。
- 用户在历史会话中继续发送消息时，仍然修改该 Conversation 唯一对应的 Strategy。

### 右侧 Strategy / Replay Asset Panel

- 只服务当前打开的 Conversation，不跨会话汇总策略。
- 点击资产入口后打开一个统一资产列表，不提供 Strategy / Replays 两个顶层 Tab。
- 列表第一张固定为当前 Strategy 卡片，下方以“回测记录 · N”分组展示全部 Replay 卡片。
- Strategy 与 Replay 卡片必须通过类型文字、图标、信息结构和分组位置明显区分。
- 右侧栏支持展开和收起，不应长期挤压 Conversation 的主要阅读空间。
- New Conversation 尚未形成策略时，右侧栏保持隐藏或展示简洁空状态。

### 统一资产列表

Strategy 卡片：

- 固定在列表第一位。
- 展示 Strategy 名称、“当前策略”类型标签、验证状态、更新时间和 Replay 数量。
- 不展示收益、回撤等单次回测指标。
- 点击后打开当前 Strategy 详情。

Replay 卡片：

- 展示在“回测记录 · N”分组下方并按时间倒序排列。
- 展示 Replay 名称、交易标的、周期、回测区间、收益率、最大回撤率和生成时间。
- 点击后打开对应 Replay Workspace。
- Replay 卡片始终关联同一次只读回测。

列表默认使用较窄面板；打开任一详情后扩展为右侧约 50% 宽度，仍支持拖动分隔线。

### 当前 Strategy 详情

点击资产列表中的 Strategy 卡片，或 Conversation 中“打开当前 Strategy”，进入当前 Strategy 详情。

顶部展示：

- Strategy 名称
- 左上角当前/历史策略切换器，默认选中“当前 Strategy”
- 当前状态：“已验证”“存在未验证修改”或“从历史恢复，尚未重新回测”
- 最近更新时间

主体只读展示 AI 生成的 Strategy Design.md。用户看到渲染后的策略设计，不展示 Markdown 原文，也不展示 Strategy Code Files。

Strategy Design.md 至少包含：

1. 策略目标与设计思路
2. 适用市场、交易标的、周期和多空方向
3. 入场逻辑
4. 出场、止盈和止损逻辑
5. 仓位、杠杆和风险控制
6. 使用的指标、阈值和关键数值
7. 已知假设、限制和风险

下方展示当前历史策略节点关联的 Replay 概要：

- 每条概要展示交易标的、周期、回测区间、收益率和最大回撤率。
- 点击概要打开对应 Replay Workspace。
- 不在 Strategy 详情内嵌 K 线、Timeline、完整交易记录或完整回测报告。
- 当前 Strategy 尚未形成历史策略节点时，显示“当前策略尚未完成回测”。
- 从历史恢复但尚未重新回测时，显示来源节点和“恢复后尚未产生新 Replay”；来源节点的 Replay 不复制到当前 Strategy。

主要操作：

- 通过 Agent 修改
- 准备回测
- 生成 Runner 下载包；当前 Strategy 尚未形成历史策略节点时不可用并说明原因

### 当前/历史 Strategy 切换

点击 Strategy 详情左上角的状态名称，展开切换列表：

- 第一项固定为当前 Strategy。
- 下方按时间倒序展示历史策略节点。
- 当前已验证节点由“当前 Strategy”入口承载，不在历史列表重复出现。
- 历史节点展示 AI 生成的语义名称、形成日期和 Replay 数量。
- 不使用 V1/V2 等版本编号。

选择历史策略节点后：

- 使用与当前 Strategy 相同的详情结构。
- 顶部明确标记“历史策略 · 只读”。
- 只展示该节点冻结的 Strategy Design.md，不展示代码。
- 下方展示仍然归属于该历史节点的全部 Replay 概要。
- 提供“恢复为当前 Strategy”和“生成 Runner 下载包”。

### 恢复历史 Strategy

点击“恢复为当前 Strategy”后展示二次确认：

- 展示将恢复的历史策略名称。
- 说明当前未回测修改将被覆盖且不会进入历史。
- 说明恢复 Strategy Design.md 与 Strategy Code Files。
- 说明不会恢复或移动 Replay、回测条件和结果。
- 说明本次操作不会自动执行回测。

确认后：

- 当前 Strategy 更新为所选历史节点的设计与代码。
- 历史节点及其 Replay 原样保留。
- 不新增历史节点，不新增 Replay。
- 当前 Strategy 标记“从历史恢复，尚未重新回测”。
- 后续通过 Agent 修改或直接准备回测；完成回测后才形成新的历史策略节点和 Replay。

Agent 也可以发起同一恢复操作，但必须展示相同确认，不得静默覆盖。

### Replay Workspace 内的切换

Replay Workspace 左上角展示当前 Replay 名称和切换入口。

- 点击后可在当前 Conversation 的全部 Replay 之间切换。
- 每项展示 Replay 名称、交易标的、周期、回测区间和生成时间。
- 切换只改变正在查看的 Replay，不修改当前 Strategy。
- Replay Workspace 提供“查看本次使用的 Strategy”，点击后进入其关联的历史策略详情。
- 从历史策略详情返回 Replay 时，保留 K 线位置、Timeline 位置和播放状态。

### 卡片行为

- 资产列表中的 Strategy 卡片始终打开最新的当前 Strategy。
- Strategy 首次生成或发生有明确意义的修改后，AI 可以输出“Strategy 已生成 / 已更新”摘要卡。
- 摘要卡记录当时的设计变化，但“打开当前 Strategy”始终打开最新状态，不代表历史策略节点。
- 不为每次细小对话调整生成完整卡片。
- Replay 卡片永久绑定对应的只读 Replay Record，点击后始终打开同一次回测。
- 卡片标题必须显式带有“Strategy”或“Replay”类型，不使用外观相似但无类型文字的通用资产卡片。

### 面板状态与导航

右侧面板需要覆盖：

1. Closed：面板关闭。
2. Asset List：统一资产列表。
3. Current Strategy：当前 Strategy 设计详情。
4. Historical Strategy：历史 Strategy 设计详情。
5. Replay Detail：某次只读 Replay Workspace。
6. Replay Fullscreen：Replay 临时全屏。

在以上状态间切换时：

- 不改变中央 Conversation 的当前位置。
- 返回上一级时恢复资产列表滚动位置和 Replay 播放位置。
- 从 Conversation 中点击新的 Replay 卡片时，直接替换右侧当前详情。
- 关闭面板后，再次打开应恢复上次查看的资产；新生成 Replay 自动打开时除外。

### 空状态

引导用户开启新 Conversation，输入第一个策略想法，并提供 Quick Examples。

### 后续迭代

未来可以增加独立的 Global Strategy Assets 入口，汇总所有 Conversation 产生的最终策略资产。该入口不属于 MVP，也不影响当前“一对话一策略”的信息架构。

### H5 适配

H5 是 MVP 的主要获客入口，必须完整支持从策略输入到首次研究闭环：

- New Conversation 与 Quick Examples
- Login、Clarify 和 Agent 发起回测
- Conversation 动态研究过程
- Strategy 和 Replay 卡片
- 资产列表与 Strategy 详情
- Replay 整体预览、回放、Timeline 拖动和 AI 洞察定位
- 返回 Conversation 继续追问、修改 Strategy 和再次回测

H5 使用单列布局：

- 左侧导航改为侧栏抽屉，账户入口固定在抽屉底部。
- 右侧资产改为全屏覆盖层，不与 Conversation 并排。
- Replay 使用全屏 Workspace，AI 洞察使用底部抽屉或独立层。
- 页面切换必须保留 Conversation 滚动位置、输入内容和 Replay 查看状态。

---

## 9.11 Runner 下载入口

### 9.11.1 产品侧入口

用户可以从已经形成的历史策略节点或某条 Replay 发起 Runner 下载。从 Replay 进入时，默认选择其关联历史策略节点的 Strategy Code Files，而不是把 Replay 本身作为下载对象。当前 Strategy 尚未完成回测并形成历史节点时，引导用户先回测。

下载前使用轻量确认界面展示：

- Strategy 名称与历史节点名称
- 来源 Replay 名称和创建时间（从 Replay 进入时）
- 交易标的
- 相关 Replay 的回测摘要与数据范围
- 本次下载使用的是哪次历史 Strategy 代码
- 风险提示

主要操作：

- 下载 Runner
- 取消

### 9.11.2 产品边界

- 产品侧只定义下载入口、来源确认和下载反馈。
- 下载对象必须是某个历史策略节点的 Strategy Code Files 与兼容 Runner 的包装产物。
- 从 Replay 发起时不得误用已经变化的当前 Strategy。
- 下载不会形成 Runner 资产、Runner 快照或新的历史节点。
- Runner 的客户端安装、配置、模拟运行、实盘运行、API Key、停止与异常交互不在当前产品交互方案内，由技术侧完成可行性调研后另行定义。

### 验收标准

- Strategy 与 Replay 详情存在清晰的 Runner 下载入口。
- 用户下载前可以确认代码对应的历史 Strategy 节点。
- 从 Replay 发起时明确展示该 Replay 作为验证证据。
- 生成下载不会创建第三类用户资产。

---

## 9.12 Account 与商业化边界

- 左下角账户入口只需支持查看当前账户、基础设置和退出登录。
- Subscription、Usage、积分、套餐、价格和额度规则等待技术成本测试与商业方案后再定义。
- MVP 当前交互方案不设计充值、积分消耗、用量预警和升级页面。

---

## 10. 异常与边界状态

### 10.1 策略无法理解

- 指出无法理解的具体部分。
- 提供一个或多个改写示例。
- 保留原始输入。
- 不生成虚假的策略结果。

### 10.2 请求超出支持范围

- 明确指出不支持的数据或行为。
- 标记哪些部分仍可验证。
- 由用户确认是否采用缩减后的策略。

### 10.3 没有产生交易

这是研究结果，不是普通错误。

结果页展示：

- 当前条件下没有交易被触发
- 哪些入场条件从未满足
- 最接近触发的条件或阶段（能够确定时）
- 可供用户验证的修改方向

不得为了产生交易擅自放宽规则。

### 10.4 交易数量异常

当交易极少或异常频繁时：

- 明确提示样本量或交易频率风险。
- AI 解释可能原因。
- 允许用户检查周期、条件、手续费和仓位设置。

### 10.5 回测失败

- 在 Conversation 中保留失败的回测状态。
- 提供用户可理解的失败原因。
- 提供重试、修改规则或修改回测范围的入口。
- 不把失败记录展示为有效结果。

### 10.6 数据不完整或延迟

- 展示实际可用的数据区间。
- 标记缺失、延迟或中断。
- 如果数据问题可能使结果不可信，应阻止输出确定性结论。

### 10.7 结果异常优秀

出现异常高收益、异常低回撤等结果时：

- 不使用庆祝式表达。
- 主动提示检查样本量、费用、杠杆、强平、数据范围及潜在偏差。
- 不直接建议实盘。

### 10.8 用户方向完全改变

AI 说明新想法与当前 Strategy 的核心研究问题不同，并提供：

- 直接替换当前 Strategy，原有已回测状态继续保留在 Strategy History
- 新开 Conversation，保留两套独立 Strategy

由用户决定。

### 10.9 网络中断或退出

- 保留用户已经提交的策略与回答。
- 用户重新进入后恢复到最新有效状态。
- 不重复创建相同 Replay。

---

## 11. 状态与业务关系

### Strategy Conversation 状态

- Current
- Researching
- Has Insight
- Archived

### Strategy 当前状态

- Tested：当前 Strategy 已形成历史策略节点并至少关联一条 Replay
- Modified：存在未回测修改
- Restored：从历史节点恢复，尚未重新回测
- Running：当前策略正在回测
- Has Replay：已形成新的 Replay

### Backtest 状态

- Waiting for Clarification
- Waiting for Confirmation
- Ready
- Running
- Completed
- Failed
- Cancelled

所有状态都需要对应明确的用户可执行下一步。

---

## 12. Conversation 内反馈

MVP 不为回测设计独立的全局任务中心或通知流程，关键反馈直接保留在对应 Conversation 中：

- 回测完成：动态进度结束，输出 Replay 卡片；用户仍在当前会话时自动打开右侧 Replay。
- 回测失败：在原进度位置说明原因，并提供重试或修改入口。
- AI 修改 Strategy：展示修改内容并标记“存在未验证修改”。
- Runner 下载准备结果：在触发下载的位置给出明确反馈。

用户离开后可从左侧 Conversation History 返回，查看已经保留的过程消息和 Replay 卡片。MVP 不依赖全局 Strategy 列表定位结果。

---

## 13. 埋点与产品指标

### 13.1 核心漏斗

1. 访问 Landing
2. 输入策略
3. 点击发送
4. 完成登录
5. 完成 Clarify（如有）
6. 首次回测完成
7. 开始 Replay
8. 完成 Replay 或查看关键节点
9. 查看 AI Insight
10. 确认并运行新回测
11. 查看新 Replay，或询问 Agent 分析新旧结果
12. 生成并下载 Runner 包
13. 再次研究

### 13.2 核心指标

- Landing 到策略提交转化率
- 登录完成率
- Clarify 触发率、完成率和退出率
- 首次回测完成率
- Time to First Insight
- 3 分钟内获得首次有效反馈的比例
- Replay 启动率与关键节点查看率
- AI Insight 后的下一步行动率
- New Conversation 启动率
- Conversation History 展开率与历史会话恢复率
- 右侧 Strategy / Replay Panel 打开率
- Strategy 修改后再次回测率
- 每个 Strategy Conversation 的 Replay 数量
- 历史 Strategy 恢复率
- 新策略 Conversation 创建率
- AI 建议接受、修改和拒绝率
- Runner 下载率
- 7 日与 30 日再次研究率

### 13.3 质量与护栏指标

- 策略理解纠正率
- 回测失败率与失败原因
- No Trades 比例
- AI Explain 有用性反馈
- AI 解释与实际规则不一致的反馈
- 异常结果告警比例
- 单次有效研究闭环的产品成本

在获得真实基线前不设置虚构的目标数值。

---

## 14. 风险与信任要求

### 14.1 研究透明度

每个结果必须能追溯到：

- Strategy Design.md
- 本次执行使用的历史策略节点
- 市场与交易标的
- K 线周期
- 数据时间范围及最新时间
- 初始资金
- 仓位与杠杆
- 手续费、滑点及合约成本假设
- 具体交易事件

### 14.2 AI 边界

- AI 不保证收益。
- AI 不把历史回测描述成未来结果。
- AI 不虚构数据、交易或验证结论。
- 未经过回测的新建议必须标记为待验证。
- AI 修改 Strategy 时必须明确修改内容。
- AI 不得静默覆盖 Replay Record 或其关联的历史策略节点。
- Replay Record 一旦生成不可被后续修改覆盖。

### 14.3 模拟与实盘边界

- 历史回测、模拟运行和真实交易必须持续清晰区分。
- 产品默认模拟运行。
- 实盘必须主动开启。
- 高杠杆、强平和资金风险必须明显提示。

---

## 15. MVP 验收主场景

### 场景 A：明确策略直接验证

用户输入一条包含标的、周期和进出场条件的策略后，无需多余 Clarify 即可完成回测，并进入 Replay 查看关键交易解释。

### 场景 B：模糊策略需要 Clarify

用户输入“BTC 跌了就买”，AI 询问关键下跌定义，用户回答后完成规则整理和回测。

### 场景 C：多周期合约策略

用户输入使用 4 小时趋势与 15 分钟入场信号的合约做多/做空策略，产品能准确展示两个周期的作用、杠杆、交易结果和 Replay。

### 场景 D：AI 主动修改策略并生成新历史节点

AI 发现当前策略在震荡期连续亏损，说明证据并提出增加趋势过滤。用户查看设计逻辑变化并应用修改后，AI 同步更新 Strategy Design.md 与 Strategy Code Files，Strategy 标记为未验证。用户确认并完成回测后形成新的历史策略节点和 Replay，AI 自动生成名称、变化摘要、结论与局限。

### 场景 E：修改策略中的关键数值

用户通过 Agent 将均线周期从 20/50 调整为 10/30。AI 同步更新 Strategy Design.md 与 Strategy Code Files，不创建独立 Parameters。确认并完成回测后产生新的历史策略节点和 Replay。

### 场景 F：只修改回测周期

用户将回测范围从最近一年改为最近三年，Strategy Design.md 与 Strategy Code Files 均未变化。重新确认并回测后只在当前历史策略节点下新增 Replay，不新增历史策略节点。

### 场景 G：无交易结果

策略在指定区间没有触发交易，产品解释哪些条件未满足并提供研究建议，不显示普通报错。

### 场景 H：Runner

用户从某条 Replay 发起下载。下载确认展示本次 Replay 关联的历史 Strategy 节点，产品取用该节点的 Strategy Code Files 生成下载，不把 Replay 本身作为构建对象，也不新增 Runner 资产。客户端后续交互不属于本 PRD。

### 场景 I：未回测草稿不形成历史节点

用户与 AI 连续修改 Strategy 五次但没有运行回测。系统只保留当前最新 Strategy Design.md 与 Strategy Code Files，不在 Strategy History 中生成五个节点。

### 场景 J：恢复历史 Strategy

用户从 Strategy 左上角切换到历史节点“增加成交量过滤”，或从 Replay 进入其关联节点，点击“恢复为当前 Strategy”。确认后，系统用该节点的 Strategy Design.md 与 Strategy Code Files 覆盖当前 Strategy，但不修改历史节点，不移动其 Replay，也不立即新增历史节点或 Replay。用户继续尝试方向 B 并完成回测后，才形成新的历史策略节点和 Replay。

### 场景 K：独立策略新开对话

用户希望保留趋势突破策略，同时独立研究均值回归。AI 建议新开 Conversation，并将均值回归作为独立 Strategy 创建；原 Conversation 不增加第二个策略。

---

## 16. 发布前检查清单

- 用户无需编程即可完成第一次策略验证。
- 明确策略不会被不必要的 Clarify 阻断。
- Agent 仅在用户已经表达回测意图时执行；条件清晰则直接运行，关键歧义或数据量过大则先 Clarify。
- 用户未指定标的时默认 BTC/USDT，并在 Replay 条件中明确标记为默认值。
- 输入框主操作使用右下角向上箭头发送图标，不显示文字按钮。
- Strategy Design.md 和回测条件可被用户理解和纠正。
- 支持单币种、现货/合约、多空、杠杆、成交量和多周期策略。
- Replay 能完整快速播放，并在关键节点停留。
- Replay 完成后生成会话卡片并自动打开可拖动、可全屏的右侧面板。
- Chart、Timeline、Marker 与 AI Explain 同步。
- AI 能主动提出洞察并修改 Strategy；需要保留独立策略时建议新开 Conversation。
- Strategy、Conversation History、Replay History 与 Runner 下载包的关系不会混淆；Runner 本身不是快照或用户资产。
- 产品明确表达“一个历史策略节点可以关联多条 Replay”，每条 Replay 都能追溯到对应历史策略节点。
- 从 Replay 下载时，打包的是其关联历史策略节点的 Strategy Code Files，而不是 Replay 结果或回测条件。
- 未回测的临时调整不生成历史节点。
- Strategy 详情只读展示渲染后的 Strategy Design.md，不展示 Strategy Code Files 或独立 Parameters。
- 恢复历史 Strategy 只复制 Strategy Design.md 与 Strategy Code Files，不移动 Replay，也不立即创建历史节点。
- 每次成功回测都有只读且可查看完整结果的 Replay Record，并可以进入其关联的历史策略节点。
- 用户侧不出现 V1/V2 或正式版本编号等概念。
- 所有 Replay 均可追溯到当前 Strategy Conversation、关联历史策略节点和回测条件。
- 一个 Conversation 始终只维护一个 Strategy。
- No Trades、失败、数据延迟等状态有完整处理。
- 历史回测、模拟运行与实盘运行有明确边界。
- Runner 下载入口能够明确展示代码来源；客户端交互由技术调研后另行确定。
- 中英文核心流程均可完成。
- 产品不承诺收益，不把异常回测结果包装成成功。

---

## 17. 后续 PRD 拆分建议

本总 PRD 确认后，建议按以下模块继续产出详细子 PRD 或交互稿：

1. Strategy 输入、Clarify 与 Rule Summary
2. Replay Workspace、回测指标、Timeline 与 AI Explain
3. AI Conversation、Strategy 与 Replay History
4. Runner 技术可行性与客户端方案（技术调研后）

其中 Replay、Strategy 与 Replay History 应优先完成详细交互设计，因为它们决定产品核心体验和主要业务对象关系。
