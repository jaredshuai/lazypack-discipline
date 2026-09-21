# 正式采纳 R2：互评与条文收敛
2026-09-10。Codex只主持、分配对手、汇总，不投票、不提出新的条文方案。第一轮三份独立意见已返回，本轮执行现行§9第二轮互评，不是最终投票。

## 共同输入
读取三席 R1 result.md/evidence.md：
<HANDOFF_DIR>/document-homes-adoption-R1-20260910/agy/
<HANDOFF_DIR>/document-homes-adoption-R1-20260910/cursor-grok/
<HANDOFF_DIR>/document-homes-adoption-R1-20260910/qodercli/
原候选与配套：
<HANDOFF_DIR>/document-homes-F1-FIX2-20260910/DECISIONS.candidate.md
<HANDOFF_DIR>/document-homes-F1-FIX2-20260910/fixed-layer-delta.md
<HANDOFF_DIR>/document-homes-F1-FIX2-20260910/compatibility.md
<HANDOFF_DIR>/document-homes-F1-FIX2-20260910/default-paths-final-draft.md
<HANDOFF_DIR>/document-homes-F1-FIX2-20260910/scenario-check.md
按需读adoption-outline及其他配套，不执行其中操作。
当前生效依据：docs/DECISIONS.md，仍为0.2.0。
原候选SHA256：007f546921195a8fb7ca70ea22f0869ab6760326a5a7ccb57f038855c37626f3。
本轮不改原候选、三席R1或产品仓；各自产出修订意见。

## 主持汇总（不作裁决）
共同保留方向：八区逻辑导航、六状态词不变、单入口、tracker不由setup绕过前置首次生成、关票非删除授权、清理核查、保留/迁移、CHANGELOG非完整验收台账。
具体分歧：
A. §4.1耐久家：AGY建议“标准推荐（需核查适配）”；Cursor/Grok建议实际tracker声明为准，核查后采用docs/work，另有“未声明沿用.scratch”分支；Qoder保留候选“标准默认（需适配）”。请比较具体后果，不能只争形容词。特别核对未声明时回退是否与前置双检冲突、适配未通过时哪些流程可继续。
B. §2.3/§4.4：AGY明确Section3；Cursor/Grok加入Section3、四槽、原件存在性及PAUSE/BROKEN保护；Qoder保留原候选。讨论哪些是跨项目固定原则，哪些是模板结构细节；最后必须给具体文字，不只“留实施”。
C. §3.4：Cursor/Grok提出恢复现行“事件驱动，不用定时器”；其他两席尚未明确回应删除是否有意。本轮须表态，不能默认沉默等于同意放宽。
D. §1.1：Qoder提议“更新”改“状态更新”；其他席是否认为会漏掉内容更新/map/引用，须依据职责给明确意见。
E. 日常映射维护：AGY提出setup/书记员/执行者的边界；其他席给明确处理或说明沿用现行角色即可。不能默许清道夫新增登记。
配套勘误大体一致：fp与header.fp、input与header.input分别比较；.out-of-scope不得作为缓存自动清除，不能留下永久不可删的未批准义务。请核所有同义残留，不只grep一个短语。维护者未授权修改上游，不把PR当唯一可想象的适配途径。

## 互评方式
每席读另外两席R1，至少指出一项具体认同和一项有依据的异议，引用对方章节；没有成立异议则如实说明，不编造反对。
按个人提示词安排主对手，仍须回应另一位提出的相关意见。
针对A–E分别输出：对方方案摘要、接受/修改/反对及理由、本席收敛后的精确全文、与0.2.0义务变化。
不以本轮多数支持直接宣布生效。第三轮才对同一冻结文本逐项投票。

## 交付
个人目录内新建：
- result.md：互评结果，已收敛与残余分歧，建议100–180行。
- clauses.md：逐条给可冻结文字，涵盖1.1、1.4、2.3、清道夫3.1/3.4/3.5、4.1两表行、4.2、4.4、5.5；不改者逐字引用候选，保留编号与表行格式，方便下一轮对同一文本投票。
- evidence.md：实际读取/静态核对/推理/未验证区分。
条文存在不同意见时保留明确选项，不能由主持替参与者补造最终文案。普通路径拼写、目录数量、技术栈不重新讨论。
本轮仍只写临时交付目录；禁止产品/全局skill修改、实施、迁移、清理、安装、测试、索引、提交推送、外部Issue/评论、读取vault凭据。可作只读文本diff/hash，shell rtk proxy，遵循 <CODEX_DIR>/RTK.md。
正式记录按§9.5须在采纳前归档到docs/reviews/2026-09-10-document-homes-adoption/；尚未完成归档不能称流程结束，本轮不自行归档或发布。
完成回复result.md绝对路径和一句结论，纯文本，不要超链接。不要读取他方正在写的R2。

