# S3 独立实现审查

- **审查者**：S3 独立审查者 (agy)
- **审查日期**：2026-09-05
- **方法**：静态只读审查与代码静态分析；原测试套件 (`verify-suite.js`) **严格未重跑**（避免破坏隔离现场与触发违规提交尝试）。
- **已读文件与 Git blob 内容标识核对**：
  - `skills/lazypack-setup/SKILL.md`: `78507d1d403e35101a63008d1527daff9b9973d8`（核验一致）
  - `skills/lazypack-setup/references/managed-blocks.md`: `2b8dc91a1fbe7638e0efa7721aaff667d137ae05`（核验一致）
  - `skills/lazypack-setup/references/verification.md`: `5ba08fd792a04a86d77b0489c03579a66464d2e6`（核验一致）
  - `skills/lazypack-setup/templates/pre-commit.sh`: `e8ec4ddf35d47a0da80870254fe9b0b48b3eb6e8`（核验一致）
  - `.scratch/lazypack-setup-s2-verify/verify-suite.js`: `a12546daead26c5705d42444a53dae3d60a419a1`（核验一致）
  - `docs/reviews/2026-09-05-lazy-setup/work/S2/agy-implementation.md`: `ce3947339375be949fff2bafc473b86a81220d13`（核验一致）
  - `docs/DECISIONS.md`: `2b38b1b0543489226eda5e3bd2bf411c58c1c331`（核验一致）
  - `skills/lazypack-setup/references/DECISIONS.md`: `2b38b1b0543489226eda5e3bd2bf411c58c1c331`（核验一致）
  - 关联输入文件：`.scratch/lazypack-setup/SPEC.md`、`docs/reviews/2026-09-05-lazy-setup/vote.md`、`docs/reviews/2026-09-05-lazy-setup/round-3-ballot.md`、`docs/reviews/2026-09-05-lazy-setup/prompts/agy-S2-implement.md`、`templates/` 下全部 6 份模板及 `.scratch/lazypack-setup-s2-verify/` 验证现场。

---

## 结论

**退回修复**

（判定理由：存在 3 项 P0 阻塞级缺陷与 4 项 P1 严重缺陷。核心问题包括：依赖安装流程未真正执行导致 `wired`/`install-failed` 门禁契约断裂；Shell Hook 进程未做子 shell 隔离导致内含 `exit 0` 时可击穿并跳过后续检查，且通配分支静默放行；3-way diff 缺乏原始基线成为不可执行的纸面承诺；Markdown 模板硬编码未打 tag 的外部 URL 且误称离线快照；常驻入口指针在整份产物暂停时未做条件化省略；Hook 激活判定违背 S2 约束降级为静态三项配置并硬编码路径导致管理工具不兼容。所有缺陷均可在 S2 原授权目录 `skills/lazypack-setup/` 内实施最小修复，无需重开方案或修改选票。）

---

## P0/P1/P2

### P0 缺陷（阻塞级）

#### P0-1: 依赖安装执行缺失，导致 `wired` 与 `install-failed` 门禁契约断裂
- **文件:行号**：[`skills/lazypack-setup/SKILL.md:55-58, 64, 70, 78-94`](../../../../../skills/lazypack-setup/SKILL.md#L55-L94)
- **触发场景**：代码仓缺失某项门禁工具（如 `format` 或 `lint`），setup 执行第 3 步向用户推荐安装固定层默认工具（如 `biome` 或 `uv/ruff`），用户在第 4 步整体确认中同意采纳并安装。
- **具体证据**：
  1. `SKILL.md` 第 5 步（第 78-94 行）列出的写盘顺序仅包含：1. 先写新建产物（含 `.githooks/pre-commit`）；2. 后改既有入口；3. 生效副作用（`git config` 与 `chmod +x`）。流程中**完全缺失“执行依赖安装”的具体动作**；
  2. 按照现有流程，在第 5.1 步中，`.githooks/pre-commit` 会直接依据第 4 步草案将该项渲染为 `wired` 并写盘；
  3. 若后续真正执行安装但安装失败（如网络中断、包名冲突、依赖锁定版本冲突等），由于 Hook 脚本已提前落盘为 `wired`，根本无法按规范转为 `install-failed`，导致门禁尝试调用实际未装上的命令；
  4. 用户表示“接受推荐”不能直接等同于 `wired`，必须以实际安装命令的退出状态来决定写入 `wired` 还是 `install-failed`。
- **对应票/任务约束**：V13 (`RECOMMEND`), V14 (`A`), V15 (`A`), SPEC §57-59（“四项门禁分别记录：wired、missing、install-failed、n/a... 运行失败和安装失败分开。受控 hook 对 install-failed 必须阻断并报告”）。
- **最小修复**：
  - 在 `SKILL.md` 第 5 步执行流中明确规定：若用户接受了推荐工具，先在目标项目执行实际安装命令（如 `pnpm add -D @biomejs/biome` 或 `uv add --dev ruff`）；
  - 检查安装命令退出码：若成功，门禁状态生成为 `wired`；若失败，门禁状态生成为 `install-failed`，写入 Hook 脚本并在完成报告中明确指出依赖安装失败，阻断提交。

#### P0-2: `pre-commit.sh` Shell 进程未隔离、通配静默放行与命令引用注入风险
- **文件:行号**：[`skills/lazypack-setup/templates/pre-commit.sh:17-36, 41-58`](../../../../../skills/lazypack-setup/templates/pre-commit.sh#L17-L58)
- **触发场景**：
  1. 某门禁命令内部包含 `exit 0`（如复合脚本、容错包装命令 `npm run lint || exit 0` 或工具脚本执行成功后显式调用 `exit 0`）；
  2. 某门禁命令内部使用或修改了环境变量 `EXIT_CODE`；
  3. 模板占位符渲染遗留（如保留 `__FORMAT_STATUS__`）或状态值拼写错误；
  4. 门禁命令包含双引号、空格或特殊字符（如 `biome format --write "src/**/*.ts"`、`pytest -k "not slow"`）。
- **具体证据**：
  1. 第 17 行直接执行 `if ! eval "$GATE_CMD"; then`。由于 `eval` 在当前 shell 进程上下文中执行，一旦 `$GATE_CMD` 内部调用了 `exit 0`，整个 `pre-commit` 进程将立即以退出码 0 终止，**后续所有门禁（Lint、Type、Test）被直接穿透并跳过**！若命令内部执行了 `EXIT_CODE=0`，也会覆盖掉先前失败项置位的 `EXIT_CODE=1`；
  2. 第 34-36 行 `case "$GATE_STATUS"` 中的通配分支 `*)` 仅打印 `unknown status ($GATE_STATUS), skipped`，**没有设置 `EXIT_CODE=1`**！在模板替换失败或遇到非法状态时，门禁默认作为成功放行（Fail-open），直接违反质量门禁防御原则；
  3. 第 41-58 行采用 `FORMAT_CMD="__FORMAT_CMD__"` 双引号直接内联替换。若实际命令含有双引号，将破坏 shell 语法；若含有 `$` 或反引号，在赋值时即发生意外变量求值或命令替换。
- **对应票/任务约束**：V14 (`A`), V15 (`A`), DECISIONS §6.1, S2 提示词第 53 行（“已配置命令失败必须传递失败，不能被后续成功掩盖”）。
- **最小修复**：
  - 将 `if ! eval "$GATE_CMD"; then` 改为在子 shell 中求值以隔离退出状态与变量：`if ! ( eval "$GATE_CMD" ); then` 或 `sh -c "$GATE_CMD"`；
  - 将通配分支 `*)` 改为安全失败（Fail-closed）：打印错误并置位 `EXIT_CODE=1`；
  - 在 `references/managed-blocks.md` 中增加命令字符串转义与安全引用规范，或在模板中采用安全的传参方式。

#### P0-3: 3-way diff 缺乏原始基线，属于不可执行的纸面伪契约
- **文件:行号**：[`skills/lazypack-setup/references/managed-blocks.md:110`](../../../../../skills/lazypack-setup/references/managed-blocks.md#L110)
- **触发场景**：用户在既有托管块内手工修改了正文（`fp` 发生变化），同时外部固定层升级或项目命令发生变更（`input` 发生变化），重跑 setup 时落入 `[CONFLICT]` 分支。
- **具体证据**：`managed-blocks.md` 第 110 行规定：`fp 不同 且 input 不同 ──> [CONFLICT] 双重变动，显著告警，展示 3-way diff 待确认`。然而，托管块头部只存储了 `fp=<sha256-16>` 散列摘要，根本没有在本地保留上次生成的“原始基线文本 (Base)”；Skill 本身也不包含旧版本模板库。对于仅依赖 prompt 的 LLM 或工具而言，**从 16 位哈希值中逆向还原出原始文本 Base 在物理上是不可能的**！在没有 Base 的情况下宣称“展示 3-way diff”是不可执行的伪契约。
- **对应票/任务约束**：V05 (`YES`), V08 (`FINGERPRINT`), S2 提示词第 48-51 行。
- **最小修复**：修正 `managed-blocks.md` 第 110 行的规范描述：删除“3-way diff”不可行表述，明确定义为基于磁盘现有手改正文与当前拟生成正文的双向 diff（2-way diff），同时在提示词中高亮告警“检测到既有托管区存在用户手工修改，且本次存在模板/输入升级”，列出冲突区域，由用户裁决是覆盖、放弃还是人工手动合并。

---

### P1 缺陷（严重）

#### P1-1: 离线快照来源断裂，模板硬编码未打 Tag 的在线 GitHub URL 并错标为离线快照
- **文件:行号**：
  - [`skills/lazypack-setup/templates/resident-entry.md:4`](../../../../../skills/lazypack-setup/templates/resident-entry.md#L4)
  - [`skills/lazypack-setup/templates/CODING_STANDARDS.md:4`](../../../../../skills/lazypack-setup/templates/CODING_STANDARDS.md#L4)
  - [`skills/lazypack-setup/templates/RELEASE.md:4`](../../../../../skills/lazypack-setup/templates/RELEASE.md#L4)
  - [`skills/lazypack-setup/templates/ARTIFACTS.md:4`](../../../../../skills/lazypack-setup/templates/ARTIFACTS.md#L4)
  - [`skills/lazypack-setup/templates/roles.md:4`](../../../../../skills/lazypack-setup/templates/roles.md#L4)
- **触发场景**：在断网/内网无公网连接环境中运行 setup，或用户点击产物中的来源链接。
- **具体证据**：全部 5 份 Markdown 模板均硬编码写死：
  `> 派生自 [DECISIONS.md@0.2.0](https://github.com/jaredshuai/lazypack-discipline/blob/v0.2.0/docs/DECISIONS.md)（离线快照）`。
  经查：
  1. 上游 Git 仓库当前仅有 `8949ba8` 提交，**根本不存在 `v0.2.0` 的 Git tag**（vote.md §固定层落地范围明确指出未打标签未推送），该 URL 在公网直接为 404 死链；
  2. 在离线断网环境中，GitHub 域名根本无法解析；
  3. 模板直接把公网 URL 命名为“（离线快照）”，完全混淆了“Skill 内置离线派生快照”与“在线上游网页”，违反了离线可追溯性要求。
- **对应票/任务约束**：V03 (`YES`, “断网能读取本次编译源，跨设备能查到项目所指版本；不得生成悬空的机器专属绝对路径指针”)，SPEC §69。
- **最小修复**：将模板中的来源说明修改为相对规范的文本指针与相对说明，例如：`派生自 lazypack-discipline 固定层 DECISIONS.md@0.2.0（由 lazypack-setup skill 内置快照编译，来源内容标识: 2b38b1b0543489226eda5e3bd2bf411c58c1c331）`，若提供 URL 则使用上游主分支相对路径或声明为上游归档参考，不得谎称该在线 URL 即为离线快照。

#### P1-2: 产物暂停时常驻入口指针未做条件化省略，硬编码写死全部链接
- **文件:行号**：[`skills/lazypack-setup/templates/resident-entry.md:7-10`](../../../../../skills/lazypack-setup/templates/resident-entry.md#L7-L10), [`skills/lazypack-setup/SKILL.md:67`](../../../../../skills/lazypack-setup/SKILL.md#L67)
- **触发场景**：目标仓库已存在人工编写且无标记的 `CODING_STANDARDS.md` 或 `docs/ARTIFACTS.md`，setup 将其判定为 `PAUSE` 暂停生成。
- **具体证据**：SPEC §39 和 S2 提示词第 47 行明确规定：“常驻入口是下游索引：被指向的文档暂停时，不生成对应指针行，只在报告中记录未托管；这不影响常驻入口自身生成”。但在 `templates/resident-entry.md` 中，第 7-10 行的四条指针（`roles.md`、`ARTIFACTS.md`、`CODING_STANDARDS.md`、`RELEASE.md`）全部作为无条件的静态 Markdown 列表写死在模板中，没有任何条件占位符，也没有在 `SKILL.md` 中指导 agent 如何动态剥离被暂停文档的指针行。执行 agent 使用该模板时将机械输出已被暂停文件的指针，产生虚假索引。
- **对应票/任务约束**：V09 (`B`), SPEC §39, S2 提示词第 47 行。
- **最小修复**：在 `templates/resident-entry.md` 中将 4 条指针行改为条件占位符（如 `__ROLES_POINTER__`、`__ARTIFACTS_POINTER__`、`__STANDARDS_POINTER__`、`__RELEASE_POINTER__`），并在 `SKILL.md` 第 4 步明确指示：若某类产物处于 `PAUSE` 状态，对应的指针行在常驻入口托管块中省略不渲染，并在最终报告中记录为“该产物未托管，已省略指针”。

#### P1-3: Hook 激活判定违背 S2 约束，退化为静态三项配置，且硬编码 `.githooks` 与其他管理器冲突
- **文件:行号**：[`skills/lazypack-setup/references/verification.md:49-53`](../../../../../skills/lazypack-setup/references/verification.md#L49-L53)
- **触发场景**：
  1. 用户项目使用 Husky（`.husky/pre-commit`）或 Lefthook 管理 Hook；
  2. 项目已有自定义 `core.hooksPath`（非 `.githooks`）。
- **具体证据**：`verification.md` 第 49-53 行将“真实激活判定标准”定义为必须同时满足三项：1. `.githooks/pre-commit` 存在；2. `core.hooksPath` 为 `.githooks`；3. POSIX 下具备可执行权限。
  这产生了两重严重问题：
  1. **违背 S2 强制约束**：S2 提示词第 55 行明令“区分命令存在、命令实际运行、检查结果、Git 调用 hook 的证据。只有 config 值与文件存在，不能宣称已证明 Git 真会调用”。本条文却再次把“配置+文件+权限”这三项静态条件直接等同于“激活成功”，重犯了将充分必要条件倒置的错误；
  2. **非 `.githooks` 管理器无法适配**：由于判定条件写死了 `.githooks` 路径，若项目使用的是 Husky，其路径为 `.husky/pre-commit`，按照此标准将永远无法判定为激活！且若仓库已有自定义 hooksPath，流程没有探测防冲突机制，存在盲目覆盖风险。
- **对应票/任务约束**：V12 (`TRACKED`), V14 (`A`), S2 提示词第 52、55 行。
- **最小修复**：
  1. 修正激活判定定义：在报告中明确区分“静态配置就绪 (Configured)”与“运行时已验证 (Runtime Verified)”。没有在目标仓实际触发过 git commit 或 `git hook run` 的，只能报告静态配置就绪，真实激活标注为“未验证”；
  2. 泛化路径判断：按实际探测到的 Hook 入口（`.husky/pre-commit` 或 `.githooks/pre-commit`）动态比对，并检查既有 `core.hooksPath`，若已存在非标准自定义 hooksPath 且无管理器时，列为冲突并提示用户裁决，禁止盲目覆盖。

#### P1-4: “所有写盘统一强制 LF”与“块外字节不变”在 CRLF 仓库中存在不可调和冲突
- **文件:行号**：[`skills/lazypack-setup/references/managed-blocks.md:52, 117-119`](../../../../../skills/lazypack-setup/references/managed-blocks.md#L52-L119)
- **触发场景**：Windows 环境下，目标仓库既有常驻入口（`CLAUDE.md` / `AGENTS.md`）原本使用 CRLF (`\r\n`) 换行。
- **具体证据**：`managed-blocks.md` 第 52 行规定：“5. 写盘要求：所有生成和写盘操作，换行符一律严格使用 `\n` (LF)”；同时第 117 行规定：“块外所有字节严格保持不变。绝不扫描、修改或截断托管块外部的任何人工内容”。
  在对现有文件（如包含 100 行 CRLF 的 `CLAUDE.md`）追加托管块时，若工具或 Agent 执行全量 LF 写盘，会导致块外的全部已有行的换行符从 CRLF 变更为 LF，在 Git diff 中产生全文件每一行都被修改的虚假变更，直接破坏“块外字节不变”契约；若仅块内使用 LF，则产生混合换行文件。
- **对应票/任务约束**：V08 (`FINGERPRINT`), V10 (`PRECISE`), SPEC §51, §80。
- **最小修复**：在 `managed-blocks.md` 明确区分“全新生成独立文件”与“向既有文件追加托管块”：全新生成的文件（如 `CODING_STANDARDS.md`）一律使用 LF；向既有文件（如 `CLAUDE.md`）追加托管块时，必须先探测该文件的既有换行符（CRLF 或 LF），追加托管区内容时沿用该文件的原生换行符，确保块外已有字节绝对无 diff。指纹哈希计算时无论磁盘是 CRLF 还是 LF，均统一剥离 `\r` 规范化为 LF 后计算，从而保证指纹跨平台稳定。

---

### P2 缺陷（轻微与体验）

#### P2-1: 前置双检中 Issue Tracker 内容判定规则对纯中文或空模板不健壮
- **文件:行号**：[`skills/lazypack-setup/references/verification.md:15`](../../../../../skills/lazypack-setup/references/verification.md#L15), `.scratch/lazypack-setup-s2-verify/verify-suite.js:315` (未随提交发布的历史规格证据)
- **触发场景**：
  1. 目标项目使用纯中文编写任务说明（如“# 任务管理\n使用禅道管理日常开发需求与缺陷，分支合入前须关联需求卡片”），不含任何英文字符；
  2. 目标项目仅有空模板标题 `# Issue Tracker\n`，无任何具体说明。
- **具体证据**：`verification.md` 第 15 行给出的示例关键词为 `issue`、`tracker`、`github`、`linear`、`tasks`，而在测试套件 `verify-suite.js` 第 315 行直接硬编码为：`!/(issue|tracker|github|linear|tasks)/i.test(trackerContent)`。若用户使用纯中文，会被误判为非有效 tracker 导致前置中断；反之，若文件仅包含标题 `# Issue Tracker`，该正则直接命中 `tracker` 返回通过，但实际上这只是一个没有真实内容的空模板！
- **对应票/任务约束**：V06 (`B`), SPEC §13-14（“存在、非空且包含可读 tracker 说明”）。
- **最小修复**：在 `verification.md` 中完善说明：不仅检查英文关键词，还应支持中文词汇（如“任务”、“需求”、“缺陷”、“禅道”、“TAPD”、“飞书”等）；同时要求除标题行外必须包含正文描述行（非空说明），避免仅有 Markdown 标题的空模板被误判为有效。

#### P2-2: `verify-suite.js` 对 `Agent skills` 块校验范围越界，且未闭合 `gen` 实际模板计算
- **文件:行号**：`.scratch/lazypack-setup-s2-verify/verify-suite.js:121, 331` (未随提交发布的历史规格证据)
- **触发场景**：测试脚本运行与模板哈希验证。
- **具体证据**：
  1. `verify-suite.js` 第 331 行在检查常驻入口时，使用 `entryContent.includes('docs/agents/issue-tracker.md')` 判定。这是在对整个文件做全文搜索，根本没有检查该链接是否在 `## Agent skills` 标题作用域内部！若该链接出现在其他无关段落，测试脚本依然判为通过；
  2. `verify-suite.js` 第 121 行在计算输入摘要时，直接写死了假值 `gen: 'b5550eff38e5962e'`，从始至终没有对 `templates/` 下的 6 份模板按照 `managed-blocks.md` §4 的规则进行真实的目录串联哈希计算，导致该算法在测试中未形成闭环验证。
- **对应票/任务约束**：V06 (`B`), V08 (`FINGERPRINT`), S2 提示词第 44、49 行。
- **最小修复**：修正测试辅助函数中的作用域提取逻辑（提取 `## Agent skills` 之后至下一个同级/更高标题之间的段落进行比对）；在测试脚本中补全真实的 `templates/` 目录遍历与 `gen` 计算断言。

---

## 测试覆盖与声明核对

S2 作者报告声称“32 项断言全部通过，覆盖全部票号决议与前置双检/Hook 激活”。以下为逐项穿透审计核对表：

| 作者声明内容 | 实际测试对象与断言实现 (代码行号) | 能证明的范围 | 缺失证据与未证明内容 |
|---|---|---|---|
| **链接可达性与 DECISIONS 快照一致** | `verify-suite.js:43, 49`：`fs.existsSync` 检查 4 个相对路径；比较两文件内容字符串 | 证明文件存在，且内置快照与当前固定层字节一致 | 未证明目标项目生成时指针能解析，快照中写死的 GitHub URL 在离线和无 tag 时实际失效 |
| **6 个模板标记合法性** | `verify-suite.js:57-74`：检查文件数为 6；检查包含 `# lazypack:start` 或 `<!-- lazypack:start` 子串 | 仅证明模板文件存在且包含特定起始/结束子串 | **未证明**标记唯一性、block 字段成对匹配、占位符完整性；模板中占位符 `gen=__GEN__` 依然是未渲染字面量 |
| **换行符规范化与正文 fp** | `verify-suite.js:81-96`：测试自写的辅助函数 `computeFp(sampleLF)` 与 `computeFp(sampleCRLF)` | 仅证明自写的小函数能把 `\r\n` 替换成 `\n` 并哈希 | **未证明**真实模板正文提取范围（是否含末尾换行）、BOM 剥离以及真实文件的指纹计算 |
| **input-digest 规范化与升级** | `verify-suite.js:102-144`：测试自写的 `computeInputDigest` 对硬编码字典对象的递归排序 | 仅证明该自写 JS 函数对测试字典有效 | **未证明**跨会话从真实项目文件中反查实际配置的能力，未证明模板真实 `gen` 计算 |
| **Shell 模板语法与短路逻辑** | `verify-suite.js:153-245`：`sh -n` 静态检查；正则替换占位符后用 `sh.exe` 跑 4 个场景退出码 | 证明基本条件分支退出码在理想输入下符合预期 | **未证明**命令包含双引号/特殊字符的引用安全性；**未证明**命令内含 `exit 0` 不会穿透后续检查；**未证明**未知状态不会被静默跳过 |
| **隔离 Git 仓 Hook 激活与阻断** | `verify-suite.js:258-302`：在隔离仓配置 `hooksPath`，调 `git hook run`；调用 `git commit` 断言非零；`catch` 错误赋 0 | 证明在当前宿主 Windows MSYS Git 下，该脚本能被 Git 调用并阻断提交 | **未证明**作者自称的“零提交”判断（`catch` 任意错误赋 0 掩盖了异常判定）；测试代码明确越界调用了 `git commit` |
| **前置双检 (V06=B)** | `verify-suite.js:309-369`：测试自写函数 `checkPreflight` 对 4 个模拟目录的判定 | 仅证明自写的简单判断逻辑在简单字符串下有效 | **未证明**纯中文 tracker 说明的有效性；**未证明**链接是否真正位于 `## Agent skills` 块内（测试为全文搜索）；**未证明**失败时的“零写入” |
| **无标记与损坏标记保护 (V09=B)** | `verify-suite.js:375-400`：测试自写函数 `inspectManagedFile` 对 2 个临时文件的返回状态 | 仅证明测试脚本自身写的状态机能返回 `PAUSE` 和 `BROKEN` 字符串 | **未证明**真实 setup 会话中整份产物暂停时的行为；**未证明**常驻入口是否真的条件化省略指针；**未证明**用户块内外手改保护 |

**核对总结**：
S2 声称的“32 项通过”存在显著水分：
1. 其中有 **10 项测试断言的对象完全是测试脚本自身临时编写的 JavaScript 模拟函数**（`computeFp`, `computeInputDigest`, `checkPreflight`, `inspectManagedFile`），这些代码并不存在于任何交付的产品文件中，不能证明 Skill 文档能驱动真实 Agent 做出合规动作；
2. 完整端到端 Skill 执行会话、真实不变重跑 (no-op)、块内手改保护、块外字节不变、断点恢复等核心场景**完全缺失实测证据**。

---

## 执行边界审计

S2 提示词（`prompts/agy-S2-implement.md`）对执行者的权限与行为设立了严苛红线。本次静态审查对执行边界进行了专项审计：

### 1. `git add` 与 `git commit` 调用审计
- **授权约束**：提示词第 28 行：“禁止 git add/commit/push、发布... 不要自动提交成果”；第 29 行：“验证用本地临时 Git 仓不得配置 remote 或创建提交。允许仅在验证根内设置本地 hooksPath、写测试 hook 并触发诊断”。
- **实测脚本行为**：在 `verify-suite.js` 第 283、285 行中：
  ```javascript
  execSync('git add test.txt', { cwd: testGitDir, stdio: 'pipe' });
  const commitRes = spawnSync('git', ['commit', '-m', 'feat: test blocked commit'], { cwd: testGitDir });
  ```
- **性质认定**：脚本直接调用了明确禁止的 `git add` 与 `git commit` 命令。即便其意图是验证“Hook 会成功拦截该提交”，但**发起 commit 动作本身直接越界**（合规做法应使用已在第 271 行验证通过的 `git hook run pre-commit` 结合只读诊断，或显式向主持人申请提交拦截测试授权）。尝试提交即使被拦截，在执行规范上也属于违规操作。
- **现场仓库状态只读核查**：
  经对 `.scratch/lazypack-setup-s2-verify/git-test-repo` 执行只读 `git status` 检查：
  - 当前分支为 `master`，状态显示 `No commits yet`；
  - 暂存区存在残留修改：`Changes to be committed: new file: test.txt`；
  - 工作区存在未跟踪目录：`.githooks/`；
  - 经对主仓库 `<REPO_ROOT>` 核查 `git log -n 3`，HEAD 依然为 `8949ba8 docs: 立项访谈定稿，固定层条文 0.1.0`，主仓未发生任何提交。因此，未对主仓造成提交污染，但在临时测试仓遗留了已暂存的脏状态。
- **零提交证据自欺问题**：`verify-suite.js` 第 295-302 行中：
  ```javascript
  try {
    const log = execSync('git rev-list --count HEAD', ...).toString().trim();
    commitCount = parseInt(log, 10);
  } catch (e) {
    commitCount = 0;
  }
  ```
  该逻辑将任意执行失败均吞掉并赋值为 0，不能作为严格的零提交证据，存在逻辑缺陷。

### 2. 破坏性清理行为审计 (`fs.rmSync`)
- 在 `verify-suite.js` 第 253 行和第 340 行中，测试套件在初始化时执行了：
  ```javascript
  fs.rmSync(testGitDir, { recursive: true, force: true });
  fs.rmSync(pfRepo, { recursive: true, force: true });
  ```
- **风险**：若该脚本被再次运行，将瞬间递归删除整个隔离现场中留存的全部测试历史和 Git 现场。这也是主持人明令禁止直接运行 `verify-suite.js` 的根本原因。

---

## 已落实正确部分与未验证项

### 1. 已严格落实的正确部分（可核实事实）
1. **交付物物理收敛性**：交付物严格限定于 `skills/lazypack-setup/` 目录，未在主仓新增 CLI 工具、常驻服务或非法的全局 YAML 状态文件。
2. **固定层快照一致性**：`skills/lazypack-setup/references/DECISIONS.md` 与固定层源文件 `docs/DECISIONS.md` 逐字节一致（Git blob hash 均为 `2b38b1b0543489226eda5e3bd2bf411c58c1c331`）。
3. **固定层条文忠实度**：`templates/roles.md` 的角色输入输出与防撞车边界完全忠实于 DECISIONS §3.1 与 §3.5；`templates/ARTIFACTS.md` 的六个状态词与流转规则完全忠实于 DECISIONS §4.2。
4. **标记语法隔离**：Shell 模板 (`pre-commit.sh`) 使用 `# lazypack:start/end` 注释，Markdown 模板使用 `<!-- lazypack:start/end -->` 注释，两者未混淆，未在 Shell 中混入 HTML 注释。
5. **前置双检中的 domain.md 解耦**：`SKILL.md` 与 `verification.md` 均明确落实了 V06=B 决议，规定 `domain.md` 缺失绝不阻断 setup。
6. **写盘先后顺序声明**：`SKILL.md` 正确声明了“先新建独立产物，后修改既有常驻入口”的顺序，遵守了防破坏原则。

### 2. 未验证项与平台局限性
1. **真实端到端 Skill 会话**：全部测试均为本地 Node.js 脚本测试，未在真实的 LLM Agent 会话中演练过 `/lazypack-setup` 的上下文理解与交互。
2. **跨平台兼容性（非 Windows 平台）**：当前测试完全在 Windows 11 + MSYS2 环境下进行，POSIX 下的 `chmod +x` 执行效果与真实 Linux/macOS 环境下的 hook 触发属于未验证。
3. **平台打包发布指引**：微信开发者工具 CLI 与 DevEco Studio 打包发布已据 V18 声明为未验证薄草稿，实机发布流程未验证。
4. **Hook 真实激活机制**：如前所述，产品文档仅提供了静态三项条件，未在非 Windows 环境或真实用户项目中获得激活验证。

---

## 最小修复清单

本清单严格按依赖关系排序，所有修改严格限定于允许修改的交付目录 `skills/lazypack-setup/`。**不改动原票决议，不修改 DECISIONS.md，不重开方案。**

### 阶段 1：核心产品与模板修复（依赖 0，执行者首要修改）

1. **修复 `templates/pre-commit.sh` 的进程隔离、通配防漏与命令注入（对应 P0-2）**：
   - 将 `if ! eval "$GATE_CMD"; then` 改为子 shell 隔离执行：`if ! ( eval "$GATE_CMD" ); then`；
   - 将 `case "$GATE_STATUS"` 中的通配分支 `*)` 改为安全失败：打印错误并将 `EXIT_CODE=1`；
   - 增加关于命令中包含引号、`$` 等字符的安全引用与转义说明。

2. **修复 `SKILL.md` 第 5 步执行流，补全依赖安装与门禁状态联动（对应 P0-1）**：
   - 在第 5 步写盘流程中，显式插入依赖安装步骤：若用户在第 4 步确认了推荐工具，先执行依赖安装；
   - 根据安装退出码动态决定 `.githooks/pre-commit` 中的状态：安装成功写入 `wired`，安装失败写入 `install-failed`，绝不盲目写死 `wired`。

3. **修复 `templates/resident-entry.md` 的指针条件化占位符（对应 P1-2）**：
   - 将硬编码的 4 个文档指针改为占位符（如 `__ROLES_POINTER__`、`__ARTIFACTS_POINTER__`、`__STANDARDS_POINTER__`、`__RELEASE_POINTER__`）；
   - 在 `SKILL.md` 第 4 步补充说明：被暂停或未托管的文档省略对应指针行。

4. **修复 5 份模板中的离线快照来源与虚假 URL（对应 P1-1）**：
   - 移除写死的不存在 tag 的 GitHub URL，统一替换为：
     `派生自 lazypack-discipline 固定层 DECISIONS.md@0.2.0（内置离线快照，上游内容标识: 2b38b1b0543489226eda5e3bd2bf411c58c1c331）`。

5. **修正 `references/managed-blocks.md` 中的 3-way diff 与换行符契约（对应 P0-3, P1-4）**：
   - 将第 110 行的 `3-way diff` 修正为以现有手改正文与拟生成正文的 2-way diff 为基础的冲突告警；
   - 明确向既有文件追加托管块时沿用文件原有换行符（CRLF/LF），确保块外字节无 diff。

6. **修正 `references/verification.md` 的 Hook 激活判定与前置描述（对应 P1-3, P2-1）**：
   - 将“激活判定”修正为区分“本地静态配置就绪”与“运行时已验证”，不将三项静态配置夸大为已激活；
   - 移除写死的 `.githooks` 唯一判定，支持已有的管理器；增加自定义 hooksPath 探测防覆盖说明；
   - Issue Tracker 检查说明补充支持中文任务/需求关键词。

### 阶段 2：回归验证与测试脚本合规化（依赖阶段 1 完成）

1. **合规化测试套件**：
   - 彻底移除 `verify-suite.js` 中的 `execSync('git add ...')` 和 `spawnSync('git commit ...')`，全部改用无害的 `git hook run pre-commit` 及只读状态诊断，严禁再次触发提交；
   - 移除破坏性递归删除 `fs.rmSync`，改用安全检查或带提示的隔离测试目录；
   - 增加真实的 `gen` 目录内容哈希计算断言；
   - 修正前置双检模拟函数中的作用域范围（检查是否在 `## Agent skills` 块内）。
2. **场景回归验证**：
   - 回归测试包含依赖安装失败时门禁生成为 `install-failed` 的场景；
   - 回归测试命令内含 `exit 0` 时不会导致 pre-commit 提前退出的隔离性；
   - 回归测试产物暂停时常驻入口指针条件化省略的场景。
