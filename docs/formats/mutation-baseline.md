# 变异基线文件格式（Mutation Baseline File Format）

本文档定义夜跑变异测试闭环中「变异基线文件」`.mutation-baseline.json` 的 JSON 契约。基线文件把项目的变异分数冻结为门槛，落实[变异测试运营手册](../quality-gates/mutation-testing.md) §1 的门槛冻结策略与棘轮式只涨不跌规则：分数一旦改善立即上调门槛，任何低于门槛的回归立即拦截。

**契约版本**：1.0（演进规则见 §9）。

**状态与边界**：本文档先于实现冻结契约。文中提到的基线工具 `scripts/mutation-baseline.mjs`（init/check/update）属夜跑闭环后续施工范围，落地之前本文档只是契约，不表示该工具已存在或门槛自动生效。本仓不运行夜跑闭环，也不安装 Stryker 或 mutmut；门槛冻结策略的操作背景见[变异测试运营手册](../quality-gates/mutation-testing.md)。配套格式：统一变异体报告 [unified-mutation-report.md](unified-mutation-report.md)（不含统计字段）；豁免文件 `.equivalent-mutants.json` 的细化定义同属后续施工。

与运营手册 §1.3 的关系：手册里那份内联 JSON（`tool`/`date`/`mutationScore` 字段）是解释冻结策略时的非正式示意，字段名与本契约不同，**不是**本契约；夜跑闭环读写的 `.mutation-baseline.json` 以本文档为准。

背景与依据：夜跑 agent 自动补强闭环（规划参考 issue #43），基于 #37（质检分层节奏）与 #42（变异测试运营手册）。

---

## 0. 快速上手

一份最小但完整的基线文件：

```json
{
  "version": "1.0",
  "updated": "2026-10-05T18:30:00Z",
  "baseline": {
    "score": 42.55,
    "killed": 40,
    "survived": 54,
    "total": 94
  }
}
```

要点：

- 顶层只有 `version`、`updated`、`baseline` 三个字段，全部必填。
- `baseline` 恰好四个字段（`score`、`killed`、`survived`、`total`），全部必填；四个值必须来自**同一次**变异测试运行（§3）。
- `score` 保留工具报告的小数（如 42.55），禁止取整成 42（§4）。
- 文件固定放在**目标项目根目录**、纳入版本库（§1）。
- 消费者读到未知 `version` 必须报错退出，不得猜测兼容（§2）。

生产者与消费者：

| 环节 | 角色 |
| --- | --- |
| `mutation-baseline.mjs init`（待实现） | 生产者：首次冻结，读原始工具报告写出本文件 |
| `mutation-baseline.mjs check`（待实现） | 消费者：比较本次分数与 `baseline.score`，回归时以非零退出码拦截 |
| `mutation-baseline.mjs update`（待实现） | 生产者：分数提高后上调门槛；拒绝任何下调 |
| 夜跑流水线（GitHub Actions / cron） | 调用者：在 check 步骤以退出码决定是否放行 |

## 1. 文件位置与通用约定

- 文件名固定 `.mutation-baseline.json`，放在**目标项目的根目录**（与 `package.json`、`pyproject.toml` 平级），与 `.equivalent-mutants.json` 平级。它不在本仓内——是用户项目文件，本仓只提供格式契约与工具。
- **必须纳入版本库**：门槛冻结的价值来自跨提交、跨成员生效；把文件加进 `.gitignore` 等于放弃冻结。建议随提升分数的那批测试改动一并提交，使门槛与代码同步演进。
- 不要放进工具状态目录：Stryker 的 `.stryker-tmp/` 是每次运行后清空的沙箱，mutmut 3 的 `mutants/` 是缓存目录，放进去等于丢记录（同[运营手册 §2.2 位置约定](../quality-gates/mutation-testing.md)）。
- 文件编码 UTF-8（无 BOM）、LF 换行、2 空格缩进、结尾一个换行符。
- 除本契约字段外不得有其他字段（schema `additionalProperties: false`）。

## 2. 顶层结构

| 字段 | 类型 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `version` | string | 是 | 闭合枚举，当前仅 `"1.0"` | 本文件遵循的契约版本。消费者读到枚举外的值必须报错退出（用户错误），不得猜测兼容 |
| `updated` | string | 是 | ISO-8601 UTC，`YYYY-MM-DDTHH:MM:SSZ` | 本次写出该文件的时刻，由基线工具在写盘时生成，不取自变异测试报告 |
| `baseline` | object | 是 | 见 §3 | 冻结的统计快照 |

约束：

- `updated` 只在**成功写出**时刷新（init 与被接受的 update）；init 拒绝、update 拒绝下调时文件不得被触碰，`updated` 保持原值。
- 该时刻是「文件级」事实：基线对应的测试运行可能发生在更早时间，本契约不记录运行时刻本身。

## 3. baseline 对象

| 字段 | 类型 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `score` | number | 是 | 0 ≤ score ≤ 100；最多 2 位小数 | 变异分数，按工具报告原样记录，**保留小数、禁止取整**（§4） |
| `killed` | integer | 是 | ≥ 0 | 被杀死的变异体数 |
| `survived` | integer | 是 | ≥ 0 | 存活的变异体数 |
| `total` | integer | 是 | ≥ 1 | 该次运行的变异体总数 |

跨字段约束（schema 无法表达，由基线工具的测试保证）：

- **同源**：`score`、`killed`、`survived`、`total` 必须来自同一次运行、同一工具、同一变异范围（mutate 范围）。禁止把不同运行的数字拼进同一份基线。
- `killed + survived ≤ total`：工具可能把超时、无覆盖等其余状态也计入 `total`，两侧不必相等。
- `score` 与计数之间**不要求**满足任何特定换算公式（不同工具的分母口径不同，例如 Stryker 把 Timeout 计入检出，见[统一格式文档 §5.1](unified-mutation-report.md)）。文件记录工具报告的原值，基线工具不得在文件里重算分数。
- `total ≥ 1`：变异范围为空（没有变异体）时不得冻结基线，工具应拒绝写出——空范围的分数没有意义，冻结它会制造虚假门槛。

`killed` / `survived` / `total` 不参与门槛判定（判定只看 `score`，§5.2）；它们的作用是审计：`total` 相对上次大幅变化说明 mutate 范围漂移了，`killed`/`survived` 便于人工核对分数是否可信。

## 4. score 精度要求

**`score` 必须保留小数**，按工具报告的原值写入，禁止取整、禁止截断：

- StrykerJS 的报告界面与 clear-text 输出恒为两位小数（如 42.55），本契约与之对齐：`score` 最多 2 位小数。小数位上限是生产者约束，schema 只约束数值范围（0–100），两位小数由基线工具的测试保证。
- 反例：首次分数 42.55，禁止写成 `42` 或 `43`。整数化会破坏只涨不跌判定：整数门槛 42 会放过 42.01 这种真实回归，也会让棘轮的比较失去精度。
- JSON 数字没有末尾零：`42.50` 与 `42.5` 是同一个 JSON 数值，两者都合法；「保留小数」指的是量值不得取整，不是字节层面的字面量保留。
- `score` 为 `0` 合法（一个变异体都没杀死）；`score` 为 `100` 合法（全部杀死）。

与 Stryker `thresholds.break` 的分工：`break` 只接受整数，是工具侧的粗门禁（42.55 → `break: 42`，见[运营手册 §1.4](../quality-gates/mutation-testing.md)）；本文件的 `score` 保留小数，是冻结值的**权威记录**。两者可以并存，分数比对以本文件为准（更精确，不会因整数下限放过 42.01 的回归）。

比较语义：门槛判定比较的是两个十进制数值（基线 `score` 与本次运行分数）。基线工具实现比较时应带浮点容差（建议 1e-9，即 `current + 1e-9 ≥ baseline` 视为不低于），避免二进制浮点误差制造伪回归；落地方式由工具施工票确定。

## 5. 使用场景（init / check / update）

三个场景对应基线工具 `mutation-baseline.mjs` 的三个子命令。工具尚未实现，命令形态（flag 名、报错文案）以该工具的施工票为准；本节定义的是**文件与语义**，示例命令按规划接口书写。

三个子命令都通过 `--input` 指定**原始工具报告**（Stryker JSON 报告，或 mutmut 缓存/导出），`--lang ts|py` 决定解析口径，`--output` 覆盖写出路径（默认当前工作目录下的 `.mutation-baseline.json`，夜跑在目标项目根运行时即项目根；该参数主要供测试使用）。统计数据的来源是原始报告而非统一报告：统一报告 v1.0 只含存活变异体、没有统计字段（架构既定决策）。

### 5.1 init：首次冻结

适用：项目首次接入变异测试，或更换工具/调整 mutate 范围后重新起算（§8）。

1. 跑一次全量变异测试（首次较慢，建议夜间）。
2. `init` 从原始报告读取 `score`、`killed`、`survived`、`total`，写出 `.mutation-baseline.json`。

```bash
node scripts/mutation-baseline.mjs init --input reports/mutation/mutation.json --lang ts
```

行为约定：

- 目标位置已有基线文件时**拒绝执行**（用户错误，退出码 1），提示改用 check/update；绝不静默覆盖。
- `total` 为 0（空范围）时拒绝写出（§3）。

### 5.2 check：门槛检查

适用：每次夜跑（或合入前）验证分数没有跌破冻结值。

```bash
node scripts/mutation-baseline.mjs check --input reports/mutation/mutation.json --lang ts
```

判定（比较语义见 §4）：

- 本次分数 ≥ 基线：通过，退出码 0（持平也是通过，输出提示分数未变）。
- 本次分数 < 基线：回归，退出码 2，stderr 写明两个分数与差值；夜跑流水线以退出码拦截。
- 基线文件不存在：用户错误，退出码 1，提示先 `init`。
- 基线文件 JSON 非法或 `version` 未知：用户错误，退出码 1。

### 5.3 update：只涨不跌（棘轮）

适用：补测合入、分数经一次完整运行确认提高后，立即上调门槛（[运营手册 §1.3 步骤 5](../quality-gates/mutation-testing.md)）。

```bash
node scripts/mutation-baseline.mjs update --input reports/mutation/mutation.json --lang ts
```

判定：

- 本次分数 > 基线：重写文件，四个统计值与 `updated` 全部更新为本次运行的数据（不得新旧混拼），退出码 0。
- 本次分数 = 基线：不做任何事，文件保持原样（`updated` 不刷新），退出码 0。
- 本次分数 < 基线：**拒绝下调**，文件保持原样，退出码 2，stderr 写明拒绝原因。

只涨不跌意味着**没有合法的下调路径**：范围扩大、工具更换等导致分数必然回落的场景，不走 `update`，走 §8 的重新 `init`，由人审查后提交。

退出码汇总（遵循本仓约定：0 成功 / 1 用户错误 / 2 工具判定失败）：

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功：init 写出、check 通过（含持平）、update 已上调或持平 no-op |
| 1 | 用户错误：文件或报告缺失、JSON 非法、版本未知、基线已存在时 init、空范围 init |
| 2 | 门槛失败：check 发现回归、update 拒绝下调 |

## 6. JSON Schema

以下 JSON Schema（draft-07）是本契约的一部分，可直接供带 schema 校验器的项目使用；正文与 schema 冲突时以正文为准并修正 schema。本仓工具保持零依赖，测试按正文约束手写断言，不引入 schema 库。`killed + survived ≤ total` 是跨字段约束，schema 无法表达，由基线工具的测试保证（§3）。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Mutation Baseline",
  "description": "夜跑变异测试闭环变异基线文件契约 v1.0，正文见 docs/formats/mutation-baseline.md",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "updated", "baseline"],
  "properties": {
    "version": {
      "type": "string",
      "enum": ["1.0"],
      "description": "本文件遵循的契约版本；消费者读到枚举外的值必须报错退出"
    },
    "updated": {
      "type": "string",
      "description": "本次写出该文件的 UTC 时刻，YYYY-MM-DDTHH:MM:SSZ",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"
    },
    "baseline": {
      "type": "object",
      "additionalProperties": false,
      "required": ["score", "killed", "survived", "total"],
      "properties": {
        "score": {
          "type": "number",
          "minimum": 0,
          "maximum": 100,
          "description": "变异分数，按工具报告原样记录；保留小数禁止取整；≤2 位小数由生产者测试保证（见正文 §4）"
        },
        "killed": {
          "type": "integer",
          "minimum": 0,
          "description": "被杀死的变异体数"
        },
        "survived": {
          "type": "integer",
          "minimum": 0,
          "description": "存活的变异体数"
        },
        "total": {
          "type": "integer",
          "minimum": 1,
          "description": "该次运行的变异体总数；空范围（total=0）不得冻结基线"
        }
      }
    }
  }
}
```

## 7. 完整示例

两个示例都是可直接 `JSON.parse` 的完整文件，并满足 §6 的 schema；数字沿用[运营手册 §1.4](../quality-gates/mutation-testing.md) 的 94 变异体示例。

### 7.1 首次冻结（42.55）

```json
{
  "version": "1.0",
  "updated": "2026-10-05T18:30:00Z",
  "baseline": {
    "score": 42.55,
    "killed": 40,
    "survived": 54,
    "total": 94
  }
}
```

- 分数 42.55 保留两位小数原值，没有取整（§4）。
- `killed + survived = 94 = total`：本次运行没有超时/无覆盖等其余状态；若工具把其余状态计入 total，则允许 `killed + survived < total`（§3）。

### 7.2 棘轮上调后（58.51）

补测合并后一次完整运行把分数提高到 58.51，`update` 重写文件：

```json
{
  "version": "1.0",
  "updated": "2026-10-12T18:45:00Z",
  "baseline": {
    "score": 58.51,
    "killed": 55,
    "survived": 39,
    "total": 94
  }
}
```

- 四个统计值都来自产生 58.51 的那一次运行，`updated` 刷新为写盘时刻。
- 此后任何一次运行分数低于 58.51（哪怕 58.50）都会被 `check` 以退出码 2 拦截——这正是保留小数的意义：整数门槛 58 会放过 58.50 的回归。

## 8. 消费者约定

- **门槛判定只看 `score`**：`killed`/`survived`/`total` 用于审计与追溯（§3）。
- **更换工具或调整 mutate 范围 = 重新 init**：分数只在同工具、同范围、同口径下可比。Stryker 与 mutmut 的分母口径不同，扩大或收缩 mutate 范围也会改变分数基线。这些操作之后旧基线失去比较意义，必须人工确认后删除旧文件重新 `init`，并以一次显式提交说明原因；禁止用 `update` 掩盖口径变化。
- **基线文件必须随代码演进提交**：update 后随提升分数的测试改动一并提交，让门槛历史在 git 里可追溯。
- **与统一报告的边界**：统一报告 v1.0（[unified-mutation-report.md](unified-mutation-report.md)）只含存活变异体、没有统计字段；分数与计数的来源是原始工具报告。衔接实现由基线工具施工票落实，本契约不修改统一报告。
- **与豁免的交互**：`.equivalent-mutants.json` 的豁免条目增删会改变 total 与分数（等价体不再计入存活）。分数因此上涨时按 §5.3 走 `update` 固化；分数回落（如清理错误豁免）不许 `update` 下调，需要人工评估是否重新 `init` 并留痕。

## 9. 演进规则

1. 契约版本记录在文件 `version` 字段与本文档头部。**1.0 期间只允许向后兼容的增量**：新增字段必须可被旧消费者忽略；闭合枚举（当前仅 `version`）新增值必须先更新本文档与 §6 schema，再升 minor 版本（如 1.1）。
2. 禁止重命名既有字段或改变其类型；需要不兼容变更时升大版本（如 2.0），并在本文档保留迁移说明；旧消费者读到更高大版本必须报错退出（§2）。
3. 本文档是格式的唯一权威；基线工具、测试与示例与本文冲突时，改实现与示例，不改契约语义——语义变更走本节流程。

## 参考

- [变异测试运营手册](../quality-gates/mutation-testing.md)：门槛冻结策略与棘轮规则的来源（§1）。
- [统一变异体报告格式](unified-mutation-report.md)：同目录契约；统一报告不含统计字段，分数类消费的边界见其 §8。
- [CRAP 计算器](../../scripts/calculate_crap.mjs)：本仓 CLI 工具结构参考。
- StrykerJS 配置（`thresholds.break` 语义）：<https://stryker-mutator.io/docs/stryker-js/configuration/>
- mutmut 官方文档：<https://mutmut.readthedocs.io/en/latest/>
