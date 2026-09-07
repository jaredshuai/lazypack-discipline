# S4：文档收尾与状态落地

请在新的 agy 会话执行文档收尾任务。不要修改产品实现；只根据已经存在的证据更新项目文档和状态。

工作仓库：<REPO_ROOT>
必须读取：
- README.md
- docs/DECISIONS.md
- docs/reviews/2026-09-05-lazy-setup/synthesis.md
- docs/reviews/2026-09-05-lazy-setup/vote.md
- docs/reviews/2026-09-05-lazy-setup/work/S2/agy-implementation.md
- docs/reviews/2026-09-05-lazy-setup/work/S2/agy-fix-1.md
- docs/reviews/2026-09-05-lazy-setup/work/S3/agy-independent-review.md
- docs/reviews/2026-09-05-lazy-setup/work/S3/agy-fix-1-review.md
- 系统临时报告 <TEMP_DIR>/lazypack-discipline-handoff/smoke-1-reconcile\result.md
- skills/lazypack-setup/ 当前文件清单

## 允许修改

仅允许修改：
- README.md
- docs/reviews/2026-09-05-lazy-setup/synthesis.md
- 新建 docs/reviews/2026-09-05-lazy-setup/work/S4/agy-doc-closeout.md

禁止修改 docs/DECISIONS.md、SPEC.md、skills/lazypack-setup/、任何历史报告、选票、计票、临时 fixture、系统临时报告。禁止 git add/commit/push/reset/clean。不要删除 .scratch；SPEC 仍是项目规划证据，是否归档只在报告中建议，不执行删除。

报告唯一系统临时路径：
<TEMP_DIR>/lazypack-discipline-handoff/s4-doc-closeout\result.md
先检查该路径不存在；存在则停止，不覆盖、不改 v2。创建父目录即可。最终在仓库 work/S4/ 写同一份收尾摘要，并在系统临时目录写完整报告；两份内容要一致。若不能写系统临时目录，返回完整 Markdown，不声称已写盘。

## 必须落地的文档事实

1. README 的目录和状态应反映：skills/lazypack-setup 已实现；当前版本固定层为 0.2.0；README 不再把 setup 说成“待写”。harvest 仍待写，不能提前标完成。
2. synthesis.md 更新路线：三轮讨论 Done；S1 规格 Done（主持人修订并经两次 agy 复审）；S2 实现 Done（S3 首轮退回后修复，S3-FIX 独立复审通过）；S3 隔离试用 Done with limits；S4 文档收尾 In Progress 或 Done，按你实际完成情况填写。
3. synthesis 必须明确验证边界：
   - 已真实试用：Windows 11 + PowerShell + Node 24 + Git for Windows/MSYS2；missing 前置零写入；happy fixture 一次真实用户确认后写入；PAUSE 人工 ARTIFACTS；CRLF 常驻入口块外字节保护；Git hook run 调用；四项门禁通过；同一会话脚本辅助 no-op。
   - 仅脚本/静态或作者证据：40 项修复回归、产品文档和模板静态一致性、部分隔离 hook 证据；主持人没有重跑验证套件。
   - 未验证：Claude/Cursor/Windsurf 多模型；独立跨会话无脚本自主重跑；Linux/macOS POSIX 权限；真实 pnpm/uv registry 安装；微信/DevEco 发布。
   不要写“全部通过”“生产可用”“跨平台已验证”。
4. synthesis 的 Next Target 设为：可选的真实目标项目试点，或由维护者决定是否进入 harvest；不能自动开始外部发布。
5. docs/reviews README 若有“待提交/待投票/尚无决议”等历史状态，只在不破坏历史叙述的情况下补当前入口链接；不改历史原文。
6. 收尾报告列出修改文件、每条证据来源、未验证限制、没有执行的动作和下一步建议。区分报告里的历史自评错误与校正报告的最终数字，不覆盖历史错误。

## 质量检查

- 运行只读 Markdown 链接检查和 git diff --check；不运行旧验证套件。
- 检查 README 链接到 synthesis、当前产品路径存在。
- 不要把系统临时报告的绝对路径写进公开 README；仓库内只引用可提交的仓库相对路径或描述性名称。
- 修改后不要提交。报告中记录主仓原有 README/DECISIONS dirty 状态未被你处理。

完成后在聊天只回复：完成；并给出系统临时报告绝对路径。
