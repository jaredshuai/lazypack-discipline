# 正式采纳第二轮：互评与收敛 — Qoder CLI

日期：2026-09-10。主对手：AGY。已读三席 R1 result.md/evidence.md。本轮不是最终投票，不实施，不改原候选/产品仓/他方 R1。

## 认同与异议

**有据认同（AGY）**：§2.3 拟议在候选基础上增加「在其非受管协作区（Section 3）登记各逻辑区域的实际物理原件映射」（AGY R1 §2.3）。这是最小精确修改：指明承载位置、保持 Section 2 四槽封闭、不引入 PAUSE/BROKEN 等实施细节到固定层条文。我 R1 保留候选是遗漏，本轮接受。

**有据认同（Cursor/Grok）**：§3.4 恢复「事件驱动，不用定时器」（Cursor/Grok R1 §3.4）。实测确认：0.2.0 原文含此句（`docs/DECISIONS.md:39`），delta 变更项 4 引用了旧文但新文未写入，属未申报删除。该句禁止定时器驱动清理，与四步关卡（依赖 Agent 自律、无程序化拦截）配合时尤其重要——若允许定时扫描，在无自动化关卡的阶段等于授权无人值守删除。恢复正确。

**有据异议（Cursor/Grok）**：§2.3 拟议全文过长（含 PAUSE/BROKEN/四槽/原件存在性/「能写才写」共 5 处实施细节），把 `managed-blocks.md` 与 `SKILL.md` 已有契约重复写入固定层条文。固定层 §2.1 定义「固定层：本文件全部条文」——条文应确立跨项目原则，不应复述模板内部节号或决策树分支。PAUSE/BROKEN 保护已由 `SKILL.md:20` 原则 4 与 `managed-blocks.md` §5 覆盖，无需在 §2.3 重复。AGY 的「非受管协作区（Section 3）」已足够表达原则。

**有据异议（AGY）**：§4.1 耐久行「标准推荐」仍把 `docs/work/<feature>/` 写进固定层表行作为推荐落点，但未明确 `issue-tracker.md` 声明才是运行时权威。Cursor/Grok 的「以 issue-tracker.md 声明的实际位置为准」更精确反映地基消费者实际行为（`wayfinder:25`、`code-review:13,29` 读 tracker doc，不读固定层表）。但 Cursor/Grok 的全文对表行而言过长。收敛方案见下方 A 项。

---

## A–E 逐项回应

### A. §4.1 耐久行（主对手 AGY）

**AGY 方案摘要**：「标准推荐：`docs/work/<feature>/`（需核查消费者适配）；保留模式见 `issue-tracker.md`」。
**Cursor/Grok 方案摘要**：以 `issue-tracker.md` 声明为准；未声明沿用 `.scratch/`；`docs/work/` 仅为 1.1 核查通过后的推荐。
**本席 R1**：保留候选「标准默认（需适配）」。

**具体后果比较**（主持要求）：
- 「标准默认」→ 下游项目可合理认为 docs/work/ 已生效，setup 应直接迁入。与 to-tickets:62 写死冲突，产生双权威。
- 「标准推荐（需核查）」→ 明确不是开箱即用，但仍把具体目录字符串写进固定层。若上游未来改写路径，固定层须跟着改。
- 「以 issue-tracker.md 声明为准」→ 运行时权威与地基消费者一致（wayfinder/code-review 读 tracker doc）；docs/work/ 只是项目层可选推荐，固定层不绑定具体字符串。

**未声明时回退与前置双检**：前置双检要求 issue-tracker.md 已存在且有效（`SKILL.md` 第 1 步），否则零写入。所以 setup 阶段不存在「未声明」。Cursor/Grok 的「未声明时沿用 .scratch/」覆盖的是 issue-tracker.md 存在但未显式覆盖路径的情况——此时地基种子模板 `issue-tracker-local.md` 已声明 .scratch/，回退一致，不冲突。

**适配未通过时可继续的流程**：wayfinder（读 tracker doc）✓、code-review（读 tracker doc）✓、spec 回退搜索（docs/ 下可命中）✓；to-tickets 开票 ✗（写死 .scratch/）、ask-matt 叙述 ✗（写死）。即：读票/审查/导航可继续，开票不可。

**本席收敛**：接受 AGY「标准推荐」方向，但增加「以 issue-tracker.md 声明为准」作为运行时权威句，吸收 Cursor/Grok 的精确性而不采用其全文长度。

**拟议表行**：
> | 需求、工单与规格 | 以 `docs/agents/issue-tracker.md` 声明的实际位置为准；标准推荐 `docs/work/<feature>/`（须按 §1.1 核查消费者适配后方可采用）；保留模式见 `issue-tracker.md` | 按保留目的与有效引用判断；关票不自动构成删除授权 |

**与 0.2.0 义务变化**：是。废除「票关闭即删整个目录」；增加声明权威+推荐须核查；具体目录字符串从固定层硬绑定降为项目层声明+固定层推荐。

### B. §2.3 / §4.4 Section 3 与 PAUSE（主对手 AGY）

**AGY 方案摘要**：§2.3 加「非受管协作区（Section 3）」；§4.4 保留候选。
**Cursor/Grok 方案摘要**：§2.3 加 Section 3 + 四槽 + 原件存在性 + PAUSE/BROKEN + 「能写才写」；§4.4 加 PAUSE/BROKEN + 1.1 约束。

**本席判断**：
- 「八区映射写入非受管协作区」是跨项目固定原则（防止受管块正文被非受管内容污染 → fp 变 → 伪 DRIFT）。应入条文。
- 「Section 2 四槽不改」是模板结构细节（`managed-blocks.md:203-207` 已规定），但作为原则的一句否定式（「不改受管登记槽」）可接受。
- PAUSE/BROKEN/原件存在性是 setup 实施契约（`SKILL.md:20`、`managed-blocks.md` §5 已覆盖），不宜重复写入固定层。
- §4.4 的「工单类迁移另受 §1.1 约束」是有价值的交叉引用，一句即可。

**§2.3 拟议全文**（接受 AGY 方向，加一句否定式）：
> 2.3 **编译器** `/lazypack-setup`：在 `setup-matt-pocock-skills` 之后运行，问项目层问题，写出 `AGENTS.md`（或 `CLAUDE.md`）指针、`CODING_STANDARDS.md`、`RELEASE.md`、`docs/ARTIFACTS.md` 骨架、`docs/agents/roles.md`、提交前 hook。写出 `docs/ARTIFACTS.md` 时须读取并登记 `docs/agents/issue-tracker.md`，并在其非受管协作区登记各逻辑区域的实际物理原件映射，不改受管登记槽；无原件不虚构登记行。默认保留既有合理位置（保留模式），并提供迁至标准推荐路径的治理选项（迁移模式）。能接到已有 format/lint/type/test 命令则写出提交前 hook；否则标明未接线或不适用及原因，不得宣称门禁已生效。

**§4.4 拟议全文**（保留候选 + 一句 1.1 交叉引用）：
> 4.4 存量项目的非标路径在初始化时默认保留并在登记册中登记；治理迁移选项触发时，AI 须整体输出源路径至目标路径的映射清单、链接与附件影响评估，经用户整体审阅确认后执行，不逐文件打扰。工单类迁移另受 §1.1 消费者核查约束。

**与 0.2.0 义务变化**：§2.3 是（增加登记+非受管区+不虚构）；§4.4 是（新增条文）。

### C. §3.4 事件驱动（Cursor/Grok 提出）

**本席表态**：支持恢复。理由见上方认同段。delta 变更项 4 引用旧文含此句但新文未写入，属未申报删除，应恢复。

**拟议**：在候选 §3.4 第一句末恢复「事件驱动，不用定时器。」，其余四步关卡文字不变。完整条文见 clauses.md。

### D. §1.1「更新」→「状态更新」（本席 R1 提议）

**本席撤回 R1 提议**。重新核实地基职责：wayfinder resolve 时不仅更新 `Status:` 行，还追加 `## Answer` 内容并更新 `map.md` Decisions-so-far（`issue-tracker-local.md:30`）。「状态更新」会漏掉内容更新与 map 索引更新。原候选「更新」已覆盖全部三类（状态、内容、索引），无需缩窄。保留候选原文。

### E. 日常映射维护权责（AGY 提出）

**本席处理**：沿用现行角色表即可，无需新增条文。依据：§3.1 书记员「允许写」含 `docs/`（覆盖 ARTIFACTS.md）；清道夫「不新增」排除其写登记行；setup 首次编译由 §2.3 覆盖。配套材料（compatibility §2.1、路径表 E02）已明确「setup 首次/书记员维护/清道夫仅读+授权删移」，与条文一致。不默许清道夫新增登记。

---

## 配套勘误残留核实（主持要求「核所有同义残留」）

| 位置 | 残留文字 | 与 Gate 1 一致性 | 处理意见 |
|---|---|---|---|
| default-paths L53 Z08 .out-of-scope 保留分支 | 「绝不删除」 | **不一致**：Gate 1 为「不得当作缓存自动清除…依保留目的与特定授权判断」 | 改为「不得当作可丢弃缓存自动清除；归档或删除依 Gate 1 保留目的与特定授权判断」 |
| scenario-check L161 场景 11 | 「绝对禁止删除 auth/ 目录」 | **边界**：语境为活跃子票存在，Gate 2 已覆盖（活跃→不清理），但绝对句比 Gate 1 更强 | 改为「不得当作缓存自动清除（Gate 2 判定活跃）」 |
| default-paths L52 Z08 ideas 保留分支 | 「已有建议原地保留，绝不删除」 | **一致**：此为 retention-sections.md §1.3 既有契约（「策略切换绝不追溯删除已有历史文件」），非新增固定层义务 | 保留，不改 |
| compatibility L77 Gate 1 | 「绝对禁止当作可丢弃临时缓存自动清除…不制造'绝对永久不可删'的机械教条」 | **一致**：正确表述 | 保留 |
| scenario-check L175 场景 12 | 「绝对禁止当作临时缓存自动清除」 | **一致**：限定为「当作缓存」，与 Gate 1 同义 | 保留 |

compatibility L114「fp 与旧输入吻合」：三席一致同意以 `managed-blocks.md` §5 决策树为准（`current_fp` 对 `header.fp`，`current_input` 对 `header.input`，分别比较）。此句为配套分析文档勘误，不写入条文。

---

## 残余分歧（须第三轮投票前收敛）

1. **§4.1 耐久行文字**：本席拟议「以 issue-tracker.md 声明为准 + 标准推荐 docs/work/（须核查）」vs AGY「标准推荐（需核查消费者适配）；保留模式见 issue-tracker.md」vs Cursor/Grok 全文。差异在于是否把「以声明为准」写进表行。本席认为应写（运行时权威与地基消费者一致）；AGY 认为「保留模式见 issue-tracker.md」已隐含。须第三轮前确认。
2. **§2.3 是否加「无原件不虚构登记行」**：本席与 Cursor/Grok 均支持；AGY 未含此句。这是防止 setup 为不存在文件生成虚假登记行的原则，还是留 SKILL.md 实施？本席认为一句否定式可入条文。
3. **配套文档绝对句修正范围**：本席列 2 处需改（L53、L161）+ 3 处保留；AGY 要求「彻底剔除所有绝不删除/永久不可删」；Cursor/Grok 只关注 .out-of-scope。须确认 ideas L52 的「绝不删除」是否属 retention 既有契约而豁免。
