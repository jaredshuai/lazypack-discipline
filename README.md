# lazypack-discipline

装到任何代码项目上就生效的工程纪律懒人包。地基是 [Matt Pocock 的 skills](https://github.com/mattpocock/skills)，本包只补它没管的部分：角色分工、产物放哪、提交与版本规则、质量门禁、文档跟改、客户变更管理、多 AI 讨论章程。

产品目标与设计取舍见 [产品愿景](docs/VISION.md)；维护本仓时，先读 [文档归属与产物登记册](docs/ARTIFACTS.md)。愿景描述目标，实际能力以产品文件与验收证据为准。

## 两层结构

- **固定层**：跨项目不变的条文，当前版本为 0.3.0，见 [docs/DECISIONS.md](docs/DECISIONS.md)。改它要走多 AI 讨论章程。
- **项目层**：每个仓库编译一次的平台细节（打包上传、lint/format/类型工具、验证命令、访谈材料留存策略）。由 [skills/lazypack-setup](skills/lazypack-setup/) skill 生成。

## 目录

| 路径 | 放什么 |
|---|---|
| `docs/VISION.md` | 产品核心思想与设计判断，当前产品方向的正文 |
| `docs/ARTIFACTS.md` | 本仓文档归属、更新触发、入口状态与维护流程 |
| `AGENTS.md` | 维护本仓的 AI 读取入口 |
| `docs/DECISIONS.md` | 固定层条文，当前版本 0.3.0，唯一事实源 |
| `docs/agents/handoff-verification.md` | 多 Agent 跨阶段交接清单与核验指引 |
| `docs/interviews/` | 立项访谈的去敏整理稿；原始记录在私有 vault |
| `docs/reviews/` | 多 AI 讨论留档（按 `<日期>-<议题>/`）；使用具体材料前按登记册核实其状态 |
| `scripts/` | 通用辅助脚本；`scripts/handoff_manifest.js` 提供跨阶段交接同源清单生成与核验 |
| `skills/` | [`skills/lazypack-setup`](skills/lazypack-setup/) 已实现（支持门禁装配、项目自选访谈材料留存指引，以及文档归属首期原位保留与安全登记，当前宿主沙箱已验收）；[`skills/lazypack-harvest`](skills/lazypack-harvest/) 已实现（有限离线验证） |

## 来源

2026-09-04 一次完整访谈定稿，见 [docs/interviews/2026-09-04-founding-interview.md](docs/interviews/2026-09-04-founding-interview.md)。原始对话记录（含具体项目细节）存于私有仓库 `lazypack-discipline-vault`，不公开。

## 贡献方式

在真实项目长对话后手动触发 [`/lazypack-harvest`](skills/lazypack-harvest/)，它会向本仓库提 `harvest` 标签的 issue（已脱敏）。issue 走 Matt 的 `triage` 流程，不直接改条文。

> **说明**：
> - `skills/lazypack-setup` 已集成文档归属首期 preserve-existing，并已合入本地受控迁移引擎（`doc_helper.mjs` 的 scan / plan / exec）及当前 AGY / Windows 限定沙箱验证；外部目标仓通用生产迁移、跨宿主（macOS/Linux）、真实大型旧仓接入、全局安装与发布仍为 UNPROVEN，不宣称生产级全面完成。
> - `skills/lazypack-harvest` 当前完成有限离线验证（状态机阶梯、账本防覆写保护与离线模拟）；真实 GitHub 创建与网络恢复链路尚未验证。运行前需具备可用写通道（如已认证的 `gh` CLI）及目标仓 `harvest` 标签，缺失标签时默认阻断发送。
