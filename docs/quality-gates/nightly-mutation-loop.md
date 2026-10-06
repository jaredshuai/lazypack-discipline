# 夜跑变异测试闭环运营指引（Nightly Mutation Loop Operations Guide）

本文是工单 #38 的夜跑自动补强闭环运营指引，覆盖完整的自动化变异测试流程：从定时触发、报告解析、基线管理、到 GitHub issue 创建的端到端集成。

读者是需要在项目中部署自动化变异测试闭环的开发者或 DevOps 工程师。本文假设读者已阅读 [变异测试运营手册](mutation-testing.md)（#42）并了解门槛冻结与等价变异豁免的概念。

**状态与边界**：本文档覆盖 lazypack-discipline 提供的工具链和模板的使用方法。所有工具均为参考实现（reference implementation），可根据项目需求调整。

**配套工具**（位于 `scripts/`）：
- `parse-stryker-report.mjs` - Stryker JSON 报告解析器（#37）
- `parse_mutmut_report.py` - mutmut 报告解析器（#37）
- `mutation-baseline.mjs` - 基线管理工具（init/check/update）
- `create-mutation-issues.mjs` - GitHub issue 创建工具

**配套模板**（位于 `templates/`）：
- `.github/workflows/nightly-mutation-ts.yml` - TypeScript/JavaScript 项目 GitHub Actions 工作流
- `.github/workflows/nightly-mutation-py.yml` - Python 项目 GitHub Actions 工作流
- `scripts/nightly-mutation-runner.sh` - 本地 cron / systemd 运行器脚本（CLI 旗标配置）
- `config/crontab.example` - crontab 示例（含 PATH 补齐、py 错峰与 flock 防重叠说明）
- `config/mutation-testing.service` / `config/mutation-testing.timer` - Linux systemd **user 级**定时器配置（无需 root）

VS Code 任务模板不在 `templates/` 下：它是本仓根目录的 [`.vscode/tasks.json`](../../.vscode/tasks.json)（触发面调研见 `docs/research/vscode-scheduled-tasks.md`）。

---

## 1. 概述（Overview）

### 1.1 闭环流程

夜跑变异测试闭环的完整流程：

```
定时触发（cron/GitHub Actions/手动）
  ↓
运行变异测试（Stryker/mutmut）
  ↓
解析报告 → 统一格式
  ↓
基线检查（门槛冻结策略）
  ├─ 通过：更新基线（棘轮上升）
  └─ 失败：退出非零（阻止后续步骤）
       ↓
过滤等价变异体（.equivalent-mutants.json）
  ↓
创建 GitHub issues（按文件分组）
  ↓
开发者修复 → PR → 合并 → 下次夜跑验证
```

### 1.2 核心价值

- **自动化发现测试盲点**：每日运行，无需人工触发
- **增量改进**：通过棘轮基线策略，确保测试质量只升不降
- **可追溯**：每个存活变异体对应一个 GitHub issue，记录修复历史
- **Agent 友好**：生成的 `.mutation-queue/*.json` 文件可被 AI Agent 消费，自动生成测试用例

### 1.3 前置条件

在开始部署前，确保（工具链以下列版本验证）：

1. **运行时**：Node.js ≥ 24（验证环境 v24.19.0；解析器、基线与 issue 创建工具均为 Node 程序）；Python ≥ 3.8（验证环境 3.14.0；mutmut 解析器要求）
2. **变异测试工具**：StrykerJS（`reporters` 必须含 `"json"`）；mutmut 2.x（安装固定 `pip install "mutmut<3"`——3.x 不再写本链路读取的 `.mutmut-cache`）
3. **GitHub CLI**：gh ≥ 2.87（验证环境 2.87.3），已 `gh auth login` 或提供 `GH_TOKEN`
4. **已完成首次变异测试基线冻结**（见 [mutation-testing.md §1](mutation-testing.md#1-门槛冻结策略threshold-freezing-strategy)）
5. **已识别并豁免等价变异体**（见 [mutation-testing.md §2](mutation-testing.md#2-等价变异豁免流程equivalent-mutant-exemption-process)）
6. **项目已有可工作的测试套件**（`npm test` 或 `pytest` 能通过）
7. **GitHub 仓库已启用 Issues**

---

## 2. GitHub Actions 设置（GitHub Actions Setup）

### 2.1 TypeScript/JavaScript 项目

1. **复制模板到项目**：

```bash
cp templates/.github/workflows/nightly-mutation-ts.yml \
   your-project/.github/workflows/nightly-mutation-ts.yml
```

2. **调整配置**（模板开箱即用，通常只需按项目需求调整 cron 表达式）：

```yaml
# 定时触发（UTC 时间，每日凌晨 2 点）
schedule:
  - cron: '0 2 * * *'
```

同时确认目标项目的 `stryker.conf.json`：

- `reporters` 必须含 `"json"`（原生 JSON 报告默认落 `reports/mutation/mutation.json`，是解析器与基线工具的输入）；
- 建议不要配置 `thresholds.break`：配置后分数低于阈值时 Stryker 以非零码退出，后续 issue 创建不会执行；夜跑闭环的门槛由基线 check 承担（回归退出码 2 拦截）。

工作流的基线步骤已内置：首轮工作区没有 `.mutation-baseline.json` 时自动 `init`，之后每轮 `check`（回归时退出码 2，中止后续 issue 创建）。

3. **配置 GitHub Token**：

工作流使用 `GITHUB_TOKEN` 创建 issues，无需额外配置。如需自定义 Token（例如触发其他工作流），在仓库 Settings → Secrets 添加 `MUTATION_BOT_TOKEN`，然后修改工作流：

```yaml
env:
  GH_TOKEN: ${{ secrets.MUTATION_BOT_TOKEN }}
```

4. **首次运行准备**：

模板首轮会自动 `init` 基线（工作区没有 `.mutation-baseline.json` 时），无需手工步骤；跑完后把生成的基线文件提交进版本库——否则每轮都会重新 init，棘轮检查形同虚设：

```bash
git add .mutation-baseline.json
git commit -m "chore: initialize mutation testing baseline"
git push
```

也可以在启用 workflow 前在本地先手动冻结基线：

```bash
# 运行变异测试
npx stryker run

# 初始化基线（目标位置已有基线文件时 init 拒绝执行，不会静默覆盖）
node scripts/mutation-baseline.mjs init \
  --input reports/mutation/mutation.json \
  --lang ts

# 提交基线文件
git add .mutation-baseline.json
git commit -m "chore: initialize mutation testing baseline"
git push
```

### 2.2 Python 项目

1. **复制模板**：

```bash
cp templates/.github/workflows/nightly-mutation-py.yml \
   your-project/.github/workflows/nightly-mutation-py.yml
```

2. **调整配置**：

```yaml
# Python 版本（解析器 parse_mutmut_report.py 要求 3.8+）
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'

# 安装依赖并固定 mutmut 2.x（3.x 不再写模板链路读取的 .mutmut-cache）
- name: Install dependencies
  run: |
    pip install -r requirements.txt
    pip install "mutmut<3"

# 运行变异测试。mutmut 在存在存活/可疑变异体时以非零码退出，这正是
# 夜跑闭环要处理的输入，模板用 continue-on-error 容忍该退出码；致命错误
# 由下一步导出裁决（缓存缺失或导出失败时 workflow 直接失败，不会静默放过）
- name: Run mutation tests (mutmut)
  continue-on-error: true
  run: mutmut run
```

3. **导出基线输入并解析统一报告**（在 workflow 内联组装，仓库不提供独立的导出脚本）：

mutmut 2.x 没有一键导出 JSON 的子命令（`results` 是人读文本、`junitxml` 是 XML），而基线工具不读 `.mutmut-cache`。模板用官方 `mutmut result-ids <status>` 子命令按六类状态取变异体 ID，组装出基线工具约定的 `mutmut-results-export.json`；diff 片段则用 `mutmut show all` 捕获后交给解析器：

```bash
# 六类状态 → mutmut-results-export.json（基线步骤输入；完整脚本见模板步骤 6）
python - <<'PY'
import json
import subprocess
import sys

statuses = ("killed", "timeout", "survived", "suspicious", "skipped", "untested")
export = {}
for status in statuses:
    proc = subprocess.run(["mutmut", "result-ids", status], capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit(f"mutmut result-ids {status} failed: {proc.stderr.strip()}")
    export[status] = proc.stdout.split()
with open("mutmut-results-export.json", "w", encoding="utf-8") as f:
    json.dump(export, f, indent=2)
    f.write("\n")
PY

# 捕获 diff 并把 .mutmut-cache 解析为统一报告（issue 创建输入）
mutmut show all > .mutmut-show-all.txt
python scripts/parse_mutmut_report.py \
  --input .mutmut-cache \
  --show .mutmut-show-all.txt \
  --output unified-mutation-report.json
```

两个文件用途不同，不要混用：`mutmut-results-export.json` 只作基线步骤输入（按类别计数，Timeout 计入检出）；`unified-mutation-report.json` 是 issue 创建的输入。

4. **基线初始化**（同 TypeScript，使用 `--lang py`）：

```bash
# 前置：步骤 3 已产出 mutmut-results-export.json
node scripts/mutation-baseline.mjs init \
  --input mutmut-results-export.json \
  --lang py

git add .mutation-baseline.json
git commit -m "chore: initialize mutation testing baseline"
```

### 2.3 工作流触发与监控

- **定时触发**：按 `cron` 表达式自动运行（UTC 时间）
- **手动触发**：GitHub Actions 页面，选择工作流 → "Run workflow"
- **失败通知**：基线检查失败时，工作流退出非零，GitHub 自动发送邮件通知（仓库 Settings → Notifications 配置）

查看运行历史：仓库 → Actions → 选择工作流 → 查看运行记录和日志

---

## 3. 本地 cron 设置（Local Cron Setup）

适用于需要在本地机器或内网服务器定时运行变异测试的场景。

### 3.1 使用 Shell 脚本（跨平台）

1. **复制运行器与工具脚本**：

```bash
cp templates/scripts/nightly-mutation-runner.sh your-project/scripts/
chmod +x your-project/scripts/nightly-mutation-runner.sh

# 工具脚本一并复制到目标项目 scripts/（runner 逐步调用它们）：
# TypeScript：parse-stryker-report.mjs、mutation-baseline.mjs、create-mutation-issues.mjs
# Python：parse_mutmut_report.py、mutation-baseline.mjs、create-mutation-issues.mjs
cp scripts/parse-stryker-report.mjs scripts/mutation-baseline.mjs \
   scripts/create-mutation-issues.mjs your-project/scripts/
```

2. **用 CLI 旗标配置**（脚本没有配置文件，无需编辑脚本本身）：

```bash
# 查看全部选项
your-project/scripts/nightly-mutation-runner.sh --help

# TypeScript 示例（--project-dir 缺省为脚本所在目录的上一级）
your-project/scripts/nightly-mutation-runner.sh \
  --lang ts \
  --project-dir /path/to/your/project \
  --log-dir /tmp/nightly-mutation \
  --log-keep 14
```

| 选项 | 说明 |
|---|---|
| `--lang ts\|py` | 变异测试工具链：ts=Stryker，py=mutmut（默认 ts） |
| `--project-dir DIR` | 目标项目根（默认：脚本所在目录的上一级） |
| `--log-dir DIR` | 日志目录（默认环境变量 `MUTATION_LOG_DIR`，再默认 `/tmp/nightly-mutation`） |
| `--log-keep DAYS` | 日志保留天数，到期自动清理（默认 14） |
| `--dry-run` | issue 创建零 gh 调用，只写 `.mutation-queue/` 队列文件与 body 预览 |
| `-h, --help` | 显示帮助并退出 |

3. **测试运行**：

```bash
cd your-project
./scripts/nightly-mutation-runner.sh --dry-run   # 先零 gh 调用验证链路
./scripts/nightly-mutation-runner.sh             # 再实跑
```

成功时退出码为 0；基线检查失败时退出码 2（门槛失败），其余失败沿用失败工具的退出码。

4. **配置 crontab**（Linux/macOS）：

```bash
# 编辑 crontab
crontab -e

# 添加定时任务（每日凌晨 2 点；控制台输出丢弃以免 cron 邮件刷屏，完整日志由脚本写入 --log-dir）
0 2 * * * /path/to/your/project/scripts/nightly-mutation-runner.sh --lang ts --project-dir /path/to/your/project >/dev/null 2>&1
```

注意 cron 的三个常见坑：PATH 很短（node/npx/mutmut/gh 装在 nvm、homebrew、`~/.local` 等位置时必须在 crontab 顶部补 `PATH=`）；cron 不加载 `.bashrc`/`.profile`，环境靠显式声明；时间按本机时区解释（GitHub Actions 的 cron 按 UTC）。完整示例（含 py 03:30 错峰与 flock 防重叠）见 `templates/config/crontab.example`。

5. **配置 Windows Task Scheduler**：

- 打开任务计划程序
- 创建基本任务 → 名称："Nightly Mutation Testing"
- 触发器：每天凌晨 2:00
- 操作：启动程序 → `bash.exe`（WSL）或 `wsl.exe`
- 参数：`-c "/mnt/c/path/to/scripts/nightly-mutation-runner.sh --lang ts"`

### 3.2 使用 systemd timer（Linux 服务器，user 级）

模板为 **user 级**单元（无需 root）：由 `mutation-testing.timer` 每天定时触发同名 `mutation-testing.service`，实际执行包装脚本。

1. **复制配置文件**（到 user 单元目录）：

```bash
mkdir -p ~/.config/systemd/user
cp templates/config/mutation-testing.service ~/.config/systemd/user/
cp templates/config/mutation-testing.timer ~/.config/systemd/user/
```

2. **编辑 service 文件**（把 ExecStart 里的 `YOUR_USER_HERE` / `YOUR_REPO_HERE` 占位换成实际值）：

```ini
[Service]
Type=oneshot
ExecStart=/usr/bin/env bash /home/your-username/projects/your-project/scripts/nightly-mutation-runner.sh --lang ts --project-dir /home/your-username/projects/your-project --log-dir %h/.local/state/nightly-mutation
```

- Python 项目把 `--lang` 改为 `py`；同机同仓两种语言都要跑时，复制一份 service/timer 改名错峰（如 `mutation-testing-py`，03:30）；
- issue 创建需要 gh 凭据：默认用 `gh auth login` 的持久凭据；无人值守环境可取消注释 `Environment=GH_TOKEN=...`；
- 变异测试常以小时计，模板默认 `TimeoutStartSec=4h`，按项目规模调整。

3. **调整 timer 运行时间**（可选，默认每天 02:00 本地时间）：

```ini
[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true
RandomizedDelaySec=15m
```

`Persistent=true` 会补跑因关机/休眠错过的触发；`RandomizedDelaySec` 在触发时刻加 0~15 分钟随机延迟，不需要可删除。

4. **启用并启动**（user 级操作都带 `--user` 旗标，不要加 sudo）：

```bash
systemctl --user daemon-reload
systemctl --user enable --now mutation-testing.timer
systemctl --user list-timers                        # 确认调度生效
systemctl --user start mutation-testing.service     # 立即手动跑一次
```

5. **查看日志**：

```bash
journalctl --user -u mutation-testing.service -f
```

包装脚本自身也写带时间戳的文件日志（`--log-dir`），journal 里看的是控制台输出。

6. **笔记本等常关机的机器**：user 级 timer 只在用户会话内触发，建议开启 linger 让未登录时也能定时触发：

```bash
loginctl enable-linger $USER
```

---

## 4. VS Code Tasks 设置（VS Code Tasks Setup）

VS Code 任务提供手动触发的便捷入口，适用于本地开发调试。

### 4.1 安装任务配置

任务模板即本仓根目录的 `.vscode/tasks.json`（VS Code 触发面调研与结论见 `docs/research/vscode-scheduled-tasks.md`）：

```bash
cp /path/to/lazypack-discipline/.vscode/tasks.json your-project/.vscode/
```

### 4.2 可用任务

与 `.vscode/tasks.json` 一致，共 7 个任务：

**TypeScript 路径**：
- `run-mutation-tests` - 运行 Stryker（json 报告写 `reports/mutation/mutation.json`）
- `parse-results` - 把 Stryker JSON 报告转为统一报告 `unified-mutation-report.json`
- `check-baseline` - 对照 `.mutation-baseline.json` 做只涨不跌检查（退出码 2 = 回归）
- `create-issues` - 从统一报告按文件分组创建 GitHub issues（需要 gh 认证；预览请临时加 `--dry-run`）

**Python 路径**：
- `run-mutation-tests-py` - 运行 mutmut（2.x；Windows 上请在 WSL 运行）
- `parse-results-py` - 捕获 `mutmut show all` 输出并把 `.mutmut-cache` 转为统一报告
- `check-baseline-py` - 基线检查（输入是项目根的 `mutmut-results-export.json`）

### 4.3 使用方法

1. **打开命令面板**：`Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）
2. **选择任务**：输入 "Tasks: Run Task" → 选择任务
3. **查看输出**：终端面板显示执行结果

### 4.4 已知限制

**VS Code 无定时触发**：VS Code 原生不支持 scheduled tasks（`runOptions.runOn` 只有 `default` 与 `folderOpen` 两个取值），任务均为手动触发；无人值守的定时执行走 §2（GitHub Actions）或 §3（cron/systemd）。扩展市场虽有调度扩展，但寄生在 VS Code 进程内（要求 VS Code 常开、机器不睡眠），不适合夜跑场景。

**Python 基线检查**：`check-baseline-py` 任务的输入是项目根的 `mutmut-results-export.json`（基线工具不读 `.mutmut-cache`，也不读统一报告）。文件不存在时，先用 §2.2 步骤 3 的 `mutmut result-ids` 组装脚本生成，或直接跑一轮 Python workflow。

---

## 5. 基线管理（Baseline Management）

### 5.1 基线文件格式

`.mutation-baseline.json` 示例：

```json
{
  "version": "1.0",
  "updated": "2024-03-15T02:30:45Z",
  "baseline": {
    "score": 66.23,
    "killed": 51,
    "survived": 15,
    "total": 77
  }
}
```

### 5.2 基线操作

**初始化**（首次运行）：

```bash
# TypeScript
node scripts/mutation-baseline.mjs init \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json

# Python（输入为 §2.2 步骤 3 组装的 mutmut-results-export.json）
node scripts/mutation-baseline.mjs init \
  --input mutmut-results-export.json \
  --lang py \
  --output .mutation-baseline.json
```

**检查**（门禁）：

```bash
node scripts/mutation-baseline.mjs check \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json
```

退出码：
- `0` - 通过（分数 >= 基线 或 持平）
- `2` - 回退（分数 < 基线）

**更新**（棘轮上升）：

```bash
node scripts/mutation-baseline.mjs update \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json
```

仅当新分数 > 基线时更新；否则保持不变。

### 5.3 棘轮策略执行

夜跑流程中的基线管理逻辑：

```bash
# 1. 运行变异测试
npx stryker run

# 2. 检查基线（门禁）
node scripts/mutation-baseline.mjs check \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json

if [ $? -eq 2 ]; then
  echo "❌ Baseline regression detected. Aborting."
  exit 2
fi

# 3. 更新基线（棘轮）
node scripts/mutation-baseline.mjs update \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json

# 4. 提交更新后的基线（在 CI 中）
git add .mutation-baseline.json
git commit -m "chore: update mutation baseline to $(jq -r .baseline.score .mutation-baseline.json)%"
git push
```

---

## 6. 等价变异体豁免流程（Equivalent Mutant Exemption Flow）

### 6.1 识别等价变异体

夜跑生成的 `.mutation-queue/*.json` 文件包含所有存活变异体。开发者审查后，将等价变异体添加到豁免文件。

### 6.2 创建豁免文件

在项目根目录创建 `.equivalent-mutants.json`（顶层只有 `version` 与 `exemptions` 两个字段；每个 exemption 条目恰好八个必填字段）：

```json
{
  "version": "1.0",
  "exemptions": [
    {
      "id": "equiv-001",
      "file": "src/calculator.ts",
      "line": 42,
      "mutationType": "ConditionalExpression",
      "reason": "该条件比较 x === x 恒为 true（identity），变异 x !== x 在正常流程不可达；若左操作数改为可变输入，本条目须重审。",
      "exemptedBy": "alice",
      "exemptedAt": "2026-10-07T10:20:00Z",
      "reviewRequired": false
    }
  ]
}
```

八个字段的含义：

| 字段 | 说明 |
|---|---|
| `id` | 豁免记录号（`equiv-` 前缀 + 至少三位数字；文件内唯一，删除后不复用） |
| `file` | 变异体所在源文件（项目根相对 POSIX 路径） |
| `line` | 变异体所在行（1-based） |
| `mutationType` | 归一化变异类型（与统一报告同枚举） |
| `reason` | 可检验的等价论证（非空） |
| `exemptedBy` | 当前判定的责任人 |
| `exemptedAt` | 判定写盘时刻（ISO-8601 UTC，`YYYY-MM-DDTHH:MM:SSZ`） |
| `reviewRequired` | 待复核标记（true 时不影响过滤行为） |

`exemptions` 允许空数组（新项目或豁免已清理时的合法状态）；条目按 `file` → `line` → `mutationType` → `id` 排序；豁免文件由人经代码评审写入，工具不得自动生成或改写。

详细格式契约见 [等价变异体文件格式](../formats/equivalent-mutants.md)；识别 → 审查 → 记录的人工流程见 [mutation-testing.md §2](mutation-testing.md#2-等价变异豁免流程equivalent-mutant-exemption-process)。

### 6.3 应用豁免过滤

`create-mutation-issues.mjs` 经 `--exemptions` 旗标读取豁免文件（缺省不过滤；传入的文件缺失、JSON 非法或 schema 违规时以退出码 1 失败），按 `file + line + mutationType` 三元组精确匹配并剔除命中的变异体：

```bash
node scripts/create-mutation-issues.mjs \
  --input unified-mutation-report.json \
  --exemptions .equivalent-mutants.json \
  --dry-run
```

- 队列文件恒写到 `.mutation-queue/{file}.json`（dry-run 另有 `.mutation-queue/{file}.body.md` 预览），与 `--output` 无关；
- `--output <path>` 写的是本次运行的**清单 JSON**（issue 列表 + 元数据 + summary，含 `exempted` 计数与 `staleExemptionIds` 陈旧豁免提示），例如 `--output manifest.json`，不是队列目录；
- 被豁免的变异体不会出现在 `.mutation-queue/*.json` 中，也不会创建 GitHub issue。

### 6.4 豁免文件维护

- **版本控制**：`.equivalent-mutants.json` 应提交到版本库
- **定期审查**：代码重构后，豁免可能失效（文件/行号变化），需重新审查；`reviewRequired: true` 的条目进入复核清单
- **文档化**：`reason` 字段须写可检验的等价论证，便于后续维护

---

## 7. Agent 集成指引（Agent Integration Guide）

### 7.1 为什么 Agent 友好

夜跑流程生成的 `.mutation-queue/*.json` 文件是结构化的、机器可读的任务队列，AI Agent 可以：

1. **读取任务队列**：解析 JSON，获取待修复的变异体列表
2. **分析代码上下文**：根据 `file` 和 `line` 定位源码
3. **生成测试用例**：针对变异体编写缺失的测试
4. **提交 PR**：自动创建 Pull Request，关联对应 issue

### 7.2 队列文件格式

`.mutation-queue/src-calculator.ts.json` 示例（实跑模式；dry-run 省略 `issueNumber`）：

```json
{
  "version": "1.0",
  "file": "src/calculator.ts",
  "tool": "stryker",
  "timestamp": "2026-10-07T18:30:00Z",
  "issueNumber": 456,
  "mutants": [
    {
      "id": "stryker-14",
      "file": "src/calculator.ts",
      "line": 26,
      "column": 12,
      "mutationType": "ConditionalExpression",
      "original": "values.length === 0",
      "mutated": "false",
      "status": "Survived"
    }
  ]
}
```

`mutants` 是统一报告中该文件存活变异体的八字段副本（`id` / `file` / `line` / `column` / `mutationType` / `original` / `mutated` / `status`），保持报告顺序；实跑时被既有 open issue 去重跳过的分组，其队列文件携带既有 issue 编号。

### 7.3 Agent 工作流示例

**输入**：`.mutation-queue/*.json`

**处理流程**：

1. **读取队列**：

```python
import json
from pathlib import Path

queue_files = Path(".mutation-queue").glob("*.json")
for queue_file in queue_files:
    with open(queue_file) as f:
        data = json.load(f)
    
    file_path = data["file"]
    issue_number = data["issueNumber"]  # dry-run 模式无此字段
    mutants = data["mutants"]
```

2. **分析每个变异体**：

```python
for mutant in mutants:
    # 定位源码
    source_file = mutant["file"]
    line_number = mutant["line"]
    
    # 读取上下文（例如：±10 行）
    context = read_file_context(source_file, line_number, context_lines=10)
    
    # 分析变异类型
    mutation_type = mutant["mutationType"]
    original = mutant["original"]
    mutated = mutant["mutated"]
```

3. **生成测试用例**：

```python
# 使用 LLM 或规则引擎生成测试
test_code = generate_test_for_mutant(
    context=context,
    mutation_type=mutation_type,
    original=original,
    mutated=mutated
)

# 写入测试文件
test_file = infer_test_file_path(source_file)
append_test_to_file(test_file, test_code)
```

4. **验证修复**：

```bash
# 运行测试
npm test  # 或 pytest

# 运行变异测试（验证该变异体被杀死）
npx stryker run --mutate src/calculator.ts:26
```

5. **提交 PR**：

```bash
git checkout -b fix/mutation-issue-456
git add tests/calculator.spec.ts
git commit -m "test: kill mutant in calculator.ts:26

Closes #456"
git push origin fix/mutation-issue-456

# 使用 gh CLI 创建 PR
gh pr create \
  --title "Fix mutation survivors in calculator.ts" \
  --body "Closes #456" \
  --label "mutation-testing"
```

### 7.4 Agent 技巧

- **批量处理**：按文件分组处理变异体，减少上下文切换
- **优先级排序**：先处理高价值模块（核心逻辑）的变异体
- **增量验证**：每个变异体修复后立即验证，避免累积错误
- **模式识别**：相同 `mutationType` 的变异体可能需要类似的测试策略

---

## 8. 故障排查（Troubleshooting）

### 8.1 变异测试运行失败

**症状**：`npx stryker run` 或 `mutmut run` 退出非零

**排查步骤**：

1. **测试套件本身是否通过**：

```bash
npm test  # 或 pytest
```

如果测试失败，先修复测试。

2. **变异测试配置是否正确**：

检查 `stryker.conf.js` 或 `setup.cfg [mutmut]` 配置文件。

3. **依赖是否完整**：

```bash
npm install  # 或 pip install -e .[dev]
```

4. **查看详细日志**：

```bash
npx stryker run --logLevel debug
mutmut run --verbose
```

### 8.2 基线检查误报回退

**症状**：基线检查报告回退，但实际分数未降低

**先核对再下结论**：基线比较自带 1e-9 浮点容差，66.23 → 66.22 这类变化是真实回归，不是浮点噪声。常见根因：mutate 范围漂移（`total` 相对上次大幅变化）、工具版本升级、测试被删除或跳过。

**解决方案**：

1. **核对基线中冻结的分数与本轮实际分数**：

```bash
# 基线文件中冻结的分数
jq '.baseline.score' .mutation-baseline.json
```

   check 判定回归时，stderr 会写明本轮分数、基线分数与差值。

2. **确认是否为真实回归**：检查本轮 `total` 与 mutate 范围、测试数量是否变化。范围扩大等口径变化导致分数下降时不走 `update`，按第 3 步人工确认后重新 `init` 并留痕。

3. **重新初始化基线**（最后手段，需人工确认；工具没有 `--force`，目标位置已有基线时 `init` 会拒绝执行，先删后建并以一次显式提交说明原因）：

```bash
rm .mutation-baseline.json
node scripts/mutation-baseline.mjs init \
  --input reports/mutation/mutation.json \
  --lang ts
git add .mutation-baseline.json
git commit -m "chore: reset mutation baseline"
```

### 8.3 GitHub issue 创建失败

**症状**：`create-mutation-issues.mjs` 报错或未创建 issue

**排查步骤**：

1. **检查 GitHub Token**：

```bash
# 测试 gh CLI
gh auth status

# 测试创建 issue
gh issue create --title "Test" --body "Test" --label "test"
```

2. **检查仓库 Issues 是否启用**：

GitHub 仓库 Settings → Features → 确保 "Issues" 已勾选

3. **检查 API 速率限制**：

```bash
gh api rate_limit
```

如果超过速率限制，等待重置或使用 Personal Access Token。

4. **使用 dry-run 模式调试**：

```bash
node scripts/create-mutation-issues.mjs \
  --input unified-mutation-report.json \
  --dry-run
```

查看生成的 `.mutation-queue/*.json` 队列文件与 `.mutation-queue/*.body.md` issue body 预览（零 gh 调用）。

### 8.4 mutmut 在 Windows 上无法运行

**症状**：`mutmut run` 报错 "fork() not supported on Windows"

**原因**：mutmut 依赖 `multiprocessing.fork`，Windows 不支持

**解决方案**：

1. **使用 WSL**：

```bash
wsl
cd /mnt/c/path/to/project
mutmut run
```

2. **使用 Docker**：

```dockerfile
FROM python:3.12
WORKDIR /app
COPY . .
RUN pip install mutmut pytest
CMD ["mutmut", "run"]
```

```bash
docker build -t mutation-test .
docker run -v $(pwd):/app mutation-test
```

### 8.5 变异测试速度慢

**症状**：变异测试运行时间过长（数小时）

**优化策略**：

1. **启用增量模式**（Stryker）：

```javascript
// stryker.conf.js
module.exports = {
  incremental: true,
  incrementalFile: '.stryker-tmp/incremental.json'
};
```

仅重测变更文件的变异体。

2. **调整并发数**：

```javascript
// stryker.conf.js
module.exports = {
  concurrency: 4  // 根据 CPU 核心数调整
};
```

```bash
# mutmut
mutmut run --threads 4
```

3. **缩小变异范围**：

```javascript
// stryker.conf.js
module.exports = {
  mutate: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/generated/**']
};
```

```ini
# setup.cfg
[mutmut]
paths_to_mutate = src/
```

排除测试文件、生成代码、第三方代码。

4. **使用更快的测试运行器**：

- Stryker：vitest 比 jest 快
- mutmut：pytest with `-n auto`（pytest-xdist）

### 8.6 等价变异体过多

**症状**：大量存活变异体实际上是等价变异体，无法有效杀死

**策略**：

1. **批量识别常见模式**：

例如：`x === x` → `x !== x` 通常是等价变异体（在正常流程中）

2. **使用正则匹配批量豁免**（需自行扩展工具）：

```python
# 示例：批量豁免 x === x 模式
import re
for mutant in mutants:
    if re.match(r'(\w+) === \1', mutant['original']):
        add_to_exemptions(mutant, reason='identity')
```

3. **重构消除等价变异**：

例如：将 `if (x > 0) { return x; } else { return 0; }` 重构为 `return Math.max(x, 0)`，减少等价变异体。

### 8.7 CI 超时

**症状**：GitHub Actions 工作流超时（默认 6 小时，可能更短）

**解决方案**：

1. **设置超时时间**：

```yaml
jobs:
  mutation-testing:
    timeout-minutes: 120  # 2 小时
```

2. **分片运行**（Stryker）：

```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npx stryker run --shard ${{ matrix.shard }}/4
```

3. **仅在特定分支运行**：

```yaml
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:
  push:
    branches:
      - main  # 仅 main 分支
```

### 8.8 Python 基线工具报错 "unexpected format"

**症状**：`mutation-baseline.mjs init/check --lang py` 报错

**原因**：基线工具的 py 输入必须是 mutmut results-export JSON（六类状态的字符串数组）。它不读 `.mutmut-cache`，也不读统一报告——两个文件的分工见 §2.2 步骤 3。

**检查步骤**：

1. **验证输入文件格式**：

```json
{
  "killed": ["1", "2", "3"],
  "survived": ["4", "5"],
  "timeout": [],
  "suspicious": [],
  "skipped": [],
  "untested": []
}
```

   六个类别键缺一不可（空类别为空数组）；数组元素是 `mutmut result-ids` 输出的字符串 ID。

2. **用 §2.2 步骤 3 的组装命令重新生成**该文件（`mutmut result-ids <status>` 六类各取一次，拼成 JSON）。

3. **不要用统一报告喂基线工具**：`unified-mutation-report.json` 只含存活变异体，是 issue 创建的输入；基线分数来自 results-export 的类别计数（score = (killed + timeout) / total，Timeout 计入检出）。

### 8.9 cron/systemd 环境找不到 node、mutmut 或 gh

**症状**：手动运行一切正常；cron 或 systemd timer 触发时报 "command not found"，或 gh 认证失败

**原因**：cron 的 PATH 通常只有 `/usr/bin:/bin`，且不加载 `.bashrc`/`.profile`；systemd user 服务的环境同样精简

**解决方案**：

1. **核对实际安装位置**：

```bash
which node npx mutmut gh
```

2. **crontab 顶部显式补 PATH**（完整示例见 `templates/config/crontab.example`）：

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/home/YOUR_USER_HERE/.local/bin
```

3. **systemd 核对环境**：`systemctl --user show-environment`；需要显式 gh 凭据时在 service 中取消注释 `Environment=GH_TOKEN=...`

4. **挂定时前先手动跑通**：包装脚本支持 `--dry-run`（issue 创建零 gh 调用），先验证链路再补凭据实跑

5. **注意时间口径**：本地 cron/systemd 按本机时区解释，GitHub Actions 的 cron 按 UTC，两边不同

### 8.10 mutmut 3.x 不再写 .mutmut-cache

**症状**：解析器报找不到 `.mutmut-cache`，或升级 mutmut 后解析失败

**原因**：mutmut 3.x 改用 `mutants/` 缓存目录；本链路的解析器、runner 脚本与 workflow 模板都按 2.x 口径读取 `.mutmut-cache`

**解决方案**：

1. **核对版本**：

```bash
mutmut --version
```

2. **固定安装 2.x**：

```bash
pip install "mutmut<3"
```

3. **确认结果命令口径**：mutmut 2.x 的 `results` 不接旗标，diff 用 `mutmut show all`（或 `mutmut show <file>`）捕获，见 §2.2 步骤 3

---

## 9. 交叉引用（Cross References）

- [变异测试运营手册](mutation-testing.md) (#42) - 门槛冻结策略、等价变异豁免、胶水代码边界
- [工具用法文档](../../README.md) - 所有工具的详细 CLI 参数
- [Stryker 报告解析器](../../scripts/parse-stryker-report.mjs) (#37) - 源码与 CLI 说明
- [mutmut 报告解析器](../../scripts/parse_mutmut_report.py) (#37) - 源码与 CLI 说明
- [等价变异体文件格式](../formats/equivalent-mutants.md) - 豁免文件详细规范
- [统一变异报告格式](../formats/unified-mutation-report.md) - 解析器输出格式
- [基线文件格式](../formats/mutation-baseline.md) - 基线文件详细规范
- [GitHub issue 模板](../formats/mutation-issue-template.md) - issue 与队列文件模板

---

## 附录 A：完整示例命令序列

### TypeScript 项目完整流程

```bash
# 1. 运行变异测试
npx stryker run

# 2. 解析报告（统一报告落项目根）
node scripts/parse-stryker-report.mjs \
  --input reports/mutation/mutation.json \
  --output unified-mutation-report.json

# 3. 基线检查
node scripts/mutation-baseline.mjs check \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json

# 4. 更新基线（如果改进）
node scripts/mutation-baseline.mjs update \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json

# 5. 创建 GitHub issues（dry-run 预览）
node scripts/create-mutation-issues.mjs \
  --input unified-mutation-report.json \
  --exemptions .equivalent-mutants.json \
  --dry-run

# 6. 实际创建 issues（去掉 --dry-run）
node scripts/create-mutation-issues.mjs \
  --input unified-mutation-report.json \
  --exemptions .equivalent-mutants.json

# 7. 提交更新
git add .mutation-baseline.json .mutation-queue/
git commit -m "chore: update mutation baseline and queue"
git push
```

### Python 项目完整流程

```bash
# 1. 运行变异测试
mutmut run

# 2. 捕获 mutmut show 输出（解析器需要的 diff 片段）
mutmut show all > .mutmut-show-all.txt

# 3. 解析报告（统一报告落项目根）
python scripts/parse_mutmut_report.py \
  --input .mutmut-cache \
  --show .mutmut-show-all.txt \
  --output unified-mutation-report.json

# 4. 组装基线输入 mutmut-results-export.json
# 用 mutmut result-ids 按六类状态取 ID（完整脚本见 §2.2 步骤 3 / workflow 模板步骤 6）

# 5. 基线检查
node scripts/mutation-baseline.mjs check \
  --input mutmut-results-export.json \
  --lang py \
  --output .mutation-baseline.json

# 6-7. 同 TypeScript（issue 创建与提交）
```

---

**文档版本**：1.1  
**最后更新**：2026-10-07  
**维护者**：lazypack-discipline 团队
