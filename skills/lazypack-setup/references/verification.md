# 门禁接线、前置核验与报告契约 (Verification & Gating Reference)

本文档定义 `/lazypack-setup` 的前置检查、Hook 门禁接线、激活证据采集与完成报告规范。

---

## 1. 前置双检标准 (V06=B)

在对仓库进行任何写入前，必须执行只读前置双检。任一失败立即停止，零写入磁盘。

### 1.1 检查项 1：有效 Issue Tracker
- **目标路径**：`docs/agents/issue-tracker.md`
- **判定标准**：
  1. 文件存在且大小大于 0 字节。
  2. 包含实质性的任务/Issue 跟踪说明正文（除 Markdown 标题行 `# ...` 之外，存在非空、非占位符的正文描述行）。
  3. 依据实际跟踪方式正文判断，支持纯中文（如“任务”、“需求”、“缺陷”、“禅道”、“TAPD”、“飞书”、“Jira”等）或纯英文或混合说明，不依赖僵化的单一语言白名单；仅有标题行或空模板（如仅包含 `# Issue Tracker` 或 `<!-- placeholder -->`）判定为无效。

### 1.2 检查项 2：常驻入口与 Agent Skills 块作用域
- **目标入口**：跟随 Matt 的选择。若 `CLAUDE.md` 存在则优先选 `CLAUDE.md`；否则若 `AGENTS.md` 存在则选 `AGENTS.md`；两者均缺失判定为前置失败。
- **判定标准**：
  1. 选中的常驻入口内包含 `## Agent skills`（或 `## Agent Skills`）标题块。
  2. 对 `docs/agents/issue-tracker.md` 的有效引用**必须位于该 `## Agent skills` 标题的作用域内部**（即从该标题开始至下一个同级或更高标题 `#` / `##` 之前）。出现在该作用域外部其他无关段落的引用不视为通过。
  3. 若常驻块内同时包含对 `docs/agents/domain.md` 的引用，予以保留并引用；**若 `domain.md` 不存在或未被引用，绝不阻断 setup 流程**（忠实落实 V06=B 决议）。

### 1.3 前置失败提示
若前置检查未通过，输出接力提示并退出：
```text
[前置检查未通过]
- docs/agents/issue-tracker.md: <有效 / 缺失或为空模板>
- 常驻入口 (CLAUDE.md / AGENTS.md): <有效 / 缺失 ## Agent skills 块或作用域内未指向 tracker>

请先显式运行 /setup-matt-pocock-skills 完成 Matt Pocock 技能地基配置，然后再运行 /lazypack-setup。
```

---

## 2. 提交前 Hook 接线与激活 (V12=TRACKED)

### 2.1 接线优先级与防冲突机制
1. **已有 Hook 管理器**：
   - 若检测到 `.husky/`：在 `.husky/pre-commit` 中追加受控门禁调用行或插入托管块。
   - 若检测到 `lefthook.yml` 或 `simple-git-hooks`：按其既有约定集成，不强行修改 `core.hooksPath`。
2. **探测现有 `core.hooksPath`**：
   - 若仓库已有自定义 `core.hooksPath`（且非 `.githooks`）：
     * 若属于已知管理器目录，按管理器规范接线；
     * 若为未知自定义路径且无明确管理器配置，**禁止盲目覆盖改写为 `.githooks`**。在整体计划中列出冲突并明确兼容方式；若无法安全判断则暂停 Hook 接管并在报告中说明原因。
3. **无管理器且无冲突（默认方案）**：
   - 在版本控制内生成 `.githooks/pre-commit`。
   - 在写盘前的一次性确认清单中明确提示用户将执行：`git config core.hooksPath .githooks`。

### 2.2 跨平台兼容性与激活证据划分
- **POSIX**：脚本第一行使用 `#!/bin/sh`；赋予可执行权限（`chmod +x <hook-path>`）。
- **Windows**：Git for Windows 自带 MSYS2 `sh.exe`，在 `core.hooksPath` 配置后能够原生执行该脚本。
- **严格区分配置就绪与运行时验证**：
  1. **静态配置就绪 (Configured)**：
     - 对应的 Hook 入口脚本已存在且非空；
     - `core.hooksPath`（或管理器配置）已正确指向对应目录；
     - POSIX 系统下脚本具备执行权限（`test -x`）。
     - 这**仅代表本地静态配置就绪，绝不能宣称 Git 真实激活**！
  2. **运行时已验证 (Runtime Verified)**：
     - 必须在本地由 Git 原生机制实际触发调用（例如在验证环境中执行 `git hook run pre-commit`），且记录 Git 实际调用的命令、退出码与独立可观测证据。
     - **`git hook run` 边界声明**：执行 `git hook run pre-commit` 仅为触发 Hook 脚本运行，**并不是创建 Git 提交（not a commit）**；若项目处于全拒绝分支（未创建 Hook），`git hook run` 不触发或报错，**绝不能把 Hook 文件不存在误判为门禁通过**，必须明确断言 Hook 文件的缺席且无自动生成。
     - **调用证据与检查结果解耦**：若 Git 原生调用了 Hook，但其中某项门禁返回非零（或阻断），证明 **Git Hook 运行时调用已验证 (Runtime Verified)，但门禁检查失败 (Check Failed)**。两者严格分开记录，绝不能因为调用成功就称检查通过，也不能因为检查失败就否定 Git 调用的真实性。
  3. **未验证标注**：
     - 若未在实际环境中由 Git 原生机制触发过运行时验证，激活状态必须如实标注为 `未验证`（仅标明静态配置就绪）。
- **新克隆启用说明**：
  Git 本地配置不会随仓库推送同步到远端。若使用非管理器原生 Hook，报告中必须明确说明：
  `团队成员或新克隆机器请运行: git config core.hooksPath .githooks 启用提交前门禁。`

---

## 3. 四项质量门禁与短路策略 (V13, V14, V15)

门禁覆盖四项：`format`、`lint`、`type`、`test`。

### 3.1 状态与结果正交契约 (Orthogonality)
严格区分静态接线状态与运行时实跑结果，二者形成正交矩阵：
- **接线状态 (Wiring Status)**：静态配置事实。
  * `wired`：已检测到有效命令（或用户接受推荐工具且依赖安装成功并核验可调用），命令写入 Hook 脚本中；
  * `missing`：仓库中无对应命令，或用户拒绝了推荐工具；如实记录为未接线；
  * `install-failed`：推荐工具批量依赖安装失败或可调用核验失败，阻断提交并如实报告；
  * `n/a`：项目类型不适用（例如纯文档仓无类型检查或代码测试）。
- **实跑结果 (Execution Result)**：运行时检查事实。
  * `not-run`：本次 setup 过程中未触发实跑（如环境未就绪、安全性未知或用户未授权运行）；
  * `passed`：命令实际执行且返回退出码 0；
  * `failed`：命令实际执行且返回非零退出码。
- **pytest 零用例收集 (ExitCode 5) 权威规范**：
  * 根据 pytest 官方规范（`ExitCode.NO_TESTS_COLLECTED = 5`），当 pytest 正常完成收集流程且未发现用例时，进程退出码为 5；
  * Hook 捕获非零退出码阻断提交，如实报告：接线状态为 `test: wired`（保持接线，绝不改写为 missing），实跑检查结果为 `failed (ExitCode 5: no tests collected)`；
  * 严禁假报绿，严禁因零用例将状态篡改为 `n/a`（`n/a` 仅适用于纯文档等非代码项目）；
  * 若测试收集阶段发生语法错误、插件导入失败或其他异常，直接按实际非零退出码报告，不引入无必要的硬编码错误分类。

### 3.2 受控 Hook 脚本执行与短路策略
在受控 Hook 脚本（如 `.githooks/pre-commit`）中，执行逻辑遵循严格的隔离与闭门防御契约：
1. **missing / n/a**：
   - 打印提示：`echo "[lazypack] <check>: skipped (missing or n/a)"`
   - **绝不调用不存在的命令**，**绝不退出非零码**，允许流水线继续检查下一项。
2. **install-failed**：
   - 打印错误：`echo "[lazypack] <check>: blocked (dependency installation failed)"`
   - 置位 `EXIT_CODE=1`，阻断提交。
3. **wired**：
   - 必须校验命令非空；若状态为 `wired` 但命令为空或纯空白，打印错误并置位 `EXIT_CODE=1`；
   - 命令在独立子 shell 进程中求值：`if ! ( eval "$GATE_CMD" ); then ...`。
   - **隔离与失败保留性**：
     * 命令内部的 `exit 0` 仅终止该命令自身的子 shell，绝不能提前退出父 Hook 脚本或跳过后续检查项；
     * 命令内部对 `EXIT_CODE` 的任何赋值仅限于子 shell 环境变量，绝不能清除父进程已记录的失败状态；
     * 若任一命令退出码非零，立即置位父进程 `EXIT_CODE=1`；后续项的成功或跳过绝不能掩盖先前项的失败。
4. **非法状态与占位符遗留 (Fail-closed)**：
   - 通配分支 `*)` 打印未知状态错误并显式置位 `EXIT_CODE=1`，杜绝静默放行。

### 3.3 门禁命令规范、执行边界与缓存授权
1. **日常 Hook 四槽命令字面量（仅用于新采纳的配方槽位）**：
   * `format`: `uv run --no-sync ruff format --check`
   * `lint`: `uv run --no-sync ruff check --no-fix`
   * `type`: `uv run --no-sync ty check`
   * `test`: `uv run --no-sync pytest`
2. **已有命令原样保留**：
   * 不得把通用 pre-commit 模板固定为 Python 命令；
   * 不得禁止或重写仓库已有的普通 `uv run`、其他语言命令或合法聚合脚本；已有命令原样保留；
   * 对已有命令的基线执行安全性若未知，标为 `not-run`，严禁通过擅改命令来解决。
3. **`--no-sync` 边界说明**：
   * `--no-sync` 仅说明跳过自动同步，不保证命令一定来自项目虚拟环境或环境完全兼容；报告如实记录工具来源与核验范围。
4. **聚合命令客观评估标准**：
   * 采用失败传播（`cmd1 && cmd2` 或退出码状态累积）且输出归属清晰的脚本判定为合规 `existing` 予以保留；
   * 无法确定失败传播或吞没前序错误的复杂脚本，触发 **Hook PAUSE**，绝不盲目拆解。
5. **授权受控缓存与测试副作用边界**：
   * 明确授权写入 `.pytest_cache/`、`__pycache__/`、`.ruff_cache/`；
   * 测试代码在收集期及运行期可执行任意代码，不将允许缓存当成所有副作用的无条件授权；未知测试基线允许标 `not-run`。

---

## 4. 诚实完成报告结构 (Honesty Report)

运行结束时，输出结构化完成报告，严格区分以下 8 类事实，严禁混淆：
1. **Setup 过程完成**：文件生成与写盘是否结束。如实报告各文件是实际新建、追加更新、保持未变（NO-OP）还是保留未动（PAUSE/BROKEN），严禁把受保护未动文件声称为本轮已修改或已删改。
2. **命令接线状态 (Gating Wired)**：四项门禁各自是 `wired`、`missing`、`install-failed` 还是 `n/a`。
3. **命令实跑结果**：本次 setup 过程中若触发过验证命令，各命令的实际退出码与输出摘要；未实跑显式标 `未运行`。若 pytest 因无用例退出 5，明确说明为“正常收集且无用例”。
4. **Git Hook 激活状态**：区分 `静态配置就绪 (Configured)` 与 `运行时已验证 (Runtime Verified)`；未实测显式标 `未验证`，新克隆机器标明启用命令。
5. **检查通过状态**：只有当所有 wired 项实际运行且退出码均为 0 时，才可声称检查通过；任何含 missing/n/a 的情况不得宣称“门禁全面生效”。
6. **门禁配方出处记录**：若采用了门禁配方（全量或混合），报告配方标识、版本及四槽三段式出处记录；若全量已有工具且未采用配方，明确记录为“全部已有工具，省略配方出处”。
7. **三态恢复指导**：若操作中断或依赖安装失败，依据会话内 $S_{\text{pre}}$ 快照提供新建文件的精确删除清单、修改文件的行级恢复指引与依赖文件的直接写回说明；严禁提供全局 reset/clean 命令。
8. **留存策略与协作材料事实**：如实报告访谈留存模式与启用维度（`decisions-only` / `ideas-pool` / `minutes-only` / `raw-qa` / `hybrid` / `unconfigured`）；报告权威正文源摘要 `retentionSrc`；若用户未答或超时，显式报告为“待确认 pending（保持未配置，零写入）”，严禁虚构采纳；私有原文报告安全别名与 `session-authorized` 绑定状态（当前会话未绑定标 `unbound`，不虚报已交付）；若检测到既有人工 ideas 文件，显式标明“人工产物受保护引用（未覆盖）”；若写入中断，严禁提前声称产物已登记。
9. **证据层级诚实区分 (Evidence Levels Distinction)**：完成报告中对所有验证结果必须严格区分证据层级，严禁笼统合称“产品生命周期已全验证”：
   - **模板渲染证据 (Template Rendering)**：仅证明模板占位符展开、指纹与标记格式符合语法规范；不证明 Hook 在操作系统中已真实执行；
   - **Stub 执行证据 (Stub Execution)**：仅证明 POSIX Shell 语法分支、退出码传播与子 Shell 隔离等控制流逻辑按预期生效；不证明真实候选工具已安装或可用；
   - **算法与断言示例 (Algorithm & Assertions)**：仅证明哈希计算、比对规则与数据结构转换的逻辑自洽性；不能替代从实际磁盘读写与恢复的端到端验证；
   - **Prompt-driven Skill 执行演练 (Simulation vs Native Execution)**：本产品为 Prompt 驱动型 AI Agent Skill，不具备独立编译二进制；测试辅助脚本对 setup 流程的模拟演练必须明确标记为“模拟演练 (Simulation)”，严禁伪充真实 setup 过程；
   - **真实环境依赖与调用 (Native Tool Execution)**：仅当在真实环境中实际安装了候选工具并由工具进程返回真实退出码时，方可记录为真实环境验证；未执行的检查必须逐项显式列出。

---

## 5. 访谈与想法留存策略核验契约 (Retention Verification)

1. **先审查再落盘原则**：
   - 规划者在调用 `grill-with-docs` 或收敛材料时，必须在向磁盘写入前核验内容、来源授权与目的地；
   - 涉及公开仓的纪要或片段，写前执行脱敏自检（去除 Token、私有路径、环境 ID 与私人数据），严禁“先提交含密原文再事后清洗”。
2. **写盘真实存在性核验**：
   - 非受管协作种子文件（如 `docs/ideas/inbox.md`）仅在用户明确启用且磁盘不存在时新建；
   - 启用结构化纪要时，若目标目录不存在，经确认仅建立空入口目录或索引，严禁虚构伪造会议记录；
   - 登记册 `docs/ARTIFACTS.md` Section 3 仅在写盘后校验文件非空且真实存在才去重登记；若外部私有存储绑定未就绪，绝不预登记为已交付；部分失败时仅登记实际成功项。
3. **幂等重跑保障**：
   - 策略数据写入 `docs/agents/roles.md` §3，属于 Layer 0 受管区；协作内容留在文件本体，属于非受管区；
   - 用户向想法池追加新条目后，受管文件的 `fp` 与 `input` 保持不变，重新运行 setup 严格保证判定为 `[NO-OP]`。


---

## 6. TypeScript (Biome + Vitest) 门禁规约与归因边界

### 4.1 门禁标准与只读检查分离
- **format**: `biome format <src_dirs>`（纯只读检查，格式不符退出码非零，绝对禁止在门禁中加入 `--write`）。修复使用独立的 `pnpm run format:fix`。
- **lint**: `biome lint <src_dirs>`（语法与规则检查，纯只读）。修复使用独立的 `pnpm run lint:fix`。
- **type**: `tsc --noEmit`（静态类型检查，无构建产物）。
- **test**: `vitest run`（单次全量测试）。若无测试文件，Vitest 退出码 1，Hook 状态保持 `wired`，补充摘要标记 `not-ready`，绝不生造新的 Hook 状态。
- **build**: `tsc -p tsconfig.build.json`（仅构建生产代码，排除测试）。

### 4.2 自安装保护异常归因 (Narrowed Failure Attribution)
针对依赖或配置失配场景，必须客观区分错误机制，不强求相同错误码：
1. **manifest-lock 失配**: 在配置 `pnpm-workspace.yaml` (`verifyDepsBeforeRun: error`) 时，pnpm 执行前进行清单与锁文件校验，直接抛出 `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` 并拒绝启动子进程（门禁前阻断）。
2. **lock-node_modules 失配**: pnpm 正常启动子进程，但因物理依赖缺失由底层工具报 `MODULE_NOT_FOUND` 或找不到可执行文件退出，退出码 1 阻断提交。
3. **packageManager 版本不可用**: Corepack 或包管理器因远端版本解析失败退出，退出码 1。

### 4.3 通用 Hook 执行行为与退出契约
共享 Git Hook 模板严格遵循串行执行全部配置门禁并累加失败退出码的既有行为：
- format -> lint -> type -> test 顺序调用。
- 任何门禁失败均会导致全局 `EXIT_CODE=1`。
- 所有配置门禁执行完毕后，若 `EXIT_CODE != 0`，输出 `🚫 [lazypack] Pre-commit quality gates failed. Commit aborted.` 并退出 1，阻断提交。
- 通用 Hook 模板保持对 Python 及所有项目完全通用，严禁为单门禁引入破坏通用性的定制短路。
