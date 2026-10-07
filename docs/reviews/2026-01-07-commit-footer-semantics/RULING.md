# 维护者裁决 - Issue #29 Commit 脚注词表语义

**日期**：2026-01-07  
**维护者**：jaredshuai  
**讨论轮次**：2 轮（独立意见 + 互评）  
**参与者**：5 位外部 AI

## 裁决结果

### 1. 规则归属
**裁决**：保持 §5.1 集中（不采用方案 D 分层）  
**理由**：跟随多数意见（4:1），提交规则需要集中查阅

### 2. 版本号升位
**裁决**：DECISIONS.md 0.5.0 → 0.6.0  
**理由**：跟随多数意见（3:2），属条款澄清而非破坏性变更

### 3. 检查器句
**裁决**：不入条文  
**理由**：跟随多数意见（4:1），避免堵死未来工具化路径

## 最终方案要点

1. **封闭白名单**：`Refs #n` 关联，`Closes #n` 关闭，排除 `Fixes` 等平台保留词
2. **判定权前置**：明确这是审查者的判定依据
3. **边界场景**：补充 6 类高优先级场景处理规则
4. **实施链路**：版本号 0.6.0、快照同步、模板更新

## 实施清单

- [x] 更新 DECISIONS.md §5.1
- [x] 升级版本号至 0.6.0
- [x] 同步 lazypack-setup/references/DECISIONS.md
- [x] 更新 lazypack-setup/SKILL.md 版本声明
- [x] 更新 lazypack-setup/templates/RELEASE.md
- [x] 记录本裁决文档

## 参考

- **讨论归档**：docs/reviews/2026-01-07-commit-footer-semantics/
- **提案文档**：docs/proposals/issue-29-commit-footer-semantics.md
- **Issue**: #29

## 生效

本裁决立即生效。下游项目在下次运行 `/lazypack-setup [UPGRADE]` 时将获得 0.6.0 版本的固定层快照。
