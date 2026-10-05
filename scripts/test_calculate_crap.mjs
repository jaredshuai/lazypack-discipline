/**
 * scripts/test_calculate_crap.mjs
 *
 * CRAP 计算器断言驱动回归（仿 handoff_bom_classify_repro.js 模式）。
 * 在系统临时目录生成夹具，以子进程方式调用 calculate_crap.mjs，
 * 校验文本摘要、JSON 报告与退出码，不修改本仓库。
 * 用法: node scripts/test_calculate_crap.mjs
 * 全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI = path.join(__dirname, 'calculate_crap.mjs');

/**
 * 断言条件成立，失败时抛出带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 以子进程运行 CRAP 计算器，返回 status/stdout/stderr。
 */
function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true
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
 * 为单个用例准备独立子目录。
 */
function makeCaseDir(base, name) {
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 把 stdout 切成文本摘要与 JSON 报告两段（check_doc_pairs.mjs 输出模式）。
 */
function splitOutput(stdout) {
  const jsonStart = stdout.indexOf('{');
  assertCase(jsonStart > 0, `stdout 应先有文本摘要再有 JSON，实际：${JSON.stringify(stdout)}`);
  return {
    text: stdout.slice(0, jsonStart),
    json: JSON.parse(stdout.slice(jsonStart))
  };
}

/**
 * 构造简化 c8 覆盖率夹具（架构约定 { functions: [{ name, pct }] }）。
 */
function c8Coverage(entries) {
  return { functions: entries };
}

/**
 * 构造简化 typhonjs-escomplex 夹具（架构约定 { reports: [{ name, cyclomatic }] }）。
 */
function escomplexReport(reports) {
  return { reports };
}

/**
 * 构造 pytest-cov 风格覆盖率夹具（架构约定 files 路径映射函数行数）。
 */
function pytestCovCoverage(file, functions) {
  return { files: { [file]: { functions } } };
}

/**
 * 构造 radon cc -j 风格复杂度夹具（架构约定 路径映射模块块数组）。
 */
function radonComplexity(file, blocks) {
  return { [file]: blocks };
}

/**
 * --help 输出用法与全部旗标说明，退出码 0（VAL-CRAP-001）。
 */
function caseHelp(base) {
  const dir = makeCaseDir(base, 'help');
  const cli = runCli(['--help']);
  assertCase(cli.status === 0, `--help 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  for (const flag of ['--coverage', '--complexity', '--threshold', '--lang', '--output']) {
    assertCase(cli.stdout.includes(flag), `--help 输出应说明 ${flag}，实际：${cli.stdout}`);
  }
  assertCase(/usage/i.test(cli.stdout), `--help 输出应含用法说明，实际：${cli.stdout}`);
  return dir;
}

/**
 * 缺少必填参数时清晰报错，退出码 1。
 */
function caseMissingArgs(base) {
  const dir = makeCaseDir(base, 'missing-args');
  const cli = runCli([]);
  assertCase(cli.status === 1, `缺参退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(
    cli.stderr.includes('--coverage') && cli.stderr.includes('--complexity'),
    `缺参报错应提及 --coverage 与 --complexity，实际：${cli.stderr}`
  );
  return dir;
}

/**
 * 不支持的语言清晰报错并列出支持项，退出码 1（VAL-CRAP-010 相关）。
 */
function caseInvalidLang(base) {
  const dir = makeCaseDir(base, 'invalid-lang');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'foo', pct: 100 }]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'foo', cyclomatic: 2 }]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ruby']);
  assertCase(cli.status === 1, `非法语言退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(cli.stderr.includes('ruby'), `报错应含非法语言名，实际：${cli.stderr}`);
  for (const lang of ['typescript', 'javascript', 'python']) {
    assertCase(cli.stderr.includes(lang), `报错应列出支持语言 ${lang}，实际：${cli.stderr}`);
  }
  return dir;
}

/**
 * 覆盖率文件不存在时清晰报 not found，退出码 1（VAL-CRAP-006）。
 */
function caseMissingCoverageFile(base) {
  const dir = makeCaseDir(base, 'missing-coverage');
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'foo', cyclomatic: 2 }]));
  const missing = path.join(dir, 'nonexistent.json');
  const cli = runCli(['--coverage', missing, '--complexity', complexity, '--lang', 'ts']);
  assertCase(cli.status === 1, `缺覆盖率文件退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/not found/i.test(cli.stderr), `报错应说明文件未找到，实际：${cli.stderr}`);
  assertCase(cli.stderr.includes(missing), `报错应含缺失路径，实际：${cli.stderr}`);
  return dir;
}

/**
 * 复杂度文件不存在时清晰报 not found，退出码 1（VAL-CRAP-007 相关）。
 */
function caseMissingComplexityFile(base) {
  const dir = makeCaseDir(base, 'missing-complexity');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'foo', pct: 100 }]));
  const missing = path.join(dir, 'nonexistent.json');
  const cli = runCli(['--coverage', coverage, '--complexity', missing, '--lang', 'ts']);
  assertCase(cli.status === 1, `缺复杂度文件退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/not found/i.test(cli.stderr), `报错应说明文件未找到，实际：${cli.stderr}`);
  return dir;
}

/**
 * 覆盖率 JSON 语法错误时清晰报解析错误，退出码 1（VAL-CRAP-008 相关）。
 */
function caseMalformedCoverage(base) {
  const dir = makeCaseDir(base, 'malformed-coverage');
  const bad = path.join(dir, 'coverage.json');
  fs.writeFileSync(bad, '{ functions: [oops');
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'foo', cyclomatic: 2 }]));
  const cli = runCli(['--coverage', bad, '--complexity', complexity, '--lang', 'ts']);
  assertCase(cli.status === 1, `坏 JSON 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/json/i.test(cli.stderr), `报错应说明 JSON 解析失败，实际：${cli.stderr}`);
  return dir;
}

/**
 * 部分覆盖：complexity=10、coverage=60% → CRAP=16.4（±0.01，VAL-CRAP-013）。
 * 阈值 30 时无违规退出 0；阈值 6 时违规清单含该函数退出 1。
 */
function casePartialCoverageTs(base) {
  const dir = makeCaseDir(base, 'partial-coverage-ts');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'parseTokens', pct: 60 }]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'parseTokens', cyclomatic: 10 }]));
  const passing = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts', '--threshold', '30']);
  assertCase(passing.status === 0, `阈值 30 退出码应为 0，实际 ${passing.status}: ${passing.stderr}`);
  const passParts = splitOutput(passing.stdout);
  assertCase(passParts.json.ok === true, '阈值 30 时 ok 应为 true');
  assertCase(passParts.json.violations.length === 0, '阈值 30 时不应有违规');
  assertCase(passParts.text.includes('violations=0'), `文本摘要应含 violations=0，实际：${passParts.text}`);
  assertCase(passParts.text.includes('No CRAP violations found'), `无违规应提示 No CRAP violations found，实际：${passParts.text}`);

  const failing = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts', '--threshold', '6']);
  assertCase(failing.status === 1, `阈值 6 退出码应为 1，实际 ${failing.status}: ${failing.stderr}`);
  const failParts = splitOutput(failing.stdout);
  assertCase(failParts.json.violations.length === 1, `阈值 6 应恰有 1 条违规，实际：${failing.stdout}`);
  const row = failParts.json.violations[0];
  assertCase(row.function === 'parseTokens', `违规函数应为 parseTokens，实际 ${row.function}`);
  assertCase(Math.abs(row.crap - 16.4) <= 0.01, `CRAP 应为 16.4±0.01，实际 ${row.crap}`);
  assertCase(row.complexity === 10, `复杂度应为 10，实际 ${row.complexity}`);
  assertCase(Math.abs(row.coverage - 0.6) <= 0.001, `覆盖率应为 0.6，实际 ${row.coverage}`);
  return dir;
}

/**
 * 零覆盖边界：complexity=5、coverage=0% → CRAP=30（VAL-CRAP-012）。
 * 默认阈值下违规，退出码 1，文本列出违规明细（VAL-CRAP-020）。
 */
function caseZeroCoverageTs(base) {
  const dir = makeCaseDir(base, 'zero-coverage-ts');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'risky', pct: 0, file: 'src/risky.js' }]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'risky', cyclomatic: 5 }]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts']);
  assertCase(cli.status === 1, `零覆盖退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.ok === false, '有违规时 ok 应为 false');
  assertCase(parts.json.violations.length === 1, '应恰有 1 条违规');
  const row = parts.json.violations[0];
  assertCase(row.crap === 30, `零覆盖 CRAP 应为 30，实际 ${row.crap}`);
  assertCase(row.file === 'src/risky.js', `违规应带文件路径，实际 ${row.file}`);
  assertCase(parts.text.includes('violations=1'), `文本摘要应含 violations=1，实际：${parts.text}`);
  assertCase(parts.text.includes('risky'), `文本应列出违规函数名，实际：${parts.text}`);
  assertCase(parts.json.violations.length === 1, 'JSON 违规数应与文本摘要一致');
  return dir;
}

/**
 * 全覆盖边界：coverage=100% → CRAP=复杂度（VAL-CRAP-011）。
 * 含 complexity=1 的极小函数；默认阈值 6 下全部达标退出 0。
 */
function caseFullCoverageTs(base) {
  const dir = makeCaseDir(base, 'full-coverage-ts');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([
    { name: 'clean', pct: 100 },
    { name: 'tiny', pct: 100 }
  ]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([
    { name: 'clean', cyclomatic: 5 },
    { name: 'tiny', cyclomatic: 1 }
  ]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts']);
  assertCase(cli.status === 0, `全覆盖退出码应为 0，实际 ${cli.status}: ${cli.stdout}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.threshold === 6, `默认阈值应为 6，实际 ${parts.json.threshold}`);
  assertCase(parts.text.includes('threshold=6'), `文本摘要应含 threshold=6，实际：${parts.text}`);
  assertCase(parts.json.violations.length === 0, '全覆盖不应有违规');
  return dir;
}

/**
 * 阈值过滤：--threshold 50 时仅 CRAP≥50 的函数入选，
 * 恰好等于阈值的函数应被上报（VAL-CRAP-004）。
 */
function caseThresholdFiltering(base) {
  const dir = makeCaseDir(base, 'threshold-filtering');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([
    { name: 'hot', pct: 0, file: 'src/hot.js' },
    { name: 'calm', pct: 100, file: 'src/calm.js' },
    { name: 'edge', pct: 100, file: 'src/edge.js' }
  ]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([
    { name: 'hot', cyclomatic: 8 },
    { name: 'calm', cyclomatic: 7 },
    { name: 'edge', cyclomatic: 50 }
  ]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts', '--threshold', '50']);
  assertCase(cli.status === 1, `有违规退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  const parts = splitOutput(cli.stdout);
  const names = parts.json.violations.map((row) => row.function).sort();
  assertCase(
    JSON.stringify(names) === JSON.stringify(['edge', 'hot']),
    `应上报 hot(72) 与 edge(50) 且排除 calm(7)，实际 ${JSON.stringify(names)}`
  );
  for (const row of parts.json.violations) {
    assertCase(row.crap >= 50, `违规 CRAP 应≥阈值 50，实际 ${row.crap}`);
  }
  const edge = parts.json.violations.find((row) => row.function === 'edge');
  assertCase(edge.crap === 50, `恰在阈值的函数 CRAP 应为 50，实际 ${edge.crap}`);
  return dir;
}

/**
 * Python 解析器：pytest-cov + radon 夹具（VAL-CRAP-005），
 * --lang python 与 --lang py 均应走同一解析逻辑。
 */
function casePythonParser(base) {
  const dir = makeCaseDir(base, 'python-parser');
  const coverage = writeJson(dir, 'coverage.json', pytestCovCoverage('src/mod.py', {
    alpha: { covered_lines: 0, total_lines: 10 }
  }));
  const complexity = writeJson(dir, 'complexity.json', radonComplexity('src/mod.py', [
    { name: 'alpha', complexity: 3, type: 'function' }
  ]));
  const longForm = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'python']);
  assertCase(longForm.status === 1, `python 语言退出码应为 1，实际 ${longForm.status}: ${longForm.stdout}`);
  const parts = splitOutput(longForm.stdout);
  assertCase(parts.json.violations.length === 1, `应恰有 1 条违规，实际：${longForm.stdout}`);
  const row = parts.json.violations[0];
  assertCase(row.function === 'alpha', `违规函数应为 alpha，实际 ${row.function}`);
  assertCase(row.crap === 12, `CRAP=3²×1+3 应为 12，实际 ${row.crap}`);
  assertCase(row.file === 'src/mod.py', `违规文件应为 radon 路径键，实际 ${row.file}`);

  const shortForm = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'py']);
  assertCase(shortForm.status === 1, `py 别名退出码应为 1，实际 ${shortForm.status}: ${shortForm.stdout}`);
  return dir;
}

/**
 * --output 落盘：JSON 报告写入指定路径且与 stdout 一致（VAL-CRAP-016 相关）。
 */
function caseOutputFile(base) {
  const dir = makeCaseDir(base, 'output-file');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'hot', pct: 0, file: 'src/hot.js' }]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'hot', cyclomatic: 8 }]));
  const outPath = path.join(dir, 'results.json');
  const cli = runCli([
    '--coverage', coverage,
    '--complexity', complexity,
    '--lang', 'ts',
    '--output', outPath
  ]);
  assertCase(cli.status === 1, `有违规退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(fs.existsSync(outPath), '--output 应在指定路径创建 JSON 文件');
  const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const parts = splitOutput(cli.stdout);
  assertCase(written.ok === false, `落盘报告 ok 应为 false，实际：${outPath}`);
  assertCase(
    JSON.stringify(written.violations) === JSON.stringify(parts.json.violations),
    '落盘 JSON 违规应与 stdout 报告一致'
  );
  return dir;
}

/**
 * typescript 全名别名应与 ts 等价（VAL-CRAP-005）。
 */
function caseTypescriptAlias(base) {
  const dir = makeCaseDir(base, 'typescript-alias');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'foo', pct: 100 }]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'foo', cyclomatic: 2 }]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'typescript']);
  assertCase(cli.status === 0, `typescript 别名退出码应为 0，实际 ${cli.status}: ${cli.stdout}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.ok === true, 'typescript 别名应正常解析 c8/escomplex 夹具');
  return dir;
}

/**
 * 依次跑全部用例，全过时向 stdout 写一行摘要。
 */
function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'test-calculate-crap-'));
  const cases = [
    caseHelp,
    caseMissingArgs,
    caseInvalidLang,
    caseMissingCoverageFile,
    caseMissingComplexityFile,
    caseMalformedCoverage,
    casePartialCoverageTs,
    caseZeroCoverageTs,
    caseFullCoverageTs,
    caseThresholdFiltering,
    casePythonParser,
    caseOutputFile,
    caseTypescriptAlias
  ];
  try {
    cases.forEach((runCase) => runCase(base));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  process.stdout.write(`test_calculate_crap: PASS cases=${cases.length}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`test_calculate_crap: FAIL ${err.message}\n`);
  process.exit(1);
}
