/**
 * scripts/test_create_issues.mjs
 *
 * create-mutation-issues.mjs 断言驱动回归（仿 test_parse_stryker.mjs 模式）。
 * 在系统临时目录生成统一变异体报告与豁免文件夹具，以子进程方式调用
 * create-mutation-issues.mjs，校验队列文件、body 预览、manifest、stdout
 * 摘要与退出码。实跑路径通过 MUTATION_ISSUES_GH 指向临时目录里的假 gh
 * 脚本离线验证（不发任何 GitHub 请求），覆盖标签确保、去重跳过、issue
 * 创建与 gh 失败路径。不修改本仓库，不创建真实 issue。
 * 用法: node scripts/test_create_issues.mjs
 * 全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI = path.join(__dirname, 'create-mutation-issues.mjs');

const REPORT_TS = '2026-10-05T18:30:00Z';

/**
 * 断言条件成立，失败时抛出带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 以子进程运行脚本，返回 status/stdout/stderr。
 * envExtra 合并进当前环境（用于 MUTATION_ISSUES_GH / 假 gh 变量）。
 */
function runCli(args, cwd, envExtra = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd,
    env: { ...process.env, ...envExtra }
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

/**
 * 队列文件路径（与工具的 .mutation-queue/{file}.json 命名一致）。
 */
function queuePath(cwd, file) {
  return path.join(cwd, '.mutation-queue', ...file.split('/')) + '.json';
}

function previewPath(cwd, file) {
  return path.join(cwd, '.mutation-queue', ...file.split('/')) + '.body.md';
}

/* ------------------------------------------------------------------ */
/* 夹具：统一变异体报告（docs/formats/unified-mutation-report.md §7.1） */
/* ------------------------------------------------------------------ */

/**
 * 构造统一格式 mutant（八字段全带）。
 */
function mutant(overrides = {}) {
  return {
    id: 'stryker-42',
    file: 'src/domain/pricing.ts',
    line: 8,
    column: 7,
    mutationType: 'ConditionalExpression',
    original: 'subtotalCents >= 100_00 || isMember',
    mutated: 'subtotalCents > 100_00 || isMember',
    status: 'Survived',
    ...overrides
  };
}

/**
 * 三 mutant 报告：pricing.ts 两个 + cart.ts 一个，全部 Survived。
 */
function validReport() {
  return {
    tool: 'stryker',
    timestamp: REPORT_TS,
    mutants: [
      mutant(),
      mutant({
        id: 'stryker-57',
        line: 15,
        column: 5,
        mutationType: 'ArithmeticOperator',
        original: 'fee += 300',
        mutated: 'fee -= 300'
      }),
      mutant({
        id: 'stryker-63',
        file: 'src/services/cart.ts',
        line: 23,
        column: 12,
        mutationType: 'StringLiteral',
        original: '"empty"',
        mutated: '""'
      })
    ]
  };
}

/**
 * 豁免文件：equiv-001 命中 pricing.ts 第 8 行的 ConditionalExpression。
 */
function exemptionsFile(extra = []) {
  return {
    version: '1.0',
    exemptions: [
      {
        id: 'equiv-001',
        file: 'src/domain/pricing.ts',
        line: 8,
        mutationType: 'ConditionalExpression',
        reason: '构建常量 DEBUG 恒为 true（构建脚本注入），左侧析取支配整体，该边界条件变异在任何输入下不改变条件结果。若 DEBUG 改为运行时可变，本条目须重审。',
        exemptedBy: 'alice',
        exemptedAt: '2026-10-12T10:20:00Z',
        reviewRequired: false
      },
      ...extra
    ]
  };
}

/* ------------------------------------------------------------------ */
/* 假 gh：离线仿真 gh CLI（记录调用 + 按环境变量回放响应）              */
/* ------------------------------------------------------------------ */

const FAKE_GH_SOURCE = [
  "import fs from 'node:fs';",
  'const logPath = process.env.FAKE_GH_LOG;',
  'const argv = process.argv.slice(2);',
  'if (logPath) fs.appendFileSync(logPath, JSON.stringify(argv) + "\\n");',
  'const [cmd, sub] = argv;',
  "if (cmd === 'label' && sub === 'list') {",
  "  const names = JSON.parse(process.env.FAKE_GH_LABELS || '[]');",
  "  process.stdout.write(JSON.stringify(names.map((n) => ({ name: n }))) + '\\n');",
  "} else if (cmd === 'label' && sub === 'create') {",
  "  process.stdout.write('');",
  "} else if (cmd === 'issue' && sub === 'list') {",
  "  const issues = JSON.parse(process.env.FAKE_GH_EXISTING || '[]');",
  "  process.stdout.write(JSON.stringify(issues) + '\\n');",
  "} else if (cmd === 'issue' && sub === 'create') {",
  '  const lines = logPath ? fs.readFileSync(logPath, "utf8").trim().split("\\n") : [];',
  "  const n = 100 + lines.filter((l) => l.includes('[\"issue\",\"create\"')).length;",
  "  process.stdout.write(`https://ghe.example/owner/repo/issues/${n}\\n`);",
  '} else {',
  "  process.stderr.write(`fake gh: unsupported command ${argv.join(' ')}\\n`);",
  '  process.exit(1);',
  '}',
  ''
].join('\n');

/**
 * 在用例目录写假 gh 脚本与日志路径，返回对应环境变量。
 */
function setupFakeGh(dir, { labels = [], existing = [] } = {}) {
  const fakeGh = writeText(dir, 'fake-gh.mjs', FAKE_GH_SOURCE);
  const logPath = path.join(dir, 'gh-log.jsonl');
  return {
    MUTATION_ISSUES_GH: `${process.execPath}|${fakeGh}`,
    FAKE_GH_LOG: logPath,
    FAKE_GH_LABELS: JSON.stringify(labels),
    FAKE_GH_EXISTING: JSON.stringify(existing),
    __logPath: logPath
  };
}

/**
 * 读假 gh 调用日志（每行一个 argv 数组）。
 */
function readGhLog(logPath) {
  const raw = fs.readFileSync(logPath, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/* ------------------------------------------------------------------ */
/* 用例                                                                */
/* ------------------------------------------------------------------ */

/**
 * --help 输出用法、旗标与示例，退出码 0（VAL-ISSUES-018）。
 */
function caseHelp(base) {
  const dir = makeCaseDir(base, 'help');
  const cli = runCli(['--help'], dir);
  assertCase(cli.status === 0, `--help 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(/usage/i.test(cli.stdout), `--help 输出应含用法说明，实际：${cli.stdout}`);
  assertCase(cli.stdout.includes('--input'), '--help 应说明 --input');
  assertCase(cli.stdout.includes('--exemptions'), '--help 应说明 --exemptions');
  assertCase(cli.stdout.includes('--dry-run'), '--help 应说明 --dry-run');
  assertCase(cli.stdout.includes('--output'), '--help 应说明 --output');
  assertCase(cli.stdout.includes('--create-issues'), '--help 应说明 --create-issues');
  assertCase(/example/i.test(cli.stdout), '--help 应含示例，实际：' + cli.stdout.slice(0, 200));
  assertCase(cli.stdout.includes('Exit codes'), '--help 应说明退出码');
}

/**
 * 缺 --input 时退出码 1，stderr 含用法文本。
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
  const cli = runCli(['--input', 'x.json', '--bogus'], dir);
  assertCase(cli.status === 1, `未知旗标退出码应为 1，实际 ${cli.status}`);
  assertCase(cli.stderr.includes('--bogus'), `stderr 应点名未知旗标，实际：${cli.stderr}`);
}

/**
 * 旗标缺值退出码 1。
 */
function caseMissingValue(base) {
  const dir = makeCaseDir(base, 'missing-value');
  const cli = runCli(['--input'], dir);
  assertCase(cli.status === 1, `旗标缺值退出码应为 1，实际 ${cli.status}`);
  assertCase(/missing value/i.test(cli.stderr), `stderr 应提示缺值，实际：${cli.stderr}`);
}

/**
 * 重复旗标退出码 1。
 */
function caseDuplicateOption(base) {
  const dir = makeCaseDir(base, 'duplicate-option');
  const input = writeJson(dir, 'r.json', validReport());
  const cli = runCli(['--input', input, '--input', input], dir);
  assertCase(cli.status === 1, `重复旗标退出码应为 1，实际 ${cli.status}`);
  assertCase(/duplicate/i.test(cli.stderr), `stderr 应提示重复，实际：${cli.stderr}`);
}

/**
 * --input 文件缺失退出码 1。
 */
function caseInputFileMissing(base) {
  const dir = makeCaseDir(base, 'input-missing');
  const cli = runCli(['--input', path.join(dir, 'nope.json')], dir);
  assertCase(cli.status === 1, `输入缺失退出码应为 1，实际 ${cli.status}`);
  assertCase(/not found/i.test(cli.stderr), `stderr 应含 file not found，实际：${cli.stderr}`);
}

/**
 * 畸形 JSON 退出码 1，stderr 含解析错误。
 */
function caseMalformedJson(base) {
  const dir = makeCaseDir(base, 'malformed');
  const input = writeText(dir, 'bad.json', '{ not json');
  const cli = runCli(['--input', input], dir);
  assertCase(cli.status === 1, `畸形 JSON 退出码应为 1，实际 ${cli.status}`);
  assertCase(/parse/i.test(cli.stderr), `stderr 应含解析错误，实际：${cli.stderr}`);
}

/**
 * 统一报告 schema 校验：非法输入逐个拒绝，退出码 1。
 */
function caseReportSchemaRejections(base) {
  const rejections = [
    ['unknown-top-key', { ...validReport(), extra: 1 }, /top-level|unknown/i],
    ['mutants-not-array', { tool: 'stryker', timestamp: REPORT_TS, mutants: {} }, /mutants/i],
    ['bad-tool', { ...validReport(), tool: 'pit' }, /tool/i],
    ['bad-timestamp', { ...validReport(), timestamp: '2026-10-05' }, /timestamp/i],
    [
      'mutant-missing-field',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [
          {
            id: 'stryker-1',
            file: 'a.ts',
            line: 1,
            column: 1,
            mutationType: 'Block',
            original: 'a',
            mutated: 'b'
            // status 缺失
          }
        ]
      },
      /status/i
    ],
    [
      'mutant-extra-field',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [{ ...mutant(), extra: true }]
      },
      /extra|field/i
    ],
    [
      'mutant-bad-enum',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [mutant({ mutationType: 'FooBar' })]
      },
      /mutationType/i
    ],
    [
      'mutant-bad-status',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [mutant({ status: 'Alive' })]
      },
      /status/i
    ],
    [
      'mutant-id-prefix-mismatch',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [mutant({ id: 'mutmut-3' })]
      },
      /id/i
    ],
    [
      'mutant-zero-line',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [mutant({ line: 0 })]
      },
      /line/i
    ],
    [
      'mutant-nonint-column',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [mutant({ column: 1.5 })]
      },
      /column/i
    ],
    [
      'mutant-original-equals-mutated',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [mutant({ mutated: 'subtotalCents >= 100_00 || isMember' })]
      },
      /mutated/i
    ],
    [
      'mutant-empty-original',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [mutant({ original: '' })]
      },
      /original/i
    ],
    [
      'mutant-backslash-path',
      {
        tool: 'stryker',
        timestamp: REPORT_TS,
        mutants: [mutant({ file: 'src\\a.ts' })]
      },
      /file/i
    ],
    ['score-out-of-range', { ...validReport(), score: 120 }, /score/i],
    ['non-object-mutant', { tool: 'stryker', timestamp: REPORT_TS, mutants: ['x'] }, /mutants\[0\]/i]
  ];
  const dir = makeCaseDir(base, 'schema-rejections');
  rejections.forEach(([name, data, pattern]) => {
    const input = writeJson(dir, `${name}.json`, data);
    const cli = runCli(['--input', input], dir);
    assertCase(cli.status === 1, `${name} 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
    assertCase(
      pattern.test(cli.stderr),
      `${name} stderr 应匹配 ${pattern}，实际：${cli.stderr}`
    );
  });
}

/**
 * 有效报告 dry-run：按 file 分组写队列文件与 body 预览，exit 0
 * （VAL-ISSUES-001 / 003 / 015）。
 */
function caseValidDryRun(base) {
  const dir = makeCaseDir(base, 'valid-dry-run');
  const input = writeJson(dir, 'report.json', validReport());
  const cli = runCli(['--input', input, '--dry-run'], dir);
  assertCase(cli.status === 0, `dry-run 退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const pricingQueue = JSON.parse(fs.readFileSync(queuePath(dir, 'src/domain/pricing.ts'), 'utf8'));
  const cartQueue = JSON.parse(fs.readFileSync(queuePath(dir, 'src/services/cart.ts'), 'utf8'));
  assertCase(pricingQueue.version === '1.0', '队列文件 version 应为 1.0');
  assertCase(pricingQueue.file === 'src/domain/pricing.ts', '队列文件 file 应为分组键');
  assertCase(pricingQueue.tool === 'stryker', '队列文件 tool 应复制报告顶层 tool');
  assertCase(pricingQueue.timestamp === REPORT_TS, '队列文件 timestamp 应复制报告顶层 timestamp');
  assertCase(!('issueNumber' in pricingQueue), 'dry-run 队列文件不应含 issueNumber');
  assertCase(pricingQueue.mutants.length === 2, 'pricing 组应有 2 个 mutant');
  assertCase(cartQueue.mutants.length === 1, 'cart 组应有 1 个 mutant');
  const expected = validReport().mutants[0];
  assertCase(
    JSON.stringify(pricingQueue.mutants[0]) === JSON.stringify(expected),
    '队列文件 mutant 应逐字段原样复制统一报告'
  );
  assertCase(
    Object.keys(pricingQueue.mutants[0]).length === 8,
    '队列文件 mutant 应恰八字段'
  );
  assertCase(
    fs.existsSync(previewPath(dir, 'src/domain/pricing.ts')),
    'dry-run 应写 body 预览文件'
  );
}

/**
 * stdout 摘要包含四个计数（VAL-ISSUES-010）。
 */
function caseSummaryCounts(base) {
  const dir = makeCaseDir(base, 'summary');
  const input = writeJson(dir, 'report.json', validReport());
  const cli = runCli(['--input', input, '--dry-run'], dir);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(cli.stdout.includes('total mutants: 3'), `stdout 应含 total mutants，实际：${cli.stdout}`);
  assertCase(cli.stdout.includes('exempted: 0'), `stdout 应含 exempted，实际：${cli.stdout}`);
  assertCase(cli.stdout.includes('issues created: 0'), `stdout 应含 issues created，实际：${cli.stdout}`);
  assertCase(cli.stdout.includes('issues skipped: 0'), `stdout 应含 issues skipped，实际：${cli.stdout}`);
}

/**
 * 豁免过滤：命中的变异体从队列与预览中消失（VAL-ISSUES-002 / 011）。
 */
function caseExemptionFiltering(base) {
  const dir = makeCaseDir(base, 'exemption-filter');
  const input = writeJson(dir, 'report.json', validReport());
  const exemptions = writeJson(dir, '.equivalent-mutants.json', exemptionsFile());
  const cli = runCli(['--input', input, '--exemptions', exemptions, '--dry-run'], dir);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(cli.stdout.includes('exempted: 1'), `stdout 应含 exempted: 1，实际：${cli.stdout}`);
  const pricingQueue = JSON.parse(fs.readFileSync(queuePath(dir, 'src/domain/pricing.ts'), 'utf8'));
  assertCase(pricingQueue.mutants.length === 1, '豁免后 pricing 组应剩 1 个 mutant');
  assertCase(pricingQueue.mutants[0].id === 'stryker-57', '被豁免的 stryker-42 应消失');
  const preview = fs.readFileSync(previewPath(dir, 'src/domain/pricing.ts'), 'utf8');
  assertCase(!preview.includes('stryker-42'), '被豁免的 mutant 不应出现在 body 预览');
  assertCase(preview.includes('stryker-57'), '未豁免的 mutant 应保留在 body 预览');
  // 无 --exemptions 时不做过滤
  const dir2 = makeCaseDir(base, 'exemption-absent');
  const input2 = writeJson(dir2, 'report.json', validReport());
  const cli2 = runCli(['--input', input2, '--dry-run'], dir2);
  assertCase(cli2.status === 0, `无豁免退出码应为 0，实际 ${cli2.status}: ${cli2.stderr}`);
  assertCase(cli2.stdout.includes('exempted: 0'), '无豁免时 exempted 应为 0');
  // 空豁免数组合法
  const dir3 = makeCaseDir(base, 'exemption-empty');
  const input3 = writeJson(dir3, 'report.json', validReport());
  const exemptions3 = writeJson(dir3, 'ex.json', { version: '1.0', exemptions: [] });
  const cli3 = runCli(['--input', input3, '--exemptions', exemptions3, '--dry-run'], dir3);
  assertCase(cli3.status === 0, `空豁免数组退出码应为 0，实际 ${cli3.status}: ${cli3.stderr}`);
  assertCase(cli3.stdout.includes('exempted: 0'), '空豁免数组时 exempted 应为 0');
}

/**
 * --exemptions 文件缺失退出码 1（VAL-ISSUES-012）。
 */
function caseExemptionsFileMissing(base) {
  const dir = makeCaseDir(base, 'exemptions-missing');
  const input = writeJson(dir, 'report.json', validReport());
  const cli = runCli(['--input', input, '--exemptions', path.join(dir, 'nope.json')], dir);
  assertCase(cli.status === 1, `豁免文件缺失退出码应为 1，实际 ${cli.status}`);
  assertCase(/not found/i.test(cli.stderr), `stderr 应含 file not found，实际：${cli.stderr}`);
}

/**
 * 豁免文件畸形 JSON 退出码 1。
 */
function caseExemptionsMalformed(base) {
  const dir = makeCaseDir(base, 'exemptions-malformed');
  const input = writeJson(dir, 'report.json', validReport());
  const exemptions = writeText(dir, 'ex.json', 'nope {');
  const cli = runCli(['--input', input, '--exemptions', exemptions], dir);
  assertCase(cli.status === 1, `豁免畸形 JSON 退出码应为 1，实际 ${cli.status}`);
  assertCase(/parse/i.test(cli.stderr), `stderr 应含解析错误，实际：${cli.stderr}`);
}

/**
 * 豁免文件 schema 校验：非法输入逐个拒绝（VAL-ISSUES-013）。
 */
function caseExemptionsSchemaRejections(base) {
  const good = exemptionsFile().exemptions[0];
  const rejections = [
    ['unknown-version', { version: '2.0', exemptions: [] }, /version/i],
    ['missing-version', { exemptions: [] }, /version/i],
    ['top-level-array', [], /version|exemptions/i],
    ['unknown-top-key', { version: '1.0', exemptions: [], extra: 1 }, /top-level|unknown/i],
    ['entry-missing-field', { version: '1.0', exemptions: [{ ...good, reason: undefined }] }, /reason/i],
    ['entry-extra-field', { version: '1.0', exemptions: [{ ...good, extra: 1 }] }, /extra|field/i],
    ['entry-bad-id', { version: '1.0', exemptions: [{ ...good, id: 'exempt-1' }] }, /id/i],
    ['entry-bad-enum', { version: '1.0', exemptions: [{ ...good, mutationType: 'Foo' }] }, /mutationType/i],
    ['entry-bad-exemptedAt', { version: '1.0', exemptions: [{ ...good, exemptedAt: '2026-10-12' }] }, /exemptedAt/i],
    ['entry-bad-reviewRequired', { version: '1.0', exemptions: [{ ...good, reviewRequired: 'no' }] }, /reviewRequired/i],
    ['entry-empty-reason', { version: '1.0', exemptions: [{ ...good, reason: '' }] }, /reason/i],
    ['entry-zero-line', { version: '1.0', exemptions: [{ ...good, line: 0 }] }, /line/i],
    [
      'duplicate-id',
      { version: '1.0', exemptions: [good, { ...good }] },
      /duplicate|id/i
    ]
  ];
  const dir = makeCaseDir(base, 'exemptions-schema');
  const input = writeJson(dir, 'report.json', validReport());
  rejections.forEach(([name, data, pattern]) => {
    const exemptions = writeJson(dir, `${name}.json`, data);
    const cli = runCli(['--input', input, '--exemptions', exemptions], dir);
    assertCase(cli.status === 1, `${name} 退出码应为 1，实际 ${cli.status}: ${cli.stdout}`);
    assertCase(
      pattern.test(cli.stderr),
      `${name} stderr 应匹配 ${pattern}，实际：${cli.stderr}`
    );
  });
}

/**
 * 失配豁免条目不报错，在摘要与 manifest 里留痕。
 */
function caseStaleExemptionNote(base) {
  const dir = makeCaseDir(base, 'stale-exemption');
  const input = writeJson(dir, 'report.json', validReport());
  const exemptions = writeJson(dir, 'ex.json', {
    version: '1.0',
    exemptions: [
      {
        id: 'equiv-009',
        file: 'src/gone/tree.ts',
        line: 12,
        mutationType: 'OptionalChaining',
        reason: '陈旧条目：目标代码已删除，仅用于验证失配提示。',
        exemptedBy: 'bob',
        exemptedAt: '2026-10-01T09:00:00Z',
        reviewRequired: false
      }
    ]
  });
  const output = path.join(dir, 'manifest.json');
  const cli = runCli(['--input', input, '--exemptions', exemptions, '--dry-run', '--output', output], dir);
  assertCase(cli.status === 0, `失配条目退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(cli.stdout.includes('exempted: 0'), '失配时 exempted 应为 0');
  assertCase(cli.stdout.includes('equiv-009'), `stdout 应提示陈旧条目 id，实际：${cli.stdout}`);
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assertCase(
    JSON.stringify(manifest.staleExemptionIds) === JSON.stringify(['equiv-009']),
    'manifest 应记录陈旧条目 id'
  );
}

/**
 * 空报告合法：exit 0，不建 .mutation-queue、不写任何文件。
 */
function caseEmptyReport(base) {
  const dir = makeCaseDir(base, 'empty-report');
  const input = writeJson(dir, 'report.json', { tool: 'mutmut', timestamp: REPORT_TS, mutants: [] });
  const cli = runCli(['--input', input, '--dry-run'], dir);
  assertCase(cli.status === 0, `空报告退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(!fs.existsSync(path.join(dir, '.mutation-queue')), '空报告不应创建 .mutation-queue');
  assertCase(cli.stdout.includes('total mutants: 0'), '摘要应报 total mutants: 0');
}

/**
 * 全部被豁免：exit 0，不写队列文件。
 */
function caseAllExempted(base) {
  const dir = makeCaseDir(base, 'all-exempted');
  const report = validReport();
  const input = writeJson(dir, 'report.json', report);
  const exemptions = writeJson(dir, 'ex.json', {
    version: '1.0',
    exemptions: report.mutants.map((m, i) => ({
      id: `equiv-00${i + 1}`,
      file: m.file,
      line: m.line,
      mutationType: m.mutationType,
      reason: '演示：全部等价。',
      exemptedBy: 'alice',
      exemptedAt: '2026-10-12T10:20:00Z',
      reviewRequired: false
    }))
  });
  const cli = runCli(['--input', input, '--exemptions', exemptions, '--dry-run'], dir);
  assertCase(cli.status === 0, `全部豁免退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(cli.stdout.includes('exempted: 3'), '摘要应报 exempted: 3');
  assertCase(!fs.existsSync(path.join(dir, '.mutation-queue')), '全部豁免不应写队列文件');
}

/**
 * 非 Survived 变异体按契约过滤并计数。
 */
function caseNonSurvivedDropped(base) {
  const dir = makeCaseDir(base, 'non-survived');
  const input = writeJson(dir, 'report.json', {
    tool: 'mutmut',
    timestamp: REPORT_TS,
    mutants: [
      mutant({ id: 'mutmut-1', file: 'src/a.py', mutationType: 'ComparisonOperator', original: '<=', mutated: '<' }),
      mutant({
        id: 'mutmut-2',
        file: 'src/a.py',
        line: 9,
        column: 5,
        mutationType: 'EqualityOperator',
        original: '==',
        mutated: '!=',
        status: 'Killed'
      }),
      mutant({
        id: 'mutmut-3',
        file: 'src/a.py',
        line: 11,
        column: 5,
        mutationType: 'LogicalOperator',
        original: 'and',
        mutated: 'or',
        status: 'Suspicious'
      })
    ]
  });
  const cli = runCli(['--input', input, '--dry-run'], dir);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  assertCase(cli.stdout.includes('total mutants: 3'), 'total 应为报告原始计数 3');
  assertCase(cli.stdout.includes('non-survived dropped: 2'), `应提示过滤了 2 个非存活者，实际：${cli.stdout}`);
  const queue = JSON.parse(fs.readFileSync(queuePath(dir, 'src/a.py'), 'utf8'));
  assertCase(queue.mutants.length === 1, '队列文件应只含 Survived mutant');
  assertCase(queue.mutants[0].id === 'mutmut-1', 'Killed/Suspicious 不应进队列');
}

/**
 * --output manifest.json：dry-run 下记录计划，不含 issue 编号/URL
 * （VAL-ISSUES-014 的 dry-run 面）。
 */
function caseManifestDryRun(base) {
  const dir = makeCaseDir(base, 'manifest-dry-run');
  const input = writeJson(dir, 'report.json', validReport());
  const output = path.join(dir, 'manifest.json');
  const cli = runCli(['--input', input, '--dry-run', '--output', output], dir);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const raw = fs.readFileSync(output, 'utf8');
  assertCase(!raw.startsWith('\uFEFF'), 'manifest 不应带 BOM');
  assertCase(raw.endsWith('\n') && !raw.includes('\r'), 'manifest 应为 LF 且单尾换行');
  assertCase(raw.includes('\n  "version"'), 'manifest 应为 2 空格缩进');
  const manifest = JSON.parse(raw);
  assertCase(manifest.version === '1.0', 'manifest version 应为 1.0');
  assertCase(manifest.mode === 'dry-run', 'manifest mode 应为 dry-run');
  assertCase(manifest.tool === 'stryker', 'manifest tool 应复制报告');
  assertCase(manifest.timestamp === REPORT_TS, 'manifest timestamp 应复制报告');
  assertCase(
    manifest.summary.totalMutants === 3 &&
      manifest.summary.exempted === 0 &&
      manifest.summary.issuesCreated === 0 &&
      manifest.summary.issuesSkipped === 0,
    'manifest summary 四计数应正确'
  );
  assertCase(Array.isArray(manifest.issues) && manifest.issues.length === 2, 'manifest 应有两个分组条目');
  // 分组按 file 升序：domain < services
  assertCase(manifest.issues[0].file === 'src/domain/pricing.ts', '分组顺序应按 file 升序');
  assertCase(manifest.issues[1].file === 'src/services/cart.ts', '分组顺序应按 file 升序');
  for (const entry of manifest.issues) {
    assertCase(entry.status === 'dry-run', 'dry-run 条目 status 应为 dry-run');
    assertCase(entry.title === `[Mutation] ${entry.file} - ${entry.mutantCount} survivors`, `标题应匹配模板，实际：${entry.title}`);
    assertCase(
      JSON.stringify(entry.labels) === JSON.stringify(['mutation', 'nightly']),
      'labels 应为 mutation + nightly'
    );
    assertCase(entry.queuePath === `.mutation-queue/${entry.file}.json`, 'queuePath 应为 .mutation-queue/{file}.json');
    assertCase(!('issueNumber' in entry), 'dry-run 条目不应含 issueNumber');
    assertCase(!('issueUrl' in entry), 'dry-run 条目不应含 issueUrl');
  }
}

/**
 * body 预览模板：三小节固定、占位符原样代入、与队列文件一致
 * （VAL-ISSUES-008 / 016）。
 */
function casePreviewBodyTemplate(base) {
  const dir = makeCaseDir(base, 'preview-template');
  const input = writeJson(dir, 'report.json', validReport());
  const cli = runCli(['--input', input, '--dry-run'], dir);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const body = fs.readFileSync(previewPath(dir, 'src/services/cart.ts'), 'utf8');
  const iSurvivors = body.indexOf('## 存活变异体');
  const iMachine = body.indexOf('## 机读数据');
  const iGuide = body.indexOf('## 补测指引');
  assertCase(iSurvivors >= 0 && iMachine > iSurvivors && iGuide > iMachine, 'body 三小节应存在且顺序固定');
  assertCase(
    body.includes('`src/services/cart.ts` 在 2026-10-05T18:30:00Z 的夜跑中有 1 个存活变异体（工具：stryker）'),
    `intro 行应按模板渲染，实际：${body.slice(0, 300)}`
  );
  assertCase(body.includes('### stryker-63：line 23'), '变异体小节标题应为 {id}：line {line}');
  assertCase(body.includes('- column：12'), 'column 行应原样代入');
  assertCase(body.includes('- mutationType：`StringLiteral`'), 'mutationType 应以反引号包裹');
  assertCase(body.includes('- status：`Survived`'), 'status 应以反引号包裹');
  assertCase(body.includes('```text\n"empty"\n```'), 'original 应逐字节放围栏代码块');
  assertCase(body.includes('```text\n""\n```'), 'mutated 应逐字节放围栏代码块');
  assertCase(
    body.includes('[.mutation-queue/src/services/cart.ts.json](.mutation-queue/src/services/cart.ts.json)'),
    '机读数据链接应为 queuePath 原文'
  );
  assertCase(
    body.includes('补测判定标准：**新增测试在原代码上通过、在变异后代码上失败**'),
    '补测指引固定文案应在场'
  );
  assertCase(body.includes('棘轮式只涨不跌'), '补测指引第 5 条应在场');
  // 与队列文件逐字段一致（VAL-ISSUES-016）
  const queue = JSON.parse(fs.readFileSync(queuePath(dir, 'src/services/cart.ts'), 'utf8'));
  for (const m of queue.mutants) {
    assertCase(body.includes(`### ${m.id}：line ${m.line}`), `body 应含 ${m.id}`);
    assertCase(body.includes(`- column：${m.column}`), `body column 应与队列一致 (${m.id})`);
    assertCase(body.includes(`- mutationType：\`${m.mutationType}\``), `body mutationType 应与队列一致 (${m.id})`);
    assertCase(body.includes('```text\n' + m.original + '\n```'), `body original 应与队列一致 (${m.id})`);
    assertCase(body.includes('```text\n' + m.mutated + '\n```'), `body mutated 应与队列一致 (${m.id})`);
  }
}

/**
 * 片段含连续三个及以上反引号时，围栏自动加长（模板 §3.3）。
 */
function caseFenceEscalation(base) {
  const dir = makeCaseDir(base, 'fence-escalation');
  const input = writeJson(dir, 'report.json', {
    tool: 'stryker',
    timestamp: REPORT_TS,
    mutants: [
      mutant({
        id: 'stryker-77',
        file: 'src/md/docs.ts',
        line: 3,
        column: 1,
        mutationType: 'StringLiteral',
        original: 'const t = ```;',
        mutated: 'const t = ``;'
      })
    ]
  });
  const cli = runCli(['--input', input, '--dry-run'], dir);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const body = fs.readFileSync(previewPath(dir, 'src/md/docs.ts'), 'utf8');
  assertCase(body.includes('````text\nconst t = ```;\n````'), `含三反引号片段应升级为四反引号围栏，实际：${body}`);
}

/**
 * 多行片段按真实换行渲染在代码块内。
 */
function caseMultiLineSnippet(base) {
  const dir = makeCaseDir(base, 'multiline');
  const input = writeJson(dir, 'report.json', {
    tool: 'stryker',
    timestamp: REPORT_TS,
    mutants: [
      mutant({
        id: 'stryker-88',
        file: 'src/a.ts',
        mutationType: 'Block',
        original: 'if (a) {\n  b();\n}',
        mutated: 'if (a) {\n  b();\n  c();\n}'
      })
    ]
  });
  const cli = runCli(['--input', input, '--dry-run'], dir);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const body = fs.readFileSync(previewPath(dir, 'src/a.ts'), 'utf8');
  assertCase(body.includes('```text\nif (a) {\n  b();\n}\n```'), 'original 多行应逐行渲染');
  assertCase(body.includes('```text\nif (a) {\n  b();\n  c();\n}\n```'), 'mutated 多行应逐行渲染');
}

/**
 * dry-run 全程不调用 gh（VAL-ISSUES-005）：
 * 把 gh 指向不存在的可执行文件，脚本仍应成功。
 */
function caseNoGhInDryRun(base) {
  const dir = makeCaseDir(base, 'no-gh');
  const input = writeJson(dir, 'report.json', validReport());
  const cli = runCli(['--input', input, '--dry-run'], dir, {
    MUTATION_ISSUES_GH: 'definitely-not-a-real-gh-binary-xyz'
  });
  assertCase(cli.status === 0, `dry-run 不应触碰 gh，实际退出码 ${cli.status}: ${cli.stderr}`);
}

/**
 * gh CLI 失败：--create-issues 下优雅失败，退出码 2，stderr 带细节
 * （VAL-ISSUES-017）。
 */
function caseGhFailureGraceful(base) {
  const dir = makeCaseDir(base, 'gh-failure');
  const input = writeJson(dir, 'report.json', validReport());
  const cli = runCli(['--input', input, '--create-issues'], dir, {
    MUTATION_ISSUES_GH: 'definitely-not-a-real-gh-binary-xyz'
  });
  assertCase(cli.status === 2, `gh 失败退出码应为 2，实际 ${cli.status}`);
  assertCase(/gh/i.test(cli.stderr), `stderr 应含 gh 错误细节，实际：${cli.stderr}`);
}

/**
 * 假 gh 实跑：标签确保、按组创建、队列文件带 issueNumber、manifest 带
 * issue URL（VAL-ISSUES-004 / 007 / 009 / 014 / 010）。
 */
function caseCreateIssuesFakeGh(base) {
  const dir = makeCaseDir(base, 'create-fake-gh');
  const input = writeJson(dir, 'report.json', validReport());
  const fake = setupFakeGh(dir, { labels: [] });
  const output = path.join(dir, 'manifest.json');
  const cli = runCli(['--input', input, '--create-issues', '--output', output], dir, fake);
  assertCase(cli.status === 0, `实跑退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const log = readGhLog(fake.__logPath);
  // 标签确保：先 list 后补建缺失的 mutation/nightly（VAL-ISSUES-009）
  assertCase(
    log.some((argv) => argv[0] === 'label' && argv[1] === 'list' && argv.includes('--json')),
    '应先 gh label list 检查标签'
  );
  assertCase(
    log.some((argv) => argv[0] === 'label' && argv[1] === 'create' && argv[2] === 'mutation' && argv.includes('B60205')),
    '应补建 mutation 标签（建议色 B60205）'
  );
  assertCase(
    log.some((argv) => argv[0] === 'label' && argv[1] === 'create' && argv[2] === 'nightly' && argv.includes('1D76DB')),
    '应补建 nightly 标签（建议色 1D76DB）'
  );
  // 每组一次 issue create，参数含标题/标签（VAL-ISSUES-004 / 007）
  const creates = log.filter((argv) => argv[0] === 'issue' && argv[1] === 'create');
  assertCase(creates.length === 2, `应创建 2 个 issue，实际 ${creates.length}`);
  for (const argv of creates) {
    assertCase(argv.includes('--label') && argv.includes('mutation'), 'issue create 应带 mutation 标签');
    assertCase(argv.includes('--label') && argv.includes('nightly'), 'issue create 应带 nightly 标签');
    assertCase(argv.includes('--body-file'), 'issue create 应经 --body-file 传 body');
  }
  const titles = creates.map((argv) => argv[argv.indexOf('--title') + 1]);
  assertCase(
    titles.includes('[Mutation] src/domain/pricing.ts - 2 survivors') &&
      titles.includes('[Mutation] src/services/cart.ts - 1 survivors'),
    `issue 标题应匹配模板，实际：${JSON.stringify(titles)}`
  );
  // 队列文件带 issueNumber（与假 gh 的编号序列一致：101/102）
  const pricingQueue = JSON.parse(fs.readFileSync(queuePath(dir, 'src/domain/pricing.ts'), 'utf8'));
  const cartQueue = JSON.parse(fs.readFileSync(queuePath(dir, 'src/services/cart.ts'), 'utf8'));
  assertCase(pricingQueue.issueNumber === 101, `pricing 队列应带 issueNumber 101，实际 ${pricingQueue.issueNumber}`);
  assertCase(cartQueue.issueNumber === 102, `cart 队列应带 issueNumber 102，实际 ${cartQueue.issueNumber}`);
  // manifest 带 issue URL 与元数据（VAL-ISSUES-014）
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assertCase(manifest.mode === 'create', 'manifest mode 应为 create');
  assertCase(manifest.summary.issuesCreated === 2, 'manifest 应报 issuesCreated: 2');
  assertCase(
    manifest.issues[0].issueUrl === 'https://ghe.example/owner/repo/issues/101',
    `manifest 应含 issue URL，实际：${manifest.issues[0].issueUrl}`
  );
  assertCase(manifest.issues[0].issueNumber === 101, 'manifest 条目应含 issue 编号');
  assertCase(
    cli.stdout.includes('issues created: 2') && cli.stdout.includes('issues skipped: 0'),
    `stdout 摘要应计数正确，实际：${cli.stdout}`
  );
}

/**
 * 去重：已有 open 的同名前缀 issue 时跳过创建并计数（VAL-ISSUES-006）。
 */
function caseDedupSkip(base) {
  const dir = makeCaseDir(base, 'dedup-skip');
  const input = writeJson(dir, 'report.json', validReport());
  const fake = setupFakeGh(dir, {
    labels: ['mutation', 'nightly'],
    existing: [{ number: 12, title: '[Mutation] src/services/cart.ts - 99 survivors' }]
  });
  const output = path.join(dir, 'manifest.json');
  const cli = runCli(['--input', input, '--create-issues', '--output', output], dir, fake);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const log = readGhLog(fake.__logPath);
  assertCase(
    !log.some((argv) => argv[0] === 'label' && argv[1] === 'create'),
    '标签已存在时不应再 label create'
  );
  const creates = log.filter((argv) => argv[0] === 'issue' && argv[1] === 'create');
  assertCase(creates.length === 1, `只应创建 1 个 issue，实际 ${creates.length}`);
  const createdTitle = creates[0][creates[0].indexOf('--title') + 1];
  assertCase(createdTitle.includes('pricing.ts'), '被跳过的组不应再创建');
  assertCase(cli.stdout.includes('issues skipped: 1'), `摘要应计 skipped: 1，实际：${cli.stdout}`);
  assertCase(cli.stdout.includes('#12'), `跳过消息应含目标 issue 编号，实际：${cli.stdout}`);
  const cartQueue = JSON.parse(fs.readFileSync(queuePath(dir, 'src/services/cart.ts'), 'utf8'));
  assertCase(!('issueNumber' in cartQueue), '跳过组的队列文件不应写 issueNumber');
  assertCase(cartQueue.mutants.length === 1, '跳过组的队列文件照常重写');
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  const cartEntry = manifest.issues.find((e) => e.file === 'src/services/cart.ts');
  assertCase(cartEntry.status === 'skipped', 'manifest 跳过条目 status 应为 skipped');
  assertCase(cartEntry.skippedIssueNumber === 12, 'manifest 跳过条目应含既有 issue 编号');
  assertCase(manifest.summary.issuesCreated === 1 && manifest.summary.issuesSkipped === 1, 'manifest 摘要计数应正确');
}

/**
 * --assignee 透传给 gh issue create。
 */
function caseAssigneeFlag(base) {
  const dir = makeCaseDir(base, 'assignee');
  const input = writeJson(dir, 'report.json', validReport());
  const fake = setupFakeGh(dir, { labels: ['mutation', 'nightly'] });
  const cli = runCli(['--input', input, '--create-issues', '--assignee', 'bob'], dir, fake);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const creates = readGhLog(fake.__logPath).filter((argv) => argv[0] === 'issue' && argv[1] === 'create');
  assertCase(creates.length === 2, '应创建 2 个 issue');
  for (const argv of creates) {
    const idx = argv.indexOf('--assignee');
    assertCase(idx >= 0 && argv[idx + 1] === 'bob', `issue create 应透传 --assignee bob，实际：${JSON.stringify(argv)}`);
  }
}

/**
 * --assignee 只能与 --create-issues 同用，否则退出码 1。
 */
function caseAssigneeWithoutCreateRejected(base) {
  const dir = makeCaseDir(base, 'assignee-no-create');
  const input = writeJson(dir, 'report.json', validReport());
  const cli = runCli(['--input', input, '--dry-run', '--assignee', 'bob'], dir);
  assertCase(cli.status === 1, `--assignee 缺 --create-issues 退出码应为 1，实际 ${cli.status}`);
  assertCase(/--assignee/i.test(cli.stderr), `stderr 应点名 --assignee，实际：${cli.stderr}`);
}

/**
 * --dry-run 与 --create-issues 互斥，退出码 1。
 */
function caseDryRunCreateConflict(base) {
  const dir = makeCaseDir(base, 'mode-conflict');
  const input = writeJson(dir, 'report.json', validReport());
  const cli = runCli(['--input', input, '--dry-run', '--create-issues'], dir);
  assertCase(cli.status === 1, `模式冲突退出码应为 1，实际 ${cli.status}`);
  assertCase(/--dry-run|--create-issues/i.test(cli.stderr), `stderr 应点名冲突旗标，实际：${cli.stderr}`);
}

/**
 * 队列文件每轮覆盖重写，不留旧键。
 */
function caseQueueOverwrite(base) {
  const dir = makeCaseDir(base, 'queue-overwrite');
  const input = writeJson(dir, 'report.json', validReport());
  const staleQueue = queuePath(dir, 'src/services/cart.ts');
  fs.mkdirSync(path.dirname(staleQueue), { recursive: true });
  fs.writeFileSync(staleQueue, '{"version":"1.0","file":"stale","mutants":[],"oldKey":1}\n');
  const cli = runCli(['--input', input, '--dry-run'], dir);
  assertCase(cli.status === 0, `退出码应为 0，实际 ${cli.status}: ${cli.stderr}`);
  const queue = JSON.parse(fs.readFileSync(staleQueue, 'utf8'));
  assertCase(queue.file === 'src/services/cart.ts', '队列文件应被本轮数据覆盖');
  assertCase(!('oldKey' in queue), '旧键不应残留');
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

/**
 * 依次跑全部用例，全过时向 stdout 写一行摘要。
 */
function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'test-create-issues-'));
  const cases = [
    caseHelp,
    caseNoInputFlag,
    caseUnknownOption,
    caseMissingValue,
    caseDuplicateOption,
    caseInputFileMissing,
    caseMalformedJson,
    caseReportSchemaRejections,
    caseValidDryRun,
    caseSummaryCounts,
    caseExemptionFiltering,
    caseExemptionsFileMissing,
    caseExemptionsMalformed,
    caseExemptionsSchemaRejections,
    caseStaleExemptionNote,
    caseEmptyReport,
    caseAllExempted,
    caseNonSurvivedDropped,
    caseManifestDryRun,
    casePreviewBodyTemplate,
    caseFenceEscalation,
    caseMultiLineSnippet,
    caseNoGhInDryRun,
    caseGhFailureGraceful,
    caseCreateIssuesFakeGh,
    caseDedupSkip,
    caseAssigneeFlag,
    caseAssigneeWithoutCreateRejected,
    caseDryRunCreateConflict,
    caseQueueOverwrite
  ];
  try {
    cases.forEach((runCase) => runCase(base));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  process.stdout.write(`test_create_issues: PASS cases=${cases.length}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`test_create_issues: FAIL ${err.message}\n`);
  process.exit(1);
}
