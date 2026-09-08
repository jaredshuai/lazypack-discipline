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
     - **调用证据与检查结果解耦**：若 Git 原生调用了 Hook，但其中某项门禁返回非零（或阻断），证明 **Git Hook 运行时调用已验证 (Runtime Verified)，但门禁检查失败 (Check Failed)**。两者严格分开记录，绝不能因为调用成功就称检查通过，也不能因为检查失败就否定 Git 调用的真实性。
  3. **未验证标注**：
     - 若未在实际环境中由 Git 原生机制触发过运行时验证，激活状态必须如实标注为 `未验证`（仅标明静态配置就绪）。
- **新克隆启用说明**：
  Git 本地配置不会随仓库推送同步到远端。若使用非管理器原生 Hook，报告中必须明确说明：
  `团队成员或新克隆机器请运行: git config core.hooksPath .githooks 启用提交前门禁。`

---

## 3. 四项质量门禁与短路策略 (V13, V14, V15)

门禁覆盖四项：`format`、`lint`、`type`、`test`。

### 3.1 状态分类
- `wired`：已检测到命令（或用户接受推荐工具且依赖安装成功并核验可调用），命令写入 Hook 脚本中。
- `missing`：仓库中无对应命令，或用户拒绝了推荐工具；如实记录为未接线。
- `install-failed`：推荐工具安装依赖过程失败，阻断并如实报告。
- `n/a`：项目类型不适用（例如纯文档仓无类型检查或代码测试）。

### 3.2 受控 Hook 脚本执行与短路策略
在受控 Hook 脚本（如 `.githooks/pre-commit`）中，执行逻辑遵循严格的隔离与闭门防御契约：
1. **missing / n/a**：
   - 打印提示：`echo "[lazypack] <check>: skipped (missing or n/a)"`
   - **绝不调用不存在的命令**，**绝不退出非零码**，允许流水线继续检查下一项。
2. **install-failed**：
   - 打印错误：`echo "[lazypack] <check>: blocked (dependency installation failed)"`
   - 置位 `EXIT_CODE=1`，阻断提交。
3. **wired**：
   - 必须校验命令非空；若状态为 `wired` 但命令为空，打印错误并置位 `EXIT_CODE=1`。
   - 命令在独立子 shell 进程中求值：`if ! ( eval "$GATE_CMD" ); then ...`。
   - **隔离与失败保留性**：
     * 命令内部的 `exit 0` 仅终止该命令自身的子 shell，绝不能提前退出父 Hook 脚本或跳过后续检查项；
     * 命令内部对 `EXIT_CODE` 的任何赋值仅限于子 shell 环境变量，绝不能清除父进程已记录的失败状态；
     * 若任一命令退出码非零，立即置位父进程 `EXIT_CODE=1`；后续项的成功或跳过绝不能掩盖先前项的失败。
4. **非法状态与占位符遗留 (Fail-closed)**：
   - 通配分支 `*)` 打印未知状态错误并显式置位 `EXIT_CODE=1`，杜绝静默放行。

---

## 4. 诚实完成报告结构 (Honesty Report)

运行结束时，输出结构化完成报告，严格区分以下 6 类事实，严禁混淆：
1. **Setup 过程完成**：文件生成与写盘是否结束。如实报告各文件是实际新建、追加更新、保持未变（NO-OP）还是保留未动（PAUSE/BROKEN），严禁把受保护未动文件声称为本轮已修改或已删改。
2. **命令接线状态 (Gating Wired)**：四项门禁各自是 `wired`、`missing`、`install-failed` 还是 `n/a`。
3. **命令实跑结果**：本次 setup 过程中若触发过验证命令，各命令的实际退出码与输出摘要；未实跑显式标 `未运行`。
4. **Git Hook 激活状态**：区分 `静态配置就绪 (Configured)` 与 `运行时已验证 (Runtime Verified)`；未实测显式标 `未验证`，新克隆机器标明启用命令。
5. **检查通过状态**：只有当所有 wired 项实际运行且退出码均为 0 时，才可声称检查通过；任何含 missing/n/a 的情况不得宣称“门禁全面生效”。
6. **留存策略与协作材料事实**：如实报告访谈留存模式与启用维度（`decisions-only` / `ideas-pool` / `minutes-only` / `raw-qa` / `hybrid` / `unconfigured`）；报告权威正文源摘要 `retentionSrc`；若用户未答或超时，显式报告为“待确认 pending（保持未配置，零写入）”，严禁虚构采纳；私有原文报告安全别名与 `session-authorized` 绑定状态（当前会话未绑定标 `unbound`，不虚报已交付）；若检测到既有人工 ideas 文件，显式标明“人工产物受保护引用（未覆盖）”；若写入中断，严禁提前声称产物已登记。

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
