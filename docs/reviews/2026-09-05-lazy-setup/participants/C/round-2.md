# 参与者 C：第二轮互评与修订
- 参与者：C
- 轮次：2
- 主评对象：A
- 状态：submitted
- 已读材料与未验证事项：
  1. 已读本仓库：`README.md`、`docs/DECISIONS.md`、`docs/interviews/2026-09-04-founding-interview.md`；
  2. 已读讨论材料：`round-1-summary.md`、`participants/A/round-1.md`、`participants/B/round-1.md`、`participants/C/round-1.md`；
  3. 本机核实 Matt 证据：核实本机 `<USER_SKILLS_DIR>/setup-matt-pocock-skills\SKILL.md`（Git 内容或文件大小约 6957 字节，117 行），确认其声明 `disable-model-invocation: true`（L4），`prompt-driven skill, not a deterministic script`（L15），`update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections`（L82）。
  4. 未验证事项：未验证远端 Matt 最新上游是否有未发布变更；未核实其他外部未安装工具。

---

## 1. 认可与反驳（重点主评参与者 A）

### 1.1 明确认可项
1. **认可 A-03 / A-10：坚持极简两层与严格控制产物规模（`participants/A/round-1.md:139,146`）**  
   - **理由与场景**：A 坚决拒绝引入独立 CLI、四份 YAML 及 fast/full 门禁，将产物严格限制在 §2.3 的六项基础文件。这完全符合实际运维的最小负担原则，避免为目标项目引入沉重的环境依赖和第二事实源。
2. **认可 A-09：不破坏已有流水线，不整块调用外部冲突 skill（`participants/A/round-1.md:145`）**  
   - **理由与场景**：在已有项目中，外部未经验证的 `setup-pre-commit` 强推 Prettier/Husky，会直接打翻固定层 6.2 选定的 Biome 工具链。A 明确主张“不擅自把绿仓弄红”，这是成熟的非破坏性运维底线。

### 1.2 明确反驳项
1. **反驳 A §2.2 中断后恢复规则「已写文件当现状」（`participants/A/round-1.md:61`）**  
   - **触发场景**：setup 在顺序写入 6 个文件时，在写完 `AGENTS.md` 和半个 `CODING_STANDARDS.md` 后遭遇进程崩溃、断网或上下文溢出中断。
   - **理由**：若第二次运行将“已写文件当现状”，残缺断头的文件会被直接误判为“项目既有配置”而不再补齐；同时缺失托管标记校验会导致 `AGENTS.md` 被重复追加相同段落。这在真实运维中是致命的静默损坏。
   - **代价与替代**：写入必须基于托管标记块（Managed Markers）；重跑时若发现损坏的半截标记，必须告警并提供自愈重写，严禁盲目信任残留碎片。
2. **反驳 A-05 的冷硬前置拦截策略（`participants/A/round-1.md:141`）**  
   - **触发场景**：用户直接调用 `/lazypack-setup`，项目尚未配置 Matt 的 `docs/agents/issue-tracker.md`。
   - **理由**：A-05 简单声明“硬停退出”，让用户重新手动调起 Matt setup。这种割裂的交互体验违背了“突出 lazy”的主旨。
   - **代价与替代**：虽然不越权代替用户静默决定 issue tracker，但 AI 必须在此处提供连贯的接力引导（输出精确的下一步命令），并在用户完成 Matt setup 后支持无缝恢复。
3. **反驳 A-15 固定层来源的“悬空假定”（`participants/A/round-1.md:151`）**  
   - **触发场景**：目标机器离线、未克隆 `lazypack-discipline` 源码仓库、仅通过全局目录安装了 skill。
   - **理由**：A-15 提出“不复制 DECISIONS，具体安装渠道未定”。但在目标仓库中，执行者和审查者 AI 如果读不到固定层条文，将退化为臆测和幻觉，纪律名存实亡。
   - **代价与替代**：必须随 skill 分发可引用的只读条文快照或内置规则锚点，由项目层指针精确指向其版本（如 `@0.1.0`），既不产生可编辑副本，又保证规则随处可查。
4. **反驳 A-09 对空门禁的“虚假完成”（`participants/A/round-1.md:145`）**  
   - **触发场景**：全新空代码项目，无任何现有测试与检查命令。
   - **理由**：A-09 仅将缺失项记录为“未接线”，随即宣告 setup 完成。这给用户制造了“项目已有防护门禁”的虚假安全感（False Sense of Security）。
   - **代价与替代**：若为代码仓库且门禁命令全空，setup 必须明确提醒并推荐初始化基础门禁（如 biome/ruff）；若用户主动拒绝，方可标记为 unhooked。

---

## 2. 对摘要 D01—D08 议题的明确决议

### D01 固定层分发
- **决议**：**采纳 B-14 思路并加固**。
- **规则**：可编辑唯一事实源永远仅存在于 `lazypack-discipline` 仓库。分发时随 `/lazypack-setup` skill 内置一份不可编辑的 `DECISIONS.md` 只读快照。目标项目中只生成带有固定层版本戳的指针块（例如 `<!-- lazypack: compiled-from=DECISIONS.md@0.1.0 -->`），目标项目内绝对不放置可编辑的 DECISIONS.md 副本，杜绝双事实源。

### D02 重跑与人工修改
- **决议**：**采纳 B-06 / B-07 的托管标记与三态判定模型，修补 C 第一轮的粗暴覆盖缺口**。
- **规则**：
  1. 块外内容：属于用户绝对自由区，setup 永不扫描、永不修改；
  2. 块内三态：
     - `up-to-date`：版本戳匹配且块内无改动，直接跳过并汇报；
     - `upgrade`：版本戳落后但无用户手改，就地升级块内文本并展示 diff；
     - `drift`：块内被用户手动编辑过（内容哈希不匹配），**严禁静默覆盖**，输出 diff 提示，由用户决定保留现状或更新。
  3. 标记损坏：若只有 start 没有 end，判定为 broken，提示清理或恢复。

### D03 门禁完成条件
- **决议**：**区分代码仓与非代码仓，严防虚假完成**。
- **规则**：
  1. 具备包管理与脚本的代码仓：若无 git hook 工具（无 husky），直接生成原生的 `.git/hooks/pre-commit` 脚本接入现有 `test`/`lint` 命令，此为“门禁已就绪”；
  2. 纯文档仓/非代码仓：无需 hook，在 `RELEASE.md` 注明“无代码门禁”，判定为合规完成；
  3. 代码仓但完全缺失检查命令：询问用户是否安装默认工具（TS: biome / Py: ruff）；若用户选择跳过，必须在报告和文档中明确标红 `Warning: Unhooked`，不得声称门禁完成。

### D04 写入与恢复
- **决议**：**采纳“事务性预检 + 先新后改 + 用户主导安全回滚”**。
- **规则**：
  1. 写前预检：检查目标文件是否在 git 脏工作区中，若存在冲突风险即刻告警；
  2. 写入顺序：先写全新的 5 个文件（`CODING_STANDARDS.md`、`RELEASE.md`、`ARTIFACTS.md`、`roles.md`、hook），最后就地修改常驻入口（`AGENTS.md` 或 `CLAUDE.md`）；
  3. 恢复契约：AI 不擅自执行高危的 `git reset --hard`；若执行中断，重新运行将通过托管标记自愈；报告末尾固定提供显式回滚单行命令（如 `git checkout -- <files>`）。

### D05 现有约束修订范围
- **决议**：**严格收缩固定层修订范围，仅保留必要条款，其余降为实现与项目默认值**。
- **规则**：
  - 修订提案仅保留 **B-11**（或 C 吸收版）：修改 §2.3，为无 hook 条件仓库增加“若无条件安装 hook 则记入 RELEASE.md”的兼容说明；
  - 关于 §3.3（跨设备并发）：**不改条文**，作为操作指引明确：assignee 是意向而非文件锁，跨设备并行提交应依赖短命分支或 pull --rebase 保护；
  - 关于 §1.2（MCP 降级）：**撤回修改提案**（见下文自省）。

### D06 提问与前置
- **决议**：**前置强检验 + 0 到 2 题严格上限**。
- **规则**：
  - 依赖探测：以 `docs/agents/issue-tracker.md` 和 `domain.md` 为准，缺则停机并输出复制即用的前置命令；
  - 常驻文件：优先继承已有 `AGENTS.md` 或 `CLAUDE.md`，若均无则跟随 Matt setup 的产出，不让用户重复做二选一；
  - 提问数量：常见路径 0 问，极端不确定场景上限 2 问（平台与工具选择）。

### D07 首版验收边界
- **决议**：**首版严格聚焦单项目主流开发场景，平台段与外延功能一律延后**。
- **规则**：
  - 首版仅支持 Node.js (TS/JS) 与 Python 两个主流栈的自动化识别与门禁挂载；
  - 微信小程序与 DevEco 仅生成包含手动发布步骤说明的静态平台段，不开发自动化上传动作；
  - `/lazypack-harvest`、专用清道夫与书记员 skill 明确延后，不列入首版完成条件。

### D08 指挥派工与来源规范
- **决议**：**确立严格的隔离派工协议与证据引用基线**。
- **规则**：
  - 派工提示词必须明确：唯一输出路径、禁止写入白名单以外的任何文件、同名已存在即停并报错、严禁未经审查的 git 提交；
  - Matt skill 引用规范：必须注明实测本地路径、行号与短引文（如已验证的 `setup-matt-pocock-skills` L15/L82），严禁捏造未验证工具。

---

## 3. 自案保留 / 修订 / 撤回与自省

### 3.1 对 C-01 的修订（从固定层修订降为实现指引）
- **第一轮表述**：称跨设备在 main 直推“必致 push reject 与脏合并”，提议修改 §3.3 条文。
- **自省与修订**：**【修订为实现指引，不改固定层条文】**。“必致”一词推演过度。虽然客观上存在共享文件（`package.json`、`CONTEXT.md`）冲突的高风险，但修改固定层会引发不必要的会务成本。修订结论：保留 §3.3 现有条文，在项目操作指引中补充“跨设备协作者在 push 前必须执行 fetch/rebase，遇冲突由人工介入解决”。

### 3.2 对 C-04 的撤回（尊重访谈已确认的事实）
- **第一轮表述**：提议修改固定层 §1.2，增加 MCP 缺失时的优雅降级条款。
- **自省与撤回**：**【明确撤回 C-04】**。访谈 Q6（`docs/interviews/2026-09-04-founding-interview.md:29`）维护者明确拍板：`/understand-codebase` 一定用，省 token 且准确，不需验证。在固定层硬塞降级条款会削弱架构权威性。转为**实现层的错误诊断提示**：当 MCP 缺失时，AI 如实报告卡点与环境要求（遵守 §7.6），不擅自伪造理解，亦不修改固定层。

### 3.3 对 C-02 标记内手改保护缺口的修补
- **自省与加固**：第一轮 C-02 仅提出托管标记，但未防范用户在标记内的手动编辑。现**全面吸收 B-07 的三态判定模型**，升级为 `C-02-r2`：块头引入生成版本与哈希，检测到 drift 时绝对不强制覆盖，展示 diff 供用户裁决。

### 3.4 “零提问”与“写盘确认”表述的消歧
- **消歧**：“无交互落地”特指**输入阶段零问卷（Zero Questions）**，即通过探测自动拟定最佳推荐；“确认后写入”特指**落盘前的终审确认（One-Click Confirmation）**。两者结合即为：“0 提问生成草案，1 次确认授权写盘”，完全符合访谈 Q2（“上一版不可接受的是没问完就写”）。

---

## 4. 候选决议表（供第三轮表决）

| 编号 | 决议正文 | 类型 | 来源提案 | 验收标准 | 依赖或互斥项 |
|---|---|---|---|---|---|
| **C-01-r2** | 维持 §3.3 条文不变；在实现指引中明确跨设备提交应依赖线性 rebase 保护，遇到非 clean merge 立即阻断 | 实现选择 | C-01 修订 | 文档中清晰说明并发冲突处理指引，不改 DECISIONS | 与原 C-01 互斥（放弃修改条文） |
| **C-02-r2** | setup 对现有文件采用托管标记注入（Managed Markers）；实现 up-to-date / upgrade / drift 三态识别，drift 时禁止覆盖 | 实现选择 | C-02 + B-06 + B-07 | 模拟用户手改块内内容，重跑时输出 diff 并停下等待裁决，不覆盖改动 | 依赖确定性的标记语法 |
| **C-03-r2** | 门禁配置探测优先：已有命令直接挂载；纯文档仓免 hook 并在 RELEASE 标明；空代码仓提示默认工具，跳过则标 Warning | 项目默认值 | C-03 + A-09 + B-11 | 在纯文档仓与已有 ESLint 项目分别运行，均无破坏且状态真实 | 互斥于“空门禁即成功”方案 |
| **C-05-r2** | 首版坚决采用 prompt-driven skill 形式（SKILL.md + 种子模板），不开发独立 CLI，不引入 YAML 配置文件 | 实现选择 | C-05 + A-03 + B-01 + B-08 | 目标项目无须额外安装二进制工具，纯通过 AI 会话指令调起 | 互斥于任何 CLI/多 YAML 方案 |
| **C-06-r2** | 输出产物严格限制为 6 项基础文件，内容追求极简骨架；全面延后 harvest、专用书记员及自动化平台上传剧本 | 保留与延后 | C-06 + A-10 + A-11 + B-05 | 首版交付物清单≤6，且不包含外延自动化脚本 | 无 |
| **C-07-r2** | 为 §2.3 补充兼容说明：在无 hook 安装条件的仓库中，将门禁命令记录于 RELEASE.md 平台段并如实报告 | 固定层修订 | B-11 吸收 | DECISIONS.md §2.3 增加一行兼容限定说明 | 需走 §9 讨论章程 |

---

## 5. 用户操作示例与首版实施验收

### 5.1 极简端到端操作示例（常见 0 问路径）
```text
User: /lazypack-setup

AI:
  [1/3 探测环境]
  ✓ 已读取 Matt setup 产物: GitHub Issues / Single-context
  ✓ 语言与工具: TypeScript, package.json (现有命令: npm test, npm run lint)
  ✓ 版本控制: Git 工作区正常 (无 Husky，将使用原生 .git/hooks/pre-commit)
  ✓ 常驻入口: AGENTS.md 已存在

  [2/3 生成拟写草案]
  - 将在 AGENTS.md 追加 ## Engineering Discipline 指针块 (12行)
  - 将新建 CODING_STANDARDS.md (极简双轨标准骨架)
  - 将新建 RELEASE.md (Conventional Commits + SemVer)
  - 将新建 docs/ARTIFACTS.md (产物 6 状态登记表)
  - 将新建 docs/agents/roles.md (映射现有 Matt 流水线)
  - 将生成 .git/hooks/pre-commit (挂接 npm test, npm run lint)

  0 待确认分叉。是否立即写盘生效？[Y/n]

User: Y

AI:
  [3/3 写入完成]
  ✓ 5 个文件已新建，1 个文件已注入托管标记
  ✓ 门禁状态: 已生效 (pre-commit 自动运行格式与测试)
  如需回滚，请执行:
  git checkout -- CODING_STANDARDS.md RELEASE.md docs/ARTIFACTS.md docs/agents/roles.md && git restore AGENTS.md
```

### 5.2 首版范围、阶段验收与派工写入边界

| 阶段 | 交付物 | 角色分工 | 严格写入边界 | 验收标准 |
|---|---|---|---|---|
| **Phase 1: 规范与模板** | `skills/lazypack-setup/templates/*.md` | 规划者 | 仅限 `templates/` 目录 | 模板零项目特有专名，各标记锚点定义严密 |
| **Phase 2: Skill 实现** | `skills/lazypack-setup/SKILL.md` | 执行者 | 仅限 `skills/lazypack-setup/` | 在标准 TS 及 Python 项目跑通 0 问与 1 问流程 |
| **Phase 3: 对抗性审查** | 破坏性测试验证报告 | 审查者 | 仅限测试留档目录 | 验证中断自愈、老项目不破坏、drift 报警、无 hook 仓合规处理 |
| **Phase 4: 文档收尾** | 更新 `README.md` 与发布说明 | 书记员 | `README.md`，禁止改 DECISIONS | 去除“待写”字样，使用指南完整闭环 |

**派工隔离铁律**：后续任何实现派工，主持人给出的提示词必须指定单一成果路径，严禁未经审查修改公共规范，同名文件已存在必须立即停机报错。