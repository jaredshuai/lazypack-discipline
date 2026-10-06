# 变异体补测 Issue 模板（Mutation Issue Template）

本文档定义夜跑变异测试闭环中「补测 issue」的格式契约：`create-mutation-issues.mjs`（待实现）读取豁免过滤后的统一变异体报告，按源文件分组，为每组产出**双轨输出**——一个 GitHub issue（人读：triage 与补测者阅读）与一个机读队列文件（`.mutation-queue/*.json`，补测 agent 解析）。两者是同一份分组数据的两种渲染，本契约同时约束它们的内容与对应关系。

**契约版本**：1.0（演进规则见 §9）。

**状态与边界**：本文档先于实现冻结契约。文中提到的 issue 创建脚本 `scripts/create-mutation-issues.mjs` 属夜跑闭环后续施工范围，落地之前本文档只是契约，不表示任何 issue 已被自动创建。本仓不运行夜跑闭环、不安装 Stryker 或 mutmut，开发期脚本测试一律走 dry-run、不创建真实 issue；文中示例均为演示数据。脚本自身的命令形态（flag 名、退出码、gh 调用细节）由该施工票确定，本文档只冻结 issue 与队列文件本身的格式。

与既有文档的关系：[变异测试运营手册](../quality-gates/mutation-testing.md)定义存活变异体的三种处置（补测试、重构、豁免），不定义 issue 格式；本文档是 issue 与队列文件格式的唯一权威。输入契约见[统一变异体报告格式](unified-mutation-report.md)；等价变异体在进入本模板之前已被剔除，匹配规则见[等价变异体豁免文件格式](equivalent-mutants.md)。背景与依据：夜跑 agent 自动补强闭环（规划参考 issue #43），基于 #37（质检分层节奏）与 #42（变异测试运营手册）。

---

## 0. 快速上手

最小但完整的补测 issue（标题、标签与 body 全文，演示数据）：

````markdown
标题：[Mutation] src/services/cart.ts - 1 survivors
标签：mutation, nightly

## 存活变异体

`src/services/cart.ts` 在 2026-10-05T18:30:00Z 的夜跑中有 1 个存活变异体（工具：stryker）。以下清单与机读数据一致，处理方法见文末指引。

### stryker-63：line 23

- column：12
- mutationType：`StringLiteral`
- status：`Survived`

original：

```text
"empty"
```

mutated：

```text
""
```

## 机读数据

补测 agent 读取：[.mutation-queue/src/services/cart.ts.json](.mutation-queue/src/services/cart.ts.json)

## 补测指引

每个变异体都是「源代码被机械改动后，全部测试仍然通过」的位置：现有测试没有约束这段行为。补测判定标准：**新增测试在原代码上通过、在变异后代码上失败**，该变异体即被杀死（Killed）。

1. 逐个处理上方清单：按 line/column 打开源码位置，对比 original 与 mutated，找出能区分两者的输入（边界值、空值、组合条件等）。
2. 为该输入新增测试用例，断言可观察行为；不要为让测试变红而断言实现细节。
3. 测试通过后重跑变异测试，确认对应变异体状态变为 Killed。
4. 若分析后确认该变异体是等价变异体（任何输入下行为不变），**不要**编写无意义测试：把条目记入项目根的 `.equivalent-mutants.json`（reason 必填且须可检验），下一轮夜跑起不再为它生成 issue 内容。
5. 补测合入使变异分数上涨后，更新项目根的 `.mutation-baseline.json` 冻结门槛（棘轮式只涨不跌）。
````

要点：

- 一个源文件一个 issue：分组键是统一报告的 `file` 字段（§1）。
- 标题恒为 `[Mutation] {file} - N survivors` 形状（§2），它同时是去重键（§7）。
- body 三个二级小节固定出现、顺序固定：存活变异体清单、机读数据链接、补测指引（§3）。
- 每个变异体小节逐字段呈现统一报告的 mutant 对象，与队列文件逐字段一致（§3.2、§4.4）。
- 标签恒为 `mutation` + `nightly`（§5）；默认不指派 assignee（§6）。

生产者与消费者：

| 环节 | 角色 |
| --- | --- |
| 豁免过滤（位于 `create-mutation-issues.mjs` 内，待实现） | 前置：按三元组剔除已豁免变异体之后才进入分组（[equivalent-mutants.md §9](equivalent-mutants.md)） |
| `create-mutation-issues.mjs`（待实现） | 生产者：分组、写队列文件、经 `gh` CLI 创建 issue |
| triage 与补测者 | 读者：按 issue 清单补测试，或判定等价后记入 `.equivalent-mutants.json` |
| 补测 agent | 读者：解析队列文件获取精确坐标与源码片段 |

## 1. 分组与生成范围

- **输入**：豁免过滤后的统一变异体报告。被豁免的变异体不得出现在任何 issue 或队列文件中——这是豁免契约的铁律（[equivalent-mutants.md §9](equivalent-mutants.md)），在本模板中的体现是：分组输入已经过滤完毕，本文档不再处理豁免。
- **分组键**：mutant 的 `file` 字段，字节级精确相等（项目根相对 POSIX 路径，保留大小写与子目录，同[统一格式文档 §3.2](unified-mutation-report.md)）。不做路径归一，不做目录折叠，不做大小写折叠。
- **每组产出**：恰好一个 issue（§2、§3）加恰好一个队列文件（§4）。
- **空输入**：报告 `mutants` 为空数组，或全部被豁免剔除时，不创建任何 issue、不写任何队列文件，脚本按成功处理（空输入是合法状态，同[统一格式文档 §1](unified-mutation-report.md)）。
- **处理顺序**：各组按 `file` 升序处理（继承统一报告 §3.5 的排序），使创建顺序确定、dry-run 输出可快照对比。

## 2. title 格式

标题模板：

```text
[Mutation] {file} - N survivors
```

- `{file}`：该组源文件路径，**原样**代入统一报告的 `file` 字段。不截断、不改写分隔符、不加引号、不 URL 编码。
- `N`：该组本轮存活变异体数量（豁免过滤后），十进制整数，无前导零。
- `survivors`：字面量，恒为复数形式，不做单数化（`N = 1` 时标题就是 `[Mutation] src/services/cart.ts - 1 survivors`）。机械可预测优先于语法正确：这个标题要被脚本与检索精确匹配。
- 标题中除 `{file}` 与 `N` 以外的任何字符——方括号、空格、连字符、` - ` 两侧的空格——都是契约的一部分，不得改动。
- 标题里的 `N` 是**创建时刻**的计数，此后不随夜跑更新（跳过与去重的关系见 §7）。

## 3. body 结构与渲染规则

### 3.1 固定骨架

````
## 存活变异体

`{file}` 在 {timestamp} 的夜跑中有 {N} 个存活变异体（工具：{tool}）。以下清单与机读数据一致，处理方法见文末指引。

### {id}：line {line}

- column：{column}
- mutationType：`{mutationType}`
- status：`{status}`

original：

```text
{original}
```

mutated：

```text
{mutated}
```

（↑ 每个 mutant 重复一个小节，按统一报告 §3.5 排序）

## 机读数据

补测 agent 读取：[{queuePath}]({queuePath})

## 补测指引

（固定文案，全文见 §3.4）
````

- 三个二级小节（存活变异体 / 机读数据 / 补测指引）必须存在、顺序固定、标题文字逐字使用上述措辞；变异体小节按统一报告 §3.5 排序（`file` 升序，同文件内 `line`、`column` 升序），与队列文件 `mutants` 数组同序。
- 变异体小节的三级标题形状 `{id}：line {line}` 固定（全角冒号）。
- body 模板的固定措辞属于契约（§9）：改一个字的固定文案都是契约变更，脚本不得自行发挥。

### 3.2 占位符来源

| 占位符 | 来源 | 说明 |
| --- | --- | --- |
| `{file}` | mutant `file` | 原样代入；正文出现处以反引号包裹 |
| `{timestamp}` | 报告顶层 `timestamp` | 原样代入（ISO-8601 UTC） |
| `{N}` | 该组 mutant 数（豁免过滤后） | 十进制整数 |
| `{tool}` | 报告顶层 `tool` | 原样代入（`stryker` 或 `mutmut`） |
| `{id}` / `{line}` / `{column}` / `{mutationType}` / `{status}` / `{original}` / `{mutated}` | mutant 同名字段 | 原样代入；`mutationType`、`status` 以反引号包裹 |
| `{queuePath}` | §4.1 命名规则 | 即 `.mutation-queue/{file}.json` |

所有占位符一律**原样代入**：脚本不得改写、截断、省略或重新计算任何字段值。`original` / `mutated` 尤其禁止截断——代码块里的片段就是数据本体，人靠它读 diff，agent 靠它与队列文件对齐。

### 3.3 渲染规则

- body 以 UTF-8 编码经 `gh issue create --body-file <file>` 传入，不用内联 `--body` 拼接（避免引号与换行转义破坏格式）。
- `original` / `mutated` 放入围栏代码块，info string 固定为 `text`。围栏长度规则：默认三个反引号；若片段内任何一行含连续三个及以上的反引号，改用比片段内最长反引号串更长的围栏（CommonMark 规则），保证片段逐字节呈现。
- 多行片段按真实换行渲染在代码块内，不折叠空白。
- 除骨架固定文案外不添加任何小节。仓库想补充上下文（关联 PR、排查笔记），用 issue 评论，不改动 body 模板。

### 3.4 补测指引固定文案

所有 issue 的「补测指引」小节逐字使用以下文案（不插入文件名或变异体细节，细节在清单里）：

```markdown
每个变异体都是「源代码被机械改动后，全部测试仍然通过」的位置：现有测试没有约束这段行为。补测判定标准：**新增测试在原代码上通过、在变异后代码上失败**，该变异体即被杀死（Killed）。

1. 逐个处理上方清单：按 line/column 打开源码位置，对比 original 与 mutated，找出能区分两者的输入（边界值、空值、组合条件等）。
2. 为该输入新增测试用例，断言可观察行为；不要为让测试变红而断言实现细节。
3. 测试通过后重跑变异测试，确认对应变异体状态变为 Killed。
4. 若分析后确认该变异体是等价变异体（任何输入下行为不变），**不要**编写无意义测试：把条目记入项目根的 `.equivalent-mutants.json`（reason 必填且须可检验），下一轮夜跑起不再为它生成 issue 内容。
5. 补测合入使变异分数上涨后，更新项目根的 `.mutation-baseline.json` 冻结门槛（棘轮式只涨不跌）。
```

文案提及的两份文件是**目标项目**根目录文件，不是本仓文档：issue body 不得链接到本仓 `docs/` 路径（目标项目里不存在这些相对路径）。处置流程的完整决策树见[运营手册 §2](../quality-gates/mutation-testing.md)，豁免记录格式见[equivalent-mutants.md](equivalent-mutants.md)，门槛棘轮见[mutation-baseline.md §5.3](mutation-baseline.md)。

## 4. 机读数据：.mutation-queue/*.json

### 4.1 路径与命名

- 队列文件固定写 `.mutation-queue/{file}.json`：`{file}` 是统一报告的 `file` 字段**原样**——保留子目录与大小写。例：`src/domain/pricing.ts` → `.mutation-queue/src/domain/pricing.ts.json`。
- 目录不存在时递归创建；同名文件直接覆盖（队列文件记录「本轮事实」，不做追加、不做历史堆积）。
- 文件编码 UTF-8（无 BOM）、LF 换行、2 空格缩进、结尾一个换行符（同[统一格式文档 §1](unified-mutation-report.md)）。
- 与早期架构示意的关系：架构文档里出现过 `src-components-Button.tsx.json` 这类连字符折叠名，属早期示意；本契约采用**保留路径**的命名，理由有三：文件路径与队列路径一一对应、无歧义；折叠名存在理论碰撞（`a-b.ts` 与 `a/b.ts` 同折为 `a-b.ts.json`）；与 issue 创建脚本的既定范围描述（`.mutation-queue/{file}.json`）一致。

### 4.2 链接形式与可达性

- body 中的链接行是标准 Markdown 相对链接，链接文本与目标相同，都用 `{queuePath}` 原文：`[.mutation-queue/src/domain/pricing.ts.json](.mutation-queue/src/domain/pricing.ts.json)`。
- 相对链接只有在队列文件被提交到仓库默认分支后，才能在 github.com 上点击打开。夜跑通常把队列文件留在运行工作区（临时产物），此时链接是指向约定路径的说明，agent 与补测者从运行工作区直接读文件。两种落地都合法：
  - **临时产物**（默认）：不提交 `.mutation-queue/`，链接给指路，agent 从运行检出中读取；
  - **随跑提交**：触发层在同一轮把队列文件提交入库（或单独 bot 提交），链接在 GitHub 上直接可达，历史可追溯。
- 触发层选择哪种落地由夜跑操作指引决定，不在本契约内。无论哪种：**不得**使用 `file://` 或本机绝对路径链接（对其他用户不可解析），**不得**把数据放进 issue 附件（agent 无法程序化解析附件内容）。

### 4.3 队列文件字段

一份完整队列文件（与 §8 示例同一分组，可直接 `JSON.parse`）：

```json
{
  "version": "1.0",
  "file": "src/domain/pricing.ts",
  "tool": "stryker",
  "timestamp": "2026-10-05T18:30:00Z",
  "issueNumber": 123,
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
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `version` | string | 是 | 闭合枚举，当前仅 `"1.0"`；消费者读到枚举外的值必须报错退出 |
| `file` | string | 是 | 分组键，等于该组 mutant 的 `file` 字段 |
| `tool` | string | 是 | 复制报告顶层 `tool` |
| `timestamp` | string | 是 | 复制报告顶层 `timestamp` |
| `issueNumber` | integer | 实跑必填；dry-run 省略 | 本轮实跑的 issue 编号：创建组为新建 issue 编号，去重跳过组为既有 open issue 编号（§7）。dry-run 未调用 GitHub，故无此字段；这是它与实跑输出的唯一差异 |
| `mutants` | array | 是 | 该组 mutant 对象，**逐字段原样复制**统一报告的 mutant（八个字段全带），顺序同报告 |

- 统一报告 §8 允许机读文件「复用 mutant 对象的字段子集」；本契约 v1.0 选择**全量原样复制**：issue body 与队列文件的一致性检查因此退化为纯文本对比（§4.4），agent 也不需要回到统一报告补数据。
- 队列文件不含统计、不做分数计算（边界同[统一格式文档 §8](unified-mutation-report.md)）。
- **agent 消费口径**：读 `file`、`line`、`column`、`mutationType`、`original`、`mutated` 即可生成针对性测试；`id` 只用于本轮与 issue 清单对账，不跨运行稳定（[统一格式文档 §3.1](unified-mutation-report.md)），禁止用作跨运行关联键。

### 4.4 与 issue body 的一致性

issue body 清单与队列文件 `mutants` 必须来自同一分组、同序、同值：每个变异体小节的 `{id}`、`{line}`、`{column}`、`{mutationType}`、`{status}`、`{original}`、`{mutated}` 与队列文件对应条目逐字段相等。人读的 issue 与机读的队列文件是同一份数据的两种渲染，永不互相矛盾；这是后续实现与验证做一致性检查的契约基础。

## 5. labels 策略

| 标签 | 必填 | 建议色 | 建议描述 | 用途 |
| --- | --- | --- | --- | --- |
| `mutation` | 是 | `B60205` | 夜跑变异测试：存活变异体补测 | 本闭环所有 issue 的唯一类别标签；去重检索（§7）与人工过滤都按它进行 |
| `nightly` | 是 | `1D76DB` | 由夜跑自动补强闭环创建 | 标记来源是自动化夜跑，与人工创建的 issue 区分 |

- 每个创建的 issue 必须同时带这两个标签。脚本只添加这两个，不多加（仓库可按自己策略另行补标签，但那不进本契约）。
- **创建前确保标签存在**：脚本先读 `gh label list`，缺哪个用 `gh label create` 补哪个（幂等，可安全重跑）。颜色与描述是建议值；同名标签已存在时不改动它。
- 不引入工具标签（`stryker` / `mutmut`）：工具信息在 body 与队列文件里，标签集合保持最小，去重检索的结果才干净。想按工具过滤的仓库用 body 检索即可。

## 6. assignee 策略

- **默认不指派**。理由：issue 的第一读者是补测 agent（读队列文件）与按标签过滤的 triage 者；指派会制造通知噪音，并暗示有具体个人负责——存活变异体本质是团队的测试缺口，不是某个人的待办。
- **可选指派**：脚本可提供 `--assignee <login>`（规划接口，最终 flag 形态以施工票为准），把本轮创建的全部 issue 指派给同一用户，适合「夜跑产物先落到值班人」的团队约定。login 无效或无权限时 `gh` 会报错，脚本按统一错误处理失败退出并写明原因，不得静默吞掉。
- **不做按文件路由**（不同目录指派不同人）：这属于团队策略而非数据格式，建议用仓库自己的 workflow 或 triage 后人工改派实现，不进本契约。

## 7. 去重与幂等

- **去重键**：`[Mutation] {file} - ` 前缀（注意结尾含一个空格）+ `mutation` 标签 + open 状态。存在匹配的 open issue 时不创建新 issue，在运行摘要中记一条跳过（含目标 issue 编号）。
- **前缀匹配而非全等匹配**的理由：标题里的 `N` 是创建时刻的计数，下一轮该文件存活数变化后全等匹配会失配，从而为同一文件再开一条 open issue——这正是要去掉的噪音。
- **检索实现约定**：`gh issue list --state open --label mutation --json number,title` 取回候选后，在脚本内做**精确字符串前缀过滤**。不依赖 GitHub 搜索语法解析 `[Mutation]` 这类方括号词（搜索分词不可靠），客户端过滤才是权威判定。
- **跳过创建不影响队列文件**：队列文件每轮照常重写覆盖，agent 读到的永远是本轮数据；去重跳过组的队列文件带既有 open issue 编号（`issueNumber`，§4.3）。创建与跳过都在各自操作完成后**立即原子落盘**（临时文件 + rename 覆盖），gh 中途失败时已完成组的条目保留、失败组不写。open issue 里旧的 `N` 与本轮计数可以不一致——issue 是入口指针，队列文件才是事实。
- **同名 issue 已关闭不阻塞新建**：文件修复（issue 被关闭）后再次出现存活变异体，是新的补测需求，应当建新 issue。
- **dry-run**：不调用 GitHub API，不创建 issue、不确保标签；队列文件照常写出（`issueNumber` 省略，§4.3），并把每组的 body 预览写盘供检查（预览文件路径由施工票确定）。

## 8. 完整示例

输入取自[统一格式文档 §7.1](unified-mutation-report.md) 的 Stryker 示例报告（3 个存活变异体）：豁免过滤后按文件分组得两组——`src/domain/pricing.ts`（2 个）与 `src/services/cart.ts`（1 个，即 §0 示例）。下面是 `src/domain/pricing.ts` 组的完整 issue（对应队列文件即 §4.3 示例）。

- 标题：`[Mutation] src/domain/pricing.ts - 2 survivors`
- 标签：`mutation`、`nightly`
- assignee：无（默认策略）
- body 全文：

````markdown
## 存活变异体

`src/domain/pricing.ts` 在 2026-10-05T18:30:00Z 的夜跑中有 2 个存活变异体（工具：stryker）。以下清单与机读数据一致，处理方法见文末指引。

### stryker-42：line 8

- column：7
- mutationType：`ConditionalExpression`
- status：`Survived`

original：

```text
subtotalCents >= 100_00 || isMember
```

mutated：

```text
subtotalCents > 100_00 || isMember
```

### stryker-57：line 15

- column：5
- mutationType：`ArithmeticOperator`
- status：`Survived`

original：

```text
fee += 300
```

mutated：

```text
fee -= 300
```

## 机读数据

补测 agent 读取：[.mutation-queue/src/domain/pricing.ts.json](.mutation-queue/src/domain/pricing.ts.json)

## 补测指引

每个变异体都是「源代码被机械改动后，全部测试仍然通过」的位置：现有测试没有约束这段行为。补测判定标准：**新增测试在原代码上通过、在变异后代码上失败**，该变异体即被杀死（Killed）。

1. 逐个处理上方清单：按 line/column 打开源码位置，对比 original 与 mutated，找出能区分两者的输入（边界值、空值、组合条件等）。
2. 为该输入新增测试用例，断言可观察行为；不要为让测试变红而断言实现细节。
3. 测试通过后重跑变异测试，确认对应变异体状态变为 Killed。
4. 若分析后确认该变异体是等价变异体（任何输入下行为不变），**不要**编写无意义测试：把条目记入项目根的 `.equivalent-mutants.json`（reason 必填且须可检验），下一轮夜跑起不再为它生成 issue 内容。
5. 补测合入使变异分数上涨后，更新项目根的 `.mutation-baseline.json` 冻结门槛（棘轮式只涨不跌）。
````

## 9. 演进规则

1. 契约版本记录在本文档头部与队列文件 `version` 字段。**1.0 期间只允许向后兼容的增量**：body 新增可忽略的展示细节、队列文件新增可被旧消费者忽略的字段，升 minor（如 1.1）并同步本文档。改变标题形状（§2）、增删或重排 body 小节、改动固定文案（§3.4）、改变标签语义或队列文件命名规则（§4.1），都是不兼容变更，升大版本（如 2.0）并在本文档保留迁移说明。
2. §2 标题与 §4.1 队列路径的字符串形状是机器匹配面：任何字符级改动（含空格、连字符、冒号）都视为不兼容变更。
3. 本文档是格式的唯一权威；创建脚本、测试与示例与本文冲突时，改实现与示例，不改契约语义——语义变更走本节流程。

## 参考

- [变异测试运营手册](../quality-gates/mutation-testing.md)：存活变异体处置决策树（§2）与门槛冻结棘轮（§1），补测指引固定文案的策略来源。
- [统一变异体报告格式](unified-mutation-report.md)：本模板的输入契约；mutant 字段权威（§2）、id 稳定性警告（§3.1）与示例报告（§7）。
- [等价变异体豁免文件格式](equivalent-mutants.md)：进入本模板前的剔除规则（§4、§9）；被豁免的变异体不会出现在任何 issue 或队列文件中。
- [变异基线文件格式](mutation-baseline.md)：补测合入后的门槛上调（§5.3）。
- [CRAP 计算器](../../scripts/calculate_crap.mjs)：本仓 CLI 工具结构参考。
