请在本地仓库 <REPO_ROOT> 做只读独立复审，判断 S2-FIX-1 是否可通过。

不要调用任何 MCP，不启动子代理；不要运行两个验证套件，不创建/修改/删除文件，不执行 git add/commit/push/reset/clean，不改 Git 配置或安装依赖。

读取：docs/DECISIONS.md、.scratch/lazypack-setup/SPEC.md、docs/reviews/2026-09-05-lazy-setup/vote.md、round-3-ballot.md、work/S3/agy-independent-review.md、work/S2/agy-implementation.md、work/S2/agy-fix-1.md、prompts/agy-S2-fix-1.md、skills/lazypack-setup/ 全部文件，以及 .scratch/lazypack-setup-s2-fix-1/ 证据（只读）。

唯一允许新建报告：../../../../docs\reviews\2026-09-05-lazy-setup\work\S3\agy-fix-1-review.md；若已存在停止，不覆盖；无写盘能力直接返回 Markdown。

独立核查 S3 退回的 3 个 P0、4 个 P1、2 个 P2 是否闭合，并核对作者声称的 40 项回归。重点检查：
1. 推荐安装后的实际执行、退出码、可调用核验和 wired/install-failed/missing 联动；不能接受即 wired。
2. pre-commit.sh 的子 shell 隔离、exit 0、EXIT_CODE 修改、非法状态、wired 空命令、特殊字符和后续门禁失败传递。不要自动把 eval 子 shell 视为安全。
3. 3-way diff 是否已改为可执行的 2-way diff。
4. 模板是否无未打 tag 的在线 URL，来源能否离线定位内置快照。
5. resident-entry 指针是否按 PAUSE/BROKEN/未生成条件省略且无占位符。
6. Configured 与 Runtime Verified 是否分开，Husky/Lefthook/自定义 hooksPath 是否兼容，静态配置不能冒充激活。
7. CRLF/LF/BOM/无尾换行追加时块外字节是否保持。
8. tracker、Agent skills 作用域、真实 gen 计算是否为产品契约而非仅测试模拟。
9. 新验证脚本是否仍含 fs.rmSync、git add/commit 等越界行为；只读检查，不运行。区分真实产品测试、自写模拟、静态断言、LLM 会话。
10. 当前文件内容标识和作者报告是否一致；未验证平台/端到端会话必须保留。

报告格式：
# S3-FIX 独立复审
## 结论
只能写：通过 / 退回修复 / 需要维护者裁决。
## P0
文件:行号、场景、证据、对应票、最小修复；无则写无。
## P1
同上。
## P2
可后续处理。
## 修复覆盖表
F01-F08 各一行，列直接证据、验证类型、能证明什么、未证明什么。
## 测试与边界审计
列出真实产品测试与自写模拟的区别；单列原 S2 add/commit 和递归删除越界是否在本轮避免。
## S2 准入
通过时列最多 5 条后续验收条件；退回时列依赖排序的最小修复清单。

不要改任何产品或审查文件。完成后只返回报告绝对路径和一句结论。
