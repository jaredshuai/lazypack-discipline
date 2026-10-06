# §9 讨论执行方案：提示词瘦、工具肥原则

**设计原则**：简单、可控、可追溯。AI 直接输出到项目仓库，用户通过复制文件绝对路径来确认完成。

---

## 流程总览

**三轮讨论，每轮独立执行**：

1. **第一轮**：5 位 AI 独立分析（互不可见）
2. **第二轮**：5 位 AI 互评与收敛（可读第一轮所有输出）
3. **第三轮**：基于冻结选票投票

**用户职责**：
- 为每位 AI 准备个性化提示词
- 将提示词贴给对应的 AI（5 个独立会话）
- AI 完成后，用户复制输出文件的绝对路径给主持人
- 主持人检查文件、提交到 git

**主持人职责**（我）：
- 生成 5 份个性化提示词
- 汇总每轮结果
- 在第二轮分配对手
- 在第三轮制作冻结选票和计票

---

## 目录结构（已存在）

```
docs/reviews/2026-10-06-prompt-lean-tool-rich/
├── README.md                    # 议题背景（已存在）
├── EXECUTION-PLAN.md            # 本文件（执行方案）
├── round-1/
│   ├── prompts/                 # 第一轮提示词（待生成）
│   └── participants/            # 第一轮输出（待收集）
│       ├── participant-1/
│       ├── participant-2/
│       ├── participant-3/
│       ├── participant-4/
│       └── participant-5/
├── round-2/
│   ├── prompts/                 # 第二轮提示词（待生成）
│   └── participants/            # 第二轮输出（待收集）
├── round-3/
│   ├── ballot.md                # 冻结选票（待生成）
│   ├── prompts/                 # 第三轮提示词（待生成）
│   └── participants/            # 第三轮输出（待收集）
└── tally.md                     # 最终计票（待生成）
```

---

## 第一轮执行步骤

### 步骤 1：我生成 5 份提示词

我会在 `round-1/prompts/` 下创建：
- `participant-1.md`
- `participant-2.md`
- `participant-3.md`
- `participant-4.md`
- `participant-5.md`

每份提示词会指定输出路径：
```
E:\codespace\lazypack-discipline\docs\reviews\2026-10-06-prompt-lean-tool-rich\round-1\participants\participant-N\
```

### 步骤 2：用户执行 5 次讨论

对于每位参与者（1-5）：

1. **打开一个新的 AI 会话**（可以是不同的 AI 服务，或同一服务的独立会话）
2. **复制对应的提示词文件内容**（如 `participant-1.md`）
3. **完整粘贴给 AI**
4. **AI 会输出 2 个文件到指定目录**：
   - `result.md`
   - `evidence.md`
5. **AI 完成后会返回文件的绝对路径**
6. **用户复制这两个绝对路径**，暂存备用

### 步骤 3：用户确认 5 位参与者都完成

用户收集到 10 个文件路径（5 位参与者 × 2 个文件）。

### 步骤 4：用户将路径列表给我

用户回复：
```
第一轮完成，文件路径：

Participant 1:
- E:\codespace\lazypack-discipline\docs\reviews\2026-10-06-prompt-lean-tool-rich\round-1\participants\participant-1\result.md
- E:\codespace\lazypack-discipline\docs\reviews\2026-10-06-prompt-lean-tool-rich\round-1\participants\participant-1\evidence.md

Participant 2:
...
```

### 步骤 5：我检查文件并提交

我读取所有文件，确认格式正确，然后：
```bash
git add docs/reviews/2026-10-06-prompt-lean-tool-rich/round-1/
git commit -m "docs: §9 round 1 complete - independent analysis"
```

### 步骤 6：我汇总第一轮并准备第二轮

我阅读 5 份 `result.md`，提取：
- 共识点
- 分歧点
- 需要对手辩论的议题

然后生成第二轮提示词。

---

## 第二轮执行步骤

### 步骤 1：我生成 5 份提示词（含对手分配）

每份提示词会告知：
- 阅读哪些参与者的第一轮输出
- 谁是你的对手（需要重点辩论）
- 主持人提出的追问
- 输出路径：`round-2/participants/participant-N/`

### 步骤 2-5：重复第一轮的步骤 2-5

这次 AI 会输出 3 个文件：
- `result.md`
- `evidence.md`
- `clauses.md`（修订后的完整条文）

---

## 第三轮执行步骤

### 步骤 1：我创建冻结选票

基于第二轮的收敛结果，我制作 `round-3/ballot.md`，包含：
- B1, B2, B3... 选项组
- 每组 A/B/C/D 选项
- 说明文字

### 步骤 2：我生成 5 份投票提示词

每份提示词包含：
- 冻结选票的完整内容
- 投票说明
- 输出路径：`round-3/participants/participant-N-vote.md`

### 步骤 3-5：重复执行和确认

这次每位 AI 输出 1 个文件：`participant-N-vote.md`

### 步骤 6：我计票并生成 `tally.md`

统计每个选项的得票，确定多数方案。

---

## 关键优化

### ✅ 直接输出到项目仓库
- AI 不再输出到临时目录
- 输出路径直接是项目仓库的最终位置
- 避免手动复制文件内容的麻烦

### ✅ 用户只需复制路径
- AI 完成后返回文件的绝对路径
- 用户复制路径给主持人（我）
- 主持人验证文件存在且格式正确

### ✅ Git 提交由主持人统一处理
- 每轮结束后，主持人读取所有文件
- 确认无误后统一提交
- 保持清晰的提交历史

### ✅ 保留手动确认步骤
- 用户看到文件路径，知道 AI 输出到哪里
- 用户可以快速浏览文件内容（通过路径）
- 主持人验证后再提交，避免错误输出进入 git

---

## 执行检查清单

### 第一轮
- [ ] 主持人生成 5 份提示词
- [ ] 用户执行 5 次讨论（独立会话）
- [ ] 用户收集 10 个文件路径
- [ ] 用户将路径列表给主持人
- [ ] 主持人验证文件并提交

### 第二轮
- [ ] 主持人分配对手并生成 5 份提示词
- [ ] 用户执行 5 次讨论
- [ ] 用户收集 15 个文件路径
- [ ] 用户将路径列表给主持人
- [ ] 主持人验证文件并提交

### 第三轮
- [ ] 主持人创建冻结选票
- [ ] 主持人生成 5 份投票提示词
- [ ] 用户执行 5 次投票
- [ ] 用户收集 5 个文件路径
- [ ] 主持人验证、计票并提交

### 汇总
- [ ] 主持人更新 README.md
- [ ] 维护者裁决（如需要）
- [ ] 更新 DECISIONS.md
- [ ] 关闭 issue #36

---

## 现在开始第一轮

**准备就绪**。我现在会生成 5 份第一轮提示词。

用户需要：
1. 准备 5 个独立的 AI 会话
2. 将对应的提示词贴给每个 AI
3. 收集每个 AI 返回的文件路径
4. 将路径列表回复给我

我开始生成提示词...
