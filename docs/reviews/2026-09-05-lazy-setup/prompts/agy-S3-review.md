# S3：独立审查 lazypack-setup 实现

请在新的 agy 会话执行本任务，避免沿用 S2 作者“已全部通过”的自评。你是独立审查者，只读产品和验证脚本；不修复实现、不执行原测试套件。

工作仓库：<REPO_ROOT>

## 必读输入

- docs/DECISIONS.md
- .scratch/lazypack-setup/SPEC.md
- docs/reviews/2026-09-05-lazy-setup/vote.md
- docs/reviews/2026-09-05-lazy-setup/round-3-ballot.md（只执行已通过选项）
- docs/reviews/2026-09-05-lazy-setup/prompts/agy-S2-implement.md（S2 的真实授权边界）
- docs/reviews/2026-09-05-lazy-setup/work/S2/agy-implementation.md（作者报告，不作为审查结论）
- skills/lazypack-setup/SKILL.md
- skills/lazypack-setup/references/ 下三份文件
- skills/lazypack-setup/templates/ 下六份模板
- .scratch/lazypack-setup-s2-verify/verify-suite.js

这是 prompt-driven skill，不要求它变成确定性 CLI。检查其指令和模板是否能让执行 agent 正确完成流程；不要因没有产品运行库就把整个交付判失败，也不能把测试脚本中另写的模拟函数当产品行为已经得到验证。

## 权限

1. 产品、规格、固定层、原报告、原选票和验证目录全部只读。不要修改任何原文件，不创建或执行实验，不安装依赖，不改 Git 配置，不启用 hook，不做 git add/commit/push/reset/clean，不递归删除。
2. 不运行 verify-suite.js：它含 fs.rmSync 递归删除和 git add/commit，会重建并改变已有验证现场。本任务不授权这些行为，也不以“预计提交失败”视为无提交操作。
3. 不调用 fast-context 或其他无关 MCP、不启动子代理/后台服务。已知路径的文档和测试脚本可直接只读；若环境强制要求代码索引且不可用，如实报告，不修改全局工具配置。
4. 唯一允许新建的报告绝对路径：
   ../../../../docs\reviews\2026-09-05-lazy-setup\work\S3\agy-independent-review.md
   可创建必要父目录。这是只读审查的唯一写入例外，不授权修改其他 reviews 文件。
5. 报告路径若已存在则停止写入并告知主持人，不覆盖、不另选 v2。无文件能力时返回完整 Markdown，不声称已写盘。

## 审查顺序

先独立读已通过票、S2 提示词、产品和测试代码；再核对下方主持人已发现的疑点。每个发现要给路径:行号、具体触发场景、与实际合同的关系、严重性和最小修复。没有证据的推测标待验证。

### A. 功能与契约

- 前置有效性：空模板、只含 tracker 标题、纯中文本地票据说明是否能正确判断？Agent skills 块之外的路径是否被误认为块内有效指针？domain 缺失不能阻断。
- 显式调用：宿主支持的显式调用约束是否配置，还是只有正文声明？区分宿主兼容性缺口与必现运行错误。
- 依赖安装：流程有没有真正执行已获确认的推荐安装、记录失败，再以安装结果生成 wired/install-failed？不能用户说“接受”就直接 wired。
- 重跑：所有选择能否在新会话从项目产物中读取？input-digest 不可反解，platform 和命令实际值存在哪里？同正文 fp、模板或输入改变时是否正确判 upgrade？
- 指纹：正文末尾换行、BOM、嵌套 JSON、模板目录标识、无哈希工具、重复标记等是否闭合？要求 3-way diff 时原始基线从哪里来？只有哈希能否提供第三份文本？
- 保护用户：文档暂停时是否真的条件化省略对应指针？块外字节不变与“所有写盘统一 LF”是否冲突？恢复只删除本次追加或按差异撤销，不能误删用户原有托管内容。
- Hook：已有自定义 core.hooksPath 但无常见管理器时是否被覆盖？Husky/lefthook 集成入口和激活标准是否匹配？不能一律用 .githooks 判断所有管理器。
- Hook 激活：product verification.md 是否仍把 config/文件/权限三项充分条件等同真实激活？S2 明确要求 Git 实际调用证据，测试跑过一次不能替代用户目标仓的运行期判据。
- Shell 模板：替换含引号、美元符号、命令替换、空格的命令是否有明确引用方式？eval 的 exit 0、exit 非零、覆盖 EXIT_CODE 等是否绕过失败记录或跳过后续检查？未知状态和未渲染占位符是否被错判为可跳过？报告的是可复现控制流，不是泛泛指责 eval。
- 离线来源：模板硬编码的 GitHub owner、v0.2.0 URL 是否有来源证据？没有该 tag 或离线时如何按版本在已安装 skill 内读取快照？不要把一个在线 URL 标成已支持离线解析。
- 固定层忠实度：角色表、规范副本、产物状态、规则引用是否偏离 DECISIONS；避免增加 CLI、额外 YAML、强制 rebase 等未通过范围。

### B. 测试与证据

- 32 项分别证明静态存在、模板直接执行、另写函数模拟、还是完整 skill 会话？建立覆盖表，不用总数量代替覆盖。
- computeFp、computeInputDigest、checkPreflight、inspectManagedFile 是测试内部的函数。其通过不能证明 agent 实际按 SKILL 和 references 行动；核查与文档是否一致。
- missing 后续 wired 项是否断言其实际输出或副作用，而不仅是退出 0？前置失败是否检查零写入？是否覆盖真实不变重跑、块内/块外保护、旧命令恢复、模板升级、断点恢复？
- 模板仅包含 start/end 子串不等于标记完整、匹配、唯一。资源路径列表只验证写死四项，不等于遍历全部链接。
- 禁止提交边界：脚本明确调用 git add 和 git commit，是否超出 S2 提示词？尝试但被拒绝仍是执行了命令。将此作为执行边界问题单列，不能夸大成真实主仓提交已发生。
- 零提交证据：catch 任意 rev-list 错误并赋零不能证明没有提交；只读检查临时仓 refs/HEAD 与有效仓库状态，无法确认就标未验证。禁止重跑提交来证明。
- 清理行为：脚本再次运行会删除什么？不能为复现实验毁掉唯一现场。

## 当前内容标识（主持人已读；不是通过证明）

Git blob 标识：
- SKILL.md：78507d1d403e35101a63008d1527daff9b9973d8
- references/managed-blocks.md：2b8dc91a1fbe7638e0efa7721aaff667d137ae05
- references/verification.md：5ba08fd792a04a86d77b0489c03579a66464d2e6
- templates/pre-commit.sh：e8ec4ddf35d47a0da80870254fe9b0b48b3eb6e8
- verify-suite.js：a12546daead26c5705d42444a53dae3d60a419a1
- S2 作者报告：ce3947339375be949fff2bafc473b86a81220d13
- docs/DECISIONS.md 与 references/DECISIONS.md：均 2b38b1b0543489226eda5e3bd2bf411c58c1c331

可用只读 git hash-object 核对。若内容变化，记录当前标识和差异；不能说自己审的是相同版本。主仓原本存在 README/DECISIONS 的未提交变更，不能直接归责 S2。

## 报告格式

# S3 独立实现审查
- 审查者、已读文件与内容标识
- 方法：静态只读；原测试套件未重跑

## 结论
通过 / 退回修复 / 需要维护者裁决，三选一。

## P0/P1/P2
每条：编号、文件:行号、触发场景、具体证据、对应票/任务约束、最小修复。没有写无。相同根因合并，不按行数堆问题。

## 测试覆盖与声明核对
表格：作者声明 / 实际测试对象与断言 / 能证明的范围 / 缺失证据。

## 执行边界审计
单列 git add/commit 与递归删除，不把合规问题藏进功能测试计数；区分已观察脚本、作者声称执行和当前只读验证到的实际状态。

## 已落实正确部分与未验证项
只写可核实事实；POSIX、本地 Git 激活、端到端会话等分别说明，不作全平台保证。

## 最小修复清单
按依赖排序，给执行者明确允许修改的产品文件建议。不要重开方案，不改原票。若通过则列下一阶段验收条件；若退回则列需要补的回归验证。

完成后返回报告绝对路径和一句结论。主持人随后会直接给修复或收尾提示词，你不要自行修改产品或作者报告。
