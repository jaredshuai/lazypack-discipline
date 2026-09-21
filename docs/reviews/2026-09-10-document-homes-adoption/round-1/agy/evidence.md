# 文档归属：正式采纳第一轮证据与依据记录 (evidence.md)

日期：2026-09-10  
参与者：AGY (Antigravity)｜席位 1  
主持方：Codex  
性质：第一轮条文意见的静态证据、推理依据与未验证边界记录（纯只读核查，无实跑测试）

---

## 1. 基准输入采样与一致性实测

本席位在本次起草前对输入源进行了实时采样与比对（采样时间：2026-09-10T08:32:05+08:00）：

| 输入对象 | 文件绝对路径 | 算法 | 实际测得哈希值 | 任务书基准 / 预期 | 判定 |
|---|---|---|---|---|---|
| **固定层现行原文** | `docs/DECISIONS.md` | SHA256 | `c2b033490eda4470c1e2f63ebe2c5b7c7c3b2094cdfa277960c299a6996b9fd3` | 0.2.0 生效正文 | 吻合 |
| **内置固定层快照** | `skills/lazypack-setup/references/DECISIONS.md` | SHA256 | `c2b033490eda4470c1e2f63ebe2c5b7c7c3b2094cdfa277960c299a6996b9fd3` | 与主文件双向镜像 | 吻合 |
| **已冻结候选草案** | `<HANDOFF_DIR>/document-homes-F1-FIX2-20260910/DECISIONS.candidate.md` | SHA256 | `007f546921195a8fb7ca70ea22f0869ab6760326a5a7ccb57f038855c37626f3` | `007f5469...c37626f3` | 完全吻合 |

### Git 状态核验
- **HEAD Commit**：`91ae63d214b782a77e874736ad6940b4362974fb`
- **暂存区 (Index)**：SHA256 为 `2dfc8ccae76ce4186cd8d1afcec31bb7395d0bfa66695eeff45f113b2aa79135`，0 staged changes。
- **工作区状态**：仅保留本轮前既有的未暂存修改（`README.md`、`roles.md`）及未跟踪目录；本席位未在产品仓增加、修改或删除任何字节。

---

## 2. 拟议条文的静态事实依据与推理链条

说明：所有结论均基于对实际文件的只读静态文本与代码审查（Static Code/Document Inspection），**标明行号，不伪装为动态实跑**。

| 议题 / 条文 | 引用源及关键行号 | 静态核查确立的硬事实 | 推理与结论 |
|---|---|---|---|
| **§1.1 & §4.1**（消费者核查与标准推荐） | `<CLAUDE_DIR>/skills/to-tickets/SKILL.md:62`<br>`ask-matt/SKILL.md:23` | L62 明文写死：`write one file per ticket under .scratch/<feature-slug>/issues/<NN>-<slug>.md`；`ask-matt:23` 叙述写死 `.scratch/`。 | **事实不支持宣称 docs/work/ 是现行可用默认**。因此 §1.1 必须设为“消费者核查义务”，§4.1 必须定性为“标准推荐（需核查消费者适配）”，并在项目层提供保留模式平级支撑。 |
| **§2.3**（Section 3 协作区映射） | `skills/lazypack-setup/templates/ARTIFACTS.md:31-38` | Section 2 受管块内仅有 4 个固定插槽行；Section 3 明文为“项目自选材料登记（非受管协作区）”，setup 重跑保持本区字节不变。 | **八区实际映射只能承载于 Section 3**。若写入 Section 2 会破坏固定 4 槽依赖集与指纹校验算法。条文明确指明 Section 3 属必要澄清。 |
| **§3.4 & 勘误 2**（去绝对化保留） | `<CLAUDE_DIR>/skills/triage/OUT-OF-SCOPE.md:3`<br>`setup-matt-pocock-skills/triage-labels.md:15` | `OUT-OF-SCOPE.md:3` 指出拒绝需求是一概念一文件的持久记录；`triage-labels.md:15` 说明状态词表由项目实际配置。 | `.out-of-scope/` 是权威来源资产而非临时缓存，故 Gate 1 拦截自动清除。但它不是“永久不可删”，仍依保留目的与授权流转。配套文档中的“绝不删除”属于超纲绝对句，应予清除。 |
| **勘误 1**（算法真实逻辑） | `skills/lazypack-setup/references/managed-blocks.md:§5 (L280-320)` | 规范声明了 6 类状态动作：`NO-OP`、`CREATE`、`UPGRADE`、`DRIFT`、`CONFLICT`、`PAUSE`、`BROKEN`。其判定逻辑是：先比较正文哈希与 `header.fp`，再比较 `input` 与 `src`。 | 证实主持勘误 1 准确。前期报告中“fp 与旧输入吻合”属笔误，受管块判定必须严格遵守 managed-blocks 原文定义的双轨比较与完整状态集合。 |
| **§5.5**（CHANGELOG 边界） | `docs/DECISIONS.md:5.5`<br>`Keep a Changelog 1.1.0` | CHANGELOG 由提交生成，面向对外发布说明。工单中包含 acceptance criteria 与验收过程。 | CHANGELOG 不是全量验收台账，验收记录沉淀于工单与规格中符合单一事实源原则。 |

---

## 3. 未验证边界与能力免责声明

依任务书“没有实跑不写 PASS”之铁律，本席位显式声明以下工程边界：

1. **零自动化实跑（NO PASS CLAIMED）**：
   - 本轮未运行任何测试套件、未安装或重装任何技能、未在目标项目上执行自动化 setup 生成、未触发任何 pre-commit hook。
   - 所有逻辑对账与条文评审均为静态文本推演，**绝不声称任何技能行为实跑通过（NO PASS）**。
2. **产品仓绝对只读**：
   - 产品仓 （仓库根目录） 与已安装技能目录 `<CLAUDE_DIR>/skills/` 保持 100% 只读，未作任何写入或修改。
3. **实施票与生效状态**：
   - 暂停的 `document-routing-S1-implement` 实施票继续维持暂停。
   - 本第一轮意见属于正式采纳讨论的独立起草阶段，尚未进行第二轮互评与第三轮正式表决，**固定层规则尚未生效，不代表正式采纳已完成**。
