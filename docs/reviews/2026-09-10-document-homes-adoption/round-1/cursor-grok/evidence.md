# 采纳 R1 证据（Cursor/Grok）

无实跑、无 PASS、无迁移、未读其他席本轮交付、未改产品/技能/FIX2。

## 原文

- 生效 `docs/DECISIONS.md` 0.2.0：§1.1–1.4、§2.3、§3.1 清道夫行、§3.4「事件驱动，不用定时器」、§4.1「规格、票的草稿 / 票关闭即删」、§4.2 六词、无 4.4、§5.5 首句、§9.3。
- FIX2：`DECISIONS.candidate.md` 全文；`fixed-layer-delta.md` 变更 1–10 与 §2 对账；`default-paths-final-draft.md` E02/Z02/Z04/Z05/Z08、§3 raw_qa、§4 裁决 1–4；`compatibility.md` §1.1–1.4、§2.2–2.4（含 L114）；`migration-contract.md` §1；`adoption-outline.md` V01–V11。按需：FIX2 result 首段、scenario 12。
- 主持：`host-closeout.md` 勘误 1–5；`verification.json`。
- 本机只读复核（非行为实测）：`to-tickets/SKILL.md:62`；`ask-matt/SKILL.md:23`；`managed-blocks.md` 决策树 L301–310；`templates/ARTIFACTS.md` Section 2 四槽；本仓人工 `docs/ARTIFACTS.md`（非模板结构）。

## 核验

- 候选 SHA256：`007f546921195a8fb7ca70ea22f0869ab6760326a5a7ccb57f038855c37626f3`（node 复算，11974 字节），与 brief / host-closeout 一致。
- 两份产品 DECISIONS 前轮已为 `c2b033490eda4470c1e2f63ebe2c5b7c7c3b2094cdfa277960c299a6996b9fd3`；本轮未重算，不据此证全程无写入。

## 观察

- 候选 1.1 已无「依指针寻址」；3.4 Gate1/2 已无「永不可删 / 未知视为活跃」。
- 候选 3.4 无「事件驱动，不用定时器」；delta 变更 4 旧文引用含此句，拟改文不含。
- 候选 4.1 耐久家仍写「标准默认：`docs/work/<feature>/`（需适配）」。
- 路径表 Z08 与 §4 裁决 4 仍有「绝不删除」；场景 12 Gate1 已改为「禁止当缓存自动清除」，Gate2 对 wontfix 仍写「严禁物理删除」。
- compatibility L114 写「fp 与旧输入吻合」判定 UPGRADE；现行树是 fp 对 header.fp、input 对 header.input。

## 推理

- 把 `docs/work/` 放进固定层「家」列，会在消费者未遵从时造成条文家与实际写点双权威；1.1 的「记为受限」应压过 4.1 的「标准默认」。
- PAUSE 若不进 2.3/4.4，C3 只活在配套稿，表决后 setup 仍可能按「须登记」写穿。
- 「绝不删除」与 Gate1「依目的与授权」不能同时当已确认义务；本席选后者。

## 未验证

- 非本机宿主、其他版本 Matt skills、真实旧仓迁移、setup 重跑状态机、链接重算、Windows `git mv`。
- 未打开 `document-homes-adoption-R1-20260910` 下其他席目录。
