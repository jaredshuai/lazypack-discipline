# sample-ts —— 变异测试夹具（TypeScript / Stryker）

夜跑变异测试闭环的**故意欠测试** TypeScript 夹具。它是一个能独立运行的微型项目：
代码里有刻意植入的边界 bug，测试只覆盖部分路径，运行 Stryker 会稳定产出**存活变异体**
（surviving mutants），供下游解析、基线检查和补测 issue 流程做端到端验证。

运行手册见 [../../../docs/quality-gates/mutation-testing.md](../../../docs/quality-gates/mutation-testing.md)；
闭环的定时触发配置模板见 [../../../templates/.github/workflows/nightly-mutation-ts.yml](../../../templates/.github/workflows/nightly-mutation-ts.yml)。

## 目录结构

```
sample-ts/
├── package.json          # 脚本与开发依赖（Stryker 10 / mocha / ts-node / typescript 5.9）
├── package-lock.json     # 锁定安装，`npm ci` 可复现
├── tsconfig.json         # strict 模式；build 产物落 dist/
├── stryker.conf.js       # Stryker 配置（json 报告落 reports/mutation/mutation.json）
├── src/                  # 被变异的目标代码（3 个模块，77 个变异体）
│   ├── calculator.ts     # 算术 + 除零守卫 + 均值
│   ├── grader.ts         # 分数 → 等级（边界值无测试）
│   └── discount.ts       # 批量折扣（内含植入的 >=/ > bug）+ clamp
└── tests/                # mocha 测试（故意不完整，12 个用例）
```

## 前置条件

- Node.js 20+（本仓验证于 v24.19.0），npm 随附。
- 首次 `npm install` 需要访问 npm registry；之后 `npm test` / `npm run build` /
  `npx stryker run` 全部本地运行，不需要网络和任何外部服务。

## 快速开始

```bash
npm install
npm test            # 12 passing，退出码 0
npm run build       # tsc 严格编译，产物落 dist/
npx stryker run     # 变异测试，几秒跑完
```

## 预期结果（2026-10-06 实测）

| 步骤 | 结果 | 退出码 |
|---|---|---|
| `npm install` | 207 个包（mocha 钉在 ^10，见下方"版本说明"） | 0 |
| `npm test` | 12 passing | 0 |
| `npm run build` | `dist/*.js` 生成 | 0 |
| `npx stryker run` | 77 个变异体：51 killed / **15 survived** / 11 no coverage | 0 |

- 变异分数 **66.23%**（检出口径：(killed + timeout) / total）。
- Stryker 不配置 `thresholds.break`，因此即使有存活变异体也**退出码 0**；
  分数门槛由夜跑闭环的 baseline check（`mutation-baseline.mjs`）承担。
- JSON 报告固定落在 `reports/mutation/mutation.json`（`clear-text` 报告会同时
  在控制台列出每个存活变异体）。

## 刻意留下的缺陷与覆盖缺口

| 位置 | 缺口 | 典型存活变异体 |
|---|---|---|
| `src/discount.ts` `applyDiscount` | **植入 bug**：阈值判断用 `>` 而非 `>=`，`total` 恰好等于 100 时拿不到折扣；没有 100 压线测试 | `total > 100` → `total >= 100` |
| `src/grader.ts` `letterGrade` | 90/80/70/60 四个压线值全部无测试 | `>= 90` → `> 90` 等 4 条边界 |
| `src/grader.ts` `isPassing` | 测试只取 85/10，远离 60 边界 | `>= 60` → `> 60` |
| `src/calculator.ts` `subtract` | 整个函数无测试 | 全部存活 |
| `src/calculator.ts` `average` | 空列表分支未测 | `length === 0` → `false` 等 |
| `src/discount.ts` `clampAmount` | 只测了区间内取值，两条边界分支未测 | `<` → `<=`、`>` → `>=` |

请保持这些缺口：夹具的价值就在存活变异体上。补上测试会让端到端验证失去输入。

## 与夜跑闭环工具的衔接

在夹具目录内跑完 Stryker 后，用本仓 `scripts/` 的工具走完整链路（路径相对本文件）：

```bash
# 1. 解析存活变异体为统一报告
node ../../parse-stryker-report.mjs --input reports/mutation/mutation.json --output unified-mutation-report.json

# 2. 冻结 / 检查基线（回归退出码 2）
node ../../mutation-baseline.mjs init   --input reports/mutation/mutation.json --lang ts
node ../../mutation-baseline.mjs check  --input reports/mutation/mutation.json --lang ts

# 3. 预览补测 issue（--dry-run 零 gh 调用，只写 .mutation-queue/）
node ../../create-mutation-issues.mjs --input unified-mutation-report.json --dry-run
```

## 版本说明

- `mocha` 钉在 `^10.8.2`：`@stryker-mutator/mocha-runner@10` 依赖 mocha 内部模块
  `mocha/lib/cli/run-helpers`，mocha 12 已移除该路径（peer range `<13` 尚未收紧），
  装到 12 会在插件加载阶段报 "no TestRunner plugins were loaded"。
- TypeScript 钉在 5.9.x：`ts-node` 尚不兼容 typescript 7 的原生编译器。

## 清理

`node_modules/`、`dist/`、`reports/`、`.stryker-tmp/` 已在 `.gitignore` 中，
不影响版本库；需要彻底还原时删除它们即可（`package-lock.json` 保留以保证可复现安装）。
