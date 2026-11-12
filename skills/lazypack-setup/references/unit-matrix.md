# 单元验证矩阵

> 本文件由 `node scripts/unit_contracts.mjs matrix` 按各单元契约（`*.unit.json`）的 `evidence` 生成，不要手改。改了契约要重新生成，包检查会比对两者是否一致。

## 怎么读

- 一行是一个单元：`core` 是不属于任何配方的通用纪律产物，`preset` 是质量门禁配方，`recipe` 是按需配方。
- 列是操作系统。AI 宿主（Claude Code、Codebuddy 等）和运行时版本不单独成列，写在明细的「环境」一栏。
- 「宿主验收」是在真实环境里实跑过该单元的验证命令或文件写入路径；「夹具测试」是自动测试在本仓夹具上实跑。两者都不等于在你的项目里验证过。
- 格子只表示有过这一类记录。覆盖到哪里、没覆盖什么，以明细的「范围」一栏为准。
- 「未验证」表示没有可公开核对的记录，不表示不能用，也不表示验证失败。
- 记录时的单元版本与当前版本不同，格子里标「旧版」。

## 矩阵

| 单元 | 类型 | 当前版本 | Linux | Windows | macOS |
|---|---|---|---|---|---|
| `lazypack-core` | `core` | 0.7.0 | 夹具测试 [2026-11-11](https://github.com/jaredshuai/lazypack-discipline/actions/runs/42965978337/job/130343195395) | 宿主验收 [2026-10-19](https://github.com/jaredshuai/lazypack-discipline/issues/82#issuecomment-6257868627)<br>夹具测试 [2026-11-11](https://github.com/jaredshuai/lazypack-discipline/actions/runs/42965978337/job/130343195694) | 夹具测试 [2026-11-11](https://github.com/jaredshuai/lazypack-discipline/actions/runs/42965978337/job/130343195371) |
| `python-uv-ruff` | `preset` | 0.1.0 | 未验证 | 未验证 | 未验证 |
| `ts-biome-vitest` | `preset` | 0.1.0 | 未验证 | 未验证 | 未验证 |
| `mutation-testing` | `recipe` | 1.0.0 | 夹具测试 [2026-11-11](https://github.com/jaredshuai/lazypack-discipline/actions/runs/42965978337/job/130343195368) | 未验证 | 未验证 |
| `react-vite-app-shell` | `recipe` | 1.0.1 | 宿主验收 [2026-11-10](https://github.com/jaredshuai/lazypack-discipline/pull/103#issuecomment-6758462755) | 宿主验收 [2026-11-10](https://github.com/jaredshuai/lazypack-discipline/pull/103#issuecomment-6760385015) | 未验证 |

## 证据明细

| 单元 | 系统 | 类别 | 日期 | 单元版本 | 环境 | 范围 | 出处 |
|---|---|---|---|---|---|---|---|
| `lazypack-core` | Linux | 夹具测试 | 2026-11-11 | 0.7.0 | GitHub Actions ubuntu-latest（镜像 ubuntu-26.04 20261101.186.1，Ubuntu 26.04.1）/ Node 24.22.2 | 被测提交 main@54ec0e1。只拷出 skill 目录，在 ts-new、py-new 两份全新夹具上用包内确定性入口装配两遍：包检查，managed_blocks.mjs 的 snapshot / write / verify / render-retention，verify_hook_install.mjs --mode new，三份种子原样复制，changelog.mjs init；第二遍全部无改动。没有执行由 AI 完成的环节，没有安装依赖，没有运行门禁命令和 git hook run pre-commit，没有写 docs/ARTIFACTS.md，不含存量仓与文档迁移。 | [Actions 运行 42965978337 作业 130343195395](https://github.com/jaredshuai/lazypack-discipline/actions/runs/42965978337/job/130343195395) |
| `lazypack-core` | Windows | 宿主验收 | 2026-10-19 | 0.7.0 | Windows 11 专业版 10.0.26300 / PowerShell / Node 24.19.0 / Git for Windows 2.51.0，Multica Windows 宿主 | 有界验收：在系统临时目录的合成仓上运行隔离验收脚本，被测提交 main@323fd1a。六个受管块写入后 managed_blocks.mjs verify 退出 0，verify_hook_install.mjs 返回 CONFIGURED_STATIC_ONLY，git hook run pre-commit 原生调用退出 0。按维护者裁决，这不是完整交互式 /lazypack-setup 的验收，没有重跑 AI 对话环节，也不代表之后的 main。 | [issue #82 评论](https://github.com/jaredshuai/lazypack-discipline/issues/82#issuecomment-6257868627) |
| `lazypack-core` | Windows | 夹具测试 | 2026-11-11 | 0.7.0 | GitHub Actions windows-latest（镜像 windows-2025-vs2026 20261103.298.1，Windows Server 2025 10.0.26100）/ Node 24.22.2 | 被测提交 main@54ec0e1。只拷出 skill 目录，在 ts-new、py-new 两份全新夹具上用包内确定性入口装配两遍：包检查，managed_blocks.mjs 的 snapshot / write / verify / render-retention，verify_hook_install.mjs --mode new，三份种子原样复制，changelog.mjs init；第二遍全部无改动。没有执行由 AI 完成的环节，没有安装依赖，没有运行门禁命令和 git hook run pre-commit，没有写 docs/ARTIFACTS.md，不含存量仓与文档迁移。 | [Actions 运行 42965978337 作业 130343195694](https://github.com/jaredshuai/lazypack-discipline/actions/runs/42965978337/job/130343195694) |
| `lazypack-core` | macOS | 夹具测试 | 2026-11-11 | 0.7.0 | GitHub Actions macos-latest（镜像 macos-26-arm64 20261102.0473.1，macOS 26.7.2）/ Node 24.22.2 | 被测提交 main@54ec0e1。只拷出 skill 目录，在 ts-new、py-new 两份全新夹具上用包内确定性入口装配两遍：包检查，managed_blocks.mjs 的 snapshot / write / verify / render-retention，verify_hook_install.mjs --mode new，三份种子原样复制，changelog.mjs init；第二遍全部无改动。没有执行由 AI 完成的环节，没有安装依赖，没有运行门禁命令和 git hook run pre-commit，没有写 docs/ARTIFACTS.md，不含存量仓与文档迁移。 | [Actions 运行 42965978337 作业 130343195371](https://github.com/jaredshuai/lazypack-discipline/actions/runs/42965978337/job/130343195371) |
| `mutation-testing` | Linux | 夹具测试 | 2026-11-11 | 1.0.0 | GitHub Actions ubuntu-latest（镜像 ubuntu-26.04 20261101.186.1，Ubuntu 26.04.1）/ Node 24.22.2 / Python 3.12.16 | 被测提交 main@54ec0e1。本仓 sample-ts、sample-py 两份夹具上按 workflow 模板逐步模拟执行夜间回路，Stryker 与 mutmut 2.x 实跑。不是真实目标仓的定时运行，没有覆盖 cron / systemd 触发面，也没有真实创建 issue。 | [Actions 运行 42965978337 作业 130343195368](https://github.com/jaredshuai/lazypack-discipline/actions/runs/42965978337/job/130343195368) |
| `react-vite-app-shell` | Linux | 宿主验收 | 2026-11-10 | 1.0.1 | Linux / Node 24.22.2 / npm 11.19.1 | 起始副本拷到系统临时目录的独立目录：npm ci 退出 0 且未改写 lockfile，SHA256SUMS 19/19，typecheck、lint、test（5/5）、build 全部退出 0。没有覆盖配方 §5.1 的 PowerShell 复制脚本，也不是经 /lazypack-setup 对话装配。 | [PR #103 评论](https://github.com/jaredshuai/lazypack-discipline/pull/103#issuecomment-6758462755) |
| `react-vite-app-shell` | Windows | 宿主验收 | 2026-11-10 | 1.0.1 | Windows 11 专业版 10.0.26200 / Windows PowerShell 5.1 / Node 24.21.0 / npm 12.1.0 / core.autocrlf=true，Multica 上的 Codebuddy agent | 从提交 00b364b 检出：配方 §5.1 复制脚本只把开头的 $src、$dst 赋值改成参数、其余原样，实跑三条路径（空目标写入 40 个文件、重跑零写入、源目录不存在零写入），§5.2 哈希 19/19，npm ci 与 typecheck、lint、test、build 全部退出 0，Edge 157 宽屏渲染正常。第一次 npm ci 十分钟无输出被终止，重跑通过，原因未查明。没有覆盖浏览器里的搜索与筛选交互、窄屏视口，也不是经 /lazypack-setup 对话装配；当时起始副本在仓库根 templates/，后迁入 skill 的 assets/。 | [PR #103 评论](https://github.com/jaredshuai/lazypack-discipline/pull/103#issuecomment-6760385015) |
