---
name: lazypack-setup
description: >-
  Compiles project-layer engineering discipline from lazypack-discipline fixed layer (0.2.0)
  after Matt Pocock skills setup. Probes repository, asks only necessary unknowns, confirms
  changes once, and generates six managed artifacts with fingerprint protection.
---

# /lazypack-setup

把 `lazypack-discipline` 的项目层纪律编译并装配到目标仓库中。本 Skill 是用户显式调用的 Prompt-driven skill，不在目标仓库安装常驻 CLI、常驻服务或 YAML 状态层。

---

## 核心原则

1. **地基先行 (V06=B)**：在 `setup-matt-pocock-skills` 之后运行；严格执行前置双检，未就绪则零写入并提示接力。
2. **少问多探 (V04=NEEDED)**：仓库已有事实绝不重复询问；必要未知附带推荐答案与探测缺失原因，默认零问。
3. **单次整体确认 (V05=YES)**：所有文件改动、托管区 diff、脚本/配置/权限副作用一次性呈现，用户整体确认后写盘；无变化重跑为 no-op，不再提示确认。
4. **保护已有修改 (V08=FINGERPRINT, V09=B, V10=PRECISE)**：无标记既有文件暂停该文件并汇报待裁；托管区用指纹检测人工修改与升级；块外内容字节不变；无关脏工作区不阻塞。
5. **诚实报告门禁 (V14=A, V15=A)**：区分 setup 完成、命令接线、命令运行、Hook 激活与检查通过；缺命令不虚构，不谎称门禁已生效。

---

## 执行流程

### 第 1 步：前置双检 (Pre-flight Double Check)

执行前置只读检查，规则遵循 [references/verification.md](references/verification.md) §1：

1. **Issue Tracker**：核验 `docs/agents/issue-tracker.md` 是否存在、非空且包含实质性 tracker 说明正文（除标题行外必须包含正文描述，纯中文实质说明有效，仅有标题或空模板视为无效）。
2. **常驻入口**：跟随 Matt 的选择。若 `CLAUDE.md` 存在则优先选用，否则选用 `AGENTS.md`；核验文件内是否存在 `## Agent skills` 入口块，且该标题块作用域内部有效指向 `docs/agents/issue-tracker.md`（若指向 `domain.md` 则一并引用，但缺失 `domain.md` 绝不阻断）。

> **前置失败判定**：若任一检查项未通过，**立即停止，严禁写入任何文件**，向用户输出准确接力提示：
> `请先运行 /setup-matt-pocock-skills 完成前置配置，再运行 /lazypack-setup。`

---

### 第 2 步：项目只读探测 (Probing)

按以下顺序只读收集项目事实：
1. **Git 根与工作区**：定位 `.git` 目录，检查目标写入路径是否存在已暂存/未暂存修改。
2. **常驻规则入口**：确认选用 `CLAUDE.md` 还是 `AGENTS.md`（若两者并存，选 `CLAUDE.md`，并在报告中注明双文件现状）。
3. **语言与包管理器**：检查 `package.json`、`pnpm-lock.yaml`、`uv.lock`、`pyproject.toml`、`Cargo.toml` 等。
4. **既有质量门禁命令**：检查 `scripts` 或配置文件中已有的 `format`、`lint`、`type`、`test` 命令（如 `eslint`, `prettier`, `biome`, `ruff`, `pytest`, `tsc` 等）。
5. **既有 Hook 管理器**：探测 `.husky/`、`lefthook.yml`、`package.json` 中的 `simple-git-hooks` 等。
6. **既有产物状态**：检查根目录与 `docs/` 下是否已存在六类产物，解析是否存在有效 lazypack 托管标记（见 [references/managed-blocks.md](references/managed-blocks.md)）。
7. **角色技能可用性核实**：只读核实分配给各角色的 Skill / MCP 的实际可用证据，严格区分四种正交维度：
   - **技能已安装证据**（如定义文件存在、命令在 PATH 中）；
   - **实际可调用证据**（如会话中实测调用通过）；
   - **门禁接线状态**（如 pre-commit Hook 已接线并配置对应检查命令）；
   - **项目图谱索引状态**（如存在 `.codegraph/` 索引目录，区分于工具未安装）。
   四种维度分别描述，不彼此替代。三类输入场景与示例输出如下：
   - **已知可用**（工具已安装且实测可调用）：`依赖已就绪 (技能已安装，当前会话调用已验证) [已就绪]`；
   - **明确缺失**（环境中未检测到工具）：`依赖缺失 (宿主环境未检测到对应工具/Skill) [未安装]`；
   - **未验证**（未经当前会话调用或项目图谱未建）：`依赖约束 (...)；工具可用但本项目未建立 .codegraph/ 索引目录 [部分依赖未验证/图谱未建]` 或 `未验证 (...) [未验证]`。
   不将所有 MCP 的安装作为前置双检的阻断项（非阻断项，仅如实反映在角色表中）。

---

### 第 3 步：必要未知澄清 (Minimal Questions)

- **默认零提问**：能从仓库探测推导的事实不得提问。
- **必要未知场景**：
  - 当代码仓完全缺失某项检查命令时，根据固定层 §6.2 推荐默认工具（JS/TS 推荐 `biome`；Python 推荐 `uv` + `ruff` + `ty`）。
  - 明确询问用户是否采纳推荐安装默认工具，还是保持未接线（`missing`）。
  - 阐明：用户接受推荐仅授权生成安装计划与条件分支，不等于工具已装好，更不等于门禁已生效。
  - 每个问题必须声明“为什么仓库内无法可靠确定”并附推荐选项。

---

### 第 4 步：生成拟写入草案与整体确认 (Overall Confirmation)

在对话中一次性展示完整变更草案，供用户统览与决策：
1. **拟新建文件清单**：目标路径与完整拟写内容（使用 [templates/](templates/) 渲染，填入当前 `src`, `gen`, `input`, `fp`；其中 `docs/agents/roles.md` 依据探测到的环境可用证据如实填写状态说明，不无条件声明全部已就绪）。
2. **拟修改既有文件 diff 与拟新建产物**：
   - 常驻入口（`CLAUDE.md` 或 `AGENTS.md`）：
     * **条件渲染指针 (F05)**：根据各类产物的实际托管状态渲染指针行。若 `roles.md`、`ARTIFACTS.md`、`CODING_STANDARDS.md`、`RELEASE.md` 处于正常受管状态（NEW / MANAGED / UPGRADE / DRIFT / NO-OP），渲染对应指针行；若处于 `PAUSE`、`BROKEN` 或未托管状态，**彻底省略对应指针行**，并在完成报告中记录为未托管；其余已就绪指针仍保留，不阻断常驻入口自身生成。所有指针条件替换必须在计算正文指纹 (`fp`) 前完成，严禁遗留任何未展开占位符。
     * **双角色门禁明文 (R3-A)**：种子模板托管块内显式包含双角色门禁要求（执行者和审查者都必须运行适用的质量门禁；未接线、不适用、运行失败等按事实报告，不宣称通过或已生效），即使下游文档暂停，门禁纪律依然直接可见。
     * **手改与升级冲突判定 (F03)**：若托管区检测到用户手工修改且本次探测输入/模板升级（`[CONFLICT]`），展示磁盘当前手改内容与拟生成内容的 **2-way diff**，说明双重变动事实；由用户裁决是保留现状、采用候选还是手工合并，严禁虚构 3-way diff 或猜测基线。
     * 展示托管块内部 diff，明确块外已有内容字节完全保留。
   - 产物登记册（`docs/ARTIFACTS.md`）：
     * **事实真实与类别自洽 (R2)**：取消对目标仓 `docs/DECISIONS.md` 的预登记（固定层为来源说明，不假设目标仓存在同名文件）；严格遵循固定层 §4.2“同一类别 current 唯一”原则，将产物类别细分为任务跟踪（`docs/agents/issue-tracker.md`）、编码规范（`CODING_STANDARDS.md`）、发版规范（`RELEASE.md`）、角色映射（`docs/agents/roles.md`）。
     * **条件渲染登记行**：根据各产物的真实存在与受管状态生成登记行。若某产物处于 `PAUSE`、`BROKEN` 或未托管状态，**彻底省略对应登记行**，严禁将其虚构为 `current` 或受管产物；其余有效产物正常登记；所有条件替换必须在计算指纹 (`fp`) 前完成，正文严禁残留未展开占位符。
3. **暂停项说明**：若检测到第 2 至第 5 类产物已有人工文件且无 lazypack 标记，标记为暂停，说明保留原因。
4. **副作用确认与安装分支 (F01, F06)**：
   - **依赖安装计划与条件分支**：
     * 列出已批准的安装动作（如 `pnpm add -D @biomejs/biome` 或 `uv add --dev ruff ty`）及预计变更的文件（manifest / lockfile）；
     * 明确成功/失败条件分支：
       - 若安装命令返回退出码 0 且核验命令可调用 -> 门禁状态确定为 `wired`；
       - 若安装命令失败（退出码非零或网络超时） -> 门禁状态确定为 `install-failed`，写入门禁脚本阻断提交并在报告中告警；
       - 若用户拒绝推荐安装 -> 门禁状态确定为 `missing`。
     * 明确原则：**接受推荐、返回退出码零、检查结果通过是完全不同的状态**。未获确认或超出计划的安装严禁执行；网络失败重试最多 1 次，严禁无限重跑，更不得追加未确认工具。
   - **Git 本地配置与管理器兼容**：
     * 若已有自定义 `core.hooksPath` 且无已知管理器，在计划中明确兼容方式或列为冲突暂停；
     * 若无管理器且无冲突，列出将执行 `git config core.hooksPath .githooks`。
   - **执行权限变更**：POSIX 下设置脚本权限位（`chmod +x .githooks/pre-commit`）。
5. **门禁接线清单**：列出 `format`、`lint`、`type`、`test` 的拟接线命令与条件分支预设。

> 提示用户输入确认：`以上为本次 setup 全部变更。确认写入？[y/N]`。用户拒绝则停止写入，如实报告未操作项。

---

### 第 5 步：精准写入顺序 (PRECISE Execution)

用户整体确认后，按以下严格顺序安全写盘（写入规则遵循 [references/managed-blocks.md](references/managed-blocks.md)）：
1. **执行已批准的依赖安装并核验 (F01)**：
   - 若用户确认了推荐工具，先在目标项目执行已批准的安装命令；
   - 检查安装命令退出状态码；若遭遇网络波动最多重试 1 次，严禁循环重跑或私自换用其他工具；
   - 核验工具命令是否可实际调用（如执行 `--version`）；
   - 根据真实结果确定门禁最终状态：核验成功记为 `wired`；安装或核验失败记为 `install-failed`。
2. **按真实状态渲染并写入新建独立产物**：
   - `.githooks/pre-commit`（或对应管理器入口）：以真实门禁状态（`wired` / `install-failed` / `missing` / `n/a`）渲染并写盘。若安装失败，脚本明确写入 `install-failed` 状态，确保在提交前能够被阻断并提示依赖安装失败；
   - `CODING_STANDARDS.md`（若未暂停）；
   - `RELEASE.md`（若未暂停）；
   - `docs/agents/roles.md`（若未暂停）。
3. **核验写入事实后渲染并写入产物登记册**：
   - `docs/ARTIFACTS.md`（若未暂停）：严格基于前置存在核验（`docs/agents/issue-tracker.md`）及上述独立产物的真实写入成功状态渲染登记行。只有实际写入成功/磁盘核验通过的事实才进入最终成功状态；若执行部分失败，登记册绝不提前声称未成功文件已交付，仅登记真实就绪项；写盘前重新从磁盘采样 Layer 0 依赖状态生成最终 `header.input` 并计算 `fp` 写盘。
4. **后改既有入口 (F07)**：
   - 常驻入口（`CLAUDE.md` 或 `AGENTS.md`）：基于上述产物的真实受管/写入结果条件渲染指针行（包含直接可见的双角色门禁要求），重新从磁盘采样 Layer 0/1 依赖状态生成最终 `header.input` 并计算 `fp`；探测文件已有主流换行符（CRLF 或 LF），在文件末尾追加或更新唯一托管块时沿用该换行符，严格保证块外字节完全不变；
   - 若有既有 Hook 管理器：按既有约定追加受控调用行。
5. **生效副作用**：
   - 执行 `git config core.hooksPath .githooks`（若使用原生受控 Hook 且无冲突）；
   - POSIX 系统设置脚本权限位（`chmod +x`）。

---

### 第 6 步：输出诚实完成报告 (Honesty Report)

写入完成后，输出结构化报告，严格区分各层次事实（遵循 [references/verification.md](references/verification.md) §4）：
- **依赖安装事实**：列出实际执行的安装命令、退出码与命令可调用核验结果；未执行真实安装的环境明确说明为“流程演练”。
- **产物写入与登记事实**：逐项列出路径、实际操作状态（`new` / `append` / `unchanged` / `preserved` / `skipped`）、`src`、`gen`、`fp`。必须准确描述实际发生的操作，严禁使用含混的“已省略”掩盖保护或未修改事实：
  * **拟生成与写入项**：若产物已受管写入，且某下游依赖暂停/损坏，分别准确报告“本轮拟生成内容未纳入该产物指针/登记行”及“实际写入后该文件不存在该行”；
  * **登记册本身处于 PAUSE / BROKEN / 未托管时**：明确报告“登记册已保留受保护原样，本轮未做登记变更”；严禁声称在其中删改或省略了任何登记行；即便原始人工登记册包含过时记录亦不擅改，如实解释未托管保护边界；
  * **登记册处于受管 NO-OP 时**：明确报告“登记册内容未变（未写盘）”，如实说明磁盘当前已有登记行，严禁虚报为本轮重写；
  * **常驻入口按实际状态报告**：仅在实际追加/更新托管块时报告“指针已按受管产物实际状态条件写入”；若常驻入口被保护、暂停或未写入，严禁声称已修改指针；
  * **部分失败或中断时**：分别记录实际成功写入项与保留未动项，严禁虚报交付状态。
- **门禁状态**：逐项列出 `format`、`lint`、`type`、`test` 的接线状态（`wired` / `missing` / `install-failed` / `n/a`）；若存在 `install-failed`，重点告警阻断风险。
- **Git Hook 激活证据 (F06)**：
  * 严格区分 `静态配置就绪 (Configured)` 与 `运行时已验证 (Runtime Verified)`；
  * 未经 Git 原生机制实际触发调用的，激活状态必须如实标为 `未验证`（仅标明配置就绪）；
  * 若 Git 原生调用了 Hook 但门禁命令返回非零，如实记录“Git 调用已验证，但门禁检查失败”，绝不谎称检查通过。
  * 注明新克隆机器启用步骤。
- **未验证项标注**：平台打包段与未经实操的发布命令明确标 `未验证`。
- **恢复清单**：提供新建文件的精确删除清单（`rm ...`）与既有修改的托管块行级恢复指引；绝不提供全局 reset/clean 命令。

---

## 参考文献与资源

- [references/DECISIONS.md](references/DECISIONS.md)：本包固定层 0.2.0 派生快照（只读事实源）。
- [references/managed-blocks.md](references/managed-blocks.md)：标记语法、换行/编码规范、指纹与输入摘要算法、重跑决策树。
- [references/verification.md](references/verification.md)：前置检查规范、Hook 激活证据判定、门禁短路策略。
- [templates/](templates/)：六类产物的最小种子模板。
