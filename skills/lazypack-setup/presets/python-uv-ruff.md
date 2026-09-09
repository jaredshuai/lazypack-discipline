---
id: python-uv-ruff
version: 0.1.0
name: "Python (uv + ruff + ty + pytest)"
description: "Standard Python CLI / tool quality gating preset using uv, ruff, ty, and pytest."
config_owner: tool-or-user
---

# Python 质量门禁配方 (uv + ruff + ty + pytest)

本文件是 `/lazypack-setup` 消费的单一首发 Python 门禁配方数据卡（只读源）。声明推荐工具、标准命令字面量、依赖安装计划与验证边界。

---

## 1. 元数据与配置所有权 (Metadata & Ownership)

- **配方标识 (`id`)**：`python-uv-ruff`
- **配方版本 (`version`)**：`0.1.0`
- **配置所有权 (`config_owner`)**：`tool-or-user`
- **零工具配置写入原则**：
  - 本配方坚决执行**零工具配置写入**：不创建、不修改目标仓库中的 `ruff.toml`、`.ruff.toml`、`pytest.ini` 等外部工具私有配置文件；
  - 承重理由：官方已证实外部配置文件（如 `ruff.toml`）在同级或上级存在时，会独占式遮蔽 `pyproject.toml` 中的 `[tool.ruff]` 配置。零配置写入策略彻底规避配置覆盖遮蔽及手动修改 TOML AST 的语法损坏风险；
  - 工具所有配置留给项目开发者或工具初始化自行管理，setup 仅负责门禁接线与批量依赖声明。

---

## 2. 适用条件与支持矩阵 (Applicability & Support Matrix)

探测与支持判定遵循以下严格优先级（多语言仓与非 uv 管理器优先判定，禁止凭 pyproject 盲目强推）：

| 优先级 | 判定条件 | 分支类别 | 行为与处理原则 |
|---|---|---|---|
| **优先级 1** | 存在非 Python 语言清单（如 `package.json`, `Cargo.toml`, `go.mod`） | 多语言项目 | **100% 保留其他语言现有门禁**；仅对 Python 部分按后续优先级判定，严禁将其他语言有效命令降级为 `missing` |
| **优先级 2** | 存在非 uv 的已知 Python 管理器（综合清单与配置，如 `poetry.lock`/`pyproject.toml[tool.poetry]`, `pdm.lock`, `Pipfile`） | 受限分支 (`alternative-manager`) | **保留现有检查命令**；缺失项仅输出适配当前管理器的手动安装指引，**坚决不默认迁移至 uv**；证据冲突时受限报告 |
| **优先级 3** | 存在标准 `pyproject.toml`，且系统 PATH 中存在 `uv` 二进制 | **完全支持** | **提供完整配方推荐**：支持按项补缺与批量依赖安装接线 |
| **优先级 4** | 存在标准 `pyproject.toml`，但系统 PATH 中缺失 `uv` | 受限分支 (`uv-binary-missing`) | 报告 `uv 未安装`；提示用户手动安装 `uv`，**setup 绝不在全局静默下载或安装二进制**；已有命令原样保留 |
| **优先级 5** | 仅存在传统 Python 构建清单（`setup.py`, `setup.cfg`, `requirements.txt`）且无 `pyproject.toml` | 受限分支 (`unsupported-legacy-layout`) | 判定为传统布局；**保留已有门禁命令**，缺失项输出手动配置指引，不强行重构项目文件结构 |
| **优先级 6** | 目标目录完全不存在 Python 相关清单 | 未命中配方 (`uninitialized-python-project`) | **退出本 Python 配方**；但**通用 `/lazypack-setup` 继续装配通用纪律**（如 `roles.md`、`ARTIFACTS.md` 等正常生成） |

> **关键约束**：
> 1. 未命中配方适用条件（如缺少 `pyproject.toml` 或缺失 `uv`）仅表示**不接入本门禁配方**，**绝对不阻止、不中断通用 setup 继续装配通用纪律文档**。
> 2. 缺少 `pyproject.toml` 或缺 `uv` 绝不能作为关闭、改写或降级仓库中已有有效门禁的借口。

---

## 3. 按门禁推荐与日常 Hook 命令字面量 (Gating Recommendations & Hook Literals)

针对用户采纳并接线的新配方槽位，必须使用以下经过官方文档核实与参数验证的标准命令字面量：

| 门禁槽位 | 推荐工具 | 日常 Hook 最终命令字面量 | 参数承重说明与只读边界 |
|---|---|---|---|
| **format** | `ruff` | `uv run --no-sync ruff format --check` | 附加 `--check`：格式化只读校验，返回非零若存在未格式化代码，不修改源码。附加 `--no-sync`：跳过自动同步虚拟环境。 |
| **lint** | `ruff` | `uv run --no-sync ruff check --no-fix` | 显式附加 `--no-fix`：官方已证实项目配置中可能包含 `fix = true`，显式 `--no-fix` 杜绝代码检查阶段静默修改源码。附加 `--no-sync`。 |
| **type** | `ty` | `uv run --no-sync ty check` | Astral 原生类型检查器，执行 `ty check` 只读类型检查。附加 `--no-sync`。当前成熟度与未验证边界如实说明。 |
| **test** | `pytest` | `uv run --no-sync pytest` | 标准测试运行器。附加 `--no-sync`。零用例收集退出码详见第 5 节。 |

### 3.1 承重参数 `--no-sync` 的关键约束与边界
- **防护意图**：官方已证实普通 `uv run` 在执行前默认检查 lockfile 并同步虚拟环境。若在提交前 Hook 中使用普通 `uv run`，一旦开发者修改了依赖但尚未锁定，Git commit 过程可能引发意外的网络同步或下载开销，甚至改变本地环境状态。
- `--no-sync` 指示 `uv run` 跳过自动同步流程；若当前环境中缺失对应工具直接非零报错阻断，并提示开发者手动运行 `uv sync`。
- **诚实边界**：`--no-sync` 仅说明跳过自动同步，**不保证命令一定来自项目虚拟环境或当前环境已与 lockfile 完全兼容**。官方文档未赋予其绑定特定环境的绝对保证，工具来源与环境一致性在报告中如实反映为“未独立核验”。

### 3.2 已有命令原样保留原则
- 若仓库在探测阶段已存在有效门禁命令（无论是普通 `uv run`、其他语言工具还是合法聚合脚本），**100% 原样保留既有命令字面量**；
- 绝不强行将仓库已有的命令替换为上述 `--no-sync` 字面量；
- 对已有命令是否可安全执行基线另行判断；若环境或安全性未知，基线校验标为 `not-run`，严禁通过自动修改命令来规避风险。

---

## 4. 批量依赖安装与统一失败归因 (Batch Installation & Attribution)

当用户在交互中确认采纳缺失门禁的推荐工具时，按以下规范执行安装与归因：

### 4.1 单次批量安装命令与工具去重
- **依赖去重规则**：`ruff` 同时覆盖 `format` 与 `lint` 两个门禁槽位，安装计划中必须去重，**严禁重复添加**；
- **全量采纳安装命令**：`uv add --dev ruff ty pytest`
- **部分采纳安装命令**：仅安装确认采纳且缺失的工具（例如仅采纳 format/lint 则执行 `uv add --dev ruff`；若已有 ruff 则执行 `uv add --dev ty pytest`）。

### 4.2 统一失败归因（非文件系统原子性）
- **客观事实**：包管理器执行依赖安装并非文件系统事务，命令执行失败（如网络中断、版本冲突、进程中断）时，目标磁盘上的 `pyproject.toml`、`uv.lock` 或 `.venv/` 可能已发生部分写入或环境残留。**严禁宣称“自动完全回滚”或“完全未写入”**。
- **统一失败归因规则**：
  1. 若批量安装命令返回非零退出码：
     - **本次批准安装的全部缺失项统一归因为失败**；
     - 对应槽位门禁接线状态置为 `install-failed`；
     - 出处行统一记录为 `<state>=install-failed:<source>=preset:<reason>=install-error`；
  2. **既有项不受牵连**：仓库原本已有的门禁工具（`source=existing`）**绝不降级**，保持 `wired:existing:pre-existing`；
  3. **环境残留独立报告**：如实列出磁盘实际读回状态（$S_{\text{agent}}$）与可能存在的未决依赖文件，向用户说明需手动清理或排查，不执行激进的自动深度删除。

### 4.3 可调用核验前提
- 批量安装命令返回退出码 0 后，**还必须逐项执行可调用核验**：
  - `uv run --no-sync ruff --version`
  - `uv run --no-sync ty --version`
  - `uv run --no-sync pytest --version`
- 仅当核验命令返回退出码 0 时，对应槽位方可判定为 `wired`；若可调用核验失败，对应槽位判定为 `install-failed`；
- **可调用失败与门禁检查失败严格解耦**：工具无法调用是依赖安装/环境问题，不同于代码存在质量缺陷导致的门禁检查未通过。

---

## 5. 运行时行为与受控缓存边界 (Runtime Behavior & Cache Boundaries)

### 5.1 Pytest 零用例收集 (ExitCode 5) 的权威处置
- **官方规范**：根据 pytest 官方规范（`ExitCode.NO_TESTS_COLLECTED = 5`），当 pytest 正常完成测试收集流程且未发现任何测试用例时，进程退出码为 5；
- **Hook 闭门防御逻辑**：Hook 脚本捕获非零退出码，阻断提交并诚实报告：
  - 接线状态：`test: wired`（保持接线，绝不改写为 missing 或 n/a）；
  - 实跑结果：`failed (ExitCode 5: no tests collected)`；
- **严禁掩盖**：严禁伪报绿，严禁因零用例将状态改写为 `n/a`（`n/a` 仅适用于纯文档等非代码项目）；
- 若测试收集阶段发生语法错误、插件导入失败或其他异常，直接按实际非零退出码报告，不引入无必要的硬编码错误分类。

### 5.2 授权的受控缓存写入与测试副作用边界
- 基线校验与日常 Hook 执行明确授权写入以下受控编译/运行缓存：
  - Ruff 缓存目录：`.ruff_cache/`
  - Pytest 缓存目录：`.pytest_cache/`
  - Python 字节码目录：`**/__pycache__/*.pyc`
- **测试副作用边界**：测试代码在收集期（`pytest_configure`, `conftest.py`）及运行期可能执行任意代码与网络/文件操作。**绝不将受控缓存当成所有副作用的无条件授权**。若测试环境不可信或可能包含未知外部副作用，setup 在基线校验阶段允许将测试标为 `not-run`。

---

## 6. 出处规范与退出配方保护 (Provenance & Exit Protection)

### 6.1 出处注释行语法规范
当 Hook 包含本配方内容时，在托管块正文头部渲染严格标准化的出处注释行：

```sh
# lazypack:preset id=python-uv-ruff version=0.1.0 format=<state>:<source>:<reason> lint=<state>:<source>:<reason> test=<state>:<source>:<reason> type=<state>:<source>:<reason>
```

- **键排序**：固定头部键 `id`, `version`，后接严格字母升序的四门禁键：`format` $\to$ `lint` $\to$ `test` $\to$ `type`；
- **字段字符集与格式约束**：
  - `id`：安全小写字母、数字与连字符，固定为 `python-uv-ruff`；
  - `version`：固定数字点分版本 `0.1.0`；
  - `<state>`：`wired` \| `missing` \| `install-failed` \| `n/a`（允许枚举 `n/a` 中的斜杠）；
  - `<source>`：`preset` \| `existing` \| `none`；
  - `<reason>`：`recommended` \| `declined` \| `pre-existing` \| `no-tool` \| `install-error` \| `not-applicable`；
- **配方未采用时的省略规范**：若仓库全部工具为既有工具且未采用本配方（样例 C），**既省略 Hook input 中的 `preset`/`presetSrc`/`provenance`，也省略整个 `# lazypack:preset` 出处行**，不留任何空白占位行。

### 6.2 退出配方的生命周期预检与所有权保护
当用户需要退出配方或重置门禁时，执行严格生命周期预检：
1. **标记与指纹核验**：读取 `.githooks/pre-commit` 托管块并计算 `current_fp`；
2. **手改防御与版本/命令不匹配阻断**：
   - 若检测到 `[BROKEN]`（标记损坏）、`[DRIFT]`（用户手动修改了命令但未修改出处行，`current_fp !== header.fp`）或 `[CONFLICT]`；
   - **绝对禁止依据出处行自动删除或重置任何命令！**
   - **版本与命令不匹配防御**：若来源对应旧配方版本（如出处 `version` 与当前配方不一致），或者槽位命令字面量不匹配当前推荐串且无法确定安全逆向映射：
     - **整个自动退出分支必须立即停止**；
     - 完整保留现有命令、`# lazypack:preset` 出处行和配方 input 字段，向用户报告未解决项由人工裁决；
     - **坚决禁止无条件删除出处而残留无主命令**；
   - 立即终止自动退出，向用户展示当前内容与推荐模板的 2-way diff，由人工进行安全清理。
3. **安全清理范围与重算**：
   - 仅当 `current_fp === header.fp` 且来源有效可确定安全退出时，才允许自动清理；
   - 仅将 `<source>=preset` 且命令字面量严格匹配配方推荐串的槽位重置为 `missing`（清除命令字面量）；
   - 从正文头部移除 `# lazypack:preset` 出处注释行，从 `input` 中移除配方字段（`preset`, `presetSrc`, `provenance`）；
   - **重新计算 Hook 托管块的 `fp` 与 `input`** 写回磁盘；
   - `<source>=existing` 的槽位及托管块外部的所有人工内容 **100% 保持保留**。
4. **整文件物理删除的三重严格条件与混合 Hook 保护**：
   - 整文件物理删除（`rm .githooks/pre-commit`）必须**同时满足三个严格条件**：
     ① **所有权可证明**：Hook 文件 100% 为 setup 全新创建；
     ② **无块外保留内容**：托管块外部完全无用户有效内容（无自定义 shebang、前置/后置逻辑或注释）；
     ③ **无任何 existing 或其他须保留槽位**：清理后所有门禁槽位均为 `missing` 或 `n/a`，没有任何保留的 `existing` 命令或其他活跃门禁；
   - **混合 Hook 保护**：若 Hook 中包含任何 `<source>=existing` 的槽位（或其他非配方保留命令），即使该 Hook 原本由 setup 新建且块外无内容，也**绝对严禁物理删除文件**！只能清理配方槽位与出处行，保留 existing 命令及其可调用入口并保持文件可执行权限。
5. **纪律文档与共享命令后续更新说明**：
   - 退出配方后，若全仓其他纪律文档（如 `CODING_STANDARDS.md`, `CLAUDE.md`, `AGENTS.md`）仍予保留，必须向用户明确说明：下次这些文档中共享命令（shared commands）或配置发生变动时，将按正常决策树走整体更新确认流程，不宣称全仓永久不变。
6. **退出后再次 setup 的行为规范**：
   - 配方退出后，本地环境中遗留的工具（如仍存在于 PATH 或 `.venv/` 的 `ruff` 等）**不代表用户重新接受配方**；
   - 再次运行 setup 探测到这些工具时，将其报告为未接线的环境既有工具，绝不自动安装或自动接线回配方，必须经由用户显式选择才可重新接线。
