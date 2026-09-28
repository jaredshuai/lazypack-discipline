# 项目画像：lazypack-discipline

审计日期：2026-09-28  
审计范围：仓库当前 `origin/main`（`b6ebe25`）及其文档、脚本、skills、Git 历史。  
证据原则：以下结论均来自仓库文件或本次在仓库内实际运行的命令；产品愿景中的“目标”与已经验收的“能力”分开描述。

## 项目概览与目标

`lazypack-discipline` 是一个公开的、可安装到其他代码仓库的工程纪律懒人包。它建立在 Matt Pocock 的 skills 之上，补充角色分工、文档归属、提交与版本规则、质量门禁、交接和多 AI 讨论章程。产品有两层：跨项目不变的固定层（当前 0.4.0）和每个目标仓库编译一次的平台/工具细节项目层（`README.md:7-10`，`docs/DECISIONS.md:17-22`）。

愿景是让用户专注产品，把文档整理、检查、接续和安全报告交给 AI；但 `docs/VISION.md` 明确说明愿景不等于所有自动化已经交付。当前仓库已经有两个可用 skill：`lazypack-setup` 负责项目层探测、门禁装配、文档归属和受控迁移；`lazypack-harvest` 负责在用户显式触发后脱敏提炼工程纪律 issue（`README.md:32-36`，两个 `skills/*/SKILL.md` 的 frontmatter 和流程章节）。

## 目录与关键模块

| 区域 | 实际内容 | 关键证据 |
|---|---|---|
| 根入口 | 对外说明、维护入口、忽略规则 | `README.md`、`AGENTS.md`、`.gitignore` |
| 固定层 | 产品愿景、文档归属登记、0.4.0 纪律条文 | `docs/VISION.md`、`docs/ARTIFACTS.md`、`docs/DECISIONS.md` |
| Agent 指引 | 交接核验、文档对子、文档防腐、提交消息检查 | `docs/agents/*.md` |
| 来源与历史 | 去敏访谈稿、按议题归档的三轮多 AI 讨论 | `docs/interviews/`、`docs/reviews/` |
| setup skill | 前置双检、项目探测、最小提问、受控写入、报告契约 | `skills/lazypack-setup/SKILL.md`、`references/`、`templates/`、`scripts/` |
| harvest skill | 会话候选拆分、脱敏、查重、发送状态机 | `skills/lazypack-harvest/SKILL.md`、`references/`、`scripts/` |
| 可执行辅助 | 文档对子检查、提交消息检查、交接清单生成/核验、BOM 回归 | `scripts/check_doc_pairs.mjs`、`scripts/check_commit_msg.mjs`、`scripts/handoff_manifest.js`、`scripts/handoff_bom_classify_repro.js` |

仓库当前有 127 个 Markdown 文件、4 个 JavaScript 文件；没有 `package.json`、锁文件、构建配置或测试框架配置。Node 辅助脚本依赖标准库，只有交接清单的可选 Git blob 视角调用本机 Git（`docs/agents/handoff-verification.md:12`）。

## 固定层的核心模型

- 角色分为规划者、调查者、执行者、审查者、书记员、清道夫；角色输入、输出和可写范围在 `docs/DECISIONS.md:24-49` 固定。
- “一个东西一个家”表把术语、ADR、演变史、参考素材、需求/工单、临时现场、研究、编码标准、发版规则和交接文档分别落位（`docs/DECISIONS.md:51-70`）。
- 提交采用 Conventional Commits 形状并要求 `Closes #n` 脚注；版本、发版和标签语义在 §5，当前 0.4.0 已由 2026-09-22 的三轮讨论和维护者裁定生效（`docs/DECISIONS.md:76-85`，`docs/reviews/2026-09-22-release-tag-semantics/README.md`）。
- 质量门禁目标是 format、lint、type、test 四槽；固定层要求提交前 hook，但目标仓库没有对应命令时必须如实标记 missing/n/a，不能宣称门禁生效（`docs/DECISIONS.md:87-100`，`skills/lazypack-setup/references/verification.md`）。
- 文档更新强调唯一权威、状态区分和可追溯证据；`docs/ARTIFACTS.md` 是本仓文档归属登记册，不是 setup 生成物。

## 当前能力与证据

### 已完成或当前可用

1. 固定层 0.4.0 已落盘，版本标签 `v0.4.0` 指向提交 `4e971c6`；最近提交集中在 2026-09-22 至 2026-09-23 的条文、验收记录和脚本修正。
2. `lazypack-setup` 已包含文档扫描、计划和受控执行器，并在本仓记录为当前宿主/Windows 限定沙箱验收；外部目标仓通用生产迁移、跨环境适配和发布仍明确为 UNPROVEN（`README.md:34-36`，`docs/ARTIFACTS.md:52-56`）。
3. `lazypack-harvest` 已有状态机、脱敏和离线模拟；真实 GitHub 创建与网络恢复链路仍未验证（`README.md:34-36`）。
4. 本次运行 `node scripts/check_doc_pairs.mjs`：P1-P5、P8 共 6/6 PASS；其中链接检查 41 条、失败 0 条。脚本输出明确说明检查器未接 hook/CI，不是门禁。
5. 本次运行 `node scripts/handoff_bom_classify_repro.js`：`PASS cases=6`。这验证 BOM、换行和正文变更分类逻辑，不等于端到端交接流程已验证。

### 未完成、进行中或边界

- 仓库没有自动化 CI、Git hook、定时器或 npm test 入口；当前验证依赖手动命令和 skill 流程。
- setup 的真实外部目标仓生产迁移、macOS/Linux、全局安装与发布仍未证明；不能把本仓沙箱验收外推为通用生产能力。
- harvest 的远端 issue 创建、网络超时恢复和真实标签链路仍未验证；skill 要求目标仓已有 `harvest` 标签，不能自动补标签。
- 愿景中的自动文档维护、视觉约定维护、跨宿主自动接续和安全审查都需以各自试点/验收为准，不能只凭愿景文字宣称交付（`docs/VISION.md` 状态说明）。
- `docs/DECISIONS.md:128-136` 仍列出未定项，包括 setup 提问清单、书记员/清道夫 skill、§4/§6 复审、平台段模板，以及 §5.4/§5.7 语义遗留问题。

## 开发与验证流程

维护本仓时先读 `docs/ARTIFACTS.md`，再按 `docs/agents/freshness-check.md` 识别受影响文档；修改纪律或 skill 时同时读 `docs/DECISIONS.md` 和对应 skill（`AGENTS.md:5-9`）。文档关系变更先改 `docs/agents/doc-pairs.md`，再同步 `scripts/check_doc_pairs.mjs` 的实现约定。

推荐的只读验证顺序：

```text
node scripts/check_doc_pairs.mjs
node scripts/handoff_bom_classify_repro.js
node scripts/check_commit_msg.mjs <message-file> [--rules <path>]
node scripts/handoff_manifest.js generate ...
node scripts/handoff_manifest.js verify ...
```

提交消息检查器只判断标题形状和 type，不判断语义或代码正确性；交接清单工具只读生成/核验清单。两者及文档对子检查均未接 hook/CI（`docs/agents/commit-msg-check.md`、`docs/agents/handoff-verification.md`、`docs/agents/doc-pairs.md`）。

## 风险与缺口

1. **验证自动化缺口**：没有 CI 或统一测试入口，脚本回归容易被遗漏；文档中多处“手动运行、未接 hook/CI”是明确证据。
2. **能力边界易被误读**：愿景、沙箱验收、真实目标仓生产验证混在同一产品叙事中，虽已有免责声明，但看板若不分层会把 UNPROVEN 当成完成。
3. **变更耦合高**：固定层变更要同步快照、模板、登记册和多 AI 讨论材料；`docs/ARTIFACTS.md` 的 P1-P5/P8 关系检查能发现部分漂移，但不覆盖语义正确性。
4. **外部依赖缺证据**：harvest 的 GitHub 写通道、目标标签和超时分支没有本仓可重复的真实测试；setup 的跨宿主行为也缺少矩阵。
5. **角色闭环尚不完整**：规划、执行、审查的固定层映射较清楚，书记员和清道夫仍列为暂无专用 skill，实际看板需要单独追踪。

## 看板重构建议

看板应按“交付状态 + 证据等级”组织，而不是按文件目录堆叠。建议建立以下泳道/项目组：

| 泳道 | 放入事项 | 完成条件 |
|---|---|---|
| 固定层决策 | 纪律条文、ADR、版本/标签语义、多 AI 讨论 | 维护者裁定、正文与快照同步、关系检查通过 |
| setup 能力 | 探测、文档路由、计划、执行器、模板 | 目标场景实跑；报告区分模板/模拟/原生证据 |
| harvest 能力 | 脱敏、查重、状态机、GitHub 发送 | 真实写通道与 `harvest` 标签链路验证，失败状态可恢复 |
| 验证与门禁 | doc-pairs、commit-msg、handoff、未来 CI/hook | 命令可调用、退出码可观测、接线状态与实跑结果分开 |
| 试点与兼容性 | Windows/AGY、本仓、外部目标仓、macOS/Linux | 每个宿主/项目类型单独验收，不跨样本外推 |
| 维护与归档 | 文档防腐、书记员、清道夫、review archive | 登记册更新、历史状态保留、清理关卡有记录 |

每张卡片建议固定字段：`目标/范围`、`责任角色`、`证据等级`（文档、模拟、沙箱原生、外部原生）、`当前状态`（current/UNPROVEN/pending/superseded）、`验证命令`、`影响文件`、`阻塞条件`、`下一步`。这样能把“已实现但未验证”“已验证但仅限单宿主”和“产品愿景”分开，避免误报完成。

推荐的首批看板卡片：

- 将 setup 外部目标仓生产迁移列为 `UNPROVEN`，先补一个可回滚的真实目标仓试点。
- 将 harvest 真实 GitHub 创建与网络恢复列为 `UNPROVEN`，先验证标签前置、超时停发和账本持久化。
- 将固定层 §5.4/§5.7 遗留问题列为待裁决卡，不与实现缺陷混在一起。
- 将书记员、清道夫专用 skill 列为产品能力卡，分别定义触发事件和验收证据。
- 将 CI/手动门禁接线列为工程基础设施卡，先决定是否只在本仓接线，再更新 `docs/ARTIFACTS.md` 的事实记录。

## 关键事实冲突与处理

没有发现同一权威文件之间的直接矛盾。主要是“愿景目标”和“实际能力”之间的有意边界：`docs/VISION.md`、`README.md` 和 `docs/ARTIFACTS.md` 都反复要求不要把目标、沙箱验收或单次试点写成普遍交付。本画像沿用这一分层；后续卡片应继续保留证据等级。

