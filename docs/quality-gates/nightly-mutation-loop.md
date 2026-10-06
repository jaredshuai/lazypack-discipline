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
- `scripts/nightly-mutation-runner.sh` - 本地 cron 运行器脚本
- `systemd/nightly-mutation.service` / `.timer` - Linux systemd 定时器配置
- `.vscode/tasks.json` - VS Code 任务配置

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

在开始部署前，确保：

1. **已完成首次变异测试基线冻结**（见 [mutation-testing.md §1](mutation-testing.md#1-门槛冻结策略threshold-freezing-strategy)）
2. **已识别并豁免等价变异体**（见 [mutation-testing.md §2](mutation-testing.md#2-等价变异豁免equivalent-mutant-exemption)）
3. **项目已有可工作的测试套件**（`npm test` 或 `pytest` 能通过）
4. **GitHub 仓库已启用 Issues**

---

## 2. GitHub Actions 设置（GitHub Actions Setup）

### 2.1 TypeScript/JavaScript 项目

1. **复制模板到项目**：

```bash
cp templates/.github/workflows/nightly-mutation-ts.yml \
   your-project/.github/workflows/nightly-mutation.yml
```

2. **调整配置**（根据项目需求修改以下字段）：

```yaml
# 定时触发（UTC 时间，每日凌晨 2 点）
schedule:
  - cron: '0 2 * * *'

# 变异测试命令（根据项目调整）
- name: Run mutation testing
  run: npx stryker run

# 基线文件路径（首次运行需先 init）
- name: Check baseline
  run: |
    node scripts/mutation-baseline.mjs check \
      --input reports/mutation/mutation.json \
      --lang ts \
      --output .mutation-baseline.json
```

3. **配置 GitHub Token**：

工作流使用 `GITHUB_TOKEN` 创建 issues，无需额外配置。如需自定义 Token（例如触发其他工作流），在仓库 Settings → Secrets 添加 `MUTATION_BOT_TOKEN`，然后修改工作流：

```yaml
env:
  GH_TOKEN: ${{ secrets.MUTATION_BOT_TOKEN }}
```

4. **首次运行准备**：

首次启用前，必须先在本地生成基线文件并提交：

```bash
# 运行变异测试
npx stryker run

# 初始化基线
node scripts/mutation-baseline.mjs init \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json

# 提交基线文件
git add .mutation-baseline.json
git commit -m "chore: initialize mutation testing baseline"
git push
```

### 2.2 Python 项目

1. **复制模板**：

```bash
cp templates/.github/workflows/nightly-mutation-py.yml \
   your-project/.github/workflows/nightly-mutation.yml
```

2. **调整配置**：

```yaml
# Python 版本（根据项目需求）
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'

# 变异测试命令
- name: Run mutation testing
  run: mutmut run

# 导出结果（mutmut 2.x 使用 result-ids + JSON 组装）
- name: Export results
  run: |
    mkdir -p reports/mutation
    python scripts/export_mutmut_results.py \
      --output reports/mutation/mutmut-results.json
```

**注意**：mutmut 2.x 不支持 `results-export` 命令。模板使用 `mutmut result-ids` 系列命令组装 JSON（见 `parse_mutmut_report.py` 文档）。

3. **基线初始化**（同 TypeScript，使用 `--lang py`）：

```bash
mutmut run
python scripts/parse_mutmut_report.py \
  --input .mutmut-cache \
  --show .mutmut-show-all.txt \
  --output reports/mutation/unified-report.json
node scripts/mutation-baseline.mjs init \
  --input reports/mutation/mutmut-results.json \
  --lang py \
  --output .mutation-baseline.json
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

1. **复制并配置运行器**：

```bash
cp templates/scripts/nightly-mutation-runner.sh your-project/scripts/
chmod +x your-project/scripts/nightly-mutation-runner.sh
```

2. **编辑配置变量**（脚本顶部）：

```bash
# 项目根目录
PROJECT_ROOT="/path/to/your/project"

# 语言：ts 或 py
LANG="ts"

# 变异测试命令
if [ "$LANG" = "ts" ]; then
  MUTATION_CMD="npx stryker run"
else
  MUTATION_CMD="mutmut run"
fi
```

3. **测试运行**：

```bash
cd your-project
./scripts/nightly-mutation-runner.sh
```

成功时退出码为 0；基线检查失败时退出非零。

4. **配置 crontab**（Linux/macOS）：

```bash
# 编辑 crontab
crontab -e

# 添加定时任务（每日凌晨 2 点）
0 2 * * * /path/to/your/project/scripts/nightly-mutation-runner.sh >> /var/log/mutation-nightly.log 2>&1
```

5. **配置 Windows Task Scheduler**：

- 打开任务计划程序
- 创建基本任务 → 名称："Nightly Mutation Testing"
- 触发器：每天凌晨 2:00
- 操作：启动程序 → `bash.exe`（WSL）或 `wsl.exe`
- 参数：`-c "/mnt/c/path/to/scripts/nightly-mutation-runner.sh"`

### 3.2 使用 systemd timer（Linux 服务器）

1. **复制配置文件**：

```bash
sudo cp templates/systemd/nightly-mutation.service /etc/systemd/system/
sudo cp templates/systemd/nightly-mutation.timer /etc/systemd/system/
```

2. **编辑 service 文件**（修改路径和用户）：

```ini
[Service]
Type=oneshot
User=your-username
WorkingDirectory=/path/to/your/project
ExecStart=/path/to/your/project/scripts/nightly-mutation-runner.sh
```

3. **编辑 timer 文件**（调整运行时间）：

```ini
[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true
```

4. **启用并启动**：

```bash
sudo systemctl daemon-reload
sudo systemctl enable nightly-mutation.timer
sudo systemctl start nightly-mutation.timer

# 查看状态
sudo systemctl status nightly-mutation.timer
sudo systemctl list-timers --all
```

5. **查看日志**：

```bash
sudo journalctl -u nightly-mutation.service -f
```

---

## 4. VS Code Tasks 设置（VS Code Tasks Setup）

VS Code 任务提供手动触发的便捷入口，适用于本地开发调试。

### 4.1 安装任务配置

```bash
cp templates/.vscode/tasks.json your-project/.vscode/
```

### 4.2 可用任务

**TypeScript 路径**：
- `Run Mutation Tests (TS)` - 运行 Stryker
- `Parse Stryker Report` - 解析 Stryker JSON 报告
- `Check Baseline (TS)` - 基线检查
- `Create Mutation Issues (TS)` - 创建 GitHub issues（dry-run）

**Python 路径**：
- `Run Mutation Tests (Py)` - 运行 mutmut
- `Parse mutmut Report` - 解析 mutmut 报告
- `Check Baseline (Py)` - 基线检查
- `Create Mutation Issues (Py)` - 创建 GitHub issues（dry-run）

**完整流程**：
- `Full Mutation Loop (TS)` - TypeScript 完整流程
- `Full Mutation Loop (Py)` - Python 完整流程

### 4.3 使用方法

1. **打开命令面板**：`Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）
2. **选择任务**：输入 "Tasks: Run Task" → 选择任务
3. **查看输出**：终端面板显示执行结果

### 4.4 已知限制

**Python 基线检查**：`Check Baseline (Py)` 任务需要手动提供 `mutmut-results-export.json`。由于 mutmut 2.x 不支持 `results-export`，需要先运行 Python 完整流程或手动导出：

```bash
# 手动导出（仅示例，实际需按 parse_mutmut_report.py 文档操作）
mutmut result-ids killed > killed.txt
mutmut result-ids survived > survived.txt
# ... 然后组装 JSON
```

完整 Python 流程任务已处理此限制，建议使用完整流程任务。

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

# Python
node scripts/mutation-baseline.mjs init \
  --input reports/mutation/mutmut-results.json \
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

在项目根目录创建 `.equivalent-mutants.json`：

```json
{
  "version": "1.0",
  "mutants": [
    {
      "file": "src/calculator.ts",
      "line": 42,
      "mutationType": "ConditionalExpression",
      "reason": "identity",
      "comment": "x === x always true, mutant x !== x unreachable in normal flow",
      "reviewedBy": "alice",
      "reviewedAt": "2024-03-15",
      "issueRef": "#123"
    }
  ]
}
```

详细格式见 [mutation-testing.md §2](mutation-testing.md#2-等价变异豁免equivalent-mutant-exemption)。

### 6.3 应用豁免过滤

`create-mutation-issues.mjs` 自动读取 `.equivalent-mutants.json` 并过滤匹配的变异体：

```bash
node scripts/create-mutation-issues.mjs \
  --input reports/mutation/unified-report.json \
  --exemptions .equivalent-mutants.json \
  --output .mutation-queue \
  --dry-run
```

豁免的变异体不会出现在生成的 `.mutation-queue/*.json` 文件中，也不会创建 GitHub issue。

### 6.4 豁免文件维护

- **版本控制**：`.equivalent-mutants.json` 应提交到版本库
- **定期审查**：代码重构后，豁免可能失效（文件/行号变化），需重新审查
- **文档化**：`comment` 字段应清晰说明豁免原因，便于后续维护

---

## 7. Agent 集成指引（Agent Integration Guide）

### 7.1 为什么 Agent 友好

夜跑流程生成的 `.mutation-queue/*.json` 文件是结构化的、机器可读的任务队列，AI Agent 可以：

1. **读取任务队列**：解析 JSON，获取待修复的变异体列表
2. **分析代码上下文**：根据 `file` 和 `line` 定位源码
3. **生成测试用例**：针对变异体编写缺失的测试
4. **提交 PR**：自动创建 Pull Request，关联对应 issue

### 7.2 队列文件格式

`.mutation-queue/src-calculator.ts.json` 示例：

```json
{
  "version": "1.0",
  "mode": "real",
  "file": "src/calculator.ts",
  "issueNumber": 456,
  "summary": {
    "total": 3,
    "byStatus": {
      "Survived": 3
    }
  },
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
    issue_number = data["issueNumber"]
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

**原因**：浮点数精度或工具版本差异导致分数微小变化（例如 66.23% → 66.22%）

**解决方案**：

1. **检查实际分数变化**：

```bash
# 查看报告中的分数
jq '.baseline.score' .mutation-baseline.json
jq '.summary.mutationScore' reports/mutation/mutation.json
```

2. **允许容差**（修改基线工具）：

在 `mutation-baseline.mjs` 的 `check` 命令中，允许 ±0.1% 容差：

```javascript
const tolerance = 0.1;
if (newScore >= baselineScore - tolerance) {
  console.log("✓ Baseline maintained or improved");
  process.exit(0);
}
```

3. **重新初始化基线**（最后手段）：

```bash
node scripts/mutation-baseline.mjs init \
  --input reports/mutation/mutation.json \
  --lang ts \
  --output .mutation-baseline.json --force
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
  --input reports/mutation/unified-report.json \
  --output .mutation-queue \
  --dry-run
```

查看生成的 `.mutation-queue/*.json` 和 issue body 预览。

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

**症状**：`mutation-baseline.mjs check --lang py` 报错

**原因**：mutmut 2.x 输入格式与工具预期不符

**检查步骤**：

1. **验证输入文件格式**：

```bash
# 期望格式（mutmut result-ids 导出）
{
  "killed": [1, 2, 3],
  "survived": [4, 5],
  "timeout": [],
  "suspicious": [],
  "untested": [],
  "skipped": []
}
```

2. **使用正确的导出命令**：

```bash
# 正确导出（mutmut 2.x）
mutmut result-ids killed > killed.txt
mutmut result-ids survived > survived.txt
# ... 然后组装 JSON（见 parse_mutmut_report.py 文档）
```

3. **使用 parse_mutmut_report.py 生成统一格式**：

```bash
python scripts/parse_mutmut_report.py \
  --input .mutmut-cache \
  --show .mutmut-show-all.txt \
  --output reports/mutation/unified-report.json

# 然后用统一格式初始化基线（需修改 baseline 工具以支持统一格式）
# 或直接从 mutmut result-ids 导出的 JSON 初始化
```

---

## 9. 交叉引用（Cross References）

- [变异测试运营手册](mutation-testing.md) (#42) - 门槛冻结策略、等价变异豁免、胶水代码边界
- [工具用法文档](../README.md) - 所有工具的详细 CLI 参数
- [Parser 设计文档](parse-stryker-report.mjs) (#37) - Stryker 报告解析器
- [Parser 设计文档](parse_mutmut_report.py) (#37) - mutmut 报告解析器
- [等价变异体文件格式](formats/equivalent-mutants.md) - 豁免文件详细规范
- [统一变异报告格式](formats/unified-mutation-report.md) - 解析器输出格式
- [基线文件格式](formats/mutation-baseline.md) - 基线文件详细规范
- [GitHub issue 模板](formats/mutation-issue-template.md) - issue 创建模板

---

## 附录 A：完整示例命令序列

### TypeScript 项目完整流程

```bash
# 1. 运行变异测试
npx stryker run

# 2. 解析报告
node scripts/parse-stryker-report.mjs \
  --input reports/mutation/mutation.json \
  --output reports/mutation/unified-report.json

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

# 5. 创建 GitHub issues（dry-run）
node scripts/create-mutation-issues.mjs \
  --input reports/mutation/unified-report.json \
  --exemptions .equivalent-mutants.json \
  --output .mutation-queue \
  --dry-run

# 6. 实际创建 issues（去掉 --dry-run）
node scripts/create-mutation-issues.mjs \
  --input reports/mutation/unified-report.json \
  --exemptions .equivalent-mutants.json \
  --output .mutation-queue

# 7. 提交更新
git add .mutation-baseline.json .mutation-queue/
git commit -m "chore: update mutation baseline and queue"
git push
```

### Python 项目完整流程

```bash
# 1. 运行变异测试
mutmut run

# 2. 导出结果
mutmut show all > .mutmut-show-all.txt

# 3. 解析报告
python scripts/parse_mutmut_report.py \
  --input .mutmut-cache \
  --show .mutmut-show-all.txt \
  --output reports/mutation/unified-report.json

# 4. 基线检查（需先导出 mutmut-results.json）
# 见工具文档获取导出命令

node scripts/mutation-baseline.mjs check \
  --input reports/mutation/mutmut-results.json \
  --lang py \
  --output .mutation-baseline.json

# 5-7. 同 TypeScript
```

---

**文档版本**：1.0  
**最后更新**：2024-03-15  
**维护者**：lazypack-discipline 团队
