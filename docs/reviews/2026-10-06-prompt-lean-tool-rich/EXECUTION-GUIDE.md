# §9 讨论执行指引：提示词瘦、工具肥原则

本文档指导维护者在 IDE 中手动执行 §9 三轮讨论流程，评审 issue #36 提案是否纳入固定层 `docs/DECISIONS.md`。

---

## 总览

**议题**：固定层新增"提示词瘦、工具肥"原则（拟议为新 §11 或并入既有章节）

**提案核心**：AI Agent 的行为约束优先通过确定性工具（lint、格式化、类型检查、测试、CI 闸门）实现，提示词仅保留无法工具化的核心约定。

**参与者配置**：5 位 AI（奇数配置，符合 §9.4）
- Participant A
- Participant B
- Participant C
- Participant D
- Participant E

**主持人**：Droid（§9.2：不投票、不提方案，只生成提示词、分配对手、汇总）

**三轮流程简述**：
1. **第一轮**：各参与者独立分析提案，互不可见
2. **第二轮**：阅读其他参与者意见，互评并收敛分歧
3. **第三轮**：基于冻结选票投票，维护者裁决

---

## 准备工作

### 1. 目录结构
在 `docs/reviews/2026-10-06-prompt-lean-tool-rich/` 下创建：

```
docs/reviews/2026-10-06-prompt-lean-tool-rich/
├── README.md                    # 已存在，记录议题背景
├── templates/                   # 已存在，包含三轮模板
│   ├── round-1-template.md
│   ├── round-2-template.md
│   └── round-3-template.md
├── round-1/
│   ├── prompts/                 # 第一轮个性化提示词
│   │   ├── participant-a-prompt.md
│   │   ├── participant-b-prompt.md
│   │   ├── participant-c-prompt.md
│   │   ├── participant-d-prompt.md
│   │   └── participant-e-prompt.md
│   └── participants/            # 第一轮输出
│       ├── participant-a/
│       │   ├── result.md
│       │   └── evidence.md
│       ├── participant-b/
│       ├── participant-c/
│       ├── participant-d/
│       └── participant-e/
├── round-2/
│   ├── prompts/                 # 第二轮个性化提示词
│   │   ├── participant-a-prompt.md
│   │   ├── participant-b-prompt.md
│   │   ├── participant-c-prompt.md
│   │   ├── participant-d-prompt.md
│   │   └── participant-e-prompt.md
│   └── participants/            # 第二轮输出
│       ├── participant-a/
│       │   ├── result.md
│       │   ├── evidence.md
│       │   └── clauses.md
│       ├── participant-b/
│       ├── participant-c/
│       ├── participant-d/
│       └── participant-e/
├── round-3/
│   ├── ballot.md                # 冻结选票（主持人汇总）
│   ├── prompts/                 # 第三轮个性化提示词
│   │   ├── participant-a-prompt.md
│   │   ├── participant-b-prompt.md
│   │   ├── participant-c-prompt.md
│   │   ├── participant-d-prompt.md
│   │   └── participant-e-prompt.md
│   ├── participants/            # 第三轮输出
│   │   ├── participant-a-vote.md
│   │   ├── participant-b-vote.md
│   │   ├── participant-c-vote.md
│   │   ├── participant-d-vote.md
│   │   └── participant-e-vote.md
│   └── tally.md                 # 计票结果（主持人汇总）
├── MODERATOR-NOTES.md           # 主持人工作笔记（可选）
├── DECISION.md                  # 维护者裁决
└── EXECUTION-GUIDE.md           # 本文件
```

### 2. 文件组织原则
- **提示词**：每轮的 `prompts/` 目录存放个性化后的提示词，供维护者复制粘贴给各 AI
- **输出**：每轮的 `participants/` 目录按参与者分目录存放其输出
- **隔离**：各参与者仅看到分配给自己的提示词，第一轮完全互不可见，第二轮才能读其他人的第一轮输出
- **版本控制**：每轮结束后提交一次，commit message 标注轮次（如 `docs: §9 round 1 complete`）

---

## 第一轮：独立意见（互不可见）

### 目标
每位参与者独立分析提案，不受其他人影响。

### 步骤

#### 1. 生成个性化提示词
从 `templates/round-1-template.md` 为每位参与者生成个性化版本：

**替换占位符**：
- `{PARTICIPANT_NAME}` → 参与者标识（a, b, c, d, e）
- `{HANDOFF_DIR}` → 系统临时目录（如 `C:\Users\<user>\AppData\Local\Temp\issue36-s9-round1`）

**生成命令示例**（PowerShell）：
```powershell
$participants = @('a', 'b', 'c', 'd', 'e')
foreach ($p in $participants) {
    $content = Get-Content templates\round-1-template.md -Raw
    $content = $content -replace '\{PARTICIPANT_NAME\}', $p
    $content = $content -replace '\{HANDOFF_DIR\}', "C:\Users\$env:USERNAME\AppData\Local\Temp"
    $content | Out-File "round-1\prompts\participant-$p-prompt.md" -Encoding utf8
}
```

#### 2. 执行讨论
对每位参与者（A-E）：

1. **创建临时交接目录**：
   ```powershell
   New-Item -ItemType Directory -Path "$env:TEMP\issue36-s9-round1\participant-a" -Force
   ```

2. **在 IDE 中打开对应提示词**：
   `round-1/prompts/participant-a-prompt.md`

3. **切换到对应模型/会话**：
   - 使用不同的 AI 模型或独立会话
   - 确保互不干扰（建议使用 5 个不同的 AI 服务或 5 个隔离的会话）

4. **将提示词完整复制给 AI**，等待其执行

5. **AI 会输出两个文件到临时目录**：
   - `result.md`：意见正文
   - `evidence.md`：推理过程和依据

6. **从临时目录复制到项目仓库**：
   ```powershell
   Copy-Item "$env:TEMP\issue36-s9-round1\participant-a\*" `
             "E:\codespace\lazypack-discipline\docs\reviews\2026-10-06-prompt-lean-tool-rich\round-1\participants\participant-a\"
   ```

#### 3. 重复执行所有参与者
对 B、C、D、E 重复步骤 2，**确保各参与者互不可见对方的输出**。

#### 4. 提交第一轮结果
```powershell
git add docs/reviews/2026-10-06-prompt-lean-tool-rich/round-1/
git commit -m "docs: §9 round 1 complete - independent opinions on tool-first principle"
```

记录 commit hash，供第二轮模板使用。

---

## 第二轮：互评与收敛

### 目标
参与者阅读其他人的第一轮意见，互相辩论并收敛分歧。

### 步骤

#### 1. 主持人准备工作

**分配对手关系**（每人至少被分配为 2 个人的对手）：

示例分配：
```
A 的对手：B, C
B 的对手：A, D
C 的对手：A, E
D 的对手：B, E
E 的对手：C, D
```

**识别交锋点**（从第一轮意见中提取）：
- 条文归属：新增 §11 vs 并入 §6
- 判断标准：是否清晰可执行
- AGENTS.md 瘦身范围：激进 vs 保守
- 实施路径：立即 vs 试点

**提取点名问题**（某参与者在第一轮中质疑另一参与者的观点）。

#### 2. 生成个性化提示词

从 `templates/round-2-template.md` 为每位参与者生成个性化版本：

**替换占位符**：
- `{PARTICIPANT_NAME}` → 参与者标识
- `{DATE}` → 当前日期（如 2026-10-07）
- `{COMMIT_HASH}` → 第一轮提交的 commit hash（前 8 位）
- `{N}` → 其他参与者数量（4）
- `{PARTICIPANT_PATHS}` → 其他参与者第一轮输出路径列表：
  ```
  - Participant B: `round-1/participants/participant-b/result.md` 和 `evidence.md`
  - Participant C: `round-1/participants/participant-c/result.md` 和 `evidence.md`
  - Participant D: `round-1/participants/participant-d/result.md` 和 `evidence.md`
  - Participant E: `round-1/participants/participant-e/result.md` 和 `evidence.md`
  ```
- `{ASSIGNED_OPPONENT}` → 分配的对手（如 "Participant B 和 Participant C"）
- `{DEBATE_POINTS}` → 建议交锋点（从第一轮意见总结）
- `{DIRECTED_QUESTIONS}` → 点名问题（如果有参与者在第一轮中质疑该参与者）
- `{MODERATOR_QUESTIONS}` → 主持人追问（基于第一轮发现的模糊点）
- `{HANDOFF_DIR}` → 系统临时目录

**生成脚本示例**（需手动填充交锋点和问题）：
```powershell
# 示例：为 Participant A 生成第二轮提示词
$template = Get-Content templates\round-2-template.md -Raw
$template = $template -replace '\{PARTICIPANT_NAME\}', 'A'
$template = $template -replace '\{DATE\}', '2026-10-07'
$template = $template -replace '\{COMMIT_HASH\}', 'abc12345'
$template = $template -replace '\{N\}', '4'
$template = $template -replace '\{ASSIGNED_OPPONENT\}', 'Participant B 和 Participant C'
# ... 填充其他占位符
$template | Out-File "round-2\prompts\participant-a-prompt.md" -Encoding utf8
```

#### 3. 执行讨论
对每位参与者重复第一轮的执行步骤 2，但这次：
- **AI 可以读取仓库中第一轮的所有输出**（`round-1/participants/`）
- **输出三个文件**：
  - `result.md`：互评意见 + 收敛表态
  - `evidence.md`：推理过程
  - `clauses.md`：修订后的最终条文全文

#### 4. 提交第二轮结果
```powershell
git add docs/reviews/2026-10-06-prompt-lean-tool-rich/round-2/
git commit -m "docs: §9 round 2 complete - peer review and convergence"
```

---

## 第三轮：修订后投票

### 目标
基于冻结选票投票，决定最终方案。

### 步骤

#### 1. 主持人创建冻结选票

**汇总第二轮意见**，提取候选条文和关键分歧点，制作 `round-3/ballot.md`。

**选票格式**：
```markdown
# §9 第三轮冻结选票：提示词瘦、工具肥原则

> 主持人汇总，2026-10-08。以下选项基于第二轮各席收敛结果。

---

## B1：条文归属

A. 新增 §11「提示词瘦、工具肥」独立章节  
B. 并入 §6「质量门禁」，作为 §6.6  
C. 并入 §4「什么放哪」，作为 §4.5  
D. 不纳入固定层，仅作项目层默认值

---

## B2：工具层判断标准

A. 「违反必须产生强制后果」（保持草案原文）  
B. 「可通过自动化工具检查」  
C. 「不依赖 AI 判断即可验证」  
D. 组合表述：「可通过自动化工具检查，且违反时必须产生强制后果（阻止提交/合并/发布）」

---

## B3：AGENTS.md 瘦身范围

A. 激进：只留角色边界 + 文档归属，其余全部迁出  
B. 温和：保留核心约定 + 每会话必踩提示，迁出机械检查  
C. 保守：仅迁出已有工具覆盖的规则，其余暂留

---

## B4：实施路径

A. 立即修改固定层，同步修改 `/lazypack-setup`  
B. 先修改条文，`/lazypack-setup` 改动分阶段实施  
C. 先试点（在 1-2 个项目验证），再入固定层

---

## B5：条文措辞（选择最终文本）

A. [Participant A 的版本]  
B. [Participant B 的版本]  
C. [Participant C 的版本]  
D. [综合版本（主持人基于多数共识合成）]
```

**注意事项**：
- 每个选项组编号为 B1, B2, B3...（B = Ballot）
- 选项字母 A, B, C, D...
- 确保选项互斥且完备
- B5 的条文版本需要从第二轮各参与者的 `clauses.md` 中提取

#### 2. 提交冻结选票
```powershell
git add docs/reviews/2026-10-06-prompt-lean-tool-rich/round-3/ballot.md
git commit -m "docs: §9 round 3 ballot frozen"
```

#### 3. 生成个性化提示词

从 `templates/round-3-template.md` 为每位参与者生成个性化版本：

**替换占位符**：
- `{PARTICIPANT_NAME}` → 参与者标识
- `{DATE}` → 当前日期
- `{HANDOFF_DIR}` → 系统临时目录

**生成脚本示例**：
```powershell
$participants = @('a', 'b', 'c', 'd', 'e')
foreach ($p in $participants) {
    $content = Get-Content templates\round-3-template.md -Raw
    $content = $content -replace '\{PARTICIPANT_NAME\}', $p.ToUpper()
    $content = $content -replace '\{DATE\}', '2026-10-08'
    $content = $content -replace '\{HANDOFF_DIR\}', "C:\Users\$env:USERNAME\AppData\Local\Temp"
    $content | Out-File "round-3\prompts\participant-$p-prompt.md" -Encoding utf8
}
```

#### 4. 执行投票
对每位参与者：

1. **创建临时交接目录**：
   ```powershell
   New-Item -ItemType Directory -Path "$env:TEMP\issue36-s9-round3" -Force
   ```

2. **在 IDE 中打开对应提示词**：
   `round-3/prompts/participant-a-prompt.md`

3. **切换到对应模型/会话**，将提示词完整复制给 AI

4. **AI 会输出一个文件**：`participant-a.md`（包含逐项投票 + 附加题）

5. **从临时目录复制到项目仓库**：
   ```powershell
   Copy-Item "$env:TEMP\issue36-s9-round3\participant-a.md" `
             "E:\codespace\lazypack-discipline\docs\reviews\2026-10-06-prompt-lean-tool-rich\round-3\participants\participant-a-vote.md"
   ```

#### 5. 汇总投票结果

主持人创建 `round-3/tally.md`，统计各选项得票：

**格式示例**：
```markdown
# §9 第三轮计票结果：提示词瘦、工具肥原则

计票日期：2026-10-08  
参与者：5 位（A, B, C, D, E）  
多数门槛：3 票（> 50%）

---

## B1：条文归属

| 选项 | 得票 | 参与者 |
|------|------|--------|
| A. 新增 §11 | 3 票 | A, C, D |
| B. 并入 §6 | 2 票 | B, E |
| C. 并入 §4 | 0 票 | - |
| D. 不纳入固定层 | 0 票 | - |

**结果**：选项 A 获多数（3/5），通过。

---

## B2：工具层判断标准

| 选项 | 得票 | 参与者 |
|------|------|--------|
| A. 「违反必须产生强制后果」 | 1 票 | E |
| B. 「可通过自动化工具检查」 | 1 票 | B |
| C. 「不依赖 AI 判断即可验证」 | 0 票 | - |
| D. 组合表述 | 3 票 | A, C, D |

**结果**：选项 D 获多数（3/5），通过。

---

[继续其他选项组...]

---

## 综合结果

通过选项组合：B1-A, B2-D, B3-B, B4-A, B5-D

**是否有僵局**：无（所有选项组均有多数）

**维护者需裁决的事项**：无

**附加观察**：
- Participant B 在 B1 投了少数票，但在附加题中表示可接受多数结果
- Participant E 在 B3 表达强烈保留意见，建议维护者在实施时关注其底线
```

#### 6. 提交第三轮结果
```powershell
git add docs/reviews/2026-10-06-prompt-lean-tool-rich/round-3/
git commit -m "docs: §9 round 3 complete - voting and tally"
```

---

## 汇总与裁决

### 1. 更新 README.md

在 `README.md` 中补充三轮讨论的文件链接：

```markdown
## 第一轮：独立意见（各席互不可见）

- 共同提示词：`templates/round-1-template.md`
- 席位 A：[result.md](round-1/participants/participant-a/result.md) | [evidence.md](round-1/participants/participant-a/evidence.md)
- 席位 B：[result.md](round-1/participants/participant-b/result.md) | [evidence.md](round-1/participants/participant-b/evidence.md)
- 席位 C：[result.md](round-1/participants/participant-c/result.md) | [evidence.md](round-1/participants/participant-c/evidence.md)
- 席位 D：[result.md](round-1/participants/participant-d/result.md) | [evidence.md](round-1/participants/participant-d/evidence.md)
- 席位 E：[result.md](round-1/participants/participant-e/result.md) | [evidence.md](round-1/participants/participant-e/evidence.md)

## 第二轮：互评与收敛

- 共同任务：阅读其他席位第一轮意见，互评并收敛
- 席位 A：[result.md](round-2/participants/participant-a/result.md) | [evidence.md](round-2/participants/participant-a/evidence.md) | [clauses.md](round-2/participants/participant-a/clauses.md)
- 席位 B：[result.md](round-2/participants/participant-b/result.md) | [evidence.md](round-2/participants/participant-b/evidence.md) | [clauses.md](round-2/participants/participant-b/clauses.md)
- 席位 C：[result.md](round-2/participants/participant-c/result.md) | [evidence.md](round-2/participants/participant-c/evidence.md) | [clauses.md](round-2/participants/participant-c/clauses.md)
- 席位 D：[result.md](round-2/participants/participant-d/result.md) | [evidence.md](round-2/participants/participant-d/evidence.md) | [clauses.md](round-2/participants/participant-d/clauses.md)
- 席位 E：[result.md](round-2/participants/participant-e/result.md) | [evidence.md](round-2/participants/participant-e/evidence.md) | [clauses.md](round-2/participants/participant-e/clauses.md)

## 第三轮：修订后投票

- 冻结选票：[ballot.md](round-3/ballot.md)
- 投票提示词模板：`templates/round-3-template.md`
- 席位 A：[vote.md](round-3/participants/participant-a-vote.md)
- 席位 B：[vote.md](round-3/participants/participant-b-vote.md)
- 席位 C：[vote.md](round-3/participants/participant-c-vote.md)
- 席位 D：[vote.md](round-3/participants/participant-d-vote.md)
- 席位 E：[vote.md](round-3/participants/participant-e-vote.md)
- 计票与裁定：[tally.md](round-3/tally.md)
```

### 2. 维护者裁决

创建 `DECISION.md`，记录最终裁决：

```markdown
# 维护者裁决：提示词瘦、工具肥原则

裁决日期：2026-10-XX  
维护者：[姓名]  
议题：issue #36 - 提示词瘦、工具肥原则入固定层

---

## 投票结果

参考：[计票结果](round-3/tally.md)

所有选项组均获多数通过，无僵局。

---

## 裁决内容

**批准通过**，按以下方案执行：

1. **条文归属**：新增 §11「提示词瘦、工具肥」独立章节
2. **判断标准**：采用组合表述「可通过自动化工具检查，且违反时必须产生强制后果（阻止提交/合并/发布）」
3. **AGENTS.md 瘦身范围**：温和方案，保留核心约定 + 每会话必踩提示，迁出机械检查
4. **实施路径**：立即修改固定层，同步修改 `/lazypack-setup`
5. **条文措辞**：采用综合版本 D（见下）

---

## 新增条文全文

[从投票结果中选择的最终条文文本]

---

## 附加指示

- Participant E 在 B3 表达保留意见，实施时注意平衡瘦身范围
- `/lazypack-setup` 改动需确保向后兼容既有项目
- 本次修改触发固定层版本升级至 0.5.0（minor，符合 §5.4）

---

## 后续行动

- [ ] 更新 `docs/DECISIONS.md`，添加新 §11
- [ ] 修改 `/lazypack-setup` skill
- [ ] 更新 `AGENTS.md` 模板
- [ ] 关闭 issue #36，附带本次讨论链接
- [ ] 提交并打标签 `v0.5.0`
```

### 3. 更新 docs/DECISIONS.md

根据裁决结果，在 `docs/DECISIONS.md` 中新增 §11 或并入相应章节。

### 4. 关闭 issue #36

在 issue #36 中发布最终评论：

```markdown
经 §9 三轮讨论，本提案已通过。

**讨论留档**：[docs/reviews/2026-10-06-prompt-lean-tool-rich/](https://github.com/jaredshuai/lazypack-discipline/tree/main/docs/reviews/2026-10-06-prompt-lean-tool-rich)

**裁决结果**：[DECISION.md](https://github.com/jaredshuai/lazypack-discipline/blob/main/docs/reviews/2026-10-06-prompt-lean-tool-rich/DECISION.md)

**新增条文**：§11「提示词瘦、工具肥」（固定层 v0.5.0）

感谢所有参与者的深入讨论。
```

---

## 注意事项

### 遵守 §9 章程
- **§9.2**：主持人不投票、不提方案，只生成提示词、分配对手、汇总
- **§9.3**：三轮封顶，僵局交维护者裁决
- **§9.4**：奇数参与者（本次 5 位）
- **§9.5**：全程留档，每人每轮原文 + 投票结果 + 裁决

### 保持讨论的独立性
- 第一轮各参与者互不可见
- 第二轮才能阅读其他人的第一轮输出
- 第三轮基于公开选票投票
- 不得在讨论过程中在 issue #36 发言

### 保持讨论的公正性
- 主持人不能暗示或引导参与者的观点
- 提示词模板对所有参与者一致（仅替换个性化占位符）
- 对手分配公平（每人至少被分配为 2 个人的对手）

### 完整留档
- 所有提示词、输出、汇总、裁决均提交到 git
- 每轮结束后立即提交，保留完整历史
- README.md 提供清晰的文件索引

---

## 文件清单

### 必需文件
- `README.md`：议题背景与索引（已存在）
- `templates/round-1-template.md`：第一轮模板（已存在）
- `templates/round-2-template.md`：第二轮模板（已存在）
- `templates/round-3-template.md`：第三轮模板（已存在）
- `round-1/prompts/*.md`：第一轮个性化提示词（5 个）
- `round-1/participants/participant-{a-e}/result.md`：第一轮意见正文（5 个）
- `round-1/participants/participant-{a-e}/evidence.md`：第一轮推理过程（5 个）
- `round-2/prompts/*.md`：第二轮个性化提示词（5 个）
- `round-2/participants/participant-{a-e}/result.md`：第二轮互评意见（5 个）
- `round-2/participants/participant-{a-e}/evidence.md`：第二轮推理过程（5 个）
- `round-2/participants/participant-{a-e}/clauses.md`：第二轮修订条文（5 个）
- `round-3/ballot.md`：冻结选票
- `round-3/prompts/*.md`：第三轮个性化提示词（5 个）
- `round-3/participants/participant-{a-e}-vote.md`：第三轮投票（5 个）
- `round-3/tally.md`：计票结果
- `DECISION.md`：维护者裁决
- `EXECUTION-GUIDE.md`：本文件

### 可选文件
- `MODERATOR-NOTES.md`：主持人工作笔记（记录分配对手的理由、交锋点提取思路等）
- `round-*/participants/participant-*/notes.md`：参与者个人笔记（如果 AI 生成）

---

## 执行检查清单

### 准备阶段
- [ ] 阅读 `docs/DECISIONS.md` §9 章程
- [ ] 阅读 issue #36 提案
- [ ] 确认参与者配置（5 位 AI，奇数）
- [ ] 创建目录结构

### 第一轮
- [ ] 从模板生成 5 个个性化提示词
- [ ] 为每位参与者创建独立会话/模型
- [ ] 执行 5 次讨论，收集输出
- [ ] 复制输出到项目仓库
- [ ] 提交第一轮结果（commit + tag）

### 第二轮
- [ ] 分配对手关系（每人至少被 2 人针对）
- [ ] 提取交锋点和点名问题
- [ ] 从模板生成 5 个个性化提示词
- [ ] 执行 5 次讨论，收集输出（3 个文件/人）
- [ ] 复制输出到项目仓库
- [ ] 提交第二轮结果（commit + tag）

### 第三轮
- [ ] 汇总第二轮意见，创建冻结选票
- [ ] 提交冻结选票（commit）
- [ ] 从模板生成 5 个个性化提示词
- [ ] 执行 5 次投票，收集输出
- [ ] 复制输出到项目仓库
- [ ] 统计投票，创建 `tally.md`
- [ ] 提交第三轮结果（commit + tag）

### 汇总与裁决
- [ ] 更新 `README.md`，补充文件链接
- [ ] 创建 `DECISION.md`，记录裁决
- [ ] 更新 `docs/DECISIONS.md`，添加新条文
- [ ] 更新固定层版本号（0.5.0）
- [ ] 关闭 issue #36
- [ ] 提交并打标签 `v0.5.0`

---

## 常见问题

### Q: 如何确保各参与者互不可见？
A: 使用不同的 AI 服务或独立的会话，不在同一个上下文中执行。临时交接目录使用系统临时目录，每次执行前清空。

### Q: 对手分配的原则是什么？
A: 确保每人至少被分配为 2 个人的对手。优先分配观点对立的参与者为对手，促进实质性辩论。

### Q: 如果出现僵局（无多数）怎么办？
A: §9.3 规定僵局交维护者裁决。维护者结合各参与者的"底线"声明（第三轮附加题），做出最终决定。

### Q: 主持人可以参与投票吗？
A: 不可以。§9.2 明确规定主持人不投票、不提方案。

### Q: 可以修改模板吗？
A: 模板文件（`templates/*.md`）在讨论开始前确定，讨论过程中不得修改。只能替换占位符生成个性化提示词。

### Q: 第二轮的"修订后条文"与第三轮选票的关系？
A: 第二轮各参与者提出修订后的条文全文（`clauses.md`），主持人从中提取选项，作为第三轮选票的 B5 选项组。

---

**执行完成后**，本目录应包含完整的三轮讨论留档，供后续参考和审计。
