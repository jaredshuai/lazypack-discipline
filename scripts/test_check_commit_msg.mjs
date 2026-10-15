/**
 * scripts/test_check_commit_msg.mjs
 *
 * 提交说明格式检查器的断言驱动回归（仿 test_calculate_crap.mjs 模式）。
 * 在系统临时目录生成消息文件与 --rules 夹具，以子进程方式调用
 * check_commit_msg.mjs，校验状态字面量与退出码，不修改本仓库。
 * 覆盖 §5.1 节子条款词表定位（issue #75）：固定层 0.7.0 把 type
 * 词表挪到 `5.1.1` 行后，默认模式必须仍能抽出词表。
 * 用法: node scripts/test_check_commit_msg.mjs
 * 全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI = path.join(__dirname, 'check_commit_msg.mjs');

/**
 * 断言条件成立，失败时抛出带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 以子进程运行检查器，返回 status/stdout/stderr。
 */
function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd
  });
}

/**
 * 断言一次运行的状态字面量与退出码。
 */
function assertStatus(cli, status, exitCode, scene) {
  assertCase(
    cli.status === exitCode,
    `${scene}：退出码应为 ${exitCode}，实际 ${cli.status}: ${cli.stdout}${cli.stderr}`
  );
  assertCase(
    cli.stdout.includes(`check_commit_msg: ${status}`),
    `${scene}：摘要应报 ${status}，实际：${cli.stdout}`
  );
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
 * 写入文本夹具，返回文件路径。
 */
function writeText(dir, name, text) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

/**
 * 默认模式（真实 docs/DECISIONS.md）：词表在 5.1.1 行，fix 应格式通过。
 */
function caseDefaultFormatPassFix(base) {
  const dir = makeCaseDir(base, 'default-fix');
  const msg = writeText(dir, 'msg.txt', 'fix(setup): x\n');
  const cli = runCli([msg], dir);
  assertStatus(cli, 'format-pass', 0, '默认 fix(setup)');
}

/**
 * 默认模式：chore 是词表内 type，应格式通过。
 */
function caseDefaultFormatPassChore(base) {
  const dir = makeCaseDir(base, 'default-chore');
  const msg = writeText(dir, 'msg.txt', 'chore: x\n');
  const cli = runCli([msg], dir);
  assertStatus(cli, 'format-pass', 0, '默认 chore');
}

/**
 * 默认模式：wip 不在词表中，应 format-fail。
 */
function caseDefaultFormatFailWip(base) {
  const dir = makeCaseDir(base, 'default-wip');
  const msg = writeText(dir, 'msg.txt', 'wip: temp\n');
  const cli = runCli([msg], dir);
  assertStatus(cli, 'format-fail', 1, '默认 wip');
}

/**
 * 默认模式：缺冒号的标题应 format-fail。
 */
function caseDefaultFormatFailNoColon(base) {
  const dir = makeCaseDir(base, 'default-nocolon');
  const msg = writeText(dir, 'msg.txt', 'fix bug\n');
  const cli = runCli([msg], dir);
  assertStatus(cli, 'format-fail', 1, '默认 fix bug');
}

/**
 * 消息文件缺失：not-run，此时不读规则文件。
 */
function caseMissingMessageFile(base) {
  const dir = makeCaseDir(base, 'missing-msg');
  const cli = runCli([path.join(dir, 'no-such-file.txt')], dir);
  assertStatus(cli, 'not-run', 2, '缺失消息文件');
}

/**
 * --rules 夹具用词表仍在 `5.1 ` 行的旧布局，抽取须向后兼容。
 */
function caseRulesLegacyLine(base) {
  const dir = makeCaseDir(base, 'rules-legacy');
  const msg = writeText(dir, 'msg.txt', 'fix: x\n');
  const rules = writeText(dir, 'rules.md', '5.1 提交头：type 用 2 个（`fix feat`）。\n');
  const cli = runCli([msg, '--rules', rules], dir);
  assertStatus(cli, 'format-pass', 0, 'rules 旧布局');
}

/**
 * --rules 夹具用现行布局：`5.1` 为脚注行、`5.1.1` 为词表行，抽取须命中子条款。
 */
function caseRulesCurrentLayout(base) {
  const dir = makeCaseDir(base, 'rules-current');
  const msg = writeText(dir, 'msg.txt', 'fix: x\n');
  const rules = writeText(
    dir,
    'rules.md',
    '5.1 脚注用 `Refs #n` 关联 issue，用 `Closes #n` 关闭 issue。\n'
      + '5.1.1 提交头：Conventional Commits 1.0.0，`type(scope)!: 描述`。type 用 2 个（`fix feat`）。\n'
  );
  const cli = runCli([msg, '--rules', rules], dir);
  assertStatus(cli, 'format-pass', 0, 'rules 现行布局');
}

/**
 * --rules 夹具没有任何带计数词表的行：exec-failed，原因写明数量为 0。
 */
function caseRulesNoVocabLine(base) {
  const dir = makeCaseDir(base, 'rules-novocab');
  const msg = writeText(dir, 'msg.txt', 'fix: x\n');
  const rules = writeText(dir, 'rules.md', '5.1 脚注用语义说明。\n');
  const cli = runCli([msg, '--rules', rules], dir);
  assertStatus(cli, 'exec-failed', 3, 'rules 无词表行');
  assertCase(
    /数量为 0/.test(cli.stdout),
    `rules 无词表行：原因应写明数量为 0，实际：${cli.stdout}`
  );
}

/**
 * --rules 夹具有两行带计数词表（5.1 与 5.1.1）：exec-failed。
 */
function caseRulesTwoVocabLines(base) {
  const dir = makeCaseDir(base, 'rules-twovocab');
  const msg = writeText(dir, 'msg.txt', 'fix: x\n');
  const rules = writeText(
    dir,
    'rules.md',
    '5.1 词表 2 个（`aa bb`）。\n5.1.1 词表 2 个（`fix feat`）。\n'
  );
  const cli = runCli([msg, '--rules', rules], dir);
  assertStatus(cli, 'exec-failed', 3, 'rules 双词表行');
  assertCase(
    /数量为 2/.test(cli.stdout),
    `rules 双词表行：原因应写明数量为 2，实际：${cli.stdout}`
  );
}

/**
 * 入口：依次跑全部用例，最后清理临时目录。
 */
function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-commit-msg-'));
  const cases = [
    caseDefaultFormatPassFix,
    caseDefaultFormatPassChore,
    caseDefaultFormatFailWip,
    caseDefaultFormatFailNoColon,
    caseMissingMessageFile,
    caseRulesLegacyLine,
    caseRulesCurrentLayout,
    caseRulesNoVocabLine,
    caseRulesTwoVocabLines
  ];
  try {
    cases.forEach((runCase) => runCase(base));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  process.stdout.write(`test_check_commit_msg: PASS cases=${cases.length}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`test_check_commit_msg: FAIL ${err.message}\n`);
  process.exit(1);
}
