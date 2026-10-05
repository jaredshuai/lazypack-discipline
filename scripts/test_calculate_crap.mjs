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
  const cli = runCli(['--help'], dir);
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
  const cli = runCli([], dir);
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
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ruby'], dir);
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
  const cli = runCli(['--coverage', missing, '--complexity', complexity, '--lang', 'ts'], dir);
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
  const cli = runCli(['--coverage', coverage, '--complexity', missing, '--lang', 'ts'], dir);
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
  const cli = runCli(['--coverage', bad, '--complexity', complexity, '--lang', 'ts'], dir);
  assertCase(cli.status === 1, `坏 JSON 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/json/i.test(cli.stderr), `报错应说明 JSON 解析失败，实际：${cli.stderr}`);
  return dir;
}

/**
 * 复杂度 JSON 语法错误时清晰报解析错误并指明报告名，退出码 1（VAL-CRAP-009）。
 */
function caseMalformedComplexity(base) {
  const dir = makeCaseDir(base, 'malformed-complexity');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'foo', pct: 100 }]));
  const bad = path.join(dir, 'complexity.json');
  fs.writeFileSync(bad, '{ reports: [nope');
  const cli = runCli(['--coverage', coverage, '--complexity', bad, '--lang', 'ts'], dir);
  assertCase(cli.status === 1, `坏复杂度 JSON 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  assertCase(/json/i.test(cli.stderr), `报错应说明 JSON 解析失败，实际：${cli.stderr}`);
  assertCase(/complexity/i.test(cli.stderr), `报错应指明是复杂度报告，实际：${cli.stderr}`);
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
  const passing = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts', '--threshold', '30'], dir);
  assertCase(passing.status === 0, `阈值 30 退出码应为 0，实际 ${passing.status}: ${passing.stderr}`);
  const passParts = splitOutput(passing.stdout);
  assertCase(passParts.json.ok === true, '阈值 30 时 ok 应为 true');
  assertCase(passParts.json.violations.length === 0, '阈值 30 时不应有违规');
  assertCase(passParts.text.includes('violations=0'), `文本摘要应含 violations=0，实际：${passParts.text}`);
  assertCase(passParts.text.includes('No CRAP violations found'), `无违规应提示 No CRAP violations found，实际：${passParts.text}`);

  const failing = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts', '--threshold', '6'], dir);
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
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts'], dir);
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
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts'], dir);
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
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts', '--threshold', '50'], dir);
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
 * 常规计算：complexity=5、coverage=80% → CRAP=5²×0.2³+5=5.2。
 * 默认阈值 6 下达标退出 0；阈值 5 时违规且 crap=5.2±0.01。
 */
function caseNormalCalculationTs(base) {
  const dir = makeCaseDir(base, 'normal-calculation-ts');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'normal', pct: 80 }]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'normal', cyclomatic: 5 }]));
  const passing = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts'], dir);
  assertCase(passing.status === 0, `5.2 低于默认阈值 6 应退出 0，实际 ${passing.status}: ${passing.stderr}`);
  const passParts = splitOutput(passing.stdout);
  assertCase(passParts.json.ok === true, '默认阈值下 ok 应为 true');
  assertCase(passParts.json.violations.length === 0, '默认阈值下不应有违规');

  const failing = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts', '--threshold', '5'], dir);
  assertCase(failing.status === 1, `5.2 高于阈值 5 应退出 1，实际 ${failing.status}: ${failing.stderr}`);
  const failParts = splitOutput(failing.stdout);
  assertCase(failParts.json.violations.length === 1, `阈值 5 应恰有 1 条违规，实际：${failing.stdout}`);
  const row = failParts.json.violations[0];
  assertCase(row.function === 'normal', `违规函数应为 normal，实际 ${row.function}`);
  assertCase(Math.abs(row.crap - 5.2) <= 0.01, `CRAP=5²×0.2³+5 应为 5.2±0.01，实际 ${row.crap}`);
  assertCase(row.complexity === 5, `复杂度应为 5，实际 ${row.complexity}`);
  assertCase(Math.abs(row.coverage - 0.8) <= 0.001, `覆盖率应为 0.8，实际 ${row.coverage}`);
  return dir;
}

/**
 * 阈值 6 过滤：全覆盖 complexity=7 → CRAP=7 应入选违规，
 * complexity=3 → CRAP=3 应被排除。
 */
function caseThresholdSixViolation(base) {
  const dir = makeCaseDir(base, 'threshold-six');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([
    { name: 'seven', pct: 100, file: 'src/seven.js' },
    { name: 'three', pct: 100, file: 'src/three.js' }
  ]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([
    { name: 'seven', cyclomatic: 7 },
    { name: 'three', cyclomatic: 3 }
  ]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts', '--threshold', '6'], dir);
  assertCase(cli.status === 1, `CRAP=7≥6 应退出 1，实际 ${cli.status}: ${cli.stdout}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.violations.length === 1, `应只有 seven 入选违规，实际：${cli.stdout}`);
  const row = parts.json.violations[0];
  assertCase(row.function === 'seven', `违规函数应为 seven，实际 ${row.function}`);
  assertCase(row.crap === 7, `全覆盖 CRAP 应等于复杂度 7，实际 ${row.crap}`);
  assertCase(!parts.json.violations.some((item) => item.function === 'three'), 'CRAP=3<6 不应入选违规');
  return dir;
}

/**
 * Python 解析器：pytest-cov + radon 夹具（VAL-CRAP-005），
 * --lang python 与 --lang py 均应走同一解析逻辑。
 */
function casePythonParser(base) {
  const dir = makeCaseDir(base, 'python-parser');
  const coverage = writeJson(dir, 'coverage.json', pytestCovCoverage('src/mod.py', {
    alpha: { covered_lines: 0, total_lines: 10 },
    beta: { covered_lines: 0, total_lines: 10 },
    gamma: { covered_lines: 0, total_lines: 10 }
  }));
  const complexity = writeJson(dir, 'complexity.json', radonComplexity('src/mod.py', [
    { name: 'alpha', complexity: 3, type: 'function' },
    {
      name: 'Klass',
      complexity: 2,
      type: 'class',
      methods: [{ name: 'beta', complexity: 4, type: 'method' }],
      closures: [{ name: 'gamma', complexity: 3, type: 'closure' }]
    }
  ]));
  const longForm = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'python'], dir);
  assertCase(longForm.status === 1, `python 语言退出码应为 1，实际 ${longForm.status}: ${longForm.stdout}`);
  const parts = splitOutput(longForm.stdout);
  assertCase(parts.json.violations.length === 3, `应有 alpha/beta/gamma 三条违规，实际：${longForm.stdout}`);
  const names = parts.json.violations.map((row) => row.function).sort();
  assertCase(
    JSON.stringify(names) === JSON.stringify(['alpha', 'beta', 'gamma']),
    `违规应为 alpha(12)/beta(20)/gamma(12)，类块与闭包都应展开，实际 ${JSON.stringify(names)}`
  );
  const alpha = parts.json.violations.find((row) => row.function === 'alpha');
  assertCase(alpha.crap === 12, `alpha CRAP=3²×1+3 应为 12，实际 ${alpha.crap}`);
  assertCase(alpha.file === 'src/mod.py', `违规文件应为 radon 路径键，实际 ${alpha.file}`);
  const beta = parts.json.violations.find((row) => row.function === 'beta');
  assertCase(beta.crap === 20, `类方法 beta CRAP=4²×1+4 应为 20，实际 ${beta.crap}`);

  const shortForm = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'py'], dir);
  assertCase(shortForm.status === 1, `py 别名退出码应为 1，实际 ${shortForm.status}: ${shortForm.stdout}`);
  return dir;
}

/**
 * c8/V8 原始数组格式（[{ url, functions: [{ functionName, ranges }] }]）应可解析，
 * ranges[0].count>0 视为全覆盖、否则零覆盖（VAL-CRAP-021）。
 */
function caseC8V8RawCoverage(base) {
  const dir = makeCaseDir(base, 'c8-v8-raw');
  const coverage = writeJson(dir, 'coverage.json', [
    {
      url: 'file:///proj/src/raw.js',
      functions: [
        { functionName: 'uncovered', ranges: [{ startOffset: 0, endOffset: 12, count: 0 }] },
        { functionName: 'covered', ranges: [{ startOffset: 20, endOffset: 40, count: 5 }] }
      ]
    }
  ]);
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([
    { name: 'uncovered', cyclomatic: 5 },
    { name: 'covered', cyclomatic: 5 }
  ]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts'], dir);
  assertCase(cli.status === 1, `V8 原始格式退出码应为 1，实际 ${cli.status}: ${cli.stderr}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.violations.length === 1, `应只有 uncovered 违规，实际：${cli.stdout}`);
  const row = parts.json.violations[0];
  assertCase(row.function === 'uncovered', `违规函数应为 uncovered，实际 ${row.function}`);
  assertCase(row.crap === 30, `count=0 的 CRAP=5²×1+5 应为 30，实际 ${row.crap}`);
  assertCase(row.coverage === 0, `count=0 折算覆盖率应为 0，实际 ${row.coverage}`);
  assertCase(row.file === 'file:///proj/src/raw.js', `违规文件应取 url，实际 ${row.file}`);
  return dir;
}

/**
 * c8 --reporter json 的 istanbul 形态（files 对象映射 fnMap/f）应可解析，
 * 函数命中计数 >0 视为全覆盖（VAL-CRAP-021）。
 */
function caseC8IstanbulFiles(base) {
  const dir = makeCaseDir(base, 'c8-istanbul-files');
  const coverage = writeJson(dir, 'coverage.json', {
    total: { functions: { total: 2, covered: 1, pct: 50 } },
    files: {
      'src/istanbul.js': {
        path: 'src/istanbul.js',
        fnMap: { 0: { name: 'hot', decl: {}, loc: {} }, 1: { name: 'cold', decl: {}, loc: {} } },
        f: { 0: 0, 1: 3 }
      }
    }
  });
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([
    { name: 'hot', cyclomatic: 8 },
    { name: 'cold', cyclomatic: 2 }
  ]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts'], dir);
  assertCase(cli.status === 1, `istanbul 形态退出码应为 1，实际 ${cli.status}: ${cli.stderr}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.violations.length === 1, `应只有 hot 违规，实际：${cli.stdout}`);
  const row = parts.json.violations[0];
  assertCase(row.function === 'hot', `违规函数应为 hot，实际 ${row.function}`);
  assertCase(row.crap === 72, `未命中 hot CRAP=8²×1+8 应为 72，实际 ${row.crap}`);
  assertCase(row.coverage === 0, `f=0 折算覆盖率应为 0，实际 ${row.coverage}`);
  assertCase(row.file === 'src/istanbul.js', `违规文件应取 path，实际 ${row.file}`);
  return dir;
}

/**
 * typhonjs-escomplex 的 per-method 结构（reports[].methods）应可解析，
 * 方法行优先于模块 aggregate 参与联表（VAL-CRAP-022）。
 */
function caseEscomplexPerMethod(base) {
  const dir = makeCaseDir(base, 'escomplex-per-method');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([
    { name: 'handleRequest', pct: 50 },
    { name: 'helper', pct: 100 }
  ]));
  const complexity = writeJson(dir, 'complexity.json', {
    reports: [
      {
        filePath: 'src/service.js',
        name: 'service',
        aggregate: { cyclomatic: 3 },
        methods: [
          { name: 'handleRequest', cyclomatic: 9 },
          { name: 'helper', cyclomatic: 2 }
        ]
      }
    ]
  });
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts'], dir);
  assertCase(cli.status === 1, `per-method 结构退出码应为 1，实际 ${cli.status}: ${cli.stderr}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.violations.length === 1, `应只有 handleRequest 违规，实际：${cli.stdout}`);
  const row = parts.json.violations[0];
  assertCase(row.function === 'handleRequest', `违规函数应为 handleRequest，实际 ${row.function}`);
  assertCase(row.complexity === 9, `复杂度应取方法行 9，实际 ${row.complexity}`);
  assertCase(Math.abs(row.crap - 19.13) <= 0.01, `CRAP=9²×0.5³+9 应为 19.13±0.01，实际 ${row.crap}`);
  assertCase(row.file === 'src/service.js', `违规文件应取 filePath，实际 ${row.file}`);
  return dir;
}

/**
 * pytest-cov 真实形态：函数键带行号后缀，覆盖率取 summary 内的
 * covered_lines/num_statements 或 covered_lines/missing_lines（VAL-CRAP-023）。
 */
function casePytestSummary(base) {
  const dir = makeCaseDir(base, 'pytest-summary');
  const coverage = writeJson(dir, 'coverage.json', {
    files: {
      'src/app.py': {
        summary: { percent_covered: 25.0 },
        functions: {
          'run_report:10': { summary: { covered_lines: 0, num_statements: 8 } },
          'tiny:20': { summary: { covered_lines: 4, missing_lines: 4 } }
        }
      }
    }
  });
  const complexity = writeJson(dir, 'complexity.json', radonComplexity('src/app.py', [
    { name: 'run_report', type: 'function', complexity: 8 },
    { name: 'tiny', type: 'function', complexity: 1 }
  ]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'python'], dir);
  assertCase(cli.status === 1, `pytest-cov summary 形态退出码应为 1，实际 ${cli.status}: ${cli.stderr}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.violations.length === 1, `应只有 run_report 违规，实际：${cli.stdout}`);
  const row = parts.json.violations[0];
  assertCase(row.function === 'run_report', `函数键应去掉行号后缀，实际 ${row.function}`);
  assertCase(row.crap === 72, `run_report CRAP=8²×1+8 应为 72，实际 ${row.crap}`);
  assertCase(row.coverage === 0, `covered_lines=0/num_statements=8 折算应为 0，实际 ${row.coverage}`);
  return dir;
}

/**
 * 复杂度边界：complexity=0 无论覆盖率如何 CRAP=0 不违规；
 * complexity>100 部分覆盖也会产出超大 CRAP 并违规。
 */
function caseComplexityEdge(base) {
  const dir = makeCaseDir(base, 'complexity-edge');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([
    { name: 'zero', pct: 0 },
    { name: 'big', pct: 50 }
  ]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([
    { name: 'zero', cyclomatic: 0 },
    { name: 'big', cyclomatic: 120 }
  ]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts'], dir);
  assertCase(cli.status === 1, `complexity>100 应违规退出 1，实际 ${cli.status}: ${cli.stdout}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.violations.length === 1, `应只有 big 违规（zero 的 CRAP=0 不入选），实际：${cli.stdout}`);
  const row = parts.json.violations[0];
  assertCase(row.function === 'big', `违规函数应为 big，实际 ${row.function}`);
  const expected = 120 * 120 * Math.pow(0.5, 3) + 120;
  assertCase(Math.abs(row.crap - expected) <= 0.01, `big CRAP 应为 ${expected}±0.01，实际 ${row.crap}`);
  assertCase(!parts.json.violations.some((item) => item.function === 'zero'), 'complexity=0 的函数不应违规');
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
  ], dir);
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
 * 未指定 --output 时应在当前目录落盘 crap-report.json（VAL-CRAP-026）。
 */
function caseDefaultOutputFile(base) {
  const dir = makeCaseDir(base, 'default-output-file');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([{ name: 'hot', pct: 0, file: 'src/hot.js' }]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([{ name: 'hot', cyclomatic: 8 }]));
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'ts'], dir);
  assertCase(cli.status === 1, `有违规退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
  const defaultPath = path.join(dir, 'crap-report.json');
  assertCase(fs.existsSync(defaultPath), '未指定 --output 时应在当前目录创建 crap-report.json');
  const written = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  const parts = splitOutput(cli.stdout);
  assertCase(
    typeof written.ok === 'boolean' && typeof written.threshold === 'number' && Array.isArray(written.violations),
    `默认落盘报告应含 ok/threshold/violations，实际：${defaultPath}`
  );
  assertCase(
    JSON.stringify(written.violations) === JSON.stringify(parts.json.violations),
    '默认落盘 JSON 违规应与 stdout 报告一致'
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
  const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', 'typescript'], dir);
  assertCase(cli.status === 0, `typescript 别名退出码应为 0，实际 ${cli.status}: ${cli.stdout}`);
  const parts = splitOutput(cli.stdout);
  assertCase(parts.json.ok === true, 'typescript 别名应正常解析 c8/escomplex 夹具');
  return dir;
}

/**
 * javascript 与 js 别名应与 ts 等价（VAL-CRAP-005），解析 c8/escomplex 夹具成功
 * 且 CRAP 计算正确（VAL-TEST-006）；仅不支持的语言才报 unsupported language。
 */
function caseJavascriptAlias(base) {
  const dir = makeCaseDir(base, 'javascript-alias');
  const coverage = writeJson(dir, 'coverage.json', c8Coverage([
    { name: 'clean', pct: 100 },
    { name: 'parseTokens', pct: 60, file: 'src/parse.js' }
  ]));
  const complexity = writeJson(dir, 'complexity.json', escomplexReport([
    { name: 'clean', cyclomatic: 2 },
    { name: 'parseTokens', cyclomatic: 10 }
  ]));
  for (const lang of ['javascript', 'js']) {
    const cli = runCli(['--coverage', coverage, '--complexity', complexity, '--lang', lang], dir);
    assertCase(cli.status === 1, `${lang} 别名有违规时退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
    assertCase(
      !cli.stderr.includes('unsupported language'),
      `${lang} 别名不应报 unsupported language，实际：${cli.stderr}`
    );
    const parts = splitOutput(cli.stdout);
    assertCase(parts.json.ok === false, `${lang} 别名应正常解析 c8/escomplex 夹具并上报违规`);
    assertCase(
      parts.json.violations.length === 1,
      `${lang} 别名应恰有 1 条违规，实际：${parts.json.violations.length}`
    );
    const row = parts.json.violations[0];
    assertCase(row.function === 'parseTokens', `${lang} 别名违规函数应为 parseTokens，实际 ${row.function}`);
    assertCase(Math.abs(row.crap - 16.4) <= 0.01, `${lang} 别名 CRAP 应为 16.4±0.01，实际 ${row.crap}`);
    assertCase(row.complexity === 10, `${lang} 别名复杂度应为 10，实际 ${row.complexity}`);
    assertCase(Math.abs(row.coverage - 0.6) <= 0.001, `${lang} 别名覆盖率应为 0.6，实际 ${row.coverage}`);
    assertCase(parts.text.includes('violations=1'), `${lang} 别名文本摘要应含 violations=1，实际：${parts.text}`);
  }
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
    caseMalformedComplexity,
    casePartialCoverageTs,
    caseZeroCoverageTs,
    caseFullCoverageTs,
    caseThresholdFiltering,
    caseNormalCalculationTs,
    caseThresholdSixViolation,
    casePythonParser,
    caseC8V8RawCoverage,
    caseC8IstanbulFiles,
    caseEscomplexPerMethod,
    casePytestSummary,
    caseComplexityEdge,
    caseOutputFile,
    caseDefaultOutputFile,
    caseTypescriptAlias,
    caseJavascriptAlias
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
