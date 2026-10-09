# SpeakQuant 落地页改造 PRD

> Draft V3.0 · 2026-09-20 · 主体英文文案已确认，其余页面需求按既有范围执行\
> 产品名：SpeakQuant · 域名：speakquant.com\
> 关联：[产品决策](./产品决策.md)、[MVP PRD](./Trade%20Lab%20MVP%20PRD.md)

**本轮按用户提供的英文定稿更新落地页主体，沿用现有页头、页脚、配色和排版结构。** 保留真实研究输入框、四个快捷示例及下方三列研究流程。独立价格页、协议及联系信息仍属于此前确认的公开站点范围，本轮不重新设计其布局。

持续有效的规则：未登录默认英文，手动语言选择优先；选择套餐后直接进入支付，不增加二次确认；首发不提供 Runner。

## 1. 主体内容与排布

~~~text
[沿用现有页头]

                  主标题，两行
                  副标题
             [现有真实研究输入框]
       [Trend] [Breakout] [Reversal] [Timeframes]

HOW IT WORKS
研究流程标题
研究流程引言

01                         02                       03
DEVELOP YOUR HYPOTHESIS     BUILD & BACKTEST          ANALYZE & ITERATE
第一步说明                 第二步说明               第三步说明

SpeakQuant is research software.
业务边界说明

[沿用现有页脚]
~~~

首屏沿用居中的标题、输入框与示例卡；研究流程沿用左对齐的标题、引言与三列说明。末尾业务边界说明位于三列流程之后、页脚之前，使用正常可读的次级正文，不做警告弹窗或大色块。

### 1.1 英文文案定稿

以下逐字采用用户提供的内容，替代此前各版英文建议。方括号表示输入框或示例控件，不作为页面文本显示。换行是排版参考，窄屏可自然折行，不删减内容。

~~~text
Test your trading idea
in 3 minutes.

Turn an idea into a testable strategy,
backtest it on historical data, and understand why it worked — or didn't.

[ Describe an idea, observation, or question... ]

[Trend] [Breakout] [Reversal] [Timeframes]


HOW IT WORKS

Turn trading ideas into testable strategies — without writing code.
Discuss an idea with AI, backtest it on historical market data,
analyze the results, and iterate — all in one research workspace.


01
DEVELOP YOUR HYPOTHESIS

Start with an idea, observation, or question.
AI helps clarify the logic and turn it into
a testable trading hypothesis.


02
BUILD & BACKTEST

AI turns the hypothesis into strategy code
and tests it against historical market data.
No coding or trading account connection required.


03
ANALYZE & ITERATE

Replay trades, understand what worked and failed,
then refine the hypothesis, test again,
and compare the results.


SpeakQuant is research software.
We do not hold customer funds, execute trades,
or provide brokerage services.
~~~

### 1.2 设计落位

| 区域 | 处理方式 |
| --- | --- |
| Hero 标题 | 按现有主标题样式显示英文两行；中文 Slogan 保持“3 分钟，验证你的交易想法。” |
| Hero 副标题 | 替换现有介绍文字，说明形成策略、历史回测与结果理解；沿用当前正文宽度与层级 |
| 输入框 | 保留现有组件、发送箭头、草稿与提交行为；占位提示替换为定稿内容 |
| 快捷示例 | 保留四张卡片的视觉和交互，英文标签改为 Trend、Breakout、Reversal、Timeframes |
| 方法段标识 | 将现有“01 — RESEARCH, WITH CONTEXT”替换为 HOW IT WORKS |
| 方法段标题与引言 | 使用定稿，不再叠加“Your AI partner”等旧标题或第二套解释 |
| 三列 | 保留现有 01／02／03 编号、标题、说明的层级；使用定稿大写标题和对应正文 |
| 业务边界说明 | 在三列之后单独呈现用户提供的三行声明；不放进步骤卡片，不与流程引言混在一起 |
| 页头、页脚与整体排版 | 沿用当前设计；既有价格、协议和联系入口的补齐按其独立需求执行 |

主体按“讨论出假设 → AI 实现并回测 → 分析、调整与再次验证”表达完整研究过程。三列直接可读，不设计点击切换、自动轮播、截图演示或模拟工作台。此次定稿不增加额外的主体营销按钮。

### 1.3 中文配套译文建议

英文已确认，以下中文作为同义本地化建议，不改变已确认的中文 Slogan：

| 位置 | 中文建议 |
| --- | --- |
| Hero 副标题 | 把想法变成可验证的策略，用历史数据回测，并理解它为何有效，或为何失效。 |
| 输入占位 | 描述一个想法、市场观察或问题…… |
| 示例 | 趋势跟随／放量突破／趋势反转／多周期策略 |
| 方法段标识 | 研究流程 |
| 方法段标题 | 把交易想法变成可验证的策略，无需编写代码。 |
| 方法段引言 | 与 AI 讨论想法，用历史行情回测、分析结果并持续迭代，在同一个研究工作台完成。 |
| 01 标题与正文 | **形成交易假设**：从一个想法、市场观察或问题出发。AI 帮你梳理逻辑，形成可验证的交易假设。 |
| 02 标题与正文 | **生成策略并回测**：AI 将假设转化为策略代码，并用历史行情进行回测。无需编写代码，也无需连接交易账户。 |
| 03 标题与正文 | **分析并迭代**：回放交易，理解哪些有效、哪些失效，再调整假设、重新回测并比较结果。 |
| 业务边界 | SpeakQuant 是研究软件。我们不保管客户资金、不执行交易，也不提供经纪服务。 |

## 2. 核心交互与响应式

### 2.1 输入与快捷示例

~~~text
点击示例 → 填入完整想法 → 可继续编辑 → 发送
已登录：进入工作台，沿用现有研究流程
未登录：先登录，成功后携带原始输入继续研究
~~~

示例是研究起点，不自动提交或执行回测。英文标签与预填想法必须匹配：

| 标签 | 建议预填内容 |
| --- | --- |
| Trend | Explore a BTC trend-following strategy when a short moving average crosses above a long moving average. |
| Breakout | Explore BTC breakouts above recent highs with rising volume. |
| Reversal | Explore a BTC trend reversal when momentum weakens after a sustained move. |
| Timeframes | Explore daily trends together with hourly signals. |

Reversal 对应趋势反转，不沿用原 Mean reversion／均值回归的预填内容。以上预填为建议，正文说明和定稿标签的含义不得错配。模糊条件由既有澄清与确认流程处理。

空输入不能发送；发送中防止重复提交；登录取消或提交失败保留草稿。每次实际回测仍需要确认策略与回测条件。文案中的“无需连接交易账户”适用于首发历史研究，不增加真实交易或 Runner 功能。

复用现有共享输入组件，落地页占位提示与示例可单独配置；不因本轮主体文案调整而强制改变工作台自身的文案。

### 2.2 导航与返回

沿用现有页头、页脚和对应跳转。价格进入独立页面，协议与联系信息公开可达；从登录或支付查看协议时保留原操作。返回首页时保留未提交草稿。已登录用户仍能查看公开页面，主动进入工作台才进入 New Conversation。

原先文档新增的“Start researching ↑”不是本次定稿内容，不作为额外开发要求。现有页面导航或工作台入口不因这份主体文案被重新设计。

### 2.3 语言

未登录且没有手动设置记录时默认英文；手动选过语言时优先恢复，刷新、再次访问及退出登录后继续保留。不按浏览器语言或 IP 自动切中文。

已登录沿用现有语言设置；没有偏好记录的新浏览器或清除站点数据后默认英文。旧实现自动写入的中文默认值不能当作手动选择。

### 2.4 手机布局

保持现有响应式规则：输入框使用可用宽度，四个示例按 2×2 排列；三步流程按 01 → 02 → 03 纵向排列。所有英文正文完整保留，标题允许自然折行，不缩小到难以阅读。

软键盘出现后，输入和发送入口仍可见；菜单和页脚链接保持可用；业务边界说明在流程后正常换行。桌面与手机使用同一份文案，不另写简化版导致含义变化。


## 3. 独立价格页

复用现有定价组件与视觉，不重新设计一套套餐。页面使用公共顶栏和页脚，中间直接呈现套餐，下面补充积分、续费、取消和退款说明。

~~~text
┌─────────────────────────────────────────────────────────────────┐
│ SpeakQuant                            Pricing  EN⌄  Sign in      │
│                                                                 │
│                 Choose your research plan.                      │
│        Strategy research, backtesting, Replay and AI insights.   │
│                                                                 │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ │
│  │ Free             │ │ Pro              │ │ Max              │ │
│  │ USD 0 / month    │ │ USD 30 / month   │ │ USD 100 / month  │ │
│  │ 300 credits      │ │ 3,000 credits    │ │ 13,000 credits   │ │
│  │ [plan benefits]  │ │ [plan benefits]  │ │ [plan benefits]  │ │
│  │ [Start research] │ │ [Choose Pro]     │ │ [Choose Max]     │ │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘ │
│                                                                 │
│  How credits work                                               │
│  Billing, cancellation and refunds                              │
│  Questions? Contact us →                                        │
│                                                                 │
│                         Shared footer                           │
└─────────────────────────────────────────────────────────────────┘
~~~

图中数字来自现有静态预览，不等于正式售价已经确认；权益位置填入实际批准的内容。套餐名、价格、额度、权益、按钮依次排列，桌面三卡并列、按钮对齐；手机纵向排列，不用横向滑动。

**核心购买流程：**

~~~text
已登录：选择套餐 → 支付页面
未登录：选择套餐 → 登录 → 直接进入所选套餐的支付页面
~~~

| 操作或状态 | 用户看到什么 |
| --- | --- |
| 选择 Free | 进入现有研究入口，沿用原登录规则 |
| 选择已开放付费套餐 | 按钮短暂显示处理中，然后打开支付；没有额外订单确认页 |
| 已持有该套餐 | 真实“Current plan”状态及管理订阅入口；访客不默认显示“当前 Free” |
| 支付未开放 | 按钮显示“Coming soon”，可用的研究入口保留 |
| 无法打开支付 | 按钮恢复，下方提示重试；保留套餐选择 |
| 取消登录或支付 | 返回价格页，可继续原套餐；不清空研究草稿 |
| 支付返回、尚未确认到账 | 显示确认中；确认成功后提供进入工作台入口，失败时提供重试或联系支持 |

套餐、币种与周期在价格卡和支付页说明。当前没有正式规则的年付、折扣、试用、无限使用等不添加。积分加购沿用工作台能力，公开价格页只补清楚说明和入口。

## 4. 协议与联系页面

隐私、服务条款、退款与取消使用同一阅读模板：**公共顶栏 → 标题和更新日期 → 单列正文 → 公共页脚**。正文宽约 720px，手机使用可用宽度。

页面公开可直达，不要求登录，不用弹窗承载长协议。从登录和支付流程查看协议时保留原操作页面；普通页脚进入后可后退返回。

Contact 页面直接展示真实运营主体、品牌与主体关系、支持邮箱和适用联系信息。邮箱可点击发邮件，不额外做无人维护的客服聊天或空表单。

## 5. 验收重点

1. 第一眼看到已确认 Slogan、业务说明与真实输入框；向下能理解 AI 参与构思、策略实现、回测、分析和迭代的完整研究过程，知道模糊想法也能作为起点，回测结果可以继续推动下一轮研究；没有额外的截图／交互演示模块。
2. 点击示例、修改、发送、登录恢复均沿用现有流程；用户能快速进入工作台。
3. 价格入口明显；独立价格页复用现有组件，选择套餐后直接进入支付。
4. 协议与联系信息公开可达，实际主体、价格、权益及规则一致。
5. 默认英文与手动语言设置符合第 2.3 节；手机输入、菜单、价格和协议可读可操作。

## 附录：上线前需要补齐的内容

以下是配套工作，不转化成首页上的复杂模块。

| 项目 | 要求 |
| --- | --- |
| 正式计费 | 确认价格、免费额度、积分消耗与有效期、失败任务扣费、续费、税费、升降级、取消、退款和支付后开通规则 |
| 隐私政策 | 根据真实账号、对话、策略、日志、支付相关数据及 AI／基础设施供应商，说明用途、保存删除、第三方处理、用户权利与联系方法；不编造数据承诺 |
| 服务条款 | 真实主体、服务范围、账户、付费交付、知识产权、研究局限、终止与争议规则 |
| 退款与取消 | 分别说明停止续费与退款的操作、条件、期限及权益影响，并有实际可用入口 |
| 主体与支持 | 使用真实运营／签约主体和已验证邮箱；不把香港银行账户当作香港公司，不发布占位信息 |
| 业务一致 | 首发不提供 Runner，核对前后端入口与下载能力；未来加入后重新确认支付准入并更新公开内容 |

SEO 首发基础：

- 推荐英文根路径、中文 /zh-CN/；价格、政策、联系页面具有对应语言地址。手动偏好可决定默认首页的去向，但同一语言 URL 保持内容稳定，中文直链可访问。
- 业务说明、价格、政策和链接在初始页面内容中可读取；配置每页标题、描述、正确语言、规范地址、语言对应关系、分享图及 sitemap。正式域名不遗留 localhost。
- 工作台、私人会话、账户与支付流程不进入公开索引；访问权限通过鉴权保护。无效页面正确返回不存在状态。
- 后续有完整研究指南时再开放内容入口，不为 SEO 先堆空页面或公开私人策略。

沿用现有视觉、输入与定价组件；只统计理解转化所需的访问、研究提交、登录、Replay 和真实购买事件，不采集策略原文。正式价格、协议与真实支付开通仍是独立依赖，页面完善不等于业务已获支付机构批准。

参考资料（查阅于 2026-09-20）：[YouMind](https://youmind.com/zh-CN/overview)、[Stripe 网站信息要求](https://docs.stripe.com/get-started/checklist/website)、[Creem 审核说明](https://docs.creem.io/merchant-of-record/account-reviews/account-reviews)、[Google SEO](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)。具体准入研究见[支付调研](../../pm/docs/海外支付准入调研-2026-09-20.md)。
