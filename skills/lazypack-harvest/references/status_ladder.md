# 状态定义与优先级阶梯（references/status_ladder.md）

本文档定义 `/lazypack-harvest` 的逐候选状态与批次唯一汇总状态，依据冻结规格 `SPEC.md` §5。

---

## 1. 逐候选状态（Per-Candidate Status）

在 harvest 执行结束时，每个候选条目**必须且只能拥有以下 7 种状态之一**：

| 候选状态标识 | 核心语义与判断准则 |
|---|---|
| **`CANDIDATE_PUBLISHED`** | 远端公开仓已确认创建 Issue 成功，持有已验证的真实 Issue URL。若远端创建成功但本地记账持久化受阻，附加标记 `local_persist_failed: true`。 |
| **`CANDIDATE_DRAFT`** | 仅在本地临时目录生成脱敏草稿；本轮**从未向远端发起创建请求**（例如前置依赖检查未通过、缺标阻断、脱敏未通过、或离线保存）。 |
| **`CANDIDATE_REJECTED`** | 已向远端发起创建请求，但远端明确返回失败响应（如 401/403/422），确凿证实未建票。 |
| **`CANDIDATE_DUPLICATE_CONFIRMED`** | 命中已知相同问题的发布记录，且对应的 Issue URL 经核验证实真实存在。跳过本轮发送。 |
| **`CANDIDATE_DUPLICATE_SUSPECTED`** | 命中防重检索线索，但对应的 Issue URL 无法证实。输出警示并暂缓发送，严禁虚构 URL。 |
| **`CANDIDATE_UNKNOWN`** | 已向远端发起创建请求，但因网络超时、连接断开或 504 导致远端是否建票未决且未经证实。 |
| **`CANDIDATE_SKIPPED`** | 本轮中**尚未尝试发送**；因排在前面的候选发生超时、明确拒绝或记账失败而按事务安全策略主动跳过。 |

---

## 2. 批次唯一汇总状态（Unique Batch Rollup Status）

整轮 harvest 执行完毕后，**必须根据以下 8 级互斥优先级阶梯，输出且仅输出一个批次汇总状态**。严禁并列两个主状态。

```
[判定优先级阶梯 (从高到低)]
1. 是否无候选? --------------------------------------------------------------------> NO_CANDIDATE
2. 是否存在任意 CANDIDATE_UNKNOWN? -------------------------------------------------> RESULT_UNKNOWN
3. 是否存在任意 local_persist_failed == true? ---------------------------------------> PERSIST_FAILED
4. 是否至少 1 个 CANDIDATE_PUBLISHED，且存在 REJECTED / DRAFT / SKIPPED / SUSPECTED? -> PARTIAL_SUCCESS
5. 是否至少 1 个 CANDIDATE_PUBLISHED，且其余全部为 DUPLICATE_CONFIRMED (或无其他)? --> PUBLISHED_SUCCESS
6. 是否零 CANDIDATE_PUBLISHED、零 CANDIDATE_UNKNOWN，且至少一条 CONFIRMED 或 SUSPECTED？
   （其余只可能是 CONFIRMED / SUSPECTED / DRAFT / REJECTED / SKIPPED）
   -> DUPLICATE_SUPPRESSED
   - 存在 SUSPECTED 则必须 duplicate_unconfirmed: true，不得虚构 URL
   - 分项列出 CONFIRMED 的已核验 URL，以及 DRAFT / REJECTED / SKIPPED
   - 零成功，不得 PARTIAL_SUCCESS
7. 发起创建前：缺标 / 标签查询失败 / 无有效写通道 / 离线无法核验依赖 / 脱敏不足？
   -> DEPENDENCY_BLOCKED
8. 其余（依赖核验已通过；全部为 DRAFT / REJECTED / SKIPPED）
   -> DRAFT_ONLY
```

---

## 3. 汇总状态定义表

| 批次汇总标识 | 严格判定条件 |
|---|---|
| **`NO_CANDIDATE`** | 候选数量为 0。当前会话无纪律摩擦且无未撤回改进提议。友好退出。 |
| **`RESULT_UNKNOWN`** | 候选列表中**存在至少一个 `CANDIDATE_UNKNOWN`**。即使前面已有成功条目，主状态仍为未知，成功项在分项中呈现。 |
| **`PERSIST_FAILED`** | 至少一条候选远端创建成功，但**本地状态持久化失败**（`local_persist_failed: true`），已中止后续发送以防状态漂移。已获 URL 保留。 |
| **`PARTIAL_SUCCESS`** | **零未知**，**零记账失败**，**至少有一条 `CANDIDATE_PUBLISHED`**，且混有 `REJECTED`、`DRAFT`、`SKIPPED` 或 `DUPLICATE_SUSPECTED`。（**零成功绝不得判定为 PARTIAL_SUCCESS**）。 |
| **`PUBLISHED_SUCCESS`** | **零未知**，**零记账失败**，至少有一条 `CANDIDATE_PUBLISHED`，其余全部为 `CANDIDATE_DUPLICATE_CONFIRMED`（或无其他候选）。**严禁将 `DUPLICATE_SUSPECTED` 计为全收口**。 |
| **`DUPLICATE_SUPPRESSED`** | 零 `PUBLISHED`，零 `UNKNOWN`，至少一条 `CANDIDATE_DUPLICATE_CONFIRMED` 或 `CANDIDATE_DUPLICATE_SUSPECTED`。含 SUSPECTED 时置 `duplicate_unconfirmed: true`，仅表示暂缓/已抑制发送，不表示全部已发布。 |
| **`DEPENDENCY_BLOCKED`** | **零已发布**，**零未知**，**尚未发起任何创建请求**，且因缺少 `harvest` 标签、当次标签查询失败、无有效写通道、离线无法核验依赖、或深度脱敏未通过而阻断。 |
| **`DRAFT_ONLY`** | 零已发布，零未知，**无任何 CONFIRMED/SUSPECTED**，**依赖核验已通过**，全部为 `DRAFT` / `REJECTED` / `SKIPPED`。 |

---

## 4. 关键闭环规则（消除反例）

1. **零成功与混合项收口规则（F1 反例消解）**：
   - 若候选集包含 `[CONFIRMED, REJECTED, SKIPPED]`（例如候选 1 证实重复、候选 2 被 403 拒绝、候选 3 跳过），其批次汇总**唯一判定为 `DUPLICATE_SUPPRESSED`**，严禁错报为 `DRAFT_ONLY` 或 `PARTIAL_SUCCESS`。
2. **纯净性保证**：
   - 只有全部成功或证实重复才为 `PUBLISHED_SUCCESS`；若混入任何 `DUPLICATE_SUSPECTED`，必须降级为 `PARTIAL_SUCCESS`。
3. **事实保持原则**：
   - 远端已返回真实 Issue URL 的项在任何情况下均不得抹改为 UNKNOWN；持久化失败时保留 URL 并置 `local_persist_failed: true`。
