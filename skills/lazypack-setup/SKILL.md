---
name: lazypack-setup
description: >-
  Compiles project-layer engineering discipline from lazypack-discipline fixed layer (0.3.0)
  after Matt Pocock skills setup. Probes repository, asks only necessary unknowns, confirms
  changes once, and generates six managed artifacts with fingerprint protection.
---

# /lazypack-setup

把 `lazypack-discipline` 的项目层纪律编译并装配到目标仓库中。本 Skill 是用户显式调用的 Prompt-driven skill，不在目标仓库安装常驻 CLI、常驻服务或 YAML 状态层。

支持按需进入文档整理子流程（`/lazypack-setup --docs-only` 或用户表达“整理文档归属”时），无需强行重跑包管理器探测、Hook 接线与依赖安装。

---

## 核心原则

1. **地基先行 (V06=B)**：在 `setup-matt-pocock-skills` 之后运行；严格执行前置双检，未就绪则零写入并提示接力。
2. **少问多探 (V04=NEEDED)**：仓库已有事实绝不重复询问；必要未知附带推荐答案与探测缺失原因，默认零问。
3. **单次整体确认 (V05=YES)**：所有文件改动、托管区 diff、脚本/配置/权限副作用一次性呈现，用户整体确认后写盘；无变化重跑为 no-op，不再提示确认。
4. **保护已有修改 (V08=FINGERPRINT, V09=B, V10=PRECISE)**：无标记既有文件暂停该文件并汇报待裁；托管区用指纹检测人工修改与升级；块外内容字节不变；无关脏工作区不阻塞。
5. **诚实报告门禁 (V14=A, V15=A)**：区分 setup 完成、命令接线、命令运行、Hook 激活与检查通过；缺命令不虚构，不谎称门禁已生效。
6. **原位保留优先 (PRESERVE-FIRST)**：文档归属整理默认采用 `preserve-existing`；确需物理迁移时必须取得基于计划指纹的单次整体确认，通过确定性 Helper 保证出站/入站链接重写与应用层补偿回滚，不宣称系统级抗崩溃原子性。

---

## 执行流程

### 第 1 步：前置双检 (Pre-flight Double Check)

执行前置只读检查，规则遵循 [references/verification.md](references/verification.md) §1：

1. **Issue Tracker**：核验 `docs/agents/issue-tracker.md` 是否存在、非空且包含实质性 tracker 说明正文（除标题行外必须包含正文描述，纯中文实质说明有效，仅有标题或空模板视为无效）。
2. **常驻入口**：跟随 Matt 的选择。若 `CLAUDE.md` 存在则优先选用，否则选用 `AGENTS.md`；核验文件内是否存在 `## Agent skills` 入口块，且该标题块作用域内部有效指向 `docs/agents/issue-tracker.md`（若指向 `domain.md` 则一并引用，但缺失 `domain.md` 绝不阻断）。

> **前置失败判定**：若任一检查项未通过，**立即停止，严禁写入任何文件**，向用户输出准确接力提示：
> `请先运行 /setup-matt-pocock-skills 完成前置配置，再运行 /lazypack-setup。`

> **文档整理子流程 (`--docs-only`) 快速入口**：
> 当用户仅要求整理文档归属（或输入包含 `--docs-only`）时，若目标项目已具备基本 Git 根与文档目录，允许直接进入第 2 步 §9（存量文档与归属探测），跳过语言包管理器、Hook 接线与工具依赖的重复核验。

---

### 第 2 步：项目只读探测 (Probing)

按以下顺序只读收集项目事实（**严格禁止在确认前执行任何外部包管理器、构建工具或项目测试脚本**，如 `uv sync --check` 或 pytest 收集；仅允许只读文件系统、Git 元数据、PATH 查找与代码图谱查询）：
1. **Git 根与工作区**：定位 `.git` 目录，检查目标写入路径是否存在已暂存/未暂存修改。
2. **常驻规则入口**：确认选用 `CLAUDE.md` 还是 `AGENTS.md`（若两者并存，选 `CLAUDE.md`，并在报告中注明双文件现状）。
3. **语言、包管理器与支持矩阵优先级**：
   - 检查 `package.json`、`Cargo.toml`、`go.mod`、`pyproject.toml`、`uv.lock`、`poetry.lock` 等；
   - 识别 Python 管理器时综合清单与配置文件（不仅看 lockfile 存在），证据冲突时受限报告，坚决不默认迁移；
   - 按语言与包管理器判定对应配方支持矩阵优先级（保留原 Python 探测与支持矩阵；增加 TypeScript/JavaScript 判定）：
     * **Python 矩阵**（遵循 [presets/python-uv-ruff.md](presets/python-uv-ruff.md) §2）：
       · 优先级 1（多语言）：100% 保留非 Python 语言现有门禁；
       · 优先级 2（非 uv 管理器如 Poetry/PDM）：保留现有命令，缺失项仅给适配当前管理器的手动指引，不迁移至 uv；
       · 优先级 3（标准 pyproject.toml 且 PATH 有 uv）：完全支持，提供完整配方推荐；
       · 优先级 4（有 pyproject.toml 但缺失 uv）：受限分支，报告 uv 缺失并提示手动安装，setup 绝不在全局静默安装软件；
       · 优先级 5（传统 setup.py/requirements.txt）：传统布局受限分支，保留已有命令，缺失项给手动指引；
       · 优先级 6（无 Python 清单）：退出 Python 配方，但通用 setup 继续装配通用工程纪律。
     * **TypeScript/JavaScript 矩阵**（遵循 [presets/ts-biome-vitest.md](presets/ts-biome-vitest.md) §2）：
       · 优先级 1（多语言）：100% 保留非 TS 语言现有门禁；
       · 优先级 2（非 pnpm 管理器如 yarn/npm/bun）：保留现有命令，缺失项仅给适配当前管理器的手动指引，不迁移至 pnpm；
       · 优先级 3（标准 package.json、PATH 有 pnpm，且存在 tsconfig.json 或 .ts/.tsx 文件）：完全支持，提供完整配方推荐（Biome + tsc + Vitest 按项补缺）；
       · 优先级 4（有 package.json 及 TS 信号，但缺失 pnpm）：受限分支，报告 pnpm 缺失并提示手动安装，setup 绝不在全局静默安装软件；
       · 优先级 5（传统纯 JS/无 tsconfig）：受限分支，保留已有命令，缺失项给手动指引；
       · 优先级 6（显式选择 TS 的新仓分支）：**恢复明确选择 TS 的新仓分支**；当目标目录为空目录或未初始化工程，且用户显式指定/选择了 TypeScript 时，**绝对不因无清单而直接退出，亦不自行猜测语言**；直接提供标准 TS 最小化工程模板初始化（ESM `"type": "module"`、最小 package/scripts、双 tsconfig、CLI `parseArgs`、bin/files、可选 MCP、单包 `pnpm-workspace.yaml: verifyDepsBeforeRun: error` 契约）。
   - **解耦声明**：缺对应清单或缺对应包管理器仅限制特定语言配方补缺，**绝对不关闭、不改写仓库已有的其他有效门禁**，亦不阻断通用纪律装配。
4. **既有质量门禁命令**：检查 `scripts` 或配置文件中已有的 `format`、`lint`、`type`、`test` 命令（如 `eslint`, `prettier`, `biome`, `ruff`, `pytest`, `tsc` 等）。已有命令原样保留。
5. **既有 Hook 管理器**：探测 `.husky/`、`lefthook.yml`、`package.json` 中的 `simple-git-hooks` 等。
6. **既有产物状态与受管 Hook 出处读回**：
   - 检查根目录与 `docs/` 下是否已存在六类产物，解析是否存在有效 lazypack 托管标记（见 [references/managed-blocks.md](references/managed-blocks.md)）；
   - **受管 Hook 出处读回与重跑恢复 (Hook Provenance Read-back)**：
     * 探测目标 Hook（如 `.githooks/pre-commit`）是否存在；
     * 若存在有效 lazypack 托管块：比对 `current_fp === header.fp`；
     * 仅当通过标记与指纹核验，且正文头部存在严格语法的 `# lazypack:preset` 出处注释行时：
       优先读取出处行的 `id`、`version` 以及逐槽 `provenance`（`<state>:<source>:<reason>`，如 `wired:preset:recommended`、`missing:preset:declined`、`install-failed:preset:install-error` 等），以及槽位命令和状态变量；
       格式核验通过后，**完整恢复原有采纳、拒绝与安装失败等历史事实**；
       **来源固化契约**：**绝对不能**因当前环境中已检测到对应工具（例如已在系统 PATH 或 `.venv/` 中）就将原 `<source>=preset` 改标为 `existing:pre-existing`！工具因配方而存在，来源事实仍为 `preset`；
     * 若正文手改（`current_fp !== header.fp`）、标记残缺或出处非法：**坚决不猜测出处**，按漂移或冲突处理，展示 diff 待裁决；
     * 若 Hook 包含有效托管块但**无 `# lazypack:preset` 出处行**（旧版 setup 或非配方 Hook）：将其中的门禁命令统一按通用既有命令处理（`source=existing`, `reason=pre-existing`）；
     * **退出配方后的状态认知**：若此前已执行配方退出，Hook 中的出处行已移除；环境中遗留的工具**绝不代表用户重新接受了配方**；再次接线必须经由用户显式选择；
     * **未变重跑幂等**：若恢复的出处与命令与当前仓库状态一致（未变重跑），完整保留原出处与原 input，**不重复报价、不重复发起安装、不重复执行基线、不写盘（稳定 NO-OP）**。
7. **访谈材料与想法留存现状探测**：
   - 读取 `docs/agents/roles.md` §3 或常驻入口中是否已存在生效的留存策略与路径配置；
   - 探测是否存在 `docs/plantree/ideas/`、`docs/ideas/`、`docs/interviews/` 等线索目录；
   - **约束（探测不等于授权，失效指针具体判定）**：目录存在仅作为路径线索。具体判定“失效指针”：①目标缺失（历史配置记录了路径但磁盘上目标文件/目录不存在）；②标记损坏（协作文件或登记中标记残缺破坏）；③规则与路径不自洽（条文与实际路径冲突）。严格区分“用户确认计划新建”与“历史失效”：历史失效列入必要未知澄清，不能凡发现目录缺失就擅自自动修改路径；仅当存在明确生效条文且路径自洽时，才判定为“已知策略（0 提问）”。
8. **角色技能可用性核实**：只读核实分配给各角色的 Skill / MCP 的实际可用证据，严格区分四种正交维度：
   - **技能已安装证据**（如定义文件存在、命令在 PATH 中）；
   - **实际可调用证据**（如会话中实测调用通过）；
   - **门禁接线状态**（如 pre-commit Hook 已接线并配置对应检查命令）；
   - **项目图谱索引状态**（如存在 `.codegraph/` 索引目录，区分于工具未安装）。
   四种维度分别描述，不彼此替代。三类输入场景与示例输出如下：
   - **已知可用**（工具已安装且实测可调用）：`依赖已就绪 (技能已安装，当前会话调用已验证) [已就绪]`；
   - **明确缺失**（环境中未检测到工具）：`依赖缺失 (宿主环境未检测到对应工具/Skill) [未安装]`；
   - **未验证**（未经当前会话调用或项目图谱未建）：`依赖约束 (...)；工具可用但本项目未建立 .codegraph/ 索引目录 [部分依赖未验证/图谱未建]` 或 `未验证 (...) [未验证]`。
   不将所有 MCP 的安装作为前置双检的阻断项（非阻断项，仅如实反映在角色表中）。
9. **存量文档与归属探测 (Document Homes Discovery)**：
   - 遵循 [references/document-routing.md](references/document-routing.md) 执行指针先行探测与八大逻辑区域归属识别；
   - **指针先行**:
     * 优先读取目标项目现存 `docs/ARTIFACTS.md` 提取已登记项；
     * 读取 `docs/agents/issue-tracker.md`，若明确声明工单路径在 `.scratch/`（如 `.scratch/tickets/`），该路径内的文件严格作为持久权威来源纳入候选；未在声明中的文件（如 `.scratch/cache/tmp.log`）仅作为不在本次已授权登记范围，不臆断为可丢弃缓存；
     * 读取常驻入口（`AGENTS.md` / `CLAUDE.md`）指针；
    - **有界扫描与安全边界**:
      * **声明在先优先于通用剪枝**: 项目已明确声明的合法仓内路径（例如 `docs/agents/issue-tracker.md` 明确声明的 `.scratch/tickets/` 或常驻入口指向的规格文件）优先于通用剪枝，正常追踪纳入候选；未声明的依赖与构建目录（`node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `.venv/` 等）严格排除；
      * 敏感文件（`.env*`, `*secret*`, `*credential*`, `.ssh/`）一律静默排除且不读取，在扫描报告中概括说明“部分敏感与系统目录已按安全边界排除，本次探测属于有界扫描”，不虚报无界全覆盖；
      * 符号链接指向工作区外时立即停止深入并报告，绝不自动穿透读取；外部网络资源与私有存储未获显式授权不读取；
      * 区分四类登记对象（本地文件/有效章节锚点、存在的目录索引入口、声明的外部 URL、留存种子/私有绑定），维持既有非空与授权契约；
    - **逻辑归属与权威范围**:
      * 识别八大逻辑区域（方向、需求与验收、设计与决策、规则与术语、工作与进度、现状与使用说明、验证与观察、来源材料）；八区为逻辑导航，不强制预建八个物理目录；
      * `current` 状态在同一业务主题/用途范围内全局唯一；多 feature 需求规格或多个有效 ADR 各自主管对应主题，合法共存为 `current`；集合目录不自动批准其全部子文件；
      * 提取细粒度章节锚点（`path#anchor`），基于标准 Markdown 标题 Slug 规则解析；若锚点不确定或存在重名标题，不盲目猜测死锚点，退回使用相对路径并在说明列文字标注；
      * 发现同主题竞争基准时，标记为冲突项，留待第 3 步聚合澄清。

---

### 第 3 步：必要未知澄清 (Minimal Questions)

- **默认零提问**：能从仓库探测推导的事实不得提问。
- **必要未知场景**：
  - 当代码仓完全缺失某项检查命令时，根据固定层 §6.2 推荐默认工具：
    * Python 项目（满足优先级 3 条件）：推荐 `uv` + `ruff` + `ty` + `pytest` 配方（按项补缺提问：用户可按门禁槽位独立选择采纳或拒绝）；
    * TS/JS 项目（满足优先级 3 或优先级 6 新仓 TS 分支）：推荐 `ts-biome-vitest` 配方（包含 Biome、tsc 与 Vitest；按项补缺提问：用户可按 format, lint, type, test 槽位独立选择采纳或拒绝；CLI 产物询问是否需要 bin/parseArgs，询问是否启用 MCP 服务；配置所有权遵循 `tool-or-user` 原则，setup 实行零工具私有配置写入；单包 `pnpm-workspace.yaml` 仅用于自安装保护，不等同授权 monorepo）；
  - **未命中配方适用条件时的处理**：若缺少 `pyproject.toml` 或不满足配方条件，明确告知退出 Python 门禁配方，通用纪律装配继续，不向用户发起无意义的配方提问；
  - **重跑与退出后的澄清边界**：
    * 若重跑探测成功恢复了有效出处与接线事实，且仓库状态未变：**默认零提问 (0 questions)**，不向用户重复报价或再次询问是否采纳已决定项；
    * 若仓库此前已退出配方且环境中有残留工具：再次 setup 时**严禁自动接线回配方**；将其作为未接线的环境既有工具向用户展示，明确询问用户是否重新启用配方接线或保持现状，必须有用户的显式选择；
  - **全拒绝分支行为规范**：
    * 若用户在澄清提问中**全部拒绝所有推荐工具**，且项目中无任何既有门禁：
    * **绝对不创建 `.githooks/pre-commit` 文件**；
    * **绝对不配置 Git `core.hooksPath`**；
    * 常驻入口 `AGENTS.md` / `CLAUDE.md` **保持原有通用稳定指针文本，坚决不向其中动态注入未接线状态**；
    * 仅在完成报告中如实记录未接线事实。
  - 明确询问用户是否采纳推荐安装默认工具，还是保持未接线（`missing`）。
  - 阐明：用户接受推荐仅授权生成安装计划与条件分支，不等于工具已装好，更不等于门禁已生效。
  - 每个问题必须声明“为什么仓库内无法可靠确定”并附推荐选项。
  - **访谈记录与碎片想法留存偏好澄清**：
    * 当探测判定留存策略未决、失效或存在冲突时，向用户呈现单次澄清问题；
    * 阐明：需求研讨（如 `/grill-with-docs`）中产生的碎片想法对长期演进具有参考价值，但直接代码化存在偏离基准风险。直接收集启用的维度集合（支持 8 种任意正交组合，或明确跳过）：
      - `ideas`：想法池（在 docs/ideas/inbox.md 或用户选定路径留存未立项想法，标为 exploration）；
      - `minutes`：结构化纪要（在 docs/interviews/ 留存经脱敏的研讨背景、决议摘要与参与者记录，作为 reference）；
      - `raw_qa`：原始问答片段（独立敏感维度，默认不启用；仅在用户显式要求并提供经授权的安全私有存储别名时开启，遵循 `session-authorized` 机制；公开产物仅存安全别名，绝对私有路径不入代码仓亦不建持久绑定表；当前会话未获明确授权映射则保持 unbound 待绑定，不写材料，下一会话重新按需授权）；
      - 或选择极简 `decisions-only`（全关：仅保留 CONTEXT.md 与 ADR，过程材料用完即弃）；
    * **交互与确权契约**：
      - 支持直接勾选/指定启用的维度集合，亦兼容原有自然语言描述，不以互斥编号限制组合；
      - **未答/超时（pending）**：用户无应答、超时或未回答时，保持问题待答，状态为 `pending`，**严禁静默假定默认选项，严禁在 `roles.md` 中写入任何 §3 留存策略或假定配置，严禁生成带未展开占位符的假 header，严禁写入留存文件**；
      - **明确暂不配置（unconfigured）**：用户明确回复“暂不配置”或显式放弃时，记录为 `unconfigured`，在 `roles.md` §3 写入 unconfigured 权威段落，继续其他独立 setup 事项；不作为 Matt 前置阻断项，不影响质量门禁；
      - 策略变更绝不追溯删除磁盘上已有历史材料。
  - **同主题冲突与文档归属澄清 (Document Homes & Conflict Clarification)**：
    * **同主题冲突聚合与替代确认**:
      - 遵循 [references/document-routing.md](references/document-routing.md) §4.2 执行；
    * **受控物理迁移规划 (Phase 2)**:
      - **默认首选**: 坚持 `preserve-existing`（原位保留与登记）为默认路径，绝不把“整理文档”等同于“必须迁移”；
      - **正当性准入**: 仅当用户显式要求重组目录，或存量文档位置严重违背工程规范时，Agent 方可生成迁移计划规范 `plan_spec.json`；
      - **确定性计划计算**: 调用 `node skills/lazypack-setup/scripts/doc_helper.mjs plan --cwd <targetRepo> --input <plan_spec.json>` 计算出站/入站相对链接重写、`docs/ARTIFACTS.md` Section 3 登记行追加、预期哈希以及双指纹（`input_fp` 与 `plan_fp`）；
    * **三种在途流程状态与写前零写入拦截**: 当探测到同一业务主题存在多份竞争基准（如 `specs/pay-v1.md` 与 `specs/pay-v2.md`）时，向用户呈现单次合并澄清；用户选定项标为 `current`；**仅当用户明确确认存在替代/废弃关系时**，被取代项才标记为 `superseded` 并互指新项；**若用户仅选定 current 但未确认其他旧项状态或关系未知，其他旧项严格保持待裁（`待裁 / unconfirmed`），严禁擅自自动降级为 `superseded` 或 `reference`**；原件物理位置保持不变，**首期绝不自动执行 git mv 归档**；已有登记行依首期保护不予覆盖；
    * **用户请求迁移处理**: 若用户在交互中要求将文件物理搬迁至标准推荐目录，Agent 明确告知 Phase 1 仅支持保留既有原位登记（`preserve-existing`），物理迁移与链接重构属于 Phase 2 治理规划；询问用户是否接受原位保留登记；若用户不接受，保持**零写入并安全退出**；
    * **三种在途流程状态与写前零写入拦截**: 未答/超时记为 `pending`，明确拒绝记为 `declined`，迁移未果记为 `migration-unsupported-declined`；三者均严禁写入登记册，对应零写入门禁必须在写盘前判定拦截，原件不降级，保持目标文件严格零相关写入；
    * 策略变更绝不追溯删除磁盘已有历史文档。

---

### 第 4 步：生成拟写入草案与整体确认 (Overall Confirmation)

在对话中一次性展示完整变更草案，供用户统览与决策：
1. **拟新建文件清单**：目标路径与完整拟写内容（使用 [templates/](templates/) 渲染，填入当前 `src`, `gen`, `input`, `fp`；其中 `docs/agents/roles.md` 依据探测到的环境可用证据如实填写状态说明，并在 §3 按 [references/retention-sections.md](references/retention-sections.md) 单一事实源与明确替换表渲染已确认的留存策略指引；若启用了想法池且目标文件不存在，列出新建非受管种子文件，其路径动态读取自 `retention.paths.ideas`，默认 `docs/ideas/inbox.md`；若启用了结构化纪要且入口目录不存在，列出新建空入口目录；若启用了原始问答且提供安全别名，列出私有存储安全引用，公开产物绝不出现本机绝对私有路径或凭据；若为新仓初始化分支或清单字段缺失，列出经整体确认的最小清单文件与补缺字段，包含新仓 `package.json`、scripts 动态路径、`packageManager` 声明、双 tsconfig 即 `tsconfig.json` 与 `tsconfig.build.json`、以及单包自安装保护 `pnpm-workspace.yaml`）。
2. **拟修改既有文件 diff 与拟新建产物**：
   - 常驻入口（`CLAUDE.md` 或 `AGENTS.md`）：
     * **条件渲染指针 (F05, P7 稳定性规范)**：根据各类产物的实际托管状态渲染指针行。若 `roles.md`、`ARTIFACTS.md`、`CODING_STANDARDS.md`、`RELEASE.md` 处于正常受管状态（NEW / MANAGED / UPGRADE / DRIFT / NO-OP），渲染对应指针行。为避免留存策略调整导致常驻入口误报 `[DRIFT]`，`__ROLES_POINTER__` 采用稳定文本：`- **角色与职责**：查阅 [docs/agents/roles.md](docs/agents/roles.md)，遵循各角色防撞车边界与项目指引。`；若处于 `PAUSE`、`BROKEN` 或未托管状态，**彻底省略对应指针行**，并在完成报告中记录为未托管；其余已就绪指针仍保留，不阻断常驻入口自身生成，绝不产生死链接，亦不绕过保护去强改人工文件。所有指针条件替换必须在计算正文指纹 (`fp`) 前完成，严禁遗留任何未展开占位符。
     * **双角色门禁明文 (R3-A)**：种子模板托管块内显式包含双角色门禁要求（执行者和审查者都必须运行适用的质量门禁；未接线、不适用、运行失败等按事实报告，不宣称通过或已生效），即使下游文档暂停，门禁纪律依然直接可见。
     * **手改与升级冲突判定 (F03)**：若托管区检测到用户手工修改且本次探测输入/模板升级（`[CONFLICT]`），展示磁盘当前手改内容与拟生成内容的 **2-way diff**，说明双重变动事实；由用户裁决是保留现状、采用候选还是手工合并，严禁虚构 3-way diff 或猜测基线。
     * 展示托管块内部 diff，明确块外已有内容字节完全保留。
   - 发版纪律（`RELEASE.md`）：
     * 托管块 `release-discipline` 只渲染固定发版纪律（提交头、提交正文、SemVer 映射、打标签、Keep a Changelog）。「项目打包与发布」位于 end 标记之后的块外项目层区域，仍属同一文件。
     * 展示托管块内部 diff；块外已有打包说明按 [references/managed-blocks.md](references/managed-blocks.md) §5.3 声明为逐字节保留。
     * 草案不得残留未展开占位符；未选定薄草稿不得写成已选定打包事实。
   - 产物登记册（`docs/ARTIFACTS.md`）：
     * **事实真实与类别自洽 (R2)**：取消对目标仓 `docs/DECISIONS.md` 的预登记（固定层为来源说明，不假设目标仓存在同名文件）；严格遵循固定层 §4.2“同一类别 current 唯一”原则，将产物类别细分为任务跟踪（`docs/agents/issue-tracker.md`）、编码规范（`CODING_STANDARDS.md`）、发版规范（`RELEASE.md`）、角色映射（`docs/agents/roles.md`）。
     * **条件渲染登记行与人工扩展区 (P6 追加与路径去重)**：根据各产物的真实存在与受管状态生成登记行。若某产物处于 `PAUSE`、`BROKEN` 或未托管状态，**彻底省略对应登记行**，严禁将其虚构为 `current` 或受管产物；其余有效产物正常登记；协作产物（如想法池）在托管块外部 Section 3 人工扩展区登记，绝不污染托管块固定依赖集。若目标仓已有 Section 3，按 POSIX 归一化相对路径执行去重追加，严禁修改或删除已有的人工登记行；若无 Section 3，确认后追加模板尾部。所有条件替换必须在计算指纹 (`fp`) 前完成，正文严禁残留未展开占位符。
     * **既有文档归属拟登记项预览 (Document Homes Section 3 Preview)**：
     * **物理迁移与链接重写变更草案 (若包含迁移)**：
       - 展示拟迁移项清单（源路径 $\to$ 目标路径）；
       - 展示出站链接重写 diff（移动后自身内部相对链接调整）；
       - 展示全仓入站引用重写 diff（引用了被迁移文件的外部文档更新）；
       - 展示 `docs/ARTIFACTS.md` Section 3 拟追加/更新登记行；
       - 展示计划指纹 `plan_fp` 与输入指纹 `input_fp`，明确声明：**用户的批准将与本次计划指纹刚性绑定；若后续文件发生漂移，旧批准将自动失效并重新展示实际差异**。按 5 列推荐格式（相对路径/锚点 `path#anchor`、归属区域、状态、维护者/更新触发、来源/替代关系/依据说明）展示拟向 Section 3 追加的业务文档登记行；提案必须包含明确的维护职责与更新时机；若存在同主题多文件，展示裁决后的 current 归属、明确确认的 superseded 关系或未确认旧项的待裁状态；同时对目标 `docs/ARTIFACTS.md` 进行写前基线采样，记录当前 SHA256 哈希值 $H_{\text{baseline}}$（全新文件记录不存在）作为并发防御基线。
3. **暂停项说明**：若检测到第 2 至第 5 类产物已有人工文件且无 lazypack 标记，标记为暂停，说明保留原因。
4. **副作用确认与安装分支 (F01, F06)**：
   - **依赖安装计划、自安装保护与统一失败归因**：
     * 列出已批准的单次批量安装命令（Python: `uv add --dev ruff ty pytest`，已按工具去重；TS/JS: 从配方卡单一候选基线生成精确批准命令 `pnpm add -D @biomejs/biome@2.5.12 typescript@6.0.3 vitest@5.0.0 vite@8.2.2 @types/node@^24.0.0`，已按工具去重，安装结果记录精确 resolved 版本；坚决不以无版本裸命令示例覆盖候选选择，部分采纳仅安装确认缺失项；新仓 `package.json` 的 `packageManager` 必须显式声明为 `pnpm@12.3.4`）及预计变更的文件（manifest / lockfile）；
     * 列出 TS 单包自安装保护文件 `pnpm-workspace.yaml`（包含 `verifyDepsBeforeRun: error`）计划，定义既有文件/父级 workspace/冲突/重跑保护（声明单包配置仅为锁定自安装门禁，绝不等同授权 monorepo）；
     * 动态生成路径参数（探测实际存在的 `src`, `test`, `tests` 目录，坚决不把 `tests` 写成 `test`）；
     * 明确区分静态接线状态 (`wired`) 与运行时实跑结果，明确 `not-ready`（如零测试收集）只能是补充摘要，绝对不能作为 Hook 门禁状态；
     * 明确统一失败归因（非文件系统原子性）：
       - 若安装命令返回退出码 0 且可调用核验成功 -> 门禁状态确定为 `wired`；
       - 若安装命令失败（退出码非零或网络超时） -> 本次批准安装的所有缺失项统一归因为 `install-failed`，出处行记录 `install-failed:preset:install-error`；仓库原本已有的门禁工具（`source=existing`）绝不降级，保持 `wired:existing:pre-existing`；环境残留如实报告；
       - 若用户拒绝推荐安装 -> 对应槽位状态确定为 `missing`。
     * 明确原则：**接受推荐、返回退出码零、检查结果通过是完全不同的状态**。未获确认或超出计划的安装严禁执行；网络失败重试最多 1 次，严禁无限重跑，更不得追加未确认工具。
   - **日常 Hook 命令与授权缓存**：
     * 采用配方的槽位展示精确日常字面量（Python 均带 `--no-sync`，lint 带 `--no-fix`，format 带 `--check`；TS format 为 `biome format <paths>` 只读检查，lint 为 `biome lint <paths>` 只读检查，type 为 `tsc --noEmit`，test 为 `vitest run`）；仓库已有命令 100% 原样保留；
     * 明确披露授权写入的受控缓存目录（`.pytest_cache/`、`__pycache__/`、`.ruff_cache/`）与测试副作用边界（未知测试基线允许标 `not-run`）。
   - **Git 本地配置与管理器兼容**：
     * 若已有自定义 `core.hooksPath` 且无已知管理器，在计划中明确兼容方式或列为冲突暂停；
     * 若无管理器且无冲突（且非全拒绝分支），列出将执行 `git config core.hooksPath .githooks`；
     * 若处于全拒绝分支且无已有门禁，明确不创建 Hook、不执行 `git config core.hooksPath`。
   - **执行权限变更**：POSIX 下设置脚本权限位（`chmod +x .githooks/pre-commit`）。
5. **门禁接线清单与出处预览**：列出 `format`、`lint`、`type`、`test` 的拟接线命令、出处行与 input 字段；若全拒绝或全量已有工具且未采用配方，说明省略出处行与配方 input。
   - **退出配方预检与保护说明**：若本次操作涉及退出配方，向用户展示预检结果：
     * 若出处版本不匹配或命令不匹配当前推荐串且映射未知，**停止自动退出**，保留命令、出处与 input 并报告未解决项；
     * 若安全退出，重置配方槽位为 missing，移除 `# lazypack:preset` 出处行，重算 Hook `fp` 与 `input`；
     * **整文件物理删除必须同时满足三条件**（所有权可证明、无块外内容、**无任何 existing 或其他须保留槽位**）；混合 Hook 绝不物理删除，保留 existing 命令与可调用入口；
     * 明确告知：全仓其他纪律文档保留时，下次 shared commands 变动会走正常更新确认，不宣称全仓永久不变。

> 提示用户输入确认：`以上为本次 setup 全部变更。确认写入？[y/N]`。用户拒绝则停止写入，如实报告未操作项。

---

### 第 5 步：精准写入顺序 (PRECISE Execution)

用户整体确认后，按以下严格顺序安全写盘（写入规则遵循 [references/managed-blocks.md](references/managed-blocks.md)）：
1. **应用已确认的最小新仓配置与清单补缺 (Pre-install Manifest & Config Provisioning)**：
   - 若为新仓初始化分支（如新仓 TS）或已有工程清单字段缺失，优先写入整体确认清单内的最小新仓文件或补缺字段（新仓 `package.json`、scripts 动态路径、`packageManager` 声明、双 tsconfig 即 `tsconfig.json` 与 `tsconfig.build.json`、以及单包自安装保护 `pnpm-workspace.yaml`；Python 对应 `pyproject.toml` 既有约定）；
   - **严格受控边界**：仅写入确认清单内明示的文件与字段；既有文件与配置遵循按项补缺与冲突保护，若遇冲突暂停（`PAUSE`）由人工裁决；父级 workspace 绝不覆盖篡改；空仓无测试时不捏造 dummy 测试用例获取绿灯；
   - 此步骤确保后续依赖安装、scripts 脚本及静态类型检查在可调用核验与基线阶段拥有完备合法的配置环境。
2. **执行已批准的批量依赖安装 (Approved Batch Installation, F01)**：
   - 若用户确认了推荐工具，在目标项目执行已批准的单次批量安装命令（引用已采纳配方单一事实源：Python 为 `uv add --dev ...`；TS 为 `pnpm add -D ...`；部分采纳仅安装确认批准项）；
   - 检查安装命令退出状态码；若遭遇网络波动最多重试 1 次，严禁循环重跑或私自换用其他工具；
   - 若命令退出码非零，按统一失败归因将**本次批准安装的所有缺失项**统一归因为 `install-failed`，出处行记录 `install-failed:preset:install-error`，记录环境残留；仓库原本已有的门禁工具（`source=existing`）**绝不降级**，保持 `wired:existing:pre-existing`。
3. **分派执行可调用核验 (Callable Verification)**：
   - 依据已采纳配方分派可调用核验，**只核验本次批准安装/采纳的实际槽位与工具**（引用对应配方事实源）：
     * **Python 配方**：执行 `uv run --no-sync <tool> --version`；
     * **TypeScript 配方**：执行卡规定的 `pnpm exec <tool> --version`（`@biomejs/biome` 对应 `pnpm exec biome --version`，`typescript` 对应 `pnpm exec tsc --version`，`vitest` 对应 `pnpm exec vitest --version`）；纯 TS 环境严禁调用 `uv`，绝不因缺少 `uv` 误判为 `install-failed`；
     * **部分采纳 (Partial Adoption)**：用户拒绝采纳的槽位状态保持 `missing`，绝不被强制核验；
     * **既有项 (Existing)**：`source=existing` 项原样保留既有接线，不在此处作为本次安装项核验；
   - 对应槽位核验通过记为 `wired`，核验失败记为 `install-failed`。
4. **分派执行基线校验 (Baseline Execution)**：
   - 仅对已 `wired` 的槽位执行只读基线检查，依据已采纳配方分派检查命令：
     * **Python 配方**：执行 `ruff format --check`、`ruff check --no-fix`、`ty check`（均带 `--no-sync`）；测试基线若存在未知副作用或不可信环境允许标为 `not-run`；零用例收集退出 5 如实记录为 `failed (no tests collected)`；
     * **TypeScript 配方**：执行卡规定的 `pnpm run` 四槽只读检查（`format` -> `pnpm run format`，`lint` -> `pnpm run lint`，`type` -> `pnpm run type`，`test` -> `pnpm run test`）；测试基线若存在未知副作用允许标为 `not-run`；Vitest 零测试用例收集按官方真实退出码（1）如实记录为 `wired`（接线状态）+ `failed (ExitCode 1: no test files found)`（实跑结果），并在报告中作为 `not-ready` 补充摘要，严禁将 `not-ready` 作为 Hook 门禁接线状态，亦不造 dummy 测试强行获取通过；
     * **已有门禁项与部分采纳**：被拒绝的槽位（`missing`）与未采用配方的槽位不执行配方基线；既有命令保持既有基线或 `not-run` 策略。
5. **按真实状态渲染并写入新建独立产物**：
   - `.githooks/pre-commit`（或对应管理器入口）：
     * 若处于全拒绝分支且无任何已有门禁：**零创建 Hook 文件，绝对不执行 `git config core.hooksPath`**；
     * 若处于未变重跑（NO-OP）：**完全不写盘**；
     * 若采纳了配方（全量或部分）：渲染严格字典序的三段式出处注释行（`# lazypack:preset id=... version=...`），并在 Hook input 中包含 `preset`, `presetSrc` 与规范化 `provenance` 字典；
     * 若全部为既有工具且未采用配方（样例 C）：**完全省略 `# lazypack:preset` 出处行**，Hook input 中省略 `preset`/`presetSrc`/`provenance`；
     * 若安装失败，脚本明确写入 `install-failed` 状态，确保在提交前能够被阻断；
     * 若执行安全退出：重置配方槽位、移除出处行并重算 Hook `fp` 与 `input`；仅当满足三重整文件删除条件时物理删除；混合 Hook 绝对保留文件与 existing 命令；
   - `CODING_STANDARDS.md`（若未暂停）；
   - `RELEASE.md`（若未暂停）：
     * 托管块 `release-discipline` 只写入固定发版纪律；`fp` 仅覆盖 start/end 标记之间的固定段正文。
     * 「这个项目怎么打包」写在 end 标记之后的块外项目层区域。
     * **`[NEW]`**：块外尚无正文时播种薄草稿，文案写明「打包方案未选定」，并区分「未选定」与「已选定未验证」；不得残留 `__PLATFORM_NAME__`，不写完整厂商打包教程。
     * **重跑**：块外已有任何字节则按 [references/managed-blocks.md](references/managed-blocks.md) §5.3 逐字节保留，不得覆盖、不得重排、不得再播种。陈述打包现状时只依据块外现行段。
     * **`[UPGRADE]`**：仅替换标记行之间的受管范围；若 end 标记之后无正文，才允许一次性追加薄草稿；块外已有说明不改写。
     * **`[NO-OP]`**：整文件零写盘。
   - **留存协作文件与入口安全写盘 (P3, P4, P6, P8)**：
     * **ideas 种子 (P4)**：若确认启用了想法池，目标路径读取自 `retention.paths.ideas`（默认 `docs/ideas/inbox.md`）。写盘前严格遵循“先审查再落盘 (Pre-write Inspection & Sanitization)”，剔除密钥与敏感数据。若磁盘上该文件已存在，触发既有文件保护，绝对不覆盖已有正文；若不存在，写入非受管种子文件并校验非空；
     * **minutes 入口 (P8)**：若确认启用了纪要归档，目标目录读取自 `retention.paths.minutes`（默认 `docs/interviews`）。若磁盘上该目录不存在，经整体确认后在目标路径建立空目录或入口索引，**严禁虚构伪造任何虚假访谈纪要会议记录**；若已存在则保护引用；
     * **raw_qa 绑定与核验 (P3, P8, R2)**：若确认启用了原始问答片段，必须在写前通过当前可见会话检查别名到宿主私有物理路径的显式授权映射（`session-authorized`）。若已在当前会话安全绑定，仅在授权私有位置写入初始引导/片段，公开产物仅存安全别名（如 `vault:raw-qa`），严禁落绝对私有路径或凭据；若当前会话未提供安全绑定映射，状态严格保持为 `unbound`（待绑定），不向任何地方写入文件，不虚报已可用，不预登记；
   - `docs/agents/roles.md`（若未暂停）：若留存策略已明确（非 pending 待确认），从 [references/retention-sections.md](references/retention-sections.md) 单一事实源获取对应正文，严格按替换表展开占位符（其中 `__RAW_QA_VISIBILITY__` 统一替换为 schema枚举值 `private-storage` 或 `private-repo`）后渲染 §3 规划者指引，并计算包含规范 `retention` 字段与 `retentionSrc` 权威正文源摘要的 input 摘要写盘；若留存策略处于 pending 状态，则不渲染 §3 亦不写入留存 input，杜绝生成假 header。
6. **受控迁移与文档登记单批次顺序执行与补偿保护 (Deterministic Execution with Single Atomic Write & Rollback Defense)**：
   - 若本次变更包含文档归属整理或物理迁移，Agent 调用确定性执行器：
     `node skills/lazypack-setup/scripts/doc_helper.mjs execute --cwd <targetRepo> --plan <plan.json> --approved-fp <plan_fp>`
   - **执行器刚性防御**：
     * 复核 `approved_plan_fp === current_plan_fp` 且磁盘无输入漂移，否则返回 `APPROVAL_DRIFT_BLOCKED` 阻断写盘；
     * 严格检查 `backupRoot` 物理隔离（默认在系统临时目录，严禁位于目标代码仓内部）；
     * 执行入口统一执行路径边界防伪（防逃逸、防跨盘、防越界符号链接）；
     * 检查 `pre_write_target_collision`（目标物理路径是否已被占用）；
     * 顺序写盘目标文件（含出站链接重写）、重写全仓入站引用、写盘 `docs/ARTIFACTS.md` Section 3，并物理删除已迁移源文件；每步执行前记录 WAL 意向日志；
     * **物证核验**：核验目标文件最终哈希与预期输出哈希一致，源文件删除核验，有界扫描范围内的 Markdown 标准相对链接零死链核验；
     * **自愈与防覆写补偿**：若执行失败触发应用层逆序补偿回滚；回滚还原前逐一核对当前磁盘哈希；若遇 `pre_rollback_collision`（源路径被外部重建或引用文件/登记册被外部篡改），暂停并挂起当前状态 (`SUSPENDED_ON_CONFLICT`)，刚性禁止覆盖外部修改，保留现场与外部数据。
   - `docs/ARTIFACTS.md`：
     * **前置门禁裁决与整文件保护**：在对本文件开展任何写入前，首先裁决前置保护与零写入门禁。若目标文件处于 `PAUSE`、`BROKEN` 或未托管状态，保持整文件保护零写入；若同主题冲突或留存策略处于 `pending` 或 `declined`，对应项的零写入门禁必须在写盘前判定拦截，严禁写入后再宣布零写入；
     * **统一写前重读防外部并发篡改 (Unified Pre-write Re-read Defense)**：在执行写盘前，重新读取磁盘上的目标文件：
       - 若目标文件为 NEW（拟新建）：校验磁盘上目标文件物理不存在；若磁盘上已意外出现该文件，立即触发 `PAUSE`；
       - 若目标文件为既有文件：读取其实时磁盘字节并计算 SHA256，与第 4 步记录的统一写前基线哈希 $H_{\text{baseline}}$ 比对。若哈希不符（表明在用户确认期间被外部并发修改），**立即触发 `PAUSE` 暂停写盘并向用户告警**；绝对禁止覆写外部改动，亦不执行回滚；绝不将外部并发变更吸收为己方基线；
     * **内存统一合并 (In-Memory Merge, 彻底消除自身写入误判并发)**：重读核验通过后，在内存中统一计算受管区与协作区变更：
       - 受管区：严格基于前置存在核验（`docs/agents/issue-tracker.md`）及上述独立产物的真实写入成功状态渲染登记行；重新从磁盘采样 Layer 0 依赖状态生成最终 `header.input` 并计算 `fp`；若某产物处于 `PAUSE`、`BROKEN` 或未托管状态，彻底省略对应登记行；若受管块内容与磁盘已有托管块完全一致，判定为 `NO-OP`；
       - 协作区 (Section 3)：四类登记对象（本地文件/章节存在且非空、存在的目录索引入口、声明的外部 URL 不抓取、留存协作种子与私有绑定维持原有 session-auth 契约）经确认后按 5 列推荐表头（或既有兼容排版）与 POSIX 规范相对路径/章节锚点（`path#anchor`）去重追加；绝不覆盖已有旧表头与人工行；
     * **单次原子写盘 (Single Atomic Write)**：将合并后的完整文档一次性写入磁盘，写后立即读回核验；托管块 NO-OP 与 Section 3 追加完全正交（即使受管块 NO-OP，若有经确认的协作区条目，单次写入仅更新协作区内容，块外与块内字节均精确受控）；原生换行格式（CRLF 或 LF）、BOM 状态及缺失末尾换行时的单换行分隔符严格保持。
7. **后改既有入口 (F07)**：
   - 常驻入口（`CLAUDE.md` 或 `AGENTS.md`）：基于上述产物的真实受管/写入结果条件渲染指针行（包含直接可见的双角色门禁要求，且角色指针采用 P7 稳定文本），重新从磁盘采样 Layer 0/1 依赖状态生成最终 `header.input` 并计算 `fp`；探测文件已有主流换行符（CRLF 或 LF），在文件末尾追加或更新唯一托管块时沿用该换行符，严格保证块外字节完全不变；
   - 若有既有 Hook 管理器：按既有约定追加受控调用行。
8. **生效副作用**：
   - 执行 `git config core.hooksPath .githooks`（若使用原生受控 Hook、无冲突且非全拒绝分支）；
   - POSIX 系统设置脚本权限位（`chmod +x`）。
9. **会话内三态恢复保护**：
   - 若操作中断或失败，回退升级块时完整恢复旧块字节 $S_{\text{pre\_block}}$（含旧头与旧标记）；
   - 依赖文件仅在 $S_{\text{curr}} == S_{\text{agent}}$ 时直接写回 $S_{\text{pre}}$ 原始字节文件；
   - `core.hooksPath` 仅在当前值等于代理写入值时执行防覆盖恢复。

---

### 第 6 步：输出诚实完成报告 (Honesty Report)

写入完成后，输出结构化报告，严格区分各层次事实（遵循 [references/verification.md](references/verification.md) §4 与 §5）：
- **依赖安装事实**：列出实际执行的批量安装命令、退出码与命令可调用核验结果；未执行真实安装的环境明确说明为“流程演练”；若有环境残留独立说明。
- **产物写入与登记事实**：逐项列出路径、实际操作状态（`new` / `append` / `unchanged` / `preserved` / `skipped`）、`src`、`gen`、`fp`。必须准确描述实际发生的操作，严禁使用含混的“已省略”掩盖保护或未修改事实：
  * **拟生成与写入项**：若产物已受管写入，且某下游依赖暂停/损坏，分别准确报告“本轮拟生成内容未纳入该产物指针/登记行”及“实际写入后该文件不存在该行”；
  * **登记册本身处于 PAUSE / BROKEN / 未托管时**：明确报告“登记册已保留受保护原样，本轮未做登记变更”；严禁声称在其中删改或省略了任何登记行；即便原始人工登记册包含过时记录亦不擅改，如实解释未托管保护边界；
  * **登记册处于受管 NO-OP 时**：明确报告“登记册内容未变（未写盘）”，如实说明磁盘当前已有登记行，严禁虚报为本轮重写；
  * **常驻入口按实际状态报告**：仅在实际追加/更新托管块时报告“指针已按受管产物实际状态条件写入”；若常驻入口被保护、暂停或未写入，严禁声称已修改指针；
  * **部分失败或中断时**：分别记录实际成功写入项与保留未动项，严禁虚报交付状态。
- **文档归属与迁移事实 (Document Homes & Migration Facts)**：
  * 列出原位保留项与 Section 3 登记结果；
  * 列出物理迁移项（源路径、目标路径、预期 SHA256 核验结果、源文件删除核验）；
  * 列出全仓入站引用重写结果；
  * 列出 WAL 终态记录与隔离备份目录位置；
  * 若发生冲突或失败，明确报告是补偿回滚成功（恢复初态）还是因 `pre_rollback_collision` 暂停挂起；
  * 明确死链核验范围仅限于有界扫描范围内的 Markdown 标准相对链接。
  *如实列出识别到的业务文档、物理路径（保留原位）、归属的 8 个知识区、分配的角色与状态（`current` / `superseded`）、同主题裁决结果；若因并发冲突或用户拒绝而暂停/未写入，如实记录为 `pending` / `declined` / `migration-unsupported-declined` 并说明零写入事实；明确报告“所有既有文档保留原位，未执行物理移动或迁移”。
- **留存策略与协作材料事实**：如实报告访谈留存模式与启用维度（`decisions-only` / `ideas-pool` / `minutes-only` / `raw-qa` / `hybrid` / `unconfigured` / `pending`）、目标路径、纪要入口建立情况与可见性；未答或超时如实报告为“待确认 pending（未配置，零写入）”；显式跳过报告为“用户明确暂不配置 unconfigured”；私有原文报告安全别名与绑定状态（未绑定标 `unbound`，不虚报已交付）；既有人工文件报告为“人工产物受保护引用（未覆盖写盘）”。
- **门禁状态**：逐项列出 `format`、`lint`、`type`、`test` 的接线状态（`wired` / `missing` / `install-failed` / `n/a`）；若存在 `install-failed`，重点告警阻断风险。
- **门禁实跑与出处事实**：记录各命令实跑退出码（若 pytest 因无用例退出 5 明确说明为无用例收集而非错误）；记录配方标识、版本与四槽出处记录（全已有未采用时明确记录省略出处行）。
- **Git Hook 激活证据 (F06)**：
  * 严格区分 `静态配置就绪 (Configured)` 与 `运行时已验证 (Runtime Verified)`；
  * 未经 Git 原生机制实际触发调用的，激活状态必须如实标为 `未验证`（仅标明配置就绪）；
  * 若 Git 原生调用了 Hook 但门禁命令返回非零，如实记录“Git 调用已验证，但门禁检查失败”，绝不谎称检查通过；若处于全拒绝分支，明确断言 Hook 缺席。
  * 注明新克隆机器启用步骤。
- **未验证项标注**：`RELEASE.md` 块外平台打包段与未经实操的发布命令明确标 `未验证`。选定方案不等于上传已验证；未选定草稿不得陈述为现行打包事实。
- **三态恢复清单**：依据会话内 $S_{\text{pre}}$ 快照提供新建文件的精确删除清单（`rm ...`）、既有修改的托管块行级恢复指引与依赖文件写回说明；绝不提供全局 reset/clean 命令。

---

## 参考文献与资源

- [references/DECISIONS.md](references/DECISIONS.md)：本包固定层 0.3.0 派生快照（只读事实源）。
- [presets/python-uv-ruff.md](presets/python-uv-ruff.md)：首发 Python 质量门禁配方数据卡（只读源）。
- [presets/ts-biome-vitest.md](presets/ts-biome-vitest.md)：TypeScript/JavaScript 质量门禁配方数据卡（只读源）。
- [references/retention-sections.md](references/retention-sections.md)：规划者访谈与碎片想法留存指引正文库（单一事实源）。
- [references/document-routing.md](references/document-routing.md)：既有文档归属与 8 大知识区路由规范（原位保留与安全登记）。
- [references/managed-blocks.md](references/managed-blocks.md)：标记语法、换行/编码规范、指纹与输入摘要算法、重跑决策树。
- [references/verification.md](references/verification.md)：前置检查规范、Hook 激活证据判定、门禁短路策略。
- [templates/](templates/)：六类产物的最小种子模板。
- [scripts/doc_helper.mjs](scripts/doc_helper.mjs)：文档扫描、计划生成、迁移执行与物证校验辅助工具。
