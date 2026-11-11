# 净室安装测试

本文说明 `scripts/test_clean_room_install.mjs`（#109）测了什么、没测什么，并逐步列出 `skills/lazypack-setup/SKILL.md` 的哪些环节有确定性入口。「步骤覆盖表」一节由该测试机器核对：表里的步骤编号必须与 `SKILL.md` 的步骤编号一一对应，多一个或少一个都失败。

测试通过只说明：包里现有的确定性入口，在一个只有 skill 目录的环境里能把两份全新夹具装配到下文列出的程度。它不说明 setup 整体可用，表里标「未覆盖」的环节没有任何证据。

## 测试做什么

- 把 `skills/lazypack-setup/` 拷到系统临时目录，夹具仓库拷到旁边并 `git init`。装配全程只调用拷出的那份 skill 里的脚本，不调用本仓库其他脚本。
- 用夹具旁的 `answers.json` 代替用户回答，按 `SKILL.md` 第 5 步的顺序装配一遍，再原样装配一遍。
- 第一遍之后断言：
  - 拷出的 skill 通过包完整性检查；
  - `.githooks/pre-commit` 存在，第一行是 `#!/bin/sh`，全文没有 CR，POSIX 上有可执行位，`core.hooksPath` 指向 `.githooks`，并通过 `verify_hook_install.mjs`；
  - 回答文件里的槽位状态、命令和出处行写进了 Hook；
  - 四份新产物的写入结果是 `create`，已有的常驻入口是 `append`，原有字节保留在托管块之前，五份文件都不残留占位符，并通过 `managed_blocks.mjs verify`；
  - 常驻入口的指针行跟随依赖的真实状态：登记册没写，所以没有它的指针行；
  - 留存段落写进角色文件，想法池种子与纪要目录跟随第 3 步的选择；
  - 三份原样复制的种子与模板逐字节相同，`CHANGELOG.md` 由 `changelog.mjs init` 建出。
- 第二遍之后断言：五份托管产物全部 `noop`，种子全部原位保留，两项核验仍通过，目标仓里每个文件的字节、修改时间和权限位都没有变化。
- 反例：在拷出的 skill 里删掉 Hook 模板的 shebang 再装配。包检查与 Hook 静态验收都应失败。

不做的事：

- 不执行任何由 AI 按提示词完成的环节（探测、访谈、草案确认、撰写、完成报告）。
- 不安装依赖，不运行任何门禁命令，不触发真实提交。
- 不测文档迁移，只测默认的原位保留。
- 不测存量仓：两份夹具都是全新仓库，没有既有 Hook、既有托管块或既有登记册。

## 怎么运行

```
node scripts/test_clean_room_install.mjs
node scripts/run_tests.mjs test_clean_room_install
```

只用 Node 标准库和 git。`.github/workflows/tests.yml` 的 `clean-room` 作业在 Linux、Windows、macOS 三个 runner 上各跑一次。

## 夹具与回答文件

夹具在 `scripts/fixtures/clean-room/`，每份一个目录：`repo/` 是目标仓的初始内容，`answers.json` 是预置回答。

| 夹具 | 项目 | 留存选择 | 配方 |
|---|---|---|---|
| `ts-new` | 全新 TypeScript | 想法池与纪要 | `ts-biome-vitest`，四槽全采纳 |
| `py-new` | 全新 Python | 只留决议 | `python-uv-ruff`，四槽全采纳 |

`answers.json` 分两段，含义不同：

- `step3_answers`：`SKILL.md` 第 3 步会向用户提的问题和这份夹具的回答。
- `assumed`：不是用户回答。它替代真实装配中由探测、安装和 AI 撰写得到的结果，测试没有执行这些环节，直接采用这里的值。常驻入口文件名、Hook 模式、仓库可见性、四槽的状态与命令、两行指针文字都在这一段。

夹具按通过第 1 步前置双检的样子准备：带 `docs/agents/issue-tracker.md` 和含 `## Agent skills` 块的 `AGENTS.md`。夹具不设换行属性，Windows 检出后 `AGENTS.md` 是 CRLF，顺带覆盖 `append` 沿用既有换行的路径。

## 步骤覆盖表

覆盖情况的四个词：

- **入口**：调用了包内脚本的确定性入口。
- **胶水**：包内没有入口，测试文件里的函数按参考文档代做。真实装配中这一环节由 AI 手算或手写。
- **预置**：没有执行，结论直接取自 `answers.json` 或夹具的形状。
- **未覆盖**：没有执行，也没有替代。

一个步骤可以占多行。第一列是 `SKILL.md` 的步骤编号：第 3 步按 3.A–3.C 小节，第 5 步按 0–9 编号条目。

| 步骤 | 环节 | 覆盖情况 | 说明 |
|---|---|---|---|
| 1 | 包完整性检查 | 入口 | `package_manifest.mjs check`，在拷出的 skill 目录里运行 |
| 1 | 前置双检（Issue Tracker、常驻入口） | 预置 | 规则在 `references/verification.md` §1，没有脚本。夹具按通过双检的样子准备 |
| 1 | `--docs-only` 快速入口 | 未覆盖 | |
| 2 | 只读探测第 1–6、8–10 项 | 预置 | 结论由夹具形状和 `assumed` 段代替。`doc_helper.mjs scan` / `plan` 有入口，测试没有调用 |
| 2 | 第 7 项：写前基线 | 入口 | `managed_blocks.mjs snapshot`。写前的只读 `verify` 没有运行，受管 Hook 的出处读回没有覆盖 |
| 3.A | 留存偏好 | 预置 | 只覆盖 `ideas`、`minutes`、`decisions-only`。`raw_qa`、暂不配置、未答三条分支未覆盖 |
| 3.A | 同主题冲突与文档归属 | 预置 | 夹具没有存量文档，不提问 |
| 3.B | 配方推荐与四槽取舍 | 预置 | 只覆盖四槽全采纳。部分拒绝、全拒绝、CLI bin、MCP 三类分支未覆盖 |
| 3.B | 变异测试配方 | 预置 | 预置为拒绝。采纳分支未覆盖 |
| 3.C | UI 配方 | 预置 | 预置为拒绝。采纳分支未覆盖 |
| 4 | 草案展示与整体确认 | 未覆盖 | 没有人确认，测试直接写盘 |
| 5.0 | 受控迁移与文档登记 | 未覆盖 | #109 不测迁移。`doc_helper.mjs execute` 有入口 |
| 5.1 | 最小新仓配置与清单补缺 | 未覆盖 | 夹具自带 `package.json` / `pyproject.toml`，测试不补脚本、不改清单 |
| 5.2 | 批量依赖安装 | 未覆盖 | |
| 5.3 | 可调用核验 | 未覆盖 | |
| 5.4 | 基线校验 | 未覆盖 | 5.2–5.4 的结果由 `assumed.slot_results` 假定为四槽 `wired` |
| 5.5 | Hook、`CODING_STANDARDS.md`、`RELEASE.md`、`docs/agents/roles.md` 写入 | 入口 + 胶水 | 写盘走 `managed_blocks.mjs write`。spec 组装、`gen`、`input`、出处行、命令转义是胶水 |
| 5.5 | 留存段落 | 入口 + 胶水 | 渲染走 `managed_blocks.mjs render-retention`。留存策略字典（维度、模式、路径、可见性、`retentionSrc`）是胶水 |
| 5.5 | `scripts/changelog.mjs`、`scripts/check_report_layers.mjs`、§9 规程 | 胶水 | 不存在时原样复制，已存在则保留 |
| 5.5 | `CHANGELOG.md` | 入口 | 目标仓里的 `scripts/changelog.mjs init` |
| 5.5 | 想法池种子、纪要目录 | 胶水 | 种子原样复制。写前审查与脱敏没有做 |
| 5.5 | `RELEASE.md` 块外薄草稿 | 未覆盖 | 由 AI 撰写 |
| 5.5 | `raw_qa` 绑定与核验 | 未覆盖 | |
| 5.6 | 登记册 `docs/ARTIFACTS.md` | 未覆盖 | 没有确定性入口，测试不写登记册 |
| 5.7 | 常驻入口 `AGENTS.md` | 入口 + 胶水 | 写盘走 `write`。依赖状态采样、指针行渲染与整行省略是胶水 |
| 5.7 | `CLAUDE.md` 入口、既有 Hook 管理器追加调用行 | 未覆盖 | |
| 5.8 | `core.hooksPath` 与 POSIX 可执行位 | 胶水 | 测试直接执行 `git config` 和 `chmod` |
| 5.8 | Hook 静态验收 | 入口 | `verify_hook_install.mjs --mode new` |
| 5.8 | Hook 运行时验证 | 未覆盖 | 没有运行 `git hook run pre-commit`，Hook 脚本一次也没有执行 |
| 5.9 | 会话内三态恢复保护 | 未覆盖 | |
| 5（最终产物检查） | 托管产物核验 | 入口 | `managed_blocks.mjs verify`。这一条在 `SKILL.md` 里没有编号 |
| 6 | 诚实完成报告 | 未覆盖 | |

## 没有确定性入口的环节

这一节是 #113 的输入。下面每一条在真实装配中都由 AI 按文档手算或手写，包里没有脚本可调；测试里标「胶水」的部分是本仓对同一份文档的另一次实现，与 AI 的做法是否一致没有证据。

**测试用胶水代做的**

| 环节 | 依据 | 测试里的函数 |
|---|---|---|
| 模板生成标识 `gen` | `references/managed-blocks.md` §4 | `computeGen` |
| 输入摘要 `input` 与规范序列化 | 同上 §3.2 | `canonicalJson`、`computeInput` |
| 留存策略字典 | 同上 §3.1.1 | `buildRetention` |
| 配方身份、`presetSrc`、四槽出处与出处行 | 配方卡与同上 §5.4 | `buildPreset` |
| 门禁命令写进单引号前的转义 | 同上 §5.4 | `shellSingleQuoted` |
| 依赖状态采样 | 同上 §3.1.2 | `sampleArtifactState` |
| 常驻入口指针行的渲染与整行省略 | `SKILL.md` 第 4 步 | `install` 内 |
| 种子原样复制、已存在则保留 | `SKILL.md` 第 5 步第 5 项 | `copyIfAbsent` |
| `core.hooksPath` 与可执行位 | `SKILL.md` 第 5 步第 8 项 | `install` 内 |
| 把上述各步按顺序串起来 | `SKILL.md` 第 5 步 | `install` |

**测试没有做、包里也没有入口的**

- 第 1 步的前置双检。
- 第 2 步除文档扫描外的各项探测：语言与包管理器判定、既有门禁命令、既有变异测试配置、既有 Hook 管理器、角色技能可用性。
- 第 3 步的提问与回答归一，以及第 4 步的草案渲染与确认。
- 第 5 步第 1–4 项：清单补缺、依赖安装、可调用核验、基线校验，以及由它们得出的槽位状态。
- 第 5 步第 6 项：登记册的写入与整文件保护。
- 第 5 步第 9 项的三态恢复，和第 6 步的完成报告。

## 测试中的发现

1. **Hook 的槽位状态没有实证。** 四槽 `wired` 来自回答文件的假定。测试证明的是「给定这些状态，Hook 能按它们渲染并通过静态验收」，没有证明命令能运行。
2. **常驻入口有三行指针文字包内没有规定。** 模板 `templates/resident-entry.md` 里的 `__ARTIFACTS_POINTER__`、`__STANDARDS_POINTER__`、`__RELEASE_POINTER__` 只在模板里出现，包内找不到对应文字；只有 `__ROLES_POINTER__` 的文字在 `references/managed-blocks.md` 里写定。这三行由 AI 自行撰写，同一仓库两次装配的文字可能不同，托管块的指纹会随之变化。
3. **想法池与纪要的可见性取值没有判定规则。** `references/managed-blocks.md` 规定了 `visibility` 的取值范围，`SKILL.md` 只说明了 `raw_qa` 何时取 `private-repo` 或 `private-storage`。`ideas`、`minutes` 该填 `public-repo` 还是 `private-repo` 没有写；这个值进入 `input`，填法不同会让重跑误判为输入变化。
4. **重跑只验证了一条路径。** 测试覆盖的是输入完全不变时 `write` 返回 `noop` 且不写盘。`references/managed-blocks.md` §5 的升级、漂移、冲突各分支都没有覆盖。
5. **放基线和 spec 的临时目录必须取真实路径。** `managed_blocks.mjs` 拒绝经由符号链接到达的基线、文件列表与 spec 路径，向上每一级都查，退出码 3。macOS 的系统临时目录在 `/var` 下，而 `/var` 是符号链接；`references/managed-blocks.md` §5.3.1 要求把这些文件放在系统临时目录，没有提要先取真实路径。测试用 `fs.realpathSync.native` 处理。AI 在 macOS 上按文档执行时会不会撞上这条限制，本测试验证不了。
