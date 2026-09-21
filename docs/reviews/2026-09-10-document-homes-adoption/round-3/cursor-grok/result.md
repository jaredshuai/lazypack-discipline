# 正式采纳 R3 票：Cursor/Grok

日期：2026-09-10。席位：Cursor/Grok。这是现行 §9 第三轮正式票，不是咨询、不是实施。未读其他席本轮票。未改正文后自称赞成。

冻结校验（本轮 node SHA256，与 brief / freeze-hashes.json 一致）：
- ballot-texts.md：`85f1cdd150071d33b86b8a5f4c5d9bc532361bd10e3fd8a7f1513ee7f02ab790`
- ballot-texts.json：`732ea7b9acf8dfba87b684fc8b68ccb44d822e721f69e57460501ff124f5b4b2`

对照 R2 clauses 后，未发现提取与源正文不符。3.4 三席已同文含「事件驱动，不用定时器」。4.1 三席均已放弃「标准默认」。本票不替换 0.2.0，不声称规则生效。

## 逐选项

### 1.1
- A：赞成。Qoder R2 已撤回「状态更新」；「更新」宽于状态，可接受。
- B：赞成。写回范围写明状态、结论、map 或引用，减少漏核。
- 首选：B

### 1.4
- A：赞成。八区导航、路径归 ARTIFACTS、不强制预建。

### 2.3
- A：赞成。有 Section 3、不改受管槽、无原件不虚构、PAUSE/损坏不写穿。缺双检零写入与「setup 不创建 tracker」。
- B：赞成。补上双检、零写入、禁止目录回退、BROKEN/未托管、迁移须 1.1。
- C：反对。「写出时须登记」且无 PAUSE，可写穿人工册；「非受管协作区」未钉 Section 3/四槽。
- 首选：B

### 3.1-row
- A：赞成。关卡后才删/移，不新增。

### 3.4
- A：赞成。恢复事件驱动；Gate1 依目的与授权，未知不改写成活跃。投的是此全文，不是另造扫描器。

### 3.5-row
- A：赞成。形式对应，无自动化承诺。

### 4.1-durable
- A：赞成。声明位置为准；docs/work 须 1.1；未核过维持既有声明。无「无 tracker 回退 .scratch」。
- B：赞成。同一原则，并写明双检失败零写入、setup 不创建 tracker。
- C：赞成。声明为准 + 推荐须核。弱于 A/B：未写双检；「保留模式见 issue-tracker.md」稍含糊。
- 首选：B

### 4.1-temp
- A：赞成。临时现场与耐久拆开。

### 4.2
- A：赞成。投新增「移动不改效力、关票≠删除授权」，不是重选六词。

### 4.4
- A：赞成。Section 3、PAUSE/损坏/未托管不写穿、工单迁移受 1.1。
- B：赞成。另有「能安全写入才登记」与日常映射沿用 §3（清道夫不新增）。
- C：反对。只说「并在登记册中登记」，无写穿保护。
- 首选：B

### 5.5
- A：赞成。CHANGELOG 非完整验收台账。

## 组合依赖

首选组合：1.1B + 2.3B + 4.1-durable B + 4.4 B（双检与「不得用 .scratch 绕过」同在 setup 与耐久家里）。

可接受组合：1.1A + 2.3A + 4.1-durable A + 4.4 A（PAUSE + Section 3 + tracker 权威；双检仍依现行 SKILL，不在本条重复）。

不可接受：2.3C 与 4.4C 同时入选（无写穿保护）。4.1-durable C 可与 2.3A 或 2.3B 搭配，不可与 2.3C 当「已有保护」。

无「整体可接受」代替上表。

## 配套勘误（不改本轮票面）

仍以 `managed-blocks.md`：`current_fp` 对 `header.fp`，`current_input` 对 `header.input`。`.out-of-scope/` 与场景「严禁物理删除」对齐 Gate1，不新增永不可删。ideas「已有建议原地保留」不是 out-of-scope 义务。固定层票不授权改 retention、不授权迁移。未归档 `docs/reviews/2026-09-10-document-homes-adoption/` 前，条文未生效。
