# S3-SMOKE-1：真实 skill 会话隔离试用

请用新的 agy 会话执行。你是试用者，不是产品修复者。S2-FIX-1 已通过静态独立复审，现在验证产品 skill 在真实 agent 会话中的行为，而不是再次编写替代状态机。

源仓库：<REPO_ROOT>
产品：../../../../skills\lazypack-setup\SKILL.md
必读：该 SKILL 及其引用资源；docs/reviews/2026-09-05-lazy-setup/vote.md；work/S3/agy-fix-1-review.md（两个报告相对前述讨论目录）。

## 允许写入

唯一新试用根：../../../../.scratch\lazypack-setup-s3-smoke-1\
唯一新报告：../../../../docs\reviews\2026-09-05-lazy-setup\work\S3\agy-smoke-1.md

创建前确认试用根和报告均不存在；有同名既有成果就停并报告，不覆盖、不自选 v2。开始后可以更新自己在该根创建的试验文件。只能在报告父目录创建必要目录，不改其他 reviews 文件。

产品、SPEC、固定层、README、所有旧报告和旧验证现场全部只读。禁止修复产品、安装全局 skill/依赖、联网安装工具、创建 remote、git add/commit/push/reset/clean、递归删除或移动目录。Git 本地配置只允许改试用根内的独立 Git 仓；切换目录前核对 git 根确实是当前 fixture，不是源仓库。

这次是按已知路径执行 skill，不为试用触发无关 MCP 或配置索引，不启动其他 AI/后台服务。禁止重跑任一旧 verify-suite.js。也不能用一套新脚本替代 skill 的探测、判定、渲染、写入和报告；可用小工具读文件、算哈希、检查字节和执行生成的 hook。

## 先建立可控 fixture

在试用根中创建两个独立子项目 happy/ 与 missing/，各自 git init，不配置 remote、不创建提交。记录全部初始文件的内容指纹作为试验基线。

happy/ 是最小 Node/JS 项目：
- package.json 的 format/lint/type/test 四个 npm scripts，分别使用一个 fixture 自带的 Node 检查文件验证不同的简单条件；只用 Node 内置能力，不安装任何包、不以简单 echo 冒充功能测试。type 明确是本 fixture 既有命令，不宣称它是通用 JS 类型检查工具。
- 提供可被这些命令检查的小源文件。检查器、manifest 等都是 fixture 准备物，要标明不是 lazypack 产品实现。
- CLAUDE.md 使用 CRLF，带开头和结尾人工哨兵文字、有效 ## Agent skills 块及 tracker 相对指针。
- docs/agents/issue-tracker.md 是非空中文实质说明（本地任务记录）；domain.md 不创建。明确这是模拟 Matt 已配置的 fixture，不声称实际跑过 Matt setup。
- 提供已有、无 lazypack 标记的 docs/ARTIFACTS.md，含一条人工素材记录，供测试 PAUSE/保留/省略指针。
- 平台信息明确为“无发布平台”。无 hook 管理器、无自定义 hooksPath，除此不预生成 lazypack 产物或元数据。
- 可放一个与 setup 无关的未跟踪说明文件，用来确认无关脏工作区不阻塞。

missing/ 只创建最小项目文件，不给有效 tracker/Agent skills 前置，用于零写入失败路径。

## 真实试用步骤

1. 先核对当前 Node/Git 可用。不可用就报告环境阻断，不擅自安装。
2. 在 missing/ 调用实际产品 skill。若宿主支持从给定路径加载 skill，用该方式；否则完整读取 SKILL 并按其资源逐步执行，记录为“从文件加载的 agent 会话”，不能称斜杠命令已注册成功。确认前置失败、给正确接力提示、fixture 文件与本地 Git 配置零写入。
3. 切到 happy/，从同一产品 SKILL 开始实际 setup。这里的目标仓是 happy/，绝对不能把源仓当安装目标。不得将 product 作者测试函数作为流程执行引擎。
4. 在 fixture 的事实足够时不问重复配置问题；查不到的必要未知按产品规则询问并记录原因。展示完整拟写内容、PAUSE 项、指针省略和本地 hooksPath 等实际副作用。
5. 此次试用必须让真实维护者在当前会话确认一次后再写 lazypack 产物；提示词本身不充当这次确认。准备 fixture 已获授权，产品写入确认尚未发生。严禁虚构用户“确认”、自问自答或把同意测试等同实际确认交互已验证。
6. 等用户回复后，继续按产品执行写入。ARTIFACTS 人工文件必须保留，常驻入口省略对应链接，其他可生成产物正常生成。不得为了让用例通过私下改产品。
7. 对真实生成的 hook 使用 git hook run pre-commit，记录 Git 调用证据与四项检查实际退出结果。该命令会执行 hook，并非只读；权限仅限 happy/ 本地 fixture 的这些受控命令。严禁 git commit。
8. 记录首次运行后的文件字节与本地配置。然后重新从磁盘读取配置，第二次按 SKILL 运行；不复用第一次内存中手工算好的 input/fp/gen，不以“我刚算过”跳过读取。这个动作检验同一会话的重新读取，不声称独立跨会话或多模型验证。
9. 没有新增变化时，第二次不能再次要求写入确认，也不能改任何生成文件或本地配置。既有 ARTIFACTS 的 PAUSE 可以再次说明，但不能把它误当新增变更或诱发重复确认。失败照实记录。
10. 逐字节核对人工 ARTIFACTS、CLAUDE 托管块外 CRLF/哨兵、无关文件、原 fixture 源码；核对生成标记匹配、无残留占位符、input/fp/gen 可追溯、无新 CLI/YAML、源产品未动。

## 报告

记录真实用户看到的提问、确认请求和用户实际回复；不要复制整段冗长内部推理。明确宿主、模型（可查才填）、产品内容标识、fixture 初始条件、每一步实际命令/动作及输出摘要。

覆盖表逐项列：前置失败零写入；缺 domain 不阻断；必要问题数量及原因；真实一次确认；人工文件 PAUSE 与条件指针；块外字节保护；Git hook 实际调用；第二次 no-op；独立跨会话/其他平台等未验证。

若出现差异，区分产品指令缺陷、agent 没按指令执行、fixture/环境问题；给路径与证据，不为了通过去修产品。不得把静态断言或模拟测试再当本轮真实会话成功。

完成后写唯一报告 agy-smoke-1.md，结论为“试用通过，可准备文档收尾”或“试用退回，列出问题”。返回绝对路径；不自己改 README、发布或清理现场。

本次只关闭本机一次实际 skill 会话的证据缺口。原生 Linux/macOS、多模型、真实 registry 安装及微信/DevEco 实操不是新增首版硬门槛，未执行就保留未验证。它们不能被这次试用自动标为通过。
