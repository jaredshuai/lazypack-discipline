/**
 * Stryker 配置 —— sample-ts 夹具。
 *
 * 与 templates/.github/workflows/nightly-mutation-ts.yml 的约定保持一致：
 * - reporters 必须含 "json"，报告落在 reports/mutation/mutation.json，
 *   供 scripts/parse-stryker-report.mjs 读取；
 * - 不要配置 thresholds.break：夜跑闭环的分数门槛由 baseline check 承担
 *   （mutation-baseline.mjs），配了 break 分数低时 Stryker 以非零码退出，
 *   后续解析 / 建 issue 步骤不会执行；
 * - 测试经 ts-node/register 在 mocha 进程内直接跑 TS 源码，变异测试前无需
 *   先执行 npm run build。
 *
 * 用 JSON 也可以：Stryker 同样识别 stryker.conf.json。
 *
 * @type {import('@stryker-mutator/api/core').StrykerOptions}
 */
module.exports = {
  packageManager: 'npm',
  testRunner: 'mocha',
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json',
  },
  mutate: ['src/**/*.ts'],
  mochaOptions: {
    require: ['ts-node/register'],
    spec: ['tests/**/*.spec.ts'],
  },
};
