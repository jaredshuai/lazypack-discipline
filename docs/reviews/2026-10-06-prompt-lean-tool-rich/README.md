# 提示词瘦、工具肥原则会议留档

日期：2026-10-06  
议题：固定层 `docs/DECISIONS.md` 新增"提示词瘦、工具肥"原则（来源：issue #36）  
主持方：Droid（§9.2：不投票、不提方案，只生成提示词、分配对手、汇总）  
参与席位：5 位 AI（Participant 1-5）  
状态：**第一轮准备完成，等待执行**

---

## 议题背景

### 核心提案
强制性规则从提示词迁入确定性工具，提示词仅保留意图与原则，具体约束交由 linter、formatter、pre-commit hook 等工具强制执行。

### 技术依据
1. **Lost in the Middle 论文**（arXiv:2307.03172）：
   - 研究表明大语言模型在处理长上下文时，对中间位置信息的召回率显著下降
   - 模型更容易关注输入的开头和结尾部分
   - 长规则文档埋在提示词中间时，实际执行效果大打折扣

2. **Uncle Bob 实测**（Uncle Bob × Matt Pocock 访谈）：
   - 长规则文档在提示词里形同虚设，被称为"海盗法典"（guidelines, not rules）
   - AI 编码助手会选择性忽略或曲解冗长的编码规范
   - 人类开发者依赖工具强制执行规范，AI 同样需要

### 实践方向
- 提示词：表达"为什么"（设计意图、架构原则、权衡考量）
- 工具层：执行"是什么"（具体规则、格式约束、命名规范）
- 避免：在提示词中堆砌详细规则条文，期待 AI 自觉遵守

---

## 执行方案

详见 [EXECUTION-PLAN.md](EXECUTION-PLAN.md)

---

## 第一轮：独立意见（各席互不可见）

**状态**：✅ 已完成（5/5 全部提交）

**提示词**：
- [Participant 1](round-1/prompts/participant-1.md) ✅
- [Participant 2](round-1/prompts/participant-2.md) ✅
- [Participant 3](round-1/prompts/participant-3.md) ✅
- [Participant 4](round-1/prompts/participant-4.md) ✅
- [Participant 5](round-1/prompts/participant-5.md) ✅

**提交成果**：
- Participant 1: ✅ [result.md](round-1/participants/participant-1/result.md) + [evidence.md](round-1/participants/participant-1/evidence.md)
- Participant 2: ✅ [result.md](round-1/participants/participant-2/result.md) + [evidence.md](round-1/participants/participant-2/evidence.md)
- Participant 3: ✅ [result.md](round-1/participants/participant-3/result.md) + [evidence.md](round-1/participants/participant-3/evidence.md)
- Participant 4: ✅ [result.md](round-1/participants/participant-4/result.md) + [evidence.md](round-1/participants/participant-4/evidence.md)
- Participant 5: ✅ [result.md](round-1/participants/participant-5/result.md) + [evidence.md](round-1/participants/participant-5/evidence.md)

**汇总报告**：[ROUND-1-SUMMARY.md](round-1/ROUND-1-SUMMARY.md)

**核心发现**：
- 总体立场：5/5 修改后支持，0 人同意草案原文
- 核心共识：判据应按「可判定性」而非「强制后果」分类；常驻文件必须补「指针」
- 最大分歧：章节归属（新 §11: 2 票 / 并入 §6: 2 票 / 并入 §4: 1 票）

---

## 第二轮：互评与收敛

**状态**：✅ 已完成（5/5 全部提交）

**目标**：
- 每位参与者阅读其他 4 位的第一轮意见
- 对核心分歧点进行论证和反驳
- 尝试收敛到共识或明确无法调和的分歧

**提示词**：
- [Participant 1](round-2/prompts/participant-1.md) ✅
- [Participant 2](round-2/prompts/participant-2.md) ✅
- [Participant 3](round-2/prompts/participant-3.md) ✅
- [Participant 4](round-2/prompts/participant-4.md) ✅
- [Participant 5](round-2/prompts/participant-5.md) ✅

**提交成果**：
- Participant 1: ✅ [result.md](round-2/participants/participant-1/result.md) + [evidence.md](round-2/participants/participant-1/evidence.md) + [clauses.md](round-2/participants/participant-1/clauses.md)
- Participant 2: ✅ [result.md](round-2/participants/participant-2/result.md) + [evidence.md](round-2/participants/participant-2/evidence.md)
- Participant 3: ✅ [result.md](round-2/participants/participant-3/result.md) + [evidence.md](round-2/participants/participant-3/evidence.md)
- Participant 4: ✅ [result.md](round-2/participants/participant-4/result.md) + [evidence.md](round-2/participants/participant-4/evidence.md)
- Participant 5: ✅ [result.md](round-2/participants/participant-5/result.md) + [evidence.md](round-2/participants/participant-5/evidence.md)

**汇总报告**：[ROUND-2-SUMMARY.md](round-2/ROUND-2-SUMMARY.md)

**收敛结果**：
- **章节归属**：4:1 多数共识（§6.6），P3 表示妥协意愿
- **判据结构**：5/5 完全共识（三轴分离：口径唯一 + 可判定性 + 接线授权）
- **"迁入"含义**：5/5 完全共识（口径正文不迁移）
- **立场变化**：4/5 参与者改变立场（P1/P2/P4/P5）
- **新增共识**：7 项（常驻清单四类、成本判断、混合规则切分、双向规则等）

---

## 维护者裁决

**日期**：2026-10-07  
**裁决方**：Droid（代表维护者）

### 三项裁决

1. **章节归属**：采纳 §6.6（4:1 多数 + P3 妥协意愿）
   - 理由：与 §6.1/§6.3 既有承载最连续，避免新章维护成本
   
2. **§4 新增行**：采纳 P1 让步方案（条文声明 + 行/句二选一）
   - 理由：§4.3"册上查不到=未登记"论证成立，需前置解决
   
3. **第四态定位**：定为"正式形态"（5/5 全体接受 + 本仓实证支持）
   - 理由：本仓 check_commit_msg.mjs / check_doc_pairs.mjs 按设计保持此态

### 实施结果

- ✅ 新增 §6.6 载体三轴分离（6 个子条款）
- ✅ 更新 §6.1 第二句引用 §6.6
- ✅ 更新 §6.3 末句引用 §6.6.2
- ✅ §4 表新增"工具门禁配置与接线"行
- ✅ §4 表 AGENTS.md 行扩充保留清单
- ✅ 版本升级：0.4.0 → 0.5.0
- ✅ 提交：commit fd8deac

**状态**：已收束，条文已生效

---

## 参考与依据

1. **Issue #36**：https://github.com/jaredshuai/lazypack-discipline/issues/36
2. **Lost in the Middle 论文**：arXiv:2307.03172
3. **Uncle Bob × Matt Pocock 访谈**：关于 AI 编码助手与规则执行的实践观察
