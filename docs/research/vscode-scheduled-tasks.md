# VS Code scheduled tasks 调研报告

本文回答一个问题：VS Code 能否原生按时间表（scheduled / cron）自动运行 tasks.json 里的任务。结论决定夜跑 agent 自动补强闭环在 VS Code 触发面上的交付形态：手动触发模板，还是定时配置。

**状态与边界**：调研快照日期 2026-10-06。官方结论核对自 VS Code 官方任务文档（该页 2026-09-30 更新）与 tasks.json schema 附录；扩展市场状态为当日 Marketplace 快照。本仓未安装也未实测任何调度扩展，扩展部分只依据 Marketplace/GitHub 公开资料，不构成可用性背书。本文是夜跑闭环 integration 里程碑触发层选型依据，配套模板为仓库根 `.vscode/tasks.json`（登记见 [ARTIFACTS.md](../ARTIFACTS.md) §3）。

---

## 0. 结论（TL;DR）

1. **VS Code 原生不支持 scheduled tasks。** 任务自动运行只有一种形式：`runOptions.runOn: "folderOpen"`（打开文件夹时）。`runOn` 的全部取值是 `default`（只能通过 Run Task 手动执行）和 `folderOpen`，没有 cron、interval 或任何时间驱动触发器（依据见 §2）。
2. **扩展市场存在调度方案**（Cron Tasks、Cron Jobs 等，见 §3），可以把 cron 表达式映射到任意 VS Code 命令（含运行 tasks.json 任务）。但调度器寄生在 VS Code 进程里：要求 VS Code 常开、机器不睡眠关机、错过的时间点不补跑。夜跑是无人值守场景，这些前提通常不成立。
3. **因此本仓交付手动触发的 `.vscode/tasks.json` 模板**：四个核心任务 `run-mutation-tests`、`parse-results`、`check-baseline`、`create-issues`，外加三个 Python 变体（`-py` 后缀）。真正的夜跑定时触发走 GitHub Actions `schedule` 或本地 cron/systemd/Windows 任务计划（由 integration 里程碑其余任务在 `templates/` 下交付）。

## 1. 调研范围与方法

- 通读 VS Code 官方任务文档 *Integrate with External Tools via Tasks*（2026-09-30 更新版），重点核对 `runOptions` 一节与自动任务控制一节；核对 tasks.json schema 附录中 `runOn` 的枚举定义。
- 在 VS Code Marketplace 以 cron / schedule / task 关键词检索，对命中扩展核对：安装量、最近更新时间、实现机制（读 settings 里的表达式表，还是自定义 Task Provider）、是否可用任务系统命令桥接。
- 与本仓既有文档交叉核对工具口径（Stryker 报告路径、mutmut 版本差异），保证模板命令与工具实际接口一致。

## 2. VS Code 原生任务触发能力

### 2.1 runOptions.runOn 的全部取值

官方文档 *Run behavior* 一节，`runOn` 只定义两个值：

| 取值 | 行为 |
|---|---|
| `default` | 只能通过 **Run Task** 命令手动执行 |
| `folderOpen` | 打开所在文件夹时自动执行 |

没有按时间调度的取值。`runOptions` 的其余字段（`reevaluateOnRerun`、`instanceLimit`、`instancePolicy`）控制重跑与并发实例，同样与时间无关。

### 2.2 folderOpen 是事件驱动，不是定时

`folderOpen` 最接近「自动」，但它的触发事件是「文件夹被打开」：每次打开工作区都跑一次，与几点无关；VS Code 没开就不跑；也没有「到了某个时间补跑」的概念。另有两条限制：

- 设置 `task.allowAutomaticTasks` 默认 `off`，首次会提示用户选择 Allow / Disallow，选 Disallow 后不再提示；
- 不受信任工作区（untrusted workspace）中自动任务永不运行，无视该设置。

对重活（全量变异测试常以分钟到小时计）把它挂在每次打开工作区上并不合适，本模板未使用 `folderOpen`。

### 2.3 其余执行途径都不构成定时器

命令面板 / Terminal 菜单手动运行、`keybindings.json` 绑快捷键、compound tasks（`dependsOn` 编排）、user-level tasks、`launch.json` 的 `preLaunchTask`——这些覆盖「怎么方便地跑」，不覆盖「什么时候自动跑」。

### 2.4 小结

原生任务系统没有任何时间驱动触发器。「VS Code scheduled tasks」在原生层面不成立，只有手动触发与打开时触发两种。

## 3. 扩展市场调研

### 3.1 Cron Tasks（zokugun.cron-tasks）——主样本

| 项目 | 状态（2026-10-06 快照） |
|---|---|
| 标识 | `zokugun.cron-tasks`（GitHub: zokugun/vscode-cron） |
| 版本 / 最近更新 | 0.2.1 / 2025-04-24 |
| 安装量 | 约 70,158 |
| 许可 / 运行环境 | MIT；Universal + Web；Open VSX 同步发布 |

机制：在设置里声明表达式表，把 cron 表达式映射到 VS Code 命令：

```jsonc
"cronTasks.tasks": [
    {
        "at": "0 2 * * *",
        "run": "workbench.action.tasks.runTask",
        // args 传 tasks.json 的任务 label，即可调度任意工作区任务
        "args": "run-mutation-tests"
    }
]
```

调试走输出面板的 Cron Tasks 通道；`cronTasks.debug` 控制日志详细度。它不是自定义 Task Provider，不扩展 tasks.json 语法，而是按表触发命令。

### 3.2 Cron Jobs（mkloubert.vs-cron）——次样本

Marketplace 描述为周期性运行任务的扩展。本轮未做深入能力审查，仅确认该方向存在多个同类实现（另有 aaronfriel/vscode-cron 等社区项目），不逐一背书。

### 3.3 扩展方案的共同局限

所有 VS Code 内调度扩展共享同一结构性约束：**调度器活在编辑器进程里**。

- VS Code 未启动、升级重启、崩溃，定时点直接丢失；
- 机器睡眠 / 关机不执行，醒来后不补跑错过的调度（无 catch-up）；
- 夜跑场景恰恰是「人已下班、编辑器大概率关闭」的场景，可靠性要求最高、该方案最弱。

结论：扩展适合「编辑器常开时的定时辅助」（例如白天定时跑 lint），不适合作为夜跑闭环的触发层。本仓不基于扩展交付定时能力，但保留 §4.3 的用法说明供自行取舍。

## 4. 决策与理由

### 4.1 tasks.json 定位为手动触发

交付 `.vscode/tasks.json` 手动触发模板（§5）。这符合 VS Code 任务系统的强项：一键运行、输出进集成终端、可绑快捷键，适合「开发中随时触发某个环节」——例如提交前跑一次 `check-baseline`，或补完测试后手动触发 `create-issues --dry-run` 预览。

### 4.2 夜跑定时触发的推荐路径

无人值守定时不在 VS Code 里解决：

- **GitHub Actions**：`on.schedule.cron`，模板由 `templates/.github/workflows/`（integration 里程碑 nightly-mutation-ts/py 任务）提供；
- **本地调度器**：cron / systemd timer / Windows 任务计划，包装脚本与配置示例由 `templates/config/` 与 `templates/scripts/nightly-mutation-runner.sh`（integration 里程碑 local-cron-config 任务）提供。

以上路径在本轮时尚未由对应施工票交付，故不设 Markdown 链接；交付后以各自登记行为准。

### 4.3 如果坚持在 VS Code 内定时

安装 Cron Tasks 后在用户或工作区 settings.json 配置 §3.1 的表达式表即可调度本模板任务。再强调一次边界：VS Code 进程存活是硬前提，夜间关机即失效；若与 §4.2 的系统级调度并存，注意避免同一晚重复创建 issue（create-issues 的去重键为 open 状态的同名 issue，重复触发通常会被跳过而非重复创建，但仍不建议叠加调度）。

## 5. .vscode/tasks.json 模板说明

模板位于仓库根 `.vscode/tasks.json`（目标项目把 `scripts/` 与本模板一起复制后即可用，路径约定与架构文档一致）。文件为**严格 JSON**（不含 JSONC 注释）：一是验证契约要求 JSON 解析器可直接解析，二是纯 JSON 是 JSONC 的子集，VS Code 与扩展都能读取。

### 5.1 任务清单

| label | 语言 | 命令 | 主要输入 | 产物 |
|---|---|---|---|---|
| `run-mutation-tests` | TS | `npx stryker run` | `stryker.conf.json` | `reports/mutation/mutation.json` |
| `parse-results` | TS | `node scripts/parse-stryker-report.mjs --input reports/mutation/mutation.json --output unified-mutation-report.json` | Stryker JSON | `unified-mutation-report.json` |
| `check-baseline` | TS | `node scripts/mutation-baseline.mjs check --input reports/mutation/mutation.json --lang ts` | Stryker JSON + `.mutation-baseline.json` | stdout 比较结果；退出码 2 = 回归 |
| `create-issues` | 双语言共用 | `node scripts/create-mutation-issues.mjs --input unified-mutation-report.json` | 统一报告（可选 `--exemptions .equivalent-mutants.json`） | GitHub issues + `.mutation-queue/{file}.json` |
| `run-mutation-tests-py` | Py | `mutmut run` | 项目测试 | `.mutmut-cache`（mutmut 2.x） |
| `parse-results-py` | Py | `mutmut show all > .mutmut-show-all.txt && python scripts/parse_mutmut_report.py --input .mutmut-cache --show .mutmut-show-all.txt --output unified-mutation-report.json` | 缓存 + show 捕获 | `unified-mutation-report.json` |
| `check-baseline-py` | Py | `node scripts/mutation-baseline.mjs check --input mutmut-results-export.json --lang py` | mutmut results-export JSON（自备，见 §7.1） | stdout 比较结果；退出码 2 = 回归 |

所有任务显式设置 `options.cwd: ${workspaceFolder}`，命令里的脚本路径一律相对 workspace root，与 `scripts/` 实际布局一一对应（这也是验证契约 VAL-CONFIG-011 的核对口径）。

### 5.2 设计取舍

- **统一报告落在项目根**（`unified-mutation-report.json`），而不是 `reports/mutation/` 下：解析器写 `--output` 时不创建父目录；TS 路径的 `reports/mutation/` 由 Stryker 自己创建，Py 路径没有任何环节创建目录。统一报告与 `.mutation-queue/` 同属每轮覆盖的临时产物，放项目根让双语言路径完全一致。临时感文件建议加入 `.gitignore`。
- **`create-issues` 默认实跑**（调用 gh 创建 issue），与脚本默认行为一致；预览请手动加 `--dry-run`（见 §5.4）。
- **任务顺序**：`run → parse → check-baseline → create-issues`。baseline check 是可选门禁，回归时退出码 2，此时不应继续创建 issue。未做成 compound task 的原因：`dependsOn` 序列在子任务失败后不阻断后续任务，会把半途产物送进 issue 创建，故保持分步手动执行。

### 5.3 前置条件

- Node.js（工具链在 Node 24 验证）与 Python 3.8+（解析器约束）；
- `create-issues` 需要 `gh` CLI 已认证；
- Stryker 侧需要 JSON 报告：若你的 Stryker 版本默认未启用 json reporter，在 `stryker.conf.json` 的 `reporters` 中加入 `"json"`；
- mutmut 侧模板按 **2.x** 口径（`.mutmut-cache`）；mutmut 3.x 不再写该缓存文件，且 Windows 需在 WSL 内运行（见 [mutation-testing.md](../quality-gates/mutation-testing.md) §0）。

### 5.4 预览与豁免

- 预览（零 gh 调用，另写 `.mutation-queue/{file}.body.md` 正文预览）：

  ```bash
  node scripts/create-mutation-issues.mjs --input unified-mutation-report.json --dry-run
  ```

- 应用等价变异体豁免（文件必须已存在，缺失按用户错误退出码 1）：

  ```bash
  node scripts/create-mutation-issues.mjs --input unified-mutation-report.json --exemptions .equivalent-mutants.json
  ```

格式契约与工作流见 [equivalent-mutants.md](../formats/equivalent-mutants.md)；统一报告与队列文件契约见 [unified-mutation-report.md](../formats/unified-mutation-report.md) 与 [mutation-issue-template.md](../formats/mutation-issue-template.md)；基线契约见 [mutation-baseline.md](../formats/mutation-baseline.md)。

### 5.5 已知边界

- `parse-results-py` 是一条 `&&` 链（捕获 show 输出 + 解析）。`&&` 与 `>` 在 cmd、bash、PowerShell 7 下可用；Windows PowerShell 5.1 不支持 `&&`，请改用 PowerShell 7 或把两条命令分开各跑一次（先 `mutmut show all > .mutmut-show-all.txt`，再跑解析器）。
- baseline 命令在基线文件缺失时报错提示先 `init`（init 亦未做过时，需在终端手动执行 `node scripts/mutation-baseline.mjs init --input <报告> --lang <ts|py>`）。

## 6. 使用方式

1. Command Palette（Ctrl+Shift+P）→ **Tasks: Run Task** → 选择任务 label；
2. 常用任务可绑快捷键，`keybindings.json` 示例（该文件是 JSONC，允许注释；此处仅为文档示例，本仓不提交 keybindings）：

   ```jsonc
   {
       "key": "ctrl+shift+alt+m",
       "command": "workbench.action.tasks.runTask",
       "args": "check-baseline"
   }
   ```

3. 产物去向：Stryker 原生报告在 `reports/mutation/`；统一报告与 `.mutmut-show-all.txt` 在项目根（临时，可忽略或清理）；issue 队列在 `.mutation-queue/`；基线在项目根 `.mutation-baseline.json`（按契约应纳入版本库）。

## 7. 已知缺口与后续

1. **baseline 工具不读 mutmut 原生产物。** `mutation-baseline.mjs` 接受 Stryker JSON、mutmut results-export JSON 或统计对象，不接受 `.mutmut-cache`（SQLite），也不接受统一报告。Py 路径的 `check-baseline-py` 因此要求自备 `mutmut-results-export.json`（shape 见解析器 `--help` 的第 2 种输入形态）；当前工具链没有从缓存生成该文件的命令，需项目自行导出，或等待后续施工票给 baseline 工具补缓存桥接。本模板如实暴露该输入要求，不做伪装。
2. **扩展调度未实测。** §3 的 Cron Tasks 结论来自 Marketplace 与 GitHub 公开资料（版本、安装量、设置形态），本仓未安装验证其运行行为。
3. **tasks.json 不进自动化门禁。** M4 的端到端验证脚本（`scripts/test_nightly_loop.mjs`）以 CLI 直调方式验证闭环，不经过 VS Code 任务面；`.vscode/tasks.json` 只需通过 JSON 语法校验与路径核对（VAL-CONFIG-010/011）。

## 8. 参考链接（访问日期 2026-10-06）

- VS Code Tasks 官方文档（Run behavior / Control automatic task execution 两节为 §2 依据）：<https://code.visualstudio.com/docs/debugtest/tasks>
- tasks.json schema 附录：<https://code.visualstudio.com/docs/reference/tasks-appendix>
- Cron Tasks（Marketplace）：<https://marketplace.visualstudio.com/items?itemName=zokugun.cron-tasks>
- Cron Tasks（源码仓库）：<https://github.com/zokugun/vscode-cron>
- Cron Jobs（Marketplace）：<https://marketplace.visualstudio.com/items?itemName=mkloubert.vs-cron>
- StrykerJS 配置文档（reporters / 报告路径）：<https://stryker-mutator.io/docs/stryker-js/configuration/>
- mutmut 文档：<https://mutmut.readthedocs.io/en/latest/>
