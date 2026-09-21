# 正式采纳第三轮证据记录 — Qoder CLI

## 1. 冻结输入校验

### 1.1 文件级 SHA256
```
node crypto.createHash('sha256'):
  ballot-texts.md  → 85f1cdd150071d33b86b8a5f4c5d9bc532361bd10e3fd8a7f1513ee7f02ab790 ✓
  ballot-texts.json → 732ea7b9acf8dfba87b684fc8b68ccb44d822e721f69e57460501ff124f5b4b2 ✓
  freeze-hashes.json 内容与上述两份吻合 ✓
```

### 1.2 选项级正文 SHA256
脚本从 ballot-texts.md 提取全部 18 个「正文SHA256 + markdown 围栏」对，逐条以 LF 规范化后复算：
```
verified: 18  failed: 0  total: 18
```
无提取篡改。

### 1.3 本席 R2 源文对照
本席 R2 `clauses.md` 中 §1.1（保留候选）、§2.3（修改）、§4.1-durable（修改）、§4.4（修改）文字与 ballot-texts.md 对应 qodercli 选项逐字一致。§1.4/§3.1-row/§3.4/§3.5-row/§4.1-temp/§4.2/§5.5 为三席相同文字，与本席 R2 逐字引用一致。

### 1.4 产品仓状态
```
docs/DECISIONS.md SHA256: c2b033490eda4470c1e2f63ebe2c5b7c7c3b2094cdfa277960c299a6996b9fd3（未变）
HEAD: 91ae63d214b782a77e874736ad6940b4362974fb（未变）
git status: 仅原有变更（M README.md, M templates/roles.md, ?? .scratch/ 等）
```
本轮未修改产品仓。

## 2. 本轮实际读取

- `document-homes-adoption-R3-20260910/discussion-brief.md`（全文）
- `document-homes-adoption-R3-20260910/ballot-texts.md`（全文，170 行）
- `document-homes-adoption-R3-20260910/ballot-texts.json`（hash 校验，未逐字段阅读）
- `document-homes-adoption-R3-20260910/freeze-hashes.json`（全文）
- 本席 R2 `clauses.md`（源文对照）
- 本席 R1/R2 `result.md`、`evidence.md`（立场连续性核对）

### 未读取
- 他方本轮 R3 票（遵守「不读其他席本轮票」）
- 他方 R2 clauses.md 全文（R2 轮已读其 R1 result.md；R2 clauses 由主持脚本提取为 ballot options，hash 已验证，无需重读源文）
- vault/凭据
- adoption-outline.md / migration-contract.md / scenario-check.md（本轮投票对象为冻结条文选项，配套文档勘误已在 R2 处理，不影响条文投票）

## 3. 投票推理依据

### §1.1 首选 B 依据
R2 D 项已核实 `issue-tracker-local.md:30`：resolve 操作包含三类写回——追加 `## Answer`（内容）、设 `Status: resolved`（状态）、追加 gist+link 到 `map.md` Decisions-so-far（索引）。选项 B 的「写回（状态、结论、map 或引用）」显式覆盖三类；选项 A 的「更新」可解释为同义但隐含。条文作为唯一事实源，显式优于隐含。两者均可接受，B 更优。

### §2.3 首选 A、反对 B 依据
- `managed-blocks.md` §5 决策树（L296-311）已完整覆盖 PAUSE/BROKEN/UPGRADE/DRIFT/CONFLICT/NO-OP 六动作。
- `SKILL.md:20` 原则 4 已规定「无标记既有文件暂停该文件并汇报待裁」。
- `SKILL.md` 第 1 步 + `verification.md:12,22,29` 已规定前置双检失败→零写入。
- 固定层 §2.1「固定层：本文件全部条文」→ 条文应为跨项目原则。B 把上述实施分支全部复述入 §2.3，使条文膨胀为操作手册。A 以一句「PAUSE 或损坏时只报告待裁、严禁写穿」表达原则，不复述分支，长度合理。C 不含 PAUSE 句但依赖 SKILL.md 覆盖，亦可接受。

### §4.1-durable 首选 A、反对 B 依据
- §4.1 是「什么放哪」总表，表行应简洁指明家与清理规则。
- B 把前置双检失败/零写入/setup 不创建/不得回退绕过/开票取票写回继续位置全部塞入一个单元格，与 §2.3 重复，破坏表格可读性。
- A 以括号内一句「未核过或保留模式维持既有声明路径」闭合核查失败回退，自足且不膨胀。
- C 用分号结构，回退隐含于「保留模式见 issue-tracker.md」，可接受但不如 A 显式。

### §4.4 首选 A、反对 B 依据
- §1.4「每条纪律只活在一处」→ 角色权责已在 §3.1 表「允许写」列完整表达（书记员写 `docs/`、执行者写与 diff 直接相关的文档行、清道夫不新增）。
- B 在 §4.4 复述「书记员维护 docs/；执行者只改与当次 diff 直接相关的登记行；清道夫不新增登记」，构成 §3.1 与 §4.4 的双重表达，违反 §1.4。
- A 含 Section 3 + PAUSE 一句 + §1.1 交叉引用 + 显式回退，自足且不重复 §3.1。
- C 最小修改，依赖 §2.3 确立非受管区承载，可接受但不如 A 自足。

## 4. 未执行与能力边界

1. 未修改冻结输入、产品仓、固定层、已安装技能或他方交付。
2. 未运行迁移/测试/建索引/清理/提交推送/发 Issue。
3. 未访问 vault/凭据。
4. 未读取他方本轮 R3 票。
5. 所有核对为静态阅读与只读命令（node crypto hash）。无实跑，不写 PASS。
6. 本轮投票基于冻结原文（hash 已验证），未改正文后自称赞成。
7. 投票结果不等于条文生效；须主持汇总、维护者裁定、§9.5 归档、SemVer 升版后方可宣称生效。实施票继续暂停。
