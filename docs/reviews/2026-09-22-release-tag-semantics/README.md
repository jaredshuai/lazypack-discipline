# §5.7 发版与标签语义修订会议留档

日期：2026-09-22
议题：固定层 `docs/DECISIONS.md` §5.7 修订（来源：issue #4 裁定记录，草案见第一轮提示词）
主持方：指挥 AI（§9.2：不投票、不提方案，只生成提示词、分配对手、汇总）
参与席位：devin（席位 1）、grok（席位 2）、qoder（席位 3）
状态：**已生效**——三轮全部归档，维护者裁定批准（2026-09-22，[round-3/tally.md](round-3/tally.md) §七），施工票 issue #22 验收通过，生效提交 `4e971c6`，标签 `v0.4.0` 已打；#4 已关闭。

---

## 第一轮：独立意见（各席互不可见）

- 共同提示词：[round-1/prompts/participant-prompt.md](round-1/prompts/participant-prompt.md)
- devin（席位 1）：[round-1/devin/result.md](round-1/devin/result.md)
- grok（席位 2）：[round-1/grok/result.md](round-1/grok/result.md)
- qoder（席位 3）：[round-1/qoder/result.md](round-1/qoder/result.md)

## 第一轮共识与分歧（主持人汇总，不是结论）

**三方一致**：S2（产物不自动构成发版）、S4（标签不代表成功）应入固定层而非 §2.4 默认值；S3（发版须以版本标签标识对应提交）不过强；S5（创建者与先后归项目层）同意；草案例举厂商名单可删。

**分歧轴线**：

1. **术语**：devin、grok 主张保留「平台段」（与 §4 一致，diff 最小）；qoder 主张本轮统一改名「项目段」并同步三处旧位置。
2. **正面意图句**：grok、qoder 主张条文必须正面写「按发布意图认定，不按执行地点/产物推定」（qoder 视为最大缺口）；devin 未加此句，其补缺落在「发布动作与成功判据由项目层写明」。
3. **「发布成功」术语**：qoder 反对引入（与既有「未选定 / 已选定未验证」词族冲突），建议「不证明该次发版已完成」；grok 主张保留否定句但不另定义；devin 沿用「成功判据」措辞。
4. **S3 收紧方向**：qoder 主张「标签指向产生该发布物的提交」+ 重复发版/分渠道标注交项目层；grok 主张「标识被发布的提交」+ 不规定标签个数；devin 认为现行草案即可，可选收紧「推送至协作远端」。
5. **qoder 追加议题**：本仓 0 标签的自我一致性（本仓是否受 §5.7 约束须写清）；修订同步代价（一处条文变动触发 5 模板 + gen 全量 UPGRADE，建议一次性改定）。

## 第二轮：互评（已分发）

- 提示词：[round-2/prompts/](round-2/prompts/)（每人一份，含对手分配）
- 规则：每人至少驳一人、至少认一人；回应别人点名自己的问题；对开放问题表逐项表态。

## 第二轮：互评（已归档）

- devin：[round-2/devin/result.md](round-2/devin/result.md)——让步与采纳清单，终稿含「已推送标签不得移动或复用」入固定层
- grok：[round-2/grok/result.md](round-2/grok/result.md)——「发布成功」术语折中句、§5.4 关系句、再次上传不强制新标签
- qoder：[round-2/qoder/result.md](round-2/qoder/result.md)——撤回改名主张，采纳 grok 句式，本仓标签收口方案

## 第三轮：修订后投票（已归档）

- 冻结选票：[round-3/ballot.md](round-3/ballot.md)（B1–B12 共 12 项）
- 投票提示词：[round-3/prompts/](round-3/prompts/)
- devin：[round-3/devin/result.md](round-3/devin/result.md)
- grok：[round-3/grok/result.md](round-3/grok/result.md)
- qoder：[round-3/qoder/result.md](round-3/qoder/result.md)
- 计票书与多数条文合并稿：[round-3/tally.md](round-3/tally.md)——B1/B2/B5/B7/B8/B12 全票通过，B3/B6/B9/B10/B11 多数通过，B4 翻转为 grok 案；含选票误述记录与呈维护者裁定的 §5.7 候选全文
