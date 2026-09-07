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

---

## 5. 变更检测与重跑契约 (Re-run Lifecycle)

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

---

## 6. 精确写入与恢复契约 (PRECISE + REPORT)

1. **无关脏工作区不阻塞 (PRECISE)**：
   - 检查目标路径集合 `T` 是否存在已暂存或未暂存修改。
   - 若非目标文件有改动，直接忽略，不阻塞流程。
   - 若目标路径存在未纳入托管的改动，在整体确认清单中明确提示用户，不得静默覆盖。

2. **禁止全局操作**：
   - 严禁执行 `git reset --hard`、`git clean` 或通配符 `git checkout`。

3. **中断恢复报告 (REPORT)**：
   - 若写入过程中断，逐文件输出状态：`complete`（已写完）、`partial`（部分写入/残缺）、`missing`（未写入）。
   - 新建文件：提供精确删除命令清单（`rm <file>`）。
   - 既有修改文件：提供仅针对标记块范围的行级恢复建议，严禁抹除用户后续在块外添加的内容。
   - 本地配置（`core.hooksPath`）、权限位与依赖项变更单独列出恢复说明。
