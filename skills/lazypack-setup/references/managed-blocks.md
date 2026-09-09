# 托管块与指纹契约 (Managed Blocks & Fingerprinting)

本文档是 `/lazypack-setup` 托管块、指纹计算、变更检测与恢复机制的精确技术契约。

---

## 1. 标记语法 (Marker Syntax)

托管块在目标文件中必须使用唯一标记语法包围。针对不同文件类型，固定使用对应语言的注释格式，各字段之间使用单个空格分隔，且键值内部不允许出现空格。

### 1.1 Markdown 文件标记语法
适用于 `AGENTS.md`、`CLAUDE.md`、`CODING_STANDARDS.md`、`RELEASE.md`、`docs/ARTIFACTS.md`、`docs/agents/roles.md`：

```markdown
<!-- lazypack:start block=<name> src=DECISIONS.md@<version> gen=<generator-id> input=<input-digest> fp=<sha256-16> -->
... 托管区正文 ...
<!-- lazypack:end block=<name> -->
```

### 1.2 Shell 脚本标记语法
适用于 `.githooks/pre-commit`、`.husky/pre-commit` 等可执行 Shell 脚本：

```sh
# lazypack:start block=<name> src=DECISIONS.md@<version> gen=<generator-id> input=<input-digest> fp=<sha256-16>
... 托管区正文 ...
# lazypack:end block=<name>
```

### 1.3 字段定义表

| 字段 | 含义 | 示例 | 约束 |
|---|---|---|---|
| `block` | 托管块稳定名称 | `resident-entry`, `coding-standards` | 文件内唯一，start 与 end 必须完全一致 |
| `src` | 派生固定层版本 | `DECISIONS.md@0.2.0` | 格式为 `DECISIONS.md@<SemVer>` |
| `gen` | skill 模板目录内容标识 | `a1b2c3d4e5f60718` | 16 位小写十六进制 SHA-256 摘要 |
| `input` | 项目探测输入摘要 | `3f8a91b0c4d2e5a7` | 16 位小写十六进制 SHA-256 摘要 |
| `fp` | 托管区正文字节指纹 | `9c8b7a6d5e4f3a21` | 16 位小写十六进制 SHA-256 摘要 |

---

## 2. 正文指纹计算 (fp)

### 2.1 提取范围
- 仅提取起始标记行之后、结束标记行之前的所有正文行。
- 排除起始标记行和结束标记行本身（元数据绝不参与自身指纹计算，杜绝循环依赖与自我失真）。

### 2.2 规范化规则 (LF 内存规范化)
1. **BOM 剥离**：如果文件开头包含 UTF-8 BOM (`\xef\xbb\xbf`)，计算前在内存提取副本中予以剥离。
2. **换行符规范化**：读取磁盘内容时，仅在内存提取副本中先将所有 `\r\n` (CRLF) 统一转换为 `\n` (LF)。
3. **编码**：正文字符串以 UTF-8 编码转换为字节流。
4. **哈希算法**：对规范化后的 UTF-8 字节流计算 SHA-256，取前 16 位小写十六进制字符串（即前 8 个字节的十六进制表示）。
5. **写盘要求 (V10 字节保护)**：全新独立文件一律使用 `\n` (LF) 写盘；向既有文件追加或更新托管块时，必须探测其原生换行符并在托管块沿用，块外字节一律原样保留，禁止全量转 LF 写回（详见 §5.2）。

---

## 3. 输入摘要计算 (input-digest)

`input-digest` 用于在不引入多份 YAML 状态文件的前提下，跨会话检测项目环境、门禁命令、技术栈选型与固定层版本是否发生变更。

### 3.1 序列化结构
采集以下探测事实，构造规范键名字典。

#### 3.1.1 基础序列化结构（无条件依赖托管块）
适用于独立产物托管块（如 `CODING_STANDARDS.md` 的 `coding-standards`、`RELEASE.md` 的 `release-standards`、`docs/agents/roles.md` 的 `roles-mapping`、`.githooks/pre-commit` 的 `pre-commit` 等）：

```json
{
  "commands": {
    "format": "biome format --write",
    "lint": "biome lint",
    "test": "missing",
    "type": "missing"
  },
  "gen": "<generator-id>",
  "platform": "generic",
  "src": "DECISIONS.md@0.2.0"
}
```

无条件依赖托管块**不包含** `artifacts` 字段。

#### 3.1.1.1 角色映射托管块序列化结构 (docs/agents/roles.md)
`docs/agents/roles.md` 的 `agent-roles` 托管块属于 Layer 0 独立产物（无条件依赖托管块）。为持久化项目留存策略且保持单向无环依赖（DAG），其 input 字典中包含规范机器字段 `retention`：

```json
{
  "commands": {
    "format": "biome format --write",
    "lint": "biome lint",
    "test": "missing",
    "type": "missing"
  },
  "gen": "<generator-id>",
  "platform": "generic",
  "retention": {
    "dimensions": ["ideas", "minutes"],
    "mode": "hybrid",
    "paths": {
      "ideas": "docs/ideas/inbox.md",
      "minutes": "docs/interviews",
      "raw_qa": ""
    },
    "retentionSrc": "<retention-source-hash>",
    "visibility": {
      "ideas": "private-repo",
      "minutes": "public-repo",
      "raw_qa": "none"
    }
  },
  "src": "DECISIONS.md@0.2.0"
}
```

- **字段规范**：
  * `dimensions`：启用维度的升序排序字符串数组（可包含 `"ideas"`, `"minutes"`, `"raw_qa"`；若仅留决议或未配置则为 `[]`）；
  * `mode`：`"decisions-only" | "ideas-pool" | "minutes-only" | "raw-qa" | "hybrid" | "unconfigured"`（严格从 `dimensions` 派生：`[]` 派生为 `decisions-only` 或 `unconfigured`，单一维度派生为相应模式，多维度派生为 `hybrid`，不得相互矛盾）；
  * `paths`：规范化相对路径或安全引用别名词典（键固定为 `ideas`, `minutes`, `raw_qa`，未启用项统一为空字符串 `""`；仓内材料使用 POSIX 规范相对路径，仓外私有原文使用可解析的安全引用别名如 `vault:raw-qa`，严禁将宿主本机绝对物理路径或密钥凭据写入公开产物；实际物理绑定遵循 `session-authorized` 会话授权契约：写前在当前可见会话检查别名到真实物理路径的授权映射，若未提供安全绑定则该维度保持待绑定 `unbound` 且不写材料，亦不跨会话在仓库内持久化私有物理路径）；
  * `retentionSrc`：正文权威源 `references/retention-sections.md` 经剔除 UTF-8 BOM、CRLF→LF 规范化后的 SHA-256 摘要前 16 位小写十六进制字符串。当且仅当权威正文库发生变动时驱动 `roles.md` 平滑触发 `[UPGRADE]`，避免改动策略文本时因 input 未变而漏升级。无论 8 种启用组合还是 `unconfigured` 分支均包含该字段；`pending` 待答状态不记录；
  * `visibility`：按维度划分的可见性字典（键固定为 `ideas`, `minutes`, `raw_qa`，取值为 `"public-repo" | "private-repo" | "private-storage" | "none"`，未启用项为 `"none"`；外部私有存储取值为 `"private-storage"`）；
  * 严禁纳入临时时间戳、材料正文或运行日志，杜绝跨会话伪漂移。
- **平滑升级契约 (Upgrade Lifecycle)**：
  既有项目的 `roles.md` 若缺少 `retention` 字段或其 `retentionSrc` 与当前权威正文源不一致时，重跑时因 `current_input !== header.input`，在正文未手改时精准触发 `[UPGRADE]`；若正文已手改则触发 `[CONFLICT]` 并展示 2-way diff。经用户确认写盘后，二次重跑立即进入稳定 `[NO-OP]`。
- **协作材料隔离**：
  `docs/ideas/inbox.md` 与 `docs/interviews/*.md` 为非受管协作材料，位于托管块外部。向其中追加想法或笔记绝不改变托管块的 `fp` 或 `input`，重跑保持幂等。

#### 3.1.1.2 提交前门禁托管块序列化结构 (.githooks/pre-commit)
`.githooks/pre-commit` 脚本内的 `pre-commit-hook` 托管块属于无条件依赖托管块（不含 `artifacts` 字段）。当仓库采纳门禁配方时，其 input 字典中包含规范机器字段 `preset`、`presetSrc` 与 `provenance`：

```json
{
  "commands": {
    "format": "uv run --no-sync ruff format --check",
    "lint": "uv run --no-sync ruff check --no-fix",
    "test": "uv run --no-sync pytest",
    "type": "uv run --no-sync ty check"
  },
  "gen": "<generator-id>",
  "platform": "generic",
  "preset": {
    "id": "python-uv-ruff",
    "version": "0.1.0"
  },
  "presetSrc": "<preset-source-hash>",
  "provenance": {
    "format": "wired:preset:recommended",
    "lint": "wired:preset:recommended",
    "test": "wired:preset:recommended",
    "type": "wired:preset:recommended"
  },
  "src": "DECISIONS.md@0.2.0"
}
```

对于 TypeScript/JavaScript 配方（`id: "ts-biome-vitest"`），格式完全同理：
```json
{
  "commands": {
    "format": "pnpm run format",
    "lint": "pnpm run lint",
    "test": "pnpm run test",
    "type": "pnpm run type"
  },
  "gen": "<generator-id>",
  "platform": "generic",
  "preset": {
    "id": "ts-biome-vitest",
    "version": "0.1.0"
  },
  "presetSrc": "<preset-source-hash>",
  "provenance": {
    "format": "wired:preset:recommended",
    "lint": "wired:preset:recommended",
    "test": "wired:preset:recommended",
    "type": "wired:preset:recommended"
  },
  "src": "DECISIONS.md@0.2.0"
}
```

- **字段规范与约束**：
  * `preset`：配方身份对象，固定包含 `id`（如 `"python-uv-ruff"` 或 `"ts-biome-vitest"`）与 `version`（如 `"0.1.0"`）；
  * `presetSrc`：所采纳配方数据卡（实际采用的配方卡，如 `skills/lazypack-setup/presets/python-uv-ruff.md` 或 `skills/lazypack-setup/presets/ts-biome-vitest.md`）经剔除 UTF-8 BOM、CRLF→LF 规范化后的 UTF-8 字节流计算 SHA-256 的前 16 位小写十六进制字符串。配方卡正文发生变动时驱动 Hook 精准触发 `[UPGRADE]`；
  * `provenance`：规范化的逐门禁槽位出处子字典（键严格固定为 `format`, `lint`, `test`, `type`，值为对应 `<state>:<source>:<reason>` 三段式稳定枚举串）。
- **输入-正文一致性保证（防止正文变动而输入未变）**：
  * 用户在交互确认中对工具的选择、安装失败或跳过，会直接改变 Hook 受管正文中的 `# lazypack:preset` 出处注释行（如由 `recommended` 变为 `declined`，或由 `wired` 变为 `install-failed`）；
  * 若仅在 input 中记录 `commands`，可能出现“正文因出处变动而改变指纹 `fp`，但输入摘要 `input` 未变”，导致重跑时误触发 `[DRIFT]`；
  * 将规范化 `provenance` 字典纳入 Hook input，确保受管正文中的出处行变动与 input 摘要严格同步变动；
  * **仅在 Hook 托管块添加 `provenance` 字典**，不影响其他纪律文档（如 `CODING_STANDARDS.md` 的 input 仍保持标准无条件结构）。
- **全量已有工具未采用配方时的省略规范（样例 C 契约）**：
  * 当仓库所有门禁工具均为既有工具且用户未采用本配方时，Hook input **严格省略 `preset`、`presetSrc` 与 `provenance` 字段**；
  * 同时 Hook 受管正文中**完全省略 `# lazypack:preset` 出处行**（不渲染占位符，不留空行）；
  * 彻底避免未来配方版本更新时因配方哈希变动导致全既有工具仓库发生意外伪升级。

#### 3.1.2 依赖状态摘要契约（条件依赖托管块）
适用于具备条件登记行或条件指针行的托管块：
- `docs/ARTIFACTS.md` 的 `artifacts-register` 托管块；
- `AGENTS.md` 或 `CLAUDE.md` 的 `resident-discipline` 托管块。

此类托管块的序列化字典中必须包含固定机器键名 `artifacts`，其值为依赖产物规范相对路径映射到稳定状态词的子字典。

##### 1. 固定字段与依赖路径全集
字典键名一律使用相对于仓库根目录的规范化路径，正斜杠 `/` 分隔，大小写与磁盘实际文件名完全一致，严禁使用展示名或本机绝对路径：
- `artifacts-register` 托管块依赖路径全集（固定 4 项）：
  1. `CODING_STANDARDS.md`
  2. `RELEASE.md`
  3. `docs/agents/issue-tracker.md`
  4. `docs/agents/roles.md`
- `resident-discipline` 托管块依赖路径全集（固定 4 项）：
  1. `CODING_STANDARDS.md`
  2. `RELEASE.md`
  3. `docs/ARTIFACTS.md`
  4. `docs/agents/roles.md`

> **常驻指针文案稳定原则 (P7)**：`resident-discipline` 托管块内对 `roles.md` 的指针采用稳定通用表述（`- **角色与职责**：查阅 [docs/agents/roles.md](docs/agents/roles.md)，遵循各角色防撞车边界与项目指引。`），PAUSE/BROKEN 时彻底省略。文案不随 retention mode 或 §3 动态改变，因此 `resident-discipline` 严格保持上述 4 项固定依赖不变，杜绝因策略调整导致的误判 `[DRIFT]`。

##### 2. 磁盘事实到稳定状态值映射 (Disk Facts Mapping)
状态值直接来源于只读探测的磁盘持久可观测事实，**严禁**使用本轮执行决策的临时计算结果（如 NEW / UPGRADE / NO-OP），映射至以下 4 个小写固定状态词：
- `missing`：磁盘上不存在该文件；针对 `docs/agents/issue-tracker.md`，若文件不存在、为空或无实质任务跟踪正文（未通过前置双检），亦映射为 `missing`。
- `managed`：磁盘上存在该文件且包含有效完整的 lazypack start 与 end 标记；针对 `docs/agents/issue-tracker.md`，若通过了 Matt 前置有效性核验，作为有效外部前置依赖稳定映射为 `managed`（即使自身无 lazypack 标记亦映射为 `managed`，保证登记行正常生成）。
- `paused`：磁盘上存在该文件，但完全不包含 lazypack 管理标记（属于已存在的人工整份文件，触发整份保护）。
- `broken`：磁盘上存在该文件，但 lazypack 标记残缺、不匹配或格式损坏（如仅有 start 标记而无 end 标记）。

示例（`artifacts-register` 块在四类产物均有效受管时的完整字典）：
```json
{
  "artifacts": {
    "CODING_STANDARDS.md": "managed",
    "RELEASE.md": "managed",
    "docs/agents/issue-tracker.md": "managed",
    "docs/agents/roles.md": "managed"
  },
  "commands": {
    "format": "biome format --write",
    "lint": "biome lint",
    "test": "missing",
    "type": "missing"
  },
  "gen": "<generator-id>",
  "platform": "generic",
  "src": "DECISIONS.md@0.2.0"
}
```

##### 3. 单向无环依赖保证 (DAG)
依赖关系呈严格单向无环分层，杜绝自引用与递归求值：
- **Layer 0（独立规范与外部前置）**：`docs/agents/issue-tracker.md`、`CODING_STANDARDS.md`、`RELEASE.md`、`docs/agents/roles.md`。无下游依赖，input 不含 `artifacts`。
- **Layer 1（登记册）**：`docs/ARTIFACTS.md` 仅依赖 Layer 0 的 4 个文件，不依赖自身，不依赖常驻入口。
- **Layer 2（常驻入口）**：`AGENTS.md` / `CLAUDE.md` 仅依赖 Layer 0 的规范文件及 Layer 1 的 `docs/ARTIFACTS.md`，不依赖自身。
判定步骤直接读取磁盘既有标记/内容事实，无需先行求值依赖产物的 input，从根本上杜绝循环。

##### 4. 三个采样时点与首次写盘后稳定 NO-OP
为确保首次写入成功后立即在下一次重读时保持 `[NO-OP]`，严格区分以下三个时点：
- **时点 1：生成草案时 (Draft Preview)**：按本次方案中的**计划写入结果**推导依赖状态（如计划写入受管 `CODING_STANDARDS.md` 则预估为 `managed`；已有文件未托管则预估为 `paused`），用于渲染候选正文与预览 `input-digest`，草案中明确标明为“计划事实预估”。
- **时点 2：实际写盘并核验后 (Post-write Sampling)**：执行写盘时，严格先写 Layer 0 独立产物并完成磁盘读回核验；在写 Layer 1 `docs/ARTIFACTS.md` 及 Layer 2 `AGENTS.md` 前，**重新从磁盘采样依赖文件的真实受管状态**，生成最终的 `artifacts` 字典并写入 `header.input`。严禁将写入前磁盘原有的“missing”或临时状态写入最终文件头。
- **时点 3：后续重新运行时 (Re-run Verification)**：重跑时按同一探测算法从磁盘直接采样依赖状态并计算 `current_input`。由于磁盘事实与正文未变，计算出的 `current_input` 与时点 2 写入的 `header.input` 完全一致（且 `current_fp === header.fp`），立即稳定判定为 `[NO-OP]`，不发生二次伪升级。

##### 5. 旧版 header.input 兼容与一次性平滑升级
若既有受管文件的 `header.input` 缺失 `artifacts` 字段或使用旧版结构，在重跑时由于序列化差异，决策树检测到 `current_input !== header.input`；在正文未手改的前提下，准确触发 `[UPGRADE]` 提示差异；经用户一次性确认更新写盘后，立即纳入新规范，后续从磁盘重读保持稳定 `[NO-OP]`。

### 3.2 规范序列化算法
1. 字典所有键按 Unicode 码点升序排序（嵌套对象同理）。
2. 转换为紧凑无空白 JSON 字符串（即键值间无额外空格）。
3. 对该 JSON 字符串的 UTF-8 字节流计算 SHA-256，取前 16 位小写十六进制字符串，写入块头的 `input=<input-digest>`。

---

## 4. 模板生成标识 (gen)

`gen` 用于检测 `/lazypack-setup` 自身的模板是否升级。
- 计算方法：将 `skills/lazypack-setup/templates/` 目录下的所有文件按相对路径 ASCII 排序。
- 对每个文件的“相对路径 + \0 + 文件正文 LF 规范化内容 + \0”进行串联。
- 计算其 SHA-256，取前 16 位小写十六进制作为 `gen`。
- **模板更新与首次升级传播说明**：
  * 修改 `templates/pre-commit.sh`（例如新增 `# __PRESET_PROVENANCE_LINE__` 占位支持）会导致由 `templates/` 目录全量计算的全局 `gen` 发生变动；
  * 重跑决策树在比对时，旧文件的 `header.input`（内含旧 `gen`）与当前计算的 `current_input`（内含新 `gen`）不一致；在正文未手改（`current_fp === header.fp`）的前提下，全仓所有已包含受管块的文件将触发一次性 `[UPGRADE]`；
  * 经用户单次整体确认写盘后，全仓重新纳入新 `gen`，后续重读恢复稳定 `[NO-OP]`。

---

## 5. 变更检测与重跑契约 (Re-run Lifecycle)

### 5.0 真实输入依赖与升级传播表 (Upgrade Propagation Matrix)

由于 `commands` 是多数基础产物（如 `CODING_STANDARDS.md`）与登记册共享的字段，而 `preset`/`presetSrc`/`provenance` 仅属于 Hook，各变更场景的升级传播规律如下：

| 变更场景 | `templates/` (`gen`) 变动 | `commands` 变动 | `presetSrc` 变动 | 目标文件决策树判定与升级传播行为 |
|---|---|---|---|---|
| **首次模板升级** | **变动** | 不变或变动 | 变动 | 全仓所有包含受管块的文件在未手改前提下触发一次性 `[UPGRADE]` |
| **仅改配方正文说明**（命令串未变） | 不变 | **不变** | **变动** | **仅 `.githooks/pre-commit` 触发 `[UPGRADE]`**；全仓其余 5 类纪律文档保持稳定的 `[NO-OP]` |
| **配方调整了被采纳的命令串**（如修改了 ruff 检查参数） | 不变 | **变动** | **变动** | `.githooks/pre-commit` 触发 `[UPGRADE]`；**所有包含 `commands` 的纪律文档在未手改前提下同步触发 `[UPGRADE]` 并展示命令 diff**（诚实反映命令共享传播事实） |
| **配方未被采纳 / 全拒绝** | 不变 | 不变 | 不参与 | 全仓保持 `[NO-OP]`；Hook 不创建，不注入 `presetSrc` |

> **升级状态机约束**：上表中“触发 UPGRADE”的前提是目标块处于未修改状态（`current_fp === header.fp`）。若用户曾手动修改过块内内容，决策树将准确判定为 `[DRIFT]` 或 `[CONFLICT]` 并展示 2-way diff，绝不强制覆盖。

每次重跑时，先读取现有文件托管块，计算 `current_fp` 与 `current_input`，按以下决策树判断状态：

```
文件存在？
 ├── 否 ──> [NEW] 首次生成，待确认
 └── 是 ──> 是否含有 lazypack 标记？
             ├── 否 ──> 是否为整份归属型（第2-5类）？
             │          ├── 是 ──> [PAUSE] 暂停该文件，保护用户内容，汇报待裁
             │          └── 否（常驻入口/Hook）──> [APPEND] 整体确认后追加托管块
             └── 是 ──> start/end 标记是否完整匹配？
                         ├── 否 ──> [BROKEN] 标记残缺，暂停并报告，不自动清理
                         └── 是 ──> 比对 current_fp 与 header.fp，current_input 与 header.input
                                     ├── fp 相同 且 input 相同 ──> [NO-OP] 真实幂等，无需确认，不写盘
                                     ├── fp 相同 但 input 不同 ──> [UPGRADE] 命令/模板升级，展示 diff 待确认
                                     ├── fp 不同 但 input 相同 ──> [DRIFT] 检测到用户手改，保留改动，展示 diff 待确认
                                     └── fp 不同 且 input 不同 ──> [CONFLICT] 双重变动，显著告警，展示 2-way diff 待确认
```

### 5.1 零修改重跑 (no-op)
- 当所有受管产物均处于 `NO-OP` 状态，且既有人工受保护产物保持未变（处于 `PAUSE` 且内容未动、无新增暂停项），且没有任何文件需要写盘时，setup 报告运行完毕，不提示确认，不修改任何磁盘文件。未变 PAUSE 本身不引发重复确认或重写。

### 5.2 [CONFLICT] 差异判定契约（无基线双向比对）
- **无基线现实**：托管块头部仅存储当前正文的 16 位指纹 `fp` 与输入摘要 `input`，磁盘上不持久化上一版本的未修改原始文本（Base），Skill 亦不内置历史模板库。因此，在物理上无法逆向还原出 Base，严禁虚构第三份基线文本或三方合并。
- **2-way diff 展示**：检测到 `[CONFLICT]` 时，展示磁盘当前正文（含用户手改）与本次拟生成正文（含输入/模板升级）的 2-way diff。
- **告警与裁决**：明确向用户说明“既有托管区存在手工修改，且当前项目命令/固定层模板发生变更”。由用户在交互中裁决：
  1. 保留现状：放弃本次模板/输入升级，维持现有手改内容；
  2. 采用候选：以当前拟生成版本覆盖托管区；
  3. 手工合并：用户自行编辑整合差异。
- 严禁根据哈希猜测基线，不增加外部历史状态文件。

### 5.3 块外人工内容保护与既有换行保持契约 (V10=PRECISE)
- **全新独立文件**（如 `CODING_STANDARDS.md`、`RELEASE.md` 等）：写盘一律使用 LF (`\n`)。
- **向既有文件追加或更新托管块**（如 `CLAUDE.md` / `AGENTS.md`）：
  1. **换行探测**：读取现有文件时，先探测其既有主流换行符（CRLF `\r\n` 或 LF `\n`）。
  2. **同源写入**：新追加或更新的托管块正文与标记行，沿用该文件已有的换行符写盘；若探测为 CRLF，托管块使用 `\r\n`；若为 LF，使用 `\n`。
  3. **精确范围替换**：仅替换起始标记行至结束标记行之间的字节范围（或在文件末尾追加），绝对禁止“全量读入转 LF 再全量写回”！
  4. **块外字节绝对不变**：托管块外部的所有字节（包括文件开头的 UTF-8 BOM、块外已有行的换行符格式、前缀/后缀空白、无末尾换行等）严格保持不变（`Buffer` 逐字节相等）。
  5. **混合换行保护**：若文件内部换行混合无法可靠推断，不得借此重写块外内容，严防在 Git diff 中产生全文件格式污染。

### 5.4 门禁命令转义与数据安全赋值契约
- **命令作为数据赋值**：门禁命令（`GATE_CMD`）属于用户项目数据，可能包含单双引号、空格、字面 `$`、反引号 `` ` ``、反斜线或换行。
- **单引号安全封装**：在 `templates/pre-commit.sh` 中，状态与命令变量均使用单引号包裹赋值（`FORMAT_CMD='__FORMAT_CMD__'`），确保在 Shell 脚本赋值阶段绝不发生意外变量展开、命令替换或语法截断。
- **转义规则**：渲染替换占位符前，对命令字符串中的单引号 `'` 执行规范转义，替换为 `'\''`（即：闭合前段单引号、转义字面单引号、重新开启后段单引号）。
- **执行阶段隔离**：在运行时，命令通过子 shell `( eval "$GATE_CMD" )` 隔离执行。命令中经过授权的语法（如双引号参数、命令拼接等）仅在执行阶段求值生效，不污染父脚本上下文。
- **非法状态与空命令防御**：
  - 若 `GATE_STATUS` 为 `wired` 但 `GATE_CMD` 为空或纯空白，显式阻断并置 `EXIT_CODE=1`；
  - 若 `GATE_STATUS` 为未知字符串或遗留占位符（如 `__FORMAT_STATUS__`），进入通配分支 `*)`，打印错误并置 `EXIT_CODE=1`（Fail-closed 闭门防御）。

### 5.5 Section 3 非受管协作区追加与去重契约 (P6)
- **物理边界与块外保护**：`docs/ARTIFACTS.md` 的 Section 3 位于 `<!-- lazypack:end block=artifacts-register -->` 之后，属于非受管协作区。
- **旧项目缺节平滑追加**：既有项目的 `docs/ARTIFACTS.md` 若无 Section 3，在确认写盘时将 Section 3 模板框架追加至文件末尾，块内字节逐字节不变，不影响 `fp` 计算。
- **去重键与增量登记**：
  1. **唯一去重键**：
     - 仓内协作产物：POSIX 归一化相对路径（如 `docs/ideas/inbox.md`、`docs/interviews`）；
     - 仓外私有引用：规范化安全引用/别名（如 `vault:raw-qa`）。
     - 去重匹配使用规范化身份（去重键完全比对），不使用显示文字或格式排版模糊匹配。
  2. **写入与存在核验前提**：
     - 仅当新确认启用的协作材料在磁盘（或已绑定的授权私有存储）上实际写入成功且校验非空真实存在后，才触发登记；
     - 若私有存储绑定未就绪（未写入），绝不预登记，不虚报为已交付；
     - 写入中断或部分失败时，仅登记实际核验通过的项。
  3. **不重复添加（幂等追加）**：若 Section 3 表格已存在该去重键，不重复写入行，保持原样。
  4. **人工行绝对保护**：用户手动登记的其他外部参考、探索设计行，setup 重跑时绝对不删除、不覆写、不重排，原有字节完全保护。

### 5.6 Hook 托管块出处读回与重跑恢复契约 (Provenance Recovery on Re-run)
当 setup 在已配置 Hook 的仓库中重新运行时，按以下契约严格执行出处读回与来源恢复：
1. **优先读取受管 Hook 出处**：
   - 检查 `.githooks/pre-commit`（或对应受管 Hook）的托管块，计算 `current_fp` 并与 `header.fp` 比对；
   - 仅当标记完整且 `current_fp === header.fp` 时，解析正文头部的 `# lazypack:preset` 出处注释行；
   - 逐项提取 `id`、`version` 以及各门禁槽位的 `<state>:<source>:<reason>` 三段式出处事实与槽位命令、状态。
2. **格式核验与历史事实恢复**：
   - 核验出处行语法符合规范后，完整恢复历史决策（采纳推荐 `wired:preset:recommended`、拒绝 `missing:preset:declined`、安装失败 `install-failed:preset:install-error` 等）；
   - **严禁逆向篡改来源（No Regressive Reclassification）**：**绝对不得**因为当前运行环境中已检测到候选工具（例如 `ruff` 已存在于系统 PATH 或虚拟环境 `.venv/` 中），就将原 `<source>=preset` 槽位错误改标为 `existing:pre-existing`！工具因配方而安装在环境中，其门禁来源事实仍属于 `preset`。
3. **手改防御与缺失出处处理**：
   - 若正文字节被手改（`current_fp !== header.fp`）或出处行格式非法：**坚决不猜测出处**，触发 `[DRIFT]` 或 `[CONFLICT]`，保留当前现状并展示 diff 由人工裁决；
   - 若 Hook 包含有效托管块但**完全无 `# lazypack:preset` 出处行**（如遗留旧版 setup 生成或通用无配方 Hook）：将其中的门禁命令统一按通用既有命令处理（`source=existing`, `reason=pre-existing`）。
4. **未变重跑稳定性 (Stable NO-OP)**：
   - 若恢复的出处与命令与当前环境完全一致，重新计算得到的 `current_input === header.input`；
   - 此时全流程判定为稳定 `[NO-OP]`：**不重复向用户报价、不重复发起依赖安装、不重复执行基线校验、不向磁盘写入任何文件（0 磁盘写入）**。
5. **退出后再次运行行为**：
   - 若此前已执行配方退出，Hook 中的出处行已移除；环境中遗留的工具**不代表用户重新接受了配方**；
   - 再次 setup 探测到这些工具时，将其列为未接线工具，绝不自动接线回配方，必须由用户在澄清交互中做出显式选择。

---

## 6. 精确写入与恢复契约 (PRECISE + REPORT)

### 6.1 三态快照生命周期契约 (Tri-State Snapshot Lifecycle)
为确保写盘与回退过程不发生数据丢失与覆盖冲突，执行会话采用三态快照模型：
- **$S_{\text{pre}}$（写前基线）**：
  * 在当前可用执行会话内、对目标路径执行任何修改前采样保存；
  * 记录目标文件的存在性、完整原始字节内容以及本地 Git 配置原值（`git config --local --get core.hooksPath`）；
  * 仅保存在当前执行会话的内存/受控临时会话区中，不增加持久外部数据库。**若失去原字节记录，绝不执行猜测性自动恢复**。
- **$S_{\text{agent}}$（写后事实）**：
  * 代理每次执行直接写盘或委托外部命令（如包管理器批量安装）后，立即从磁盘实际读回的真实状态；
  * 真实记录包括部分写入、命令中断或依赖失败时的环境残留，严禁将未确认的预估状态当作写后事实。
- **$S_{\text{curr}}$（恢复时现状）**：
  * 当需要执行回退或恢复时，从目标磁盘与 Git 配置读取的当前事实。
  * 仅当 $S_{\text{curr}} == S_{\text{agent}}$（确认自代理写入后用户未作二次手工修改）时，才允许自动写回 $S_{\text{pre}}$。

### 6.2 升级既有块的完整字节还原 (Full Block Byte Restoration)
- 会话内回退已升级的既有托管块时，**必须还原完整的旧块字节 $S_{\text{pre\_block}}$**；
- 完整旧块字节必须包括：旧块的起始标记行（含历史 `src`/`gen`/`input`/`fp` 元数据）、旧块正文逐字节内容、结束标记行以及文件原生换行符（CRLF/LF）；
- **坚决禁止“仅换正文却沿用新标记头”的伪恢复**，彻底杜绝元数据与正文脱节导致的假升级或假漂移。

### 6.3 干净依赖文件的字节直接写回与残留报告
- 会话内回退依赖清单与锁文件（如 `pyproject.toml`, `uv.lock`）时，放弃使用逆向命令（如 `uv remove`）；
- 在核验 $S_{\text{curr}} == S_{\text{agent}}$ 且写前基线已知的前提下，**直接将写盘前保存的 $S_{\text{pre}}$ 原始字节文件写回磁盘**；
- 若原本不存在新文件（如新建的 `uv.lock`），在一致性保护下安全删除；
- 若批量安装失败导致虚拟环境（`.venv/`）存在构建缓存或残留，在完成报告中如实列出残留路径供人工排查，**不执行激进的自动深度删除**。

### 6.4 Git 本地配置 `core.hooksPath` 防覆盖恢复
- 恢复前执行 `git config --local --get core.hooksPath` 读取当前配置值；
- 仅当当前值严格等于代理写入值时，才允许写回 $S_{\text{pre}}$ 原值或执行 unset；
- 若当前值已被用户手动修改，**坚决不覆盖改写用户新值**。

### 6.5 退出配方的生命周期预检与所有权保护 (Lifecycle Pre-check)
当用户选择退出配方或重置门禁时，严格执行以下生命周期预检：
1. **标记与指纹核验**：
   - 检查目标 Hook 脚本中的托管块标记完整性，计算 `current_fp`；
2. **手改防御与版本/命令不匹配阻断**：
   - 若检测到托管块标记残缺（`[BROKEN]`），或当前正文字节指纹不匹配（`current_fp !== header.fp`，即存在手工修改的 `[DRIFT]` 或 `[CONFLICT]`，例如用户手动修改了 `TYPE_CMD` 但未修改出处行）；
   - **绝对禁止依据出处行自动删除或重置任何命令！**
   - **版本与命令不匹配防御**：若来源对应旧配方版本（如出处 `version` 与当前配方不一致），或者槽位命令字面量不匹配当前推荐串且无法确定安全逆向映射：
     - **整个自动退出分支必须立即停止**；
     - 完整保留现有命令、`# lazypack:preset` 出处注释行和配方 input 字段，向用户报告未解决项由人工裁决；
     - **坚决禁止无条件删除出处而残留无主命令**；
   - 立即终止自动退出流程，向用户展示当前内容与推荐模板的 2-way diff，由人工进行安全清理。
3. **安全清理执行范围与重算**：
   - 仅当 `current_fp === header.fp` 且来源有效可确定安全退出时，才允许自动清理；
   - 自动清理**仅重置 `<source>=preset` 且命令字符串完全匹配配方推荐串的槽位**为 `missing`（清除命令字面量）；
   - 从正文头部移除 `# lazypack:preset` 出处注释行，从 `input` 中移除配方字段（`preset`, `presetSrc`, `provenance`）；
   - **重新计算 Hook 托管块的 `fp` 与 `input`** 写回磁盘；
   - 任何 `<source>=existing` 的命令槽位必须 **100% 保持保留**。
4. **整文件物理删除的三重严格约束与混合 Hook 保护**：
   - 整文件物理删除（`rm .githooks/pre-commit`）必须**同时满足三个严格条件**：
     ① **所有权可证明**：Hook 文件 100% 属于 setup 全新创建（无外部历史）；
     ② **无块外保留内容**：托管块外部完全无用户有效内容（无自定义 shebang、前置/后置逻辑或注释）；
     ③ **无任何 existing 或其他须保留槽位**：清理后所有门禁槽位均为 `missing` 或 `n/a`，没有任何保留的 `existing` 命令或其他活跃门禁；
   - **混合 Hook 保护**：若 Hook 中包含任何 `<source>=existing` 的槽位（或其他非配方保留命令），即使该 Hook 原本由 setup 新建且块外无内容，也**绝对严禁物理删除文件**！只能清理配方槽位与出处行，保留 existing 命令及其可调用入口与执行权限。
5. **纪律文档与共享命令后续更新说明**：
   - 退出配方后，若全仓其他纪律文档（如 `CODING_STANDARDS.md`, `CLAUDE.md`, `AGENTS.md`）仍予保留，必须向用户明确说明：下次这些文档中共享命令（shared commands）或配置发生变动时，将按正常决策树走整体更新确认流程，**绝不宣称全仓永久不变或永远 NO-OP**。
6. **退出后再次运行 setup 的行为契约**：
   - 退出配方后，宿主环境或 `.venv/` 中遗留的候选工具（如 `ruff`, `ty`, `pytest`）**不代表用户重新接受了配方**；
   - 当用户再次运行 setup 时，探测阶段识别到工具已存在，但**绝不得自动安装或自动接线回配方**；必须将其作为未接线的环境既有工具提示用户，只有用户在澄清交互中做出显式选择后，才可重新接线。

### 6.6 无关脏工作区与禁止全局操作
1. **无关脏工作区不阻塞 (PRECISE)**：
   - 检查目标路径集合 `T` 是否存在已暂存或未暂存修改；
   - 若非目标文件有改动，直接忽略，不阻塞流程；
   - 若目标路径存在未纳入托管的改动，在整体确认清单中明确提示用户，不得静默覆盖。
2. **禁止全局操作**：
   - 严禁执行 `git reset --hard`、`git clean` 或通配符 `git checkout`。
3. **中断恢复报告 (REPORT)**：
   - 若写入过程中断，逐文件输出状态：`complete`（已写完）、`partial`（部分写入/残缺）、`missing`（未写入）；
   - 新建文件：提供精确删除命令清单（`rm <file>`）；
   - 既有修改文件：提供仅针对标记块范围的行级恢复建议，严禁抹除用户后续在块外添加的内容；
   - 本地配置（`core.hooksPath`）、权限位与依赖项变更单独列出恢复说明。
