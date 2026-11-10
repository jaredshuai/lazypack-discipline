# 讨论留档索引

[固定层 §9.5](../DECISIONS.md) 要求每次 §9 讨论的每人每轮原文、投票结果和裁决都留在本目录。本文件只是检索入口，每次讨论一行，指向该讨论的裁决或综述文件。它不保证各目录的留档完整，已知的缺口和存疑之处写在表下说明里。

- 本文件不改写、不替代任何留档原文，也不决定任何议题的状态。
- 状态以各目录内的裁决文件和 [DECISIONS.md 的版本历史](../DECISIONS.md) 为准。两者对不上或查不到时，表里写「待核对」，不给确定值。
- 新增讨论目录时，在表里加一行。

| 目录日期 | 议题 | 关联 issue | 裁决或综述 | 对应固定层版本 |
|---|---|---|---|---|
| 2026-01-07，见下方说明 | [Commit 脚注词表语义](2026-01-07-commit-footer-semantics/) | #29 | [维护者裁决](2026-01-07-commit-footer-semantics/RULING.md)、[第二轮汇总](2026-01-07-commit-footer-semantics/round-2/summary.md)、[议题说明](2026-01-07-commit-footer-semantics/README.md) | 0.6.0（§5.1） |
| 2026-09-05 | [Lazy setup 大方案](2026-09-05-lazy-setup/) | 未查到 | [第三轮计票与裁决记录](2026-09-05-lazy-setup/vote.md)、[实施基线与派工状态](2026-09-05-lazy-setup/synthesis.md) | 0.2.0（§2.3 末句） |
| 2026-09-10 | [文档归属正式采纳](2026-09-10-document-homes-adoption/) | 未查到 | [维护者最终采纳记录](2026-09-10-document-homes-adoption/maintainer-decision.md)、[第三轮计票](2026-09-10-document-homes-adoption/tally.md) | 0.3.0 |
| 2026-09-22 | [§5.7 发版与标签语义修订](2026-09-22-release-tag-semantics/) | #4 | [议题说明与各轮入口](2026-09-22-release-tag-semantics/README.md)、[第三轮计票书（§七为维护者裁定）](2026-09-22-release-tag-semantics/round-3/tally.md) | 0.4.0（§5.7） |
| 2026-10-06 | [迭代开发与架构复盘](2026-10-06-iterative-dev-architecture/) | #41、#40 | [维护者最终裁定](2026-10-06-iterative-dev-architecture/round-2/FINAL-RULINGS.md) | 0.7.0（§4.1、§6.5、§7.7） |
| 2026-10-06 | [提示词瘦、工具肥](2026-10-06-prompt-lean-tool-rich/) | #36 | [第二轮汇总](2026-10-06-prompt-lean-tool-rich/round-2/ROUND-2-SUMMARY.md)、[议题说明](2026-10-06-prompt-lean-tool-rich/README.md)；没有单独的裁决文件 | 待核对，见下方说明 |

## 说明

- **日期取自目录名。** 表按目录名排序。「Commit 脚注词表语义」的目录名和 DECISIONS.md 版本历史的 0.6.0 条都写 2026-01-07，但该目录的全部提交都在 2026-10-07（`736d063` 到 `f9e0532`），0.6.0 也晚于 2026-10-07 的 0.5.0。目录名和固定层正文本索引都没有改，待维护者核对。
- **关联 issue 写「未查到」的两行。** 目录内的 README 和裁决文件没有写 issue 编号。这表示没有查到，不表示该讨论没有关联 issue。
- **版本的出处。** DECISIONS.md 的版本历史目前只列 0.5.0、0.6.0、0.7.0 三条。0.2.0、0.3.0、0.4.0 三行的版本取自对应目录内的计票或裁决文件，版本历史里查不到。
- **「提示词瘦、工具肥」的状态表述互相不一致，待维护者核对。** DECISIONS.md 版本历史的 0.5.0 条写 §6.6 经二轮讨论通过并经维护者裁定。该目录 README 的文首状态行仍写「第一轮准备完成，等待执行」，末节写「已收束，条文已生效」；[登记册](../ARTIFACTS.md) 的该目录行写「讨论未收束」。该目录没有单独的裁决文件，第三轮的 `ballot.md` 和 `tally.md` 是 71 字节的占位文件。本索引没有改动其中任何一处，所以版本一格写「待核对」。
