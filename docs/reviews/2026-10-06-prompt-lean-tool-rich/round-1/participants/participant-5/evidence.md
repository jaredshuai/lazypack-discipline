# 第一轮证据与推理：Participant 5 — 「提示词瘦、工具肥」

> 配套 `result.md` 的推理过程、材料引用与待裁决边界。所有【事实】均可由路径 + 条款号复核；引文为节选，语义以原文为准。

## 1. 阅读材料与核对动作

### 1.1 已读材料（全文或指定重点）

| 材料 | 路径 | 方式 |
|---|---|---|
| 评审提示词 | `docs/reviews/2026-10-06-prompt-lean-tool-rich/round-1/prompts/participant-5.md` | 全文（160 行版本，非 68 行脚手架版） |
| 固定层条文 | `docs/DECISIONS.md`（v0.4.0） | 全文 |
| 产品愿景 | `docs/VISION.md` | 全文 |
| 本仓维护入口 | `AGENTS.md`（仓库根） | 全文（9 行） |
| setup 编译器 | `skills/lazypack-setup/SKILL.md` | 全文 |
| 常驻入口模板 | `skills/lazypack-setup/templates/resident-entry.md` | 全文 |
| 编码标准模板 | `skills/lazypack-setup/templates/CODING_STANDARDS.md` | 全文 |
| hook 模板 | `skills/lazypack-setup/templates/pre-commit.sh` | 全文 |
| 发版模板 | `skills/lazypack-setup/templates/RELEASE.md` | 全文 |
| 角色模板 | `skills/lazypack-setup/templates/roles.md` | 全文 |
| 提交说明检查器正文 | `docs/agents/commit-msg-check.md` | 全文 |
| 文档关系声明 | `docs/agents/doc-pairs.md` | 全文（P1–P8） |
| 防腐检查流程 | `docs/agents/freshness-check.md` | 前 60 行（流程骨架） |
| CI 模板 | `templates/.github/workflows/nightly-mutation-py.yml` | 前 40 行（头注与边界） |
| Issue #36 | `gh issue view 36 --repo jaredshuai/lazypack-discipline` | state=OPEN，labels: enhancement + needs-triage |
| 登记册 | `docs/ARTIFACTS.md` | 定向检索（本议题登记行、检查器登记行、§9 留档段），未通读 |

### 1.2 独立性声明

- 未读取 `round-1/participants/` 下任何其他席位的 result/evidence，未读取 `round-1/participant-1..5/` 下已跟踪桩与任何席位产物（检索命中文件名即止，未打开）。
- 未在 issue #36 发言，未改固定层，未改 setup skill，未提交、未推送。

### 1.3 仓库状态核对

- 提示词要求 `git pull` 确保最新。实际执行 `git fetch origin` 后比较：`git log HEAD..origin/main` 为空（远程无新提交），本地领先 34 个提交，无合并必要。直接 pull 在领先状态下无增益且有无谓合并风险，故以 fetch + 比较完成「确保最新」的意图。
- 工作区既有未跟踪项（`.codegraph/`、根 `round-1/`、`round-2/`）未触碰。

### 1.4 读不到的材料（如实声明）

- **访谈笔记原文**：issue #36 参考栏列「访谈笔记（本轮对话整理稿）」，公开仓 `docs/interviews/` 检索无相关内容；按 §10.2 原始对话应在私有 vault，本轮无访问。**无法判断** Uncle Bob 实测与 Matt 引述的原文准确性，只能按 issue 转述采信。
- **Lost in the Middle 论文原文**（arXiv:2307.03172）：本轮未读原文，仅有 issue 与提示词转述。U 型注意力曲线的适用性论述**需要进一步调研**，故 result.md 中该动机仅作方向性参考，论证锚点改用 §1.4（见 §3.6）。

## 2. 关键事实引用

### 2.1 固定层既有条文（`docs/DECISIONS.md` v0.4.0）

- 导语：「本文件是 lazypack-discipline 固定层的**唯一事实源**。项目层文件（`AGENTS.md`、`CODING_STANDARDS.md`、`RELEASE.md` 等）由 `/lazypack-setup` 从本文件编译得出」——常驻入口是编译产物，内容边界是编译器行为规范。
- §1.3：「只维护一份常驻规则文件（`AGENTS.md` 或 `CLAUDE.md`，取已存在者），不平行写 `.cursor/rules` 复述同一批纪律」。
- §1.4：「每条纪律只活在一处。同一句话不得同时出现在 `AGENTS.md`、`CONTEXT.md`、演变史里」。
- §2.2：「**项目层**：平台怎么打包上传、lint/format/类型工具、验证命令、错误码是否启用」——验证命令（含 CI）的家在项目层。
- §2.3：「能接到已有 format/lint/type/test 命令则写出提交前 hook；否则标明未接线或不适用及原因，不得宣称门禁已生效」。
- §2.4：「项目层默认值可由多 AI 头脑风暴扩展（含技术栈选型），不必开 §9 会议」。
- §4.1 表三行：
  - 「编码标准 | `CODING_STANDARDS.md`，由审查者执行 | 工具能查的条目移进 lint 配置后删」
  - 「给 agent 的按需说明 | `docs/agents/<主题>.md` | 被闸门或工具替代后删」
  - 「`AGENTS.md` | 只放指针 + 每会话必踩的几条 | 超过一屏往下挪」
- §6.1：「提交前 hook 跑：格式 + lint + 类型 + 测试。能写成闸门的纪律先写闸门，再写散文」。
- §6.3：「`CODING_STANDARDS.md` 由审查者在审查时执行；工具能查的不写进去」——与 §4.1 编码标准行近乎互为复述而共存，证明条文体系接受操作句与判据句镜像并存。
- §6.4：「`AGENTS.md` 明写：执行者和审查者都必须跑门禁」——「必踩提示」的条文级先例。
- §7.2：「机器只拦能判断的几条（『改了 X 却没动 Y』），具体对子由项目层定义」。
- §7.5 / §7.6：交接只写验证过的事实；工具调用未达预期如实报告——诚实性约束，无法工具化。
- 未定项：「7.2 中『改了 X 没动 Y』的具体对子」「§4 表与 6.2 工具组合待多 AI 讨论复审」。

### 2.2 编译产物与模板（工具肥的既成事实）

- `skills/lazypack-setup/templates/resident-entry.md`：受管块 = 2 行必踩（「纪律唯一事实源」「双角色门禁要求」）+ 4 条指针（`__ROLES_POINTER__` 等）。**常驻入口已经是瘦形态**。
- `skills/lazypack-setup/templates/CODING_STANDARDS.md` §1：「工具能查的，不写进散文：格式化、语法校验、类型检查由工具执行，本标准不重复复述已被 linter/formatter 覆盖的细则」。
- `skills/lazypack-setup/templates/pre-commit.sh`：四槽门禁（format/lint/type/test），状态机 `wired / missing / n/a / install-failed`，非法状态 fail-closed（`invalid status ... failing closed`）。
- `skills/lazypack-setup/SKILL.md`：核心原则 5「诚实报告门禁……缺命令不虚构，不谎称门禁已生效」；第 2 步探测既有门禁命令；全拒绝分支「绝对不创建 `.githooks/pre-commit`……常驻入口保持原有通用稳定指针文本」。
- `templates/.github/workflows/nightly-mutation-py.yml` 头注：「复制到目标项目，本仓自身不运行该闭环」——CI 模板的定位是项目层装配件。

### 2.3 本仓第四态实践（手动工具、不接闸门）

- `docs/agents/commit-msg-check.md`：「未接 hook、CI 或定时器。格式通过不等于语义已验证……检查器在磁盘上存在、可手动运行，不等于门禁已生效」「本检查器按固定层 §2.4 落在本仓，不改 §5.1，也不升格成所有接入仓的门禁」。对应脚本 `scripts/check_commit_msg.mjs`。
- `docs/agents/doc-pairs.md`：「检查器：`node scripts/check_doc_pairs.mjs`（Node 标准库，只读）……未接 hook、CI 或定时器」。P1–P8 为 §7.2 第一批机器可判对子。
- 登记册中 `scripts/calculate_crap.mjs`、`scripts/test_calculate_crap.mjs` 登记行均注明「手动运行。未接 hook/CI」。

### 2.4 愿景（`docs/VISION.md`）

- 「用户不应反复提醒 AI 更新文档、寻找决策、遵守协作边界」——瘦常驻入口的产品动因。
- 「已经声明、并且能用路径、哈希或正则判定的关系交给机器检查；需要理解含义的影响，由当轮执行和审查处理」——Smart/Dumb Zone 划分的既有表述。
- 「模板应按需求装配……先判断它能否减少重复劳动和实际错误，以及引入的维护成本是否值得」——反对无条件 CI 化的依据。

### 2.5 登记册（`docs/ARTIFACTS.md`，定向检索）

- 本议题登记行（reference，讨论未收束）：「留档路径不一致待裁：README 与五份提示词写 `participants/`（有 s），已跟踪桩在 `participant-N/`（无 s）」。本轮按提示词指定路径 `round-1/participants/participant-5/` 交付。
- 2026-10-06 两段 §9 留档记录确认：participant-1 / participant-5 提示词为真实内容、其余席位未代填、issue #36 草案引文与提示词一致性已经核对（state=OPEN）。

## 3. 关键论证步骤

### 3.1 草案拆解

草案 = 三部分：①工具优先原则；②路由判据（二元）；③常驻入口内容边界 + 迁移指令。与既有条文映射：①≈§6.1+§6.3+§4.1 编码标准行；③≈§4.1 `AGENTS.md` 行；净增量 = 显式判据 + CI 载体提及 + 枚举。**结论：草案通过的价值在判据显式化，不在原则重申。**

### 3.2 判据的两种读法

- 描述式（按现状分类）：「已强制的属工具层」→ 现存提示词规则自动合法，判据无改革力，且与本仓第四态实践矛盾（检查器存在但无强制后果，按描述式两头不靠）。
- 义务式（按意图路由）：「裁定须阻断的规则必须落工具」→ 有改革力，兼容第四态（裁定为不强制 → 不必接闸门，但可用工具）。
- **采用义务式**，替代文本用「必须落进」钉死。

### 3.3 二元 → 三家 + 第四态

- 第二分支「由人工审查判断 → 提示词层」与 §4.1/§6.3 冲突（审查标准文档是独立的家）。推出三家：工具（强制）/ 审查标准文档（语义）/ 常驻+按需提示词（会话行为与导航）。
- 本仓 `commit-msg-check` / `check_doc_pairs` 实证第四态：机械可判 + 不设强制 → 手动工具。若判据否认第四态，则本仓现行实践整体不合规——草案没打算推翻它们（issue 未提），故第四态必须显式合法化。

### 3.4 「机械可判部分」限定词的必要性

混合规则反例：文档同步（检测可拦、修复语义）、命名（形状 lint、达意审查）。若判据按整条规则路由，混合规则在两家都有理有据 → 冲突。按「部分」路由则无冲突，且与 §7.2「机器只拦能判断的几条」的既有口径一致。

### 3.5 章节归属推导

- 候选：新 §11 / 并入 §6 / 并入 §4。
- 排除 §11：与 §1.4 冲突面最大（§6.1、§4.1 需回改引用）；先例是专题并入主题章（§5.7）。
- 排除全并入 §6：判据三个目的地中两个不在「质量门禁」语义域。
- 选 §4 新增 4.5：标题「什么放哪」与判据本质（规则作为东西的家）吻合；4.1 表三行是其直接下位规则；§6.1 保持操作句不动（3a 镜像并存先例：§4.1 编码标准行 ↔ §6.3）。

### 3.6 动机独立于论文

即使 Lost in the Middle 不成立：§1.4（每条纪律只活在一处）+ §1.3（单常驻文件）已逻辑要求「规则不堆常驻文件」。论文动机降级为 ADR/研究素材，条文自足。另：编译产物 resident-entry 短且居头部，「中段退化」病灶描述的是堆规则的现状而非编译产物——注意力论证对本条是辅助不是支点。

### 3.7 实施成本核算

- 模板层：已合规（2.2），无重写。
- 连带同步：doc-pairs P1（快照字节同源）、P2（5 模板来源标识）、P3（版本四处一致）——机械检查会拦住漏同步，成本确定。
- 增量：块外规则扫描（只报告不迁移，受「块外字节不变」与 preserve-first 约束）、CI 问项（可选）。
- 风险项：把语义规则强行 lint 化 → 误报 → `--no-verify` 绕过文化 → 闸门公信力受损（Smart/Dumb Zone 混淆的代价）。「机械可判部分」限定词同时是风险控制。

## 4. 待裁决的边界情况

1. **§5.1 升格问题**：提交头格式机械可判、检查器已存在、本仓裁定不接闸门。4.5 通过后它是第四态样板还是应升格强制，维护者须表态（影响 `commit-msg-check.md`「不升格成所有接入仓的门禁」的既有声明）。
2. **第四态是否入条文**：我写入 4.5；反方论点「过渡态不该固化」存在，第二轮待辩。
3. **§6.1 是否改为引用 4.5**：我主张不动（镜像并存先例）；若第二轮共识为重复，最小合并方案已备（result 3a）。
4. **CI 模板是否进 setup 生成范围**：我主张列未定项；VISION「维护成本是否值得」是裁量依据。
5. **登记册是否新增「工具配置」类别**：我主张不新增（工具配置非文档；操作手册已有「给 agent 的按需说明」类别收纳，本仓 `quality-gates/*.md` 为先例）。
6. **「每会话必踩」条数上限**：我主张不加（§4.1 一屏约束已是硬边界）。
7. **程序项**：留档路径 `participants/` vs `participant-N/` 的统一（登记册已记待裁，15 个已跟踪文件的移动属维护者动作）；本轮交付位置按提示词，不预设裁决。

## 5. 无法判断 / 需要进一步调研

- 访谈笔记原文（Uncle Bob × Matt Pocock 对谈整理稿）：不在公开仓，无法核对「海盗法典」实测细节与 Smart/Dumb Zone 原始表述。
- arXiv:2307.03172 原文：未读，U 型曲线结论按转述采信；不影响本意见结论（见 3.6）。
- 其他宿主（Cursor / Codex / Qoder 等）对常驻入口的实际上下文窗口行为：无实测数据，本轮不引用。
