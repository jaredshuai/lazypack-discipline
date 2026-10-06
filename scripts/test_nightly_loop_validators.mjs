/**
 * scripts/test_nightly_loop_validators.mjs
 *
 * test_nightly_loop.mjs 内联校验器的模块级单元测试（离线、零依赖、毫秒级）。
 * 只覆盖端到端正常管线跑不到的路径：
 *   - 统一报告顶层 / mutant 对象 / 基线文件（顶层与 baseline 对象）/ 队列
 *     文档的闭合字段集（契约 schema additionalProperties:false）；
 *   - 基线 score 最多 2 位小数（基线契约 §4 生产者约束）；
 *   - 文档可选字段的省略合法性（统一报告 score、队列 issueNumber）。
 * 端到端全流程本身仍由 scripts/test_nightly_loop.mjs 承担，本文件不重复；
 * 队列文档字段的实际调用点在 readDryRunManifest，这里以同一份 QUEUE_TOP_KEYS
 * 直接对 assertNoUnknownFields 断言（与调用点同一语义）。
 *
 * 用法: node scripts/test_nightly_loop_validators.mjs
 * 退出码: 0 = 全部用例通过；1 = 任一用例失败。
 */

import {
  assertBaselineFile,
  assertMutantObject,
  assertNoUnknownFields,
  assertUnifiedReport,
  BASELINE_STAT_KEYS,
  BASELINE_TOP_KEYS,
  MUTANT_KEYS,
  QUEUE_TOP_KEYS,
  REPORT_TOP_KEYS,
  hasAtMost2Decimals
} from './test_nightly_loop.mjs';

let checkCount = 0;

function assertCase(condition, message) {
  checkCount += 1;
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(fn, expectedSubstring, label) {
  try {
    fn();
  } catch (err) {
    assertCase(
      err.message.includes(expectedSubstring),
      label + ': 错误信息应含 ' + JSON.stringify(expectedSubstring) + '，实际 ' + err.message
    );
    return;
  }
  throw new Error(label + ': 期望抛错但未抛');
}

/** 合法 mutant 夹具（契约 §2 八字段）。 */
function validMutant(overrides) {
  return Object.assign({
    id: 'stryker-42',
    file: 'src/domain/pricing.ts',
    line: 8,
    column: 7,
    mutationType: 'ConditionalExpression',
    original: 'a >= 1',
    mutated: 'a > 1',
    status: 'Survived'
  }, overrides || {});
}

/** 合法统一报告夹具（契约 §1，score 为 1.1 起可选）。 */
function validReport(overrides) {
  return Object.assign({
    tool: 'stryker',
    timestamp: '2026-10-05T18:30:00Z',
    mutants: [validMutant()],
    score: 42.55
  }, overrides || {});
}

/** 合法基线文件夹具（基线契约 §2/§3）。 */
function validBaselineDoc(topOverrides, statOverrides) {
  return Object.assign({
    version: '1.0',
    updated: '2026-10-05T18:30:00Z',
    baseline: Object.assign({ score: 42.55, killed: 40, survived: 54, total: 94 }, statOverrides || {})
  }, topOverrides || {});
}

/** 合法队列文档夹具（模板契约 §4.3，dry-run 无 issueNumber）。 */
function validQueueDoc(overrides) {
  return Object.assign({
    version: '1.0',
    file: 'src/domain/pricing.ts',
    tool: 'stryker',
    timestamp: '2026-10-05T18:30:00Z',
    mutants: [validMutant()]
  }, overrides || {});
}

function caseMutantAcceptsExactFields() {
  const seen = new Set();
  assertMutantObject(validMutant(), 'm.json', 'stryker', seen);
  assertCase(seen.has('stryker-42'), '校验后应登记 id');
}

function caseMutantRejectsUnknownField() {
  assertThrows(
    () => assertMutantObject(validMutant({ note: '额外说明' }), 'm.json', 'stryker', new Set()),
    '未知字段',
    'mutant 未知字段'
  );
}

function caseReportAcceptsExactFields() {
  const parsed = assertUnifiedReport(validReport(), 'stryker', 'r.json');
  assertCase(parsed.score === 42.55, '应原样返回 score');
  assertCase(parsed.mutants.length === 1 && parsed.tool === 'stryker', '应原样返回 mutants/tool');
}

function caseReportRejectsUnknownTopField() {
  assertThrows(
    () => assertUnifiedReport(validReport({ note: 'x' }), 'stryker', 'r.json'),
    '未知字段',
    '统一报告未知顶层字段'
  );
}

function caseReportScoreOptional() {
  const report = validReport();
  delete report.score;
  const parsed = assertUnifiedReport(report, 'stryker', 'r.json');
  assertCase(parsed.score === undefined, '省略 score 应按可选字段放行');
}

function caseReportScoreValidatedWhenPresent() {
  assertThrows(() => assertUnifiedReport(validReport({ score: '85' }), 'stryker', 'r.json'), 'score', 'score 字符串');
  assertThrows(() => assertUnifiedReport(validReport({ score: 100.01 }), 'stryker', 'r.json'), 'score', 'score 超上界');
  assertThrows(() => assertUnifiedReport(validReport({ score: -1 }), 'stryker', 'r.json'), 'score', 'score 负值');
}

function caseBaselineAcceptsExactFields() {
  const stats = assertBaselineFile(validBaselineDoc(), 'b.json', 42.55);
  assertCase(stats.score === 42.55 && stats.total === 94, '应原样返回 baseline 对象');
}

function caseBaselineRejectsUnknownTopField() {
  assertThrows(
    () => assertBaselineFile(validBaselineDoc({ note: 'x' }), 'b.json', 42.55),
    '未知字段',
    '基线未知顶层字段'
  );
}

function caseBaselineRejectsUnknownStatField() {
  assertThrows(
    () => assertBaselineFile(validBaselineDoc({}, { timeout: 1 }), 'b.json', 42.55),
    '未知字段',
    'baseline 对象未知字段'
  );
}

function caseBaselineScoreMaxTwoDecimals() {
  assertThrows(
    () => assertBaselineFile(validBaselineDoc({}, { score: 87.654321 }), 'b.json'),
    '2 位小数',
    'score 三位以上小数'
  );
  assertThrows(
    () => assertBaselineFile(validBaselineDoc({}, { score: 76.92307692307692 }), 'b.json'),
    '2 位小数',
    'score 全精度浮点'
  );
  for (const okScore of [42.55, 42.5, 42, 100, 0, 99.99, 0.01]) {
    const stats = assertBaselineFile(validBaselineDoc({}, { score: okScore }), 'b.json');
    assertCase(stats.score === okScore, '合法 score 应放行：' + okScore);
  }
}

function caseBaselineExpectedScoreOptional() {
  const stats = assertBaselineFile(validBaselineDoc(), 'b.json');
  assertCase(stats.score === 42.55, '缺省 expectedScore 时其余断言照常');
}

function caseQueueFieldSet() {
  assertNoUnknownFields(validQueueDoc(), QUEUE_TOP_KEYS, 'q.json', '队列文件顶层');
  assertNoUnknownFields(validQueueDoc({ issueNumber: 5 }), QUEUE_TOP_KEYS, 'q.json', '队列文件顶层');
  assertThrows(
    () => assertNoUnknownFields(validQueueDoc({ summary: {} }), QUEUE_TOP_KEYS, 'q.json', '队列文件顶层'),
    '未知字段',
    '队列文档未知字段'
  );
}

function caseHasAtMost2DecimalsTable() {
  for (const value of [42.55, 42.5, 42, 100, 0, 99.99, 0.01, 87.65]) {
    assertCase(hasAtMost2Decimals(value), '应判为 ≤2 位小数：' + value);
  }
  for (const value of [87.654, 42.553, 76.92307692307692, 0.001, 1e-7, 33.333333]) {
    assertCase(!hasAtMost2Decimals(value), '应判为 >2 位小数：' + value);
  }
}

function caseKeyContractSanity() {
  assertCase(MUTANT_KEYS.length === 8, 'mutant 应恰八字段');
  assertCase(REPORT_TOP_KEYS.length === 4 && REPORT_TOP_KEYS.includes('score'), '统一报告顶层四键（score 可选）');
  assertCase(BASELINE_TOP_KEYS.length === 3, '基线顶层三键');
  assertCase(BASELINE_STAT_KEYS.length === 4, 'baseline 对象四键');
  assertCase(QUEUE_TOP_KEYS.includes('issueNumber'), '队列字段集应含可选 issueNumber');
}

function main() {
  const cases = [
    ['caseMutantAcceptsExactFields', caseMutantAcceptsExactFields],
    ['caseMutantRejectsUnknownField', caseMutantRejectsUnknownField],
    ['caseReportAcceptsExactFields', caseReportAcceptsExactFields],
    ['caseReportRejectsUnknownTopField', caseReportRejectsUnknownTopField],
    ['caseReportScoreOptional', caseReportScoreOptional],
    ['caseReportScoreValidatedWhenPresent', caseReportScoreValidatedWhenPresent],
    ['caseBaselineAcceptsExactFields', caseBaselineAcceptsExactFields],
    ['caseBaselineRejectsUnknownTopField', caseBaselineRejectsUnknownTopField],
    ['caseBaselineRejectsUnknownStatField', caseBaselineRejectsUnknownStatField],
    ['caseBaselineScoreMaxTwoDecimals', caseBaselineScoreMaxTwoDecimals],
    ['caseBaselineExpectedScoreOptional', caseBaselineExpectedScoreOptional],
    ['caseQueueFieldSet', caseQueueFieldSet],
    ['caseHasAtMost2DecimalsTable', caseHasAtMost2DecimalsTable],
    ['caseKeyContractSanity', caseKeyContractSanity]
  ];
  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      fn();
      process.stdout.write('PASS ' + name + '\n');
    } catch (err) {
      failed += 1;
      process.stderr.write('FAIL ' + name + ': ' + err.message + '\n');
    }
  }
  process.stdout.write('test_nightly_loop_validators: ' + (cases.length - failed) + '/' + cases.length +
    ' passed (' + checkCount + ' checks)\n');
  process.exit(failed === 0 ? 0 : 1);
}

main();
