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

**状态**：提示词已生成，等待用户执行 5 次讨论

**提示词**：
- [Participant 1](round-1/prompts/participant-1.md)
- [Participant 2](round-1/prompts/participant-2.md)
- [Participant 3](round-1/prompts/participant-3.md)
- [Participant 4](round-1/prompts/participant-4.md)
- [Participant 5](round-1/prompts/participant-5.md)

**输出**（等待收集）：
- Participant 1: `round-1/participants/participant-1/result.md` + `evidence.md`
- Participant 2: `round-1/participants/participant-2/result.md` + `evidence.md`
- Participant 3: `round-1/participants/participant-3/result.md` + `evidence.md`
- Participant 4: `round-1/participants/participant-4/result.md` + `evidence.md`
- Participant 5: `round-1/participants/participant-5/result.md` + `evidence.md`

---

## 第二轮：互评与收敛

_待第一轮完成后生成_

---

## 第三轮：修订后投票

_待第二轮完成后生成_

---

## 参考与依据

1. **Issue #36**：https://github.com/jaredshuai/lazypack-discipline/issues/36
2. **Lost in the Middle 论文**：arXiv:2307.03172
3. **Uncle Bob × Matt Pocock 访谈**：关于 AI 编码助手与规则执行的实践观察
