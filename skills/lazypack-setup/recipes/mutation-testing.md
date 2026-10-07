---
id: mutation-testing
version: 1.0.0
name: "Mutation Testing (Stryker / mutmut)"
description: "Supplementary mutation testing quality gate for TypeScript and Python projects, integrating with existing test frameworks."
config_owner: tool-or-user
multi_language_priority: 0
---

# 变异测试配方 (Mutation Testing Recipe)

本文件是 `/lazypack-setup` 消费的变异测试配方数据卡（只读源）。声明 Stryker（TypeScript）与 mutmut（Python）的探测、安装、工具脚本分发与触发面接线策略。

- **ID**: `mutation-testing`
- **Version**: `1.0.0`
- **Platform**: `generic`
- **Multi-language Priority**: `0`（可与 TypeScript / Python 基线配方并存的补充质检层）
- **适用场景**: 为已有测试套件的 TypeScript 或 Python 项目添加变异测试能力，支持夜跑闭环与 Agent 集成。

---

## 1. 元数据与配置所有权 (Metadata & Ownership)

- **配方标识 (`id`)**：`mutation-testing`
- **配方版本 (`version`)**：`1.0.0`
- **多语言优先级 (`multi_language_priority`)**：`0`（最高优先级，可与任何语言配方共存）
- **配置所有权 (`config_owner`)**：`tool-or-user`
- **零配置写入原则**：
  - 本配方坚决执行**零外部配置写入**：不创建 `stryker.conf.js`、`setup.cfg [mutmut]` 等工具私有配置文件；
  - 承重理由：变异测试工具的配置高度依赖项目结构、测试框架与性能权衡，强制配置会导致冲突或次优配置；
  - 工具配置留给项目开发者根据实际需求自行管理，setup 仅负责工具安装、脚本分发与触发面接线。

---

## 2. 适用条件与支持矩阵 (Applicability & Support Matrix)

变异测试作为**补充质检层**（Priority 0），可与任何语言的基线配方并存。探测逻辑独立判定 TypeScript 与 Python 两条路径：

### 2.1 TypeScript 路径探测矩阵

| 优先级 | 判定条件 | 分支类别 | 行为与处理原则 |
|---|---|---|---|
| **优先级 0** | 存在其他语言清单（如 `Cargo.toml`, `pyproject.toml`） | 多语言项目 | **100% 保留其他语言现有门禁**；变异测试可同时支持多语言（TS + Python 并行配置） |
| **优先级 1** | 存在 `package.json`，且依赖中包含测试框架（jest / vitest / mocha / karma） | **完全支持** | 探测测试框架，按优先级 vitest > jest > mocha > karma 选择 Stryker runner，提供完整安装与接线 |
| **优先级 2** | 存在 `package.json`，但未探测到支持的测试框架 | 受限分支 (`no-test-framework-detected`) | **信息性警告**：提示未探测到测试框架，跳过 Stryker 安装；**继续分发工具脚本**（框架无关），可用于手动配置 |
| **未命中** | 不存在 `package.json` | 未命中 TS 路径 | 退出 TS 路径探测，继续 Python 路径探测 |

### 2.2 Python 路径探测矩阵

| 优先级 | 判定条件 | 分支类别 | 行为与处理原则 |
|---|---|---|---|
| **优先级 0** | 存在其他语言清单 | 多语言项目 | 同上，保留其他语言门禁 |
| **优先级 1** | 存在 `pyproject.toml` 或 `requirements.txt` | **完全支持** | 提供 mutmut 安装与接线（mutmut 不依赖特定测试框架，直接探测 Python 项目标志） |
| **未命中** | 不存在 Python 项目标志 | 未命中 Python 路径 | 退出 Python 路径探测 |

### 2.3 探测结果决策表

| TypeScript 路径 | Python 路径 | 最终行为 |
|---|---|---|
| 完全支持 | 完全支持 | 安装 Stryker + mutmut，分发 4 个脚本，提供 TS + Python 双语言触发面 |
| 完全支持 | 未命中 | 仅安装 Stryker，分发 4 个脚本，提供 TS 触发面 |
| 未命中 | 完全支持 | 仅安装 mutmut，分发 4 个脚本，提供 Python 触发面 |
| 受限分支 | 未命中 | 跳过变异测试工具安装，**继续分发工具脚本**，提示手动配置 |
| 未命中 | 未命中 | **退出本配方**；通用 setup 继续装配通用纪律文档 |

> **关键约束**：
> 1. 未探测到测试框架**不阻止工具脚本分发**：解析器、基线管理、issue 创建工具是框架无关的，仍有价值。
> 2. 变异测试作为补充质检，**不影响基线配方的四门禁**（format / lint / type / test）。
> 3. 未命中配方适用条件仅表示**不接入变异测试**，绝对不阻止通用 setup 继续装配通用纪律。

---

## 3. 工具探测与推荐 (Tool Detection & Recommendations)

### 3.1 TypeScript 测试框架探测

**探测方法**：仅检查 `package.json` 的 `dependencies` 和 `devDependencies`，查找关键包名：

- `vitest` → `@stryker-mutator/vitest-runner`
- `jest` → `@stryker-mutator/jest-runner`
- `mocha` → `@stryker-mutator/mocha-runner`
- `karma` → `@stryker-mutator/karma-runner`

**优先级选择**：若探测到多个测试框架，按优先级自动选择：**vitest > jest > mocha > karma**

**不支持框架**：Jasmine（framework 而非 runner，使用率低）、Cucumber（BDD 专用）

**探测失败处理**：
```
⚠️ 未探测到测试框架（jest/vitest/mocha/karma），跳过 Stryker 安装。
   如需使用变异测试，请先安装测试框架后重新运行。
   工具脚本已分发，可用于手动配置。
```

### 3.2 包管理器探测

**探测方法**：检查 lockfile 自动决定包管理器：

- `bun.lockb` → `bun add -D`
- `pnpm-lock.yaml` → `pnpm add -D`
- `yarn.lock` → `yarn add -D`
- `package-lock.json` → `npm install --save-dev`
- 默认 → `npm install --save-dev`

### 3.3 Python 变异测试工具

**固定工具**：mutmut 2.x（`pip install "mutmut<3"`）

**版本约束说明**：
- mutmut 3.x 改用 `mutants/` 缓存目录，不再写 `.mutmut-cache`
- 本配方的解析器、runner 脚本与 workflow 模板均按 2.x 口径读取 `.mutmut-cache`
- 固定安装 2.x 确保工具链兼容性

---

## 4. 工具脚本分发与版本管理 (Tool Script Distribution & Versioning)

### 4.1 核心工具脚本清单

本配方分发 **4 个核心工具脚本**（作为完整工具链统一分发）：

| 脚本文件 | 语言 | 用途 | 版本标记位置 |
|---|---|---|---|
| `mutation-baseline.mjs` | JavaScript | 基线管理（init / check / update），支持 TS + Python | 文件头部 `@version 1.0.0` |
| `parse-stryker-report.mjs` | JavaScript | Stryker JSON 报告解析器，输出统一报告格式 | 文件头部 `@version 1.0.0` |
| `parse_mutmut_report.py` | Python | mutmut 缓存解析器，输出统一报告格式 | docstring `@version 1.0.0` |
| `create-mutation-issues.mjs` | JavaScript | GitHub issue 创建工具，按文件分组 | 文件头部 `@version 1.0.0` |

**版本策略**：4 个脚本共享统一版本号（`1.0.0`），避免组合兼容性问题。

### 4.2 分发触发时机与机制

**触发时机**：用户首次选择"启用变异测试"时立即复制全部 4 个脚本

**存放位置**：目标项目的 `scripts/` 根目录（与其他项目脚本平级）

**复制机制**：
- 直接文件复制，保留原始内容和注释
- **不添加 lazypack 托管标记**（这些是独立工具，不是托管配置）
- 已有脚本处理：跳过复制，保留现有文件（遵循 V08=FINGERPRINT 保护原则）

### 4.3 版本检测与提取

**检测时机**：仅在用户选择"启用变异测试"时检测（包括首次和重跑）

**版本提取方法**：
- 逐行读取文件头部（前 30 行）
- 正则匹配：`/@version\s+(\d+\.\d+\.\d+)/`
- 高效无副作用（不执行脚本）

**版本比对逻辑**：
- 4 个脚本必须版本号一致（统一版本策略）
- 若版本不一致，报告版本不一致并列出每个脚本的具体版本号
- 仅信息性提示，不阻塞，继续其他 setup 流程

### 4.4 版本差异处理示例

**首次安装**：
```
用户选择"启用变异测试" 
→ 探测 scripts/ 目录
→ 不存在 4 个脚本：从 lazypack-discipline 复制全部 4 个脚本到目标项目 scripts/
→ 提示：✓ 已安装变异测试工具脚本 (v1.0.0)
→ 继续其他 setup 流程（触发面接线等）
```

**重跑（已有脚本，版本一致）**：
```
用户选择"启用变异测试"
→ 探测到 scripts/ 下已有 4 个脚本
→ 提取版本号：全部为 1.0.0
→ 源仓库版本：1.0.0
→ 版本一致，无提示
→ 继续其他 setup 流程
```

**重跑（已有脚本，版本低于源）**：
```
用户选择"启用变异测试"
→ 探测到 scripts/ 下已有 4 个脚本
→ 提取版本号：全部为 1.0.0
→ 源仓库版本：1.1.0
→ 提示：
  ℹ️ 变异测试工具有新版本可用：1.0.0 → 1.1.0
     要升级：删除 scripts/ 下的这 4 个脚本后重跑 setup
→ 继续其他 setup 流程
```

**重跑（版本不一致）**：
```
用户选择"启用变异测试"
→ 探测到 scripts/ 下已有 4 个脚本
→ 提取版本号并发现不一致：
  ⚠️ 变异测试工具脚本版本不一致：
     scripts/mutation-baseline.mjs: 1.0.0
     scripts/parse-stryker-report.mjs: 1.0.0
     scripts/parse_mutmut_report.py: 1.1.0  ← 版本不匹配
     scripts/create-mutation-issues.mjs: 1.0.0
  
  建议：删除 scripts/ 下的这 4 个脚本后重跑 setup，或手动统一版本。
→ 继续其他 setup 流程
```

**重跑（部分缺失）**：
```
用户选择"启用变异测试"
→ 探测到 scripts/ 下仅有 2 个脚本
→ 补全缺失的 2 个脚本
→ 检测已有 2 个脚本的版本并提示（如果有差异）
→ 继续其他 setup 流程
```

### 4.5 升级路径

用户想升级工具脚本时：
1. 手动删除 `scripts/` 下的 4 个脚本（mutation-baseline.mjs, parse-stryker-report.mjs, parse_mutmut_report.py, create-mutation-issues.mjs）
2. 重跑 `/lazypack-setup`，选择"启用变异测试"
3. Setup 会自动复制最新版本的 4 个脚本

或：
- 手动从 lazypack-discipline 复制单个/全部脚本到目标项目 `scripts/`

---

## 5. 变异测试工具安装 (Mutation Testing Tool Installation)

### 5.1 TypeScript: Stryker Runner 安装

**安装命令字面量**（基于探测到的测试框架与包管理器）：

```bash
# vitest + pnpm
pnpm add -D @stryker-mutator/vitest-runner

# jest + npm
npm install --save-dev @stryker-mutator/jest-runner

# mocha + yarn
yarn add -D @stryker-mutator/mocha-runner

# karma + bun
bun add -D @stryker-mutator/karma-runner
```

**核心依赖说明**：
- 仅安装 runner 包（例如 `@stryker-mutator/vitest-runner`）
- 依赖 npm 传递机制自动安装 `@stryker-mutator/core`
- 不安装额外的 Stryker 插件

**可调用核验**：
```bash
npx stryker --version
```

仅当核验命令返回退出码 0 时，Stryker 判定为 `install-success`；否则判定为 `install-failed`。

### 5.2 Python: mutmut 安装

**安装命令字面量**：

```bash
# 固定安装 2.x（3.x 不兼容本工具链）
pip install "mutmut<3"
```

**可调用核验**：
```bash
mutmut --version
```

仅当核验命令返回退出码 0 时，mutmut 判定为 `install-success`；否则判定为 `install-failed`。

### 5.3 安装失败处理

- 安装命令返回非零退出码，或可调用核验失败：标记为 `install-failed`
- 提示用户手动安装或排查环境问题
- 安装失败**不阻止工具脚本分发与触发面接线**（脚本可用于手动配置）

---

## 6. 触发面接线交互流程 (Trigger Surface Wiring)

### 6.1 询问时机与方式

**询问时机**：在安装 Stryker/mutmut 和分发脚本**之后**询问触发面选择

**流程顺序**：探测 → 安装工具 → 分发脚本 → **接线触发面**

**询问方式**：**多选**，不设互斥限制。用户可同时创建多个触发面（如 GitHub Actions + VS Code tasks）

询问界面示例：
```
? 选择要配置的触发面（多选，空格选择，回车确认）：
  [ ] GitHub Actions workflow（自动化 CI）
  [ ] 本地 cron/systemd（定时任务）
  [ ] VS Code tasks（手动触发）
```

### 6.2 触发面前置条件检查

| 触发面 | 前置条件 | 处理方式 |
|--------|----------|----------|
| GitHub Actions | `.git` 存在 + 远程仓库是 GitHub | 不满足则灰显或提示"（不可用：非 GitHub 仓库）" |
| 本地 cron/systemd | 无 | 总是创建模板文件（用户根据系统选择性使用） |
| VS Code tasks | 无 | 总是可创建（`.vscode/tasks.json` 是通用配置） |

**GitHub 仓库检测方法**：
- 执行 `git remote get-url origin` 或 `git remote -v`
- 判断 URL 包含 `github.com` 或 `github.enterprise`

### 6.3 触发面文件分发与语言变体

#### 6.3.1 GitHub Actions Workflows

**源模板位置**：
- TypeScript: `templates/.github/workflows/nightly-mutation-ts.yml`
- Python: `templates/.github/workflows/nightly-mutation-py.yml`

**目标位置**：
- TypeScript: `.github/workflows/nightly-mutation-ts.yml`
- Python: `.github/workflows/nightly-mutation-py.yml`

**语言变体决策**：
- 探测到 TypeScript 测试框架 → 创建 TS workflow
- 探测到 Python 项目标志 → 创建 Python workflow
- 两者都有 → 创建两套 workflow
- 两者都没有（未探测到测试框架场景）→ 询问用户："未探测到测试框架，但工具脚本已分发。是否仍要创建触发面？（可用于手动配置 Stryker command runner）"

**已存在文件处理**：
- 同名文件存在 → 跳过创建并提示："ℹ️ 文件已存在，跳过创建"
- 保护用户修改，不覆盖

**创建后指引**：
```
✓ 文件已创建：.github/workflows/nightly-mutation-ts.yml
⚠️  需要配置 GitHub Personal Access Token（用于创建 issue）
📖 参考文档：docs/quality-gates/nightly-mutation-loop.md 的 GitHub Actions 部分
```

#### 6.3.2 本地 cron/systemd

**源模板位置**：
- `templates/scripts/nightly-mutation-runner.sh`
- `templates/config/crontab.example`
- `templates/config/mutation-testing.service`
- `templates/config/mutation-testing.timer`

**目标位置**：
- `scripts/nightly-mutation-runner.sh`
- `docs/setup/crontab.example`
- `docs/setup/mutation-testing.service`
- `docs/setup/mutation-testing.timer`

**目录创建**：如果 `docs/setup/` 不存在，创建它

**已存在文件处理**：同名则跳过并提示（保护用户修改）

**创建后指引**：
```
✓ 文件已创建：
  - scripts/nightly-mutation-runner.sh
  - docs/setup/crontab.example
  - docs/setup/mutation-testing.{service,timer}
⚠️  需要配置 gh CLI 认证（gh auth login）
📖 参考文档：docs/setup/crontab.example 中的使用说明
```

#### 6.3.3 VS Code Tasks

**生成方式**：代码生成（无模板文件）

**目标位置**：`.vscode/tasks.json`（合并模式）

**合并逻辑**：
1. 读取现有 `tasks.json`（不存在则创建空结构：`{"version": "2.0.0", "tasks": []}`）
2. 提取现有 tasks 的 `label` 集合
3. 为新 tasks 添加来源标记：`"detail": "来源：lazypack mutation-testing"`
4. 检查 label 冲突，无冲突则追加到 `tasks` 数组末尾
5. 写回 `tasks.json`

**TypeScript 任务 labels**：
- `Mutation Testing: Run Stryker`
- `Mutation Testing: Parse Results (TS)`
- `Mutation Testing: Check Baseline (TS)`
- `Mutation Testing: Update Baseline (TS)`
- `Mutation Testing: Create Issues (TS)`

**Python 任务 labels**：
- `Mutation Testing: Run mutmut`
- `Mutation Testing: Parse Results (Python)`
- `Mutation Testing: Check Baseline (Python)`
- `Mutation Testing: Update Baseline (Python)`
- `Mutation Testing: Create Issues (Python)`

**语言变体决策**：同 GitHub Actions

**创建后指引**：
```
✓ 已添加 tasks 到 .vscode/tasks.json
ℹ️  使用方式：Ctrl+Shift+P → Tasks: Run Task → 选择 Mutation Testing: ...
```

### 6.4 触发面分发目录结构总览

| 触发面 | 源模板 | 目标位置 |
|--------|--------|----------|
| GitHub Actions | `templates/.github/workflows/nightly-mutation-{ts,py}.yml` | `.github/workflows/nightly-mutation-{ts,py}.yml` |
| 本地 cron | `templates/scripts/nightly-mutation-runner.sh` | `scripts/nightly-mutation-runner.sh` |
| 本地 cron | `templates/config/crontab.example` | `docs/setup/crontab.example` |
| 本地 cron | `templates/config/mutation-testing.{service,timer}` | `docs/setup/mutation-testing.{service,timer}` |
| VS Code tasks | （代码生成，无模板） | `.vscode/tasks.json`（合并） |

---

## 7. 运行时行为与授权边界 (Runtime Behavior & Authorized Boundaries)

### 7.1 环境隔离原则

**TypeScript: 使用 `npx stryker run`**
- `npx` 提供环境隔离，包管理器无关
- 不依赖全局安装的 Stryker
- 从项目 `node_modules/` 或远程临时安装运行

**Python: 使用 `uv run --no-sync`**
- `--no-sync` 跳过自动同步虚拟环境
- 防止 Git commit 过程中意外网络同步
- 若环境缺失工具直接报错，提示手动 `uv sync`

### 7.2 Hook 集成边界

**明确声明**：变异测试**不进入 pre-commit Hook**

**理由**：
- 变异测试耗时以小时计（全量变异），不适合提交前门禁（秒级预算）
- 即使增量变异测试（仅变异改动文件），仍可能耗时数分钟，影响开发体验
- 变异测试属于夜跑质检层（nightly tier），不是本地提交前门禁

**正确时机**：
- PR / CI：增量变异测试（≤15 分钟预算）
- 夜间定时：全量变异测试（不限时）

### 7.3 基线文件与配置所有权

**基线文件**：`.mutation-baseline.json`
- 由 `mutation-baseline.mjs` 管理（init / check / update）
- 记录变异分数基线（score / killed / survived / total）
- 用户应提交到版本库（棘轮策略依赖）

**工具配置文件**：
- **不创建** `stryker.conf.js`、`setup.cfg [mutmut]` 等
- 工具配置由用户根据项目需求自行管理
- setup 仅提供安装、脚本分发与触发面接线

### 7.4 授权的缓存写入边界

**TypeScript (Stryker)**：
- `.stryker-tmp/` - Stryker 临时文件与增量缓存
- `reports/mutation/` - JSON 报告输出目录（`stryker.conf.js` 配置）

**Python (mutmut)**：
- `.mutmut-cache` - mutmut 2.x 缓存数据库（3.x 为 `mutants/`）
- `.mutmut-show-all.txt` - `mutmut show all` 输出捕获（解析器输入）

**变异测试队列**：
- `.mutation-queue/` - issue 创建工具输出的任务队列目录
- `.mutation-queue/*.json` - 按文件分组的存活变异体队列（Agent 消费）
- `.mutation-queue/*.body.md` - Dry-run 模式的 issue body 预览

### 7.5 已存在配置文件的保护

**Stryker 配置检测**：
- 若探测到 `stryker.conf.js` / `stryker.conf.mjs` / `stryker.conf.json`
- 提示："✓ 探测到现有 Stryker 配置，将使用现有配置"
- 100% 保留现有配置，不修改

**mutmut 配置检测**：
- 若探测到 `setup.cfg [mutmut]` 或 `pyproject.toml [tool.mutmut]`
- 提示："✓ 探测到现有 mutmut 配置，将使用现有配置"
- 100% 保留现有配置，不修改

---

## 8. 质检分层节奏集成 (Quality Check Rhythm Integration)

变异测试在三层质检节奏中的定位：

| 时机 | 变异测试内容 | 耗时预算 | 命令示例 | 处置人 |
|---|---|---|---|---|
| 本地提交前 (pre-commit) | **不运行** | - | - | - |
| PR / CI | 增量变异测试（只变异改动文件） | ≤15 分钟 | `npx stryker run --mutate $(git diff ...)` | CI 阻断 PR 合并 |
| 夜间定时 (nightly) | 全量变异测试 + 基线检查 + issue 创建 | 不限 | `npx stryker run` / `mutmut run` | 晨会处置失败项 |

**设计原则**：
- 变异测试耗时长，不进入本地提交前门禁（秒级预算）
- PR/CI 运行增量变异（改动文件），保证 ≤15 分钟预算
- 夜间运行全量变异，配合基线棘轮策略与 issue 创建
- 夜间失败项通过 GitHub issues 追踪，晨会处置

**夜跑闭环完整流程**（参考 `docs/quality-gates/nightly-mutation-loop.md`）：
1. 定时触发（cron / GitHub Actions / 手动）
2. 运行变异测试（Stryker / mutmut）
3. 解析报告 → 统一格式
4. 基线检查（门槛冻结策略）
5. 过滤等价变异体（`.equivalent-mutants.json`）
6. 创建 GitHub issues（按文件分组）
7. 开发者修复 → PR → 合并 → 下次夜跑验证

---

## 9. 与基线配方的关系 (Relationship with Base Presets)

### 9.1 并存原则

- 变异测试作为**补充质检层**（Priority 0），可与任何基线配方并存
- TypeScript 基线配方（`ts-biome-vitest`）提供四门禁：format / lint / type / test
- Python 基线配方（`python-uv-ruff`）提供四门禁：format / lint / type / test
- 变异测试配方提供**第五质检层**：mutation testing

### 9.2 依赖关系

- 变异测试**依赖已有测试套件**：必须先有可工作的单元测试
- TypeScript: 依赖 jest / vitest / mocha / karma
- Python: 依赖 pytest（mutmut 默认使用 pytest 运行测试）
- 若测试套件不存在或不完整，变异测试无法有效运行

### 9.3 不影响基线门禁

- 变异测试**不进入 pre-commit Hook**，不影响基线四门禁的运行
- 变异测试工具安装失败**不阻止基线配方接线**
- 变异测试配方退出**不影响基线配方状态**

---

## 10. 退出配方与清理 (Recipe Exit & Cleanup)

### 10.1 退出触发

用户可选择"退出变异测试配方"，触发清理流程。

### 10.2 清理范围

**工具脚本**：
- **不自动删除** `scripts/` 下的 4 个工具脚本
- 理由：脚本是独立工具，不是托管配置，用户可能有手动修改或依赖
- 若用户需要删除，手动执行

**触发面文件**：
- **不自动删除** `.github/workflows/nightly-mutation-*.yml`
- **不自动删除** `scripts/nightly-mutation-runner.sh`
- **不自动删除** `docs/setup/` 下的配置示例
- **不自动删除** `.vscode/tasks.json` 中的变异测试 tasks
- 理由：保护用户修改，避免意外数据丢失

**VS Code tasks 清理**（可选）：
- 若用户选择"清理 VS Code tasks"
- 从 `.vscode/tasks.json` 中移除所有带 `"detail": "来源：lazypack mutation-testing"` 的 tasks
- 保留其他 tasks

**变异测试工具**：
- **不自动卸载** Stryker runner 或 mutmut
- 理由：包卸载可能影响其他依赖，留给用户手动处理
- 提示用户如何手动卸载（如 `pnpm remove @stryker-mutator/vitest-runner`）

### 10.3 清理后行为

- 退出配方后，再次运行 setup 探测到工具脚本或变异测试工具时
- 将其报告为**未接线的环境既有工具**
- 绝不自动重新接线，必须经用户显式选择

---

## 11. 边界与未覆盖场景 (Boundaries & Out-of-Scope)

### 11.1 不支持的测试框架

**TypeScript**:
- Jasmine (framework 而非 runner)
- Cucumber (BDD 专用)
- AVA (Stryker 官方未提供 runner)

**Python**:
- unittest (mutmut 默认使用 pytest，unittest 需手动配置)
- nose (已废弃)

### 11.2 不自动创建的配置

- 不创建 `stryker.conf.js` / `setup.cfg [mutmut]`
- 不配置 Stryker `thresholds` / `mutate` 范围
- 不配置 mutmut `paths_to_mutate` / `do_not_mutate`
- 配置高度依赖项目结构，留给用户根据实际需求自行管理

### 11.3 不自动集成的 CI

- 本配方仅提供 GitHub Actions workflow 模板
- GitLab CI / Jenkins / CircleCI 等需用户手动配置
- 参考 `docs/quality-gates/nightly-mutation-loop.md` 的 CI 配置指引

### 11.4 不自动处理的等价变异体

- 等价变异体识别与豁免是**人工流程**
- `.equivalent-mutants.json` 由用户经代码评审写入
- `create-mutation-issues.mjs` 读取豁免文件并过滤
- 详细流程见 `docs/quality-gates/mutation-testing.md` §2

### 11.5 不保证的环境兼容性

**Windows 限制**：
- mutmut 依赖 `multiprocessing.fork`，Windows 不支持
- Windows 用户需使用 WSL 或 Docker
- VS Code tasks 模板假设 POSIX shell

**Node.js 版本**：
- Stryker 要求 Node.js ≥ 18
- 工具脚本（.mjs）要求 Node.js ≥ 24（验证环境）

**Python 版本**：
- mutmut 要求 Python ≥ 3.8
- 解析器脚本要求 Python ≥ 3.8

---

## 12. 交叉引用 (Cross References)

- **变异测试运营手册** (`docs/quality-gates/mutation-testing.md`) - 门槛冻结策略、等价变异豁免、胶水代码边界
- **夜跑闭环运营指引** (`docs/quality-gates/nightly-mutation-loop.md`) - 完整的夜跑自动化流程
- **工具脚本源码** (`scripts/`) - 所有工具的详细 CLI 参数与实现
- **等价变异体文件格式** (`docs/formats/equivalent-mutants.md`) - 豁免文件详细规范
- **统一变异报告格式** (`docs/formats/unified-mutation-report.md`) - 解析器输出格式
- **基线文件格式** (`docs/formats/mutation-baseline.md`) - 基线文件详细规范
- **质检分层节奏工单** (#37) - 白天秒级门禁 + 夜间重型质检的分层节奏

---

**配方版本**：1.0.0  
**最后更新**：2026-10-07  
**维护者**：lazypack-discipline 团队
