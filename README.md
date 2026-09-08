# lazypack-discipline

装到任何代码项目上就生效的工程纪律懒人包。地基是 [Matt Pocock 的 skills](https://github.com/mattpocock/skills)，本包只补它没管的部分：角色分工、产物放哪、提交与版本规则、质量门禁、文档跟改、客户变更管理、多 AI 讨论章程。

## 两层结构

- **固定层**：跨项目不变的条文，当前版本为 0.2.0，见 [docs/DECISIONS.md](docs/DECISIONS.md)。改它要走多 AI 讨论章程。
- **项目层**：每个仓库编译一次的平台细节（打包上传、lint/format/类型工具、验证命令、访谈材料留存策略）。由 [skills/lazypack-setup](skills/lazypack-setup/) skill 生成。

## 目录

| 路径 | 放什么 |
|---|---|
| `docs/DECISIONS.md` | 固定层条文，当前版本 0.2.0，唯一事实源 |
| `docs/handoff-verification.md` | 多 Agent 跨阶段交接清单与核验指引 |
| `docs/interviews/` | 立项访谈的去敏整理稿；原始记录在私有 vault |
| `docs/reviews/` | 多 AI 讨论留档（按 `<日期>-<议题>/`）；当前进展见 [lazy setup 实施基线](docs/reviews/2026-09-05-lazy-setup/synthesis.md) |
| `scripts/` | 通用辅助脚本；`scripts/handoff_manifest.js` 提供跨阶段交接同源清单生成与核验 |
| `skills/` | [`skills/lazypack-setup`](skills/lazypack-setup/) 已实现（支持门禁装配与项目自选访谈材料留存指引）；[`skills/lazypack-harvest`](skills/lazypack-harvest/) 已实现（有限离线验证） |

## 来源

2026-09-04 一次完整访谈定稿，见 [docs/interviews/2026-09-04-founding-interview.md](docs/interviews/2026-09-04-founding-interview.md)。原始对话记录（含具体项目细节）存于私有仓库 `lazypack-discipline-vault`，不公开。

## 贡献方式

在真实项目长对话后手动触发 [`/lazypack-harvest`](skills/lazypack-harvest/)，它会向本仓库提 `harvest` 标签的 issue（已脱敏）。issue 走 Matt 的 `triage` 流程，不直接改条文。

> **说明**：当前完成有限离线验证（状态机阶梯、账本防覆写保护与离线模拟）；真实 GitHub 创建与网络恢复链路尚未验证。运行前需具备可用写通道（如已认证的 `gh` CLI）及目标仓 `harvest` 标签，缺失标签时默认阻断发送。
