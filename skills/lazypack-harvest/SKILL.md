---
name: lazypack-harvest
description: >-
  Extract engineering discipline friction and unwithdrawn proposals from the current visible session and submit standardized issues to jaredshuai/lazypack-discipline. Use ONLY when explicitly invoked by the user (e.g. via "/lazypack-harvest" or direct user request to harvest discipline issues). Do not auto-trigger on natural language discussions of harvest.
---

# /lazypack-harvest: 工程纪律自提炼传感器

本技能是 `lazypack-discipline` 规则体系的外部自提炼传感器。当且仅当用户**明确手动触发**时执行，分析当前会话暴露的纪律摩擦或未撤回改进提议，经深度脱敏后向公开仓库提交标准 Issue，为懒人包条文的迭代与分诊（Matt triage）提供真实土壤。

---

## 核心原则与边界限制

1. **真实传感器，不越权裁决**：
   - 忠实于当前会话可见事实与用户最终意图。
   - 提交的 Issue 标签锁定为 `harvest`，严禁打上 `ready-for-agent`，不代替维护者 Matt 的 triage 分诊流程。
2. **零侵入与来源状态保持（Preserve Existing State）**：
   - 业务项目仓库**严格只读**。绝不暂存、修改、创建或删除业务项目中的任何文件。
   - 严格保留来源项目已有的任何状态（未跟踪文件、未暂存修改等），严禁擅自清理。
   - 所有的抽取草稿、记账状态与临时数据**仅写入宿主系统临时目录**（如 `os.tmpdir()/lazypack-harvest/`）。
3. **可见会话边界**：
   - 仅处理**当前会话可见上下文**。严禁扫描历史会话数据库或外部无关日志。
4. **按可独立处理问题拆分，相关证据合并**：
   - 拆分基准为“可否独立处理（不同修复单元/不同分诊走向）”，绝不按条款编号机械切割。
   - 围绕同一核心摩擦点的多次报错、讨论和推演，**一律合并到同一条候选的证据摘要中**。

---

## 执行步骤与操作规范

### 步骤 1：扫描当前会话并进行事实勘误分流
1. 检视当前可见会话历史，区分真实工程纪律摩擦 vs 业务逻辑代码调试。
2. **剔除已勘误错误**：若 AI 在前半段误判报错，但在后半段已定位澄清并纠正事实（如证实文件存在），该摩擦已作废，予以剔除（参考 [dispatch_lifecycle.md](./references/dispatch_lifecycle.md)）。
3. **保留固定层异议**：用户针对固定层的主观抱怨或改动提议（如关于 SemVer 晋升策略的异议），只要未被用户主动撤回，一律忠实提炼并交由 Matt triage 裁决。
4. **过滤仅有敏感词的输入**：若会话仅出现敏感路径、AKIA 密钥或私有包名，而无纪律摩擦与未撤回提议，判定为 `NO_CANDIDATE` 友好退出，**严禁凭脱敏造票**（参考 [sanitization.md](./references/sanitization.md)）。注意：候选门槛由宿主 agent 审视会话事实判定，无关键词不代表无候选，含“门禁”不代表有候选，不可由固定词表代替判定。
5. 若存在 0 个有效候选，直接输出 `NO_CANDIDATE` 并退出。

### 步骤 2：按独立问题拆分与证据聚合
1. 将有效的纪律摩擦拆分为 $N$ 个互相独立的候选（每个对应一个可独立处理单元）。
2. 将每个问题对应的多轮讨论、上下文、终端报错摘要合并归集到该候选条目下。

### 步骤 3：深度脱敏与五要素正文构造
1. 对每个候选的标题、正文、查重检索串执行强制脱敏：
   - 抹除 Windows/Unix 绝对路径（替换为 `<DIR/PATH>`）。
   - 抹除 API 密钥、Access Token、私有包作用域、个人邮箱与私有 IP。
   - 可调用内置 helper [sanitize_helper.js](./scripts/sanitize_helper.js) 执行正则模式置换与合规检查；helper 仅为已知模式的补充检测信号（`noKnownViolations`），不等于批准发送。宿主 agent 还必须主动审查未被模式覆盖的项目名称、私有路径及上下文语义。无法满足规则则阻断。
   - 查重检索串必须由泛化后的抽象概念构造，严禁将原始敏感会话或凭据发送至搜索接口。
2. 严格按五要素模板构造 Markdown 正文（参考 [body_template.md](./references/body_template.md)）：
   - **1. 来源项目类型**（泛化架构，不写项目名）
   - **2. 会话日期**（YYYY-MM-DD 或 "未知"）
   - **3. 观察到的疼（摩擦现象）**（如实记录；仅凭无终端日志不得写“没有执行报错”，限注明“本会话无可核验日志，不代表现场未发生问题”）
   - **4. 建议改哪层哪条**（指出具体条款或标注待 triage）
   - **5. 证据摘要**（脱敏后的关键日志或未撤回提议；**严禁捏造门禁语法冲突**）
3. 计算候选指纹 `CANDIDATE_FP`：可调用 [status_engine.js](./scripts/status_engine.js) 的 `generateCandidateFingerprint(clause, pain)`。

### 步骤 4：前置依赖核验与标签核对
在发起任何外发网络创建请求前：
1. 核验当前环境对目标仓 `jaredshuai/lazypack-discipline` 是否具备可用写通道（如 `gh` CLI 或写入连接器）。
2. 若环境离线或缺乏写入通道，将全部候选保存为本地脱敏草稿，标记为 `CANDIDATE_DRAFT`（附带 `blocked_by_dependency: true`），批次汇总为 **`DEPENDENCY_BLOCKED`**。
3. 动态查询目标仓库是否存在 `harvest` 标签（以当次实际查询为准）：
   - 若查询失败或证实不存在该标签：**严禁自动创建标签，严禁发送无标签 Issue**！保存本地草稿，输出建标指引，批次汇总为 **`DEPENDENCY_BLOCKED`**。

### 步骤 5：逐条顺序发送与事务安全控制
按顺序同步逐个处理候选（参考 [dispatch_lifecycle.md](./references/dispatch_lifecycle.md)）：
1. **历史关联未知项核对与账本异常处置（针对再次触发运行 R2 或前置核验）**：
   - 若本地临时记账遇到读取失败、损坏或不可读：先保留现有文件原始字节不覆盖，报告读取/持久化受阻；发送前不得依据损坏账本的空结果直接创建；能做的只读核对优先，无确证则保留未决；未发起创建请求不标远端 `RESULT_UNKNOWN`；
   - 若本地临时记账正常且检测到与本候选关联的历史 `CANDIDATE_UNKNOWN` 记录，优先发起已授权只读核验；
   - 若证实已创建：更新为 `CANDIDATE_PUBLISHED` 并获得 URL，放行后续独立候选；
   - 若未证实：阻断该相同问题重发，但**不阻断其他独立候选**的推进。
2. **查重处置**：
   - 证实重复（持有已验证 URL）：标记 `CANDIDATE_DUPLICATE_CONFIRMED`，跳过发送，推进下一条；
   - 疑似重复（URL 未证实）：标记 `CANDIDATE_DUPLICATE_SUSPECTED`，跳过发送，输出警示；
   - 此前未发送的草稿（`CANDIDATE_DRAFT`）或明确被拒项（`CANDIDATE_REJECTED`）在依赖恢复后**允许正常发送，不因草稿存在而阻断**。
3. **发起创建请求**：
   - **创建成功**：获取 URL。尝试写入本地临时记账。
     - 若本地写入成功：记 `CANDIDATE_PUBLISHED`，推进下一条；
     - **若本地写入失败**（含账本损坏拒写）：保留现有账本字节，已有远端成功事实和真实 URL 绝不抹改为未知，记 `CANDIDATE_PUBLISHED` 且 `local_persist_failed: true`，**立即中止后续所有候选发送**。
   - **创建返回超时 / 504 / 断网**：标记 `CANDIDATE_UNKNOWN`，后续未发项一律标记 `CANDIDATE_SKIPPED`，**立即中止后续发送（停发不可逆，后续跳过项留待下次手动运行 R2 处理）**。发起一次内部只读核查：若核验仍未查到，当前项保持未知；若核验证实远端已创建成功，当前项更新为 `CANDIDATE_PUBLISHED` 并记录真实 URL，本轮停发后续事实不变。
   - **创建明确被拒（401/403/422）**：标记 `CANDIDATE_REJECTED`，后续未发项一律标记 `CANDIDATE_SKIPPED`，**立即中止后续发送**。

### 步骤 6：批次唯一汇总判定与呈现
1. 对包含所有候选最终状态的数组，调用 [status_engine.js](./scripts/status_engine.js) 的 `evaluateBatchRollup(candidates, precheckResult)`，严格按 8 级阶梯输出**恰好一个批次汇总码**（参考 [status_ladder.md](./references/status_ladder.md)）：
   - `NO_CANDIDATE` / `RESULT_UNKNOWN` / `PERSIST_FAILED` / `PARTIAL_SUCCESS` / `PUBLISHED_SUCCESS` / `DUPLICATE_SUPPRESSED` / `DEPENDENCY_BLOCKED` / `DRAFT_ONLY`
2. 呈现给用户：
   - 第一行清晰呈现批次主状态码；
   - 逐项展开每个候选的最终状态、Issue URL 或本地脱敏草稿绝对路径；
   - 如包含疑似重复，标明 `duplicate_unconfirmed: true` 并提示待核实；
   - 如存在本地记账失败，提示检查临时目录权限，并提供已发布 Issue URL 保证不丢记录。

---

## 辅助工具与参考链接
- 状态计算引擎：[scripts/status_engine.js](./scripts/status_engine.js)
- 敏感信息脱敏器：[scripts/sanitize_helper.js](./scripts/sanitize_helper.js)
- 状态阶梯与定义：[references/status_ladder.md](./references/status_ladder.md)
- 正文五要素规范：[references/body_template.md](./references/body_template.md)
- 发送生命周期契约：[references/dispatch_lifecycle.md](./references/dispatch_lifecycle.md)
- 深度脱敏规范：[references/sanitization.md](./references/sanitization.md)
