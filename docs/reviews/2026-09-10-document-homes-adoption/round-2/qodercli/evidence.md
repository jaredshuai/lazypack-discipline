# 正式采纳第二轮证据记录 — Qoder CLI

## 1. 本轮实际读取

### 三席 R1 交付
- `document-homes-adoption-R1-20260910/agy/result.md`（全文 135 行）
- `document-homes-adoption-R1-20260910/cursor-grok/result.md`（全文 100 行）
- `document-homes-adoption-R1-20260910/qodercli/result.md`（本席 R1，全文）
- 三席 evidence.md 未全文重读（R1 轮已核实各自读取范围声明）

### FIX2 候选与配套（R1 轮已全文读取，本轮定点复核）
- `DECISIONS.candidate.md`：SHA256 复算 `007f546921195a8fb7ca70ea22f0869ab6760326a5a7ccb57f038855c37626f3` ✓
- `compatibility.md` L112-117（勘误 #1 fp/input 混用）、L77（Gate 1 正确表述）
- `default-paths-final-draft.md` L50/52/53（绝不删除/绝不篡改残留）
- `scenario-check.md` L161/175（绝对禁止删除残留）
- `fixed-layer-delta.md` L61（变更项 4 引用旧文含「事件驱动，不用定时器」）

### 产品仓（只读定点核实）
- `docs/DECISIONS.md:39`：确认 0.2.0 §3.4 原文含「事件驱动，不用定时器」
- 产品仓 SHA256 未变（`c2b0334...`），HEAD 未变（`91ae63d...`）

### 主持材料
- `document-homes-adoption-R2-20260910/discussion-brief.md`（全文）
- `document-homes-FIX2-host-20260910/host-closeout.md`（R1 轮已读，本轮引用勘误 #1-#5）

### 未读取
- 他方正在写的 R2 交付（遵守「不要读取他方正在写的R2」）
- vault/凭据
- adoption-outline.md（R1 轮已读，本轮无新争议涉及）

## 2. 静态核对

### 2.1 「事件驱动，不用定时器」删除核实
```
grep -n "事件驱动" docs/DECISIONS.md → L39（0.2.0 原文含此句）
grep -n "事件驱动" DECISIONS.candidate.md → 零命中（候选未含）
grep -n "事件驱动" fixed-layer-delta.md → L61（变更项 4 引用旧文时含此句，但拟改新文未写入）
```
结论：候选 §3.4 删除了 0.2.0 的「事件驱动，不用定时器」，delta 变更项 4 未显式申报此删除。Cursor/Grok R1 发现成立。

### 2.2 配套文档绝对句全量扫描
```
grep -n "绝不删除" default-paths-final-draft.md → L52（ideas）、L53（.out-of-scope）
grep -n "绝不" default-paths-final-draft.md → L50（绝不篡改）、L52、L53
grep -n "绝对禁止删除" scenario-check.md → L161
grep -n "绝对禁止" scenario-check.md → L175（当作临时缓存自动清除）
grep -n "永久不可删" compatibility.md → L77（否定式：「不制造'绝对永久不可删'的机械教条」）
```
逐条判定见 result.md 配套勘误残留表。

### 2.3 compatibility L114 fp/input 混用
原文：「若源模板变动（`gen` 变）且目标文件正文未手改（`fp` 与旧输入吻合）→ [UPGRADE]」
`managed-blocks.md` §5 L306-310：条件为 `current_fp === header.fp`（正文未手改）且 `current_input !== header.input`（输入变了）。
「fp与旧输入吻合」把 fp 和 input 混为一个比较对象。三席一致同意以 managed-blocks.md 为准，此句为配套勘误不入条文。

## 3. 推理与判断依据

### A 项后果比较
- to-tickets:62 写死 `.scratch/`（F3 轮已实测原文）→ 固定层把 docs/work/ 写成「默认」会让 setup 或执行者误认为可直接迁入。
- wayfinder:25 / code-review:13,29 读 tracker doc（F3 轮已实测）→ 运行时权威确实是 issue-tracker.md 的声明，不是固定层表行。
- 前置双检（SKILL.md 第 1 步）要求 issue-tracker.md 已存在有效 → setup 阶段不存在「未声明」；「未声明」仅覆盖 issue-tracker.md 存在但未显式覆盖路径的情况，此时地基种子 issue-tracker-local.md 已声明 .scratch/，回退一致。

### D 项撤回依据
- issue-tracker-local.md:30：resolve 时追加 `## Answer`（内容更新）+ 设 `Status: resolved`（状态更新）+ 追加 gist+link 到 map.md Decisions-so-far（索引更新）。
- 「状态更新」仅覆盖第二类，漏掉第一、三类。原候选「更新」覆盖全部。撤回正确。

### B 项条文 vs 实施细节划分依据
- managed-blocks.md §5 决策树已完整覆盖 PAUSE/BROKEN/UPGRADE/DRIFT/CONFLICT/NO-OP 六动作。
- SKILL.md:20 原则 4 已规定「无标记既有文件暂停该文件并汇报待裁」。
- 固定层 §2.1「固定层：本文件全部条文」→ 条文应为跨项目原则，不应复述模板内部实现。
- 「非受管协作区」是原则（防止受管块被非受管内容污染）；「Section 3」是当前模板节号（可能变）；PAUSE/BROKEN 是实施分支。原则入条文，节号可括号注明，实施分支不入。

## 4. 未执行与能力边界

1. 未修改产品仓、固定层、已安装技能、原候选或他方 R1/R2。
2. 未运行迁移/测试/建索引/清理/提交推送/发 Issue。
3. 未访问 vault/凭据。
4. 未读取他方正在写的 R2 交付。
5. 所有核对为静态阅读与只读命令（grep/node crypto/diff）。无实跑，不写 PASS。
6. 本轮收敛文字为本席独立判断，不代表三席已达成一致；残余分歧见 result.md 末节，须第三轮投票前收敛。
