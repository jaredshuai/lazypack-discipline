#!/usr/bin/env node
/**
 * scripts/run_tests.mjs
 *
 * 本仓测试的单一入口：依次运行 scripts/test_*.mjs 与 scripts/test_parse_mutmut.py，
 * 汇总每个测试文件的退出码，任一失败则整体退出 1。
 *
 * 用法:
 *   node scripts/run_tests.mjs            运行全部测试
 *   node scripts/run_tests.mjs --fast     跳过需要夹具依赖与网络的集成测试
 *                                         （test_nightly_loop、test_workflow_templates）
 *   node scripts/run_tests.mjs <名字...>  只运行名字中含任一关键字的测试
 *
 * 跳过不算通过：被 --fast 或关键字排除的测试在汇总里列为 SKIP 并写明原因。
 * 各测试内部按平台跳过的用例（如 test_doc_scanner 的 JUNCTION_WINDOWS_ONLY）
 * 由该测试自己的输出说明，本脚本原样转发。
 *
 * Python 命令依次尝试环境变量 LAZYPACK_PYTHON、python、python3。
 * 退出码: 0 = 全部运行的测试通过；1 = 任一测试失败或参数错误。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 需要夹具依赖（TS 夹具 node_modules、Python 夹具 venv）与网络的集成测试。 */
const INTEGRATION = new Set(['test_nightly_loop.mjs', 'test_workflow_templates.mjs']);

function resolvePython() {
  const candidates = [process.env.LAZYPACK_PYTHON, 'python', 'python3'].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (probe.status === 0) {
      return candidate;
    }
  }
  return null;
}

function listTests() {
  return fs.readdirSync(SCRIPTS_DIR)
    .filter((name) => /^test_.+\.(mjs|py)$/.test(name))
    .sort();
}

function parseArgs(argv) {
  const options = { fast: false, filters: [] };
  for (const arg of argv) {
    if (arg === '--fast') {
      options.fast = true;
    } else if (arg === '-h' || arg === '--help') {
      process.stdout.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0] + '*/\n');
      process.exit(0);
    } else if (arg.startsWith('-')) {
      process.stderr.write(`未知参数: ${arg}\n`);
      process.exit(1);
    } else {
      options.filters.push(arg);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const python = resolvePython();
  const rows = [];

  for (const name of listTests()) {
    if (options.filters.length > 0 && !options.filters.some((f) => name.includes(f))) {
      rows.push({ name, status: 'SKIP', detail: '未匹配命令行关键字' });
      continue;
    }
    if (options.fast && INTEGRATION.has(name)) {
      rows.push({ name, status: 'SKIP', detail: '--fast：集成测试，需夹具依赖与网络' });
      continue;
    }
    let command;
    let args;
    if (name.endsWith('.py')) {
      if (!python) {
        rows.push({ name, status: 'FAIL', detail: '找不到 Python（已尝试 LAZYPACK_PYTHON、python、python3）' });
        continue;
      }
      command = python;
      args = [path.join(SCRIPTS_DIR, name)];
    } else {
      command = process.execPath;
      args = [path.join(SCRIPTS_DIR, name)];
    }
    process.stdout.write(`\n=== ${name} ===\n`);
    const started = Date.now();
    const run = spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit', windowsHide: true });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const ok = run.status === 0;
    const reason = run.error ? run.error.message : run.signal ? `signal ${run.signal}` : `exit ${run.status}`;
    rows.push({ name, status: ok ? 'PASS' : 'FAIL', detail: `${reason}，${seconds}s` });
  }

  process.stdout.write('\n=== 汇总 ===\n');
  for (const row of rows) {
    process.stdout.write(`${row.status.padEnd(4)}  ${row.name}  (${row.detail})\n`);
  }
  const count = (status) => rows.filter((row) => row.status === status).length;
  process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped\n`);
  process.exit(count('FAIL') > 0 ? 1 : 0);
}

main();
