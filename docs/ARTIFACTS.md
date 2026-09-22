# 本仓文档归属与产物登记册

本文件是维护 lazypack-discipline 本仓时的文档入口，由主持/规划者和执行本次变更的 Agent 维护，不是 lazypack-setup 生成的受管产物。它落实 [固定层 §4、§7](DECISIONS.md) 的本仓落点，不改写固定层，也不代表目标项目已经获得这些能力。

## 1. 内容归属

| 内容是什么 | 唯一正文位置 | 何时更新、由谁处理 |
|---|---|---|
| 产品为什么存在、为用户省什么事、设计取舍原则 | [VISION.md](VISION.md) | 维护者明确产品方向时，主持/规划者在本轮整理更新；建议与已确认方向分开 |
| 已生效的跨项目纪律 | [DECISIONS.md](DECISIONS.md) | 按其 §9 修改；愿景或讨论意见不自动成为生效条文 |
| 对外介绍、如何找到资料 | [根 README](../README.md) | 产品入口或说明变化时更新摘要和链接，不复制完整愿景、纪律或历史进展 |
| AI 开工必须读取的入口 | [AGENTS.md](../AGENTS.md) | 读取条件或资料入口变化时同步指针，详细正文留在对应文档 |
| 本仓文档落点、当前状态与替代关系 | 本文件 | 新增、迁移、取代或归档文档时，由本轮执行者同步登记 |
| setup / harvest 实际执行流程 | 对应 [skill 入口](../skills/) 及其直接引用的 references | 实现行为变化时同步改动并验证；愿景变更不等于 skill 已更新 |
| 技术组合的适用条件与候选默认值 | 对应 skill 的 presets | 配方实施时更新，工具与版本事实须核实，不把案例写成强制选型规则 |
| 访谈的来源、背景、当时的意见 | [interviews/](interviews/) | 经授权保留的去敏整理稿；现行结论链接到权威正文，历史原文不改成今天的决定 |
| 多 AI 提案、互评与主持结论 | [reviews/](reviews/) 按议题归档 | 讨论收束时登记具体入口与采纳状态；集合中的一份报告不自动获得现行权威 |
| 跨 Agent 交付与核验的操作指引 | [agents/handoff-verification.md](agents/handoff-verification.md) | 交接机制变动时维护；每轮临时报告仍按固定层放系统临时目录 |
| 本仓 §7.2 机器对子清单 | [agents/doc-pairs.md](agents/doc-pairs.md) | 对子增删或判定方法变化时由本轮执行者更新；检查脚本只实现清单，不复述 |
| 术语、ADR、演变史、研究、规格草稿、参考素材、编码与发布规则 | [DECISIONS.md §4](DECISIONS.md) 已定义的位置 | 按已有分类执行；路径尚不存在时按任务需要创建，避免预先建空文档 |

## 2. 每轮如何执行

1. **辨认内容和权威。** 先按上表定位，再读对应正文。把用户确认、Agent 推荐、未决问题和验证事实分开。路径已明确且任务已授权时，直接处理，不把文件命名和目录选择再交给用户。
2. **更新正文。** 用户明确的产品方向进入 VISION；仅有讨论的方案留在讨论材料中；实现事实以产品及验收为据。仅为固定层变更提出愿景不能绕过其讨论流程。
3. **同步入口与登记。** 新建或改变正文位置时，同轮更新本册与必要的 README/AGENTS 指针；内容留在一个权威位置，其余引用。对来源明确且本任务授权新建的文档直接登记；对发现的未登记旧材料，仍按固定层 §4.3 核实其权威，不猜测新旧。
4. **处理替代。** 取代某个现行文档时注明新旧关系并更新状态；现有材料按生命周期归档，保留检索入口。移动或删除前核对引用与原有改动，不为整理而清除用户工作。
5. **交付前检查。** 本轮应留存的内容已有落点；新增链接可解析；同类别现行正文唯一；未决建议没有冒充已决定；完成、未实现和未验证分清楚。检查由本轮 Agent 执行，目前没有独立自动检查器保证这些语义。

需要用户判断的是目标、授权、权威冲突或新的分类边界；已有分类能确定的落点由 Agent 负责。不能因提出了新方向就默认保存原始聊天、秘密或私有材料。

## 3. 已核对的入口登记

状态词沿用固定层 §4.2。类别表示权威范围：愿景、执行指引与历史资料不互相替代。集合登记只提供检索入口，不批准所有子文档；未逐项核对的旧材料保持原样，使用前检查其来源与状态。

| 路径 | 类别 | 状态 | 依据与边界 |
|---|---|---|---|
| [VISION.md](VISION.md) | 产品愿景 | current | 2026-09-09 维护者明确方向；实现状态另行验证 |
| [DECISIONS.md](DECISIONS.md) | 固定层纪律 | current | 0.3.0；变更规则由正文自身定义 |
| [ARTIFACTS.md](ARTIFACTS.md) | 本仓文档归属 | current | 本轮补齐的内容分类、维护触发和入口登记 |
| [../AGENTS.md](../AGENTS.md) | 本仓 AI 入口 | current | 本轮新建；只提供读取指针 |
| [../README.md](../README.md) | 对外导航 | current | 仓库总入口；能力说明不代替验收 |
| [agents/handoff-verification.md](agents/handoff-verification.md) | 给 agent 的按需说明 | current | 按固定层 §4.1 迁至 docs/agents/。raw 字节仍是第一权威；可选 git_blob_id 只记录本机 git 规范化结果，拿不到则字段缺席并写明降级原因 |
| [../scripts/handoff_manifest.js](../scripts/handoff_manifest.js) | 本仓执行辅助 | current | 只读生成与核验交接清单。`--include-git-blob` 调用本机 git hash-object，不伪造 blob id。仅换行差异单独分类且仍非通过。未接 hook/CI |
| [agents/doc-pairs.md](agents/doc-pairs.md) | 给 agent 的按需说明 | current | 本仓项目层 §7.2 第一批对子（P1–P5、P8）。不是跨项目固定层 |
| [../scripts/check_doc_pairs.mjs](../scripts/check_doc_pairs.mjs) | 本仓执行辅助 | current | 只读检查上述对子。手动运行。未接 hook/CI。不宣称门禁已生效 |
| [agents/commit-msg-check.md](agents/commit-msg-check.md) | 给 agent 的按需说明 | current | 本仓提交说明格式的只读检查口径（§5.1 标题形状与运行时抽出的 type）。手动运行。未接 hook/CI。格式通过不等于语义已验证。不是门禁 |
| [../scripts/check_commit_msg.mjs](../scripts/check_commit_msg.mjs) | 本仓执行辅助 | current | 只读检查候选提交说明的标题格式。词表从固定层 §5.1 抽取。手动运行。未接 hook/CI。不宣称门禁已生效 |
| [../skills/lazypack-setup/SKILL.md](../skills/lazypack-setup/SKILL.md) | setup 执行入口 | current | 以本仓磁盘正文为准；不代表所有宿主或目标仓实测通过。第 2 步有界扫描的排除目录与敏感文件与 document-routing §2.2、doc_scanner 为同一显式集合 |
| [../skills/lazypack-setup/references/document-routing.md](../skills/lazypack-setup/references/document-routing.md) | 文档路由规范 | current | S1 产物：既有文档 8 大知识区归属规范、原位保留登记与同主题判定；首期 preserve-existing 在当前 AGY/Windows 限定沙箱验收完成（见 §4）。Phase 2 受控迁移规约已合入本文件；通用生产迁移仍 UNPROVEN。§2.2 排除目录与敏感文件与 doc_scanner 为同一显式集合（含 `.DS_Store`；敏感文件为精确文件名或明确前后缀） |
| [../skills/lazypack-setup/scripts/doc_scanner.mjs](../skills/lazypack-setup/scripts/doc_scanner.mjs) | setup 执行辅助 | current | 有界 Markdown 扫描与引用图构建器。证据：Phase 2 主仓应用收尾与本仓只读 scan。已验证：当前 Windows/AGY 隔离沙箱与本仓只读扫描。不代表外部目标仓生产级自动迁移。排除目录含 `.DS_Store`（路径小写化后按 `.ds_store` 匹配）；敏感文件仍为精确匹配 |
| [../skills/lazypack-setup/scripts/doc_plan.mjs](../skills/lazypack-setup/scripts/doc_plan.mjs) | setup 执行辅助 | current | 迁移计划生成器（含双指纹与 Section 3 紧凑表修复）。证据：Phase 2 应用收尾与 fix2 回归。已验证：当前 Windows/AGY 隔离沙箱。不代表外部目标仓生产级自动迁移 |
| [../skills/lazypack-setup/scripts/doc_executor.mjs](../skills/lazypack-setup/scripts/doc_executor.mjs) | setup 执行辅助 | current | 双指纹绑定的受控执行器（含补偿回滚）。证据：Phase 2 应用收尾与 S6 沙箱批次。已验证：当前 Windows/AGY 隔离沙箱。不宣称系统级抗崩溃原子性，不代表外部目标仓生产级自动迁移 |
| [../skills/lazypack-setup/scripts/doc_helper.mjs](../skills/lazypack-setup/scripts/doc_helper.mjs) | setup 执行辅助 | current | scan/plan/exec 调度入口。证据：Phase 2 应用收尾与 3 个沙箱 fixture 的真实 Agent 验收。已验证：当前 Windows/AGY 隔离沙箱。不代表外部目标仓生产级自动迁移 |
| [../skills/lazypack-harvest/SKILL.md](../skills/lazypack-harvest/SKILL.md) | harvest 执行入口 | current | 显式调用边界由该 skill 定义。其 references 与 helper 注释改指本文件现存步骤；本仓没有冻结规格 SPEC.md |
| [interviews/2026-09-04-founding-interview.md](interviews/2026-09-04-founding-interview.md) | 立项来源 | reference | 历史去敏访谈，不覆盖现行愿景与纪律 |
| [reviews/](reviews/) | 讨论材料集合入口 | reference | 子文档各自状态需要核实，不将整个目录认作实施基线 |
| [reviews/2026-09-10-document-homes-adoption/](reviews/2026-09-10-document-homes-adoption/) | 讨论留档 | current | 2026-09-10 文档归属正式采纳三轮会议留档、表决与维护者裁定，0.3.0 生效依据 |
| `docs/reviews/2026-09-07-lazypack-harvest/`（工作区未跟踪，不在 Git 树） | 讨论留档 | reference | 未完成的历史讨论材料（仅主持 README 与三份第一轮提示词，participants 为空）。不是现行 harvest 规范，不纳入 Git 树、不删除工作区副本。现行入口仍是已跟踪的 skills/lazypack-harvest/SKILL.md |

## 4. 本次补齐的范围

2026-09-09：维护者指出，文档应该由纪律预先规定归属，不应由用户每次提醒。核对发现固定层已有一般分类，本仓缺少登记册与 AI 读取入口，产品愿景也未被归类。本轮补齐这些入口并记录愿景。文档同步、归档与 AI 协作的程序化自动执行仍是产品工作，不能由本次文档补齐推导为已经完成。

2026-09-10：文档归属跨项目纪律正式采纳通过，固定层升版至 0.3.0 并完成规则汇编与三轮讨论正式留档（`reviews/2026-09-10-document-homes-adoption/`）。八区文档路由、迁移器与自动化执行待后续实施票开展，不因固定层已采纳而推导为目标项目已自动升级。

2026-09-10 (S1)：完成文档归属首期（S1）“原位识别、保留原位与安全登记（preserve-existing）”静态编排与规范集成。新增 8 大知识区路由参考规范 [document-routing.md](../skills/lazypack-setup/references/document-routing.md)，更新 setup skill、模板与托管块规范；静态验证完成，真实沙箱端到端演练交接至 S2。

2026-09-10 (S1-FIX1)：完成 S1 产品契约定点修复：实现内存合并与统一写前单次原子写盘，消除自身写入并发误判；规范未选中不等于被取代及替代关系显式确认机制；修正模板 superseded 归档指令为原位保留与四步关卡；明确声明合法仓内原件优先于通用剪枝并细化四类登记对象契约；为 Section 3 引入维护责任/更新触发 5 列丰富可用表头；静态核验脚本全量通过，为独立 S2 沙箱验收提供完备规约。

2026-09-12 (首期验收与证据留档)：首期“原位保留、安全登记与零物理迁移（preserve-existing）”已在当前 AGY/Windows 限定沙箱验收完成，并获主持验收认可（详见主持验收记录 [host-acceptance.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-phase1-closeout-20260912/host-acceptance.md) 与全局验收索引 [acceptance-index.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-phase1-closeout-20260912/acceptance-index.md)）。系统临时交接目录中的代表性验收凭证留档如下（仅作为交接与核验凭据，不伪装成本仓产品源码；历史 reviews 保持留档原样，不认作实施基线）：
- 首期收尾总报告：[document-homes-phase1-closeout-20260912/result.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-phase1-closeout-20260912/result.md)
- 十项沙箱边界单测与快照：[document-homes-final-boundary-evidence-20260911/result.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-final-boundary-evidence-20260911/result.md)（清单时间戳失配根因与纠正确认详见 [manifest-discrepancy.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-phase1-closeout-20260912/manifest-discrepancy.md) 及 host-acceptance 说明）
- raw_qa 三边界真实 Agent 落地（R1 隔离区 / R2 私有仓 / R3 未绑定）：[document-homes-rawqa-real-agent-20260911/result.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-rawqa-real-agent-20260911/result.md)（含真实写入 `docs/internal/qa-records.md` 与策略说明）
- 既有手工想法保护（ideas-pool 零写入拦截）：[document-homes-S2E-confirmation-checkpoint-20260910/checkpoint.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-S2E-confirmation-checkpoint-20260910/checkpoint.md)
- 会议纪要追加写入（minutes-only）：[document-homes-minutes-real-agent-20260911/result.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-minutes-real-agent-20260911/result.md)
- 混合种子创建（hybrid 模板初始化）：[document-homes-hybrid-real-agent-20260911/result.md](file:///C:/Users/jared/AppData/Local/Temp/lazypack-discipline-handoff/document-homes-hybrid-real-agent-20260911/result.md)

2026-09-13 (Phase 2 首个文档迁移试点完成)：经用户单次整体确认，完成首个非工单文档 `docs/handoff-verification.md` → `docs/agents/handoff-verification.md` 试点迁移，同步完成出站链接（指向 `../DECISIONS.md`）与全仓入站引用（`AGENTS.md`、`README.md`、`docs/ARTIFACTS.md`）更新；原文件核验后清理；全套快照与操作日志留存于系统临时交接目录（`document-migration-handoff-implement-20260912/`）。通用物理迁移器与链接重写尚未实现为通用自动化能力，本次为受控手工实施试点。

边界重申：本次验收确证的是文档归属识别与原位登记、基本确认/拒绝与保护、受管区和 Section 3 隔离、限定格式兼容、留存代表模式及 rawqa 三边界；证据严格限于对应 fixture 及当前宿主（AGY / Windows），不代表生产发布、全局安装、跨宿主适配或真实大型旧仓接入完成。本地 Helper 与规约已合入本仓工作区；外部目标仓通用自动化物理迁移与链接重写、跨宿主与大型旧仓接入仍未交付。沙箱验证不等于生产通用能力。

2026-09-20（发布基线收口）：工作区仍有未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/`。目录内仅有主持 README 与三份第一轮提示词，`participants/` 为空，讨论未闭环。按固定层 §4.3 不把它视为现行 harvest 规格或 0.3.0 依据；本基线三个提交不收录、不删除。现行 harvest 入口仍是已跟踪的 `skills/lazypack-harvest/SKILL.md`。

2026-09-21（发布基线加固）：干净 Git 树物化后不能依赖上述未跟踪目录。Section 3 将该路径改为非链接叙事，避免 `git archive` 扫描把工作区副本误当成仓内入口。工作区仍保留该目录，仍不入库。本地受控迁移引擎已实现，Windows/AGY 沙箱已验证；外部目标仓生产迁移、跨宿主、大型旧仓、全局安装与发布仍为 UNPROVEN。

2026-09-21（#3）：`templates/RELEASE.md` 的 `release-discipline` 托管块改为只含固定发版纪律；「项目打包与发布」播种在 end 标记之后。setup 重跑按既有 §5.3 不覆盖块外。固定层条文未改。验收限于本机 Windows 契约沙箱（按 managed-blocks 算法模拟首次编译 / NO-OP / 晋升保护 / UPGRADE），不是完整 `/lazypack-setup` 访谈，也不代表跨宿主生产验证。

2026-09-21（#4）：块外种子增补「本机试打、发版与版本标签」：本机试打不等于发版、不发版不打版本标签、标签由谁打、与 CI 的先后。固定层 §5.7 条文未改。验收限于本机 Windows 契约沙箱；#3 与 #4 之间已编译仓的块外旧种子按不覆盖原则保留、不会自动补上试打指引。不代表完整 setup 访谈或跨宿主生产验证。

2026-09-21（#12）：新增本仓项目层对子清单 [agents/doc-pairs.md](agents/doc-pairs.md) 与只读检查脚本 [../scripts/check_doc_pairs.mjs](../scripts/check_doc_pairs.mjs)（P1–P5、P8）。固定层条文未改。检查器可手动运行，未接线到 pre-commit / CI，不宣称门禁已生效。验收限于本机 Windows 工作区：首次全过、负例检出后恢复、运行前后 git status 一致。

2026-09-22（#11）：`handoff_manifest.js` 的 generate 增加可选 `--include-git-blob`。blob id 只来自本机 `git hash-object`，不传 `-w`，不在 Node 里模拟。verify 在 raw 哈希不同但 LF 规范化哈希相同时记为换行规范化可解释差异，退出码仍非零。固定层未改。§3 原先没有该脚本登记行，本轮补上，并更新交接指引那一行的边界。验收在本机 Windows、临时仓 `core.autocrlf=true`：CRLF 与 LF 的 raw 哈希不同而 `git_blob_id` 相同；LF、MIXED、带 BOM 的 `line_endings` 分别为 LF、MIXED、LF；字节一致为通过，仅换行差异为可解释分类，改内容为 `SHA256_RAW_MISMATCH`，篡改 blob 字段可检出；非工作树与 PATH 中无 git 时字段缺席并写明降级原因。`git count-objects` 在调用前后都是 0 objects。#15 旧清单在本段写入前用新脚本 verify 通过。`check_doc_pairs` 在本段登记后仍为 6/6 PASS。未接 hook/CI。

2026-09-22（#15）：新增本仓提交说明格式只读检查器 [agents/commit-msg-check.md](agents/commit-msg-check.md) 与 [../scripts/check_commit_msg.mjs](../scripts/check_commit_msg.mjs)。type 词表在运行时从固定层 §5.1 抽出，脚本内不另写清单。固定层条文未改。未接线 hook/CI，不宣称门禁已生效。验收限于本机 Windows：含 scope、含 `!`、无 scope 三种标题为 format-pass（退出码 0）；`fix bug` 与 `wip: temp` 为 format-fail（退出码 1，输出写明命中规则）；消息文件缺失为 not-run（退出码 2）；临时副本上词表数量不符、以及副本中条文文件缺失，均为 exec-failed（退出码 3）。四态字面量与退出码两两可区分。检查器运行前后 git status 一致，本仓 `docs/DECISIONS.md` 未被改写。同轮 `node scripts/check_doc_pairs.mjs` 为 6/6 PASS。脚注与正文是否非空只作信息行，不计入失败。格式通过不等于语义已验证。
