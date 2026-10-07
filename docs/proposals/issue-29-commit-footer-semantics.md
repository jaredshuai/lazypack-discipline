# Issue #29: Commit 脚注词表语义讨论

**提案类型**: 固定层讨论议题  
**关联 Issue**: #29  
**提案日期**: 2025-01-XX  
**状态**: 待讨论

---

## 1. 现状分析

### 1.1 固定层条文的当前表述

**§5.1** (DECISIONS.md:79)：
```
脚注 `Closes #n` 关联票。
```

- 仅提及 `Closes`，未提及其他关键词
- 未区分「关联」与「关闭」的语义

### 1.2 模板的当前表述

**lazypack-setup/templates/RELEASE.md:12**：
```
脚注使用 `Closes #n` 或 `Fixes #n` 关联票据。
```

- 提及 `Closes` 和 `Fixes` 两个关键词
- 用「关联票据」描述，语义模糊

### 1.3 实际使用情况

检查本仓最近 30 个 commits，发现以下使用模式：

**Closes 的使用**（7 次）:
- `Closes #59` - 修复功能完成，关闭 issue
- `Closes #57` - 修复功能完成，关闭 issue
- `Closes #3` - 功能完成，关闭 issue
- `Closes #2` - 功能完成，关闭 issue
- `Closes VAL-TEST-006` - 测试覆盖完成

**Refs 的使用**（约 20+ 次）:
- `Refs: #38` - 引用相关 issue，未完成
- `Refs #37` - 多次提交引用同一 issue，阶段性进展
- `Refs #26`, `Refs #24`, `Refs #22` - 文档更新引用相关讨论
- `Refs #9`, `Refs #20` - 多个 issue 关联

**Fixes 的使用**（1 次）:
- `Fixes command examples introduced for issue #37` - 描述性使用，未作为脚注

**观察结果**：
1. 本仓**已经在实际使用中区分** `Refs`（关联/进展）和 `Closes`（完成关闭）
2. `Fixes` 作为脚注关键词**未被使用**，仅在描述文本中出现
3. 使用模式清晰且一致，但未在固定层条文中明确规定

### 1.4 检查器行为

根据 §5.1 说明：
- 检查器把脚注当作信息行，不做语义判定
- 不强制使用特定关键词
- 不验证关闭语义的正确性

---

## 2. 平台语义对照

### 2.1 GitHub 官方语义

**文档来源**: [Linking a pull request to an issue - GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue)

**Closing keywords**（9 个关键词）:
- `close`, `closes`, `closed`
- `fix`, `fixes`, `fixed`
- `resolve`, `resolves`, `resolved`

**语义**:
- 所有 9 个关键词**语义完全等价**，均表示「当 PR/commit 合并到默认分支时，自动关闭 issue」
- 关键词**大小写不敏感**，可加冒号（如 `Closes: #10`, `CLOSES #10`）
- **仅在默认分支生效**，非默认分支的关键词被忽略
- 不提供「关联但不关闭」的官方关键词

**Manual linking**:
- GitHub 提供手动关联功能（PR sidebar 的 Development 区域）
- 手动关联可以实现「关联但不关闭」的效果

### 2.2 GitLab 官方语义

**文档来源**: [Manage issues - GitLab Docs](https://docs.gitlab.com/ee/user/project/issues/managing_issues.html#closing-issues-automatically)

**Default closing pattern**（4 组关键词）:
- `Close`, `Closes`, `Closed`, `Closing` (及小写形式)
- `Fix`, `Fixes`, `Fixed`, `Fixing` (及小写形式)
- `Resolve`, `Resolves`, `Resolved`, `Resolving` (及小写形式)
- `Implement`, `Implements`, `Implemented`, `Implementing` (及小写形式)

**语义**:
- 所有关键词**语义完全等价**，均表示自动关闭
- **仅在默认分支生效**
- GitLab Self-Managed 可自定义 closing pattern
- 不提供官方的「关联但不关闭」关键词

**Related issues**:
- GitLab 文档示例中使用 `Related to #5` 表示关联但不关闭
- 这不是官方关键词，仅作为文本描述

### 2.3 平台语义小结

| 维度 | GitHub | GitLab |
|------|--------|--------|
| **Closes** | ✓ 关闭 | ✓ 关闭 |
| **Fixes** | ✓ 关闭 | ✓ 关闭 |
| **Resolves** | ✓ 关闭 | ✓ 关闭 |
| **Refs** | ✗ 无特殊语义 | ✗ 无特殊语义 |
| **语义差异** | 无，所有关键词等价 | 无，所有关键词等价 |
| **关联不关闭** | 需手动关联 | 可用描述性文本 (如 `Related to`) |

**关键发现**：
- 两大平台均**不区分** `Closes`/`Fixes`/`Resolves` 的语义，它们完全等价
- 平台层面**没有**官方的「关联但不关闭」关键词
- `Refs` 不是平台保留关键词，可以自由定义语义

---

## 3. 来自 #8 裁定的讨论输入

**Issue #8 裁定第四节**提出的口径：

> - 阶段性进展与完成关闭必须区分，不能为满足格式而提前关闭整张票
> - 拟议口径：`Refs` 表达关联，`Closes` 表达满足关闭条件后的关闭关联
> - `Fixes` 是否作为关闭用语一并统一

**核心诉求**：
1. **必须区分「关联」与「关闭」**：防止为了满足格式要求而提前关闭 issue
2. **需要明确的词表**：让 AI 和人类都清楚何时使用哪个关键词

---

## 4. 拟议方案

### 方案 A: 严格三分（推荐）

**词表定义**：
- **`Refs #n`**: 关联 issue，表示本次提交与该 issue 相关，但未完成 issue 的关闭条件
- **`Closes #n`**: 关闭 issue，表示本次提交满足 issue 的关闭条件，合并后自动关闭
- **`Fixes #n`**: 禁用，避免与 `Closes` 混淆，降低认知负担

**理由**：
1. ✅ **与本仓实际使用完全一致**：已经在使用 `Refs` 和 `Closes` 的二分法
2. ✅ **语义清晰无歧义**：一个词表达关联，一个词表达关闭
3. ✅ **降低认知负担**：不需要记忆多个等价关键词
4. ✅ **平台兼容**：`Refs` 不是平台保留词，不会触发意外行为；`Closes` 是标准关闭关键词
5. ✅ **易于检查器扩展**：未来如需检查器支持，规则简单明确

**条文修改建议**：

**§5.1 修改为**：
```
脚注用 `Refs #n` 关联 issue（表示相关但未完成），
用 `Closes #n` 关闭 issue（表示满足关闭条件）。
```

**RELEASE.md:12 修改为**：
```
脚注使用 `Refs #n` 关联 issue（阶段性进展），
使用 `Closes #n` 关闭 issue（满足关闭条件）。
```

---

### 方案 B: 宽松二分

**词表定义**：
- **`Refs #n`**: 关联 issue，表示相关但未完成
- **`Closes #n` 或 `Fixes #n`**: 关闭 issue，两者等价，表示满足关闭条件

**理由**：
1. ✅ **兼容 GitHub/GitLab 官方用法**：保留 `Fixes` 作为关闭关键词
2. ✅ **给用户更多选择**：可根据上下文选择更合适的词（`Closes` vs `Fixes`）
3. ⚠️ **增加认知负担**：需要记住两个等价关键词
4. ⚠️ **与本仓实际使用不一致**：本仓未使用 `Fixes` 作为脚注

**条文修改建议**：

**§5.1 修改为**：
```
脚注用 `Refs #n` 关联 issue（表示相关但未完成），
用 `Closes #n` 或 `Fixes #n` 关闭 issue（表示满足关闭条件，两者等价）。
```

**RELEASE.md:12 修改为**：
```
脚注使用 `Refs #n` 关联 issue（阶段性进展），
使用 `Closes #n` 或 `Fixes #n` 关闭 issue（满足关闭条件，两者等价）。
```

---

### 方案 C: 平台对齐（不推荐）

**词表定义**：
- **不区分关联与关闭**，统一使用平台关闭关键词：`Closes`, `Fixes`, `Resolves`
- 如需表达「关联但不关闭」，使用提交正文描述，不用脚注

**理由**：
1. ✅ **与 GitHub/GitLab 官方语义完全一致**
2. ❌ **无法满足 #8 裁定的核心诉求**：无法在脚注层面区分关联与关闭
3. ❌ **与本仓实际使用严重冲突**：需要大量修改现有 commits 的语义理解
4. ❌ **阶段性进展无法表达**：每次提交都会触发关闭，违背 #8 的要求

**不推荐原因**：
- 违背了 #8 裁定的「阶段性进展与完成关闭必须区分」要求
- 会导致大量误关闭 issue 的风险

---

## 5. 边界与例外

### 5.1 一个 commit 关联多个 issue

**规则**：每个 issue 独立一行脚注，语义独立判断

**示例**：
```
feat(core): implement user authentication

Add JWT token generation and validation.

Refs #42
Refs #43
Closes #41
```

**解释**：
- 本次提交关联 #42 和 #43（阶段性进展）
- 本次提交关闭 #41（满足关闭条件）

---

### 5.2 部分完成场景

**场景描述**：一个 issue 包含多个子任务，本次提交仅完成部分子任务

**规则**：
- 如果 issue **整体关闭条件未满足**，使用 `Refs #n`
- 如果 issue **整体关闭条件已满足**，使用 `Closes #n`

**示例**：
```
feat(auth): implement login API

Implement POST /api/login endpoint with JWT token generation.
Still TODO: logout endpoint, token refresh.

Refs #50
```

**解释**：
- Issue #50 可能是「实现用户认证模块」，包含登录、登出、刷新等多个子任务
- 本次仅完成登录 API，issue 整体未完成，使用 `Refs`
- 当所有子任务完成后，最后一个 commit 使用 `Closes #50`

---

### 5.3 依赖阻塞场景

**场景描述**：实现已完成，但等待外部依赖（如上游库、设计评审）才能关闭 issue

**规则**：
- 如果 issue 定义的是「完成实现」，实现完成时使用 `Closes #n`
- 如果 issue 定义的是「功能可用」（含依赖就绪），依赖未就绪时使用 `Refs #n`

**最佳实践**：
- **拆分 issue**：将「实现」与「集成/上线」分为两个 issue
  - Issue #60: 实现 XX 功能 → 实现完成时 `Closes #60`
  - Issue #61: 上线 XX 功能（依赖 #60） → 上线完成时 `Closes #61`

**示例**：
```
feat(payment): integrate Stripe payment SDK

Implementation complete, waiting for Stripe API keys from Ops team.

Refs #70
```

**解释**：
- Issue #70 可能是「集成 Stripe 支付」，包含实现和配置两部分
- 代码实现完成，但缺少 API keys，功能不可用
- 使用 `Refs` 表示阶段性完成
- 后续获得 keys 并验证通过后，再用 `Closes #70`

---

### 5.4 多次提交逐步推进同一 issue

**规则**：
- 前 N-1 次提交使用 `Refs #n`（阶段性进展）
- 最后一次提交使用 `Closes #n`（满足关闭条件）

**示例**：
```
# Commit 1
feat(search): add search API skeleton
Refs #80

# Commit 2
feat(search): implement full-text search
Refs #80

# Commit 3
feat(search): add search result pagination
Closes #80
```

---

### 5.5 Revert 和 hotfix 场景

**Revert commit**：
```
revert: "feat(auth): implement OAuth login"

This reverts commit abc123. OAuth library has security vulnerability.

Refs #90
```
- Revert 通常不关闭 issue，而是引用原始 issue 或新建 issue 追踪

**Hotfix commit**：
```
fix(api): fix null pointer exception in user service

Closes #95
```
- Hotfix 修复 bug，如果 issue 仅描述该 bug，修复完成时使用 `Closes`

---

### 5.6 文档和测试提交

**规则**：
- 文档更新或测试添加通常使用 `Refs #n`（除非 issue 明确要求这些变更）
- 如果 issue 是「添加 XX 文档」或「添加 XX 测试」，完成时使用 `Closes #n`

**示例**：
```
docs(api): add API authentication guide

Refs #100
```

```
test(auth): add unit tests for JWT validation

Closes #101
```

---

## 6. 检查器支持讨论

### 6.1 当前检查器行为

根据 §5.1：
> 脚注关联票。检查器把脚注当信息行，不做语义判定。

**当前检查器不做**：
- 不验证脚注关键词是否正确
- 不验证 issue 是否存在
- 不验证关闭语义是否合理

### 6.2 未来检查器扩展可能性

如果固定层决定扩展检查器支持，可以考虑以下检查：

**Level 1: 格式检查**（简单）
- ✅ 检查脚注是否使用允许的关键词（`Refs`, `Closes`, 可选 `Fixes`）
- ✅ 检查脚注格式是否正确（`Keyword #number`）

**Level 2: 语义警告**（中等）
- ⚠️ 警告：使用 `Closes` 但提交类型是 `docs` 或 `test`（可能误用）
- ⚠️ 警告：使用 `Closes` 但提交消息包含 "WIP", "TODO", "部分完成"（可能误用）

**Level 3: 平台验证**（复杂，需 API 访问）
- 🔍 验证 issue 是否存在
- 🔍 验证 issue 当前状态（如果已关闭，警告重复关闭）

**建议**：
- §5.1 当前的「不做语义判定」立场是合理的，保持灵活性
- 如果固定层决定扩展检查器，建议从 Level 1 开始，仅做格式检查
- Level 2 和 Level 3 的检查成本高、误报率高，不建议作为强制规则

---

## 7. 条文修改总结

### 7.1 DECISIONS.md §5.1 修改建议

**当前条文**（第 79 行）：
```
5.1 提交头：Conventional Commits 1.0.0，`type(scope)!: 描述`。
type 用 Angular 8 个（`build ci docs feat fix perf refactor test`）加 `chore` `revert`。
脚注 `Closes #n` 关联票。
```

**方案 A 修改建议**（推荐）：
```
5.1 提交头：Conventional Commits 1.0.0，`type(scope)!: 描述`。
type 用 Angular 8 个（`build ci docs feat fix perf refactor test`）加 `chore` `revert`。
脚注用 `Refs #n` 关联 issue（表示相关但未完成），
用 `Closes #n` 关闭 issue（表示满足关闭条件）。
检查器把脚注当信息行，不做语义判定。
```

**方案 B 修改建议**（备选）：
```
5.1 提交头：Conventional Commits 1.0.0，`type(scope)!: 描述`。
type 用 Angular 8 个（`build ci docs feat fix perf refactor test`）加 `chore` `revert`。
脚注用 `Refs #n` 关联 issue（表示相关但未完成），
用 `Closes #n` 或 `Fixes #n` 关闭 issue（表示满足关闭条件，两者等价）。
检查器把脚注当信息行，不做语义判定。
```

---

### 7.2 RELEASE.md 模板修改建议

**当前模板**（第 12 行）：
```
脚注使用 `Closes #n` 或 `Fixes #n` 关联票据。
```

**方案 A 修改建议**（推荐）：
```
脚注使用 `Refs #n` 关联 issue（阶段性进展或相关工作，不触发关闭），
使用 `Closes #n` 关闭 issue（满足关闭条件，合并到默认分支时自动关闭）。
```

**方案 B 修改建议**（备选）：
```
脚注使用 `Refs #n` 关联 issue（阶段性进展或相关工作，不触发关闭），
使用 `Closes #n` 或 `Fixes #n` 关闭 issue（满足关闭条件，合并到默认分支时自动关闭，两者等价）。
```

---

## 8. Trade-offs 分析

### 方案 A vs 方案 B

| 维度 | 方案 A（严格三分） | 方案 B（宽松二分） |
|------|------------------|------------------|
| **与本仓实际使用一致性** | ✅ 完全一致 | ⚠️ 引入未使用的 `Fixes` |
| **认知负担** | ✅ 低（两个关键词，语义不同） | ⚠️ 中（三个关键词，两个等价） |
| **平台兼容性** | ✅ 完全兼容 | ✅ 完全兼容 |
| **用户灵活性** | ⚠️ 低（只能用 `Closes`） | ✅ 高（可选 `Closes`/`Fixes`） |
| **检查器扩展难度** | ✅ 简单（两个关键词） | ⚠️ 稍复杂（需处理等价） |
| **迁移成本** | ✅ 零（已在使用） | ⚠️ 需更新文档和培训 |

### 方案 A vs 方案 C

| 维度 | 方案 A（严格三分） | 方案 C（平台对齐） |
|------|------------------|------------------|
| **满足 #8 裁定诉求** | ✅ 完全满足 | ❌ 不满足 |
| **阶段性进展表达** | ✅ 清晰（`Refs`） | ❌ 无法表达 |
| **误关闭风险** | ✅ 低 | ❌ 高 |
| **平台一致性** | ⚠️ 自定义语义 | ✅ 完全对齐 |
| **迁移成本** | ✅ 零 | ❌ 高（需重新理解所有 commits） |

---

## 9. 推荐方案与理由

**推荐方案：方案 A（严格三分）**

**核心理由**：

1. **零迁移成本**：本仓已经在实际使用 `Refs` 和 `Closes` 的二分法，条文修改仅是将现状明文化。

2. **满足 #8 裁定诉求**：明确区分「关联」与「关闭」，防止提前关闭 issue。

3. **认知负担最低**：只需记住两个关键词，语义清晰无歧义。

4. **平台兼容性无问题**：
   - `Refs` 不是 GitHub/GitLab 的保留关键词，不会触发意外行为
   - `Closes` 是标准关闭关键词，在默认分支合并时正确触发关闭

5. **未来扩展友好**：如果固定层决定扩展检查器，规则简单明确，易于实现。

**对 `Fixes` 的处理**：
- 禁用 `Fixes` 作为脚注关键词，降低认知负担
- 如果用户在提交消息正文中使用 `Fixes` 作为描述性词汇（如 "This fixes the bug"），不受影响
- GitHub/GitLab 的自动关闭功能仍然有效（因为平台会解析提交消息正文），但本仓不鼓励这种用法

---

## 10. 后续步骤

1. **固定层讨论**：按 §9 章程进行多 AI 讨论，评估各方案
2. **裁定与条文更新**：维护者裁定后，更新 DECISIONS.md §5.1
3. **模板同步**：更新 lazypack-setup/templates/RELEASE.md
4. **文档更新**：更新相关文档和示例
5. **存量检查**（可选）：检查本仓现有 commits 是否符合新规范（预期符合）

---

## 附录：参考资料

- [GitHub Docs: Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue)
- [GitLab Docs: Closing issues automatically](https://docs.gitlab.com/ee/user/project/issues/managing_issues.html#closing-issues-automatically)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/)
- Issue #8 裁定第四节（固定层讨论输入）
- 本仓 commit history 分析（最近 30 commits）
