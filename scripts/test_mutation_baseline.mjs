/**
 * scripts/test_mutation_baseline.mjs
 *
 * 变异基线管理工具断言驱动回归（仿 test_calculate_crap.mjs 模式）。
 * 在系统临时目录生成夹具（Stryker JSON / mutmut 结果导出 / 统计对象），
 * 以子进程方式调用 mutation-baseline.mjs，校验 stdout/stderr、
 * .mutation-baseline.json 的内容与退出码，不修改本仓库。
 * 用法: node scripts/test_mutation_baseline.mjs
 * 全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI = path.join(__dirname, 'mutation-baseline.mjs');

/**
 * 断言条件成立，失败时抛出带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 以子进程运行基线工具，返回 status/stdout/stderr。
 */
function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd
  });
}

/**
 * 在临时目录写入 JSON 夹具，返回文件路径。
 */
function writeJson(dir, name, value) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

/**
 * 在临时目录写入原文文本夹具（用于畸形 JSON），返回文件路径。
 */
function writeText(dir, name, text) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, text);
  return filePath;
}

/**
 * 为单个用例准备独立子目录。
 */
function makeCaseDir(base, name) {
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 读取用例目录下默认位置的基线文件并解析。
 */
function readBaseline(dir, name = '.mutation-baseline.json') {
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

/**
 * 读取用例目录下默认位置的基线文件原文（字节级断言用）。
 */
function readBaselineRaw(dir, name = '.mutation-baseline.json') {
  return fs.readFileSync(path.join(dir, name), 'utf8');
}

/**
 * 预置一份合法基线文件（可指定 updated，便于断言是否被刷新）。
 */
function writeBaselineFixture(dir, score, killed, survived, total, updated = '2020-01-01T00:00:00Z') {
  const filePath = path.join(dir, '.mutation-baseline.json');
  const body = { version: '1.0', updated, baseline: { score, killed, survived, total } };
  fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`);
  return filePath;
}

/**
 * 构造 Stryker JSON 报告的单个变异体条目。
 */
function strykerMutant(id, status) {
  return {
    id,
    mutatorName: 'Block',
    location: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    status,
    replacement: '{}'
  };
}

/**
 * 构造 Stryker 变异体结果数组（reports/mutation/mutation.json 的数组形态）。
 */
function strykerResults(statuses) {
  return statuses.map((status, index) => strykerMutant(`mutant-${index}`, status));
}

/**
 * 构造 Stryker schema 报告（{ schemaVersion, files } 形态）。
 */
function strykerFileReport(statuses) {
  return {
    schemaVersion: '1.3',
    files: {
      'src/app.ts': { source: 'export function f() {}', mutants: strykerResults(statuses) }
    }
  };
}

/**
 * 构造 mutmut 结果导出（各类别为变异体 id 数组）。
 */
function mutmutExport({ killed = [], survived = [], timeout = [], suspicious = [], untested = [], skipped = [] } = {}) {
  return { killed, survived, timeout, suspicious, untested, skipped };
}

/**
 * 构造最小统计对象（显式 score，全部四个统计值齐全）。
 */
function statsShape(score, killed, survived, total) {
  return { score, killed, survived, total };
}

/**
 * --help 输出用法、子命令与旗标说明，退出码 0（VAL-BASELINE-010）。
 */
function caseHelp(base) {
  const dir = makeCaseDir(base, 'help');
  const cli = runCli(['--help'], dir);
  assertCase(cli.status === 0, `--help 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(/usage/i.test(cli.stdout), `--help 输出应含用法说明，实际：${cli.stdout}`);
  for (const token of ['init', 'check', 'update', '--input', '--output', '--lang']) {
    assertCase(cli.stdout.includes(token), `--help 输出应说明 ${token}，实际：${cli.stdout}`);
  }
  return dir;
}

/**
 * 缺少子命令时清晰报错并给出用法，退出码 1。
 */
function caseNoSubcommand(base) {
  const dir = makeCaseDir(base, 'no-subcommand');
  const cli = runCli([], dir);
  assertCase(cli.status === 1, `缺子命令退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('init') && cli.stderr.includes('check') && cli.stderr.includes('update'),
    `缺子命令报错应列出 init/check/update，实际：${cli.stderr}`);
  return dir;
}

/**
 * 未知子命令清晰报错，退出码 1。
 */
function caseInvalidSubcommand(base) {
  const dir = makeCaseDir(base, 'invalid-subcommand');
  const cli = runCli(['frobnicate'], dir);
  assertCase(cli.status === 1, `未知子命令退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('frobnicate'), `报错应含未知子命令名，实际：${cli.stderr}`);
  return dir;
}

/**
 * init 缺 --input 时退出码非 0 且 stderr 含用法文本（VAL-BASELINE-004）。
 */
function caseInitMissingInput(base) {
  const dir = makeCaseDir(base, 'init-missing-input');
  const cli = runCli(['init'], dir);
  assertCase(cli.status !== 0, `init 缺 --input 退出码应非 0，实际 ${cli.status}`);
  assertCase(/usage/i.test(cli.stderr), `stderr 应含用法文本，实际：${cli.stderr}`);
  assertCase(cli.stderr.includes('--input'), `stderr 应提及 --input，实际：${cli.stderr}`);
  assertCase(!fs.existsSync(path.join(dir, '.mutation-baseline.json')), '失败时不应写出基线文件');
  return dir;
}

/**
 * init 输入文件不存在时退出码 1 且 stderr 含 file-not-found（VAL-BASELINE-002）。
 */
function caseInitInputNotFound(base) {
  const dir = makeCaseDir(base, 'init-input-not-found');
  const missing = path.join(dir, 'nonexistent.json');
  const cli = runCli(['init', '--input', missing], dir);
  assertCase(cli.status === 1, `输入缺失退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('not found'), `stderr 应含 not found，实际：${cli.stderr}`);
  assertCase(cli.stderr.includes('nonexistent.json'), `stderr 应含文件路径，实际：${cli.stderr}`);
  return dir;
}

/**
 * init 输入是畸形 JSON 时退出码 1 且 stderr 含解析错误（VAL-BASELINE-003）。
 */
function caseInitMalformedJson(base) {
  const dir = makeCaseDir(base, 'init-malformed-json');
  const input = writeText(dir, 'malformed.json', '{ this is not json ]');
  const cli = runCli(['init', '--input', input], dir);
  assertCase(cli.status === 1, `畸形 JSON 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/parse|JSON/i.test(cli.stderr), `stderr 应含 JSON 解析错误，实际：${cli.stderr}`);
  return dir;
}

/**
 * init 从 Stryker 变异体数组创建基线：分数按检出口径计算（VAL-BASELINE-001）。
 * 40 killed / 54 survived / total 94 → score = 42.55，对齐格式契约 §7.1 示例。
 */
function caseInitStrykerArray(base) {
  const dir = makeCaseDir(base, 'init-stryker-array');
  const statuses = [...Array(40).fill('Killed'), ...Array(54).fill('Survived')];
  const input = writeJson(dir, 'report.json', strykerResults(statuses));
  const cli = runCli(['init', '--input', input], dir);
  assertCase(cli.status === 0, `init 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const file = readBaseline(dir);
  assertCase(file.version === '1.0', `version 应为 1.0，实际 ${file.version}`);
  assertCase(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(file.updated), `updated 应为 ISO-8601 UTC，实际 ${file.updated}`);
  assertCase(file.baseline.score === 42.55, `score 应为 42.55，实际 ${file.baseline.score}`);
  assertCase(file.baseline.killed === 40, `killed 应为 40，实际 ${file.baseline.killed}`);
  assertCase(file.baseline.survived === 54, `survived 应为 54，实际 ${file.baseline.survived}`);
  assertCase(file.baseline.total === 94, `total 应为 94，实际 ${file.baseline.total}`);
  return dir;
}

/**
 * init 支持 Stryker schema 报告（{files} 形态），且报告显式分数优先于计算、原样保留。
 */
function caseInitStrykerSchema(base) {
  const dir = makeCaseDir(base, 'init-stryker-schema');
  const statuses = [...Array(40).fill('Killed'), ...Array(54).fill('Survived')];
  const input = writeJson(dir, 'report.json', {
    schemaVersion: '1.3',
    mutationScore: 87.654321,
    files: { 'src/app.ts': { source: 'x', mutants: strykerResults(statuses) } }
  });
  const cli = runCli(['init', '--input', input], dir);
  assertCase(cli.status === 0, `init 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const file = readBaseline(dir);
  assertCase(file.baseline.score === 87.654321, `显式分数应原样保留 87.654321，实际 ${file.baseline.score}`);
  assertCase(file.baseline.killed === 40 && file.baseline.survived === 54 && file.baseline.total === 94,
    `计数应来自 files 汇总，实际 ${JSON.stringify(file.baseline)}`);
  return dir;
}

/**
 * init 支持最小统计对象 {score, killed, survived, total}。
 */
function caseInitStatsShape(base) {
  const dir = makeCaseDir(base, 'init-stats-shape');
  const input = writeJson(dir, 'report.json', statsShape(42.55, 40, 54, 94));
  const cli = runCli(['init', '--input', input, '--lang', 'py'], dir);
  assertCase(cli.status === 0, `init 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const file = readBaseline(dir);
  assertCase(file.baseline.score === 42.55, `score 应为 42.55，实际 ${file.baseline.score}`);
  assertCase(file.baseline.total === 94, `total 应为 94，实际 ${file.baseline.total}`);
  return dir;
}

/**
 * score 87.654321 原样保留小数精度，不取整不截断（VAL-BASELINE-012）。
 */
function caseInitPrecisionPreserved(base) {
  const dir = makeCaseDir(base, 'init-precision');
  const input = writeJson(dir, 'report.json', statsShape(87.654321, 87, 13, 100));
  const cli = runCli(['init', '--input', input], dir);
  assertCase(cli.status === 0, `init 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const file = readBaseline(dir);
  assertCase(file.baseline.score === 87.654321, `分数应原样保留 87.654321，实际 ${file.baseline.score}`);
  assertCase(`${file.baseline.score}`.includes('654321'), `序列化应保留小数位，实际 ${file.baseline.score}`);
  return dir;
}

/**
 * 目标位置已有基线时 init 拒绝执行且不覆盖（契约 §5.1）。
 */
function caseInitExistingBaseline(base) {
  const dir = makeCaseDir(base, 'init-existing');
  writeBaselineFixture(dir, 42.55, 40, 54, 94);
  const before = readBaselineRaw(dir);
  const input = writeJson(dir, 'report.json', statsShape(58.51, 55, 39, 94));
  const cli = runCli(['init', '--input', input], dir);
  assertCase(cli.status === 1, `已有基线时 init 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('already exists'), `stderr 应提示已存在，实际：${cli.stderr}`);
  assertCase(cli.stderr.includes('update'), `stderr 应建议改用 update，实际：${cli.stderr}`);
  assertCase(readBaselineRaw(dir) === before, 'init 拒绝时不得改写既有基线文件');
  return dir;
}

/**
 * 空变异范围（total=0）不得冻结基线：统计对象与空数组两种输入都拒绝（契约 §3）。
 */
function caseInitEmptyRange(base) {
  const dir = makeCaseDir(base, 'init-empty-range');
  const stats = writeJson(dir, 'stats.json', statsShape(50, 0, 0, 0));
  const cli = runCli(['init', '--input', stats], dir);
  assertCase(cli.status === 1, `total=0 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/empty/i.test(cli.stderr), `stderr 应提示空范围，实际：${cli.stderr}`);
  const empty = writeJson(dir, 'empty.json', []);
  const cli2 = runCli(['init', '--input', empty], dir);
  assertCase(cli2.status === 1, `空数组退出码应为 1，实际 ${cli2.status}: ${cli2.stdout}`);
  assertCase(!fs.existsSync(path.join(dir, '.mutation-baseline.json')), '空范围不得写出基线文件');
  return dir;
}

/**
 * 统计对象字段非法时清晰报错：缺字段、killed+survived>total、score 越界、负数计数。
 */
function caseInitInvalidStats(base) {
  const dir = makeCaseDir(base, 'init-invalid-stats');
  const missing = writeJson(dir, 'missing-total.json', { score: 42.55, killed: 40, survived: 54 });
  const cli = runCli(['init', '--input', missing], dir);
  assertCase(cli.status === 1, `缺字段退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  const crossed = writeJson(dir, 'crossed.json', statsShape(42.55, 40, 54, 90));
  const cli2 = runCli(['init', '--input', crossed], dir);
  assertCase(cli2.status === 1, `killed+survived>total 退出码应为 1，实际 ${cli2.status}: ${cli2.stdout}`);
  assertCase(cli2.stderr.includes('total'), `报错应提及 total，实际：${cli2.stderr}`);
  const outOfRange = writeJson(dir, 'range.json', statsShape(120, 0, 0, 1));
  const cli3 = runCli(['init', '--input', outOfRange], dir);
  assertCase(cli3.status === 1, `score 越界退出码应为 1，实际 ${cli3.status}: ${cli3.stdout}`);
  assertCase(cli3.stderr.includes('120'), `报错应含越界分数，实际：${cli3.stderr}`);
  const negative = writeJson(dir, 'negative.json', statsShape(42.55, -1, 54, 94));
  const cli4 = runCli(['init', '--input', negative], dir);
  assertCase(cli4.status === 1, `负数计数退出码应为 1，实际 ${cli4.status}: ${cli4.stdout}`);
  return dir;
}

/**
 * check：分数高于基线与持平均通过，退出码 0 且 stdout 给出比较结果（VAL-BASELINE-005）。
 */
function caseCheckPass(base) {
  const dir = makeCaseDir(base, 'check-pass');
  writeBaselineFixture(dir, 42.55, 40, 54, 94);
  const better = writeJson(dir, 'better.json', statsShape(58.51, 55, 39, 94));
  const cli = runCli(['check', '--input', better], dir);
  assertCase(cli.status === 0, `分数提高时 check 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(cli.stdout.includes('58.51') && cli.stdout.includes('42.55'),
    `stdout 应给出两个分数，实际：${cli.stdout}`);
  const equal = writeJson(dir, 'equal.json', statsShape(42.55, 40, 54, 94));
  const cli2 = runCli(['check', '--input', equal], dir);
  assertCase(cli2.status === 0, `持平时 check 退出码应为 0，实际 ${cli2.status}: ${cli2.stderr}`);
  return dir;
}

/**
 * check 比较带浮点容差：current 距基线不足 1e-9 视为持平（契约 §4）。
 */
function caseCheckFloatTolerance(base) {
  const dir = makeCaseDir(base, 'check-tolerance');
  writeBaselineFixture(dir, 87.654321, 87, 13, 100);
  const near = writeJson(dir, 'near.json', statsShape(87.6543209995, 87, 13, 100));
  const cli = runCli(['check', '--input', near], dir);
  assertCase(cli.status === 0, `容差内 check 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(/unchanged/i.test(cli.stdout), `stdout 应提示持平，实际：${cli.stdout}`);
  return dir;
}

/**
 * check：回归时退出码 2，stdout 给出分数差，stderr 写明两分数（VAL-BASELINE-006）。
 */
function caseCheckRegression(base) {
  const dir = makeCaseDir(base, 'check-regression');
  writeBaselineFixture(dir, 58.51, 55, 39, 94);
  const worse = writeJson(dir, 'worse.json', statsShape(42.55, 40, 54, 94));
  const cli = runCli(['check', '--input', worse], dir);
  assertCase(cli.status === 2, `回归时 check 退出码应为 2，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stdout.includes('42.55') && cli.stdout.includes('58.51'),
    `stdout 应含回归前后分数，实际：${cli.stdout}`);
  assertCase(cli.stderr.includes('42.55') && cli.stderr.includes('58.51'),
    `stderr 应写明两个分数，实际：${cli.stderr}`);
  return dir;
}

/**
 * check：基线文件不存在时退出码 1 并提示先 init（VAL-BASELINE-007）。
 */
function caseCheckMissingBaseline(base) {
  const dir = makeCaseDir(base, 'check-missing-baseline');
  const input = writeJson(dir, 'report.json', statsShape(42.55, 40, 54, 94));
  const cli = runCli(['check', '--input', input], dir);
  assertCase(cli.status === 1, `基线缺失退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('not found'), `stderr 应含 baseline-not-found，实际：${cli.stderr}`);
  assertCase(cli.stderr.includes('init'), `stderr 应提示先 init，实际：${cli.stderr}`);
  return dir;
}

/**
 * check：基线 JSON 非法、版本未知、字段越界均为用户错误，退出码 1（契约 §5.2）。
 */
function caseCheckMalformedBaseline(base) {
  const dir = makeCaseDir(base, 'check-malformed-baseline');
  const input = writeJson(dir, 'report.json', statsShape(42.55, 40, 54, 94));
  writeText(dir, '.mutation-baseline.json', '){broken json');
  const cli = runCli(['check', '--input', input], dir);
  assertCase(cli.status === 1, `畸形基线退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/baseline|parse|JSON/i.test(cli.stderr), `stderr 应指认基线文件，实际：${cli.stderr}`);
  const dir2 = makeCaseDir(base, 'check-unknown-version');
  writeBaselineFixture(dir2, 42.55, 40, 54, 94);
  const file2 = readBaseline(dir2);
  file2.version = '9.9';
  fs.writeFileSync(path.join(dir2, '.mutation-baseline.json'), JSON.stringify(file2, null, 2));
  const cli2 = runCli(['check', '--input', input], dir2);
  assertCase(cli2.status === 1, `未知版本退出码应为 1，实际 ${cli2.status}: ${cli2.stdout}`);
  assertCase(cli2.stderr.includes('version'), `报错应提及 version，实际：${cli2.stderr}`);
  const dir3 = makeCaseDir(base, 'check-out-of-range');
  writeBaselineFixture(dir3, 150, 0, 0, 1);
  const cli3 = runCli(['check', '--input', input], dir3);
  assertCase(cli3.status === 1, `基线 score 越界退出码应为 1，实际 ${cli3.status}: ${cli3.stdout}`);
  return dir;
}

/**
 * update：分数提高时重写全部统计值并刷新 updated（VAL-BASELINE-008，契约 §5.3）。
 */
function caseUpdateRaise(base) {
  const dir = makeCaseDir(base, 'update-raise');
  writeBaselineFixture(dir, 42.55, 40, 54, 94);
  const input = writeJson(dir, 'report.json', statsShape(58.51, 55, 39, 94));
  const cli = runCli(['update', '--input', input], dir);
  assertCase(cli.status === 0, `上调退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const file = readBaseline(dir);
  assertCase(file.baseline.score === 58.51, `score 应更新为 58.51，实际 ${file.baseline.score}`);
  assertCase(file.baseline.killed === 55 && file.baseline.survived === 39 && file.baseline.total === 94,
    `四个统计值应全部来自本次运行，实际 ${JSON.stringify(file.baseline)}`);
  assertCase(file.updated !== '2020-01-01T00:00:00Z', `updated 应被刷新，实际 ${file.updated}`);
  return dir;
}

/**
 * update：持平时 no-op，文件逐字节保持原样、updated 不刷新（契约 §5.3）。
 */
function caseUpdateNoChange(base) {
  const dir = makeCaseDir(base, 'update-no-change');
  writeBaselineFixture(dir, 58.51, 55, 39, 94);
  const before = readBaselineRaw(dir);
  const input = writeJson(dir, 'report.json', statsShape(58.51, 55, 39, 94));
  const cli = runCli(['update', '--input', input], dir);
  assertCase(cli.status === 0, `持平 update 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(readBaselineRaw(dir) === before, '持平 update 不得改写基线文件（含 updated）');
  return dir;
}

/**
 * update：分数回落时拒绝下调，文件保持原样，退出码 2（契约 §5.3 棘轮）。
 */
function caseUpdateDecline(base) {
  const dir = makeCaseDir(base, 'update-decline');
  writeBaselineFixture(dir, 58.51, 55, 39, 94);
  const before = readBaselineRaw(dir);
  const input = writeJson(dir, 'report.json', statsShape(42.55, 40, 54, 94));
  const cli = runCli(['update', '--input', input], dir);
  assertCase(cli.status === 2, `拒绝下调退出码应为 2，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/refus/i.test(cli.stderr), `stderr 应写明拒绝原因，实际：${cli.stderr}`);
  assertCase(readBaselineRaw(dir) === before, '拒绝下调时不得改写基线文件');
  return dir;
}

/**
 * update：基线不存在时创建基线（VAL-BASELINE-009）。
 */
function caseUpdateCreatesWhenMissing(base) {
  const dir = makeCaseDir(base, 'update-creates');
  const input = writeJson(dir, 'report.json', statsShape(42.55, 40, 54, 94));
  const cli = runCli(['update', '--input', input], dir);
  assertCase(cli.status === 0, `无基线 update 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const file = readBaseline(dir);
  assertCase(file.baseline.score === 42.55, `应创建含正确分数的基线，实际 ${JSON.stringify(file.baseline)}`);
  return dir;
}

/**
 * update：输入报告缺失时先报输入错误，退出码 1。
 */
function caseUpdateMissingInputFile(base) {
  const dir = makeCaseDir(base, 'update-missing-input');
  const cli = runCli(['update', '--input', path.join(dir, 'nope.json')], dir);
  assertCase(cli.status === 1, `输入缺失退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('not found'), `stderr 应含 not found，实际：${cli.stderr}`);
  return dir;
}

/**
 * init 支持 mutmut 结果导出（数组类别），分数按检出口径计算（--lang py）。
 * killed 3 + timeout 1 检出，total 7 → score = 57.14。
 */
function caseMutmutExportInit(base) {
  const dir = makeCaseDir(base, 'mutmut-export');
  const input = writeJson(dir, 'results.json', mutmutExport({
    killed: ['m1', 'm2', 'm3'],
    survived: ['m4', 'm5'],
    timeout: ['m6'],
    suspicious: ['m7']
  }));
  const cli = runCli(['init', '--input', input, '--lang', 'py'], dir);
  assertCase(cli.status === 0, `mutmut 导出 init 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const file = readBaseline(dir);
  assertCase(file.baseline.killed === 3, `killed 应为 3，实际 ${file.baseline.killed}`);
  assertCase(file.baseline.survived === 2, `survived 应为 2，实际 ${file.baseline.survived}`);
  assertCase(file.baseline.total === 7, `total 应为 7，实际 ${file.baseline.total}`);
  assertCase(file.baseline.score === 57.14, `score 应为 57.14，实际 ${file.baseline.score}`);
  return dir;
}

/**
 * 不支持的语言清晰报错并列出 ts/py，退出码 1。
 */
function caseLangInvalid(base) {
  const dir = makeCaseDir(base, 'lang-invalid');
  const input = writeJson(dir, 'report.json', statsShape(42.55, 40, 54, 94));
  const cli = runCli(['init', '--input', input, '--lang', 'ruby'], dir);
  assertCase(cli.status === 1, `非法语言退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('ruby'), `报错应含非法语言名，实际：${cli.stderr}`);
  assertCase(cli.stderr.includes('ts') && cli.stderr.includes('py'), `报错应列出 ts 与 py，实际：${cli.stderr}`);
  return dir;
}

/**
 * 语言别名 typescript/python/js 归一到 ts/py。
 */
function caseLangAlias(base) {
  const dir = makeCaseDir(base, 'lang-alias');
  const statuses = [...Array(40).fill('Killed'), ...Array(54).fill('Survived')];
  const stryker = writeJson(dir, 'stryker.json', strykerResults(statuses));
  const cli = runCli(['init', '--input', stryker, '--lang', 'typescript'], dir);
  assertCase(cli.status === 0, `typescript 别名退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const dir2 = makeCaseDir(base, 'lang-alias-js');
  const cli2 = runCli(['init', '--input', stryker, '--lang', 'js'], dir2);
  assertCase(cli2.status === 0, `js 别名退出码应为 0，实际 ${cli2.status}: ${cli2.stderr}`);
  const dir3 = makeCaseDir(base, 'lang-alias-python');
  const exportInput = writeJson(dir3, 'results.json', mutmutExport({ killed: ['a'], survived: ['b'] }));
  const cli3 = runCli(['init', '--input', exportInput, '--lang', 'python'], dir3);
  assertCase(cli3.status === 0, `python 别名退出码应为 0，实际 ${cli3.status}: ${cli3.stderr}`);
  return dir;
}

/**
 * --lang 与报告形态不匹配时清晰报错，退出码 1。
 */
function caseLangForceMismatch(base) {
  const dir = makeCaseDir(base, 'lang-mismatch');
  const statuses = [...Array(40).fill('Killed'), ...Array(54).fill('Survived')];
  const stryker = writeJson(dir, 'stryker.json', strykerResults(statuses));
  const cli = runCli(['init', '--input', stryker, '--lang', 'py'], dir);
  assertCase(cli.status === 1, `lang=py 读 Stryker 数组退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('not recognized'), `stderr 应提示格式不识别，实际：${cli.stderr}`);
  const dir2 = makeCaseDir(base, 'lang-mismatch-ts');
  const exportInput = writeJson(dir2, 'results.json', mutmutExport({ killed: ['a'], survived: ['b'] }));
  const cli2 = runCli(['init', '--input', exportInput, '--lang', 'ts'], dir2);
  assertCase(cli2.status === 1, `lang=ts 读 mutmut 导出退出码应为 1，实际 ${cli2.status}: ${cli2.stdout}`);
  return dir;
}

/**
 * 未提供 --lang 时按报告内容自动检测：Stryker、mutmut 导出与统计对象均可识别。
 */
function caseAutoDetect(base) {
  const dir = makeCaseDir(base, 'auto-detect');
  const statuses = [...Array(40).fill('Killed'), ...Array(54).fill('Survived')];
  const stryker = writeJson(dir, 'stryker.json', strykerResults(statuses));
  const cli = runCli(['init', '--input', stryker], dir);
  assertCase(cli.status === 0, `Stryker 自动检测退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(readBaseline(dir).baseline.total === 94, 'Stryker 自动检测应正确计数');
  const dir2 = makeCaseDir(base, 'auto-detect-mutmut');
  const exportInput = writeJson(dir2, 'results.json', mutmutExport({ killed: ['a'], survived: ['b'] }));
  const cli2 = runCli(['init', '--input', exportInput], dir2);
  assertCase(cli2.status === 0, `mutmut 自动检测退出码应为 0，实际 ${cli2.status}: ${cli2.stderr}`);
  assertCase(readBaseline(dir2).baseline.total === 2, 'mutmut 自动检测应正确计数');
  const dir3 = makeCaseDir(base, 'auto-detect-stats');
  const stats = writeJson(dir3, 'stats.json', statsShape(42.55, 40, 54, 94));
  const cli3 = runCli(['init', '--input', stats], dir3);
  assertCase(cli3.status === 0, `统计对象自动检测退出码应为 0，实际 ${cli3.status}: ${cli3.stderr}`);
  return dir;
}

/**
 * --output 指定写出路径；默认位置的文件不应被创建（契约 §5，参数主要供测试使用）。
 */
function caseOutputFlag(base) {
  const dir = makeCaseDir(base, 'output-flag');
  const input = writeJson(dir, 'report.json', statsShape(42.55, 40, 54, 94));
  const target = path.join(dir, 'my-baseline.json');
  const cli = runCli(['init', '--input', input, '--output', target], dir);
  assertCase(cli.status === 0, `--output init 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(fs.existsSync(target), `应写到 --output 指定路径，实际缺失 ${target}`);
  assertCase(!fs.existsSync(path.join(dir, '.mutation-baseline.json')), '指定 --output 时不应写默认位置');
  assertCase(readBaseline(dir, 'my-baseline.json').baseline.score === 42.55, '自定义路径内容应正确');
  return dir;
}

/**
 * 基线文件物理格式：恰好三个顶层字段、baseline 恰好四字段、2 空格缩进、
 * LF 换行、结尾一个换行符、无 BOM（契约 §1/§2/§6，VAL-BASELINE-011）。
 */
function caseBaselineFileFormat(base) {
  const dir = makeCaseDir(base, 'baseline-format');
  const input = writeJson(dir, 'report.json', statsShape(42.55, 40, 54, 94));
  const cli = runCli(['init', '--input', input], dir);
  assertCase(cli.status === 0, `init 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const raw = readBaselineRaw(dir);
  assertCase(!raw.startsWith('\uFEFF'), '基线文件不应带 BOM');
  assertCase(raw.endsWith('\n') && !raw.endsWith('\n\n'), '基线文件应以恰好一个换行符结尾');
  assertCase(!raw.includes('\r'), '基线文件应使用 LF 换行');
  assertCase(raw.includes('\n  "updated"'), '基线文件应使用 2 空格缩进');
  const file = JSON.parse(raw);
  assertCase(Object.keys(file).join(',') === 'version,updated,baseline',
    `顶层字段应为 version/updated/baseline，实际 ${Object.keys(file).join(',')}`);
  assertCase(Object.keys(file.baseline).join(',') === 'score,killed,survived,total',
    `baseline 字段应为 score/killed/survived/total，实际 ${Object.keys(file.baseline).join(',')}`);
  assertCase(typeof file.updated === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(file.updated),
    `updated 应为 YYYY-MM-DDTHH:MM:SSZ，实际 ${file.updated}`);
  return dir;
}

/**
 * Stryker 状态计数口径：Timeout 计入检出，score = round2((killed+timeout)/total*100)。
 */
function caseComputedScoreWithTimeouts(base) {
  const dir = makeCaseDir(base, 'computed-timeouts');
  const statuses = [
    ...Array(5).fill('Killed'),
    ...Array(2).fill('Timeout'),
    ...Array(3).fill('Survived')
  ];
  const input = writeJson(dir, 'report.json', strykerResults(statuses));
  const cli = runCli(['init', '--input', input], dir);
  assertCase(cli.status === 0, `init 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const file = readBaseline(dir);
  assertCase(file.baseline.killed === 5 && file.baseline.survived === 3 && file.baseline.total === 10,
    `计数应为 5/3/10，实际 ${JSON.stringify(file.baseline)}`);
  assertCase(file.baseline.score === 70, `score 应为 70（Timeout 计入检出），实际 ${file.baseline.score}`);
  return dir;
}

/**
 * 依次跑全部用例，全过时向 stdout 写一行摘要。
 */
function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'test-mutation-baseline-'));
  const cases = [
    caseHelp,
    caseNoSubcommand,
    caseInvalidSubcommand,
    caseInitMissingInput,
    caseInitInputNotFound,
    caseInitMalformedJson,
    caseInitStrykerArray,
    caseInitStrykerSchema,
    caseInitStatsShape,
    caseInitPrecisionPreserved,
    caseInitExistingBaseline,
    caseInitEmptyRange,
    caseInitInvalidStats,
    caseCheckPass,
    caseCheckFloatTolerance,
    caseCheckRegression,
    caseCheckMissingBaseline,
    caseCheckMalformedBaseline,
    caseUpdateRaise,
    caseUpdateNoChange,
    caseUpdateDecline,
    caseUpdateCreatesWhenMissing,
    caseUpdateMissingInputFile,
    caseMutmutExportInit,
    caseLangInvalid,
    caseLangAlias,
    caseLangForceMismatch,
    caseAutoDetect,
    caseOutputFlag,
    caseBaselineFileFormat,
    caseComputedScoreWithTimeouts
  ];
  try {
    cases.forEach((runCase) => runCase(base));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  process.stdout.write(`test_mutation_baseline: PASS cases=${cases.length}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`test_mutation_baseline: FAIL ${err.message}\n`);
  process.exit(1);
}
