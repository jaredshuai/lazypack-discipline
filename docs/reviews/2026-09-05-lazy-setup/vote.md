# 第三轮计票与裁决记录

日期：2026-09-05。状态：会议结束；19 项均形成多数，无僵局，无需第四轮。

## 输入核验

统一选票：[R3-v1](round-3-ballot.md)，Git blob 内容标识 `07ddacf696de08e77b2a00bc0cb2d267704668de`；主持人实测与分发时一致。三份原票均声明该版本及同一内容标识，每份恰有 V01—V19 各一行，选项合法，无漏题或重复。

| 作者 | 原票 | 本次实测 Git blob 内容标识 |
|---|---|---|
| A | [第三轮](participants/A/round-3.md) | 587f2524d68dba2468cd7f9375433652eee64418 |
| B | [第三轮](participants/B/round-3.md) | bafec9f56d901346a27063ffe2eca51357665c50 |
| C | [第三轮](participants/C/round-3.md) | 83535788e41c3a59b05cf8449ce4eda8f44d3de4 |

主持人不投票。按统一选票已公布方式解析选择列，逐项与论证列核对。理由列的规格建议不计为新的决议正文；三者没有要求把支持票改投未经同文表决的新正文。B 对 V19 规格先行的强调是重申选票条件，不是另加支持条件。

## 票数

| 议题 | A | B | C | 多数选项 | 支持∶其他 |
|---|---|---|---|---|---|
| V01 交付形态 | YES | YES | YES | YES | 3∶0 |
| V02 产物数量 | ITEMS | ITEMS | ITEMS | ITEMS | 3∶0 |
| V03 固定层分发 | YES | YES | YES | YES | 3∶0 |
| V04 提问数量 | NEEDED | NEEDED | NEEDED | NEEDED | 3∶0 |
| V05 写盘确认 | YES | YES | YES | YES | 3∶0 |
| V06 Matt 前置 | A | B | B | B | 2∶1 |
| V07 常驻文件选择位置 | SKILL | SKILL | SKILL | SKILL | 3∶0 |
| V08 托管区重跑 | FINGERPRINT | FINGERPRINT | REGENERATE | FINGERPRINT | 2∶1 |
| V09 无标记/损坏文件 | A | B | B | B | 2∶1 |
| V10 脏目标预检 | PRECISE | PRECISE | CLEAN | PRECISE | 2∶1 |
| V11 中断恢复 | REPORT | REPORT | REPORT | REPORT | 3∶0 |
| V12 hook 放置 | TRACKED | TRACKED | TRACKED | TRACKED | 3∶0 |
| V13 缺命令处理 | CONNECT | RECOMMEND | RECOMMEND | RECOMMEND | 2∶1 |
| V14 完成证据 | A | A | A | A | 3∶0 |
| V15 §2.3 hook 补丁 | A | A | A | A | 3∶0 |
| V16 UX 规则位置 | SKILL | SKILL | SKILL | SKILL | 3∶0 |
| V17 跨设备/MCP 范围 | DEFER | DEFER | DEFER | DEFER | 3∶0 |
| V18 平台深度 | THIN | THIN | THIN | THIN | 3∶0 |
| V19 派工与顺序 | YES | YES | YES | YES | 3∶0 |

共 14 项 3∶0、5 项 2∶1。固定层版本独立票：A/B/C 均 YES，0.2.0 以 3∶0 通过；V15=A 已通过，版本票生效。没有缺票、弃权或主持人补票。

多数为最终选择；少数意见保留在原票，不继续按少数方案派工：V06 采用 B 双检，V08 采用 FINGERPRINT，V09 采用 B 逐文件处理，V10 采用 PRECISE，V13 采用 RECOMMEND。

## 依赖核验与裁决

- V05 的 no-op 依赖 V08：FINGERPRINT 已获多数，规格仍需证明真实幂等。
- V07=SKILL 依赖 V06：B 双检已获多数，不改 §1.3；前置有效性实例在规格写清。
- V10=PRECISE 与 V11=REPORT 相容；GIT 未通过，因此不附加其 CLEAN 前提。C 的 CLEAN 少数意见不成为 REPORT 的前置条件。
- V02=ITEMS 与 V12=TRACKED 相容；必要受控 hook 文件不受“六物理文件”限制。
- V13=RECOMMEND 与 V05/V14/V15 相容：安装建议经整体确认，失败或跳过据实报告；不会以“推荐过工具”冒充门禁生效。
- V15=A 与 V16=SKILL 相容：仅追加 hook 句，不拼入未通过的 UX 固定层文字。
- V17=DEFER：不把 GUIDE 的强制 fetch/rebase 写到项目操作指引。

**澄清一处个人论证越界：** B 第三轮自案修订曾称指纹相符的干净升级可“不打扰用户”。该句未进入共同选票，也未同文获票；V05=YES 要求有写入变化时整体确认。规格必须遵守 V05，不能把该个人理由当免确认授权。

没有需要维护者裁决的无多数项或多数组合冲突。哈希范围、hook 激活证据等属于三者一致要求规格阶段解决的工程问题，不能以“方案已通过”假装已实现或已验证。

## 固定层落地范围

通过项只有 V15=A 改固定层，在 §2.3 末追加以下原文：

> 能接到已有 format/lint/type/test 命令则写出提交前 hook；否则标明未接线或不适用及原因，不得宣称门禁已生效。

按独立版本票改为 0.2.0。V07/V16=SKILL，不修改 §1.3 和 §2.3 的 UX 文字；§1.2、§3.3、§4、§6 和未定项不变。

本次已据通过文本落地 [DECISIONS.md](../../DECISIONS.md) 的版本行及 §2.3 追加句。未进行 Git 提交、打标签、推送或发布，讨论成果原文与冻结选票保持不变。后续以 [实施基线与派工状态](synthesis.md) 为入口。

