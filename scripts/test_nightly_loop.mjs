/**
 * scripts/test_nightly_loop.mjs
 *
 * 夜跑变异测试闭环端到端验证（Milestone 4 scrutiny 门禁命令）。
 *
 * 用 scripts/fixtures/sample-{ts,py} 夹具在系统临时目录的独立沙箱里各走一遍
 * 完整闭环，逐步验证退出码、输出文件存在性与 JSON 契约（统一报告 v1.1、
 * 基线 v1.0、队列/manifest），再覆盖两个跨环节场景：
 *   - 基线回归：把报告改差后 check 必须以退出码 2 拒绝（VAL-CROSS-004）；
 *   - 豁免过滤：.equivalent-mutants.json 命中的变异体不得进入队列文件
 *     （VAL-CROSS-003）。
 *
 * 清理安全：删除沙箱树前先摘除内部 junction（成功与失败清理路径同口径），
 * 避免 Windows 递归删除顺着链接伤及夹具 node_modules。
 *
 * 各语言路径（VAL-CROSS-001 / VAL-CROSS-002）：
 *   TypeScript: Stryker → parse-stryker-report → baseline init → check
 *               → create-issues --dry-run
 *   Python:     mutmut run（经夹具 run_mutmut.py 包装器归一化退出码，
 *               存活变异体位不再是错误）→ result-ids 导出 → show all 捕获
 *               → parse_mutmut_report → baseline init → check
 *               → create-issues --dry-run
 *
 * 环境要求：
 *   - Node.js（Stryker/基线/issue 工具与自身）；TS 夹具需已 npm install
 *     （node_modules 已随夹具就位，脚本通过 junction 复用，不复制）；
 *   - Python 夹具的 mutmut 2.x：优先用 fixtures/sample-py/.venv（见夹具
 *     README 的安装步骤）；缺失时按同一份 dev 依赖清单自动创建 venv 并
 *     安装（需访问 PyPI，一次即可）。
 *
 * 用法:
 *   node scripts/test_nightly_loop.mjs [--lang ts|py|all] [--keep]
 * 选项:
 *   --lang <l>  只跑一条路径：ts|typescript|javascript|js 或
 *               py|python，all 为两条都跑（默认 all）
 *   --keep      保留沙箱目录便于排查（默认跑完即删，并校验夹具未被污染）
 *   -h, --help  显示本说明
 * 退出码: 0 = 全部步骤通过；1 = 任一步骤失败、被跳过或参数错误。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_TS = path.join(__dirname, 'fixtures', 'sample-ts');
const FIXTURE_PY = path.join(__dirname, 'fixtures', 'sample-py');
const PARSE_STRYKER = path.join(__dirname, 'parse-stryker-report.mjs');
const PARSE_MUTMUT = path.join(__dirname, 'parse_mutmut_report.py');
const BASELINE_CLI = path.join(__dirname, 'mutation-baseline.mjs');
const ISSUES_CLI = path.join(__dirname, 'create-mutation-issues.mjs');
const STRYKER_BIN = path.join(
  FIXTURE_TS, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker'
);

/** TS 沙箱里 junction 的目标：夹具的 node_modules（清沙箱后必须完好）。 */
const NODE_MODULES_CANARY = path.join(STRYKER_BIN);

const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
const SPAWN_TIMEOUT_MS = {
  stryker: 10 * 60 * 1000,
  mutmut: 30 * 60 * 1000,
  quick: 2 * 60 * 1000,
  provision: 10 * 60 * 1000
};

/** 与夹具 pyproject.toml [dev] extras 一致的依赖范围（venv 自动装配用）。 */
const PY_DEV_DEPENDENCIES = ['pytest>=7.0,<9', 'mutmut>=2.4,<3'];

const MUTMUT_STATUSES = ['killed', 'timeout', 'survived', 'suspicious', 'skipped', 'untested'];

/** ISO-8601 UTC 时刻形状（YYYY-MM-DDTHH:MM:SSZ），统一报告/基线/manifest 校验共用。 */
const ISO_UTC_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

/**
 * 统一报告 mutationType 闭合枚举（docs/formats/unified-mutation-report.md §4：
 * 19 个 StrykerJS mutator 名 + 5 个 Python 通用类别 + Unknown 兜底）。
 */
const MUTATION_TYPES = new Set([
  'ArithmeticOperator', 'ArrayDeclaration', 'ArrowFunction', 'Block',
  'BooleanLiteral', 'ConditionalExpression', 'EqualityOperator', 'LogicalOperator',
  'MethodExpression', 'MethodName', 'NegateCondition', 'NumberLiteral',
  'ObjectLiteral', 'OptionalChaining', 'Regex', 'StringLiteral',
  'SwitchStatement', 'UnaryOperator', 'UpdateOperator', 'BreakContinue',
  'ComparisonOperator', 'DecoratorRemoval', 'KeywordArgument', 'KeywordLiteral',
  'Unknown'
]);

/** --keep 时保留沙箱目录（供 main 按选项赋值）。 */
let KEEP_SANDBOXES = false;

/** 复制夹具进沙箱时要排除的条目（按 basename；.egg-info 按后缀）。src/、tests/ 必须原样复制。 */
const COPY_EXCLUDED_NAMES = new Set([
  'node_modules', 'dist', 'reports', '.stryker-tmp', '.git', '.venv',
  '__pycache__', '.pytest_cache', '.mutmut-cache', '.mutmut-show-all.txt',
  'mutmut-results-export.json', 'unified-mutation-report.json',
  '.mutation-baseline.json', '.mutation-queue', '.equivalent-mutants.json'
]);

class CliError extends Error {}

/**
 * 断言条件成立，失败时抛出带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/* ------------------------------------------------------------------ */
/* CLI 参数                                                             */
/* ------------------------------------------------------------------ */

const LANG_ALIASES = {
  ts: 'ts', typescript: 'ts', javascript: 'ts', js: 'ts',
  py: 'py', python: 'py'
};

/**
 * 解析命令行参数，返回 { help, keep, langs }；非法用法抛 CliError。
 */
function parseArgv(argv) {
  const options = { help: false, keep: false, langs: ['ts', 'py'] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--keep') {
      options.keep = true;
    } else if (arg === '--lang') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new CliError('--lang 需要一个值：ts|py|all');
      }
      i += 1;
      if (value === 'all') {
        options.langs = ['ts', 'py'];
        continue;
      }
      const lang = LANG_ALIASES[value.toLowerCase()];
      if (!lang) {
        throw new CliError(`未知的 --lang 值 ${JSON.stringify(value)}（支持 ts|py|all）`);
      }
      options.langs = [lang];
    } else {
      throw new CliError(`未知参数 ${JSON.stringify(arg)}（用 --help 查看用法）`);
    }
  }
  return options;
}

/**
 * 打印 --help 用法说明。
 */
function printHelp() {
  process.stdout.write(`Usage: node scripts/test_nightly_loop.mjs [--lang ts|py|all] [--keep]\n\nRun the full nightly mutation loop against the sample-ts / sample-py fixtures\nin isolated temp sandboxes and validate every step's exit code, output files\nand JSON contracts (unified report, baseline, queue files, manifest).\n\nOptions:\n  --lang <l>  Only run one path: ts|typescript|javascript|js, py|python, or all (default: all)\n  --keep      Keep the sandbox directories for debugging (default: removed and verified)\n  -h, --help  Show this help and exit\n\nExit codes:\n  0  all steps passed\n  1  any step failed/skipped, or bad arguments\n`);
}

/* ------------------------------------------------------------------ */
/* 步骤记录与子进程                                                     */
/* ------------------------------------------------------------------ */

/**
 * 记录一步结果；ctx.failed 后的后续步骤记为 SKIP。
 */
function step(results, ctx, label, fn) {
  if (ctx.failed) {
    results.push({ label, status: 'SKIP', detail: '前面有步骤失败，跳过' });
    return;
  }
  try {
    const detail = fn();
    results.push({ label, status: 'PASS', detail: detail || '' });
  } catch (err) {
    ctx.failed = true;
    results.push({ label, status: 'FAIL', detail: err.message });
  }
}

/**
 * 以子进程运行 node 脚本，返回 status/stdout/stderr/error。
 */
function runNode(scriptPath, args, cwd, extraEnv, timeoutMs) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    maxBuffer: SPAWN_MAX_BUFFER,
    timeout: timeoutMs ?? SPAWN_TIMEOUT_MS.quick
  });
}

/**
 * 直接以 node 运行 Stryker 的 bin 入口（绕开 npx 解析）。
 */
function runStryker(args, cwd) {
  return spawnSync(process.execPath, [STRYKER_BIN, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd,
    maxBuffer: SPAWN_MAX_BUFFER,
    timeout: SPAWN_TIMEOUT_MS.stryker
  });
}

/**
 * 定位（必要时装配）Python 夹具的 venv，返回 venv 相关路径。
 * mutmut 不在预期位置时按夹具 README 的依赖清单自动装配一次。
 */
function ensurePythonVenv() {
  const binDir = path.join(
    FIXTURE_PY, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'
  );
  const venvPython = path.join(binDir, process.platform === 'win32' ? 'python.exe' : 'python');
  const mutmutExe = path.join(binDir, process.platform === 'win32' ? 'mutmut.exe' : 'mutmut');
  if (fs.existsSync(mutmutExe)) {
    return { venvPython, mutmutExe, binDir, provisioned: false };
  }
  const created = spawnSync('python', ['-m', 'venv', path.join(FIXTURE_PY, '.venv')], {
    encoding: 'utf8', windowsHide: true, maxBuffer: SPAWN_MAX_BUFFER,
    timeout: SPAWN_TIMEOUT_MS.provision
  });
  if (created.status !== 0) {
    throw new Error(
      `无法创建 fixtures/sample-py/.venv（python -m venv 退出码 ${created.status}）：${created.stderr}`
    );
  }
  const installed = spawnSync(
    venvPython, ['-m', 'pip', 'install', '--quiet', ...PY_DEV_DEPENDENCIES],
    { encoding: 'utf8', windowsHide: true, maxBuffer: SPAWN_MAX_BUFFER, timeout: SPAWN_TIMEOUT_MS.provision }
  );
  if (installed.status !== 0) {
    throw new Error(
      `无法在 fixtures/sample-py/.venv 安装 ${PY_DEV_DEPENDENCIES.join(' ')}（需访问 PyPI）：${installed.stderr}`
    );
  }
  if (!fs.existsSync(mutmutExe)) {
    throw new Error('venv 装配后仍找不到 mutmut 可执行文件');
  }
  return { venvPython, mutmutExe, binDir, provisioned: true };
}

/**
 * 以 venv 环境运行 mutmut 子命令（PATH 注入 venv，PYTHONPATH 指向沙箱 src）。
 */
function runMutmut(venv, args, sandbox) {
  return spawnSync(venv.mutmutExe, args, {
    encoding: 'utf8',
    windowsHide: true,
    cwd: sandbox,
    maxBuffer: SPAWN_MAX_BUFFER,
    timeout: SPAWN_TIMEOUT_MS.mutmut,
    env: {
      ...process.env,
      PATH: `${venv.binDir}${path.delimiter}${process.env.PATH}`,
      PYTHONPATH: path.join(sandbox, 'src')
    }
  });
}

/**
 * 经夹具 run_mutmut.py 包装器运行 mutmut 子命令（沙箱内副本）。包装器按位
 * 裁决 mutmut 退出码：存活/超时/可疑位（偶数）归一化为 0，致命错误位
 * （奇数）透传非零——与 runMutmut 同一套环境约定，仅供 `run` 这类会因
 * 存活变异体退非零的子命令使用。
 */
function runMutmutWrapper(venv, args, sandbox) {
  return spawnSync(venv.venvPython, [path.join(sandbox, 'run_mutmut.py'), ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd: sandbox,
    maxBuffer: SPAWN_MAX_BUFFER,
    timeout: SPAWN_TIMEOUT_MS.mutmut,
    env: {
      ...process.env,
      PATH: `${venv.binDir}${path.delimiter}${process.env.PATH}`,
      PYTHONPATH: path.join(sandbox, 'src')
    }
  });
}

/* ------------------------------------------------------------------ */
/* 沙箱与文件                                                           */
/* ------------------------------------------------------------------ */

/**
 * 在 base 下新建沙箱目录并复制夹具源（排除构建产物与既有运行残留）。
 */
function makeSandbox(base, name, fixtureDir) {
  const sandbox = path.join(base, name);
  fs.mkdirSync(sandbox, { recursive: true });
  fs.cpSync(fixtureDir, sandbox, {
    recursive: true,
    filter: (srcPath) => {
      const baseName = path.basename(srcPath);
      if (baseName.endsWith('.egg-info')) return false;
      return !COPY_EXCLUDED_NAMES.has(baseName);
    }
  });
  return sandbox;
}

/**
 * 给 TS 沙箱接上夹具 node_modules（junction，不复制，清沙箱时只摘链接）。
 */
function linkNodeModules(sandbox) {
  fs.symlinkSync(path.join(FIXTURE_TS, 'node_modules'), path.join(sandbox, 'node_modules'), 'junction');
}

/**
 * 深度优先摘除 dir 下所有 junction/symlink（不进入链接内部），返回摘除数量。
 * Windows 上递归删除含 junction 的目录树可能顺着链接伤及链接目标（如夹具
 * node_modules），删树前必须先摘链接；目录不存在或不可读时按无链接处理。
 */
function unlinkJunctionsUnder(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed += 1;
    } else if (entry.isDirectory()) {
      removed += unlinkJunctionsUnder(fullPath);
    }
  }
  return removed;
}

/**
 * 清理沙箱：先摘 junction 再删树；校验夹具 node_modules 完好（--keep 时保留）。
 */
function cleanupSandbox(sandbox, linkedNodeModules) {
  if (KEEP_SANDBOXES) {
    return `沙箱保留（--keep）：${sandbox}`;
  }
  unlinkJunctionsUnder(sandbox);
  fs.rmSync(sandbox, { recursive: true, force: true });
  if (linkedNodeModules) {
    assertCase(
      fs.existsSync(NODE_MODULES_CANARY),
      `清理沙箱后夹具 node_modules 应完好（缺 ${NODE_MODULES_CANARY}），沙箱清理可能误删了链接目标`
    );
  }
  assertCase(!fs.existsSync(sandbox), `沙箱应已删除：${sandbox}`);
  return linkedNodeModules ? '沙箱已清理，夹具 node_modules 完好' : '沙箱已清理';
}

/**
 * 读 JSON 文件并 parse；任何一步失败都带路径报错。
 */
function readJson(filePath) {
  assertCase(fs.existsSync(filePath), `输出文件应存在：${filePath}`);
  const text = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`输出文件应是合法 JSON：${filePath}（${err.message}）`);
  }
  return data;
}

/**
 * 校验单个 mutant 对象的八字段契约（docs/formats/unified-mutation-report.md §2）：
 * 字段存在且非空、id 词形/前缀/唯一性、file 为项目根相对 POSIX 路径、
 * line/column 为 >=1 整数、mutationType 在 §4 闭合枚举内、original/mutated
 * 为字符串且不相等、status 恒为 Survived。seenIds 用于同文件内 id 去重。
 */
function assertMutantObject(mutant, filePath, expectedTool, seenIds) {
  for (const field of ['id', 'file', 'line', 'column', 'mutationType', 'original', 'mutated', 'status']) {
    assertCase(
      mutant[field] !== undefined && mutant[field] !== null && mutant[field] !== '',
      `${filePath}: mutant 缺字段 ${field}：${JSON.stringify(mutant)}`
    );
  }
  assertCase(
    typeof mutant.id === 'string' && /^(stryker|mutmut)-\S+$/.test(mutant.id),
    `${filePath}: mutant.id 应形如 <tool>-<非空白>，实际 ${JSON.stringify(mutant.id)}`
  );
  assertCase(
    mutant.id.startsWith(`${expectedTool}-`),
    `${filePath}: mutant.id 前缀应与 tool 一致（${expectedTool}-），实际 ${JSON.stringify(mutant.id)}`
  );
  assertCase(
    !seenIds.has(mutant.id),
    `${filePath}: mutant.id 应在同文件内唯一，重复：${JSON.stringify(mutant.id)}`
  );
  seenIds.add(mutant.id);
  assertCase(
    typeof mutant.file === 'string' && !mutant.file.includes('\\') &&
    !mutant.file.startsWith('./') && !mutant.file.startsWith('/'),
    `${filePath}: mutant.file 应为项目根相对 POSIX 路径，实际 ${JSON.stringify(mutant.file)}`
  );
  assertCase(
    Number.isInteger(mutant.line) && mutant.line >= 1,
    `${filePath}: line 应为 >=1 的整数，实际 ${JSON.stringify(mutant.line)}`
  );
  assertCase(
    Number.isInteger(mutant.column) && mutant.column >= 1,
    `${filePath}: column 应为 >=1 的整数，实际 ${JSON.stringify(mutant.column)}`
  );
  assertCase(
    MUTATION_TYPES.has(mutant.mutationType),
    `${filePath}: mutationType 应为契约 §4 闭合枚举值，实际 ${JSON.stringify(mutant.mutationType)}`
  );
  assertCase(
    typeof mutant.original === 'string',
    `${filePath}: original 应为字符串，实际 ${JSON.stringify(mutant.original)}`
  );
  assertCase(
    typeof mutant.mutated === 'string' && mutant.mutated !== mutant.original,
    `${filePath}: mutated 应为字符串且不等于 original，实际 ${JSON.stringify(mutant.mutated)}`
  );
  assertCase(mutant.status === 'Survived', `${filePath}: 夜跑管线只应含存活变异体，实际 status=${mutant.status}`);
}

/**
 * 校验统一变异体报告契约（docs/formats/unified-mutation-report.md v1.1）：
 * 顶层 tool/timestamp（ISO-8601 UTC）/mutants/score 与每个 mutant 的完整
 * 字段约束。返回 { score, mutants, tool, timestamp } 供后续步骤断言。
 */
function assertUnifiedReport(data, expectedTool, filePath) {
  assertCase(data.tool === expectedTool, `${filePath}: tool 应为 ${expectedTool}，实际 ${JSON.stringify(data.tool)}`);
  assertCase(
    typeof data.timestamp === 'string' && ISO_UTC_PATTERN.test(data.timestamp),
    `${filePath}: timestamp 应为 YYYY-MM-DDTHH:MM:SSZ 的 UTC 时刻，实际 ${JSON.stringify(data.timestamp)}`
  );
  assertCase(Array.isArray(data.mutants) && data.mutants.length > 0, `${filePath}: mutants 应为非空数组`);
  assertCase(
    typeof data.score === 'number' && Number.isFinite(data.score) && data.score >= 0 && data.score <= 100,
    `${filePath}: score 应为 [0,100] 内的数字，实际 ${JSON.stringify(data.score)}`
  );
  const seenIds = new Set();
  for (const mutant of data.mutants) {
    assertMutantObject(mutant, filePath, expectedTool, seenIds);
  }
  return { score: data.score, mutants: data.mutants, tool: data.tool, timestamp: data.timestamp };
}

/**
 * 校验基线文件契约（docs/formats/mutation-baseline.md v1.0）：version/updated
 * （ISO-8601 UTC）/四统计值的类型与范围/killed+survived≤total 跨字段一致性。
 */
function assertBaselineFile(data, filePath, expectedScore) {
  assertCase(data.version === '1.0', `${filePath}: version 应为 "1.0"，实际 ${JSON.stringify(data.version)}`);
  assertCase(
    typeof data.updated === 'string' && ISO_UTC_PATTERN.test(data.updated),
    `${filePath}: updated 应为 YYYY-MM-DDTHH:MM:SSZ 的 UTC 时刻，实际 ${JSON.stringify(data.updated)}`
  );
  assertCase(data.baseline && typeof data.baseline === 'object', `${filePath}: 应含 baseline 对象`);
  const baseline = data.baseline;
  assertCase(
    typeof baseline.score === 'number' && Number.isFinite(baseline.score) &&
    baseline.score >= 0 && baseline.score <= 100,
    `${filePath}: baseline.score 应为 [0,100] 内的数字，实际 ${JSON.stringify(baseline.score)}`
  );
  assertCase(
    Number.isInteger(baseline.killed) && baseline.killed >= 0,
    `${filePath}: baseline.killed 应为 >=0 的整数，实际 ${JSON.stringify(baseline.killed)}`
  );
  assertCase(
    Number.isInteger(baseline.survived) && baseline.survived >= 0,
    `${filePath}: baseline.survived 应为 >=0 的整数，实际 ${JSON.stringify(baseline.survived)}`
  );
  assertCase(
    Number.isInteger(baseline.total) && baseline.total >= 1,
    `${filePath}: baseline.total 应为 >=1 的整数，实际 ${JSON.stringify(baseline.total)}`
  );
  assertCase(
    baseline.killed + baseline.survived <= baseline.total,
    `${filePath}: killed+survived 应 ≤ total（其余状态可计入 total），实际 ` +
    `${baseline.killed}+${baseline.survived}>${baseline.total}`
  );
  assertCase(
    Math.abs(baseline.score - expectedScore) <= 1e-9,
    `${filePath}: baseline.score ${baseline.score} 应与统一报告分数 ${expectedScore} 一致`
  );
  return baseline;
}

/**
 * 读取 manifest（create-mutation-issues --output），按其施工票契约完整校验
 * dry-run 输出：元数据（tool/timestamp/generatedAt/input/exemptionsFile）、
 * summary 五计数、issue 条目（title/labels/queuePath/previewPath/status/
 * dry-run 不带编号）与队列文件（version/tool/timestamp/逐字段 mutant）。
 * 返回 { manifest, queueByFile }。
 */
function readDryRunManifest(manifestPath, sandbox, expectedMutantCount, expectedTool, expectedTimestamp) {
  const manifest = readJson(manifestPath);
  assertCase(manifest.version === '1.0', `manifest: version 应为 "1.0"，实际 ${JSON.stringify(manifest.version)}`);
  assertCase(manifest.mode === 'dry-run', `manifest: mode 应为 dry-run，实际 ${JSON.stringify(manifest.mode)}`);
  assertCase(manifest.tool === expectedTool, `manifest: tool 应为 ${expectedTool}，实际 ${JSON.stringify(manifest.tool)}`);
  assertCase(
    manifest.timestamp === expectedTimestamp,
    `manifest: timestamp 应与统一报告一致（${expectedTimestamp}），实际 ${JSON.stringify(manifest.timestamp)}`
  );
  assertCase(
    typeof manifest.generatedAt === 'string' && ISO_UTC_PATTERN.test(manifest.generatedAt),
    `manifest: generatedAt 应为 YYYY-MM-DDTHH:MM:SSZ 的 UTC 时刻，实际 ${JSON.stringify(manifest.generatedAt)}`
  );
  assertCase(
    manifest.generatedAt >= manifest.timestamp,
    `manifest: generatedAt (${manifest.generatedAt}) 不得早于报告 timestamp (${manifest.timestamp})`
  );
  assertCase(
    typeof manifest.input === 'string' && manifest.input.length > 0,
    `manifest: input 应为非空字符串，实际 ${JSON.stringify(manifest.input)}`
  );
  assertCase(
    manifest.exemptionsFile === null || typeof manifest.exemptionsFile === 'string',
    `manifest: exemptionsFile 应为 null 或字符串，实际 ${JSON.stringify(manifest.exemptionsFile)}`
  );
  const summary = manifest.summary || {};
  for (const field of ['totalMutants', 'exempted', 'nonSurvivedDropped', 'issuesCreated', 'issuesSkipped']) {
    assertCase(
      Number.isInteger(summary[field]) && summary[field] >= 0,
      `manifest: summary.${field} 应为 >=0 的整数，实际 ${JSON.stringify(summary[field])}`
    );
  }
  assertCase(summary.totalMutants === expectedMutantCount,
    `manifest: summary.totalMutants 应为 ${expectedMutantCount}，实际 ${JSON.stringify(summary.totalMutants)}`);
  assertCase(summary.issuesCreated === 0, `manifest: dry-run 不应创建 issue，实际 ${JSON.stringify(summary.issuesCreated)}`);
  assertCase(summary.issuesSkipped === 0, `manifest: dry-run 不应触发去重跳过，实际 ${JSON.stringify(summary.issuesSkipped)}`);
  assertCase(Array.isArray(manifest.staleExemptionIds), 'manifest: staleExemptionIds 应为数组');
  assertCase(Array.isArray(manifest.issues) && manifest.issues.length > 0, 'manifest: issues 应为非空数组');
  const queueByFile = new Map();
  for (const issue of manifest.issues) {
    assertCase(typeof issue.file === 'string' && issue.file.length > 0,
      `manifest: issue.file 应为非空字符串，实际 ${JSON.stringify(issue.file)}`);
    assertCase(
      Number.isInteger(issue.mutantCount) && issue.mutantCount >= 1,
      `manifest: ${issue.file} 的 mutantCount 应为 >=1 的整数，实际 ${JSON.stringify(issue.mutantCount)}`
    );
    assertCase(
      issue.title === `[Mutation] ${issue.file} - ${issue.mutantCount} survivors`,
      `manifest: title 应为 "[Mutation] {file} - N survivors"，实际 ${JSON.stringify(issue.title)}`
    );
    assertCase(
      Array.isArray(issue.labels) && issue.labels.length === 2 &&
      issue.labels[0] === 'mutation' && issue.labels[1] === 'nightly',
      `manifest: labels 应为 ["mutation","nightly"]，实际 ${JSON.stringify(issue.labels)}`
    );
    assertCase(
      issue.queuePath === `.mutation-queue/${issue.file}.json`,
      `manifest: queuePath 应为 .mutation-queue/${issue.file}.json，实际 ${JSON.stringify(issue.queuePath)}`
    );
    assertCase(
      typeof issue.previewPath === 'string' && issue.previewPath.length > 0,
      `manifest: dry-run issue 应带 previewPath，实际 ${JSON.stringify(issue.previewPath)}`
    );
    assertCase(
      Array.isArray(issue.mutantIds) && issue.mutantIds.length === issue.mutantCount,
      `manifest: ${issue.file} 的 mutantIds 数应与 mutantCount 一致（${issue.mutantCount}）`
    );
    assertCase(issue.status === 'dry-run', `manifest: dry-run issue.status 应为 dry-run，实际 ${JSON.stringify(issue.status)}`);
    for (const field of ['issueNumber', 'issueUrl', 'skippedIssueNumber']) {
      assertCase(issue[field] === undefined, `manifest: dry-run 不应带 ${field}`);
    }
    const queuePath = path.resolve(sandbox, issue.queuePath);
    const queue = readJson(queuePath);
    assertCase(queue.version === '1.0', `队列文件 ${queuePath}: version 应为 "1.0"`);
    assertCase(queue.file === issue.file, `队列文件 ${queuePath}: file 应为 ${issue.file}`);
    assertCase(queue.tool === expectedTool,
      `队列文件 ${queuePath}: tool 应为 ${expectedTool}，实际 ${JSON.stringify(queue.tool)}`);
    assertCase(queue.timestamp === expectedTimestamp,
      `队列文件 ${queuePath}: timestamp 应与统一报告一致（${expectedTimestamp}），实际 ${JSON.stringify(queue.timestamp)}`);
    assertCase(Array.isArray(queue.mutants) && queue.mutants.length === issue.mutantCount,
      `队列文件 ${queuePath}: mutants 数应与 manifest 一致（${issue.mutantCount}）`);
    assertCase(queue.issueNumber === undefined, `队列文件 ${queuePath}: dry-run 不应带 issueNumber`);
    const seenIds = new Set();
    for (const mutant of queue.mutants) {
      assertMutantObject(mutant, queuePath, expectedTool, seenIds);
    }
    queueByFile.set(issue.file, queue);
  }
  return { manifest, queueByFile };
}

/* ------------------------------------------------------------------ */
/* TypeScript 路径（VAL-CROSS-001 / VAL-FIXTURES-012）                   */
/* ------------------------------------------------------------------ */

function caseTypeScriptPath(base, results) {
  const ctx = { failed: false };
  const sandbox = path.join(base, 'sample-ts');
  let venvState;

  step(results, ctx, '[ts] sandbox', () => {
    assertCase(fs.existsSync(STRYKER_BIN),
      `TS 夹具缺少 node_modules（${NODE_MODULES_CANARY} 不存在），请先在 fixtures/sample-ts 执行 npm install`);
    makeSandbox(base, 'sample-ts', FIXTURE_TS);
    linkNodeModules(sandbox);
    return `沙箱 ${sandbox}`;
  });

  step(results, ctx, '[ts] stryker-run', () => {
    const run = runStryker(['run'], sandbox);
    assertCase(run.status === 0, `stryker run 退出码应为 0，实际 ${run.status}：${(run.stderr || run.stdout || '').slice(-600)}`);
    const reportPath = path.join(sandbox, 'reports', 'mutation', 'mutation.json');
    const report = readJson(reportPath);
    const totals = Object.values(report.files || {}).flatMap((entry) => entry.mutants || []);
    assertCase(totals.length > 0, `Stryker 报告应含变异体：${reportPath}`);
    return `Stryker 退出 0，报告 ${totals.length} 个变异体`;
  });

  const parsed = { score: 0, mutants: [] };
  step(results, ctx, '[ts] parse-report', () => {
    const run = runNode(PARSE_STRYKER, [
      '--input', path.join(sandbox, 'reports', 'mutation', 'mutation.json'),
      '--output', path.join(sandbox, 'unified-mutation-report.json')
    ]);
    assertCase(run.status === 0, `parse-stryker-report 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    const unified = assertUnifiedReport(
      readJson(path.join(sandbox, 'unified-mutation-report.json')), 'stryker',
      path.join(sandbox, 'unified-mutation-report.json')
    );
    Object.assign(parsed, unified);
    return `统一报告 ${unified.mutants.length} 个存活变异体，score=${unified.score}`;
  });

  step(results, ctx, '[ts] baseline-init', () => {
    const run = runNode(BASELINE_CLI, [
      'init', '--input', path.join(sandbox, 'reports', 'mutation', 'mutation.json'),
      '--lang', 'ts', '--output', path.join(sandbox, '.mutation-baseline.json')
    ]);
    assertCase(run.status === 0, `baseline init 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    assertBaselineFile(
      readJson(path.join(sandbox, '.mutation-baseline.json')),
      path.join(sandbox, '.mutation-baseline.json'), parsed.score
    );
    return `基线冻结 score=${parsed.score}`;
  });

  step(results, ctx, '[ts] baseline-check', () => {
    const run = runNode(BASELINE_CLI, [
      'check', '--input', path.join(sandbox, 'reports', 'mutation', 'mutation.json'),
      '--lang', 'ts', '--output', path.join(sandbox, '.mutation-baseline.json')
    ]);
    assertCase(run.status === 0, `baseline check 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    assertCase(/PASS/.test(run.stdout), `baseline check 应输出 PASS，实际：${run.stdout}`);
    return '同分检查通过（exit 0）';
  });

  step(results, ctx, '[ts] issues-dry-run', () => {
    const run = runNode(ISSUES_CLI, [
      '--input', path.join(sandbox, 'unified-mutation-report.json'),
      '--dry-run', '--output', path.join(sandbox, 'manifest.json')
    ], sandbox);
    assertCase(run.status === 0, `create-issues --dry-run 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    const { manifest, queueByFile } = readDryRunManifest(
      path.join(sandbox, 'manifest.json'), sandbox, parsed.mutants.length, parsed.tool, parsed.timestamp
    );
    assertCase(manifest.summary.exempted === 0, `无豁免文件时 exempted 应为 0，实际 ${manifest.summary.exempted}`);
    const distinctFiles = new Set(parsed.mutants.map((m) => m.file)).size;
    assertCase(manifest.issues.length === distinctFiles,
      `应按 ${distinctFiles} 个文件分组，实际 ${manifest.issues.length}`);
    ctx.tsFirstMutant = parsed.mutants[0];
    assertCase(
      queueByFile.get(ctx.tsFirstMutant.file).mutants.some((m) => m.id === ctx.tsFirstMutant.id),
      `未豁免时 ${ctx.tsFirstMutant.id} 应出现在队列文件`
    );
    return `${manifest.issues.length} 个队列组，exempted=0`;
  });

  step(results, ctx, '[ts] baseline-regression', () => {
    const reportPath = path.join(sandbox, 'reports', 'mutation', 'mutation.json');
    const degraded = readJson(reportPath);
    let flipped = 0;
    for (const entry of Object.values(degraded.files || {})) {
      for (const mutant of entry.mutants || []) {
        if (mutant.status === 'Killed' && flipped < 10) {
          mutant.status = 'Survived';
          flipped += 1;
        }
      }
    }
    assertCase(flipped > 0, 'Stryker 报告里找不到 Killed 变异体，无法构造回归场景');
    const degradedPath = path.join(sandbox, 'degraded-report.json');
    fs.writeFileSync(degradedPath, JSON.stringify(degraded, null, 2));
    const run = runNode(BASELINE_CLI, [
      'check', '--input', degradedPath, '--lang', 'ts',
      '--output', path.join(sandbox, '.mutation-baseline.json')
    ]);
    assertCase(run.status === 2, `分数回落后 check 退出码应为 2，实际 ${run.status}：${run.stdout}`);
    assertCase(/regressed/i.test(run.stderr), `stderr 应说明 regression，实际：${run.stderr}`);
    return `降级 ${flipped} 个 killed 后被拒（exit 2）`;
  });

  step(results, ctx, '[ts] exemption-filter', () => {
    const target = ctx.tsFirstMutant;
    const exemptionsPath = path.join(sandbox, '.equivalent-mutants.json');
    fs.writeFileSync(exemptionsPath, JSON.stringify({
      version: '1.0',
      exemptions: [{
        id: 'equiv-001',
        file: target.file,
        line: target.line,
        mutationType: target.mutationType,
        reason: '端到端验证用豁免：test_nightly_loop 以该存活变异体验证豁免过滤链路。',
        exemptedBy: 'test_nightly_loop',
        exemptedAt: `${new Date().toISOString().slice(0, 19)}Z`,
        reviewRequired: false
      }]
    }, null, 2));
    const run = runNode(ISSUES_CLI, [
      '--input', path.join(sandbox, 'unified-mutation-report.json'),
      '--exemptions', exemptionsPath,
      '--dry-run', '--output', path.join(sandbox, 'manifest-exempt.json')
    ], sandbox);
    assertCase(run.status === 0, `带豁免 create-issues 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    const { manifest, queueByFile } = readDryRunManifest(
      path.join(sandbox, 'manifest-exempt.json'), sandbox, parsed.mutants.length, parsed.tool, parsed.timestamp
    );
    assertCase(manifest.summary.exempted === 1, `exempted 应为 1，实际 ${manifest.summary.exempted}`);
    assertCase(Array.isArray(manifest.staleExemptionIds) && manifest.staleExemptionIds.length === 0,
      '刚写入的豁免不应是陈旧条目');
    assertCase(queueByFile.size >= 1, '豁免后应至少还剩一个补测组');
    for (const queue of queueByFile.values()) {
      assertCase(
        !queue.mutants.some((m) => m.id === target.id),
        `被豁免的 ${target.id} 不应出现在任何队列文件`
      );
    }
    return `豁免 ${target.id} 已从队列剔除（exempted=1，剩余组 ${queueByFile.size}）`;
  });

  step(results, ctx, '[ts] cleanup', () => cleanupSandbox(sandbox, true));
}

/* ------------------------------------------------------------------ */
/* Python 路径（VAL-CROSS-002 / VAL-FIXTURES-013）                       */
/* ------------------------------------------------------------------ */

function casePythonPath(base, results) {
  const ctx = { failed: false };
  const sandbox = path.join(base, 'sample-py');
  const venv = ensurePythonVenv();

  step(results, ctx, '[py] sandbox', () => {
    makeSandbox(base, 'sample-py', FIXTURE_PY);
    return `沙箱 ${sandbox}${venv.provisioned ? '（venv 为本轮自动装配）' : ''}`;
  });

  step(results, ctx, '[py] mutmut-run', () => {
    const wrapper = path.join(sandbox, 'run_mutmut.py');
    assertCase(fs.existsSync(wrapper), '夹具应提供 run_mutmut.py 退出码归一化包装器');
    const run = runMutmutWrapper(venv, ['run'], sandbox);
    assertCase(run.status !== null, `run_mutmut.py 未能执行：${run.error}`);
    assertCase(run.status === 0,
      `mutmut run 经包装器应归一化退出 0（存活变异体位属预期，非零即真实失败）：${(run.stderr || run.stdout || '').slice(-600)}`);
    assertCase(fs.existsSync(path.join(sandbox, '.mutmut-cache')), 'mutmut run 后应生成 .mutmut-cache');
    return 'mutmut run 完成（包装器归一化退出 0，存活变异体交后续步骤处理），缓存已生成';
  });

  step(results, ctx, '[py] export-results', () => {
    const exportData = {};
    for (const statusName of MUTMUT_STATUSES) {
      const run = runMutmut(venv, ['result-ids', statusName], sandbox);
      assertCase(run.status === 0, `mutmut result-ids ${statusName} 退出码应为 0，实际 ${run.status}：${run.stderr}`);
      exportData[statusName] = run.stdout.trim().split(/\s+/).filter(Boolean);
    }
    const exportPath = path.join(sandbox, 'mutmut-results-export.json');
    fs.writeFileSync(exportPath, `${JSON.stringify(exportData, null, 2)}\n`);
    const total = MUTMUT_STATUSES.reduce((sum, key) => sum + exportData[key].length, 0);
    assertCase(total > 0, 'results 导出各类别合计应为正');
    return `导出 killed=${exportData.killed.length} survived=${exportData.survived.length} total=${total}`;
  });

  step(results, ctx, '[py] show-capture', () => {
    const run = runMutmut(venv, ['show', 'all'], sandbox);
    assertCase(run.status === 0, `mutmut show all 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    assertCase(run.stdout.includes('---'), 'mutmut show all 输出应含 diff 标记 ---');
    fs.writeFileSync(path.join(sandbox, '.mutmut-show-all.txt'), run.stdout);
    return `diff 捕获 ${run.stdout.length} 字节`;
  });

  const parsed = { score: 0, mutants: [] };
  step(results, ctx, '[py] parse-report', () => {
    const run = spawnSync(venv.venvPython, [
      PARSE_MUTMUT,
      '--input', path.join(sandbox, '.mutmut-cache'),
      '--show', path.join(sandbox, '.mutmut-show-all.txt'),
      '--output', path.join(sandbox, 'unified-mutation-report.json')
    ], {
      encoding: 'utf8', windowsHide: true, cwd: sandbox,
      maxBuffer: SPAWN_MAX_BUFFER, timeout: SPAWN_TIMEOUT_MS.quick
    });
    assertCase(run.status === 0, `parse_mutmut_report 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    const unified = assertUnifiedReport(
      readJson(path.join(sandbox, 'unified-mutation-report.json')), 'mutmut',
      path.join(sandbox, 'unified-mutation-report.json')
    );
    Object.assign(parsed, unified);
    return `统一报告 ${unified.mutants.length} 个存活变异体，score=${unified.score}`;
  });

  step(results, ctx, '[py] baseline-init', () => {
    const run = runNode(BASELINE_CLI, [
      'init', '--input', path.join(sandbox, 'mutmut-results-export.json'),
      '--lang', 'py', '--output', path.join(sandbox, '.mutation-baseline.json')
    ]);
    assertCase(run.status === 0, `baseline init 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    assertBaselineFile(
      readJson(path.join(sandbox, '.mutation-baseline.json')),
      path.join(sandbox, '.mutation-baseline.json'), parsed.score
    );
    return `基线冻结 score=${parsed.score}`;
  });

  step(results, ctx, '[py] baseline-check', () => {
    const run = runNode(BASELINE_CLI, [
      'check', '--input', path.join(sandbox, 'mutmut-results-export.json'),
      '--lang', 'py', '--output', path.join(sandbox, '.mutation-baseline.json')
    ]);
    assertCase(run.status === 0, `baseline check 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    assertCase(/PASS/.test(run.stdout), `baseline check 应输出 PASS，实际：${run.stdout}`);
    return '同分检查通过（exit 0）';
  });

  step(results, ctx, '[py] issues-dry-run', () => {
    const run = runNode(ISSUES_CLI, [
      '--input', path.join(sandbox, 'unified-mutation-report.json'),
      '--dry-run', '--output', path.join(sandbox, 'manifest.json')
    ], sandbox);
    assertCase(run.status === 0, `create-issues --dry-run 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    const { manifest, queueByFile } = readDryRunManifest(
      path.join(sandbox, 'manifest.json'), sandbox, parsed.mutants.length, parsed.tool, parsed.timestamp
    );
    assertCase(manifest.summary.exempted === 0, `无豁免文件时 exempted 应为 0，实际 ${manifest.summary.exempted}`);
    ctx.pyFirstMutant = parsed.mutants[0];
    assertCase(
      queueByFile.get(ctx.pyFirstMutant.file).mutants.some((m) => m.id === ctx.pyFirstMutant.id),
      `未豁免时 ${ctx.pyFirstMutant.id} 应出现在队列文件`
    );
    return `${manifest.issues.length} 个队列组，exempted=0`;
  });

  step(results, ctx, '[py] baseline-regression', () => {
    const exportPath = path.join(sandbox, 'mutmut-results-export.json');
    const degraded = readJson(exportPath);
    assertCase(degraded.killed.length > 0, 'results 导出里没有 killed 变异体，无法构造回归场景');
    const movedId = degraded.killed.pop();
    degraded.survived.push(movedId);
    const degradedPath = path.join(sandbox, 'degraded-results-export.json');
    fs.writeFileSync(degradedPath, `${JSON.stringify(degraded, null, 2)}\n`);
    const run = runNode(BASELINE_CLI, [
      'check', '--input', degradedPath, '--lang', 'py',
      '--output', path.join(sandbox, '.mutation-baseline.json')
    ]);
    assertCase(run.status === 2, `分数回落后 check 退出码应为 2，实际 ${run.status}：${run.stdout}`);
    assertCase(/regressed/i.test(run.stderr), `stderr 应说明 regression，实际：${run.stderr}`);
    return `1 个 killed 挪入 survived 后被拒（exit 2）`;
  });

  step(results, ctx, '[py] exemption-filter', () => {
    const target = ctx.pyFirstMutant;
    const exemptionsPath = path.join(sandbox, '.equivalent-mutants.json');
    fs.writeFileSync(exemptionsPath, JSON.stringify({
      version: '1.0',
      exemptions: [{
        id: 'equiv-001',
        file: target.file,
        line: target.line,
        mutationType: target.mutationType,
        reason: '端到端验证用豁免：test_nightly_loop 以该存活变异体验证豁免过滤链路。',
        exemptedBy: 'test_nightly_loop',
        exemptedAt: `${new Date().toISOString().slice(0, 19)}Z`,
        reviewRequired: false
      }]
    }, null, 2));
    const run = runNode(ISSUES_CLI, [
      '--input', path.join(sandbox, 'unified-mutation-report.json'),
      '--exemptions', exemptionsPath,
      '--dry-run', '--output', path.join(sandbox, 'manifest-exempt.json')
    ], sandbox);
    assertCase(run.status === 0, `带豁免 create-issues 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    const { manifest, queueByFile } = readDryRunManifest(
      path.join(sandbox, 'manifest-exempt.json'), sandbox, parsed.mutants.length, parsed.tool, parsed.timestamp
    );
    assertCase(manifest.summary.exempted === 1, `exempted 应为 1，实际 ${manifest.summary.exempted}`);
    assertCase(queueByFile.size >= 1, '豁免后应至少还剩一个补测组');
    for (const queue of queueByFile.values()) {
      assertCase(
        !queue.mutants.some((m) => m.id === target.id),
        `被豁免的 ${target.id} 不应出现在任何队列文件`
      );
    }
    return `豁免 ${target.id} 已从队列剔除（exempted=1，剩余组 ${queueByFile.size}）`;
  });

  step(results, ctx, '[py] cleanup', () => cleanupSandbox(sandbox, false));
}

/* ------------------------------------------------------------------ */
/* 脚本自身的 CLI 表面                                                   */
/* ------------------------------------------------------------------ */

/**
 * --help 应退出 0 并说明选项；未知 --lang 值应以退出码 1 报错（VAL-FIXTURES-011）。
 */
function caseCliSurface(results) {
  const ctx = { failed: false };
  step(results, ctx, '[cli] help', () => {
    const run = runNode(__filename, ['--help']);
    assertCase(run.status === 0, `--help 退出码应为 0，实际 ${run.status}：${run.stderr}`);
    for (const token of ['--lang', '--keep', '--help', 'Usage']) {
      assertCase(run.stdout.includes(token), `--help 应说明 ${token}，实际：${run.stdout}`);
    }
    return 'help 输出完整（exit 0）';
  });
  step(results, ctx, '[cli] bad-lang', () => {
    const run = runNode(__filename, ['--lang', 'ruby']);
    assertCase(run.status === 1, `未知 --lang 值退出码应为 1，实际 ${run.status}`);
    assertCase(run.stderr.includes('ts|py|all'), `stderr 应给出合法取值提示，实际：${run.stderr}`);
    return '未知参数被拒（exit 1）';
  });
}

/* ------------------------------------------------------------------ */
/* 汇总                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 打印逐步结果与总结行，全部通过返回 true。
 */
function printSummary(results) {
  for (const entry of results) {
    process.stdout.write(`test_nightly_loop: ${entry.label.padEnd(24)} ${entry.status.padEnd(5)} ${entry.detail}\n`);
  }
  const failed = results.filter((entry) => entry.status === 'FAIL');
  const skipped = results.filter((entry) => entry.status === 'SKIP');
  process.stdout.write(
    `test_nightly_loop: SUMMARY steps=${results.length} passed=${results.length - failed.length - skipped.length}` +
    ` failed=${failed.length} skipped=${skipped.length}\n`
  );
  return failed.length === 0 && skipped.length === 0;
}

/**
 * 依次运行所选路径，收尾清理并汇总；全过退出 0，否则退出 1。
 */
function main() {
  let options;
  try {
    options = parseArgv(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`test_nightly_loop: FAIL ${err.message}\n`);
    process.exit(1);
  }
  if (options.help) {
    printHelp();
    return;
  }
  KEEP_SANDBOXES = options.keep;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-loop-'));
  const results = [];
  try {
    if (options.langs.includes('ts')) caseTypeScriptPath(base, results);
    if (options.langs.includes('py')) casePythonPath(base, results);
    caseCliSurface(results);
  } finally {
    if (!options.keep) {
      // 失败清理路径同样先摘 junction：中途失败时沙箱里可能还留着指向夹具
      // node_modules 的链接（成功路径的摘除在 cleanupSandbox 内），Windows 上
      // 直接递归删树会顺着链接伤及夹具本体，污染后续所有轮次。
      const unlinked = unlinkJunctionsUnder(base);
      fs.rmSync(base, { recursive: true, force: true });
      if (unlinked > 0) {
        process.stdout.write(`test_nightly_loop: 清理前摘除 ${unlinked} 个 junction\n`);
      }
      if (!fs.existsSync(NODE_MODULES_CANARY)) {
        process.stderr.write('test_nightly_loop: WARN 夹具 node_modules 疑似被清理路径破坏（canary 缺失）\n');
      }
    } else {
      process.stdout.write(`test_nightly_loop: 沙箱根目录保留：${base}\n`);
    }
  }
  const ok = printSummary(results);
  process.stdout.write(`test_nightly_loop: ${ok ? 'PASS' : 'FAIL'}\n`);
  process.exit(ok ? 0 : 1);
}

try {
  main();
} catch (err) {
  process.stderr.write(`test_nightly_loop: FAIL ${err.message}\n`);
  process.exit(1);
}


