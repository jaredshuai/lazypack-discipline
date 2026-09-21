# 采纳 R2 证据（Cursor/Grok）

无实跑、无 PASS、未读他方 R2、未改产品/FIX2/R1。

## 读取

- 三席 R1：`agy/result.md`、`qodercli/result.md` 与 evidence 前 40 行、本席 R1 result。
- FIX2：`DECISIONS.candidate.md` 1.1–5.5；`fixed-layer-delta.md` 变更 1–9；`compatibility.md` §1.3、L114–116、Gate1；`default-paths-final-draft.md` Z08 行 52–53、§4 裁决 4；`scenario-check.md` 场景 09 L137、场景 12 L175–176。
- 产品：`docs/DECISIONS.md` §3.4 原句「事件驱动，不用定时器」；`SKILL.md` L27–35 前置双检与零写入；`templates/ARTIFACTS.md` Section 2 四槽 / Section 3 协作区；`managed-blocks.md` L301–310。
- 本机只读：`to-tickets/SKILL.md:62`；`issue-tracker-local.md` L3–9。

## 观察

- 候选 SHA256 未重算；沿用 R1 已核 `007f546921195a8fb7ca70ea22f0869ab6760326a5a7ccb57f038855c37626f3`。
- Qoder R1 明确保留 4.1「标准默认」与 2.3/4.4 原文；未讨论 3.4 定时器句。
- AGY R1 2.5 维持 3.4 候选（无事件驱动）；2.9 维持 4.4 候选。
- 同义残留不止「绝不删除」：Z08 out-of-scope 行、路径表裁决 4「绝对不得将其删除或误归档」、场景 09/12「严禁物理删除」、ideas 行「已有建议原地保留，绝不删除」（后一句针对无池不追溯删建议，与 out-of-scope 不同，实施时勿混成永不可删义务）。

## 推理

- 「未声明沿用 .scratch」若指「无 tracker 文件」= 绕过双检。故 R2 收回该宽表述。
- 「标准默认」与「须登记」写进固定层后，配套「需适配 / PAUSE」压不住实施惯性。
- 「状态更新」覆盖不了 map 与引用写回。

## 未验证

- 非本机宿主 skill、真实迁移、setup 重跑、他席正在写的 R2。
