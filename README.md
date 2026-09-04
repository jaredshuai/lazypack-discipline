# lazypack-discipline

装到任何代码项目上就生效的工程纪律懒人包。地基是 [Matt Pocock 的 skills](https://github.com/mattpocock/skills)，本包只补它没管的部分：角色分工、产物放哪、提交与版本规则、质量门禁、文档跟改、客户变更管理、多 AI 讨论章程。

## 两层结构

- **固定层**：跨项目不变的条文，见 [docs/DECISIONS.md](docs/DECISIONS.md)。改它要走多 AI 讨论章程。
- **项目层**：每个仓库编译一次的平台细节（打包上传、lint/format/类型工具、验证命令）。由 `/lazypack-setup` skill 生成（待写）。

## 目录

| 路径 | 放什么 |
|---|---|
| `docs/DECISIONS.md` | 固定层条文，唯一事实源 |
| `docs/interviews/` | 立项访谈的去敏整理稿；原始记录在私有 vault |
| `docs/reviews/` | 多 AI 讨论留档（按 `<日期>-<议题>/`） |
| `skills/` | `/lazypack-setup`、`/lazypack-harvest`（待写） |

## 来源

2026-09-04 一次完整访谈定稿，见 [docs/interviews/2026-09-04-founding-interview.md](docs/interviews/2026-09-04-founding-interview.md)。原始对话记录（含具体项目细节）存于私有仓库 `lazypack-discipline-vault`，不公开。

## 贡献方式

在真实项目长对话后手动触发 `/lazypack-harvest`，它会向本仓库提 `harvest` 标签的 issue（已脱敏）。issue 走 Matt 的 `triage` 流程，不直接改条文。
