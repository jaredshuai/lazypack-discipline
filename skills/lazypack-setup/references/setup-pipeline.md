# setup 管线：文件格式与入口用法

本文说明 `scripts/setup_helper.mjs` 读写的文件格式，以及 AI 在 setup 流程里怎么调用它。格式是逐步迁入的：一次迁一个步骤，没迁到的步骤仍按 `SKILL.md` 的写法执行，新旧并存。本文只写已经落地的部分，没迁入的部分写「尚未迁入」。本文建立之后以它为准。

## 1. 已迁入的范围

| 项 | 阶段 | 说明 |
|---|---|---|
| 第 2 步第 4 项：既有质量门禁命令 | `scan`、`plan` | 探测根 `package.json` 的全部脚本，把完整调用原样分给槽；`slots` 已落地，`actions` 尚未迁入 |

「清单全部由工具渲染」只对已迁入的类别成立。事实文件与计划文件的 `covers` 写明了哪些已经归管线；没列出的仍由 AI 按 `SKILL.md` 第 4 步在草案里展示。整体确认仍然只有一次。

「命令原样写进 Hook spec」这一性质，目前只有测试里对计划的断言兜底。`render`、`verify` 迁入前，工具不校验 AI 手工组装的 Hook spec，这一步靠 AI 自己遵守。

## 2. 入口

```
node scripts/setup_helper.mjs scan --cwd <目标仓> [--out <facts.json>]
node scripts/setup_helper.mjs plan --cwd <目标仓> --facts <facts.json> --answers <answers.json> [--out <plan.json>]
```

- 只用 Node 标准库。路径相对 skill 目录。
- `--cwd` 必填，不再默认当前目录。`scan`、`plan` 不带它退出 2；不带子命令也退出 2 并打印用法；`--help` 退出 0。
- 事实、回答、计划文件都写在**目标仓之外**，放系统临时目录下本次运行专用的子目录（先取真实路径再用）。运行目录由 AI 在运行前建好，工具不会替它建。`--out` 的目录不存在时退出 3，不写任何东西；`--out` 落在目标仓内也退出 3。不带 `--out` 时 JSON 打印到标准输出。
- 运行成功后由 AI 删除这些文件；失败或被阻断时保留，报告里给出目录路径。文件内容不贴进报告正文。
- `render`、`execute`、`verify`：尚未迁入，调用会以退出码 2 拒绝。

退出码：

| 码 | 含义 |
|---|---|
| `0` | 成功 |
| `1` | 输入或内容有错：文件读不到或不合法、事实文件自身被改坏（`facts` 与自带的 `machineFp` 对不上）、判断或回答不合格、同槽冲突、`package.json` 读取失败 |
| `2` | 用法错误：缺 `--cwd`、缺 `--facts`/`--answers`、没有子命令、未知命令、调用了尚未迁入的命令 |
| `3` | 输出路径不安全 |
| `4` | 目标仓的既有命令自 `scan` 以来变了，不出计划、不写文件 |

## 3. 事实文件（`lazypack-facts/1`）

| 字段 | 含义 |
|---|---|
| `schema` | 固定为 `lazypack-facts/1` |
| `scope` | 目前只支持 `full`。`docs-only` 尚未迁入 |
| `covers` | 本次由工具探测的 `SKILL.md` 第 2 步项号，目前固定为 `[4]`。没列出的项仍由 AI 按 `SKILL.md` 探测 |
| `facts` | 工具查到的事实，按 `id` 的码点升序 |
| `judgments` | AI 的判断。`scan` 输出空数组，由 AI 追加 |
| `machineFp` | `facts` 段的摘要，不含 `judgments` |

摘要一律是 SHA-256 的十六进制全长，输入按 `managed-blocks.md` §3.2 的规范序列化（键按码点升序、紧凑无空白、UTF-8）。注意：§3.2 里给块头 `input` 用的是前 16 位，管线文件用全长。

### `facts` 的每一项

| 字段 | 含义 |
|---|---|
| `id` | 稳定标识，同一仓库两次扫描相同，如 `cmd:package.json#scripts.test` |
| `item` | 来自第 2 步第几项，目前固定为 `4` |
| `kind` | 目前只有 `existing-command`。其余种类尚未迁入 |
| `value` | 随 `kind` 而定，见下 |
| `source` | 固定为 `machine` |
| `evidence` | `{path, locator}`：在哪个文件的哪个位置查到的 |

`existing-command` 的 `value`：

| 字段 | 含义 |
|---|---|
| `invocation` | 项目现在怎么调用它，完整字符串，如 `npm run lint`、`npm test`。由包管理器与脚本名合成，依据 `packageManager` 字段或锁文件，默认 npm；不是从仓里逐字摘录的。脚本名带空白、引号、`;`、`&`、`|`、`$` 等不能安全拼进命令行的字符时为 `null` |
| `cwd` | 工作目录，相对目标仓根的 POSIX 路径，仓根写 `.` |
| `definedAt` | 定义位置 `{path, locator}`，如 `{"path": "package.json", "locator": "scripts.lint"}` |
| `definition` | 定义原文，逐字记录，如 `tsc --noEmit && vitest run`。**只作证据，任何阶段都不拿它拆出子命令** |

### 现在探测什么

- 只读目标仓根的 `package.json` 的 `scripts`，**每个**条目都记成一条事实（`definition` 不是非空字符串的除外）。包管理器按 `packageManager` 字段、再按锁文件（`pnpm-lock.yaml`、`yarn.lock`、`bun.lock`、`bun.lockb`）判定，都没有按 npm。`packageManager` 不是 `npm`、`pnpm`、`yarn`、`bun` 之一时忽略这个字段。
- 脚本名不能安全拼进命令行时，这条脚本仍记成事实，变了照样让 `plan` 停下，但 `invocation` 为 `null`，不认领任何槽；有 `coverage` 判断让它认领槽时 `plan` 退出 1。
- 只有 `format`、`lint`、`type`、`typecheck`、`type-check`、`test` 这六个名字按名字认领槽。其他名字（如 `check`、`verify`）默认不认领任何槽，进 `unassigned`，`reason` 为 `no-slot-name`，除非有 `coverage` 判断认领。它们变了，`machineFp` 也变，`plan` 重扫时退出 4。
- 调用字符串：`test` 脚本写 `<pm> test`，其余写 `<pm> run <名字>`；bun 一律写 `bun run <名字>`（`bun test` 是内置测试运行器，不是脚本）。
- 不运行包管理器、构建工具或项目测试。
- `package.json` 不存在（或其父路径不是目录）视为没有命令。其他读取错误（如权限不足）退出 1，不当作没有命令。`package.json` 是符号链接或目录时也退出 1，不读取。
- **尚未迁入**：子目录工作区、`pyproject.toml`、`Makefile`、其他配置文件里的既有命令，以及 `pre`/`post` 钩子脚本。这些命令仍由 AI 只读查找，按 `verification.md` §3.3 原样保留、不展开；它们不在事实文件里，`plan` 不会为它们分槽，AI 不得把它们写成工具查到的事实。
- 管线外的既有命令：AI 只读查到后，只能用于计划里 `origin` 为 `none` 的槽。写 Hook spec 时带上它的工作目录和定义位置，并在确认清单里作为 AI 条目单列。`origin` 为 `existing` 的槽以计划为准，AI 不改写。AI 认为该槽应换成另一条命令时，写一条 `about` 为 `null` 的 `dissent` 交用户裁。
- 根 `package.json` 里其他名字的脚本已经是事实。要让它覆盖某个槽，写 `coverage` 判断，不要走管线外。

### `judgments` 的每一项

| 字段 | 含义 |
|---|---|
| `id` | 稳定标识，文件内唯一 |
| `about` | 针对哪条事实的 `id`。非 `null` 时必须是现有事实的 `id`（含 `repo-visibility`）。`coverage` 不能为 `null`；`dissent` 可以为 `null`，用于针对管线外发现的异议 |
| `kind` | 目前接受 `coverage`、`dissent`、`repo-visibility`。其余尚未迁入，会被拒绝 |
| `value` | 随 `kind` 而定 |
| `source` | 固定为 `ai` |
| `basis` | 依据：读了哪个文件哪一处、按哪条口径，如 `references/verification.md §3.3` |

`plan` 目前只读 `coverage`；`dissent` 与 `repo-visibility` 只校验形状并计入 `judgmentsFp`，不影响 `slots`。每条事实最多一条 `coverage` 判断。

`coverage` 的 `value` 是 `{slots, compliant}`：

- `slots` 是这条既有命令认领的全部槽，`format`、`lint`、`type`、`test` 的不重复子集。空数组表示这条命令不认领任何槽。
- `compliant` 是它是否满足 `verification.md` §3.3 的「失败传播且输出归属清晰」。这两点要读懂脚本才能判，所以由 AI 判断；口径读自 §3.3 和配方卡片，不在工具里另写一份。
- AI 判断聚合脚本覆盖范围时，只看脚本是否确实覆盖，不能只凭 `test`、`check` 等脚本名推断。
- 有 `coverage` 判断的事实，判断的 `slots` 取代按名字的认领。`compliant` 为 `false` 表示 Hook PAUSE：这条事实不分配任何槽。

AI 只写 `judgments` 段，不改 `facts`，不改 `machineFp`。AI 对某条事实有不同看法时，加一条 `dissent` 备注，由用户裁；用户裁决前按工具查到的值走。

## 4. 回答文件（`lazypack-answers/1`）

| 字段 | 含义 |
|---|---|
| `schema` | 固定为 `lazypack-answers/1` |
| `origin` | `interactive`（AI 按用户当轮的回答记录）或 `preset`（测试预置） |
| `answers` | 对象，键是问题标识，如 `3.A.retention`、`3.B.preset` |
| `rulings` | 用户对异议的裁决，数组，每项必须是对象，含字符串 `judgment` 与布尔 `adopt`，否则退出 1；可省略 |

每道题的值有三种状态：没有问 `{"asked": false, "reason": "…"}`；问了、用户还没答 `{"pending": true}`；答了则是该题自己的字段。

本票的 `plan` 只校验这份文件的形状，把它的摘要记入 `answersFp`、把 `origin` 带进计划，不按回答分槽；回答里新增的题的键名和值的形状，在迁入用到它们的步骤时再定。预置回答只给测试用，报告必须如实显示「回答来自预置文件」。

## 5. 计划文件（`lazypack-plan/1`）

| 字段 | 含义 |
|---|---|
| `schema` | 固定为 `lazypack-plan/1` |
| `factsFp` | 出计划时重新扫描得到的摘要 |
| `judgmentsFp` | `judgments` 段的摘要，数组先按 `id` 的码点升序排列 |
| `answersFp` | 回答文件整体的摘要 |
| `answersOrigin` | 从回答文件带过来的 `origin` |
| `docPlanFp` | 文档迁移计划的 `planFp`；目前恒为 `null`（尚未迁入）。文档迁移仍走 `doc_helper.mjs`，两份计划并列不合并 |
| `covers` | 本计划覆盖的写入类别，目前是 `["gate-slots"]` |
| `slots` | 四个门禁槽各自的决定，顺序 `format`、`lint`、`type`、`test` |
| `unassigned` | 没有分到任何槽的既有命令：`{from, reason}`，`reason` 为 `hook-pause`（判断为不合规）、`judged-no-slot:<判断 id>`（判断的 `slots` 为空）、`no-slot-name`（名字不认领槽且没有判断认领）或 `unsafe-name`（脚本名不能安全拼进命令行）。列在这里不等于缺一个门禁：被聚合命令内部调用的脚本（如夹具里的 `check`）也在这里，AI 不要为它们另补 Hook 命令 |
| `aiItems` | 依赖 AI 判断的条目：全部 `coverage` 判断的 `id`。`slots` 为空或 `compliant` 为 `false` 的判断也决定了哪个槽没有命令，所以一并列出 |
| `planFp` | 除 `planFp` 自身以外全部字段的摘要 |

`actions`（要做的动作）、`render` 的确认清单、`execute` 与验证结果文件：尚未迁入。AI 目前把 `slots[].command` 原样用进它仍然手工组装的 Hook spec。

### `slots` 的每一项

| 字段 | 含义 |
|---|---|
| `slot` | `format`、`lint`、`type`、`test` 之一 |
| `origin` | `existing`（项目已有的命令）或 `none`（这个槽没有既有命令）。`preset`（配方补的）尚未迁入 |
| `command` | 要写进 Hook 的完整命令。`existing` 时与对应事实的 `invocation` 相同，AI 把它原样写进 Hook spec；`none` 时为 `null` |
| `cwd` | 工作目录；`none` 时为 `null` |
| `from` | 出处：既有命令写事实 `id`；`none` 时为 `null` |
| `needs` | 这个槽依赖的安装动作 `id`；既有命令为空数组 |
| `reason` | 只在 `none` 时出现：`no-existing-command`、`hook-pause:<事实 id>` 或 `judged-not-covered:<事实 id>` |
| `outcomes` | 键是状态词，值是 `{provenance, writeCommand}`。`existing` 为 `wired` → `wired:existing:pre-existing`、`writeCommand` 为 `true`（Hook 写入这条命令）。`none` 时是空对象：配方是否补这个槽尚未迁入，计划不预告它最后的状态。状态词与三段式取自 `managed-blocks.md` §5.6 和 `verification.md` §3.3 |

分槽规则：

1. 有 `coverage` 判断的事实，判断的 `slots` 就是它认领的全部槽，取代按名字的认领。`slots` 为空数组则不认领任何槽，进 `unassigned`（`judged-no-slot:<判断 id>`）。`compliant` 为 `false` 仍不分配，槽上 `reason` 为 `hook-pause:<事实 id>`。有同名脚本、但它的判断没有列这个槽时，槽上 `reason` 为 `judged-not-covered:<事实 id>`，不是 `no-existing-command`，AI 不要把它当成缺口另补命令。不合规的判断不参与冲突检测：同一个槽另有一条命令认领时，槽就用那条命令。
2. 没有判断的事实，按脚本名认领同名的那一个槽（`typecheck`、`type-check` 视为 `type`）；名字不在六个之内则不认领。
3. 同一个槽被两条及以上不同事实认领（不论来自判断还是按名字），`plan` 以退出码 1 停下，stderr 列出该槽、所有认领者和各自来源（判断 id 或「按名字」）。不择一，也没有判断优先于名字的分层。补救分两种：判断对判断，改其中某条判断的 `slots`，去掉这个槽；名字对名字或名字对判断，为某条按名字认领的事实写一条 `coverage` 判断（`slots` 不含这个槽，可以为空数组）。
4. **一条聚合命令覆盖多个槽时，这几个槽的 `command` 都是同一条完整调用，`from` 指向同一条事实。多个槽 `from` 相同即同一条调用，组装 Hook spec 时只跑一次，这是必须项**；证据按槽各记一份（`verification.md` §3.3）。
5. 任何槽的 `command` 都不得是从 `definition` 里拆出来的片段。工具不读 `definition` 的内容，也没有拆分它的代码路径。

## 6. `plan` 的重扫与停止

`plan` 不信任事实文件里 `facts` 段自称的内容：

1. 先核对文件里的 `facts` 与它自带的 `machineFp` 是否自洽，不自洽说明文件被改坏，即停（退出码 1）。
2. 再重新扫描目标仓，与 `machineFp` 比对。不一致说明目标仓自 `scan` 后变了，即停，不写任何文件，错误里逐条列出新增、变化、消失的事实 `id`（退出码 4）。AI 应向用户说明哪条变了，并重新运行 `scan`。
3. 计划里的每个取值都能追到来处：某条事实、某条判断，或回答文件。追不到来处的不能进计划。

## 7. 调用时机与怎么向用户解释

- `scan` 在第 2 步第 4 项运行；随后 AI 读事实里每条聚合脚本的 `definition`，按 §3.3 写 `coverage` 判断。
- `plan` 在第 3 步回答之后、第 4 步草案之前运行。第 4 步草案里的槽位接线命令取自 `slots[].command`，AI 不改写、不重新拆分。
- **重跑**：`plan` 不读已装好的 Hook，这一步由 AI 按第 7 项核对。目标仓已有 lazypack 装好且验证过的 Hook 时，`SKILL.md` 第 2 步第 7 项优先。已有槽的命令和出处以 Hook 记录为准，不因计划把 `preset` 改成 `existing`。两者不一致时加一条 `dissent` 说明，交用户裁。
- 向用户解释：既有命令原样保留；聚合脚本整条分给它覆盖的槽，没有拆；哪些命令是工具查到的，哪些覆盖判断是 AI 读脚本后的判断（`aiItems`）；`plan` 因事实变化停下时，说明是哪条变了。
- 报告里的「既有命令保留事实」仍按 `verification.md` §3.3 与 §4 的口径写：只有有效调用字符串确实一致才可声称原样保留。
