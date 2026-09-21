# 正式采纳第一轮证据记录 — Qoder CLI

## 1. 输入核验

- 候选 SHA256：`node -e "crypto.createHash('sha256')..."` → `007f546921195a8fb7ca70ea22f0869ab6760326a5a7ccb57f038855c37626f3`，与主持声明一致。
- 产品仓 `docs/DECISIONS.md` 与 `skills/lazypack-setup/references/DECISIONS.md` SHA256 均为 `c2b033490eda4470c1e2f63ebe2c5b7c7c3b2094cdfa277960c299a6996b9fd3`（F3 轮已核实，本轮未变）。
- HEAD：`91ae63d214b782a77e874736ad6940b4362974fb`。git status 仅见原有变更（M README.md, M templates/roles.md, ?? .scratch/, ?? AGENTS.md, ?? docs/ARTIFACTS.md, ?? docs/VISION.md, ?? docs/reviews/...）。产品仓未被修改。

## 2. 本轮实际读取

### FIX2 交付（全文）
`document-homes-F1-FIX2-20260910/`：DECISIONS.candidate.md、fixed-layer-delta.md、compatibility.md、default-paths-final-draft.md（§1-§2 全表 + §3 前 60 行）、migration-contract.md（F3 轮已全文读取，本轮确认未变动部分）、adoption-outline.md（F3 轮已读取）、scenario-check.md（grep 核实场景 12 .out-of-scope 措辞）、evidence.md（未全文重读，仅核对 host 勘误 #1 涉及的 L64）、review-response.md（未全文重读）、changes.patch（未重读，host 已验证 patchMatches=true）、manifest.json（host 已验证 12 份零不符）。

### 主持核验
`document-homes-FIX2-host-20260910/`：host-closeout.md（全文）、verification.json（全文）。

### 产品仓固定层（F3 轮已全文读取，本轮未重读）
docs/DECISIONS.md、SKILL.md、templates/ARTIFACTS.md、templates/resident-entry.md、references/managed-blocks.md、references/retention-sections.md。

### 已安装同级技能（F3 轮已全文读取并逐行核实，本轮未重读）
to-tickets、ask-matt、wayfinder、code-review、triage/OUT-OF-SCOPE.md、setup-matt-pocock-skills（SKILL.md、issue-tracker-local.md、triage-labels.md、domain.md）。

### 未读取
- 其他参与者本轮材料（AGY、Cursor/Grok 的 R1 交付目录存在但未打开）。
- F1/FIX1 原稿（本轮仅对照 FIX2 冻结候选）。
- vault/凭据。

## 3. 关键核实点

### 3.1 主持勘误 #1：compatibility L114
原文：「若源模板变动（`gen` 变）且目标文件正文未手改（`fp` 与旧输入吻合）→ `[UPGRADE]`」
`managed-blocks.md` §5 决策树（L306-310）：
- `fp 相同 但 input 不同 → [UPGRADE]`
- `fp 不同 但 input 相同 → [DRIFT]`
- `fp 不同 且 input 不同 → [CONFLICT]`

条件为 `current_fp === header.fp`（正文未手改）且 `current_input !== header.input`（输入变了）。FIX2 文字「fp与旧输入吻合」把 fp 和 input 混为一个概念。勘误成立。

### 3.2 主持勘误 #2：.out-of-scope 绝对句
- 候选 §3.4 Gate 1：「命中登记或权威原件者不得当作可丢弃缓存自动清除，是否归档或删除仍依保留目的、有效引用与特定授权判断」——目的+授权判断，非绝对禁删。
- 路径表 Z08 保留分支：「绝不删除」——绝对句，与 Gate 1 不一致。
- 场景 12 L175：「绝对禁止当作临时缓存自动清除」——与 Gate 1 一致（禁止的是"当作缓存自动清除"，不是禁止一切删除）。
勘误成立：仅路径表 Z08 残留不一致。

### 3.3 主持勘误 #3：非默认 tracker
grep FIX2 全文未出现「必须等上游PR」或等效表述。compatibility §1.3 给出两条并列路径，§1.1 候选条文写「记为受限」。已闭合。

### 3.4 F3 条件落实核实
- C1（§1.1 限定）：候选 L16 已改为核查+受限标记，不再声称「依指针寻址」为事实。✓
- C2（DRIFT/UPGRADE）：compatibility §2.4 L112-117 已改为重跑本地评估+正确三态判定（L114 fp/input 混用残留，见勘误 #1）。✓（附残留）
- C3（Section 2 vs 3 + PAUSE）：compatibility §2.2 L103-105 明确 Section 2 四槽保护+八区映射在 Section 3+PAUSE 规则；路径表 Z04 保留分支改为「触发[PAUSE]保护原样」。✓
- C4（清道夫职责）：compatibility §2.1 L100 明确 setup 首次/书记员维护/清道夫仅读+授权删移；E02 负责人列已改。✓
- C5（Gate 1 绝对化 + Gate 2 未知 + gitignore）：Gate 1 改为目的+授权；Gate 2 改为报告未知+暂停；Z05 .scratch 改为「已忽略不否定权威，须具备可还原备份，纳管须用户授权」。✓

## 4. 未执行与能力边界

1. 未修改产品仓、固定层、已安装技能或任何历史稿。
2. 未运行迁移/测试/建索引/清理/提交推送/发 Issue。
3. 未访问 vault/凭据。
4. 未读取其他参与者本轮材料。
5. 所有核对为静态阅读与只读命令（node crypto/diff/grep）。无实跑，不写 PASS。
6. 本轮意见基于 FIX2 冻结候选（SHA256 已验证），若后续轮次候选字节变动，须重新核验。
