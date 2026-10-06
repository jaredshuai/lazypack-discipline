# 统一变异体报告格式（Unified Mutation Report Format）

本文档定义夜跑变异测试闭环中「统一变异体报告」的 JSON 契约。它是 Stryker 解析器（`scripts/parse-stryker-report.mjs`）与 mutmut 解析器（`scripts/parse_mutmut_report.py`）的**输出规范**，也是 baseline 检查、豁免过滤与 issue 创建脚本的**输入规范**。两个解析器产出同一结构，下游工具只通过 `tool` 字段感知原始报告来自哪个工具。

**契约版本**：1.0（演进规则见 §9）。

**状态与边界**：本文档先于实现冻结契约。文中提到的解析器与消费脚本属夜跑闭环后续施工范围，落地之前本文档只是契约，不表示任何脚本已存在或闭环可运行。本仓不运行夜跑闭环，也不安装 Stryker 或 mutmut；两个工具的接入与配置方法见[变异测试运营手册](../quality-gates/mutation-testing.md)。配套格式文档：基线文件 `.mutation-baseline.json` 与豁免文件 `.equivalent-mutants.json` 的细化定义同属夜跑闭环后续施工，落点 `docs/formats/`（现有雏形见运营手册 §1.3 与 §2）。

背景与依据：夜跑 agent 自动补强闭环（规划参考 issue #43），基于 #37（质检分层节奏）与 #42（变异测试运营手册）。

---

## 0. 快速上手

一份最小但完整的统一报告：

```json
{
  "tool": "stryker",
  "timestamp": "2026-10-05T18:30:00Z",
  "mutants": [
    {
      "id": "stryker-42",
      "file": "src/domain/pricing.ts",
      "line": 8,
      "column": 7,
      "mutationType": "ConditionalExpression",
      "original": "subtotalCents >= 100_00 || isMember",
      "mutated": "subtotalCents > 100_00 || isMember",
      "status": "Survived"
    }
  ]
}
```

要点：

- 顶层只有 `tool`、`timestamp`、`mutants` 三个字段，全部必填。
- 每个 mutant 恰好八个字段，全部必填、全部有值；工具缺失的信息按 §3 的兜底规则填充，不省略字段、不写 `null`。
- 夜跑管线当前只输出存活变异体（`status` 恒为 `"Survived"`），但 schema 保留全部状态（见 §5）。
- 报告文件名约定 `unified-mutation-report.json`；管线中间产物可加后缀（如 `unified-mutation-report.filtered.json`）。

生产者与消费者：

| 环节 | 角色 |
| --- | --- |
| `parse-stryker-report.mjs`（待实现） | 生产者：读 Stryker JSON 报告，写统一报告 |
| `parse_mutmut_report.py`（待实现） | 生产者：读 mutmut 结果，写统一报告 |
| `mutation-baseline.mjs`（待实现） | 消费者：可选，读报告做门槛比对 |
| 豁免过滤（待实现，位于 issue 创建脚本内） | 消费者：按 `.equivalent-mutants.json` 剔除已豁免变异体 |
| `create-mutation-issues.mjs`（待实现） | 消费者：按 `file` 分组，创建 GitHub issue 与 `.mutation-queue/*.json` |
| 补测 agent | 终端读者：读 `.mutation-queue/*.json` 生成针对性测试 |

## 1. 顶层结构

| 字段 | 类型 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `tool` | string | 是 | `"stryker"` 或 `"mutmut"`，闭合枚举 | 产生原始报告的变异测试工具。新增工具属于契约演进（§9） |
| `timestamp` | string | 是 | ISO-8601 UTC，`YYYY-MM-DDTHH:MM:SSZ` | 解析器写出本报告的时刻。由解析器生成，不取自原始报告 |
| `mutants` | array | 是 | 允许空数组 | 变异体列表，排序规则见 §3.5。**1.0 不含任何统计字段**（分数、killed/total 计数），分数类消费的边界见 §8 |

约束：

- `mutants` 为空数组是合法输出（全部被杀死、目标无变异体或全部被豁免时），生产者必须以退出码 0 正常写出，不得视为错误。
- 报告文件编码 UTF-8（无 BOM）、LF 换行、2 空格缩进、结尾一个换行符。
- 除本表三个字段外不得有其他顶层字段（schema `additionalProperties: false`）。

## 2. mutant 对象

| 字段 | 类型 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | `<tool>-<原生id或序号>`；报告内唯一 | 变异体标识。**只保证单次报告内唯一，不跨运行稳定**，禁止用作跨运行关联键（§3.1、§8） |
| `file` | string | 是 | 项目根相对 POSIX 路径 | 变异体所在源文件，规则见 §3.2 |
| `line` | integer | 是 | ≥ 1 | 变异体所在行，1-based（§3.3） |
| `column` | integer | 是 | ≥ 1 | `original` 首字符所在列，1-based（§3.3） |
| `mutationType` | string | 是 | 闭合枚举（§4） | 归一化后的变异类型 |
| `original` | string | 是 | 非空 | 被替换的原始源码片段 |
| `mutated` | string | 是 | 非空，且不等于 `original` | 替换后的源码片段 |
| `status` | string | 是 | 闭合枚举（§5） | 归一化后的判定状态；夜跑管线当前恒为 `"Survived"` |

- `original` 与 `mutated` 是语义配对：把 `original` 原位替换即得 `mutated`。提取规则见 §3.4。
- 所有字段都不得缺省：没有可用的真实值时按 §3 的兜底规则填一个确定值。

## 3. 归一化规则（生产者必须遵守）

两个解析器必须把各自工具的原生输出归一化到本节口径；换算正确性由解析器测试套件用固定样例验证。

### 3.1 id

- Stryker：`stryker-<Stryker 原生 mutant id>`。原生 id 无论数字还是字符串，统一转为字符串。
- mutmut：`mutmut-<序号>`。序号是解析器对本次存活变异体按 §3.5 排序后从 1 起数的序号。
- 格式约束：`<tool>-` 前缀加非空白字符（schema 用 `^(stryker|mutmut)-\S+$` 限制）。`id` 前缀必须与 `tool` 字段一致（`"stryker"` 配 `stryker-`，`"mutmut"` 配 `mutmut-`）；这是跨字段约束，schema 只限词形，一致性由解析器测试保证。
- **稳定性警告**：id 不保证跨运行相同（Stryker 的 id 随变异体集合变化，mutmut 的序号随结果集变化）。跨运行关联必须用 §8 的语义键，禁止用 id。

### 3.2 路径（file）

- 相对目标项目根目录，不以 `./` 或 `/` 开头。
- 一律用正斜杠 `/` 分隔，即使解析器运行在 Windows。
- 保留工具给出的原始大小写；消费者做精确字符串比较，不做大小写归一。

### 3.3 坐标（line / column）

- `line` 从 1 起数（文件第一行为 1）；`column` 从 1 起数（行内首字符为 1），指向 `original` 文本在该行的起始字符。
- 解析器负责把工具原生坐标换算到本口径（不同工具与不同版本的基准可能不同，以解析器测试样例为准）。
- mutmut 原生数据缺少可靠列号时：解析器按变异体在行内的实际位置计算；确实算不出时填 `1`，此时 `original` 通常就是整段被替换的运算符或关键字，字段仍然必须存在。
- `original` 跨多行时，`line` / `column` 指其首行首字符。

### 3.4 文本片段（original / mutated）

- `original`：源文件中真实存在、与坐标对应的**最小**被替换片段。禁止改写空白、禁止把整行截来当片段——除非工具原语本身就是整块（如 Stryker 的 `Block` 变异）。
- `mutated`：工具替换后的文本。Stryker 取报告的 replacement 字段；mutmut 取 `mutmut show` diff 中 `+` 行的内容并剥离 diff 前缀。
- 多行片段以 `\n` 连接，JSON 中按标准转义。
- 解析器运行时不要求逐字节校验 `original` 与源文件一致（性能考虑），但解析器测试必须覆盖一致性样例。

### 3.5 排序

`mutants` 数组按 `file` 升序（字节序），同一文件内按 `line`、`column` 升序。确定性排序使下游测试与 diff 稳定。

## 4. mutationType 枚举

闭合枚举，共 25 个值：StrykerJS 的 19 个 mutator 名称 + 为 Python 来源保留的 5 个通用类别 + `Unknown` 兜底。解析器不得自行发明新值。

| 统一值 | 来源与语义 |
| --- | --- |
| `ArithmeticOperator` | 算术运算符交换（`+ - * / % **` 等） |
| `ArrayDeclaration` | 数组声明变异（`[]` ↔ `[x]` 等） |
| `ArrowFunction` | 箭头函数体变异（JS） |
| `Block` | 语句块清空 |
| `BooleanLiteral` | 布尔字面量翻转（`true` ↔ `false`） |
| `ConditionalExpression` | 条件/三元表达式变异，含边界条件（`>` ↔ `>=`，架构示例口径） |
| `EqualityOperator` | 相等判断交换（`==` ↔ `!=`、`is` ↔ `is not`、`in` ↔ `not in`） |
| `LogicalOperator` | 逻辑连接词交换（`&&` ↔ `\|\|`、`and` ↔ `or`） |
| `MethodExpression` | 方法调用形式变异 |
| `MethodName` | 方法名变异 |
| `NegateCondition` | 条件取反 / `not` 删除 |
| `NumberLiteral` | 数字字面量变异 |
| `ObjectLiteral` | 对象字面量变异 |
| `OptionalChaining` | 可选链变异（JS） |
| `Regex` | 正则字面量变异 |
| `StringLiteral` | 字符串字面量清空/填充 |
| `SwitchStatement` | switch 分支变异 |
| `UnaryOperator` | 一元运算符变异（`+`/`-`/`!` 删除或翻转） |
| `UpdateOperator` | 自增自减变异（`++`/`--`，JS） |
| `BreakContinue` | `break` ↔ `continue`（Python 来源） |
| `ComparisonOperator` | 比较运算符交换（`<` ↔ `<=` 等，Python 来源） |
| `DecoratorRemoval` | 装饰器删除（Python 来源） |
| `KeywordArgument` | 参数默认值删除 / 关键字参数重排（Python 来源） |
| `KeywordLiteral` | `None`/`True`/`False` 单值常量交换（Python 来源） |
| `Unknown` | 无法归类的变异。兜底值 |

### 4.1 Stryker 归一化映射

StrykerJS 报告的 `mutatorName` 与统一值同名，直接透传（`Block` → `"Block"`、`ConditionalExpression` → `"ConditionalExpression"`……）。遇到枚举外的 mutator 名称时，写 `Unknown` 并向 stderr 打警告，不中断夜跑；若某名称反复出现，说明 Stryker 新增了 mutator，按 §9 扩充枚举。

### 4.2 mutmut 归一化映射

mutmut 没有公开稳定的机器可读变异类型标签，解析器按 `mutmut show` 的 diff 文本归类：

| mutmut 变异效果（diff 文本） | 统一值 |
| --- | --- |
| `==` ↔ `!=`、`is` ↔ `is not`、`in` ↔ `not in` | `EqualityOperator` |
| `<` ↔ `<=`、`>` ↔ `>=` | `ComparisonOperator` |
| `and` ↔ `or` | `LogicalOperator` |
| 删除 `not` | `NegateCondition` |
| `+ - * / // % **` 交换 | `ArithmeticOperator` |
| 一元 `+` / `-` | `UnaryOperator` |
| 数字字面量变化 | `NumberLiteral` |
| 字符串字面量变化 | `StringLiteral` |
| `break` ↔ `continue` | `BreakContinue` |
| `None` ↔ `True` ↔ `False` | `KeywordLiteral` |
| 删除默认参数 / 关键字参数重排 | `KeywordArgument` |
| 删除装饰器 | `DecoratorRemoval` |
| 语句块清空（`pass` 注入等） | `Block` |
| 其余 / 无法判定 | `Unknown` |

同一 diff 命中多行时按上表顺序取第一个命中类别；全不中写 `Unknown`（配合 §4.1 的 stderr 警告）。

## 5. status 枚举与归一化

统一枚举，共 10 个值：`Survived`、`Killed`、`Timeout`、`Suspicious`、`NoCoverage`、`CompileError`、`RuntimeError`、`Ignored`、`Skipped`、`Pending`。

### 5.1 Stryker 归一化映射（透传）

| Stryker 状态 | 统一值 | 含义（出自官方 mutant states 文档） |
| --- | --- | --- |
| `Pending` | `Pending` | 已生成、未运行 |
| `Killed` | `Killed` | 至少一个测试在该变异体下失败 |
| `Survived` | `Survived` | 全部测试通过，测试缺口 |
| `NoCoverage` | `NoCoverage` | 无测试覆盖到（官方页面写作 "No coverage"，JSON 报告用驼峰词，透传） |
| `Timeout` | `Timeout` | 测试在该变异体下超时（计为已检测） |
| `RuntimeError` | `RuntimeError` | 运行时错误（官方 "Runtime error"） |
| `CompileError` | `CompileError` | 编译错误（官方 "Compile error"） |
| `Ignored` | `Ignored` | 被配置忽略，未测试 |

### 5.2 mutmut 归一化映射

解析器按 `mutmut results` 状态词（大小写不敏感）匹配：

| mutmut 状态 | 统一值 | 说明 |
| --- | --- | --- |
| `killed` | `Killed` | |
| `survived` | `Survived` | |
| `timeout` | `Timeout` | |
| `suspicious` | `Suspicious` | 测试显著变慢但未超时，疑似死循环 |
| `skipped` | `Skipped` | |
| `no tests` | `NoCoverage` | 无测试覆盖到而未运行，语义等同 Stryker 的 NoCoverage |
| `not checked` | `Pending` | 生成但未检查 |
| `excluded` | `Ignored` | 配置排除，语义等同 Ignored |

### 5.3 管线约定

- 夜跑闭环当前**只提取存活变异体**：正常输出的统一报告中 `status` 恒为 `"Survived"`。
- schema 保留全部状态，是为了将来输出全量报告时无需改字段结构。
- 消费者**必须**按 `status === "Survived"` 过滤，不得假设数组里全是存活者。
- 解析器遇到上表之外的未知状态时必须报错退出（退出码 1，stderr 写明来源值），不得猜测归一：状态语义影响分数与门槛判断，宁缺勿错。

## 6. JSON Schema

以下 JSON Schema（draft-07）是本契约的一部分，可直接供带 schema 校验器的项目使用；正文与 schema 冲突时以正文为准并修正 schema。本仓工具保持零依赖，测试按正文约束手写断言，不引入 schema 库。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Unified Mutation Report",
  "description": "夜跑变异测试闭环统一变异体报告契约 v1.0，正文见 docs/formats/unified-mutation-report.md",
  "type": "object",
  "additionalProperties": false,
  "required": ["tool", "timestamp", "mutants"],
  "properties": {
    "tool": {
      "type": "string",
      "enum": ["stryker", "mutmut"],
      "description": "产生原始报告的变异测试工具，闭合枚举"
    },
    "timestamp": {
      "type": "string",
      "description": "解析器写出报告的 UTC 时刻，YYYY-MM-DDTHH:MM:SSZ",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"
    },
    "mutants": {
      "type": "array",
      "description": "变异体列表；夜跑管线当前只含 Survived；允许空数组；排序见正文 §3.5",
      "items": { "$ref": "#/definitions/mutant" }
    }
  },
  "definitions": {
    "mutant": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "file", "line", "column", "mutationType", "original", "mutated", "status"],
      "properties": {
        "id": {
          "type": "string",
          "description": "报告内唯一；<tool>-<原生id或序号>；不跨运行稳定",
          "pattern": "^(stryker|mutmut)-\\S+$"
        },
        "file": {
          "type": "string",
          "minLength": 1,
          "description": "项目根相对 POSIX 路径，正斜杠分隔，不以 ./ 开头，保留原大小写",
          "pattern": "^[^\\\\]+$",
          "not": { "pattern": "^\\./" }
        },
        "line": {
          "type": "integer",
          "minimum": 1,
          "description": "1-based 行号"
        },
        "column": {
          "type": "integer",
          "minimum": 1,
          "description": "1-based 列号，指向 original 首字符"
        },
        "mutationType": {
          "type": "string",
          "description": "闭合枚举，见正文 §4；无法归类时用 Unknown",
          "enum": [
            "ArithmeticOperator",
            "ArrayDeclaration",
            "ArrowFunction",
            "Block",
            "BooleanLiteral",
            "ConditionalExpression",
            "EqualityOperator",
            "LogicalOperator",
            "MethodExpression",
            "MethodName",
            "NegateCondition",
            "NumberLiteral",
            "ObjectLiteral",
            "OptionalChaining",
            "Regex",
            "StringLiteral",
            "SwitchStatement",
            "UnaryOperator",
            "UpdateOperator",
            "BreakContinue",
            "ComparisonOperator",
            "DecoratorRemoval",
            "KeywordArgument",
            "KeywordLiteral",
            "Unknown"
          ]
        },
        "original": {
          "type": "string",
          "minLength": 1,
          "description": "被替换的原始源码片段"
        },
        "mutated": {
          "type": "string",
          "minLength": 1,
          "description": "替换后的源码片段，必须与 original 不同"
        },
        "status": {
          "type": "string",
          "description": "闭合枚举，见正文 §5；夜跑管线当前恒为 Survived",
          "enum": [
            "Survived",
            "Killed",
            "Timeout",
            "Suspicious",
            "NoCoverage",
            "CompileError",
            "RuntimeError",
            "Ignored",
            "Skipped",
            "Pending"
          ]
        }
      }
    }
  }
}
```

## 7. 完整示例

两个示例都是可直接 `JSON.parse` 的完整报告，并满足 §6 的 schema。

### 7.1 Stryker（TypeScript 项目）

源码样例对应[运营手册 §3.3](../quality-gates/mutation-testing.md) 的运费计算函数：

```json
{
  "tool": "stryker",
  "timestamp": "2026-10-05T18:30:00Z",
  "mutants": [
    {
      "id": "stryker-42",
      "file": "src/domain/pricing.ts",
      "line": 8,
      "column": 7,
      "mutationType": "ConditionalExpression",
      "original": "subtotalCents >= 100_00 || isMember",
      "mutated": "subtotalCents > 100_00 || isMember",
      "status": "Survived"
    },
    {
      "id": "stryker-57",
      "file": "src/domain/pricing.ts",
      "line": 15,
      "column": 5,
      "mutationType": "ArithmeticOperator",
      "original": "fee += 300",
      "mutated": "fee -= 300",
      "status": "Survived"
    },
    {
      "id": "stryker-63",
      "file": "src/services/cart.ts",
      "line": 23,
      "column": 12,
      "mutationType": "StringLiteral",
      "original": "\"empty\"",
      "mutated": "\"\"",
      "status": "Survived"
    }
  ]
}
```

- 第 1 条：边界条件变异，`>=` 收紧为 `>`，会员免邮门槛测试未覆盖。
- 第 2 条：算术变异，加 300 变减 300，小额附加费无断言。
- 第 3 条：字符串清空变异，`"empty"` 变 `""`，展示文案类测试缺口。

### 7.2 mutmut（Python 项目）

```json
{
  "tool": "mutmut",
  "timestamp": "2026-10-05T18:45:00Z",
  "mutants": [
    {
      "id": "mutmut-7",
      "file": "src/domain/pricing.py",
      "line": 4,
      "column": 8,
      "mutationType": "ComparisonOperator",
      "original": "<=",
      "mutated": "<",
      "status": "Survived"
    },
    {
      "id": "mutmut-12",
      "file": "src/services/cart.py",
      "line": 23,
      "column": 9,
      "mutationType": "LogicalOperator",
      "original": "and",
      "mutated": "or",
      "status": "Survived"
    },
    {
      "id": "mutmut-15",
      "file": "src/adapters/cli.py",
      "line": 31,
      "column": 5,
      "mutationType": "KeywordLiteral",
      "original": "None",
      "mutated": "True",
      "status": "Survived"
    }
  ]
}
```

- 第 1 条：比较运算符交换（`<=` → `<`），边界值 0 的测试缺失。
- 第 2 条：逻辑连接词交换（`and` → `or`），组合条件无断言。
- 第 3 条：单值常量交换（`None` → `True`），默认返回值未被验证。

## 8. 消费者约定

- **豁免过滤**：豁免条目与报告变异体的匹配键是 `file + line + mutationType`（语义三元组，精确定义见 [equivalent-mutants.md](./equivalent-mutants.md) §4）。id 不参与匹配（§3.1）。命中的变异体从报告中剔除后才进入 issue 创建。
- **门槛检查**：统一报告只含存活变异体且无统计字段，1.0 **不能**直接算出变异分数（需要 killed/total）。baseline 工具 `mutation-baseline.mjs` 的分数数据源（读工具原生报告，或将来经 §9 扩展统一报告）由该工具的施工票确定；本文档不预留统计字段。
- **issue 创建**：按 `file` 精确分组（大小写敏感），每组生成一个人读 issue 与一个机读 JSON（`.mutation-queue/` 下）。机读 JSON 可复用 mutant 对象的字段子集；issue 与 queue 文件的具体格式由 `create-mutation-issues.mjs` 的施工票定义，不在本契约内。
- **补测 agent**：读 issue 附带的 JSON（含 `file`、`line`、`mutationType`、`original`、`mutated`）即可生成针对性测试，无需读统一报告全文。

## 9. 演进规则

1. 契约版本记录在本文档头部。**1.0 期间只允许向后兼容的增量**：新增字段必须可被旧消费者忽略；闭合枚举新增值必须先更新本文档与 §6 schema，再升 minor 版本（如 1.1）。
2. 禁止重命名既有字段或改变其类型；需要不兼容变更时引入顶层版本字段、升大版本，并在本文档保留迁移说明。
3. 新增来源工具（如 Stryker4s）：新增 `tool` 枚举值，并在 §3、§4、§5 各补一张归一化映射表，升 minor 版本。
4. 本文档是格式的唯一权威；解析器、测试与示例与本文冲突时，改实现与示例，不改契约语义——语义变更走本节流程。

## 参考

- [变异测试运营手册](../quality-gates/mutation-testing.md)：阈值冻结、等价豁免与胶水边界，本格式服务的上游策略。
- [CRAP 计算器](../../scripts/calculate_crap.mjs)：本仓 CLI 工具结构参考。
- StrykerJS 配置与 mutator 清单：<https://stryker-mutator.io/docs/stryker-js/configuration/>
- Stryker mutant 状态与指标：<https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/>
- mutmut 官方文档：<https://mutmut.readthedocs.io/en/latest/>
