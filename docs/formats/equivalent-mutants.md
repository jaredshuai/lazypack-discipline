# 等价变异体豁免文件格式（Equivalent Mutants File Format）

本文档定义夜跑变异测试闭环中「等价变异体豁免文件」`.equivalent-mutants.json` 的 JSON 契约。豁免文件记录经人工审查判定为等价的变异体（**等价变异体**：变异改变了代码文本，但在所有可达输入下行为与原代码完全一致，定义见[变异测试运营手册](../quality-gates/mutation-testing.md) §2.1），夜跑管线据此把它们从存活报告中剔除，不再转化为补测 issue。它把运营手册 §2.4 的非正式记录格式细化为可校验的契约：每条豁免用 `file + line + mutationType` 三元组精确定位变异体，用必填的 `reason` 留下可检验的等价论证，用 `exemptedBy` / `exemptedAt` / `reviewRequired` 留下审查留痕。

**契约版本**：1.0（演进规则见 §10）。

**状态与边界**：本文档先于实现冻结契约。文中提到的豁免过滤位于 issue 创建脚本（`scripts/create-mutation-issues.mjs`）内部，属夜跑闭环后续施工范围，落地之前本文档只是契约，不表示豁免已自动生效。本仓不运行夜跑闭环，也不安装 Stryker 或 mutmut；识别、审查、记录的人工流程与决策树见[变异测试运营手册](../quality-gates/mutation-testing.md) §2。

与运营手册 §2.4 的关系：手册里那份记录格式（`mutantId`/`operator`/`reviewedBy`/`date` 字段、顶层数组）是解释豁免流程时的非正式示意，**不是**本契约；夜跑闭环读写的 `.equivalent-mutants.json` 以本文档为准。字段对应关系：

| 手册 §2.4 字段 | 本契约字段 | 变化 |
| --- | --- | --- |
| （无） | `version`（顶层） | 新增：契约版本 |
| （顶层数组） | `exemptions`（顶层） | 数组移入顶层 `exemptions` 字段 |
| `mutantId` | `id` | 工具原生标识换成 `equiv-` 前缀的记录号；工具 id 跨运行不稳定（[统一格式文档 §3.1](unified-mutation-report.md)），不得作为跨运行键 |
| `file` / `line` | `file` / `line` | 含义不变；路径收紧为项目根相对 POSIX 路径 |
| `operator` | `mutationType` | 工具原生名称换成统一枚举（[统一格式文档 §4](unified-mutation-report.md)） |
| `reason` | `reason` | 必填不变；本文档 §5 给出可检验论证的结构要求 |
| `reviewedBy` | `exemptedBy` | 语义相同，口径见 §3.6 |
| `date` | `exemptedAt` | `YYYY-MM-DD` 升级为 ISO-8601 UTC 全时刻 |
| （无） | `reviewRequired` | 新增：待复核标记（§3.8） |

背景与依据：夜跑 agent 自动补强闭环（规划参考 issue #43），基于 #37（质检分层节奏）与 #42（变异测试运营手册）。

---

## 0. 快速上手

一份最小但完整的豁免文件：

```json
{
  "version": "1.0",
  "exemptions": [
    {
      "id": "equiv-001",
      "file": "src/services/feature-flags.ts",
      "line": 17,
      "mutationType": "EqualityOperator",
      "reason": "构建常量 DEBUG 恒为 true（构建脚本注入，见 build/define.ts），`DEBUG || (env === 'test')` 左侧析取支配整体，右侧 `===` 与 `!==` 的任何变异都不改变条件结果。若 DEBUG 改为运行时可变，本条目须重审。",
      "exemptedBy": "alice",
      "exemptedAt": "2026-10-12T10:20:00Z",
      "reviewRequired": false
    }
  ]
}
```

要点：

- 顶层只有 `version`、`exemptions` 两个字段，全部必填。
- 每个 exemption 恰好八个字段，全部必填、全部显式写值；没有可选字段，也没有默认值（§3）。
- `exemptions` 允许空数组：没有等价变异体的项目，文件照常存在（§2）。
- 文件固定放在**目标项目根目录**、纳入版本库，由人经代码评审写入；工具不得自动生成或改写（§1）。
- 消费者读到未知 `version` 必须报错退出，不得猜测兼容（§2、§9）。

生产者与消费者：

| 环节 | 角色 |
| --- | --- |
| 等价审查（识别 → 审查 → 记录，[运营手册 §2.2](../quality-gates/mutation-testing.md)） | 生产者：人工判定等价后，把条目写入本文件并随代码评审提交 |
| 豁免过滤（待实现，位于 `create-mutation-issues.mjs` 内） | 消费者：按三元组匹配，把命中的变异体从统一报告中剔除 |
| `mutation-baseline.mjs`（待实现） | 间接相关：豁免改变分数后按棘轮固化（[基线文档 §5.3](mutation-baseline.md)） |
| 补测 agent | 不读本文件：被豁免的变异体不会出现在 issue 与 `.mutation-queue/*.json` 中 |

## 1. 文件位置与通用约定

- 文件名固定 `.equivalent-mutants.json`，放在**目标项目的根目录**（与 `package.json`、`pyproject.toml` 平级），与 `.mutation-baseline.json` 平级。它不在本仓内——是用户项目文件，本仓只提供格式契约。
- **必须纳入版本库**：豁免是团队的共同判定，价值来自跨提交、跨成员可见与可追溯；把文件加进 `.gitignore` 等于放弃留痕。条目增删随对应改动的 PR 一并评审提交。
- **唯一的写入者是人**（经代码评审）。与基线文件不同（`mutation-baseline.mjs` 的 init/update 会写盘），夜跑管线中没有任何工具自动生成或改写豁免文件；脚本发现可疑条目（如长期无命中的陈旧条目）时只报告，不代改。
- 不要放进工具状态目录：Stryker 的 `.stryker-tmp/` 是每次运行后清空的沙箱，mutmut 3 的 `mutants/` 是缓存目录，放进去等于丢记录（同[运营手册 §2.2 位置约定](../quality-gates/mutation-testing.md)）。
- 文件编码 UTF-8（无 BOM）、LF 换行、2 空格缩进、结尾一个换行符。
- 除本契约字段外不得有其他字段（schema `additionalProperties: false`）。

## 2. 顶层结构

| 字段 | 类型 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `version` | string | 是 | 闭合枚举，当前仅 `"1.0"` | 本文件遵循的契约版本。消费者读到枚举外的值必须报错退出（用户错误），不得猜测兼容 |
| `exemptions` | array | 是 | 允许空数组 | 豁免条目列表 |

约束：

- `exemptions` 为空数组是合法状态（新项目，或全部豁免已清理），消费工具必须正常处理，不得视为错误。
- 排序：按 `file` 升序（字节序），同一文件按 `line` 升序，再按 `mutationType` 字母序，最后按 `id` 升序。确定性排序让评审 diff 稳定；匹配语义与数组顺序无关（§4.3）。
- `id` 在文件内唯一、删除条目后不得复用（§3.1）。这是跨字段约束，schema 无法表达，由评审与消费工具的测试保证。

## 3. exemption 对象

| 字段 | 类型 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | `equiv-` 前缀加至少三位数字；文件内唯一；删除后不复用 | 豁免条目记录号（§3.1） |
| `file` | string | 是 | 项目根相对 POSIX 路径 | 变异体所在源文件（§3.2） |
| `line` | integer | 是 | ≥ 1 | 变异体所在行，1-based（§3.3） |
| `mutationType` | string | 是 | 闭合枚举，25 个值 | 归一化后的变异类型，与统一报告同枚举（§3.4） |
| `reason` | string | 是 | 非空；可检验论证 | 为什么等价，质量要求见 §5 |
| `exemptedBy` | string | 是 | 非空 | 当前判定的责任人（§3.6） |
| `exemptedAt` | string | 是 | ISO-8601 UTC，`YYYY-MM-DDTHH:MM:SSZ` | 判定写盘时刻（§3.7） |
| `reviewRequired` | boolean | 是 | — | 待复核标记；不影响过滤行为（§3.8） |

所有字段都不得缺省：豁免是人工做出的明确判定，半成品条目没有价值。

### 3.1 id

- 形如 `equiv-001`、`equiv-002`：前缀 `equiv-` 加至少三位数字（超出 999 自然进位为四位）。评审讨论、提交说明与 issue 引用条目时用这个号（如「豁免 equiv-003 随本 PR 重审」）。
- 在文件内唯一；**删除条目后其 id 不得复用**，下一个新条目取当前最大序号加一——豁免留痕的价值在 git 历史，复用号会让历史引用指向错误的条目。
- id 不承载与变异体的对应关系（那是三元组的事，§4），只承载「这条豁免记录」的身份。

### 3.2 file（路径）

- 相对目标项目根目录，不以 `./` 或 `/` 开头，一律用正斜杠 `/` 分隔，保留原始大小写。口径与[统一格式文档 §3.2](unified-mutation-report.md) 一致，消费者做精确字符串比较，不做大小写归一。

### 3.3 line（行号）

- 1-based：文件第一行为 1，与[统一格式文档 §3.3](unified-mutation-report.md) 同口径；`original` 片段跨多行时取其首行。
- **来源警告**：优先从统一报告的 mutant 对象复制 `file` / `line` / `mutationType`（解析器已完成归一化）。直接从工具原生报告取数时注意坐标系口径——Stryker JSON 报告（schema v1.0）的坐标已是 1-based，与统一报告同口径、可直接复制（工具内部 0-based 坐标在写报告前已 +1），但从 Stryker 内部 API 等 0-based 来源取数则须先换算；差一行会让三元组永远匹配不上（症状是「明明写了豁免，issue 里还是出现这个变异体」）。

### 3.4 mutationType

- 必须取[统一格式文档 §4](unified-mutation-report.md) 的 25 值闭合枚举（如 `EqualityOperator`、`ConditionalExpression`、`Block`），不得写工具原生名称（如 Stryker 的 mutator 原名与枚举同名时恰好一致，mutmut 的则必须归一）。语义与归一化映射以该文档 §4 为权威。
- 配置级豁免条目（§6.2）记**触发判定的那个变异体**的类型；配置本身排除的其余变异体不会进入统一报告，无须（也无法）逐条登记。

### 3.5 reason

必填。写什么、怎么写才算合格，见 §5——这是本契约对留痕质量的核心要求。

### 3.6 exemptedBy

- 当前这条等价**判定的责任人**的标识（git 用户名、PR 句柄等团队通用标识）。
- 初判时是初判人；`reviewRequired: true` 的条目被复核确认时，复核者接管判定，应把 `exemptedBy` 与 `exemptedAt` 更新为自己与复核时刻（§3.8、§6.3）；重审确认同理。前任记录人的名字在 git 历史里，不丢失。

### 3.7 exemptedAt

- ISO-8601 UTC 全时刻，`YYYY-MM-DDTHH:MM:SSZ`。由记录人在把判定写入条目时生成，不取自变异测试报告。
- 与基线文件的 `updated` 一样，这是「记录级」事实：对应的变异测试运行可能发生在更早时间。

### 3.8 reviewRequired

- `false`：已定案。论证完备、（如经复核）判定生效；条目本身不再需要动作。后续重审仍由 reason 的失效条件与 §6.3 的变更触发规则负责。
- `true`：待复核。三种典型情形：
  1. **配置级豁免**（§6.2）——豁免的是一个模式而非单个变异体，需要持续跟踪；
  2. **需要第二人确认**——记录人已给出论证，但按团队流程需复核后定案；
  3. **论证依赖的外部条件尚未核实**——如上游校验的存在性还没查证。
- **不影响过滤行为**：`reviewRequired: true` 的条目照常参与匹配与剔除（§9）。它是流程提醒，不是过滤开关——把待复核的变异体放回 issue 队列只会让同一变异体在复核完成前反复生成噪音 issue。
- 复核提醒目前依赖评审流程（每次清理轮先处理 `true` 条目，§6.3），不依赖工具自动化。

## 4. 精确定位与匹配规则

### 4.1 定位三元组

一条豁免通过 **`file + line + mutationType`** 三元组精确标识它豁免的变异体：

- `file` 回答「哪个文件」，`line` 回答「哪一行」，`mutationType` 回答「什么样的变异」。
- 这三个字段同时是**豁免过滤的匹配键**：统一报告中的变异体，当且仅当其 `(file, line, mutationType)` 与某条豁免的三元组完全相等时被剔除。
- 从统一报告记录条目时直接复制这三个字段即可；从工具界面审查时，按 §3.3 的坐标系警告换算行号、按统一格式文档 §4 归一类型名。

### 4.2 为什么不是 id，也不是 column

- **不用工具 id**：统一报告的 mutant id 只保证单次报告内唯一，不跨运行稳定（[统一格式文档 §3.1](unified-mutation-report.md)）；豁免文件是长期存在的，用 id 做键会让条目在下一轮夜跑后集体失配。运营手册 §2.4 旧格式的 `mutantId` 因此被替换。
- **不用 column**：列号在变异体所在行之前的任何编辑（哪怕只是加一个空格）后都会漂移，长期文件里用它匹配极度脆弱；同一行内区分多个同类型变异体的需求由 §4.4 的碰撞规则承担，而不是靠记录一个必然过期的列号。

### 4.3 匹配语义

- `file`：字节级精确字符串比较（大小写敏感，POSIX 路径）。
- `line`：整数相等。
- `mutationType`：枚举值相等。
- 三者同时相等才算命中；豁免条目的数组顺序不影响匹配结果。

### 4.4 同一三元组对应多条变异体（碰撞）

同一文件同一行可能出现多条**同类型**变异体（如一行链式算式中两个独立的 `ArithmeticOperator` 变异），它们共享一个三元组。约定：

- **命中即全部豁免**：只要三元组有登记条目，该位置该类型的所有存活变异体一并剔除。
- 因此**审查必须覆盖该位置的全部同类型变异体**：逐个确认等价后才能记条目。若其中一个不是等价体（是测试缺口），先按[运营手册 §2.3 决策树](../quality-gates/mutation-testing.md)处置它（补测试或重构），再记录豁免；拿不准时整组不豁免。
- 确实需要区分同位置同类型的两条变异体时，把表达式拆行或重构成各自独立的语句——这同时让两条变异体获得不同的三元组。这也是把「一行塞太多逻辑」当成重构信号的直接理由。

### 4.5 失配条目（陈旧条目）

- 变异体被测试杀死、代码被删除或重构挪位后，既有条目会匹配不到任何变异体。过滤器对失配条目**不报错、不警告逐条输出**（是否有陈旧条目属于运行摘要，由 issue 创建脚本的施工票决定）。
- 条目清理是人工职责，流程见 §6.3。

### 4.6 重复三元组

两条豁免登记了同一三元组属于登记冗余（评审应合并为一条）；过滤器命中任一即剔除，行为不变。

### 4.7 与统一报告 §8 的关系

[统一格式文档 §8](unified-mutation-report.md) 把豁免匹配键写作 `file + line + mutationType + original`。本契约的豁免条目按架构**不含 `original` 字段**，匹配键是三元组，以本节为准。`original` 不进入匹配键的理由：同一行内同类型的多条变异体，其 `original` 片段往往完全相同（如两个独立的 `+` 运算符的 original 都是 `"+"`），加上它并不能消除 §4.4 的碰撞；而把报告原文复制进长期维护的豁免文件，会让条目因格式化、空白调整这类无损改动而失配。统一报告文档演进时应同步该句表述（已登记为待办，见 ARTIFACTS 当轮说明）。

## 5. reason 的必填要求

`reason` 是豁免留痕的核心：它必须让**没有参与当时审查的人**能够检验这个判定，或至少知道从哪里开始检验。

### 5.1 可检验论证的三种类型

reason 必须落到以下至少一种可检验的论证上（与[运营手册 §2.2 审查标准](../quality-gates/mutation-testing.md)一致）：

1. **数学恒等 / 支配关系**：变异落在被其他子句支配的位置，结果不变。例：§0 快速上手条目——`DEBUG` 恒为 `true` 时，`||` 右侧的任何变异都不影响整体。
2. **代码不变式**：某个在别处建立、此处依赖的事实保证变异前后行为一致。例：「上游入口校验保证 `subtotalCents > 0`，此处的 `<=` 与 `<` 在运行时不可区分」。论证应点名不变式在哪里建立（文件、校验函数、schema）。
3. **不可达性**：变异所在分支或语句在任何输入下都不执行。例：穷尽联合类型的 `switch` 的 `default` 臂；常量折叠后的死分支。

### 5.2 建议结构

一条合格的建议按三段组织：

```text
现象：什么位置的什么变异（通常可由三元组带出，reason 里点到关键表达式即可）。
论证：为什么任何输入下变异前后行为一致（§5.1 三选一，点名依据所在）。
失效条件：什么变化会使论证不再成立（届时须重审，§6.3）。
```

### 5.3 不接受的写法

| 反例 | 为什么不合格 |
| --- | --- |
| 「看起来等价」 | 没有论证，无法检验 |
| 「测试以后补」 | 承认了行为会变，这是测试缺口，该走补测试流程 |
| 「历史遗留，一直这样」 | 与「过去没人杀它」无关，等价与否只看行为 |
| 「太复杂，说不清」 | 说不清就是没审完，记 `reviewRequired: true` 交第二人 |

### 5.4 reason 与 reviewRequired 的关系

- 论证完备且依据稳定（恒等式、类型系统保证）→ `reviewRequired: false`。
- 论证依赖易变的外部条件（上游校验、配置常量、尚未核实的事实），或按流程需第二人确认 → `reviewRequired: true`，reason 里写明缺什么。
- 失效条件总是要写——它与 `reviewRequired` 无关：`false` 的条目同样可能因代码演进失效。

## 6. 豁免工作流（示例）

### 6.1 个案豁免：从存活变异体到下一轮过滤

场景：夜跑报告列出 `src/services/feature-flags.ts` 第 17 行的 `EqualityOperator` 存活变异体（`===` → `!==`）。

1. **识别**：变异体出现在存活清单（统一报告 / issue），测试全绿、非超时非编译错误，进入审查（[运营手册 §2.2 步骤 1](../quality-gates/mutation-testing.md)）。
2. **审查**：打开 diff，走[决策树 Q2](../quality-gates/mutation-testing.md)：存在使行为改变的输入吗？论证：该行条件为 `DEBUG || (env === 'test')`，`DEBUG` 是构建期注入的常量 `true`，左侧支配整体——没有这样的输入。判定等价。
3. **记录**：在 `.equivalent-mutants.json` 增加条目（§0 示例即本例）：`file` / `line` / `mutationType` 从统一报告复制，`reason` 按 §5.2 写，`exemptedBy: "alice"`，`exemptedAt` 为记录时刻，`reviewRequired: false`。
4. **提交**：条目随 PR 评审合入，提交说明引用 `equiv-001`，reviewer 依 §5 检验论证。
5. **下一轮夜跑**：过滤器按三元组命中并剔除该变异体，它不再生成 issue 与 `.mutation-queue/*.json`（§8.3 有逐步演示）。
6. **固化**：剔除使分数上升，跑一次完整运行确认后 `node scripts/mutation-baseline.mjs update --input reports/mutation/mutation.json --lang ts` 上调门槛（[基线文档 §5.3](mutation-baseline.md)），棘轮不回落。

### 6.2 配置级豁免：系统性模式（决策树 Q3）

场景：审查发现 `src/domain/tree.ts` 里每个 `OptionalChaining` 变异都存活且等价——模块入口 `buildTree` 保证子节点已规范化，`?.` 的空值短路在该模块不可达。这是[决策树 Q3](../quality-gates/mutation-testing.md) 的系统性模式，处置是**配置豁免 + 登记一条留痕**：

1. 工具配置按手册 Q3 排除该操作符并限定范围（Stryker：`mutator.excludedMutations` + `mutate` 限定；mutmut：`do_not_mutate_patterns`），配置改动随 PR 评审。
2. 在豁免文件登记触发判定的那个变异体：

```json
{
  "id": "equiv-002",
  "file": "src/domain/tree.ts",
  "line": 12,
  "mutationType": "OptionalChaining",
  "reason": "配置豁免：该模块 OptionalChaining 变异系统性等价（入口 buildTree 保证节点非空，`?.` 短路不可达），已按运营手册 §2.3 Q3 在 stryker.config.json 排除该操作符并用 mutate 限定范围。若该模块再出现存活的 OptionalChaining 变异，或 buildTree 的规范化保证被移除，本条目须重审。",
  "exemptedBy": "carol",
  "exemptedAt": "2026-10-13T09:00:00Z",
  "reviewRequired": true
}
```

3. 为什么配置已排除还要记条目：配置只改变工具行为，不留「为什么这里不测」的答案；这条登记就是答案，`reviewRequired: true` 让它进入每次清理轮的必查清单（§3.8）。注意该条目的三元组只匹配触发判定的那条变异体；其余同类变异体由配置排除，本就不会进入统一报告。

### 6.3 重审与清理

**触发重审**：

- reason 写明的失效条件成立（不变式被移除、常量改为可变、联合类型扩展等）。
- 相关代码被修改——凡判定等价的条目，在相关代码被修改后必须重新审查（[运营手册 §2.3 末段](../quality-gates/mutation-testing.md)）。
- `reviewRequired: true` 的条目在每次清理轮必须先处理。

**处置**：

- **不再等价**：删除条目，回到[决策树 Q2](../quality-gates/mutation-testing.md) 补测试杀死该变异体；同时删条目会让分数上升，照常走棘轮 `update`。
- **仍然等价**：刷新条目——`exemptedBy` / `exemptedAt` 更新为重审人与重审时刻（历史在 git 里），reason 若有更简的论证则顺手改写。
- **陈旧条目**（长期无命中：变异体已被杀死或代码已删）：直接删除。建议每轮豁免评审顺带核对一遍存量条目。
- 删除条目后其 `id` 不复用（§3.1）。

## 7. JSON Schema

以下 JSON Schema（draft-07）是本契约的一部分，可直接供带 schema 校验器的项目使用；正文与 schema 冲突时以正文为准并修正 schema。本仓工具保持零依赖，测试按正文约束手写断言，不引入 schema 库。`id` 唯一性、不复用与数组排序是跨条目约束，schema 无法表达，由评审与消费工具的测试保证（§2）。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Equivalent Mutants",
  "description": "夜跑变异测试闭环等价变异体豁免文件契约 v1.0，正文见 docs/formats/equivalent-mutants.md",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "exemptions"],
  "properties": {
    "version": {
      "type": "string",
      "enum": ["1.0"],
      "description": "本文件遵循的契约版本；消费者读到枚举外的值必须报错退出"
    },
    "exemptions": {
      "type": "array",
      "description": "豁免条目列表；允许空数组；排序见正文 §2",
      "items": { "$ref": "#/definitions/exemption" }
    }
  },
  "definitions": {
    "exemption": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "file", "line", "mutationType", "reason", "exemptedBy", "exemptedAt", "reviewRequired"],
      "properties": {
        "id": {
          "type": "string",
          "description": "文件内唯一的记录号；删除条目后 id 不得复用",
          "pattern": "^equiv-[0-9]{3,}$"
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
          "description": "1-based 行号，指向被豁免变异体所在行"
        },
        "mutationType": {
          "type": "string",
          "description": "闭合枚举，语义见统一格式文档 §4；配置级豁免记触发变异体的类型",
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
        "reason": {
          "type": "string",
          "minLength": 1,
          "description": "可检验的等价论证，结构要求见正文 §5"
        },
        "exemptedBy": {
          "type": "string",
          "minLength": 1,
          "description": "当前判定的责任人标识；复核或重审接管时更新"
        },
        "exemptedAt": {
          "type": "string",
          "description": "判定写盘的 UTC 时刻，YYYY-MM-DDTHH:MM:SSZ",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"
        },
        "reviewRequired": {
          "type": "boolean",
          "description": "true 表示待复核（配置豁免、需第二人确认、外部条件未核实）；不影响过滤行为，见正文 §3.8"
        }
      }
    }
  }
}
```

## 8. 完整示例

以下示例都是可直接 `JSON.parse` 的完整文件，并满足 §7 的 schema。

### 8.1 两个条目（reviewRequired 两种取值）

```json
{
  "version": "1.0",
  "exemptions": [
    {
      "id": "equiv-001",
      "file": "src/services/feature-flags.ts",
      "line": 17,
      "mutationType": "EqualityOperator",
      "reason": "构建常量 DEBUG 恒为 true（构建脚本注入，见 build/define.ts），`DEBUG || (env === 'test')` 左侧析取支配整体，右侧 `===` 与 `!==` 的任何变异都不改变条件结果。若 DEBUG 改为运行时可变，本条目须重审。",
      "exemptedBy": "alice",
      "exemptedAt": "2026-10-12T10:20:00Z",
      "reviewRequired": false
    },
    {
      "id": "equiv-002",
      "file": "src/domain/tree.ts",
      "line": 12,
      "mutationType": "OptionalChaining",
      "reason": "配置豁免：该模块 OptionalChaining 变异系统性等价（入口 buildTree 保证节点非空，`?.` 短路不可达），已按运营手册 §2.3 Q3 在 stryker.config.json 排除该操作符并用 mutate 限定范围。若该模块再出现存活的 OptionalChaining 变异，或 buildTree 的规范化保证被移除，本条目须重审。",
      "exemptedBy": "carol",
      "exemptedAt": "2026-10-13T09:00:00Z",
      "reviewRequired": true
    }
  ]
}
```

- `equiv-001`：个案豁免，论证完备，已定案（§6.1）。
- `equiv-002`：配置级豁免，`reviewRequired: true`，进入每轮清理轮必查清单（§6.2）。
- 排序符合 §2：`src/domain/tree.ts` 按字节序排在 `src/services/feature-flags.ts` 之前。

### 8.2 空清单

```json
{
  "version": "1.0",
  "exemptions": []
}
```

新项目起步或全部豁免已清理时的合法状态；消费工具必须正常处理（§2）。

### 8.3 过滤演示

给定统一报告（节选，字段结构见[统一格式文档 §7.1](unified-mutation-report.md)）：

```json
{
  "tool": "stryker",
  "timestamp": "2026-10-13T18:30:00Z",
  "mutants": [
    {
      "id": "stryker-201",
      "file": "src/services/feature-flags.ts",
      "line": 17,
      "column": 22,
      "mutationType": "EqualityOperator",
      "original": "===",
      "mutated": "!==",
      "status": "Survived"
    },
    {
      "id": "stryker-202",
      "file": "src/services/feature-flags.ts",
      "line": 17,
      "column": 15,
      "mutationType": "LogicalOperator",
      "original": "||",
      "mutated": "&&",
      "status": "Survived"
    },
    {
      "id": "stryker-203",
      "file": "src/services/feature-flags.ts",
      "line": 21,
      "column": 9,
      "mutationType": "BooleanLiteral",
      "original": "true",
      "mutated": "false",
      "status": "Survived"
    }
  ]
}
```

以 §8.1 的豁免文件过滤：

| mutant | 三元组 | 命中条目 | 结果 |
| --- | --- | --- | --- |
| `stryker-201` | feature-flags.ts / 17 / EqualityOperator | `equiv-001` | 剔除，不生成 issue |
| `stryker-202` | feature-flags.ts / 17 / LogicalOperator | 无（同文件同行但类型不同，§4.3） | 保留，进入 issue 创建 |
| `stryker-203` | feature-flags.ts / 21 / BooleanLiteral | 无 | 保留，进入 issue 创建 |

条目 `equiv-002`（tree.ts / 12 / OptionalChaining）在本报告中没有命中——失配条目不报错（§4.5）。注意 `stryker-202` 不会被 `equiv-001` 连带豁免：`||` → `&&` 在 `DEBUG` 恒为 `true` 时把恒真条件变成「取决于 `env`」，行为确实会变，它是真实的测试缺口，正该留在 issue 队列里。

## 9. 消费者约定

- **豁免过滤**：命中三元组的变异体在进入 issue 创建前被剔除；被豁免的变异体不得出现在任何 GitHub issue 与 `.mutation-queue/*.json` 中（否则补测 agent 会为它白做一轮）。`reviewRequired` 不改变过滤行为（§3.8）。
- **文件校验**：文件缺失时按「无豁免」处理还是报错，由 issue 创建脚本的施工票确定（验证契约已有约定：`--exemptions nonexistent.json` 须以非零退出码失败）；JSON 非法或 `version` 未知时必须报错退出（用户错误，退出码 1），stderr 写明文件路径与原因。
- **失配条目**：不报错、不阻塞（§4.5）；是否在运行摘要中提示陈旧条目，由该施工票决定。
- **与基线的交互**：豁免条目增删会改变 `total` 与分数（等价体不再计入存活）。分数因此上涨时按[基线文档 §5.3](mutation-baseline.md) 走 `update` 固化；分数回落（如清理错误豁免）不许 `update` 下调，须人工评估是否重新 `init` 并留痕（[基线文档 §8](mutation-baseline.md)）。
- **补测 agent**：不读本文件。豁免名单对它是不可见的——它只看过滤后的 issue 与队列文件。

## 10. 演进规则

1. 契约版本记录在文件 `version` 字段与本文档头部。**1.0 期间只允许向后兼容的增量**：新增字段必须可被旧消费者忽略；闭合枚举（当前为 `version` 与 `mutationType`）新增值必须先更新本文档与 §7 schema，再升 minor 版本（如 1.1）。`mutationType` 枚举与[统一格式文档 §4](unified-mutation-report.md) 联动：该文档扩充枚举时本文档同步跟进。
2. 禁止重命名既有字段或改变其类型；需要不兼容变更时升大版本（如 2.0），并在本文档保留迁移说明；旧消费者读到更高大版本必须报错退出（§2、§9）。
3. 本文档是格式的唯一权威；消费工具、测试与示例与本文冲突时，改实现与示例，不改契约语义——语义变更走本节流程。

## 参考

- [变异测试运营手册](../quality-gates/mutation-testing.md)：等价变异体定义（§2.1）、识别 → 审查 → 记录流程与决策树（§2.2、§2.3）、配置豁免（Q3）；§2.4 的记录格式是本契约细化前的非正式示意。
- [统一变异体报告格式](unified-mutation-report.md)：豁免过滤的匹配对象；id 稳定性警告（§3.1）、坐标口径（§3.3）、mutationType 枚举权威（§4）与完整报告示例（§7）。
- [变异基线文件格式](mutation-baseline.md)：豁免引起分数变化后的棘轮固化（§5.3）与豁免交互边界（§8）。
- [CRAP 计算器](../../scripts/calculate_crap.mjs)：本仓 CLI 工具结构参考。
- StrykerJS 配置（`mutator.excludedMutations`、`mutate`）：<https://stryker-mutator.io/docs/stryker-js/configuration/>
- mutmut 官方文档：<https://mutmut.readthedocs.io/en/latest/>
