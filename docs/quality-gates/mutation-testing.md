# 变异测试运营手册（Mutation Testing Operations Guide）

本文是工单 #42 的变异测试运营文档，覆盖三件事：门槛冻结策略、等价变异豁免流程、胶水代码边界定义。

读者是第一次在项目里接入变异测试的开发者，不要求事先了解 Stryker 或 mutmut。

**状态与边界**：本文是工具层运营手册，所述流程为手动执行。本仓未接 hook/CI，也未安装 Stryker 或 mutmut；文中配置示例供目标项目接入使用。配套工具 `scripts/calculate_crap.mjs` 已在本仓可用（用法见 §1.7）。

工具官方文档（本文配置键均据此核对）：

- StrykerJS: <https://stryker-mutator.io/docs/stryker-js/configuration/>
- mutmut: <https://mutmut.readthedocs.io/en/latest/>

---

## 0. 快速上手（Quickstart）

### JS/TS 项目（StrykerJS）

1. 安装：

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
```

2. 最小运行（没有配置文件也能跑，工具自动探测 `src` 与测试）：

```bash
npx stryker run
```

3. 预期输出：控制台先打进度条，结束输出逐文件分数表（`# killed`、`# total`、`mutation score`）与总分；完整 HTML 报告写入 `reports/mutation.html`，JSON 报告写入 `reports/mutation/mutation.json`。退出码：变异分数不低于 `thresholds.break` 时为 0，低于时为 1（未配置 `break` 时恒为 0）。

### Python 项目（mutmut）

1. 安装（mutmut 3+；Windows 需在 WSL 内运行，mutmut 依赖 fork）：

```bash
pip install mutmut
```

2. 最小运行（自动探测 `tests/` 或 `test/` 与源码目录）：

```bash
mutmut run
```

3. 预期输出：`Killed` / `Survived` / `Timeout` 等计数与变异总分；中断后可随时续跑。结果缓存在项目根的 `mutants/` 目录，`mutmut browse` 打开交互界面逐个查看存活变异体。

跑通最小运行后，按第 1 章冻结基线，再按第 3 章把变异范围收敛到逻辑层。

---

## 1. 门槛冻结策略（Threshold Freezing Strategy）

### 1.1 概念定义

**门槛冻结（threshold freezing）**：第一次跑变异测试时，把当前变异分数（mutation score，被杀死的变异体占总数的百分比）原样冻结为门禁线；之后任何变更只要让分数低于冻结值即判失败。

它解决的问题：遗留项目首次接入时分数往往只有 30%–60%，若直接要求 80%，全部存量代码同时红灯，工作无法开展。冻结让存量问题显性化但不阻塞交付。

冻结不等于放弃目标。冻结值是**下限**，用棘轮方式只升不降：分数一旦改善立即上调门禁线，回归立即拦截。

### 1.2 何时使用

- **遗留代码首次接入变异测试**：存量分数低，必须先冻结再爬升。
- **历史模块补测试期间**：模块分数未达标前冻结在当前值，不阻塞其他工作。
- **新项目或新模块**：可以不冻结，直接以目标分数（80%，见 §1.5）起步。

### 1.3 冻结基线的操作步骤（首次运行）

1. **跑一次全量变异测试。** 首次运行慢（每个变异体都要跑一遍测试），安排夜间或容忍本地等待；Stryker 可配 `"concurrency"` 与 `"incremental"` 加速后续运行。
2. **记录基线分数。** 从报告读总分（如 `mutation score: 42.55%`），连同日期、工具版本写进交接说明或门槛文件。
3. **冻结为门禁线。**
   - Stryker：把 `thresholds.break` 设为基线分数的整数下限（42.55 → `42`），随 `stryker.config.json` 提交，见 §1.4。
   - mutmut：没有内置阈值，把分数写入版本库内的 `mutation-baseline.json`，由脚本或人工比对。
4. **验证门禁生效。** 人为削弱一个断言再跑：分数应跌破冻结值、Stryker 退出码变 1。验证后恢复测试。
5. **进入棘轮循环。** 分数每次提升后立即上调 `break` 或基线文件；分数永不回落。

mutmut 基线文件示例（版本库内，与 `equivalent-mutants.json` 平级）：

```json
{
  "tool": "mutmut",
  "date": "2026-10-05",
  "mutationScore": 42.55,
  "killed": 40,
  "total": 94
}
```

### 1.4 具体示例：从 42.55% 冻结并爬升

某遗留 TS 项目首次运行，`clear-text` 报告（示例数据）：

```text
All files    | # killed | # total | mutation score
src/services |       31 |      68 |          45.59
src/domain   |        9 |      26 |          34.62
-----------------------------------------------------
All files    |       40 |      94 |          42.55
```

1. 基线分数：**42.55%**。
2. 冻结配置写入 `stryker.config.json`：

```json
{
  "thresholds": { "high": 80, "low": 42, "break": 42 }
}
```

3. 预期结果：当前分数 42.55 ≥ 42，Stryker 退出码 0；任何人削弱测试使分数降到 41.x，退出码变 1、构建失败。`high: 80` 只是报告里的绿色目标线，`break` 才参与退出码判定。此后每补一批测试使总分上升，就把 `break`（和 `low`）上调到新的整数下限：42 → 50 → 60 → 80。

### 1.5 增量提升：新代码 ≥ 80%，旧代码祖父条款

- **新代码**：新增或重写的函数，变异分数必须 ≥ 80%（对应 `thresholds.high = 80` 的绿色线）。新代码不允许挂第二章豁免清单以外的债。
- **旧代码（grandfathered）**：冻结基线覆盖的历史模块不追溯；它们受 §1.3 的冻结门禁保护，分数只许升不许降。
- **混合提交**：一次改动同时触碰新旧代码时，看报告里的逐文件分数——被触碰的存量文件分数不得下降，新增文件分数必须 ≥ 80%。

合入前判定：

```text
改动是否可合入？
├─ 文件是新增的？
│  ├─ 是 → 该文件 mutation score ≥ 80%？
│  │        ├─ 是 → 放行
│  │        └─ 否 → 补测试后再合入
│  └─ 否（存量文件）→ 总分 ≥ 冻结 break 且该文件分数未下降？
│           ├─ 是 → 放行
│           └─ 否 → 拦截，修复后重跑
```

### 1.6 重构机会：把冻结值当作技术债台账

冻结分数是存量测试质量的公开台账，三类重构时机：

1. **触碰即达标**：任务本身要改某遗留模块时，顺手把该模块分数补到 80%，再上调该模块的 `break`。改前欠的债改后清零，不新欠。
2. **等价变异体扎堆**：某模块的豁免清单条目持续增长（见第 2 章），说明测试写不到行为本身，优先重构该模块的分支结构，而不是继续记豁免。
3. **CRAP 先导信号**：CRAP 值高的函数（见 §1.7）补测试性价比最高——复杂度高且覆盖差，变异分数通常也差，先啃分数低的。

### 1.7 相关阈值：CRAP（Uncle Bob 建议）

变异分数之外，本仓另有 CRAP 静态指标作廉价先导信号：

```text
CRAP = complexity² × (1 − coverage)³ + complexity
```

Uncle Bob（Robert C. Martin）对 CRAP 阈值的建议：

- **4**：人工编写代码的警戒线。
- **6–8**：AI 生成代码可放宽到的区间（产出快、量大，稍高的 CRAP 可接受，但测试要跟上）。

本仓 `scripts/calculate_crap.mjs` 默认阈值 **6**（取 AI 建议区间），可用 `--threshold` 覆盖：

```bash
node scripts/calculate_crap.mjs --coverage coverage.json --complexity escomplex.json --lang ts --threshold 6
```

CRAP 超标表示「复杂度高 × 覆盖差」，是变异测试的重点目标；变异分数是最终裁判。

---

## 2. 等价变异豁免流程（Equivalent Mutant Exemption Process）

### 2.1 定义

**等价变异体（equivalent mutant）**：变异改变了代码文本，但在所有可达输入下行为与原代码完全一致，因此任何测试都无法杀死它。

等价变异体不是测试失败，也不是代码缺陷。放任不管会永久压低变异分数，诱导人去写没有意义的测试。正确处置是：确认、记录、豁免。

### 2.2 识别流程（identify → review → record）

1. **识别**：跑变异测试，收集存活（Survived）变异体。先排除工具噪声：编译失败、超时的变异体按工具超时/编译配置处理，不入豁免清单；只有「测试全绿 + 变异存活」才进入审查。
2. **审查**：打开工具报告中的变异 diff，人工回答一个问题——是否存在任何输入使变异前后行为不同？
   - 能找到这样的输入：不是等价体，是测试缺口，回 §2.3 决策树补测试或重构。
   - 确定不存在（给出可检验的论证：数学恒等、不可达分支、代码不变式）：判定等价。
3. **记录**：等价判定必须落盘到版本库内的 `equivalent-mutants.json`（schema 见 §2.4），并写明 `reason`。「大概等价」没有论证，不允许入清单。

> **位置约定**：`equivalent-mutants.json` 放在项目根、纳入版本库，与工具状态目录平级（Stryker 的 `reports/`、mutmut 3 的 `mutants/`、mutmut 2 的 `.mutmut-cache`）。不要放进 Stryker 的 `.stryker-tmp/`——那是每次运行后会被清理的沙箱，放进去等于丢记录。

### 2.3 决策树

```text
变异体存活（survived，测试全绿）
   │
   ├─ Q1. 运行结果正常吗？（非编译错误、非超时）
   │      ├─ 否 → 工具噪声：调 timeoutMS / 编译配置；不入豁免清单
   │      └─ 是 → 进入 Q2
   │
   ├─ Q2. 人工审查 diff：存在使行为改变的输入吗？
   │      ├─ 是 → 行为确实变了 → 写测试杀死它
   │      │        ├─ 能写出合理测试 → 补完重跑 → 已杀死，结束
   │      │        └─ 写不出合理测试 → 该行为本就不该存在吗？
   │      │              ├─ 是（冗余分支 / 死代码）→ 重构代码：删除或合并分支后重跑
   │      │              └─ 否 → 升级评审：两人确认下一步
   │      └─ 否（有论证的行为恒等）→ 判定等价 → Q3
   │
   └─ Q3. 等价体是系统性模式吗？（同一模块同一操作符反复等价）
          ├─ 是 → 配置级豁免（仍须在 equivalent-mutants.json 记一条 reason，注明「配置豁免」）
          │        Stryker：mutator.excludedMutations 排除该操作符，并用 mutate 范围限定到该模块
          │        mutmut：do_not_mutate_patterns 正则，或 # pragma: no mutate 注释
          └─ 否（孤立个案）→ 记入 equivalent-mutants.json（§2.4），继续跑
```

三个出口对应三种处置：**补测试或重构**（Q2 为「是」分支）、**配置豁免**（Q3 系统性模式）、**个案豁免**（Q3 孤立个案）。凡判定等价的条目，在相关代码被修改后必须重新审查——等价性常依赖代码不变式，不变式没了，等价就不成立了。

### 2.4 记录格式：equivalent-mutants.json

`equivalent-mutants.json` 内容为记录对象组成的数组。单条记录：

```json
{
  "mutantId": 42,
  "file": "src/services/access.ts",
  "line": 17,
  "operator": "EqualityOperator",
  "reason": "条件 `user.isAdmin || user.role === 'admin'` 的第二子句被取反不改变整体：赋值侧不变式保证 role 为 'admin' 时 isAdmin 必为 true，因此任一输入下析取结果恒等。若该不变式被移除，本条目须重审。",
  "reviewedBy": "alice",
  "date": "2026-10-05"
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `mutantId` | 工具报告中的变异体标识（Stryker JSON 报告的数字 id；mutmut 3 用 `模块.函数_序号` 形式） |
| `file` / `line` | 变异所在的文件与行号 |
| `operator` | 变异操作符，用工具报告里的名称（如 StrykerJS 的 `EqualityOperator`） |
| `reason` | 为什么等价：给出可检验的论证（恒等式、不变式或不可达性），不接受「看起来等价」 |
| `reviewedBy` | 人工审查者标识 |
| `date` | 审查日期，ISO 格式（YYYY-MM-DD） |

---

## 3. 胶水代码边界定义（Glue Code Boundary Definition）

### 3.1 定义

**胶水代码（glue code，适配层）**：自身不做业务决策，只把一层的东西搬运到另一层的代码——纯委托、参数透传、框架绑定、序列化往返。

**逻辑代码（逻辑层）**：包含 if/else 分支、循环、计算、数据变换的代码。

判断标准不是文件名或目录名，而是内容：**这段代码改掉一个分支或一个常量，业务结果会变吗？** 会，是逻辑；它根本没有分支和常量可改，是胶水。

### 3.2 变异测试策略

| 层 | 典型内容 | 变异测试 | 理由 |
| --- | --- | --- | --- |
| 逻辑层（`src/domain`、`src/services`） | 业务规则、分支、循环、计算 | **必测**，目标 80%+ | 分支与变换是缺陷藏身处，变异测试的收益全部在这里 |
| 适配层（`src/adapters`、DTO 映射、框架胶水） | 纯委托、参数透传、序列化 | **豁免**（排除出 mutate 范围） | 无分支可变异；硬测只会产生噪声与假存活 |
| 入口 / 配置 / 生成代码 | main、构建产物、codegen | 豁免 | 同上 |

豁免是**结构性的**（目录层面写进工具配置），不是逐行贴忽略注释；逐行 pragma 只用于第二章确认等价的个别变异体。

### 3.3 代码对照示例

**逻辑层（纳入 mutate 范围）**——有分支、有计算，变异体值得杀：

```ts
// src/domain/pricing.ts —— 必测
export function shippingFee(subtotalCents: number, isMember: boolean): number {
  if (subtotalCents <= 0) {
    throw new RangeError('subtotal must be positive');
  }
  if (subtotalCents >= 100_00 || isMember) {
    return 0;
  }
  let fee = 500;
  if (subtotalCents < 20_00) {
    fee += 300;
  }
  return fee;
}
```

**适配层（豁免）**——纯委托、无分支，变异测试不产生任何信息：

```ts
// src/adapters/http-pricing.ts —— 排除出 mutate
import { shippingFee } from '../domain/pricing.js';
import type { HttpRequest, HttpResponse } from './types.js';

export async function handleShippingFee(req: HttpRequest): Promise<HttpResponse> {
  const body = await readJson(req);
  const fee = shippingFee(body.subtotalCents, body.isMember === true);
  return json(200, { fee });
}
```

Python 同理。逻辑层：

```python
# src/domain/pricing.py —— 纳入变异
def shipping_fee(subtotal_cents: int, is_member: bool) -> int:
    if subtotal_cents <= 0:
        raise ValueError("subtotal must be positive")
    if subtotal_cents >= 10_000 or is_member:
        return 0
    fee = 500
    if subtotal_cents < 2_000:
        fee += 300
    return fee
```

适配层：

```python
# src/adapters/cli.py —— do_not_mutate：纯透传
import sys

from domain.pricing import shipping_fee


def main(argv: list[str]) -> int:
    subtotal, member = parse_args(argv)
    print(shipping_fee(subtotal, member))
    return 0
```

边界走查：适配层里的 `body.isMember === true` 算逻辑吗？算最薄的一类布尔规整，与业务无关、由接口契约保证，可以留在适配层。一旦适配层出现**业务含义**的条件（比如「会员打八折」），它已经越界，见 §3.4。

### 3.4 架构信号：适配层出现逻辑 = 重构信号

发现以下任何一条，按对应动作处理：

- **适配层出现业务 if/else 分支** → 把分支体移入 `src/services/` 或 `src/domain/`，适配层只留调用。例：HTTP 适配器里出现「满 100 免运费」判断 → 移到 `src/domain/pricing.ts`。
- **适配层出现数据变换或计算**（单位换算、金额聚合等序列化之外的加工） → 移入 domain，适配层只做序列化。
- **适配层出现循环聚合**（sum / group / reduce） → 移入 services；适配层允许的单对象字段映射不算。
- **豁免后总分仍上不去**（adapters 已排除，domain 分数依旧低） → 排查是否有逻辑挂在适配层的名字下，先移出再补测。
- **允许的例外**：适配层的防御性参数校验（fail-fast 的 `if (!input) throw`）可以留下，但必须有测试覆盖，或标注 `# pragma: no mutate` 并在 PR 说明理由。

反向信号也成立：domain 里出现纯透传函数 → 直接删除下沉，不要为它写变异测试。

### 3.5 Stryker 配置示例（JS/TS）

文件：项目根 `stryker.config.json`（或 `stryker.conf.json`）。以下配置可直接复制使用，所有键出自官方文档：`testRunner`、`coverageAnalysis`、`mutator`、`mutate`、`ignorePatterns`、`thresholds`。

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutator": { "excludedMutations": [] },
  "mutate": [
    "src/domain/**/*.ts",
    "src/services/**/*.ts",
    "!src/**/*.spec.ts"
  ],
  "ignorePatterns": ["dist", "coverage"],
  "reporters": ["clear-text", "html"],
  "thresholds": { "high": 80, "low": 42, "break": 42 }
}
```

> **`ignorePatterns` 与 `mutate` 的区别**：`ignorePatterns` 里的文件根本不会被拷进 Stryker 沙箱（`.stryker-tmp`），对工具而言等于不存在；`mutate` 只决定沙箱内哪些文件被变异。适配层绝不能进 `ignorePatterns`——测试 import 适配器时需要它真实存在，移出沙箱会直接报 missing module。适配器的豁免方式是：留在沙箱里作为测试的运行时依赖，仅靠不列入 `mutate` 白名单来排除变异。

要点：

- `mutate` 用白名单只列逻辑层目录，适配层天然不在变异范围，这是推荐的胶水豁免方式。
- 等价的黑名单写法（官方同样支持，`!` 前缀为排除）：`"mutate": ["src/**/*.ts", "!src/adapters/**", "!src/**/*.spec.ts"]`。
- `mutator.excludedMutations` 保持空数组起步；仅当 §2.3 Q3 判定某操作符在某模块系统性等价时，才加入该操作符名，并用 `mutate` 范围限定影响面。
- `coverageAnalysis: "perTest"` 让 Stryker 只执行覆盖该变异体的测试，显著提速。
- `thresholds` 即 §1 的冻结门禁：分数低于 `break` 退出码 1；`high` / `low` 只影响报告颜色。三个键必须同时给出（或 `"break": null` 表示永不因分数失败）。
- `ignorePatterns` 只决定哪些文件不拷进沙箱，不能用它替代 `mutate` 做变异豁免。

### 3.6 mutmut 配置示例（Python）

文件：项目根 `setup.cfg`（官方语法；路径为换行分隔的 glob）：

```ini
[mutmut]
source_paths=src/
pytest_add_cli_args_test_selection=tests/
do_not_mutate=
    src/adapters/*
    */__init__.py
```

- `source_paths`：paths-to-mutate，只列逻辑层目录，适配层不列入即为结构性豁免。
- `pytest_add_cli_args_test_selection`：runner 选项，控制 pytest 的测试选择参数（等价于命令行 `pytest tests/`）。
- `do_not_mutate`：在 `source_paths` 之外再排除的 glob，上面把可能被通配进来的适配层与 `__init__.py` 显式挡掉。

用 `pyproject.toml` 时（数组形式，官方文档同页给出）：

```toml
[tool.mutmut]
source_paths = ["src/"]
pytest_add_cli_args_test_selection = ["tests/"]
```

mutmut 没有分数阈值选项：门禁线用 §1.3 的基线文件加脚本比对实现。个别行或块用官方 pragma 豁免：

```python
def render(rows):  # pragma: no mutate block —— 整块豁免（纯展示装配，胶水）
    out = []
    for r in rows:
        out.append(str(r))
    return "\n".join(out)
```

临时只测某个函数可用 CLI 通配：`mutmut run "my_module*"`。

### 3.7 与 CRAP 计算器的配合

先跑 `scripts/calculate_crap.mjs`（秒级、静态）找出复杂度高 × 覆盖差的函数，再对它们做变异测试（分钟级、动态）。两者阈值语义相互衔接：CRAP 阈值 4（人工）/ 6–8（AI，本仓默认 6），见 §1.7；变异分数目标 80%，见 §1.5。

---

参考：工单 #42；StrykerJS 与 mutmut 官方配置文档（链接见文首）；本仓 `scripts/calculate_crap.mjs`。
