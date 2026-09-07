# 给 agy 的 S1 第二次规格复审提示词

请在本地仓库 `<REPO_ROOT>` 做一次**只读复审**。

## 强制运行约束

- 不要调用 `/understand-codebase`、codegraph、codebase-memory、fast-context 或任何 MCP。
- 不要启动子代理、后台服务或浏览器。
- 不要创建、修改、删除、移动任何文件。
- 不要执行 git add、commit、push、reset、clean 或任何会改变工作区的命令。
- 不要把结果写入文件，直接在聊天中返回 Markdown 报告。
- 只读取本地 Markdown 文件和必要的只读 Git 信息。

## 请读取

1. `README.md`
2. `docs/DECISIONS.md`
3. `docs/interviews/2026-09-04-founding-interview.md`
4. `docs/reviews/2026-09-05-lazy-setup/vote.md`
5. `docs/reviews/2026-09-05-lazy-setup/synthesis.md`
6. `docs/reviews/2026-09-05-lazy-setup/round-3-ballot.md`
7. `.scratch/lazypack-setup/SPEC.md`

上一次审查提出了以下问题，本次必须逐项复核：

1. V06=B 前置判据是否已经移除 `domain.md` 强制要求，只检查有效 tracker 和 Matt Agent skills 入口块。
2. Markdown 与 Shell 是否有不同的托管标记语法，并且都有明确 start/end 标记。
3. 标记头是否包含 `block`、`src`、`gen`、`input`、`fp`，以及 input/fp 的算法、范围、编码和换行规则。
4. 是否明确 `.githooks/pre-commit`、`core.hooksPath`、已有 hook 管理器和副作用确认。
5. missing、n/a、install-failed 是否有可执行的 hook 行为，不会调用不存在的命令或错误阻断提交。
6. 无标记产物、标记损坏、部分写入、无关脏文件和用户已有改动是否有不覆盖的处理规则。
7. 六类产物是否明确依赖关系，暂停某个文档时是否会生成悬空指针。
8. 验收矩阵是否至少包含：场景、前置/步骤、断言，并覆盖 V19 要求的关键场景。
9. S2 实施边界是否明确限制在 `skills/lazypack-setup/`，禁止改固定层和讨论记录。
10. 是否出现上一轮未提到但会阻断实现的新问题，尤其是 Windows/POSIX、离线快照、跨会话 no-op 和 hook 激活证据。

## 已通过决议（不可擅自改写）

- V01 `YES`：prompt-driven setup skill，不做独立 CLI、YAML 状态层或常驻服务。
- V02 `ITEMS`：按六类产物控制范围，不机械限制为六个物理文件。
- V03 `YES`：固定层唯一可编辑源；skill 可带版本快照；目标项目不复制整份 DECISIONS。
- V04 `NEEDED`：默认零问，只问无法可靠探测且影响配置的必要未知，不设问题数量硬上限。
- V05 `YES`：一次整体展示和确认；无变化重跑不再确认。
- V06 `B`：有效 tracker + 常驻入口含 Matt Agent skills 入口块。
- V07 `SKILL`：常驻文件选择写在 skill，不修改固定层 §1.3。
- V08 `FINGERPRINT`：托管区用指纹判断变化。
- V09 `B`：无标记整份归属文件暂停该文件，其余可继续。
- V10 `PRECISE`：不因无关脏文件停止，只精确保护目标路径。
- V11 `REPORT`：报告恢复信息，不承诺多文件原子写入。
- V12 `TRACKED`：hook 入口必须可被版本控制跟踪。
- V13 `RECOMMEND`：缺命令时推荐默认工具，用户可拒绝并标记未接线。
- V14 `A`：过程完成、接线、运行、激活、通过分别报告。
- V15 `A`：§2.3 已增加诚实 hook 状态条款。
- V16 `SKILL`：lazy UX 写在 skill/spec，不新增固定层 UX 条文。
- V17 `DEFER`：不新增 rebase 或 MCP 降级规则。
- V18 `THIN`：平台只做薄草稿并标未验证。
- V19 `YES`：先规格，再实现，再场景验收和独立审查。

## 输出格式

```markdown
# S1 第二次规格复审

## 结论
只能写：可以进入 S2 / 需要修订 SPEC / 阻断并需维护者裁决。

## 上次 P0 复核
逐项写通过或未通过，引用 SPEC 行号。

## P0
没有就写“无”。若有，说明触发场景、违反的票号和最小修复。

## P1
进入 S2 前必须修复的问题。

## P2
可在 S2 或实现后处理的问题。

## 票据一致性
指出 SPEC 是否夹带未通过选项，或把个人建议误写成决议。

## 未验证事项
明确哪些是规格未验证，哪些是本次只读审查无法验证。

## S2 准入条件
最多列 5 条；如果可以进入 S2，写清实现者仍必须遵守的验收条件。
```

引用使用仓库相对路径和行号。不要重新设计方案，不要提出新的固定层规则，不要把“尚未实测”直接判成规格错误，除非 SPEC 声称已经验证。
