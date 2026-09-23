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
| 本仓文档关系声明（§7.2 对子） | [agents/doc-pairs.md](agents/doc-pairs.md) | 声明增删，或来源、目标范围、检查方式、处理权限变化时，由本轮执行者更新；检查脚本只实现清单并核对四要素在场，不复述正文 |
| 本仓开工/收尾的文档防腐检查 | [agents/freshness-check.md](agents/freshness-check.md) | 识别步骤或五态用词变化时更新。每轮记录写在本册当轮说明；长证据放系统临时目录。不在本文件复述关系声明 |
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
| [VISION.md](VISION.md) | 产品愿景 | current | 2026-09-09 维护者明确方向；2026-09-22 确认提交历史的用户收益（#8 / #18），该句不表示 commit-msg 已在本仓或全部目标仓生效；2026-09-22 确认文档防腐产品目标（#9 / #20）：开发中检查受影响文档，能确定且已授权的同步，有疑问的指出，新决策交回用户。该段只记目标与取舍，不表示日常自动维护已交付；2026-09-22 增补 #5 裁定：用户在 AI 持续开发后仍能看懂项目结构、关键流程和变化依据，下一位 Agent 能依靠同一份项目知识接续工作。图是表达方式，不是交付数量指标。试点验证尚未开展，该句不表示总览、流程说明或图已交付；2026-09-22 增补 #6 裁定：用户把开发任务交给 AI 后，不必反复提醒安全检查或自己拼接多份报告；交付时能看清检查了什么、哪些问题有依据、如何处理、哪些范围仍未检查。不指定工具。首个试点 yifangbao（施工票 #27）2026-09-23 验收，单次样本不外推，该句仍不表示安全审查能力已交付；2026-09-22 增补 #7 裁定：新增页面和操作沿用项目已确认的视觉约定，用户不必反复提醒 AI 保持一致。不承诺完整设计系统或所有项目统一审美。试点尚未开展，该句不表示视觉约定维护已交付；2026-09-22 增补 #10 裁定：用户交代目标，AI 在已确认目标、验收范围与权限内选用已有技能、传递上下文、推进到完成或真实阻塞；用户不管理技能调用，但看得懂进展和需要自己决定的事项。不表示无感全自动。首个验证 #19 于 2026-09-23 验收（宿主 Cursor 3.21.18 / Windows，单宿主单任务样本，不外推），该句仍不表示自动接续已交付 |
| [DECISIONS.md](DECISIONS.md) | 固定层纪律 | current | 0.4.0；变更规则由正文自身定义 |
| [ARTIFACTS.md](ARTIFACTS.md) | 本仓文档归属 | current | 本轮补齐的内容分类、维护触发和入口登记 |
| [../AGENTS.md](../AGENTS.md) | 本仓 AI 入口 | current | 只提供读取指针。开工除登记册外，还指向文档防腐检查与文档关系声明 |
| [../README.md](../README.md) | 对外导航 | current | 仓库总入口；能力说明不代替验收 |
| [agents/handoff-verification.md](agents/handoff-verification.md) | 给 agent 的按需说明 | current | 按固定层 §4.1 迁至 docs/agents/。raw 字节仍是第一权威；LF 规范化不剥离 UTF-8 BOM。仅换行与仅 BOM 各自分类，且都非通过。可选 git_blob_id 只记录本机 git 规范化结果，拿不到则字段缺席并写明降级原因 |
| [../scripts/handoff_manifest.js](../scripts/handoff_manifest.js) | 本仓执行辅助 | current | 只读生成与核验交接清单。`--include-git-blob` 调用本机 git hash-object，不伪造 blob id。LF 规范化哈希保留开头 BOM。仅换行记为 `LINE_ENDING_NORMALIZATION_EXPLAINABLE`，仅 BOM 记为 `UTF8_BOM_ONLY_DIFFERENCE`，两者退出码仍非零。未接 hook/CI |
| [../scripts/handoff_bom_classify_repro.js](../scripts/handoff_bom_classify_repro.js) | 本仓执行辅助 | current | 上述分类的手动回归。在系统临时目录写夹具，不改仓库。未接 hook/CI。不是门禁 |
| [agents/doc-pairs.md](agents/doc-pairs.md) | 给 agent 的按需说明 | current | 本仓项目层文档关系声明（P1–P5、P8）。每条只在本文件出现一次，并写明来源、目标范围、检查方式、处理权限。不是跨项目固定层，不要求其他仓手填同一批对子。P8 仍动态抽取交接指引全部 `### 2.x`；P4/P5 围栏含反引号与波浪号。开工收尾的使用步骤不在本文件，见 freshness-check.md |
| [agents/freshness-check.md](agents/freshness-check.md) | 给 agent 的按需说明 | current | 本仓开工识别核对范围、收尾留下五态记录的流程。不复述六条声明，不新建角色。检查器仍手动运行，未接 hook/CI。流程已写明不等于日常自动维护已交付 |
| [../scripts/check_doc_pairs.mjs](../scripts/check_doc_pairs.mjs) | 本仓执行辅助 | current | 只读检查上述声明。先核对 `## 声明` 下的编号与四要素是否在场，再执行 P1–P5、P8。缺字段、未声明或没有实现的编号为 FAIL，不能记 PASS。旧的 X/Y/判定 标记不再被认作声明。P8 不写死 generate/verify。P4/P5 按 CommonMark 跳过反引号与波浪号围栏，开闭须同字符。手动运行。未接 hook/CI。不宣称门禁已生效 |
| [agents/commit-msg-check.md](agents/commit-msg-check.md) | 给 agent 的按需说明 | current | 本仓提交说明格式的只读检查口径（§5.1 标题形状与运行时抽出的 type）。缺省仍读脚本所在仓的 `docs/DECISIONS.md`；`--rules <path>` 只改读哪一份含 §5.1 行的文件。本仓仍手动运行，未接 hook/CI。格式通过不等于语义已验证。不是门禁。2026-09-22 的隔离仓接线没有改这份口径 |
| [../scripts/check_commit_msg.mjs](../scripts/check_commit_msg.mjs) | 本仓执行辅助 | current | 只读检查候选提交说明的标题格式。不传 `--rules` 时，词表仍从脚本所在仓的固定层 §5.1 在运行时抽取，脚本内不另写清单。传入 `--rules <path>` 时用同一抽法读该文件；文件缺失或抽不出词表为 exec-failed。本仓仍手动运行，未接 hook/CI，不宣称门禁已生效。2026-09-22 只在本机 Git for Windows 隔离仓用未改行为的副本接通 commit-msg |
| [../skills/lazypack-setup/SKILL.md](../skills/lazypack-setup/SKILL.md) | setup 执行入口 | current | 以本仓磁盘正文为准；不代表所有宿主或目标仓实测通过。第 2 步有界扫描的排除目录与敏感文件与 document-routing §2.2、doc_scanner 为同一显式集合 |
| [../skills/lazypack-setup/references/document-routing.md](../skills/lazypack-setup/references/document-routing.md) | 文档路由规范 | current | S1 产物：既有文档 8 大知识区归属规范、原位保留登记与同主题判定；首期 preserve-existing 在当前 AGY/Windows 限定沙箱验收完成（见 §4）。Phase 2 受控迁移规约已合入本文件；通用生产迁移仍 UNPROVEN。§2.2 排除目录与敏感文件与 doc_scanner 为同一显式集合（含 `.DS_Store`；敏感文件为精确文件名或明确前后缀） |
| [../skills/lazypack-setup/scripts/doc_scanner.mjs](../skills/lazypack-setup/scripts/doc_scanner.mjs) | setup 执行辅助 | current | 有界 Markdown 扫描与引用图构建器。证据：Phase 2 主仓应用收尾与本仓只读 scan。已验证：当前 Windows/AGY 隔离沙箱与本仓只读扫描；本机 Windows 上 #13 复跑死链 17→0（消除项均为 `file:` 与代码语境伪链接），临时 fixture 仍检出真死链。不代表外部目标仓生产级自动迁移。排除目录含 `.DS_Store`（路径小写化后按 `.ds_store` 匹配）；敏感文件仍为精确匹配。忽略带 scheme 的 URL（含 `file:`）与纯锚点；抽链前剥离围栏与行内反引号，标题抽取仍用原始正文 |
| [../skills/lazypack-setup/scripts/doc_plan.mjs](../skills/lazypack-setup/scripts/doc_plan.mjs) | setup 执行辅助 | current | 迁移计划生成器（含双指纹与 Section 3 紧凑表修复）。证据：Phase 2 应用收尾与 fix2 回归。已验证：当前 Windows/AGY 隔离沙箱。不代表外部目标仓生产级自动迁移 |
| [../skills/lazypack-setup/scripts/doc_executor.mjs](../skills/lazypack-setup/scripts/doc_executor.mjs) | setup 执行辅助 | current | 双指纹绑定的受控执行器（含补偿回滚）。证据：Phase 2 应用收尾与 S6 沙箱批次。已验证：当前 Windows/AGY 隔离沙箱。不宣称系统级抗崩溃原子性，不代表外部目标仓生产级自动迁移 |
| [../skills/lazypack-setup/scripts/doc_helper.mjs](../skills/lazypack-setup/scripts/doc_helper.mjs) | setup 执行辅助 | current | scan/plan/exec 调度入口。证据：Phase 2 应用收尾与 3 个沙箱 fixture 的真实 Agent 验收。已验证：当前 Windows/AGY 隔离沙箱。不代表外部目标仓生产级自动迁移 |
| [../skills/lazypack-harvest/SKILL.md](../skills/lazypack-harvest/SKILL.md) | harvest 执行入口 | current | 显式调用边界由该 skill 定义。其 references 与 helper 注释改指本文件现存步骤；本仓没有冻结规格 SPEC.md |
| [interviews/2026-09-04-founding-interview.md](interviews/2026-09-04-founding-interview.md) | 立项来源 | reference | 历史去敏访谈，不覆盖现行愿景与纪律 |
| [reviews/](reviews/) | 讨论材料集合入口 | reference | 子文档各自状态需要核实，不将整个目录认作实施基线 |
| [reviews/2026-09-10-document-homes-adoption/](reviews/2026-09-10-document-homes-adoption/) | 讨论留档 | current | 2026-09-10 文档归属正式采纳三轮会议留档、表决与维护者裁定，0.3.0 生效依据 |
| [reviews/2026-09-22-release-tag-semantics/](reviews/2026-09-22-release-tag-semantics/) | 讨论留档 | current | §5.7 发版与标签语义修订 §9 会议留档，维护者已裁定批准（round-3/tally.md §七），0.4.0 生效依据。**本仓自生效提交起打 v0.4.0，0.3.0 不追溯补标** |
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

2026-09-22（#13）：harvest 的三份 references 与两份 helper 注释改为指向 `skills/lazypack-harvest/SKILL.md` 的现存步骤（生命周期对应「执行步骤与操作规范」步骤 1–6；脱敏对应步骤 3；批次汇总对应步骤 6，逐候选状态在步骤 4–5 赋值）。本仓没有冻结规格文件，也没有新建该文件。`document-routing.md` §2.2、setup `SKILL.md` 第 2 步与 `doc_scanner.mjs` 使用同一显式集合：排除目录为原集合加上 `.DS_Store`；敏感文件为 `.env`、`.env.*`、`credentials.json`、`client_secret.json`、`*.pem`、`*.key`、`id_rsa`、`id_ed25519`、`.ssh/`。`.envrc` 不在集合内，本轮未加入。`doc_scanner.mjs` 在抽链前剥离围栏与行内反引号，并忽略带 scheme 的 URL（含 `file:`）与纯锚点；标题抽取仍读原始正文。本仓只读 scan：123 个文件，死链 17→0，新增 0。消除的 17 条都是误报（9 条 `docs/ARTIFACTS.md` 的 `file://`，5 条 `document-routing.md` 行内示例，1 条 `doc-pairs.md` 行内示例，`managed-blocks.md` 与 setup `SKILL.md` 各 1 条目标仓指针文案）。临时 fixture 仍检出真死链 `./does-not-exist.md`；围栏内 `[a](b)`、行内 `` `[a](b)` `` 与 `file://` 不产生链接记录；围栏内标题仍被抽出。`.DS_Store` 目录被排除，`docs/credentials-architecture.md` 仍解析出到 `./ok.md` 的链接。`doc_plan.mjs` 未改行为：它只按迁移源路径查 `inboundReferences`，上述伪链接与 `file://` 修复后不再进入该图；`rewriteMarkdownContent` 在文件因其他真实引用被选中时，仍会改写其中的 `file:`、围栏链接和行内代码链接。固定层未改。`scripts/handoff_manifest.js` 与 `docs/agents/handoff-verification.md` 未改。未接 hook/CI。验收限于本机 Windows。

2026-09-22（#17 F1/F2）：`check_doc_pairs.mjs` 的 P8 改为动态抽取交接指引 §2 全部 `### 2.x` 子命令，与 `runCli` 双向比对，不再写死 generate/verify。P4/P5 抽链按 CommonMark 识别反引号与波浪号围栏，开闭须同一字符。固定层未改。未接 hook/CI。验收限于本机 Windows：基线 6/6 PASS；沙箱插入 `### 2.3 audit` 后 P8 为 FAIL（不再假 PASS）；`docs/ARTIFACTS.md` 末尾 `~~~` 围栏内的不存在链接不再令 P4 失败。

2026-09-22（#17 F3）：`handoff_manifest.js` 的 LF 规范化哈希保留开头 UTF-8 BOM（`TextDecoder` `ignoreBOM: true`）。verify 把「其余字节相同、只多或只少开头 BOM」记为 `UTF8_BOM_ONLY_DIFFERENCE`，不再记成换行可解释。退出码仍为 1。换行可解释、字节一致通过、改内容为 `SHA256_RAW_MISMATCH` 保持不变。BOM 与换行同时变化时两种单独理由都不使用。固定层未改。未接 hook/CI。回归：`node scripts/handoff_bom_classify_repro.js`。验收限于本机 Windows。

2026-09-22（#17 F4）：`templates/RELEASE.md` §2 导语改为与 setup `SKILL.md` 的播种条件一致：`[NEW]` 且块外无正文时播种；`[UPGRADE]` 且 end 标记之后无正文时允许一次性追加同一薄草稿；块外已有内容时不得覆盖、重排或再播种；`[NO-OP]` 不写盘。固定层未改。已编译仓的块外旧种子仍按不覆盖原则保留，不会因这次模板改字而重写。验收限于本机 Windows 的条文对照，不是完整 `/lazypack-setup` 访谈。

2026-09-22（#18）：`docs/VISION.md` 写入已确认的用户收益：任务交给 AI 之后，用户不必再替它整理提交；接续者应能从 Git 历史读懂改了什么、为什么改、影响哪里，以及哪些事项尚未完成。句子不指定工具。本仓 `scripts/check_commit_msg.mjs` 的行为未改，本仓仍未接 hook/CI。隔离验证限于本机 Git for Windows 2.54.0 与 Node v24.19.0 的临时仓：默认 `.git/hooks` 里预置 post-commit 探针，另有一个退出码 0 的 pre-commit；`commit-msg` 调用检查器的字节副本；全程未设置 `core.hooksPath`。`wip: temp` 的真实 `git commit` 被阻断（检查器 `format-fail`，退出码 1）。合法候选在 pre-commit 通过且格式通过后提交成功，探针记下新提交，`NOTES.md` 仍为未暂存修改。临时移走隔离仓 `docs/DECISIONS.md` 时检查器为 `exec-failed`（其 JSON 退出码 3），`git commit` 退出码 1，HEAD 不变。把钩子改去调用不存在的 node 时，没有检查器状态行，归类 `not-run`，提交未发生。暂存范围加入 `NOTES.md` 后，上一次 `format-pass` 作废并重新检查。格式通过但说明只谈 README 拼写的候选由审查记为语义不符，没有提交。规则来源是本仓 `docs/DECISIONS.md` 的 §5.1 行按字节复制到隔离仓同路径，type 仍由检查器运行时抽出，没有第二份手写词表。固定层与 `templates/RELEASE.md` 第 12 行未改。不表示其他宿主或其他提交入口已被阻断。

2026-09-22（#20）：`docs/VISION.md` 写入 #9 裁定确认的文档防腐目标与取舍，并在本节登记行写明这不是日常自动维护已交付。文档关系声明仍只在 `docs/agents/doc-pairs.md`：P1–P5、P8 改为来源、目标范围、检查方式、处理权限；`scripts/check_doc_pairs.mjs` 先核对 `## 声明` 的编号与四要素是否在场，再执行原来的内容检查。旧的 X/Y/判定 标记不再算声明。开工与收尾流程写在 `docs/agents/freshness-check.md`，`AGENTS.md` 增加指针。固定层、`templates/` 与 harvest skill 未改。未接 hook/CI，未建通用语义定位器。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了愿景是否只写目标、流程文档是否把「流程已写」当成「自动维护已交付」、既有登记段是否被改写。
- 依据版本：开工提交 `ab1ca80`。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。本段写入前工作区已含上述文档与检查器改动。
- 处理结果：P1–P5、P8 为未发现差异（写入前 6/6 PASS，退出码 0；P1 sha256 仍为 `e75802d27e4516f0492ab8bc910bfb68960fcffe2506c58a14cb6faf5a9054a7`，P4 links=40 failures=0，P5 agents=6 readme=8）。检查器运行前后 `git status` 一致。愿景句子与本册登记行为已同步。固定层正文与 setup 快照为未发现差异（P1，且上述路径的 `git diff` 为空）。
- 未覆盖：任意代码 diff 到文档段落的语义定位器未建设，也未运行。hook/CI 未接线，未运行。外部目标仓试用未授权。愿景措辞与登记册之间没有机器声明，本轮只人工阅读。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入。#14 隔离原型本轮未复跑。
- 未决：phase-2b 须维护者另行授权目标仓。确定性检查接入门禁须另开实施票。

开工时 `freshness-check.md` 还不存在。当时的识别依据是 #20 与 #9 裁定已经列出的任务、实际 diff、登记册和已有规则。本段按刚写入的流程记录五项。下一位 Agent 从 `AGENTS.md` 进入该流程。

负例在系统临时目录改写声明后写回，写回后检查器为 6/6 PASS、退出码 0：去掉 P1 的处理权限时该条 FAIL 且 `check=PASS`（`declaration=missing:处理权限`），退出码 1；增加 P9 时为 `declaration=no-implementation`，退出码 1；把 `## 声明` 改成 `## 清单` 时 0/6 FAIL，摘要为 `error=未找到标题`，内容对照没有执行，记为失败而不是缺基线或未运行；把来源改回 `X` 时 P1 为 `missing:来源`，退出码 1。这些负例都不是未发现差异。本段不新增 Markdown 链接；写入后复跑仍为 6/6 PASS，P4 links=40，退出码 0。验收限于本机 Windows。

2026-09-22（#22）：维护者已批准的 §5.7 发版与标签语义改定落盘，固定层升至 0.4.0。`docs/DECISIONS.md` 替换 §5.7 并加附注行，§4 发版规则行补上平台段定义，未定项新增两条仍标为待复审。setup 快照按字节复制。`templates/RELEASE.md` 块外薄草稿按发布意图改写，并增加「发版完成认定」槽位；块内固定段正文只改版本戳与来源内容标识。`SKILL.md` 的 `[NEW]` 播种句与参考文献里的快照版本号同步为 0.4.0。`[UPGRADE]` 与 `[NO-OP]` 未改。登记册把 `reviews/2026-09-22-release-tag-semantics/` 转为 current，并写明本仓自生效提交起打 `v0.4.0`，0.3.0 不追溯补标。未接 hook/CI。验收限于本机 Windows 的 `check_doc_pairs` 与随后的版本标签。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了 §5.7 是否按裁定稿落盘、历史验收段有没有被改写、两条未定项有没有写成已决定、登记行有没有把施工写成已交付。
- 依据版本：开工提交 `193d398`。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。本段写入前工作区已含上述条文、快照、模板与登记行改动，检查器为 6/6 PASS、退出码 0（P1 sha256 `ca41a963da97487dee4f95660777b1fc48126405502ed768f205debe2a2a12fd`，P2 blob `b0bfa054107a9a4c18d8e64a500b4db9bae059bb`，P3 version `0.4.0`，P4 links=41 failures=0，P5 agents=6 readme=8）。收尾提交号随 `v0.4.0` 标签所指提交，本段写不进尚未产生的提交号。
- 处理结果：P1、P2、P3 为已同步（本票授权改固定层、复制快照、升版本戳，并把五份模板的来源内容标识改到新 blob；收尾检查为 PASS，同一行没有 `declaration=`）。P4、P5、P8 为未发现差异。检查器运行前后 `git status` 一致。本段不新增 Markdown 链接。
- 未覆盖：任意代码 diff 到文档段落的语义定位器未建设，也未运行。hook/CI 未接线，未运行。外部目标仓试用未授权。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入、未删除。`references/managed-blocks.md` 未改（:64 笔误属 #21；:34 的 `DECISIONS.md@0.3.0` 仍是格式示例）。#19、#5、#6、#7、#10 未做。块内固定段除版本戳与来源内容标识外未改写。
- 未决：§5.4 两职张力，以及本仓钉版消费是否构成 §5.7 发布意图，仍写在固定层未定项，材料不足，不在本轮判决。phase-2b 与确定性检查接入门禁仍须另票授权。

2026-09-22（#24）：`docs/VISION.md`「先完善纪律自动化，再扩展模板组合」一节在接续者主题段落后写入 #5 裁定确认的方向。承诺范围是：用户在 AI 持续开发后仍能看懂项目结构、关键流程和变化依据；下一位 Agent 能依靠同一份项目知识接续工作。图是表达方式，不是交付数量指标。试点验证尚未开展。该段只记收益和边界。“Architecture as AI” 只作为探索背景，不是能力承诺。本节登记行只在来源描述补上 #5 裁定（2026-09-22 增补），类别与状态未改。固定层、模板、skill 未改。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入、未删除。未对任何目标仓开工。未接 hook/CI。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了新段落是否只写用户收益与边界、试点有没有被写成已交付、既有验收段有没有被改写、登记行除来源描述外有没有被改。
- 依据版本：开工提交 `7a043b0`。收尾核对在包含本段的工作区；提交号与本段同一提交，写入时还没有。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。本段写入前检查器为 6/6 PASS、退出码 0（P1 sha256 `ca41a963da97487dee4f95660777b1fc48126405502ed768f205debe2a2a12fd`，P2 blob `b0bfa054107a9a4c18d8e64a500b4db9bae059bb`，P3 version `0.4.0`，P4 links=41 failures=0，P5 agents=6 readme=8，P8 commands=generate,verify）。检查器运行前后 `git status` 一致。
- 处理结果：P1、P2、P3、P5、P8 为未发现差异。P4 为未发现差异（登记行来源描述有增补，检查方式只验证相对链接可解析；本段不新增 Markdown 链接，写入前与写入后均为 links=41 failures=0，写入后仍为 6/6 PASS、退出码 0）。固定层正文与 setup 快照为未发现差异（P1，且任务未授权改这两份文件）。
- 未覆盖：任意代码 diff 到文档段落的语义定位器未建设，也未运行。hook/CI 未接线，未运行。愿景措辞与登记册之间没有机器声明，本轮只人工阅读。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入。外部目标仓试用未授权，未开工。
- 未决：试点仓与最小实施规格仍是提案，维护者选定并授权前不对任何目标仓施工，本票不收尾。确定性检查接入门禁须另开实施票。

2026-09-22（#25 Phase C）：riviv 冷启动接续验证按开工提示词执行完毕。前置检查通过：riviv master 快进到 `ca1fd27`（PR #112 已含），`docs/overview.md` 播放列表段为十个扩展名，基线成立。五组问题（组成、流程、最近一次变化、未决项、入口质量）全部从 riviv 仓库入口（AGENTS.md 起步）作答并逐条给出处。发现 3 处 riviv 入口质量问题（overview 对照提交行过时、AGENTS.md 所述 CONTEXT.md 不在其仓库根、README Usage 段 CF_DIB 句与 #66 条目矛盾），只如实写入结果，未修 riviv 任何文件——修目标仓文档不属本轮授权。对 riviv 只读：未改、未提交、未推送、未跑构建与测试。结果文件在系统临时目录 `lazypack-discipline-handoff/issue25-phaseC-20260922/result.md`（含阅读路径、工具异常记录与自评）。结果文件为报告本体，按交接指引不参与清单；本轮无仓库内载荷，未生成同源清单。本仓本轮除本登记段外未改任何文件。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了本段是否只写本轮做过的事、既有登记段是否被改写、结果文件在仓外是否被表述成仓内交付。
- 依据版本：开工与收尾同为提交 `1eeb0e8`（本仓本轮无新提交；收尾核对在工作区，除本段与既有未跟踪目录外无改动）。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。
- 处理结果：P1、P2、P3、P4、P5、P8 均为未发现差异（写入本段前 6/6 PASS、退出码 0：P1 sha256 `ca41a963da97487dee4f95660777b1fc48126405502ed768f205debe2a2a12fd`，P2 blob `b0bfa054107a9a4c18d8e64a500b4db9bae059bb`，P3 version `0.4.0`，P4 links=41 failures=0，P5 agents=6 readme=8，P8 commands=generate,verify；写入本段后复跑仍 6/6 PASS、退出码 0、links=41 failures=0）。检查器运行前后 `git status` 一致。本段不新增 Markdown 链接。
- 未覆盖：riviv 仓库与本轮 Temp 交付物不在本仓任何声明的来源或目标范围。「任意代码 diff 到文档段落」的语义定位器未建设、未运行。hook/CI 未接线、未运行。既有未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入、未删除。
- 未决：#25 后续阶段与整票收尾由维护者裁定；本轮发现的 riviv 文档问题是否开票修复由维护者决定，本轮不代为开票或修改。

2026-09-23（#25 收口，指挥补记）：#25 三期验收全部通过，整票已关（验收对照见 #25 收尾评论；六条验收重点中「不改架构含义的重构不引起总览大改」未覆盖，如实标注）。上段两条「未决」的后续：Phase C 发现的 riviv 三处文档过时已开 riviv#113；Phase B 两项另开票建议已开 riviv#114（Everything 搜索前缀）、riviv#115（安装器关联 .apng 线格式评估）。本轮仅补记此段，不改其他任何文件。

2026-09-23（#26）：`docs/VISION.md` 写入 #6、#7、#10 三份 2026-09-22 裁定确认的方向。#10 与 #7 落在「用户专注于产品，lazypack 处理开发中的家务」一节已有两段之后；#6 落在「先完善纪律自动化，再扩展模板组合」一节、文档防腐取舍段之后。三段都只记用户收益和边界，并写明试点尚未开展。#6 不指定工具。#7 不承诺完整设计系统或所有项目统一审美。#10 不表示无感全自动已经交付。既有段落文字未改。本节登记行只在来源描述补上这三条裁定（2026-09-22 增补），类别与状态未改。固定层、模板、skill 未改。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入、未删除。开工时已在工作区的 #25 Phase C 登记段未改写，也不纳入本提交。未对任何目标仓开工。未接 hook/CI。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了三段是否只写用户收益与边界、试点有没有被写成已交付、有没有写进工具选型、既有段落和既有验收段有没有被改写、登记行除来源描述外有没有被改、#25 未提交段有没有被改写。
- 依据版本：开工提交 `1eeb0e8`。收尾核对在包含本段的工作区；提交号与本段同一提交，写入时还没有。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。本段写入前检查器为 6/6 PASS、退出码 0（P1 sha256 `ca41a963da97487dee4f95660777b1fc48126405502ed768f205debe2a2a12fd`，P2 blob `b0bfa054107a9a4c18d8e64a500b4db9bae059bb`，P3 version `0.4.0`，P4 links=41 failures=0，P5 agents=6 readme=8，P8 commands=generate,verify）。检查器运行前后 `git status` 一致。Node v24.19.0。
- 处理结果：P1、P2、P3、P5、P8 为未发现差异。P4 为未发现差异（登记行来源描述有增补，检查方式只验证相对链接可解析；本段不新增 Markdown 链接，写入前与写入后均为 links=41 failures=0，写入后仍为 6/6 PASS、退出码 0）。固定层正文与 setup 快照为未发现差异（P1，且任务未授权改这两份文件）。
- 未覆盖：任意代码 diff 到文档段落的语义定位器未建设，也未运行。hook/CI 未接线，未运行。愿景措辞与登记册之间没有机器声明，本轮只人工阅读。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入。外部目标仓试用未授权，未开工。OCR 未安装、未运行。技能自动接续与 #19 未实施。
- 未决：#6、#7 的试点仓与 #10 的 #19 开工授权仍由维护者选定。选定并授权前不对任何目标仓施工，本票不收尾。确定性检查接入门禁须另开实施票。

2026-09-23（#6 收口，指挥补记）：#6 关票条件「试点选定与施工票验收」已成就——维护者选定试点仓 yifangbao（2026-09-23 路由回执），施工票 #27 的 Phase A 只读基线与 Phase B 完整闭环均验收通过并关票（验收对照见 #27 两条验收评论）；改动提交并推送 yifangbao dev（`102fd5d`），任务票 yifangbao#3 已关。盲审单次样本自行检出 tenders 未挂门、已挂门三组零误报；按裁定该样本不计检出率或误报率，不外推通用安全能力。`docs/VISION.md` 的 #6 方向句把「试点尚未开展」更新为首个试点验收事实，仍写明不指定工具、不表示安全审查能力已交付。本节 VISION 登记行的 #6 来源描述同步更新，类别与状态未改。固定层、模板、skill 未改。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入、未删除。#7 试点（yanxue #28）与 #10 的 #19 开工授权不在本票范围，#26 保持 open 继续跟进。评审意见第六节的凭据泄露发现按裁定另票处理（yifangbao#4，私有仓）。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了 #6 关票条件是否两条都成就、VISION #6 句是否仍只记用户收益与边界且不外推、既有登记段与验收段有没有被改写、登记行除 #6 来源描述外有没有被改。
- 依据版本：开工提交 `db941d3`。收尾核对在包含本段的工作区；提交号与本段同一提交，写入时还没有。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。本段写入前检查器为 6/6 PASS、退出码 0（P1 sha256 `ca41a963da97487dee4f95660777b1fc48126405502ed768f205debe2a2a12fd`，P2 blob `b0bfa054107a9a4c18d8e64a500b4db9bae059bb`，P3 version `0.4.0`，P4 links=41 failures=0，P5 agents=6 readme=8，P8 commands=generate,verify）。
- 处理结果：P1、P2、P3、P5、P8 为未发现差异。P4 为未发现差异（本段不新增 Markdown 链接，写入后仍为 6/6 PASS、退出码 0）。固定层正文与 setup 快照为未发现差异（P1，且本轮未授权改这两份文件）。检查器运行前后 `git status` 一致（除本轮两处文档改动与既有未跟踪目录外无其他变化）。
- 未覆盖：yifangbao 仓内产物不在本仓任何声明的来源或目标范围。语义定位器未建设、未运行。hook/CI 未接线、未运行。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入。#6 关票不代表 OCR 成为默认实现，也不代表安全审查能力已在其他仓交付。
- 未决：#7 试点（yanxue #28）与 #10 的 #19 开工授权待推进，由 #26 跟进。yifangbao#4 凭据作废第一步须维护者本人操作。GBK 控制台编码下 yifangbao 两条 import-linter 红线测试误炸为既有环境脆弱点，是否开票修由维护者决定。

2026-09-23（#19）：给 `scripts/check_commit_msg.mjs` 增加可选 `--rules <path>`。不传该参数时仍从脚本所在仓读 `docs/DECISIONS.md`，运行时抽出 §5.1 type，脚本内没有第二份词表。四态与退出码仍是 `format-pass` 0、`format-fail` 1、`not-run` 2、`exec-failed` 3。传入 `--rules` 时用同一抽法读指定文件；文件缺失、不是合法 UTF-8 或抽不出词表为 `exec-failed`。未给出消息文件，或消息文件不存在、不是普通文件时仍是 `not-run`，此时不读规则文件。`docs/agents/commit-msg-check.md` 写明用法与上述边界。固定层、setup 快照、模板、skill 未改。未接 hook/CI，不是门禁，格式通过不等于语义已验证。不表示通用规则引擎或跨仓装配已交付。本段是施工记录，不是验收结论。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了 `--rules` 有没有被写成通用规则引擎、hook/CI 或跨仓装配已交付，历史验收段有没有被改写，登记行有没有把格式检查写成门禁，以及有没有新的纪律决策。
- 依据版本：开工提交 `6ec1badd2db2110d3c7ce8abe4abfe55c682c72f`。收尾核对在包含本段的工作区；本轮不提交，所以还没有收尾提交号。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。Node v24.19.0。本段写入前检查器为 6/6 PASS、退出码 0（P1 sha256 `ca41a963da97487dee4f95660777b1fc48126405502ed768f205debe2a2a12fd`，P2 blob `b0bfa054107a9a4c18d8e64a500b4db9bae059bb`，P3 version `0.4.0`，P4 links=41 failures=0，P5 agents=6 readme=8 failures=0，P8 commands=generate,verify）。当时 `git status` 只有 `docs/agents/commit-msg-check.md`、`scripts/check_commit_msg.mjs` 与既有未跟踪目录。写入本段后复跑仍为 6/6 PASS、退出码 0，P4 links=41 failures=0。
- 处理结果：P1、P2、P3、P4、P5、P8 为未发现差异。P4 登记行只改了既有两行的边界说明，本段不新增 Markdown 链接。固定层正文与 setup 快照为未发现差异（P1，且本轮未授权改这两份文件）。检查器运行前后没有额外改动。
- 未覆盖：任意代码 diff 到文档段落的语义定位器未建设，也未运行。hook/CI 未接线，未运行。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入、未删除。#15 指挥沙箱的 21 项与 #18 隔离仓真实 `git commit` 未整包复跑。外部目标仓未装配。跨会话恢复未测。
- 未决：提交与推送不在本轮授权。`docs/VISION.md` 的 #10 句仍写试点尚未开展；改那一句不在本轮三份文件的授权里，本轮证据也不能写成自动接续已经交付。#10 不因这次施工自动收尾。

2026-09-23（#19 验收收口，指挥补记）：#19 施工已验收通过并提交（`c276e5e`，含 `scripts/check_commit_msg.mjs`、`docs/agents/commit-msg-check.md` 与本册施工段的最初版本）。指挥验收要点：亲手复跑十组缝用例（缺省四态与退出码不变、`--rules` 自定义词表翻转判定、缺失/无词表/缺路径/重复均为 exec-failed、缺省路径跟脚本所在仓）；`check_doc_pairs` 6/6 PASS；同源清单带 `--table` 复验 `table_verified: true`（不带该参数时 `table_verified` 恒 false，是调用口径不是内容不符）。#10 验证层：三次主动接续与三次自然的修正-复验循环在案，隔离负例均已标明，执行方在提交权限处准确停下。`docs/VISION.md` 的 #10 句与本节登记行同步更新为首个验证验收事实（宿主 Cursor 3.21.18 / Windows，单宿主单任务单技能基线，不外推），仍写明不表示无感全自动已交付。固定层、模板、skill 未改。未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入、未删除。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了 VISION #10 句是否仍只记收益与边界且不外推、施工方的登记段有没有被改写、登记行除 #10 来源描述外有没有被改。
- 依据版本：开工提交 `c276e5e`（即 #19 施工提交）。收尾核对在包含本段的工作区；提交号与本段同一提交，写入时还没有。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。本段写入前检查器为 6/6 PASS、退出码 0（P1 sha256 `ca41a963da97487dee4f95660777b1fc48126405502ed768f205debe2a2a12fd`，P2 blob `b0bfa054107a9a4c18d8e64a500b4db9bae059bb`，P3 version `0.4.0`，P4 links=41 failures=0，P5 agents=6 readme=8，P8 commands=generate,verify）。
- 处理结果：P1、P2、P3、P4、P5、P8 为未发现差异。本段不新增 Markdown 链接，写入后复跑仍为 6/6 PASS、退出码 0。固定层正文与 setup 快照为未发现差异（P1，本轮未授权改这两份文件）。检查器运行前后 `git status` 一致。
- 未覆盖：语义定位器未建设、未运行。hook/CI 未接线、未运行。未跟踪目录未纳入。#19 验收只覆盖 Cursor 3.21.18 / Windows 这一宿主与当轮技能基线，不覆盖 Factory Droid、其他宿主或跨会话恢复。
- 未决：#10 保持 open，后续范围（是否换宿主复验、是否扩大验证任务）由维护者裁定。#7 试点 #28 在别的会话进行。yifangbao#4 凭据作废第一步仍须维护者本人操作。

2026-09-23（#8 收口与 #9 核验，指挥补记）：#8 关票条件核验成就——方向已登记 VISION（2026-09-22）、下一阶段施工票 #18 验收关票、其遗留建议 #19 今日验收关票（`--rules` 显式规则文件参数落实裁定第三节「目标仓装配不假定同名文件」）；裁定第四节的脚注词表议题今日立案 #29（§9 议题票，条文在讨论完成前保持原样）；第五节暂缓项维持暂缓。维护者指示收口，#8 已关。关票不表示提交纪律能力已在本仓或目标仓自动生效（检查器仍手动、未接 hook/CI）。**#9 核验结论：关票条件不成就**——其裁定要求 phase-2 含「一个经授权的小型真实项目试用」且阶段验收看真实使用效果；phase-2b 未授权、未做，#9 保持 open。本轮只补记本段，未改 VISION（#8/#9 的愿景句边界措辞仍准确），未改固定层与快照，未跟踪目录 `docs/reviews/2026-09-07-lazypack-harvest/` 未纳入、未删除。

本轮防腐检查记录：

- 检查范围：机器检查 P1、P2、P3、P4、P5、P8。人工阅读了 #8/#9 裁定原文与各自施工票验收记录、关票条件措辞、既有登记段有没有被改写。
- 依据版本：开工提交 `6e75d8f`。收尾核对在包含本段的工作区；提交号与本段同一提交，写入时还没有。声明正文为 `docs/agents/doc-pairs.md`。命令为仓库根 `node scripts/check_doc_pairs.mjs`。本段写入前检查器为 6/6 PASS、退出码 0（P1 sha256 `ca41a963da97487dee4f95660777b1fc48126405502ed768f205debe2a2a12fd`，P2 blob `b0bfa054107a9a4c18d8e64a500b4db9bae059bb`，P3 version `0.4.0`，P4 links=41 failures=0，P5 agents=6 readme=8，P8 commands=generate,verify）。
- 处理结果：P1、P2、P3、P4、P5、P8 为未发现差异。本段不新增 Markdown 链接，写入后复跑仍为 6/6 PASS、退出码 0。检查器运行前后 `git status` 一致。
- 未覆盖：#8/#9 的历史验收（#15/#16/#18/#20）本轮未复跑，引用其当时的验收结论。#29 的 §9 讨论未排期。语义定位器未建设。hook/CI 未接线。未跟踪目录未纳入。另一会话的 #28 线（yanxue）产物不在本段核验范围。
- 未决：#29 待维护者排期 §9 讨论。#9 phase-2b（小型真实项目试用）待维护者授权目标仓。#10 后续范围待裁定（见 #10 回执）。#7 试点 #28 在别的会话进行。yifangbao#4 凭据作废第一步仍须维护者本人操作。
