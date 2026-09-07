# 参与者 C：第一轮独立提案
- 参与者：C / adversarial-operator
- 轮次：1
- 状态：submitted
- 已阅读输入与未验证事项：已读 `README.md`、`docs/DECISIONS.md`、`docs/interviews/2026-09-04-founding-interview.md`。已核实本地实际存在的 `setup-matt-pocock-skills`（确系 prompt-driven skill，负责 issue tracker、triage labels 与 domain docs 挂载）。未验证事项：无未验证外部臆测项。

---

## 1. 访谈证据与判断

### 1.1 现实痛点与证据剖析
1. **「跨设备协作靠 issue assignee，不靠文件系统」是脆弱的逻辑假定**  
   - **事实**：`docs/DECISIONS.md:38` 规定「同一设备同一时刻只有一个执行者写代码，直接在 `main` 提交。跨设备协作靠 issue 认领人（assignee），不靠文件系统。少用 worktree。」
   - **对抗性推演**：issue assignee 仅为协作意向标记，不具备文件排他锁（Mutex）语义。两台设备上的执行者即使认领不同 issue，只要修改重叠文件（如公共导出、依赖配置、`CONTEXT.md`），若都在 `main` 直推必致 push reject、乱序提交甚至脏合并。当 tracker 为 local markdown 时，本地文件在未推送前连 assignee 标记都无法跨设备可见。
   - **判断**：不能把 issue assignee 当成跨设备文件锁；必须给出确定性的失败恢复契约（本地先行探测、冲突即刻回滚并提示）。
2. **「编译」与「单事实源」的哲学冲突与漂移风险**  
   - **事实**：`docs/DECISIONS.md:6` 声明 `DECISIONS.md` 是唯一事实源，项目层文件由 `/lazypack-setup` 编译得出；`docs/DECISIONS.md:14-15` 强调「同一句话不得同时出现」。
   - **对抗性推演**：若 setup 采用全量模板复制生成 `CODING_STANDARDS.md` 等，必然产生副本。用户或老项目修改后，二次运行 setup 就会面临“覆盖即丢修改、跳过即版本漂移”的死局。
   - **判断**：项目层绝对不能复制固定层散文，只能是「段落标记注入（Managed Markers）」+「运行期脚本指针」。
3. **老项目入侵与不可控阻断**  
   - **事实**：`docs/DECISIONS.md:87` 强推 JS/TS 用 `biome`，Python 用 `uv+ruff+ty`。
   - **对抗性推演**：老项目往往早有健全的 ESLint、Prettier、Jest 或 Husky。若 setup 强制推翻原有工具链或强行覆盖 `.git/hooks/pre-commit`，会导致不可逆损坏，用户将拒绝使用。
   - **判断**：必须严格「探测优先（Detection First）」：已有命令直接复用，缺失时才推荐默认栈。
4. **工具链缺失导致的死锁**  
   - **事实**：`docs/DECISIONS.md:12-13` 规定 `/understand-codebase` 是唯一入口（强绑三个 MCP）。
   - **对抗性推演**：若目标机环境未配齐这 3 个 MCP，AI 无法理解代码直接瘫痪。
   - **判断**：必须制定降级与诊断规程：MCP 缺失时报错提示并支持退化到标准检索，绝不硬挂死。

---

## 2. 完整大方案：以对抗性防御为底色的极简 Lazy Setup

### 2.1 核心原则
- **极度偷懒（Zero-Burden Lazy）**：不加任何新配置格式（坚决不要四份 YAML、不要自制 CLI 二进制）。
- **零破坏性（Non-destructive）**：已有配置只读继承，新增配置只写专属托管锚点块（`<!-- lazypack:start -->`）。
- **幂等与防御性（Idempotent & Defensive）**：重跑任意多次产物一致；失败退出时不留半截子断头文件。

### 2.2 六大核心问题回答

#### Q1: lazy 的具体用户体验是什么？
- **用户输入**：在完成 `setup-matt-pocock-skills` 后，用户只需在对话中触发 `/lazypack-setup`。
- **AI 自动完成**：
  1. 探测工程语言、包管理器及现存 lint/test 命令（`package.json`、`pyproject.toml` 等）；
  2. 探测已有的 Matt 产物（`docs/agents/issue-tracker.md`、`domain.md`）；
  3. 探测 `.git` 存在性及现存 hooks；
  4. 拟定各文件内容，一次性向用户展示审查差异摘要。
- **只能由用户回答的问题（至多 2 题，均给默认推荐，支持直接回车）**：
  - *分支 1（仅当未探到任何现有门禁命令时）*：「未检测到测试/代码检查命令，是否启用推荐工具（TS: biome / Py: ruff）？[Y/n]」
  - *分支 2（仅当存在发版诉求时）*：「发布目标是？[默认 None / npm / wechat / 自定义]」

#### Q2: 最小可用 setup 的输入、输出、重复运行与失败恢复契约
- **输入契约**：项目根目录路径；前置要求为已经或同时执行 `setup-matt-pocock-skills`。
- **输出契约（只保留 6 个必须文件，多一个都算过重）**：
  1. `AGENTS.md`（或 `CLAUDE.md`）：追加 `## Engineering Discipline` 指针块（≤15 行），不得全量复制条文。
  2. `CODING_STANDARDS.md`：极简骨架（只写自动化工具管不到的契约：双轨制、命名与业务硬约束）。
  3. `RELEASE.md`：版本规则指针与平台打包步骤。
  4. `docs/ARTIFACTS.md`：产物登记册骨架（表头与 6 状态枚举）。
  5. `docs/agents/roles.md`：角色到 skill 映射表（无缝对接 Matt skills）。
  6. `.git/hooks/pre-commit`：轻量校验脚本（若项目已有 hook 工具如 husky，则追加托管调用；若无则创建最简 shell 脚本）。
- **重复运行契约**：
  - 所有注入写入均限制在 `<!-- lazypack-discipline:start -->` 和 `<!-- lazypack-discipline:end -->` 之间。
  - 重复运行会重新探测命令并刷新标记内部，完全保留用户在标记外手写的自选配置。
- **失败恢复契约**：
  - 内存生成 + 校验通过后一次性写盘；若中途用户中断或环境校验不通过，清理临时文件并打印精准卡点，严禁留下破损工作区。

#### Q3: 现有共识判定与分类
- **保留现有共识**：两层结构原则；一个东西一个家原则（§4）；提交格式与 SemVer 映射（§5）；质量双轨制（§6.5）；文档跟改主路在流程（§7.1）。
- **固定层修订提案（须走 §9 讨论章程）**：
  - **修订提案 1（针对 §3.3）**：修改「跨设备协作靠 issue 认领人，不靠文件系统」描述，明确补充：“assignee 属于意向约定而非排他文件锁。多设备同时写代码时，必须使用短命分支或执行 pull --rebase，冲突时阻断退回，严禁无锁直推 main。”
  - **修订提案 2（针对 §2.3、§6）**：澄清「编译」条文为“轻量指针注入与命令实例化”，禁止向项目层复制固定层条款文本，杜绝双事实源。
  - **修订提案 3（针对 §1.2）**：为 `/understand-codebase` 补充降级条款：“当环境缺失相应 MCP 时，提示诊断信息并降级使用系统搜索工具，不阻塞执行”。
- **项目默认值**：JS/TS 推荐 biome、Python 推荐 uv+ruff+ty；`google.rpc.Code` 按需开启；发版平台命令。
- **实现选择**：使用 prompt-driven skill 实现，不写可执行 CLI 二进制程序。

#### Q4: 如何与已有 Matt skills 配合
- **尊重分工边界**：Matt 技能包主导规划（`grill-with-docs`、`to-spec`、`to-tickets`）、分诊（`triage`）、实现与审查（`implement`、`code-review`）、复盘（`retro`）。
- **lazypack 只做底盘填充**：
  - 直接复用 `setup-matt-pocock-skills` 已产出的 `docs/agents/domain.md` 和 `docs/agents/issue-tracker.md`，不重复提问。
  - 在 `docs/agents/roles.md` 中将 Matt 的各 skill 绑定到固定层角色。
  - 补充 Matt 没有管制的领域：本地提交质量门禁、产物存放生命周期、发版与提交规则。

#### Q5: 后续可验收的实施阶段拆解
- **阶段 1：模板骨架与标记规范制定（文档与规范）**：定义 6 个必要文件的标准锚点模板。
- **阶段 2：`/lazypack-setup` Skill 实现（核心开发）**：编写 `SKILL.md`，实现探测、无感知拟定、受控写入与 hooks 配置。
- **阶段 3：多场景对抗性验证（审查与加固）**：针对空项目、老项目、重复运行、MCP 缺失 4 种破坏性场景进行测试，验证幂等性与零破坏。
- **阶段 4：`/lazypack-harvest` 与文档收尾（收尾迭代）**：落地自提炼技能与公开文档整理。

#### Q6: 哪些内容应明确延后？
1. **独立二进制 CLI**：增加安装门槛、架构包袱与跨平台分发成本，坚决延后。
2. **多层 YAML/复杂门禁配置**：禁止引入 fast/full 复杂门禁语法，依托项目既有 scripts 足矣。
3. **书记员与清道夫的常驻自动化 Agent/Daemon**：前期通过条文与事件驱动触发，暂不开发独立常驻服务。
4. **`/lazypack-harvest`**：首版集中打磨 setup，提炼机制放在第二阶段。

---

## 3. 用户操作示例

### 场景：已有老 Node.js 项目运行 `/lazypack-setup`
```text
User: /lazypack-setup
AI:
  [探测状态]
  ✓ 已读取 setup-matt-pocock-skills 配置 (GitHub Issues, Single-context)
  ✓ 探测到 package.json：现有命令 npm run lint, npm test
  ✓ 探测到已有 .git/hooks/pre-commit (Husky)

  [推荐配置生成完毕]
  1. AGENTS.md: 追加 ## Engineering Discipline 指针
  2. CODING_STANDARDS.md: 生成轻量双轨制标准（不复述 lint 规则）
  3. RELEASE.md: 配置 Conventional Commits 与 npm 打包规范
  4. docs/ARTIFACTS.md: 建立产物 6 状态登记表
  5. docs/agents/roles.md: 映射现有 Matt skills
  6. hooks: 向 Husky 预提交链追加 lazypack 校验门禁

  无需额外输入，是否立即写入？[Y/n]
User: Y
AI: 写入完成，已建立安全标记锚点，项目纪律已生效！
```

---

## 4. 最小交付物清单
1. `skills/lazypack-setup/SKILL.md`：核心引导 skill，完全兼容 Matt 体系。
2. `templates/`（内置于 skill 内部，按需提取）：
   - `roles.md` 初始映射模板
   - `CODING_STANDARDS.md` 极简骨架
   - `RELEASE.md` 模板
   - `ARTIFACTS.md` 骨架
3. `docs/reviews/2026-09-05-lazy-setup/`：讨论留档。

---

## 5. 实施阶段及验收标准

| 阶段 | 任务内容 | 责任角色 | 验收标准 |
|---|---|---|---|
| Phase 1 | 梳理极简模板骨架与 Managed Markers 规范 | 规划者 | 模板中无冗余固定层散文，单点标记清晰无歧义 |
| Phase 2 | 编写 `skills/lazypack-setup/SKILL.md` | 执行者 | 能自动识别技术栈，具备受控写入逻辑，无交互即可默认落地 |
| Phase 3 | 对抗性演练（空项目、老项目、重复重跑、无 MCP） | 审查者 | 验证老配置无破坏、重跑无重复追加、中断不留垃圾、MCP 缺失能降级 |
| Phase 4 | 整理最终使用文档并归档 | 书记员 | README 与使用指南闭环，无断头链接 |

---

## 6. 风险与未决问题
1. **未决问题**：如果目标机器连 `git` 都未初始化，setup 是静默初始化 `git init` 还是报错中断？*（建议：报错提示，要求项目先处于版本控制中）*。
2. **潜在风险**：跨设备协作者未及时 pull main，产生提交分叉。*（建议：在 pre-commit 或文档中硬性规定提交前必须 git fetch/rebase）*。

---

## 7. 候选提案表

| 编号 | 结论 | 证据 | 类型 | lazy 收益与成本 |
|---|---|---|---|---|
| **C-01** | 修订 §3.3：明确 assignee 非排他文件锁，规定跨设备并发提交时须靠短分支或 rebase 冲突中断回滚 | `docs/DECISIONS.md:38`<br>`docs/interviews/2026-09-04-founding-interview.md:37` | 固定层修订 | **收益**：打破“assignee 防撞车”幻想，根除并发踩踏。<br>**成本**：需多 AI 会议修改一条固定层条文。 |
| **C-02** | 确立 setup 采用段落标记注入（Managed Markers），拒绝全量复制固定层散文 | `docs/DECISIONS.md:6`<br>`docs/DECISIONS.md:14-15` | 实现选择 | **收益**：杜绝双事实源漂移，用户自定义与系统升级安全共存。<br>**成本**：模板需维护标记包裹逻辑。 |
| **C-03** | 门禁配置必须「探测优先」：老项目继承原脚本，仅空项目推荐 biome/ruff | `docs/DECISIONS.md:86-88`<br>`docs/interviews/2026-09-04-founding-interview.md:8` | 项目默认值 | **收益**：老项目 0 阻力接入，不损坏已有构建流水线。<br>**成本**：setup 增加针对主流配置文件的轻量探测规则。 |
| **C-04** | 修订 §1.2：`/understand-codebase` 增加环境 MCP 缺失时的优雅降级通道 | `docs/DECISIONS.md:12-13` | 固定层修订 | **收益**：避免开发环境 MCP 挂掉时整个工程工作流彻底死锁。<br>**成本**：条文需补充一条容灾降级说明。 |
| **C-05** | 坚决砍掉独立 CLI 二进制及四份 YAML 配置文件，保持纯 prompt-driven skill 交付 | `README.md:8`<br>`docs/interviews/2026-09-04-founding-interview.md:47` | 实现选择 | **收益**：0 构建成本，0 依赖，用户即装即用最轻量。<br>**成本**：无跨编辑器脱机原生命令。 |
| **C-06** | setup 输出文件严格冻结为 6 个必要文件，全面延后常驻清道夫与自提炼 harvest | `docs/DECISIONS.md:21`<br>`docs/DECISIONS.md:128` | 保留与延后 | **收益**：首版聚焦打磨装箱体验，防止过度设计导致烂尾。<br>**成本**：部分收尾维护工作前期需人工介入。 |