# 固定层条文

版本：0.2.0（2026-09-05 lazy setup 三轮讨论通过）
状态：生效。改动任何一条须走 §9 讨论章程，并按 SemVer 升本文件版本号。

本文件是 lazypack-discipline 固定层的**唯一事实源**。项目层文件（`AGENTS.md`、`CODING_STANDARDS.md`、`RELEASE.md` 等）由 `/lazypack-setup` 从本文件编译得出，出现分歧以本文件为准。

---

## 1. 地基与边界

1.1 地基是 Matt Pocock 的 skills。本包只补它没管的部分，不替代、不并行复述。
1.2 `/understand-codebase` 是唯一的代码理解入口（依赖 codegraph / codebase-memory / fast-context 三个 MCP）。
1.3 只维护一份常驻规则文件（`AGENTS.md` 或 `CLAUDE.md`，取已存在者），不平行写 `.cursor/rules` 复述同一批纪律。
1.4 每条纪律只活在一处。同一句话不得同时出现在 `AGENTS.md`、`CONTEXT.md`、演变史里。

## 2. 两层结构与编译

2.1 **固定层**：本文件全部条文。
2.2 **项目层**：平台怎么打包上传、lint/format/类型工具、验证命令、错误码是否启用。
2.3 **编译器** `/lazypack-setup`：在 `setup-matt-pocock-skills` 之后运行，问项目层问题，写出 `AGENTS.md` 指针、`CODING_STANDARDS.md`、`RELEASE.md`、`docs/ARTIFACTS.md` 骨架、`docs/agents/roles.md`、提交前 hook。能接到已有 format/lint/type/test 命令则写出提交前 hook；否则标明未接线或不适用及原因，不得宣称门禁已生效。
2.4 项目层默认值可由多 AI 头脑风暴扩展（含技术栈选型），不必开 §9 会议。

## 3. 角色

3.1 角色是固定层；角色到 skill 的映射是可换的适配层，不强绑。

| 角色 | 输入 | 输出 | 允许写 |
|---|---|---|---|
| 规划者 | 用户意图 + 调查者报告 | 规格、票、ADR / CONTEXT 更新 | 文档、issue；不写代码 |
| 调查者 | 规划者的问题 | 短报告（事实 + 出处） | 只读 |
| 执行者 | 一张票 | 提交（含 diff 涉及的文档行） | 代码、测试、与 diff 直接相关的文档行 |
| 审查者 | diff + 票 + 编码标准 | 通过 / 退回清单 | 只写审查意见 |
| 书记员 | 一段时间的提交 + 全部文档 | 文档修补提交 | `docs/`、`CONTEXT.md`、`CHANGELOG.md`；不碰代码 |
| 清道夫 | 已关票、已合分支、登记册 | 删 `.scratch/`、归档废弃产物、清死分支 | 只删和移动，不新增 |

3.2 「允许写」列是防撞车边界：两个角色不得写同一类文件。
3.3 规划者长驻 `main`。同一设备同一时刻只有一个执行者写代码，直接在 `main` 提交。跨设备协作靠 issue 认领人（assignee），不靠文件系统。少用 worktree。
3.4 书记员在每张票关闭后扫一遍；清道夫在每次发版前扫一遍。事件驱动，不用定时器。
3.5 角色 → skill 映射写在仓库 `docs/agents/roles.md`，换 skill 只改这张表。立项时映射：

| 角色 | 当前 skill |
|---|---|
| 规划者 | `grill-with-docs` → `to-spec` → `to-tickets` |
| 调查者 | `/understand-codebase`、`/research` |
| 执行者 | `implement`（内部 `tdd`） |
| 审查者 | `code-review` |
| 书记员 | `retro` 的文档部分（暂无专用 skill） |
| 清道夫 | 暂无 skill，靠条文 |

## 4. 什么放哪

4.1 原则：一个东西只有一个家；能推出来的不手写；有生命周期的写清何时死。

| 东西 | 家 | 何时清 |
|---|---|---|
| 词汇表（术语、边界） | `CONTEXT.md`，只放词，不放实现 | 词过时即改，不留旧词 |
| 难逆转的决定 | `docs/adr/NNN-*.md` | 不删；被取代改「已取代」并指向新 ADR |
| 演变史（为什么变） | `docs/HISTORY.md`，只记转向 | 不删 |
| 设计稿 / 参考图 / 外部素材 | `docs/reference/` + `docs/ARTIFACTS.md` 登记状态 | 废弃 → `git mv` 至 `docs/archive/`，登记行同步 |
| 规格、票的草稿 | `.scratch/<feature>/` | 票关闭即删整个目录 |
| 原型代码 | `prototype/<名>` 分支 | 留证，不合回 `main` |
| 研究笔记 | `docs/research/` | 结论进 ADR 或 CONTEXT 后冻结 |
| 编码标准 | `CODING_STANDARDS.md`，由审查者执行 | 工具能查的条目移进 lint 配置后删 |
| 发版规则 | `RELEASE.md`：固定段 + 平台段 | 换平台改平台段 |
| 给 agent 的按需说明 | `docs/agents/<主题>.md` | 被闸门或工具替代后删 |
| 生成物（字体、图标、数据） | 源与生成器登记在 `docs/ARTIFACTS.md` pipeline 区 | 勿手改，重跑生成 |
| 交接文档 | 系统临时目录 | 用完即弃 |
| `AGENTS.md` | 只放指针 + 每会话必踩的几条 | 超过一屏往下挪 |

4.2 产物登记册状态词：`current` / `reference` / `exploration` / `superseded` / `pipeline` / `wip`。`current` 在同一类里唯一。
4.3 册上查不到的产物视为未登记：先问维护者，不按文件名或日期猜新旧。

## 5. 提交、版本、发版

5.1 提交头：Conventional Commits 1.0.0，`type(scope)!: 描述`。type 用 Angular 8 个（`build ci docs feat fix perf refactor test`）加 `chore` `revert`。脚注 `Closes #n` 关联票。
5.2 提交正文：Google CL 描述法——第一行独立说清「改了什么」；正文说「为什么」、有哪些没做好的地方、关联 bug 号。
5.3 版本号：SemVer 2.0.0。
5.4 提交 → 版本：`!` 或 `BREAKING CHANGE` → major；`feat` → minor；`fix` / `perf` → patch；其余不触发发版。
5.5 变更记录：Keep a Changelog 1.1.0 格式，由提交生成，不手写。
5.6 后端错误码：`google.rpc.Code` 字符串枚举，不用数字（项目层按需启用）。
5.7 打包上传属项目层（微信开发者工具 / DevEco / npm publish 等），写在 `RELEASE.md` 平台段。每次发版打 git 标签。

## 6. 质量门禁

6.1 提交前 hook 跑：格式 + lint + 类型 + 测试。能写成闸门的纪律先写闸门，再写散文。
6.2 默认工具：JS/TS 用 `biome`；Python 用 `uv` + `ruff` + `ty`。其他语言由 `/lazypack-setup` 问。
6.3 `CODING_STANDARDS.md` 由审查者在审查时执行；工具能查的不写进去。
6.4 `AGENTS.md` 明写：执行者和审查者都必须跑门禁。两边都没跑的概率靠对抗性审查压低。
6.5 质量双轨：可测层（领域逻辑、数据推导）行为改动必须配套断言；迭代层（页面、组件）以语法/类型检查为底线，推导逻辑下沉到可测层。

## 7. 文档跟着改

7.1 主路是流程：规划者边问边写 CONTEXT / ADR；执行者提交时同步 diff 涉及的文档行；书记员关票后补全局视角。
7.2 机器只拦能判断的几条（「改了 X 却没动 Y」），具体对子由项目层定义。
7.3 客户或需求方改主意：新决议先进 `grill-with-docs`；结果落 ADR 并写明取代哪条；受影响产物在登记册改状态；ADR 与登记册互指。
7.4 ADR 只在三条全中时写：难逆转、没上下文会奇怪、真有取舍。
7.5 交接只写本会话亲自验证过的事实；未验证标「未验证」。引用文件用路径，不复制正文。
7.6 工具调用未达预期时如实报告：哪个工具、做了什么、卡在哪、缺什么；不拼凑、不跳步。

## 8. 自提炼 `/lazypack-harvest`

8.1 手动触发。读当前会话，向公开仓库 `lazypack-discipline` 提 issue，标签 `harvest`。
8.2 issue 正文：来源项目类型（不写名字）/ 会话日期 / 观察到的疼 / 建议改哪层哪条 / 证据摘要。
8.3 脱敏写进 skill：不写项目名、路径、账号、环境 ID。
8.4 issue 走 Matt 的 `triage`（`needs-triage → ready-for-agent`）。不直接改条文，不碰当前项目。

## 9. 多 AI 讨论章程

9.1 只有改固定层条文才开会。项目层默认值随手改。
9.2 主持人不投票、不提方案，只做三件事：生成每位参与者的提示词、分配对手、汇总。
9.3 三轮封顶：第一轮独立提交（互不可见）→ 第二轮互评（每人至少驳一人、至少认一人）→ 第三轮修订后投票。不开第四轮，僵局交维护者裁。
9.4 参与者数量不固定，但须奇数；只有两个可用时，维护者是第三票。
9.5 全程留档：每人每轮原文 + 投票结果 + 裁决，进 `docs/reviews/<日期>-<议题>/`。
9.6 本章程属固定层，改它也要开会。

## 10. 仓库

10.1 公开 `lazypack-discipline`：条文、去敏访谈整理稿、skills、reviews。
10.2 私有 `lazypack-discipline-vault`：原始对话记录及含项目细节的材料。
10.3 公开材料一律去掉客户名、路径、环境 ID。

---

## 未定项

- `/lazypack-setup` 的提问清单与生成模板。
- 书记员、清道夫的专用 skill。
- 7.2 中「改了 X 没动 Y」的具体对子。
- §4 表与 6.2 工具组合待多 AI 讨论复审。
- 平台段模板：微信小程序、鸿蒙 DevEco 先写两份。
