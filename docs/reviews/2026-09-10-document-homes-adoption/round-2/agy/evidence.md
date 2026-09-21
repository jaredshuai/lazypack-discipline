# 文档归属：正式采纳第二轮证据与依据记录 (evidence.md)

日期：2026-09-10  
参与者：AGY (Antigravity)｜席位 1  
主持方：Codex  
性质：第二轮互评依据、代码静态核验与未验证边界声明（纯只读核查，无实跑测试）

---

## 1. 实际读取与输入基准核验

本席位在本次起草前对三席 R1 交付物与产品仓基准进行了实时只读读取与哈希采样：

| 采样对象 | 文件绝对路径 | 关键比对行号 / SHA256 | 状态与核验结论 |
|---|---|---|---|
| **Cursor/Grok R1** | `.../document-homes-adoption-R1-20260910/cursor-grok/result.md` | L29-33 (§2.3), L43-47 (§3.4), L55-60 (§4.1), L73-77 (§4.4) | 已全量读取；确立其对 PAUSE 保护、事件驱动恢复、Section 3 隔离的方案细节。 |
| **Qoder CLI R1** | `.../document-homes-adoption-R1-20260910/qodercli/result.md` | L17-20 (§1.1 状态更新), L36-39 (Z08 勘误), L67-72 (勘误处理) | 已全量读取；确立其对“状态更新”措辞建议与 Z08 去绝对化诉求。 |
| **AGY R1** | `.../document-homes-adoption-R1-20260910/agy/result.md` | 全文 (L1-135) | 自身基准基线，用于比对收敛演进。 |
| **已冻结候选草案** | `.../document-homes-F1-FIX2-20260910/DECISIONS.candidate.md` | SHA256: `007f546921195a8fb7ca70ea22f0869ab6760326a5a7ccb57f038855c37626f3` | 与主持声明完全吻合。 |
| **产品仓当前生效** | `docs/DECISIONS.md` | SHA256: `c2b033490eda4470c1e2f63ebe2c5b7c7c3b2094cdfa277960c299a6996b9fd3` | 0.2.0 生效正文，100% 只读未修改。 |
| **产品仓 Git 状态** | 仓库根目录 (`.`) | HEAD: `91ae63d2...`；Index: `2dfc8cca...` | 0 staged changes；工作区除既有项外无新增修改。 |

---

## 2. 议题 A–E 的静态代码与文档核查证据

说明：所有证据均直接提取自磁盘物理文件（Static Inspection），标明行号，杜绝主观臆测。

| 议题 | 核实文件与关键行号 | 静态核查确立的硬事实 | 对互评收敛的约束与支撑 |
|---|---|---|---|
| **议题 A**（前置双检与工单写死） | `skills/lazypack-setup/SKILL.md:18`<br>`to-tickets/SKILL.md:62` | `SKILL.md:18` 明确第 1 步前置双检强校验 `docs/agents/issue-tracker.md` 存在且非空，缺失则直接中断报错；`to-tickets:62` 明文硬编码 `.scratch/<feature-slug>/issues/`。 | **推翻 CG“未声明时沿用 .scratch”的假定**。managed 项目中不存在未声明状态；且外部 tracker（GitHub）不应沿用 scratch。确立落点以 tracker 实际声明为准，核查未通过则在保留模式下继续。 |
| **议题 B**（Section 3 与 PAUSE 保护） | `skills/lazypack-setup/templates/ARTIFACTS.md:23-38`<br>`managed-blocks.md:280-320` | `templates/ARTIFACTS.md` 中 Section 2 是受管块（固定 4 插槽），Section 3 是“项目自选材料登记（非受管协作区）”；`managed-blocks.md` 规定受管块指纹校验严格闭合。 | **支持 CG 关于 Section 3 与 PAUSE 的保护提议**。八区映射若写进 Section 2 会导致指纹损坏（BROKEN）；PAUSE/BROKEN 时严禁写穿是保障用户资产安全的核心原则，应写入固定层。 |
| **议题 C**（事件驱动历史原意） | `docs/DECISIONS.md:3.4` (0.2.0) | 生效条文明文规定：“书记员在每张票关闭后扫一遍；清道夫在每次发版前扫一遍。**事件驱动，不用定时器。**” | **证实 F1 候选脱落此句属于无意疏漏**。CG 提议恢复该句事实依据确凿，本席全力支持恢复。 |
| **议题 D**（工单更新消费者范围） | `to-spec/SKILL.md:1-40`<br>`wayfinder/SKILL.md:25` | `to-spec` 负责生成规格并更新验收标准；`wayfinder` 依据 `issue-tracker.md` 维护工单地图与子任务层级。 | **反驳 Qoder 将核查收窄为“状态更新”**。工单消费者不仅涉及 `Status:` 行变动，更涉及验收项与拓扑关系更新，必须维持“更新”全称以覆盖全量消费者。 |
| **议题 E**（清道夫角色权限） | `docs/DECISIONS.md:3.1`<br>`skills/lazypack-setup/templates/roles.md:40` | 角色表“允许写”列明文规定清道夫：“仅在通过四步清理关卡后删除或移动，**不新增**”。 | 三席一致确认清道夫绝对无权新增登记行，角色权限防撞车矩阵完全闭环。 |

---

## 3. 未验证边界与能力免责声明

依任务书“没有实跑不写 PASS”之铁律，本席位声明以下边界：

1. **零自动化实跑（NO PASS CLAIMED）**：
   - 本轮未在任何真实项目上执行 `lazypack-setup` 自动化安装；
   - 未运行任何自动化测试套件；
   - 未执行迁移演练脚本或清理脚本；
   - 所有条文与逻辑收敛均为只读静态推演，**绝不声称任何技能行为实跑通过（NO PASS）**。
2. **产品仓绝对只读**：
   - 产品仓 仓库根目录 (`.`) 及其已安装技能保持 100% 只读，未作任何字节改动。
3. **实施票与生效状态**：
   - 暂停的 `document-routing-S1-implement` 实施票继续维持暂停；
   - 本轮为第二轮条文互评，尚未进入第三轮表决，**固定层规则尚未生效**。
