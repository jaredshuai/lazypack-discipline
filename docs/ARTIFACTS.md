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
| 每轮检查记录与登记册的历史说明 | [ARTIFACTS-log.md](ARTIFACTS-log.md) | 每轮收尾由本轮执行者在最上面追加一个条目；已有条目保持当时的记录，不改写 |
| setup / harvest 实际执行流程 | 对应 [skill 入口](../skills/) 及其直接引用的 references | 实现行为变化时同步改动并验证；愿景变更不等于 skill 已更新 |
| 技术组合的适用条件与候选默认值 | 对应 skill 的 presets | 配方实施时更新，工具与版本事实须核实，不把案例写成强制选型规则 |
| setup 各单元在各操作系统上的验证记录 | 各单元契约（`*.unit.json`）的 `evidence`，规则见 [agents/unit-contracts.md](agents/unit-contracts.md) | 有新的验收或测试记录时改契约并重新生成矩阵；其他文档只链接矩阵，不另写单元的验证状态。没有发生过的验收不写 |
| 访谈的来源、背景、当时的意见 | [interviews/](interviews/) | 经授权保留的去敏整理稿；现行结论链接到权威正文，历史原文不改成今天的决定 |
| 多 AI 提案、互评与主持结论 | [proposals/](proposals/) 放提案原文，[reviews/](reviews/) 按议题归档 | 提案新增时登记其议题与关联 issue；讨论收束时登记具体入口与采纳状态；集合中的一份报告不自动获得现行权威 |
| 跨 Agent 交付与核验的操作指引 | [agents/handoff-verification.md](agents/handoff-verification.md) | 交接机制变动时维护；每轮临时报告仍按固定层放系统临时目录 |
| 本仓文档关系声明（§7.2 对子） | [agents/doc-pairs.md](agents/doc-pairs.md) | 声明增删，或来源、目标范围、检查方式、处理权限变化时，由本轮执行者更新；检查脚本只实现清单并核对四要素在场，不复述正文 |
| 本仓开工/收尾的文档防腐检查 | [agents/freshness-check.md](agents/freshness-check.md) | 识别步骤或五态用词变化时更新。每轮记录写在 [ARTIFACTS-log.md](ARTIFACTS-log.md) 最上面；长证据放系统临时目录。不在本文件复述关系声明 |
| 术语、ADR、演变史、研究、规格草稿、参考素材、编码与发布规则 | [DECISIONS.md §4](DECISIONS.md) 已定义的位置 | 按已有分类执行；路径尚不存在时按任务需要创建，避免预先建空文档 |

## 2. 每轮如何执行

1. **辨认内容和权威。** 先按上表定位，再读对应正文。把用户确认、Agent 推荐、未决问题和验证事实分开。路径已明确且任务已授权时，直接处理，不把文件命名和目录选择再交给用户。
2. **更新正文。** 用户明确的产品方向进入 VISION；仅有讨论的方案留在讨论材料中；实现事实以产品及验收为据。仅为固定层变更提出愿景不能绕过其讨论流程。
3. **同步入口与登记。** 新建或改变正文位置时，同轮更新本册与必要的 README/AGENTS 指针；内容留在一个权威位置，其余引用。对来源明确且本任务授权新建的文档直接登记；对发现的未登记旧材料，仍按固定层 §4.3 核实其权威，不猜测新旧。
4. **处理替代。** 取代某个现行文档时注明新旧关系并更新状态；现有材料按生命周期归档，保留检索入口。移动或删除前核对引用与原有改动，不为整理而清除用户工作。
5. **交付前检查。** 本轮应留存的内容已有落点；新增链接可解析；同类别现行正文唯一；未决建议没有冒充已决定；完成、未实现和未验证分清楚。检查由本轮 Agent 执行，目前没有独立自动检查器保证这些语义。
6. **写当轮记录。** 每轮一个条目，写在 [ARTIFACTS-log.md](ARTIFACTS-log.md)「每轮记录」标题下的最上面，只写 [文档防腐检查 §3](agents/freshness-check.md) 的五项，每项一到两句；命令原文和长输出放系统临时目录。第 3 节的登记行只在路径、类别、状态或关键边界变化时改动，不把当轮经过写进登记行。

需要用户判断的是目标、授权、权威冲突或新的分类边界；已有分类能确定的落点由 Agent 负责。不能因提出了新方向就默认保存原始聊天、秘密或私有材料。

## 3. 已核对的入口登记

状态词沿用固定层 §4.2。类别表示权威范围：愿景、执行指引与历史资料不互相替代。集合登记只提供检索入口，不批准所有子文档；未逐项核对的旧材料保持原样，使用前检查其来源与状态。

「依据与边界」一列每行只写一句用途加最关键的边界，不超过 80 个汉字。2026-11 缩短前的完整说明保存在 [ARTIFACTS-log.md](ARTIFACTS-log.md) 的原始说明快照里，只作历史记录。

| 路径 | 类别 | 状态 | 依据与边界 |
|---|---|---|---|
| [VISION.md](VISION.md) | 产品愿景 | current | 产品为什么存在、为用户省什么事和取舍原则的唯一正文。只记目标与取舍，各条目标不表示对应能力已交付 |
| [adr/001-template-first.md](adr/001-template-first.md) | 产品路线 ADR | current | #94 模板优先路线的取舍缘由，取代 VISION 原“先纪律自动化、后模板”路线。现行政策只在 VISION，不代表新增能力已验收 |
| [DECISIONS.md](DECISIONS.md) | 固定层纪律 | current | 已生效的跨项目固定层纪律。版本见文首，变更按其 §9 |
| [ARTIFACTS.md](ARTIFACTS.md) | 本仓文档归属 | current | 本仓内容归属、每轮执行方式和入口登记。每轮记录与缩短前的说明原文在 [ARTIFACTS-log.md](ARTIFACTS-log.md) |
| [ARTIFACTS-log.md](ARTIFACTS-log.md) | 本仓登记册追加日志 | current | 每轮防腐检查记录（新记录写最上面）和 2026-11 第 3 节原始说明快照。只存记录，不决定任何文档的归属或状态；已有条目不改写 |
| [../AGENTS.md](../AGENTS.md) | 本仓 AI 入口 | current | 本仓 AI 开工入口，只提供读取指针：登记册、防腐检查、关系声明、愿景、固定层等。不复述政策 |
| [../README.md](../README.md) | 对外导航 | current | 仓库对外总入口与产品摘要，区分支持边界与验证状态，现行政策指向 VISION。能力说明不代替验收 |
| [agents/handoff-verification.md](agents/handoff-verification.md) | 给 agent 的按需说明 | current | 跨 Agent 交付与核验指引。raw 字节是第一权威；仅换行差异、仅 BOM 差异各自分类，都不算通过 |
| [../scripts/handoff_manifest.js](../scripts/handoff_manifest.js) | 本仓执行辅助 | current | 只读生成与核验交接清单。仅换行或仅 BOM 的差异单独分类，退出码仍非零。未接 hook/CI |
| [../scripts/handoff_bom_classify_repro.js](../scripts/handoff_bom_classify_repro.js) | 本仓执行辅助 | current | 上述差异分类的手动回归，在系统临时目录写夹具，不改仓库。未接 hook/CI，不是门禁 |
| [agents/doc-pairs.md](agents/doc-pairs.md) | 给 agent 的按需说明 | current | 本仓项目层文档关系声明（P1–P5、P8–P11）的唯一正文，每条写明来源、目标范围、检查方式、处理权限。不是跨项目固定层 |
| [agents/freshness-check.md](agents/freshness-check.md) | 给 agent 的按需说明 | current | 本仓开工识别核对范围、收尾留五项记录的流程。检查器手动运行，未接 hook/CI；流程写明不等于日常自动维护已交付 |
| [../skills/lazypack-setup/scripts/managed_blocks.mjs](../skills/lazypack-setup/scripts/managed_blocks.mjs) | setup 随包执行辅助 | current | 角色等产物的留存段渲染、托管块写入与最终字节核验，保留块外原始字节。不执行项目命令，不配置 Git |
| [../scripts/test_managed_blocks.mjs](../scripts/test_managed_blocks.mjs) | 本仓回归测试 | current | 托管块写入的回归测试，用临时无害夹具；经 tests.yml 在 PR 与 main 上运行。不代表真实宿主交互已复验 |
| [../scripts/check_doc_pairs.mjs](../scripts/check_doc_pairs.mjs) | 本仓执行辅助 | current | 只读检查上述关系声明：先核对编号与四要素在场，再逐条执行，缺字段或未实现记 FAIL。手动运行，未接 hook/CI，不是门禁 |
| [../scripts/test_check_doc_pairs.mjs](../scripts/test_check_doc_pairs.mjs) | 本仓执行辅助 | current | 关系检查器 P4 的测试（#117）：临时夹具加子进程运行，只断言 P4 一行；经 tests.yml 在 PR 与 main 上运行 |
| [agents/commit-msg-check.md](agents/commit-msg-check.md) | 给 agent 的按需说明 | current | 提交说明格式只读检查的口径（固定层 §5.1 标题形状与 type 词表）。格式通过不等于语义已验证；本仓手动运行，不是门禁 |
| [agents/section9-discussion-protocol.md](agents/section9-discussion-protocol.md) | 给 agent 的按需说明 | current | §9 多 AI 讨论的操作规程（角色、分轮流程、路径与交付通道），§9 本身是原则层。与 setup 分发模板按 P11 字节同源 |
| [agents/iteration-scope.md](agents/iteration-scope.md) | 给 agent 的按需说明 | current | 迭代范围的行为指引（0.7.0）：两条对称禁令与粒度建议。可判定的上限在固定层 §6.5，本文件只是倡导 |
| [../scripts/check_commit_msg.mjs](../scripts/check_commit_msg.mjs) | 本仓执行辅助 | current | 只读检查提交说明标题格式，type 词表运行时从固定层 §5.1 抽取，`--rules` 可改读别的文件。本仓手动运行，未接 hook/CI |
| [../scripts/test_check_commit_msg.mjs](../scripts/test_check_commit_msg.mjs) | 本仓执行辅助 | current | 提交说明格式检查器的测试，临时夹具加子进程运行；经 tests.yml 在 PR 与 main 上运行 |
| [../.github/workflows/droid.yml](../.github/workflows/droid.yml) | 本仓执行辅助 | current | Factory Droid 点名审查（#78）：PR 普通评论可触发，行内评论与审查限本仓分支 PR。需仓库 secret；不是门禁，结果只作参考 |
| [../.github/workflows/droid-review.yml](../.github/workflows/droid-review.yml) | 本仓执行辅助 | current | Factory Droid 自动审查（#78）：本仓分支的非 draft PR 打开或转为可评审时触发。需仓库 secret；不是门禁，结果只作参考 |
| [../.github/workflows/tests.yml](../.github/workflows/tests.yml) | 本仓执行辅助 | current | 本仓测试 CI（#105）：跑 fast、integration，及三系统上的净室（#109）与管线入口（#114）测试。不跑检查器，非必需检查 |
| [../scripts/run_tests.mjs](../scripts/run_tests.mjs) | 本仓执行辅助 | current | 本仓测试单一入口（#105）：依次运行各测试文件并汇总退出码。`--fast` 跳过两个需夹具依赖的集成测试并列为 SKIP |
| [../.github/workflows/qodercn-review.yml](../.github/workflows/qodercn-review.yml) | 本仓执行辅助 | current | Qoder CN 自动审查：直接运行国内版 CLI，禁用工具且环境内无 GitHub 令牌，仅本仓分支非 draft PR。不是门禁，结果只作参考 |
| [../.github/workflows/multica-issue-pilot.yml](../.github/workflows/multica-issue-pilot.yml) | 本仓事件触发辅助 | current | Issue 评论 `/multica pilot` 转发到 Multica 的冒烟入口，仅维护者可触发，Runner 无仓库写权限。不是门禁 |
| [../.github/workflows/multica-issue-discussion.yml](../.github/workflows/multica-issue-discussion.yml) | 本仓个人调度辅助（非产品功能） | current | 维护者专用 `/multica discuss`，向已有 Multica Autopilot 分发讨论角色。只服务本仓讨论；首次真实触发尚待验收 |
| [../skills/lazypack-setup/SKILL.md](../skills/lazypack-setup/SKILL.md) | setup 执行入口 | current | setup 执行流程的入口正文，以本仓磁盘正文为准。不代表所有宿主或目标仓已实测通过 |
| [../skills/lazypack-setup/references/document-routing.md](../skills/lazypack-setup/references/document-routing.md) | 文档路由规范 | current | 既有文档的知识区归属、原位保留登记与受控迁移规约。preserve-existing 只在限定沙箱验收，通用生产迁移仍未证明 |
| [../skills/lazypack-setup/scripts/verify_hook_install.mjs](../skills/lazypack-setup/scripts/verify_hook_install.mjs) | setup 执行辅助 | current | #85 原生 pre-commit Hook 的只读静态验收。不执行真实 Hook，通过不等于运行时已验证；Windows 宿主未验收 |
| [../skills/lazypack-setup/scripts/doc_scanner.mjs](../skills/lazypack-setup/scripts/doc_scanner.mjs) | setup 执行辅助 | current | 有界 Markdown 扫描与引用图构建，含排除目录、敏感文件与符号链接越界防护。只在隔离沙箱与本仓只读扫描验证，不代表目标仓生产级迁移 |
| [../skills/lazypack-setup/scripts/doc_plan.mjs](../skills/lazypack-setup/scripts/doc_plan.mjs) | setup 执行辅助 | current | 文档迁移计划生成器，带双指纹与留存策略快照。只在 Windows 隔离夹具验证，不代表目标仓生产级自动迁移 |
| [../skills/lazypack-setup/scripts/doc_executor.mjs](../skills/lazypack-setup/scripts/doc_executor.mjs) | setup 执行辅助 | current | 双指纹绑定的受控迁移执行器，执行前复核计划完整性与排除集合，含补偿回滚。不宣称系统级抗崩溃原子性，只在隔离沙箱验证 |
| [../skills/lazypack-setup/scripts/doc_helper.mjs](../skills/lazypack-setup/scripts/doc_helper.mjs) | setup 执行辅助 | current | scan/plan/exec 的调度入口。只在 Windows/AGY 隔离沙箱验证，不代表目标仓生产级自动迁移 |
| [../skills/lazypack-setup/scripts/doc_retention_policy.mjs](../skills/lazypack-setup/scripts/doc_retention_policy.mjs) | setup 执行辅助 | current | #84 留存策略载体的只读快照与结构验证，供计划器和执行器共用。不把正文解析成 retention JSON，不读 raw_qa 内容 |
| [../skills/lazypack-setup/scripts/package_manifest.mjs](../skills/lazypack-setup/scripts/package_manifest.mjs) | setup 执行辅助 | current | #108 包清单生成与包检查（清单、链接、源路径、本仓引用、LF、单元契约六项），只读 skill 目录。装配前运行，失败即停止 |
| [../skills/lazypack-setup/MANIFEST.json](../skills/lazypack-setup/MANIFEST.json) | setup 派发工具 | current | #108 分发清单：包内每个文件的路径与 sha256、工具脚本版本。由包清单脚本的 generate 生成，包内文件改动后须重新生成 |
| [../skills/lazypack-setup/scripts/unit_contracts.mjs](../skills/lazypack-setup/scripts/unit_contracts.mjs) | setup 执行辅助 | current | #111 单元契约校验与矩阵生成：查字段、包内引用、版本、覆盖和矩阵是否过期。不运行验证命令，不联网核对出处链接 |
| [../skills/lazypack-setup/lazypack-core.unit.json](../skills/lazypack-setup/lazypack-core.unit.json) | setup 执行辅助 | current | #111 单元契约，共五份：本文件管通用纪律产物，另四份在 presets/、recipes/ 的卡片旁。只放可判定事实，装配口径以卡片正文为准 |
| [../skills/lazypack-setup/references/unit-matrix.md](../skills/lazypack-setup/references/unit-matrix.md) | setup 执行辅助 | current | #111 「单元 × 操作系统」验证记录表，由契约证据生成，不手改。「未验证」表示没有可公开核对的记录；不含文档迁移引擎 |
| [../skills/lazypack-setup/scripts/setup_helper.mjs](../skills/lazypack-setup/scripts/setup_helper.mjs) | setup 执行辅助 | current | #114 管线入口：scan 探测既有门禁命令，plan 重扫比对后整条分槽。只迁入第 2 步第 4 项，不读 definition 拆命令 |
| [../skills/lazypack-setup/references/setup-pipeline.md](../skills/lazypack-setup/references/setup-pipeline.md) | setup 执行辅助 | current | 管线事实、回答、计划文件格式与入口用法，随迁移步骤增补。只写已落地部分，未迁入的注明「尚未迁入」 |
| [../scripts/test_setup_helper.mjs](../scripts/test_setup_helper.mjs) | 本仓执行辅助 | current | #114 管线入口回归：聚合脚本夹具，断言既有命令逐字入槽、不展开，含反向用例；经 tests.yml 三系统运行 |
| [../scripts/test_doc_retention.mjs](../scripts/test_doc_retention.mjs) | 本仓执行辅助 | current | #84 留存策略的隔离回归，含 Junction 与硬链接实际夹具；经 tests.yml 在 PR 与 main 上运行。未执行真实 setup 顺序 |
| [../scripts/test_verify_hook_install.mjs](../scripts/test_verify_hook_install.mjs) | 本仓执行辅助 | current | #85 Hook 静态验收的隔离 Git 回归，只在临时无害夹具执行，不调用真实 Hook；经 tests.yml 运行。完整 Windows 安装仍未验证 |
| [../scripts/test_aggregate_gates.mjs](../scripts/test_aggregate_gates.mjs) | 本仓执行辅助 | current | #86 原生 Git Hook 聚合门禁的隔离回归，只执行自建无害夹具，不调用真实业务 Hook；经 tests.yml 在 PR 与 main 上运行 |
| [../scripts/test_doc_scanner.mjs](../scripts/test_doc_scanner.mjs) | 本仓执行辅助 | current | #70、#83 扫描排除与链接越界防护的回归，用临时合成夹具；经 tests.yml 运行。不代表真实目标仓 setup 或 POSIX 实机验收 |
| [../skills/lazypack-harvest/SKILL.md](../skills/lazypack-harvest/SKILL.md) | harvest 执行入口 | current | harvest 执行流程的入口正文，显式调用边界由该 skill 定义。本仓没有冻结规格 SPEC.md |
| [../scripts/calculate_crap.mjs](../scripts/calculate_crap.mjs) | 本仓执行辅助 | current | CRAP 计算器 CLI（#42）：读覆盖率与圈复杂度报告，输出文本摘要与 JSON，默认阈值 6，支持 TypeScript 与 Python |
| [../scripts/test_calculate_crap.mjs](../scripts/test_calculate_crap.mjs) | 本仓执行辅助 | current | CRAP 计算器的测试，临时夹具加子进程运行；经 tests.yml 在 PR 与 main 上运行 |
| [../scripts/test_skill_package.mjs](../scripts/test_skill_package.mjs) | 本仓执行辅助 | current | #108 包检查的回归测试：单独拷出 skill 目录仍通过，清单漂移、断链、源路径缺失、含 CR 等情形失败；经 tests.yml 运行 |
| [../scripts/test_clean_room_install.mjs](../scripts/test_clean_room_install.mjs) | 本仓执行辅助 | current | #109 净室安装测试：只拷出 skill 目录，对两份全新夹具装配，断言产物并确认重跑不改文件。经 tests.yml 的 clean-room 作业在三个系统运行；不执行 AI 环节 |
| [../scripts/test_unit_contracts.mjs](../scripts/test_unit_contracts.mjs) | 本仓执行辅助 | current | #111 单元契约的回归测试：删任一必填字段、引用缺失、版本不符、覆盖缺口、矩阵过期等情形都失败；经 tests.yml 运行 |
| [../skills/lazypack-setup/assets/mutation/scripts/mutation-baseline.mjs](../skills/lazypack-setup/assets/mutation/scripts/mutation-baseline.mjs) | setup 派发工具 | current | 变异分数基线 CLI（夜跑闭环 M1）：init 冻结、check 比较、update 只涨不跌，读写基线文件。零 npm 依赖 |
| [../scripts/test_mutation_baseline.mjs](../scripts/test_mutation_baseline.mjs) | 本仓执行辅助 | current | 变异基线工具的测试，临时夹具加子进程运行；经 tests.yml 在 PR 与 main 上运行 |
| [../skills/lazypack-setup/assets/mutation/scripts/parse-stryker-report.mjs](../skills/lazypack-setup/assets/mutation/scripts/parse-stryker-report.mjs) | setup 派发工具 | current | Stryker JSON 报告解析器（夜跑闭环 M2）：提取存活变异体并转成统一变异体报告 v1.1。零 npm 依赖 |
| [../scripts/test_parse_stryker.mjs](../scripts/test_parse_stryker.mjs) | 本仓执行辅助 | current | Stryker 报告解析器的测试，临时夹具加子进程运行；经 tests.yml 在 PR 与 main 上运行 |
| [../skills/lazypack-setup/assets/mutation/scripts/parse_mutmut_report.py](../skills/lazypack-setup/assets/mutation/scripts/parse_mutmut_report.py) | setup 派发工具 | current | mutmut 结果解析器（夜跑闭环 M2）：读文本捕获、导出 JSON 或缓存库，转成统一变异体报告 v1.1。只用 Python 标准库 |
| [../scripts/test_parse_mutmut.py](../scripts/test_parse_mutmut.py) | 本仓执行辅助 | current | mutmut 报告解析器的测试，临时夹具加子进程运行；经 tests.yml 在 PR 与 main 上运行 |
| [../skills/lazypack-setup/assets/mutation/scripts/create-mutation-issues.mjs](../skills/lazypack-setup/assets/mutation/scripts/create-mutation-issues.mjs) | setup 派发工具 | current | 补测 issue 创建 CLI（夜跑闭环 M2）：读统一报告、套用等价变异体豁免，按文件分组建 issue 并写队列文件。默认实跑，`--dry-run` 预览 |
| [../scripts/test_create_issues.mjs](../scripts/test_create_issues.mjs) | 本仓执行辅助 | current | 补测 issue 创建脚本的测试，离线替换 gh，临时夹具加子进程运行；经 tests.yml 在 PR 与 main 上运行 |
| [../scripts/test_nightly_loop.mjs](../scripts/test_nightly_loop.mjs) | 本仓执行辅助 | current | 夜跑变异闭环的端到端测试：用 TS、Python 两个夹具在临时沙箱各走一遍完整闭环。需夹具依赖，经 tests.yml 的 integration 作业运行 |
| [../scripts/test_workflow_templates.mjs](../scripts/test_workflow_templates.mjs) | 本仓执行辅助 | current | 夜跑 workflow 模板的验证：act 不可用时的等效做法，用夹具组装测试仓库逐步核对。经 tests.yml 的 integration 作业运行 |
| [../scripts/test_nightly_loop_validators.mjs](../scripts/test_nightly_loop_validators.mjs) | 本仓执行辅助 | current | 端到端脚本内联校验器的离线单测，复用其导出的校验器；经 tests.yml 在 PR 与 main 上运行 |
| [../scripts/fixtures/sample-ts/](../scripts/fixtures/sample-ts/) | 本仓执行辅助 | current | 夜跑闭环的 TypeScript/Stryker 端到端夹具：故意欠测试的微型项目，价值在存活变异体。依赖与运行产物不入库 |
| [../scripts/fixtures/sample-py/](../scripts/fixtures/sample-py/) | 本仓执行辅助 | current | 夜跑闭环的 Python/mutmut 2.x 端到端夹具：故意欠测试的微型项目，价值在存活变异体。venv 与运行产物不入库 |
| [../scripts/fixtures/clean-room/](../scripts/fixtures/clean-room/) | 本仓执行辅助 | current | 净室安装测试的夹具：全新 TypeScript、全新 Python 各一份目标仓和预置回答文件 answers.json。不含依赖，不是存量仓样本 |
| [../scripts/fixtures/setup-pipeline/](../scripts/fixtures/setup-pipeline/) | 本仓执行辅助 | current | 管线入口测试（#114）的夹具：已有聚合脚本的 TypeScript 仓、判断文件和预置回答。不含依赖 |
| [../.vscode/tasks.json](../.vscode/tasks.json) | 本仓执行辅助 | current | 夜跑闭环的 VS Code 手动触发任务模板。VS Code 原生不支持定时任务，只能手动触发；依据见同表的定时任务调研报告 |
| [research/vscode-scheduled-tasks.md](research/vscode-scheduled-tasks.md) | 给 agent 的按需说明 | current | VS Code 定时任务调研报告（2026-10-06 快照）：原生没有时间触发器。官方文档与扩展状态会过时，复用前重新核对 |
| [research/recipe-interaction-patterns.md](research/recipe-interaction-patterns.md) | 给 agent 的按需说明 | current | setup 配方交互模式对照研究笔记，横向比对两个随包 preset（v0.1.0 快照）。随附研究材料，正文未声明交付票 |
| [../skills/lazypack-setup/recipes/react-vite-app-shell.md](../skills/lazypack-setup/recipes/react-vite-app-shell.md) | setup 配方 | current | #72 首个可复现 UI 标准装配配方（v1.0.1）：App Shell 1 加 shadcn Base Nova。只在记录的环境与起始副本实测，不外推 |
| [../skills/lazypack-setup/assets/react-vite-app-shell-1/](../skills/lazypack-setup/assets/react-vite-app-shell-1/) | 官方起始模板 | current | #72 起始副本（0.1.0）：任务目录页加 App Shell 1，`SHA256SUMS` 固定关键文件。按钮、路由、API 均未接线 |
| [../skills/lazypack-setup/assets/mutation/workflows/nightly-mutation-ts.yml](../skills/lazypack-setup/assets/mutation/workflows/nightly-mutation-ts.yml) | setup 派发工具 | current | 夜跑闭环的 GitHub Actions 定时 workflow 模板（TypeScript/Stryker）。工具脚本须随迁，基线文件须提交进版本库 |
| [../skills/lazypack-setup/assets/mutation/workflows/nightly-mutation-py.yml](../skills/lazypack-setup/assets/mutation/workflows/nightly-mutation-py.yml) | setup 派发工具 | current | 夜跑闭环的 GitHub Actions 定时 workflow 模板（Python/mutmut 2.x），与 TS 模板同构。同仓启用宜错峰 |
| [../skills/lazypack-setup/assets/mutation/scripts/nightly-mutation-runner.sh](../skills/lazypack-setup/assets/mutation/scripts/nightly-mutation-runner.sh) | setup 派发工具 | current | 夜跑闭环的本地 cron/systemd 包装脚本：一条命令串起变异测试、解析、基线检查与建 issue。须保持 LF |
| [../skills/lazypack-setup/assets/mutation/config/crontab.example](../skills/lazypack-setup/assets/mutation/config/crontab.example) | setup 派发工具 | current | 夜跑闭环的 crontab 示例：TS 02:00、PY 03:30 错峰（本机时区），调用包装脚本。含占位符，使用前须替换 |
| [../skills/lazypack-setup/assets/mutation/config/mutation-testing.service](../skills/lazypack-setup/assets/mutation/config/mutation-testing.service) | setup 派发工具 | current | 夜跑闭环的 user 级 systemd service 模板（无需 root），调用包装脚本。含占位路径，使用前须替换 |
| [../skills/lazypack-setup/assets/mutation/config/mutation-testing.timer](../skills/lazypack-setup/assets/mutation/config/mutation-testing.timer) | setup 派发工具 | current | 夜跑闭环的 user 级 systemd timer 模板，每天本地时间 02:00 触发同名 service，与 Actions 的 UTC 口径不同 |
| [quality-gates/mutation-testing.md](quality-gates/mutation-testing.md) | 给 agent 的按需说明 | current | 变异测试运营手册（#42）：阈值冻结策略、等价变异体豁免流程、胶水代码边界 |
| [quality-gates/nightly-mutation-loop.md](quality-gates/nightly-mutation-loop.md) | 给 agent 的按需说明 | current | 夜跑变异闭环运营指引：GitHub Actions、cron、systemd、VS Code 的设置与基线管理。本仓不运行该闭环，不表示任何目标项目已装配 |
| [formats/unified-mutation-report.md](formats/unified-mutation-report.md) | 给 agent 的按需说明 | current | 统一变异体报告格式契约 v1.1，是两个解析器的输出契约 |
| [formats/mutation-baseline.md](formats/mutation-baseline.md) | 给 agent 的按需说明 | current | 基线文件契约 v1.0（`.mutation-baseline.json`），是基线工具的读写契约。更换工具或变异范围须重新 init |
| [formats/equivalent-mutants.md](formats/equivalent-mutants.md) | 给 agent 的按需说明 | current | 等价变异体豁免文件契约 v1.0，是建 issue 工具豁免过滤的读取契约。运营手册 §2.4 的内联格式不是本契约 |
| [formats/mutation-issue-template.md](formats/mutation-issue-template.md) | 给 agent 的按需说明 | current | 补测 issue 模板契约 v1.0：按文件分组，产出 GitHub issue 与机读队列文件两路输出，是建 issue 工具的输出契约 |
| [../CHANGELOG.md](../CHANGELOG.md) | 本仓对外变更记录 | current | 本仓对外变更记录，非受管文件。版本区段由 `changelog.mjs release` 从提交历史编译；手动运行，文件存在不等于后续区段会自动生成 |
| [agents/changelog-tool.md](agents/changelog-tool.md) | 给 agent 的按需说明 | current | `templates/changelog.mjs` 的唯一判定口径：子命令、退出码、check 结构、release 的提交映射与 setup 播种边界 |
| [agents/clean-room-install.md](agents/clean-room-install.md) | 给 agent 的按需说明 | current | 净室安装测试（#109）的范围与步骤覆盖表：SKILL.md 各步哪些有确定性入口、哪些由测试代做、哪些未覆盖。步骤编号由测试核对；是 #113 的输入 |
| [agents/unit-contracts.md](agents/unit-contracts.md) | 给 agent 的按需说明 | current | 单元契约（#110、#111）的字段、校验项、证据收录规则与已知局限，以及没有收进矩阵的历史记录和原因 |
| [../skills/lazypack-setup/templates/changelog.mjs](../skills/lazypack-setup/templates/changelog.mjs) | setup 派发工具 | current | CHANGELOG 播种、结构校验与发版编译的实现。setup 原样复制到目标仓，已存在则保留。结构合规不等于条目由提交真实生成 |
| [agents/report-layers.md](agents/report-layers.md) | 给 agent 的按需说明 | current | 交付报告「用户体验与证据分层」段落的唯一判定口径：何时必填、层标签、状态词与字段规则。源于 #32、#33 |
| [../skills/lazypack-setup/templates/check_report_layers.mjs](../skills/lazypack-setup/templates/check_report_layers.mjs) | setup 派发工具 | current | 分层段落播种与结构校验的实现。setup 原样复制到目标仓，已存在则保留。结构合规不等于报告陈述真实 |
| [interviews/2026-09-04-founding-interview.md](interviews/2026-09-04-founding-interview.md) | 立项来源 | reference | 历史去敏访谈，不覆盖现行愿景与纪律 |
| [proposals/](proposals/) | 讨论材料入口 | reference | §9 固定层讨论的提案原文入口。提案不等于已采纳；子文档状态各自核实，不把整个目录当实施基线 |
| [proposals/issue-71-acceptance-oracle.md](proposals/issue-71-acceptance-oracle.md) | 讨论材料 | reference | #71 验收基准冻结提案原文，状态「待讨论」。未收束，不是条文生效依据 |
| [proposals/issue-29-commit-footer-semantics.md](proposals/issue-29-commit-footer-semantics.md) | 讨论材料 | reference | #29 commit 脚注语义提案原文。讨论已收束，现行条文是 DECISIONS §5.1（0.6.0）；提案原文没有现行效力 |
| [reviews/2026-01-07-commit-footer-semantics/](reviews/2026-01-07-commit-footer-semantics/) | 讨论留档 | current | #29「Commit 脚注词表语义」§9 讨论留档，`RULING.md` 记维护者裁定，0.6.0 生效依据。不表示下游目标仓已取得 0.6.0 快照 |
| [reviews/](reviews/) | 讨论材料集合入口 | reference | 讨论留档集合入口，索引见 [reviews/README.md](reviews/README.md)。子文档状态各自核实，不把整个目录当实施基线 |
| [reviews/README.md](reviews/README.md) | 讨论留档索引 | current | 讨论留档索引（#118）：六个讨论目录各一行，指向裁决或综述文件和固定层版本。只是检索入口，不改写原文，不决定议题状态 |
| [reviews/2026-09-10-document-homes-adoption/](reviews/2026-09-10-document-homes-adoption/) | 讨论留档 | current | 文档归属正式采纳三轮会议留档、表决与维护者裁定，0.3.0 生效依据 |
| [reviews/2026-09-22-release-tag-semantics/](reviews/2026-09-22-release-tag-semantics/) | 讨论留档 | current | §5.7 发版与标签语义修订 §9 会议留档，维护者已裁定批准，0.4.0 生效依据。本仓自生效提交起打 v0.4.0，0.3.0 不追溯补标 |
| `docs/reviews/2026-09-07-lazypack-harvest/`（历史登记路径，当前工作区与 Git 树均不存在） | 讨论留档 | reference | 历史登记路径，目录已不存在，去向未核实，不当作可访问入口。现行 harvest 入口是 skills/lazypack-harvest/SKILL.md |
| [reviews/2026-10-06-prompt-lean-tool-rich/](reviews/2026-10-06-prompt-lean-tool-rich/) | 讨论留档 | reference | 「提示词瘦、工具肥」提案（#36）会议材料。本册此前登记为讨论未收束，与 DECISIONS 版本历史 0.5.0 行不一致，待维护者核对 |
| [reviews/2026-09-05-lazy-setup/](reviews/2026-09-05-lazy-setup/) | 讨论留档 | current | 「Lazy setup 大方案」§9 讨论留档，`vote.md` 与 `synthesis.md` 为收束文件，生效版本 0.2.0。不表示已在目标仓交付 |
| [reviews/2026-10-06-iterative-dev-architecture/](reviews/2026-10-06-iterative-dev-architecture/) | 讨论留档 | current | 「迭代开发与架构复盘」§9 会议留档（#41、#40），维护者裁定见 `round-2/FINAL-RULINGS.md`，0.7.0 生效依据 |

## 4. 每轮记录

每轮记录在 [ARTIFACTS-log.md](ARTIFACTS-log.md)，新记录写在最上面。
