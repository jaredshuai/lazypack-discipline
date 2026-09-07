# 参与者 A：第一轮独立提案
- 参与者：A / requirements-auditor
- 轮次：1
- 状态：submitted
- 已阅读输入与未验证事项

已读：`README.md`、`docs/DECISIONS.md`、`docs/interviews/2026-09-04-founding-interview.md`。已核实本机 skill `setup-matt-pocock-skills`（及同目录模板）、`grill-with-docs`、`triage`、`retro`。未读其他参与者材料、未搜 vault。未验证：Matt 上游仓库是否与本机 skill 字节级一致；`setup-pre-commit` 是否属 Matt（本机有此 skill，描述为 Husky+Prettier，与 6.2 的 biome 默认冲突，下文当非 Matt 流程）。

---

## 1. 访谈证据与判断

**事实（访谈已确认，后条文化）：** 只补 Matt 没管的（访谈 Q5；DECISIONS 1.1）。`/understand-codebase` 为唯一理解入口（Q6；1.2）。两层：固定层 + 项目层，由 `/lazypack-setup` 在 `setup-matt-pocock-skills` 之后编译（Q10/Q18；§2）。角色固定、skill 映射可换（Q15；3.1）。角色表与「允许写」边界（Q20；§3）。规划者长驻 `main`、同时一个执行者、少用 worktree（Q11；3.3）。书记员关票后、清道夫发版前（Q21；3.4）。`docs/agents/roles.md` 由 setup 写（Q22；3.5）。提交/版本/changelog/错误码规范（Q9；§5）。门禁两关 + JS/TS biome、Python uv+ruff+ty（Q14/Q19；§6）。文档以流程为主（Q8；§7）。客户改主意走 `grill-with-docs`（Q13；7.3）。`/lazypack-harvest` 手动、脱敏 issue、走 Matt `triage`（Q27；§8）。讨论章程（Q28；§9）。双仓库去敏（Q26；§10）。第 7 轮后共识稿维护者回「确认」（访谈 L65–L67）。

**已确认的 agent 建议（不是维护者原话，但已拍板，不得因偏好撤销）：** Q9 大厂规范清单；Q11 少 worktree 的前提；Q12/Q17「一个家」表（先用这版，交对抗审查）；Q28 主持人五条边界。访谈整理稿未展开、但已进 DECISIONS 的条文（1.4 单处存活、4.2 状态词、4.3 未登记先问、7.4–7.6 等）来自已确认共识稿，**不能**判为未经授权。

**未定项（DECISIONS L125–L131，事实）：** setup 提问清单与模板；书记员/清道夫专用 skill；7.2 对子；§4 表与 6.2 组合复审；微信/鸿蒙平台段模板。

**本次新增（维护者补充，尚未入固定层）：** 突出 lazy；要有类似 Matt setup 的 skill 把纪律编译进目标项目；后续派工提示词须钉死成果路径并防同名冲突。

**非批准项（独立判断：首版不需要）：** 三层架构、独立 CLI、fast/full 门禁、四份 YAML、日常强制预览。理由：访谈确认的是两层 + 一个 skill 编译器；Matt setup 本身是 prompt-driven、探完再问、草案确认后写盘，不是 CLI/YAML。6.1 已是「格式+lint+类型+测试」一关 hook，再拆 fast/full 是加重量。日常预览闸门会把 lazy 变成啰嗦。

**固定层修订提案（只提案，不改条文）：** 2.3 目前是产出清单，未写编译 UX。建议补「先探测、只问推不出来的、推荐答案可一字接受、写盘前确认一次、不重复 Matt 已问项」。角色、路径、门禁内容不动。

---

## 2. 完整大方案：突出 lazy，保留已确认地基

**产品一句话：** 用户在目标仓库先跑 Matt setup，再跑一次 `/lazypack-setup`。AI 读固定层、探测仓库、用默认值填项目层，只把真正分叉的问题抛给用户；确认草案后写入最少文件。之后日常工作仍走 Matt 流水线，本包只在旁路提供角色边界、放哪、提交/发版、门禁和变更退场。

### 2.1 lazy 用户体验

| 阶段 | 用户输入 | AI 自动 | 只能用户答 |
|---|---|---|---|
| 前置 | 调用 `setup-matt-pocock-skills` | Matt：探测 remote/AGENTS 或 CLAUDE、tracker、triage、单/多 context；推荐答案；草案确认后写 `docs/agents/issue-tracker.md` 等 | tracker 选择；triage 标签是否用默认；若根上两者皆无则选 AGENTS 或 CLAUDE（Matt 步骤 4，已核实） |
| 本包 | 调用 `/lazypack-setup` | 若缺 Matt 产物则**停**并让用户先跑 Matt，不代做。探测语言、已有 lint/format/测试/hook、已有 CODING_STANDARDS/RELEASE/ARTIFACTS/roles。套 6.2 默认。生成草案 | 与默认冲突时（已有 ESLint 是否改 biome）；错误码是否启用（5.6）；打包平台（微信/DevEco/npm/无）；非 JS/TS/Python 的工具链；既无 AGENTS 也无 CLAUDE 且 Matt 未跑完时不替用户选 |
| 日常 | 意图 / 票 / 审查请求 | 规划→调查→执行→审查走现有 Matt skills；门禁由 hook + 条文双关；书记员/清道夫按事件 | 客户改主意、难逆转取舍、未登记产物认亲、对抗审查僵局 |
| 收割 | 手动 `/lazypack-harvest` | 脱敏 issue 到公开仓，标签 `harvest`，交给 Matt `triage` | 是否触发；issue 是否可公开 |

对齐已核实的 Matt setup：`disable-model-invocation` 式**用户显式调用**；一节一问、推荐答案打头；探测已结算则跳过；写前展示草案可改；重跑仅在换平台/换工具链/从头来，不每次把用户再盘问一遍。

**不自动：** 不创建空 `CONTEXT.md`/ADR（Matt `domain.md`：缺了就静默继续，术语决议时才懒创建——已核实）。不重写 issue-tracker/triage-labels/domain。不跑 `setup-pre-commit`（Prettier/Husky 与 6.2 冲突）。不改来源项目、不改固定层条文。

### 2.2 最小可用 setup 契约

**输入：** 目标 git 仓库；本包固定层（setup 实现里嵌条文或指向已安装的 lazypack 副本）；用户显式调用。零问卷起步。

**输出（2.3 已列，首版只写这些）：**

1. 同一份常驻规则（已有则改，不平行新建）里追加纪律指针 + 每会话必踩短条（1.3、4.1 末行、6.4）。Matt 的 `## Agent skills` 块只更新指针，不复述。
2. `CODING_STANDARDS.md`：仅工具查不了的；能进 lint 的不写（6.3）。
3. `RELEASE.md`：固定段摘自 §5 + 平台段（可很薄）。
4. `docs/ARTIFACTS.md` 骨架 + 状态词说明（4.2），不预填假产物。
5. `docs/agents/roles.md`：立项映射表（3.5）。
6. 提交前 hook：只接**已存在**的 format/lint/type/test 命令；缺的记「未接线」到指针区，不虚构工具链。

**不必写：** CONTEXT/ADR/HISTORY/research、CLI、YAML、harvest skill、书记员/清道夫 skill、完整微信/鸿蒙上传剧本。

**重复运行：** 再探测 → 草案 diff → 用户确认后改。不静默覆盖用户后写段落。换 tracker 仍归 Matt setup。

**失败恢复：** 写盘中断则再跑；已写文件当现状。Matt 未完成则硬停。工具失败如实报（7.6），不跳步拼凑。

### 2.3 与 Matt 配合（避免重复建设）

Matt 已覆盖：想法→规格/票→实现+TDD→审查→retro；tracker/triage/domain 布局；CONTEXT/ADR 懒创建。本包只补：角色防撞车、产物家与登记册、提交/SemVer/changelog、平台发版、双关门禁、客户目标退场、harvest、讨论章程。

`roles.md` 只**指向** `grill-with-docs`/`to-spec`/`to-tickets`/`understand-codebase`/`implement`/`tdd`/`code-review`/`retro`，不复制其步骤。书记员暂用 retro 文档部分（3.5 已写「暂无专用 skill」）。harvest 产出必须能进 Matt triage 状态机，不自建第二条分诊。

### 2.4 保留 / 修订 / 默认值 / 实现

见文末表。流程地基（角色、两层、Matt 之后编译、门禁两关、放哪、harvest、章程）**全部保留**。突出 lazy 靠 setup 行为，尽量不拆已确认条文；仅 2.3 建议补 UX 句。6.2、平台段薄模板是项目默认值。skill 形态、探测顺序、hook 是否 husky，是实现选择。

---

## 3. 用户操作示例

```
用户：/setup-matt-pocock-skills
AI：GitHub remote、无 CLAUDE、有 AGENTS、有 triage。建议 GitHub issues、默认标签、single-context。
用户：好
AI：展示草案 → 写入 docs/agents/*.md 与 AGENTS.md 的 Agent skills 块

用户：/lazypack-setup
AI：Matt 产物齐全。检测到 TS + 已有 biome + 测试脚本、无 RELEASE。默认：biome 门禁、错误码关闭、无打包平台。
用户：错误码开；平台 npm
AI：展示将改的 AGENTS 指针、CODING_STANDARDS、RELEASE、ARTIFACTS 骨架、roles.md、hook 命令列表
用户：写
AI：写盘。未接线项：无。以后改平台再跑一次。
```

冲突例：已有 ESLint。AI 不擅自改 biome，问一句（推荐保留现状并写入项目层，或迁到 6.2）。

---

## 4. 最小交付物（本讨论收口后）

本仓：`skills/lazypack-setup/SKILL.md` + 生成模板（AGENTS 指针块、CODING_STANDARDS、RELEASE 固定段、ARTIFACTS 骨架、roles.md、hook 片段）。不改 `docs/DECISIONS.md` 除非本讨论按 §9 通过 2.3 修订。README 已预告该 skill（README L8、L17），实现后去掉「待写」。

---

## 5. 实施阶段（供指挥者派工）

每张票的提示词必须含：唯一成果路径、禁止写入列表、已存在则停止不覆盖、不 git push。目录建议：`docs/reviews/2026-09-05-lazy-setup/work/<阶段>-<角色>/`，文件名含阶段与角色，禁 `round-1.md` 等与本讨论撞名。

| 阶段 | 执行 | 审查 | 文档收尾 | 验收 |
|---|---|---|---|---|
| S1 契约 | 把提问清单、探测项、输出模板写成 skill 规格（本仓 `docs/` 或 skill 草稿） | 对照访谈+DECISIONS+Matt setup，查重问/重写 | 规格里标事实 vs 建议 | 缺 Matt 则停；不问 tracker；输出集合=§2.2 |
| S2 实现 setup | 只写 `skills/lazypack-setup/**` | 另一 AI 用虚构仓库走示例 | README 去「待写」 | 重复运行出 diff 不强盖 |
| S3 自用一次 | 可选：维护者指定**非来源**试验仓 | 查未登记空文件、与 Matt 文件是否打架 | 试验笔记去敏进 reviews | 来源项目仍不动（访谈 Q7） |
| S4 harvest | **延后** | | | |
| S5 平台模板/书记员 skill | **延后** | | | |

指挥者不投票不提案（9.2）。实现 AI 不得改 DECISIONS。

---

## 6. 应明确延后

harvest skill；书记员/清道夫专用 skill；7.2 对子；微信/鸿蒙完整上传剧本（setup 只留空平台段或 npm 薄段）；§4/6.2 对抗复审可另开议题，不绑在首版 setup；CLI、三层、YAML、fast/full、空 CONTEXT。

---

## 7. 风险与未决

- 2.3 产出清单 vs 更懒的「缺条件就跳过」：跳过 hook 是否算未完成 setup，需维护者裁（见 A-02）。
- 常驻文件 Matt 选 CLAUDE、本包条文写 AGENTS：1.3 已说取已存在者，实现必须跟 Matt 的选择，条文不必改。
- 本机 `setup-pre-commit` 易被误用，skill 正文应点名不要调用（未验证其是否 Matt 官方）。
- 固定层副本如何进目标仓：拷贝 DECISIONS 会违 1.4；建议指针指向已安装 skill/包版本，具体安装渠道未定。
- 「类似 Matt setup」已按本机 skill 核实；若上游不同，S1 审查须再对一次。

---

## 候选提案表

| 编号 | 结论 | 证据 | 类型 | lazy 收益与成本 |
|---|---|---|---|---|
| A-01 | 保留两层、Matt 之后才编译、角色/放哪/提交/门禁/harvest/章程 | 访谈 Q5/Q10/Q18/Q20/Q28；DECISIONS §1–§10 | 保留 | 收益：不重开已拍板地基。成本：无 |
| A-02 | 给 2.3 补探测→少问→草案确认→写盘；不重问 Matt 已结算项 | 本次维护者「突出 lazy」；Matt setup 步骤 1–3（已核实）；2.3 现仅清单（DECISIONS L21） | **固定层修订提案** | 收益：setup 从填表变成几乎回车。成本：开一次 §9；条文变长数行 |
| A-03 | 不采纳三层、CLI、四 YAML、fast/full、日常强制预览 | 访谈无；README L5–L8 两层；6.1 已是单 hook | 实现选择（否决） | 收益：首版可跑。成本：无（放弃未批准复杂度） |
| A-04 | setup 写盘前确认一次；日常执行不再加预览闸 | Matt setup「Confirm and edit」已核实；非批准项「每次预览」 | 实现选择 | 收益：防没问完就写（访谈 Q2）。成本：setup 多一拍，可接受 |
| A-05 | 缺 Matt 产物则硬停，不代跑 Matt setup | DECISIONS 2.3「在 setup-matt-pocock-skills 之后」 | 实现选择 | 收益：零重复建设。成本：用户必须调两次 skill |
| A-06 | 不在 setup 创建 CONTEXT/ADR/HISTORY | Matt domain.md「不存在则静默」已核实；4.1 是「家」不是「此刻创建」 | 实现选择 | 收益：真 lazy。成本：空仓看起来「没装完」，用指针解释 |
| A-07 | 6.2 工具组合作默认；与现状冲突则问，不暗改 | Q19；DECISIONS 2.4、6.2；未定项含 6.2 复审 | 项目默认值 | 收益：JS/Python 可零问。成本：异栈仍要问 |
| A-08 | 错误码、打包平台列为仅有的必问分叉（无则默认关/无平台） | 5.6、5.7、Q10 | 项目默认值 | 收益：问≤2。成本：微信/鸿蒙首版平台段很薄 |
| A-09 | hook 只接已有命令；不调用 setup-pre-commit | 6.1；setup-pre-commit 用 Prettier（本机，**未验证**是否 Matt） | 实现选择 | 收益：不把绿仓弄红、不打架。成本：无工具的仓门禁是软的 |
| A-10 | 产出文件以 2.3 六项为上限 | DECISIONS L21 | 保留 | 收益：最小闭环。成本：登记册骨架几乎空 |
| A-11 | harvest、书记员/清道夫 skill、7.2、完整平台剧本延后 | DECISIONS 未定项 L127–L131 | 保留（范围裁剪） | 收益：首版只做一个 skill。成本：自提炼环首版没有 |
| A-12 | §4 表先用，不在本议题重审 | Q17；未定项说另审 | 保留 | 收益：不扩大本次会议。成本：表可能偏全 |
| A-13 | 派工提示词钉路径、禁覆盖、禁写他人目录 | 本次维护者补充；9.5 留档 | 实现选择（元流程） | 收益：防撞车。成本：主持人多写约束 |
| A-14 | lazypack-setup 用户显式调用，不对模型自动触发 | Matt setup frontmatter `disable-model-invocation: true` 已核实 | 实现选择 | 收益：避免半截写入。成本：不会「装到就生效」到零调用；「装好」=调用过一次 |
| A-15 | 目标仓不复制整份 DECISIONS，只指针+编译结果 | 1.4 单处存活；2.1–2.2 | 实现选择 | 收益：无复述。成本：安装渠道未定，S1 须写清 |
