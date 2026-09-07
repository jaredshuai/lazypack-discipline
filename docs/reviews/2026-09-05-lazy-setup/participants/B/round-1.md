# 参与者 B：第一轮独立提案

- 参与者：B / compiler-architect
- 轮次：1
- 状态：submitted

## 已阅读输入与未验证事项

**本仓库（全文读完）**：`README.md`(1-25)、`docs/DECISIONS.md`(1-132)、`docs/interviews/2026-09-04-founding-interview.md`(1-74)。

**外部证据（本机已安装 skill，逐字核实，非猜测）**：`~/.claude/skills/setup-matt-pocock-skills/SKILL.md`(116 行) 与其 `agents/openai.yaml`、`~/.claude/skills/code-review/SKILL.md:13,36`、`~/.claude/skills/retro/SKILL.md:20,41,42`、`~/.claude/skills/setup-pre-commit/SKILL.md:1-45`。

**未验证**：
1. 未读 `docs/reviews/2026-09-05-lazy-setup/` 下他人的提示词与成果（按边界跳过），故不知 A/C 方案。
2. 微信小程序 / DevEco 打包上传命令未实测（无此类仓库在手），留待阶段 4 关闭。
3. `setup-pre-commit` 的作者归属未核实，只核实了内容。
4. 本仓库 `skills/` 为空（`ls` 确认），无既有实现可参照；下文对产物厚度的判断是**建议**不是事实。

---

## 1. 访谈证据与判断

| # | 事实（出处） | 我的判断 |
|---|---|---|
| E1 | 首版直接写模板进项目被整体撤回，原因「没问完就写」（访谈:10） | 写盘必须是最后一步，不可跳过。这是 lazy 的**约束**，不是对立面 |
| E2 | 该查的事实不能让维护者凭空勾选，agent 自己查（访谈:19,71） | **lazy 第一原则**：仓库里查得到的一律不许问用户 |
| E3 | 想法尚糊时逼选型被指出（访谈:72）；术语过多被要求平白话重述（访谈:73） | 每问自带推荐答案、一个字可接受，不出开放选型题；提问与生成文件用平白话，不复述条文编号 |
| E4 | Matt setup 自陈「prompt-driven skill, not a deterministic script」(SKILL.md:15)，且 `disable-model-invocation: true`(:4) / `allow_implicit_invocation: false`(openai.yaml) | `/lazypack-setup` 同构：一个 SKILL.md + 种子模板，无脚本无 CLI 无常驻服务；只能显式调用 |
| E5 | Matt 的模板是 skill 目录内的 `.md` 种子文件(:104-110) | 照此办理，**不需要 YAML 配置层** |
| E6 | Matt 对已存在的 `## Agent skills` 块就地更新，不覆盖周边用户编辑(:82) | 幂等靠**托管标记块**，不需状态文件；lazypack 写兄弟块，Matt 碰不到 |
| E7 | code-review 的 Standards 轴读 `CODING_STANDARDS.md`(:36)；缺 `docs/agents/issue-tracker.md` 时叫用户去跑 Matt setup(:13) | 文件名无需新约定；前置依赖失败照抄——提示，不代跑 |
| E8 | retro 已有「AGENTS.md 过大应下沉」步骤(:20)，并界定 AGENTS.md 只放导航指针、CODING_STANDARDS.md 审查时才读(:41,42) | 印证 `docs/DECISIONS.md:69,88`；不自造瘦身流程 |
| E9 | `setup-pre-commit` 装 husky + lint-staged + **prettier**(:1-45) | 与 `docs/DECISIONS.md:87`（biome）冲突，**不能整块委托** |

---

## 2. lazy 的具体用户体验

**用户输入**：`/lazypack-setup`。无参数、无配置、无需先 clone lazypack 仓库（见 B-14）。

**AI 自动完成（探测清单）**：

| 探测 | 手段 | 自动决定 |
|---|---|---|
| Matt setup 是否已跑 | `docs/agents/issue-tracker.md` 存在否 | 缺则提示先跑，本次停 |
| 写哪个常驻文件 | `AGENTS.md` / `CLAUDE.md` 谁在 | 取已存在者（:14）；都不在且 Matt 已跑 → 跟随 Matt |
| 语言、包管理器、工具是否已装 | `package.json`/lockfile、`pyproject.toml`/`uv.lock`、`biome.json`/`.ruff.toml` | 门禁四件事的命令与 hook 形态；已装则引用不重装 |
| 平台 | `project.config.json`、`build-profile.json5`、`publishConfig` | RELEASE.md 平台段草稿 |
| 已有规则 | `CODING_STANDARDS.md`/`CONTRIBUTING.md`/`RELEASE.md`/`docs/ARTIFACTS.md`/`.husky/pre-commit` | 命中即进保护路径，不覆盖 |
| 角色映射可执行性 | 已安装 skill 清单 | `roles.md` 每行标「已装 / 未装」 |
| 工作区与同名冲突 | `git status`、目标路径 `ls` | 脏则停不自动清理；已存在即停并报告，不自选 v2 |

**只能由用户回答的**（准入：既查不到、又难事后改。`docs/DECISIONS.md:87` 只给了 JS/TS 与 Python 的默认工具，故上限 3 问 + 1 条件问）：

- **P1** 语言无默认工具时：「这仓库用什么跑格式 / lint / 类型 / 测试？（推荐：X）」
- **P2** 发版人工步骤：「探测到微信小程序。发版走命令行上传，还是在开发者工具里手点？（推荐：手点）」——命令探测得到，**人要不要在场**探测不到。
- **P3** 仅当探测到后端 API：「启用 `google.rpc.Code` 字符串错误码吗？（推荐：启用）」（:81）。否则整问跳过。
- **P0**（条件）`AGENTS.md` 与 `CLAUDE.md` 都不存在且 Matt 未跑过 → 问建哪个，不代选（继承 Matt:78）。

**对话示例（常见路径，仅 1 问）**：

```
用户：/lazypack-setup
AI：探测完毕。JS/TS + pnpm，biome 已装；Matt setup 已跑过（issue tracker=GitHub）；
    AGENTS.md 已存在 → 追加到它；微信小程序项目。无 CODING_STANDARDS.md / RELEASE.md。
    一个问题：发版是命令行上传还是在开发者工具里手点？（推荐：手点）
用户：手点
AI：将新建 CODING_STANDARDS.md、RELEASE.md、docs/ARTIFACTS.md、docs/agents/roles.md、
    .husky/pre-commit；将在 AGENTS.md 末尾追加一个块（草稿如下，块外一字不动）。确认？
用户：确认
AI：已写。门禁命令：biome check / tsc --noEmit / pnpm test。
    回滚：git checkout -- <这五个路径> && git restore AGENTS.md
```

**0 问路径**的条件：语言命中 :87 的默认工具（JS/TS 或 Python）+ Matt setup 已跑 + 发版无人工步骤（如 `npm publish`）。此时只剩一次整体预览确认——这不是新增要求，Matt setup 第 3 步就是「Confirm and edit」(:63-70)，照抄即可。

---

## 3. 最小可用 setup 的契约

**输入**：当前仓库 + lazypack `docs/DECISIONS.md`（编译源，:6 定其唯一事实源）。
**输出**：`:21` 的 6 项，一项不多。

| 产物 | 为什么必要 | 首版该多薄（建议） |
|---|---|---|
| `AGENTS.md` 追加块 | 唯一常驻入口（:14,69）；:89 要求明写双方都跑门禁 | ≤ 一屏：指针 + 3~4 条每会话必踩 |
| `CODING_STANDARDS.md` | code-review:36 会读它 | 近乎空：一句用途 + :90 双轨两行（:88 说工具能查的不写进去） |
| `RELEASE.md` | :82 平台段、:65 固定段+平台段 | 固定段从 §5 编译，0 提问；平台段一份 |
| `docs/ARTIFACTS.md` | :71 状态词、:72 未登记先问 | 空表 + 表头 + 状态词一行 |
| `docs/agents/roles.md` | :40、访谈:54 | 映射表 + 已装/未装标注 |
| 提交前 hook | :86 | 装得上就装；装不上写进 RELEASE.md 并如实报告（B-11） |

**明确不新增**：CLI、常驻服务、YAML 配置、状态/清单文件、独立版本戳文件。幂等所需状态由托管块头注释承载，零新文件：

```
<!-- lazypack: block=agents | compiled-from=DECISIONS.md@0.1.0 -->
```

理由：E5/E6；且 :6 已定分歧以 DECISIONS 为准，再生成一份描述纪律的项目层 YAML 等于造第二事实源，与 :15 冲突。

**重复运行三态**：
- `up-to-date`：块头版本戳 == 当前版本且块内未被手改 → no-op，只报告。
- `upgrade`：版本戳落后 → 只重写块内固定段，块外及 `<!-- lazypack:custom -->` 内的用户内容保留，diff 先给用户看。
- `drift`：用户手改了块内 lazypack 生成的行 → **不覆盖**，报告冲突，让用户选「保留我的 / 采用新版」。同 :72「查不到先问，不猜」。

**失败恢复**：写前查 `git status`，脏则停（不越权清理）；先写新文件后追加块；任一步失败即停并报告「哪个文件、写到哪、还剩什么」(:99)；回滚是一条 `git checkout --`，失败报告里直接给出；禁止半成品——未填处一律写 `TODO(setup):` 明标。

---

## 4. 共识去留

**保留（有证据，不动）**：:14 单一常驻文件、:15 一处一纪律、:21 六项产物与运行顺序、:40 映射表落 `roles.md`、:69 AGENTS 只放指针、:86-89 门禁、:98-99 未验证标注与如实报告、:110 项目层不开会。

**固定层修订提案（仅 2 条；我不自行改条文）**：
- **B-11** `:21`「写出…提交前 hook」→ 加限定「在能装 hook 的仓库写出；装不了的把门禁命令记进 `RELEASE.md` 并如实报告」。理由：纯文档仓 / 无 `package.json` 的仓库装不了 Husky，按现条文 setup 必然失败或说谎。
- **B-12** `:14`「取已存在者」→ 补「都不存在时跟随 Matt setup 已选定的文件；Matt 未跑过才问，不代选」。理由：现条文对「都不存在」无解，Matt:78 已有可继承的行为。

**项目默认值 / 实现选择**：不开会（依 :22 与 :110），逐条见下表类型列。

---

## 5. 与 Matt skills 的分工（避免重复建设）

| 事项 | 归谁 | 依据 |
|---|---|---|
| issue tracker / triage labels / domain 布局 / `CONTEXT.md` / `docs/adr/` | Matt setup | :12,15；lazypack 不生成、不复述 |
| 前置检查 | lazypack 探测 `docs/agents/issue-tracker.md`，缺则提示先跑，**不代跑** | :21；code-review:13 先例 |
| 标准的消费、AGENTS.md 瘦身与纪律下沉 | code-review Standards 轴 / retro 已有步骤 | code-review:36；retro:20,41-42。lazypack 只生成文件，不造流程 |
| 书记员 | retro 的文档部分 | :48；首版不造新 skill |
| hook 的 Husky 手法 | 借步骤，不整块委托（工具用 biome/ruff，非 prettier） | :87 vs setup-pre-commit:1-45 |
| `roles.md` 文件名 | 与 Matt 写入的 `issue-tracker/domain/triage-labels` 无冲突 | 事实，Matt:104-112 |

---

## 6. 实施阶段与验收

| 阶段 | 内容 | 角色 | 可判定的验收 |
|---|---|---|---|
| 0 | 探测清单定稿 | 调查者 | 覆盖 §2 全部 7 项，每项写明命令 + 判定 + 命中后动作；**无一条要求问用户可查之事** |
| 1 | `skills/lazypack-setup/SKILL.md` 主干（探测→问→预览→写） | 执行者 | 在一个命中 §2「0 问路径」的 JS/TS 样例仓跑通：0 提问、1 次确认、6 项产物齐；`AGENTS.md` 块外逐字节不变 |
| 2 | 种子模板（RELEASE 固定段 / ARTIFACTS 表头 / roles 表 / AGENTS 块） | 执行者 | 模板零项目专名（:121）；RELEASE 固定段每行可回指 `docs/DECISIONS.md:76-82` |
| 3 | 幂等与升级 | 执行者 | 连跑两次第二次 no-op；手改块外后重跑保留；改一位版本号后重跑只动块内且先出 diff；手改块内后报 drift 不覆盖 |
| 4 | hook 生成 + 微信小程序 / DevEco 两份平台段（:131） | 执行者 | biome 项目上 hook 跑通四件事；无 `package.json` 仓降级为只写命令并如实报告；两份平台段各在真实仓实测一次（关闭未验证项 2） |
| 5 | 审查 + 文档收尾 | 审查者 / 书记员 | 审查者按标准与票核对；书记员改 `README.md:8,17` 去掉「待写」、划掉 `docs/DECISIONS.md:127`；采纳 B-11/B-12 则按 §9 走会并升版本号(:4) |

**派工提示词要求**（即本轮我自己的边界，建议固化）：每票写明成果文件绝对路径、禁写路径清单、同名预检（写前 `ls`，存在即停并报告主持人，不覆盖、不自选 v2）、不做 git add/commit/push。

---

## 7. 明确延后

`:95`/`:129` 的「改了 X 没动 Y」对子（首版只在 hook 留空挂点）；书记员与清道夫专用 skill（:128）；多语言工具链矩阵与技术栈选型扩展（:22、访谈:48，日后头脑风暴）；ARTIFACTS 的 pipeline 区自动生成（:67，只留表头）；任何 CLI / 常驻服务 / 索引缓存 / 多份 YAML；跨设备多执行者的机器强制（:38，靠 issue assignee）；`/lazypack-harvest`（§8，不同批做）。

---

## 8. 风险与未决问题

- **R1** `roles.md` 与 `docs/DECISIONS.md:42-49` 的映射表看似重复。判断：:15 只列举 AGENTS.md / CONTEXT.md / 演变史，未含 `roles.md`；:40 明说「换 skill 只改这张表」，语义是项目层实例。建议 `roles.md` 顶部加一行「默认映射见 DECISIONS §3.5」消歧；若主持人仍认定重复，需第三条固定层修订——本轮不预设。
- **R2（未决，需裁）** 版本戳要求目标项目能寻址 DECISIONS 内容，但用户可能只装了 skill、没 clone 仓库。我倾向**随 skill 内置一份快照**并在块头记其版本、同时报告「可能落后于仓库」；代价是漂移风险（与 :6 有张力）。替代方案是强制 clone，代价是 lazy 归零。
- **R3** 探测误判：monorepo 多语言时首版只问一次、按主语言编译，不逐包编译。本仓库无 CI，阶段 1-4 验收全靠人工在样例仓跑，工时易被低估。

---

## 候选提案表

| 编号 | 结论 | 证据 | 类型 | lazy 收益 / 成本 |
|---|---|---|---|---|
| B-01 | prompt-driven skill：一个 SKILL.md + 种子模板 `.md`，无 CLI / 常驻服务 / 脚本；只能显式调用 | Matt:15,4；openai.yaml | 实现选择 | 零安装 / 不可单元测试 |
| B-02 | 提问准入：仓库查得到的一律不问；上限 3 问 + 1 条件问，常见路径 0 问 | 访谈:19,71；:87 | 项目默认值 | 一句话跑完 / 探测清单要写全 |
| B-03 | 每问自带推荐答案，可一字接受；不出开放选型题；文案平白话不复述条文号 | 访谈:72,73；Matt:36 | 项目默认值 | 3 问约 30 秒 / 推荐错要能当场改 |
| B-04 | 一次整体预览确认（文件清单 + 块草稿全文），非逐文件确认 | Matt:63-70 | 实现选择 | 写盘前唯一刹车 / 多一轮往返 |
| B-05 | 产物就是 :21 的 6 项，一项不多；首版每个都写薄 | :21,69,71,88 | 保留 | 生成物近空 / 显得「没内容」 |
| B-06 | 幂等靠托管标记块 + 块头版本戳，不新增元数据/状态文件 | Matt:82；:6,15 | 实现选择 | 0 新文件 / 块外管不到 |
| B-07 | 重跑三态 up-to-date / upgrade / drift；drift 不自动覆盖 | Matt:82；:72 | 实现选择 | 不吃用户手改 / drift 需裁一次 |
| B-08 | 不新增 YAML 配置层（独立判断后否决「四份 YAML」） | Matt:104-110；:6,15 | 实现选择 | 无第二事实源 / 改模板要改 skill |
| B-09 | 前置依赖只提示不代跑：缺 `docs/agents/issue-tracker.md` 就叫用户先跑 Matt setup | :12,21；code-review:13 | 保留 | 不复述 Matt / 多一步操作 |
| B-10 | `CODING_STANDARDS.md` 首版近乎空，只放工具查不出的条目 | :88；code-review:36；retro:42 | 保留 | 不与 lint 重复 / 靠审查者执行 |
| B-11 | `:21`「写出提交前 hook」加限定：装不了则记进 `RELEASE.md` 并如实报告 | :21,86,99 | **固定层修订提案** | 文档仓不再必然失败 / 该类仓靠对抗审查兜底 |
| B-12 | `:14`「取已存在者」补：都不存在时跟随 Matt 已选文件，Matt 未跑过才问 | :14；Matt:78 | **固定层修订提案** | 省一问 / 依赖 Matt 产物 |
| B-13 | 不整块委托 `setup-pre-commit`（prettier 与 biome 冲突），只借 Husky 手法 | :87；setup-pre-commit:1-45 | 实现选择 | 工具与条文一致 / hook 自己写 |
| B-14 | skill 内置 `DECISIONS.md` 快照，块头记快照版本并报告可能落后 | :3,4,6 | 实现选择（**待裁**） | 免 clone / 快照漂移 |
| B-15 | 六阶段派工，每票写明成果绝对路径 + 禁写清单 + 同名预检（存在即停，不自选 v2） | :75,99；维护者本轮补充 | 项目默认值 | 并行不撞车 / 提示词变长 |
| B-16 | §7 全部条目延后，hook 只留空挂点 | :38,67,95,128,129 | 项目默认值 | 首版可交付 / 联动拦截暂无内容 |
