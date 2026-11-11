/**
 * scripts/test_check_doc_pairs.mjs
 *
 * 文档关系检查器 P4 的断言驱动回归（仿 test_check_commit_msg.mjs 模式）。
 * 在系统临时目录搭一个最小仓库夹具：复制检查器和声明文件
 * docs/agents/doc-pairs.md，再写入夹具用的登记册与追加日志，
 * 以子进程运行夹具里的检查器，校验 P4 一行的状态与证据，不修改本仓库。
 * 覆盖 #117 的改动：P4 同时检查 docs/ARTIFACTS.md 与 docs/ARTIFACTS-log.md。
 *
 * 夹具不提供其余编号的输入，所以整份报告必然 FAIL、退出码必然是 1。
 * 本套件只断言 P4 一行，不覆盖「全部通过时退出码 0」这条路径。
 *
 * 用法: node scripts/test_check_doc_pairs.mjs
 * 全过退出码 0；任一断言失败退出码 1。由 scripts/run_tests.mjs 汇总运行，PR 与 main 上经 .github/workflows/tests.yml 执行。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CHECKER_REL = 'scripts/check_doc_pairs.mjs';
const DECLARATION_REL = 'docs/agents/doc-pairs.md';
const REGISTER_REL = 'docs/ARTIFACTS.md';
const LOG_REL = 'docs/ARTIFACTS-log.md';

/**
 * 断言条件成立，失败时抛出带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 在夹具根下写入文本文件，自动建父目录。
 */
function writeText(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

/**
 * 为单个用例搭夹具：检查器、声明文件，以及登记册与日志都会链接到的目标文件。
 * files 是「相对路径 → 内容」，值为 null 表示不创建该文件。
 */
function makeFixture(base, name, files) {
  const root = path.join(base, name);
  for (const rel of [CHECKER_REL, DECLARATION_REL]) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, rel), dest);
  }
  writeText(root, 'docs/target.md', '目标文件\n');
  for (const [rel, content] of Object.entries(files)) {
    if (content !== null) {
      writeText(root, rel, content);
    }
  }
  return root;
}

/**
 * 运行夹具里的检查器，返回退出码、摘要里的 P4 行和 JSON 报告里的 P4 条目。
 */
function runP4(root, scene) {
  const cli = spawnSync(process.execPath, [path.join(root, CHECKER_REL)], {
    encoding: 'utf8',
    windowsHide: true,
    cwd: root
  });
  const jsonStart = cli.stdout.indexOf('\n\n{');
  assertCase(jsonStart !== -1, `${scene}：输出里应有 JSON 报告，实际：${cli.stdout}${cli.stderr}`);
  const report = JSON.parse(cli.stdout.slice(jsonStart));
  const row = report.pairs.find((pair) => pair.id === 'P4');
  assertCase(Boolean(row), `${scene}：报告里应有 P4 一行`);
  const summaryLine = cli.stdout
    .slice(0, jsonStart)
    .split('\n')
    .find((line) => line.trim().startsWith('P4 '));
  return { exitCode: cli.status, row, summaryLine: (summaryLine || '').trim() };
}

/**
 * 断言 P4 失败时的共同结论：状态 FAIL，进程退出码非 0。
 */
function assertP4Fail(result, scene) {
  assertCase(result.row.status === 'FAIL', `${scene}：P4 应为 FAIL，实际 ${result.row.status}`);
  assertCase(result.exitCode === 1, `${scene}：退出码应为 1，实际 ${result.exitCode}`);
}

/**
 * 登记册和日志的链接都有效：P4 通过，两份文件分别计数。
 */
function caseBothValid(base) {
  const scene = '两份文件链接都有效';
  const root = makeFixture(base, 'both-valid', {
    [REGISTER_REL]: '[目标](target.md)\n',
    [LOG_REL]: '[目标](target.md)\n\n[声明](agents/doc-pairs.md)\n'
  });
  const result = runP4(root, scene);
  assertCase(result.row.status === 'PASS', `${scene}：P4 应为 PASS，实际 ${JSON.stringify(result.row)}`);
  assertCase(
    result.summaryLine === 'P4 PASS register=1 log=2 failures=0',
    `${scene}：摘要行不符，实际「${result.summaryLine}」`
  );
}

/**
 * 日志里有指向不存在文件的链接：P4 失败，失败记在日志名下。
 */
function caseLogMissingTarget(base) {
  const scene = '日志链接目标不存在';
  const root = makeFixture(base, 'log-missing-target', {
    [REGISTER_REL]: '[目标](target.md)\n',
    [LOG_REL]: '[目标](target.md)\n\n[没有这个文件](gone.md)\n'
  });
  const result = runP4(root, scene);
  assertP4Fail(result, scene);
  const { register, log } = result.row.evidence;
  assertCase(register.failures.length === 0, `${scene}：登记册不应有失败`);
  assertCase(
    log.failures.length === 1 && log.failures[0].reason === 'missing',
    `${scene}：日志应有 1 条 missing，实际 ${JSON.stringify(log.failures)}`
  );
  assertCase(
    result.summaryLine === 'P4 FAIL register=1 log=2 failures=1',
    `${scene}：摘要行不符，实际「${result.summaryLine}」`
  );
}

/**
 * 日志里有指向空文件的链接：P4 失败，原因是 empty-file。
 */
function caseLogEmptyTarget(base) {
  const scene = '日志链接目标是空文件';
  const root = makeFixture(base, 'log-empty-target', {
    [REGISTER_REL]: '[目标](target.md)\n',
    [LOG_REL]: '[空文件](empty.md)\n',
    'docs/empty.md': ''
  });
  const result = runP4(root, scene);
  assertP4Fail(result, scene);
  const { log } = result.row.evidence;
  assertCase(
    log.failures.length === 1 && log.failures[0].reason === 'empty-file',
    `${scene}：日志应有 1 条 empty-file，实际 ${JSON.stringify(log.failures)}`
  );
}

/**
 * 日志文件不存在：P4 失败并带读文件的错误，不因登记册有效而通过。
 */
function caseLogFileAbsent(base) {
  const scene = '日志文件不存在';
  const root = makeFixture(base, 'log-absent', {
    [REGISTER_REL]: '[目标](target.md)\n',
    [LOG_REL]: null
  });
  const result = runP4(root, scene);
  assertP4Fail(result, scene);
  const { error } = result.row.evidence;
  assertCase(
    typeof error === 'string' && error.includes('ARTIFACTS-log.md'),
    `${scene}：证据应带读日志失败的错误，实际 ${JSON.stringify(result.row.evidence)}`
  );
}

/**
 * 登记册里有坏链接、日志有效：P4 仍然失败，失败记在登记册名下。
 */
function caseRegisterMissingTarget(base) {
  const scene = '登记册链接目标不存在';
  const root = makeFixture(base, 'register-missing-target', {
    [REGISTER_REL]: '[没有这个文件](gone.md)\n',
    [LOG_REL]: '[目标](target.md)\n'
  });
  const result = runP4(root, scene);
  assertP4Fail(result, scene);
  const { register, log } = result.row.evidence;
  assertCase(
    register.failures.length === 1 && register.failures[0].reason === 'missing',
    `${scene}：登记册应有 1 条 missing，实际 ${JSON.stringify(register.failures)}`
  );
  assertCase(log.failures.length === 0, `${scene}：日志不应有失败`);
}

/**
 * 入口：依次跑全部用例，最后清理临时目录。
 */
function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-doc-pairs-'));
  const cases = [
    caseBothValid,
    caseLogMissingTarget,
    caseLogEmptyTarget,
    caseLogFileAbsent,
    caseRegisterMissingTarget
  ];
  try {
    cases.forEach((runCase) => runCase(base));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  process.stdout.write(`test_check_doc_pairs: PASS cases=${cases.length}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`test_check_doc_pairs: FAIL ${err.message}\n`);
  process.exit(1);
}
