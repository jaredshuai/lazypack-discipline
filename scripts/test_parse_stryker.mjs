/**
 * scripts/test_parse_stryker.mjs
 *
 * Stryker 报告解析器断言驱动回归（仿 test_mutation_baseline.mjs 模式）。
 * 在系统临时目录生成 Stryker JSON 夹具（v6/v7 schema 报告、空报告、畸形输入），
 * 以子进程方式调用 parse-stryker-report.mjs，校验 stdout/stderr、
 * --output 文件内容与退出码，不修改本仓库。
 * 用法: node scripts/test_parse_stryker.mjs
 * 全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI = path.join(__dirname, 'parse-stryker-report.mjs');

/**
 * 断言条件成立，失败时抛出带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 以子进程运行解析器，返回 status/stdout/stderr。
 */
function runCli(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

/**
 * 在临时根目录下建用例子目录。
 */
function makeCaseDir(base, name) {
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 写文本夹具，返回路径。
 */
function writeText(dir, name, content) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * 写 JSON 夹具，返回路径。
 */
function writeJson(dir, name, data) {
  return writeText(dir, name, `${JSON.stringify(data, null, 2)}\n`);
}

/* ------------------------------------------------------------------ */
/* 夹具：运费示例（与运营手册 §1.4 的 40/94 → 42.55 叙事同源）          */
/* ------------------------------------------------------------------ */

const PRICING_SOURCE = [
  'export function shippingFee(subtotalCents: number, isMember: boolean): number {',
  '  let fee = 0;',
  '  if (subtotalCents >= 100_00 || isMember) {',
  '    return fee;',
  '  }',
  '  fee += 300;',
  '  return fee;',
  '}',
  ''
].join('\n');

const CART_SOURCE = 'export const label = "empty";';

/**
 * 构造单个 Stryker 变异体（0-based 坐标，与真实报告一致）。
 */
function mutant(id, mutatorName, status, start, end, replacement, extra = {}) {
  return { id, mutatorName, location: { start, end }, status, replacement, ...extra };
}

/**
 * pricing.ts 的六个变异体：3 Survived / 1 Killed / 1 NoCoverage / 1 Timeout。
 * 数组顺序故意打乱，验证输出的确定性排序。
 */
function pricingMutants() {
  return [
    mutant(63, 'NumberLiteral', 'Survived', { line: 5, column: 9 }, { line: 5, column: 12 }, '301'),
    mutant(57, 'NegateCondition', 'Survived', { line: 2, column: 33 }, { line: 2, column: 41 }, '!isMember'),
    mutant(42, 'ConditionalExpression', 'Survived', { line: 2, column: 30 }, { line: 2, column: 32 }, '&&'),
    mutant(41, 'EqualityOperator', 'Killed', { line: 2, column: 20 }, { line: 2, column: 22 }, '>'),
    mutant(40, 'NumberLiteral', 'NoCoverage', { line: 1, column: 12 }, { line: 1, column: 13 }, '1'),
    mutant(64, 'ArithmeticOperator', 'Timeout', { line: 5, column: 6 }, { line: 5, column: 8 }, '-=')
  ];
}

/**
 * 构造 { schemaVersion, files } schema 报告；可选注入 metrics/testFiles 等。
 */
function strykerReport({ schemaVersion = '1.3', withMetrics = true, testFiles = null, extras = {} } = {}) {
  const report = {
    files: {
      'src/domain/pricing.ts': { source: PRICING_SOURCE, mutants: pricingMutants() },
      'src/services/cart.ts': {
        source: CART_SOURCE,
        mutants: [mutant(71, 'StringLiteral', 'Survived', { line: 0, column: 21 }, { line: 0, column: 28 }, '""')]
      }
    },
    ...extras
  };
  if (schemaVersion !== null) {
    report.schemaVersion = schemaVersion;
  }
  if (withMetrics) {
    report.metrics = { mutationScore: 42.55 };
  }
  if (testFiles) {
    report.testFiles = testFiles;
  }
  return report;
}

/**
 * 跑一次有效报告，返回解析后的 stdout JSON。
 */
function runValid(dir, name, reportOverrides, args = []) {
  const input = writeJson(dir, `${name}.json`, strykerReport(reportOverrides));
  const cli = runCli(['--input', input, ...args], dir);
  assertCase(cli.status === 0, `${name} 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  let report;
  try {
    report = JSON.parse(cli.stdout);
  } catch (err) {
    throw new Error(`${name} stdout 应为纯 JSON，解析失败：${err.message}\nstdout: ${cli.stdout}`);
  }
  return report;
}

/**
 * --help 输出用法、旗标与存活说明，退出码 0（VAL-STRYKER-001 前置界面）。
 */
function caseHelp(base) {
  const dir = makeCaseDir(base, 'help');
  const cli = runCli(['--help'], dir);
  assertCase(cli.status === 0, `--help 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(/usage/i.test(cli.stdout), `--help 输出应含用法说明，实际：${cli.stdout}`);
  assertCase(cli.stdout.includes('--input'), '--help 应说明 --input');
  assertCase(cli.stdout.includes('--output'), '--help 应说明 --output');
  assertCase(cli.stdout.includes('Survived'), '--help 应说明只保留 Survived');
}

/**
 * 缺 --input 时退出码 1，stderr 含用法文本（VAL-STRYKER-008）。
 */
function caseNoInputFlag(base) {
  const dir = makeCaseDir(base, 'no-input');
  const cli = runCli([], dir);
  assertCase(cli.status === 1, `缺 --input 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('Usage'), `stderr 应含用法文本，实际：${cli.stderr}`);
  assertCase(cli.stderr.includes('--input'), `stderr 用法应提到 --input，实际：${cli.stderr}`);
  assertCase(cli.stdout === '', `缺 --input 时 stdout 应为空，实际：${cli.stdout}`);
}

/**
 * 未知旗标报错退出码 1。
 */
function caseUnknownOption(base) {
  const dir = makeCaseDir(base, 'unknown-option');
  const input = writeJson(dir, 'report.json', strykerReport());
  const cli = runCli(['--input', input, '--bogus'], dir);
  assertCase(cli.status === 1, `未知旗标退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('unknown option'), `stderr 应提示未知旗标，实际：${cli.stderr}`);
}

/**
 * 旗标缺值报错退出码 1。
 */
function caseMissingValue(base) {
  const dir = makeCaseDir(base, 'missing-value');
  const cli = runCli(['--input'], dir);
  assertCase(cli.status === 1, `旗标缺值退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('missing value for --input'), `stderr 应提示缺值，实际：${cli.stderr}`);
}

/**
 * 重复旗标报错退出码 1。
 */
function caseDuplicateOption(base) {
  const dir = makeCaseDir(base, 'duplicate-option');
  const input = writeJson(dir, 'report.json', strykerReport());
  const cli = runCli(['--input', input, '--input', input], dir);
  assertCase(cli.status === 1, `重复旗标退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('duplicate option'), `stderr 应提示重复旗标，实际：${cli.stderr}`);
}

/**
 * 输入文件缺失时报错退出码 1。
 */
function caseInputFileMissing(base) {
  const dir = makeCaseDir(base, 'file-missing');
  const cli = runCli(['--input', path.join(dir, 'nope.json')], dir);
  assertCase(cli.status === 1, `文件缺失退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/not found/i.test(cli.stderr), `stderr 应含 not found，实际：${cli.stderr}`);
}

/**
 * 畸形 JSON 报错退出码 1（VAL-STRYKER-004）。
 */
function caseMalformedJson(base) {
  const dir = makeCaseDir(base, 'malformed-json');
  const input = writeText(dir, 'malformed.json', '{ this is not json ]');
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 1, `畸形 JSON 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/parse|JSON/i.test(cli.stderr), `stderr 应含 JSON 解析错误，实际：${cli.stderr}`);
}

/**
 * 裸变异体数组不是报告 schema，报错退出码 1。
 */
function caseArrayInputRejected(base) {
  const dir = makeCaseDir(base, 'array-input');
  const input = writeJson(dir, 'array.json', [{ id: 'a', status: 'Survived' }]);
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 1, `数组输入退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/not recognized/i.test(cli.stderr), `stderr 应提示 schema 不识别，实际：${cli.stderr}`);
}

/**
 * 有效报告：统一格式、仅 Survived、必填字段、排序与 1-based 坐标
 * （VAL-STRYKER-001/002/003，坐标与排序口径）。
 */
function caseValidReport(base) {
  const dir = makeCaseDir(base, 'valid');
  const report = runValid(dir, 'valid', {});
  assertCase(report.tool === 'stryker', `tool 应为 stryker，实际 ${report.tool}`);
  assertCase(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(report.timestamp),
    `timestamp 应为 YYYY-MM-DDTHH:MM:SSZ，实际 ${report.timestamp}`);
  assertCase(Array.isArray(report.mutants) && report.mutants.length === 4,
    `应提取 4 个存活变异体，实际 ${JSON.stringify(report.mutants?.length)}`);
  const ids = report.mutants.map((m) => m.id);
  assertCase(!ids.includes('stryker-41') && !ids.includes('stryker-40') && !ids.includes('stryker-64'),
    `Killed/NoCoverage/Timeout 不得出现在输出，实际 ${ids.join(',')}`);
  for (const m of report.mutants) {
    assertCase(m.status === 'Survived', `status 应为 Survived，实际 ${m.status}`);
    for (const field of ['id', 'file', 'line', 'column', 'mutationType', 'original', 'mutated', 'status']) {
      assertCase(m[field] !== null && m[field] !== undefined, `mutant ${m.id} 缺字段 ${field}`);
    }
  }
  const [orMutant, negateMutant, numberMutant, cartMutant] = report.mutants;
  assertCase(orMutant.id === 'stryker-42' && orMutant.line === 3 && orMutant.column === 31,
    `|| 变异体应排序在首位且坐标 3:31，实际 ${JSON.stringify(orMutant)}`);
  assertCase(orMutant.original === '||' && orMutant.mutated === '&&', `|| 变异体原文/替换应正确，实际 ${orMutant.original} -> ${orMutant.mutated}`);
  assertCase(orMutant.mutationType === 'ConditionalExpression', `mutationType 应透传 ConditionalExpression，实际 ${orMutant.mutationType}`);
  assertCase(negateMutant.id === 'stryker-57' && negateMutant.line === 3 && negateMutant.column === 34,
    `isMember 变异体应为 3:34，实际 ${JSON.stringify(negateMutant)}`);
  assertCase(negateMutant.original === 'isMember' && negateMutant.mutated === '!isMember',
    'isMember 变异体原文/替换应正确');
  assertCase(numberMutant.id === 'stryker-63' && numberMutant.line === 6 && numberMutant.column === 10,
    `300 变异体应为 6:10，实际 ${JSON.stringify(numberMutant)}`);
  assertCase(cartMutant.id === 'stryker-71' && cartMutant.file === 'src/services/cart.ts'
    && cartMutant.line === 1 && cartMutant.column === 22,
    `cart 变异体应为 cart.ts 1:22，实际 ${JSON.stringify(cartMutant)}`);
  assertCase(cartMutant.original === '"empty"' && cartMutant.mutated === '""', 'cart 变异体原文/替换应正确');
}

/**
 * 输出 JSON 严格贴合契约 v1.1：顶层恰好四字段，mutant 恰好八字段（§6 手写断言）。
 */
function caseSchemaStrictShape(base) {
  const dir = makeCaseDir(base, 'schema-shape');
  const report = runValid(dir, 'shape', {});
  assertCase(Object.keys(report).join(',') === 'tool,timestamp,mutants,score',
    `顶层字段应为 tool,timestamp,mutants,score，实际 ${Object.keys(report).join(',')}`);
  for (const m of report.mutants) {
    assertCase(Object.keys(m).join(',') === 'id,file,line,column,mutationType,original,mutated,status',
      `mutant ${m.id} 字段应为契约八字段，实际 ${Object.keys(m).join(',')}`);
    assertCase(Number.isInteger(m.line) && m.line >= 1, `line 应为 >=1 整数，实际 ${m.line}`);
    assertCase(Number.isInteger(m.column) && m.column >= 1, `column 应为 >=1 整数，实际 ${m.column}`);
    assertCase(m.original !== m.mutated, `mutant ${m.id} 的 mutated 不得等于 original`);
    assertCase(typeof m.file === 'string' && !m.file.includes('\\\\') && !m.file.startsWith('./'),
      `file 应为 POSIX 相对路径，实际 ${m.file}`);
  }
}

/**
 * 报告无显式分数时按检出口径计算 round2((killed+timeout)/total*100)。
 * 1 Killed + 1 Timeout / 7 total（pricing 6 + cart 1）→ 28.57。
 */
function caseComputedScore(base) {
  const dir = makeCaseDir(base, 'computed-score');
  const report = runValid(dir, 'computed', { withMetrics: false });
  assertCase(report.score === 28.57, `计算分数应为 28.57，实际 ${report.score}`);
}

/**
 * 显式分数原样保留（不取整不截断）；顶层 mutationScore/score 形态亦可识别；
 * 非法分数报错（VAL-STRYKER-007）。
 */
function caseExplicitScore(base) {
  const dir = makeCaseDir(base, 'explicit-score');
  const report = runValid(dir, 'verbatim', { withMetrics: true });
  assertCase(report.score === 42.55, `显式分数应为 42.55，实际 ${report.score}`);
  const dir2 = makeCaseDir(base, 'explicit-score-precise');
  const report2 = runValid(dir2, 'precise', { withMetrics: false, extras: { mutationScore: 87.654321 } });
  assertCase(report2.score === 87.654321, `高精度分数应原样保留，实际 ${report2.score}`);
  const dir3 = makeCaseDir(base, 'explicit-score-plain');
  const report3 = runValid(dir3, 'plain', { withMetrics: false, extras: { score: 12.5 } });
  assertCase(report3.score === 12.5, `顶层 score 形态应可识别，实际 ${report3.score}`);
  const dir4 = makeCaseDir(base, 'explicit-score-bad');
  const badInput = writeJson(dir4, 'bad.json', strykerReport({ withMetrics: false, extras: { mutationScore: 150 } }));
  const cli = runCli(['--input', badInput], dir4);
  assertCase(cli.status === 1, `越界分数退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/score/i.test(cli.stderr), `stderr 应提示分数非法，实际：${cli.stderr}`);
}

/**
 * Stryker v6 形态（schemaVersion，无 testFiles）可解析（VAL-STRYKER-011 v6）。
 */
function caseV6Format(base) {
  const dir = makeCaseDir(base, 'v6');
  const report = runValid(dir, 'v6', { schemaVersion: '1.3' });
  assertCase(report.mutants.length === 4, `v6 应提取 4 个存活变异体，实际 ${report.mutants.length}`);
}

/**
 * Stryker v7 形态（testFiles + coveredBy/killedBy/statusReason）可解析，
 * 额外小节被忽略（VAL-STRYKER-011 v7）。
 */
function caseV7Format(base) {
  const dir = makeCaseDir(base, 'v7');
  const input = writeJson(dir, 'v7.json', strykerReport({
    schemaVersion: '1.5',
    testFiles: [{ id: '0', name: 'pricing.spec.ts', tests: [{ id: '0', name: 'waives fee for members' }] }],
    extras: {
      framework: { name: '@stryker-mutator/core', version: '7.3.0' },
      performance: { startedAt: '2026-10-05T18:00:00.000Z' }
    }
  }));
  // 给 pricing 变异体补 v7 字段，确认额外字段被忽略
  const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
  for (const m of raw.files['src/domain/pricing.ts'].mutants) {
    m.coveredBy = ['0'];
    m.killedBy = m.status === 'Killed' ? ['0'] : [];
    m.testsCompleted = m.status === 'Killed' ? 1 : 0;
    m.statusReason = m.status === 'Survived' ? 'All tests passed' : '';
  }
  fs.writeFileSync(input, `${JSON.stringify(raw, null, 2)}\n`);
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 0, `v7 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const report = JSON.parse(cli.stdout);
  assertCase(report.mutants.length === 4, `v7 应提取 4 个存活变异体，实际 ${report.mutants.length}`);
}

/**
 * 空报告（无 files 或只有非存活变异体）正常输出空数组，退出码 0
 * （VAL-STRYKER-005）；无变异体时分数记 100，有非存活变异体时按口径计算。
 */
function caseEmptyReport(base) {
  const dir = makeCaseDir(base, 'empty');
  const emptyFiles = writeJson(dir, 'empty-files.json', { schemaVersion: '1.3', files: {}, metrics: { mutationScore: 42.55 } });
  const cli = runCli(['--input', emptyFiles], dir);
  assertCase(cli.status === 0, `空 files 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const report = JSON.parse(cli.stdout);
  assertCase(Array.isArray(report.mutants) && report.mutants.length === 0, '空 files 应输出空 mutants 数组');
  assertCase(report.score === 42.55, `空 files 时显式分数应保留，实际 ${report.score}`);
  const dir2 = makeCaseDir(base, 'no-mutants');
  const noSurvivors = writeJson(dir2, 'no-survivors.json', {
    files: { 'src/a.ts': { source: 'const x = 1;', mutants: [mutant(1, 'NumberLiteral', 'Killed', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] } }
  });
  const cli2 = runCli(['--input', noSurvivors], dir2);
  assertCase(cli2.status === 0, `无非存活退出码应为 0，实际 ${cli2.status}: ${cli2.stderr}`);
  const report2 = JSON.parse(cli2.stdout);
  assertCase(report2.mutants.length === 0, '无非存活变异体应输出空数组');
  assertCase(report2.score === 100, `1 killed / 1 total 已全部检出，分数应为 100，实际 ${report2.score}`);
}

/**
 * --output 写出统一 JSON 文件，stdout 改为摘要行（VAL-STRYKER-010）。
 */
function caseOutputFile(base) {
  const dir = makeCaseDir(base, 'output-file');
  const input = writeJson(dir, 'report.json', strykerReport());
  const target = path.join(dir, 'unified.json');
  const cli = runCli(['--input', input, '--output', target], dir);
  assertCase(cli.status === 0, `--output 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(fs.existsSync(target), `应写到 --output 路径，实际缺失 ${target}`);
  const raw = fs.readFileSync(target, 'utf8');
  assertCase(!raw.startsWith('﻿'), '输出文件不应带 BOM');
  assertCase(raw.endsWith('\n') && !raw.endsWith('\n\n'), '输出文件应以恰好一个换行符结尾');
  assertCase(!raw.includes('\r'), '输出文件应使用 LF 换行');
  assertCase(raw.includes('\n  "timestamp"'), '输出文件应使用 2 空格缩进');
  const report = JSON.parse(raw);
  assertCase(report.score === 42.55 && report.mutants.length === 4, '输出文件内容应正确');
  assertCase(Object.keys(report).join(',') === 'tool,timestamp,mutants,score', '输出文件顶层字段应正确');
  assertCase(cli.stdout.includes('parse-stryker-report:') && cli.stdout.includes('survived=4'),
    `--output 时 stdout 应给摘要行，实际：${cli.stdout}`);
}

/**
 * 文件路径保留原样（大小写不变），反斜杠与 ./ 前缀按契约归一（VAL-STRYKER-006）。
 */
function casePathsPreserved(base) {
  const dir = makeCaseDir(base, 'paths');
  const mixed = writeJson(dir, 'mixed.json', {
    files: {
      'Src/Domain/Pricing.TS': { source: 'const a = 1;', mutants: [mutant(1, 'NumberLiteral', 'Survived', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] }
    }
  });
  const cli = runCli(['--input', mixed], dir);
  assertCase(cli.status === 0, `混合大小写路径退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const report = JSON.parse(cli.stdout);
  assertCase(report.mutants[0].file === 'Src/Domain/Pricing.TS',
    `路径应逐字保留，实际 ${report.mutants[0].file}`);
  const dir2 = makeCaseDir(base, 'paths-normalize');
  const normalized = writeJson(dir2, 'normalized.json', {
    files: {
      '.\\src\\x.ts': { source: 'const a = 1;', mutants: [mutant(2, 'NumberLiteral', 'Survived', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] }
    }
  });
  const cli2 = runCli(['--input', normalized], dir2);
  assertCase(cli2.status === 0, `反斜杠路径退出码应为 0，实际 ${cli2.status}: ${cli2.stderr}`);
  const report2 = JSON.parse(cli2.stdout);
  assertCase(report2.mutants[0].file === 'src/x.ts',
    `反斜杠与 ./ 前缀应归一为 POSIX，实际 ${report2.mutants[0].file}`);
}

/**
 * 上表之外的未知状态必须报错退出（契约 §5.3），stderr 含来源值。
 */
function caseUnknownStatus(base) {
  const dir = makeCaseDir(base, 'unknown-status');
  const input = writeJson(dir, 'eaten.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [mutant(1, 'NumberLiteral', 'Eaten', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] } }
  });
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 1, `未知状态退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('Eaten'), `stderr 应含来源状态值，实际：${cli.stderr}`);
}

/**
 * 存活变异体坐标越界时清晰报错，退出码 1。
 */
function caseBadLocation(base) {
  const dir = makeCaseDir(base, 'bad-location');
  const input = writeJson(dir, 'bad.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [mutant(1, 'NumberLiteral', 'Survived', { line: 99, column: 0 }, { line: 99, column: 1 }, '2')] } }
  });
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 1, `坐标越界退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/out of range|location/i.test(cli.stderr), `stderr 应提示坐标问题，实际：${cli.stderr}`);
}

/**
 * replacement 与原文相同时报错（契约 §2：mutated 不得等于 original）。
 */
function caseOriginalEqualsReplacement(base) {
  const dir = makeCaseDir(base, 'same-text');
  const input = writeJson(dir, 'same.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [mutant(1, 'NumberLiteral', 'Survived', { line: 0, column: 10 }, { line: 0, column: 11 }, '1')] } }
  });
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 1, `替换文本相同退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/identical|equal/i.test(cli.stderr), `stderr 应提示替换文本相同，实际：${cli.stderr}`);
}

/**
 * replacement 缺失或为空时报错，退出码 1。
 */
function caseEmptyReplacement(base) {
  const dir = makeCaseDir(base, 'empty-replacement');
  const input = writeJson(dir, 'empty.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [{ id: 1, mutatorName: 'NumberLiteral', status: 'Survived', location: { start: { line: 0, column: 10 }, end: { line: 0, column: 11 } } }] } }
  });
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 1, `缺 replacement 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/replacement/i.test(cli.stderr), `stderr 应提示 replacement 问题，实际：${cli.stderr}`);
}

/**
 * 跨行变异体：original 按 start/end 切片以 \n 连接，line/column 指首字符。
 */
function caseMultiLineOriginal(base) {
  const dir = makeCaseDir(base, 'multi-line');
  const source = ['function f() {', '  return 1;', '}', ''].join('\n');
  const input = writeJson(dir, 'block.json', {
    files: { 'src/f.ts': { source, mutants: [mutant(9, 'Block', 'Survived', { line: 0, column: 13 }, { line: 2, column: 1 }, '{}')] } }
  });
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 0, `跨行变异体退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const report = JSON.parse(cli.stdout);
  const m = report.mutants[0];
  assertCase(m.original === '{\n  return 1;\n}', `跨行 original 应按切片连接，实际 ${JSON.stringify(m.original)}`);
  assertCase(m.mutated === '{}', 'Block 替换应为 {}');
  assertCase(m.line === 1 && m.column === 14, `首字符坐标应为 1:14，实际 ${m.line}:${m.column}`);
}

/**
 * id 归一化：数值与字符串原生 id 都加 stryker- 前缀；含空白 id 报错（§3.1）。
 */
function caseIdNormalization(base) {
  const dir = makeCaseDir(base, 'ids');
  const report = runValid(dir, 'ids', {});
  assertCase(report.mutants.every((m) => m.id.startsWith('stryker-')), `id 应带 stryker- 前缀，实际 ${report.mutants.map((m) => m.id).join(',')}`);
  const dir2 = makeCaseDir(base, 'ids-string');
  const input = writeJson(dir2, 'str.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [mutant('mutant-7', 'NumberLiteral', 'Survived', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] } }
  });
  const cli = runCli(['--input', input], dir2);
  assertCase(cli.status === 0, `字符串 id 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(JSON.parse(cli.stdout).mutants[0].id === 'stryker-mutant-7', '字符串 id 应保留并加前缀');
  const dir3 = makeCaseDir(base, 'ids-space');
  const bad = writeJson(dir3, 'space.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [mutant('a b', 'NumberLiteral', 'Survived', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] } }
  });
  const cli3 = runCli(['--input', bad], dir3);
  assertCase(cli3.status === 1, `含空白 id 退出码应为 1，实际 ${cli3.status}: ${cli3.stdout}`);
  assertCase(/id/i.test(cli3.stderr), `stderr 应提示 id 非法，实际：${cli3.stderr}`);
}

/**
 * mutatorName 归一化：已知名称透传，未知名称与缺失归为 Unknown（§4）。
 */
function caseMutationTypeNormalization(base) {
  const dir = makeCaseDir(base, 'mutator-known');
  const known = writeJson(dir, 'known.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [mutant(1, 'ConditionalExpression', 'Survived', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] } }
  });
  const cli = runCli(['--input', known], dir);
  assertCase(cli.status === 0, `已知 mutator 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(JSON.parse(cli.stdout).mutants[0].mutationType === 'ConditionalExpression', '已知 mutatorName 应透传');
  const dir2 = makeCaseDir(base, 'mutator-unknown');
  const unknown = writeJson(dir2, 'unknown.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [mutant(2, 'CustomThing', 'Survived', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] } }
  });
  const cli2 = runCli(['--input', unknown], dir2);
  assertCase(cli2.status === 0, `未知 mutator 退出码应为 0，实际 ${cli2.status}: ${cli2.stderr}`);
  assertCase(JSON.parse(cli2.stdout).mutants[0].mutationType === 'Unknown', '未知 mutatorName 应归为 Unknown');
  const dir3 = makeCaseDir(base, 'mutator-missing');
  const missing = writeJson(dir3, 'missing.json', {
    files: { 'src/a.ts': { source: 'const a = 1;', mutants: [mutant(3, undefined, 'Survived', { line: 0, column: 10 }, { line: 0, column: 11 }, '2')] } }
  });
  const cli3 = runCli(['--input', missing], dir3);
  assertCase(cli3.status === 0, `缺失 mutator 退出码应为 0，实际 ${cli3.status}: ${cli3.stderr}`);
  assertCase(JSON.parse(cli3.stdout).mutants[0].mutationType === 'Unknown', '缺失 mutatorName 应归为 Unknown');
}

/**
 * 依次跑全部用例，全过时向 stdout 写一行摘要。
 */
function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parse-stryker-'));
  const cases = [
    caseHelp,
    caseNoInputFlag,
    caseUnknownOption,
    caseMissingValue,
    caseDuplicateOption,
    caseInputFileMissing,
    caseMalformedJson,
    caseArrayInputRejected,
    caseValidReport,
    caseSchemaStrictShape,
    caseComputedScore,
    caseExplicitScore,
    caseV6Format,
    caseV7Format,
    caseEmptyReport,
    caseOutputFile,
    casePathsPreserved,
    caseUnknownStatus,
    caseBadLocation,
    caseOriginalEqualsReplacement,
    caseEmptyReplacement,
    caseMultiLineOriginal,
    caseIdNormalization,
    caseMutationTypeNormalization
  ];
  try {
    cases.forEach((runCase) => runCase(base));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  process.stdout.write(`test_parse_stryker: PASS cases=${cases.length}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`test_parse_stryker: FAIL ${err.message}\n`);
  process.exit(1);
}
