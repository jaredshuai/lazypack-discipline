/**
 * scripts/test_workflow_templates.mjs
 *
 * GitHub Actions workflow 模板验证（夜跑闭环 M4，VAL-CROSS-005）。
 *
 * 用 scripts/fixtures/sample-{ts,py} 夹具在系统临时目录组装「测试仓库」：
 * 夹具源码 + 模板头注指定的工具脚本副本 + workflow 模板安装到
 * .github/workflows/，然后按 YAML 解析出的步骤顺序，用 Git Bash
 * （对应 ubuntu runner 的默认 bash -e shell 口径）逐块执行 workflow
 * 自身的 run 脚本文本，逐步断言退出码与产物，最后核对 artifacts path
 * 配置与实际产物一一对应。act 不可用时这是最强等效验证。
 *
 * 结构校验（每个 workflow，不执行）：
 *   - YAML 语法（PyYAML safe_load，经 python 子进程，VAL-CONFIG-001）；
 *   - 触发器（cron `0 2 * * *` + workflow_dispatch，VAL-CONFIG-002）、
 *     permissions（contents: read + issues: write）、runs-on ubuntu-latest；
 *   - 全部步骤含 name 且 run/uses 恰居其一；uses 动作在白名单内，
 *     Node/Python 版本钉位正确（VAL-CONFIG-003 / 012）；
 *   - 基线 hashFiles 条件互补（init 判空 / check 判非空）；
 *   - secrets.GITHUB_TOKEN 经 GH_TOKEN env 注入建 issue 步骤
 *     （VAL-CONFIG-004）；
 *   - upload-artifact@v4 配置（name/path/if: always()/保留期，
 *     VAL-CONFIG-005）；
 *   - run 块引用的 scripts/ 脚本在本仓都存在，且与模板头注「随迁清单」
 *     完全一致（多了冗余、少了断链都不行）。
 *
 * 模拟执行的已知偏差（环境所限，如实声明）：
 *   - `npm ci` 追加 --dry-run 执行：真实 npm ci 会先删 node_modules，而
 *     本机沙箱经 junction 复用夹具 node_modules，直接跑会破坏夹具；
 *     --dry-run 校验 lockfile 与 package.json 同步（npm ci 的主要失败
 *     模式），依赖可安装性由夹具 node_modules 与后续 Stryker 实跑证明；
 *   - create-mutation-issues.mjs 注入 --dry-run：本仓边界禁止开发期创建
 *     真实 GitHub issue；workflow 头注也写明配置期可用 --dry-run 验证；
 *   - actions/* 步骤（checkout/setup-node/setup-python/upload-artifact）
 *     无法本地执行，以等价断言覆盖：checkout=沙箱即检出结果（workflow
 *     文件随仓安装）、setup-node/python=本机工具链实跑、upload-artifact=
 *     产物路径逐一存在性核对。
 *
 * 环境要求：
 *   - Node.js 24（工具脚本与自身）；TS 夹具已 npm install（node_modules
 *     经 junction 复用，不复制）；
 *   - Python + PyYAML（YAML 语法解析；缺失时 pip install pyyaml）；
 *   - Git for Windows 的 bash.exe（system32 下的 bash 是 WSL，会被拒绝）；
 *   - py 路径优先复用夹具 .venv（mutmut 2.x），缺失时按 dev 依赖清单自动
 *     装配（需访问 PyPI 一次）。
 *
 * 用法:
 *   node scripts/test_workflow_templates.mjs [--lang ts|py|all] [--keep]
 * 选项:
 *   --lang <l>  只模拟一条 workflow：ts|typescript|javascript|js、
 *               py|python，all 为两条都跑（默认 all）
 *   --keep      保留沙箱目录便于排查（默认跑完即删并校验夹具未被污染）
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
const REPO_ROOT = path.resolve(__dirname, '..');

const TEMPLATE_TS = path.join(REPO_ROOT, 'templates', '.github', 'workflows', 'nightly-mutation-ts.yml');
const TEMPLATE_PY = path.join(REPO_ROOT, 'templates', '.github', 'workflows', 'nightly-mutation-py.yml');
const FIXTURE_TS = path.join(__dirname, 'fixtures', 'sample-ts');
const FIXTURE_PY = path.join(__dirname, 'fixtures', 'sample-py');

/** TS 沙箱 junction 的校验锚点：夹具 node_modules 里的 Stryker 入口。 */
const NODE_MODULES_CANARY = path.join(
  FIXTURE_TS, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker'
);

/** 模板头注「工具脚本随迁」清单（与 run 块引用集合断言相等）。 */
const TS_TOOL_SCRIPTS = ['parse-stryker-report.mjs', 'mutation-baseline.mjs', 'create-mutation-issues.mjs'];
const PY_TOOL_SCRIPTS = ['parse_mutmut_report.py', 'mutation-baseline.mjs', 'create-mutation-issues.mjs'];

/** 允许出现的 actions（版本大号钉位）。 */
const ALLOWED_ACTIONS = new Set([
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'actions/setup-python@v5',
  'actions/upload-artifact@v4'
]);

/** 模板头注文档口径：每晚 02:00 UTC。 */
const EXPECTED_CRON = '0 2 * * *';

/** 与夹具 pyproject.toml [dev] extras 一致的依赖范围（venv 自动装配用）。 */
const PY_DEV_DEPENDENCIES = ['pytest>=7.0,<9', 'mutmut>=2.4,<3'];

const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
const SPAWN_TIMEOUT_MS = {
  quick: 2 * 60 * 1000,
  install: 5 * 60 * 1000,
  stryker: 10 * 60 * 1000,
  mutmut: 30 * 60 * 1000,
  provision: 10 * 60 * 1000
};

/** --keep 时保留沙箱目录（供 main 按选项赋值）。 */
let KEEP_SANDBOXES = false;

/** Git Bash 路径（main 里解析一次）。 */
let BASH_EXE = null;

/** 复制夹具进沙箱时排除的条目（按 basename；.egg-info 按后缀）。 */
const COPY_EXCLUDED_NAMES = new Set([
  'node_modules', 'dist', 'reports', '.stryker-tmp', '.git', '.venv',
  '__pycache__', '.pytest_cache', '.mutmut-cache', '.mutmut-show-all.txt',
  'mutmut-results-export.json', 'unified-mutation-report.json',
  '.mutation-baseline.json', '.mutation-queue', '.equivalent-mutants.json'
]);

class CliError extends Error {}

/* ------------------------------------------------------------------ */
/* 基础断言与步骤记录                                                    */
/* ------------------------------------------------------------------ */

/**
 * 断言条件成立，失败时抛带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 记录一步结果；ctx.failed 后的后续步骤记 SKIP，force=true 的收尾步骤
 * （清理沙箱）照常执行。
 */
function step(results, ctx, label, fn, force = false) {
  if (ctx.failed && !force) {
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

/* ------------------------------------------------------------------ */
/* 子进程执行                                                           */
/* ------------------------------------------------------------------ */

/**
 * 以 Git Bash 执行 workflow 的 run 块文本（ubuntu runner 默认 shell 口径
 * 为 bash -e；不传 extraEnv 时继承本进程环境）。
 */
function runBashBlock(block, cwd, extraEnv, timeoutMs) {
  return spawnSync(BASH_EXE, ['-e', '-c', block], {
    encoding: 'utf8',
    windowsHide: true,
    cwd,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    maxBuffer: SPAWN_MAX_BUFFER,
    timeout: timeoutMs ?? SPAWN_TIMEOUT_MS.quick
  });
}

/**
 * 断言 bash 块退出码为 0，失败时带末段输出便于定位。
 */
function assertBashOk(run, label) {
  assertCase(
    run.status === 0,
    `${label} 应退出 0，实际 ${run.status}${run.error ? `（${run.error.message}）` : ''}：${(run.stderr || run.stdout || '').slice(-600)}`
  );
}

/**
 * 定位 Git for Windows 的 bash.exe；system32 的 bash 是 WSL，必须拒绝。
 */
function resolveGitBash() {
  const candidates = [
    'C:/Program Files/Git/bin/bash.exe',
    'C:/Program Files (x86)/Git/bin/bash.exe',
    'C:/Program Files/Git/usr/bin/bash.exe'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    '未找到 Git for Windows 的 bash.exe（C:/Program Files/Git/bin/bash.exe）。' +
    'system32 下的 bash 是 WSL 入口，不能用于执行 workflow run 块'
  );
}

/** YAML 语法解析片段：PyYAML safe_load，YAML 错误退出 3，缺 PyYAML 退出 4。 */
const PY_YAML_SNIPPET = [
  'import json, sys',
  'try:',
  '    import yaml',
  'except ImportError as err:',
  "    sys.stderr.write('PyYAML is required: pip install pyyaml (%s)\\n' % err)",
  '    sys.exit(4)',
  'try:',
  "    with open(sys.argv[1], encoding='utf-8') as fh:",
  '        doc = yaml.safe_load(fh)',
  'except yaml.YAMLError as err:',
  "    sys.stderr.write('YAML parse error: %s\\n' % err)",
  '    sys.exit(3)',
  'json.dump(doc, sys.stdout)'
].join('\n');

/**
 * 用 PyYAML（python 子进程）解析 workflow，返回 JS 对象。
 * json.dump 默认 ensure_ascii=True，中文以 \uXXXX 转义，规避控制台编码差。
 */
function parseWorkflowYaml(filePath) {
  const run = spawnSync('python', ['-c', PY_YAML_SNIPPET, filePath], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: SPAWN_MAX_BUFFER,
    timeout: SPAWN_TIMEOUT_MS.quick
  });
  assertCase(
    run.status === 0,
    `PyYAML 解析失败（退出码 ${run.status}）：${(run.stderr || '').slice(-400) || run.stdout}`
  );
  try {
    return JSON.parse(run.stdout);
  } catch (err) {
    throw new Error(`PyYAML 输出不是合法 JSON：${err.message}`);
  }
}

/**
 * 定位（必要时装配）Python 夹具的 venv，返回 venv 相关路径（与
 * test_nightly_loop.mjs 同一套约定：mutmut 2.x + pytest）。
 */
function ensurePythonVenv() {
  const binDir = path.join(FIXTURE_PY, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin');
  const venvPython = path.join(binDir, process.platform === 'win32' ? 'python.exe' : 'python');
  const mutmutExe = path.join(binDir, process.platform === 'win32' ? 'mutmut.exe' : 'mutmut');
  if (fs.existsSync(mutmutExe)) {
    return { binDir, provisioned: false };
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
  assertCase(fs.existsSync(mutmutExe), 'venv 装配后仍找不到 mutmut 可执行文件');
  return { binDir, provisioned: true };
}

/**
 * py 路径的 bash 环境变量：venv 优先（mutmut/python）+ 沙箱 src 供 mutmut 导入。
 */
function pyEnv(venv, sandbox) {
  return {
    PATH: `${venv.binDir}${path.delimiter}${process.env.PATH}`,
    PYTHONPATH: path.join(sandbox, 'src')
  };
}

/* ------------------------------------------------------------------ */
/* workflow 模型辅助                                                    */
/* ------------------------------------------------------------------ */

/**
 * 取 workflow 触发器。PyYAML 按 YAML 1.1 把裸 `on` 键解析成布尔 true
 * （GitHub 自己的解析器保留字符串键 `on`），两种形态都要认。
 */
function triggersOf(doc, wfName) {
  if (doc.on !== undefined) {
    return doc.on;
  }
  if (doc.true !== undefined) {
    return doc.true;
  }
  throw new Error(`${wfName}: 缺少 on: 触发器定义`);
}

/**
 * 展平全部步骤为 {job, index, ...step} 数组。
 */
function flattenSteps(doc, wfName) {
  const jobs = doc.jobs || {};
  const out = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    assertCase(job && Array.isArray(job.steps), `${wfName}: job ${jobName} 缺 steps 数组`);
    for (const [index, stepDef] of job.steps.entries()) {
      out.push({ job: jobName, index, ...stepDef });
    }
  }
  assertCase(out.length > 0, `${wfName}: 没有任何步骤`);
  return out;
}

/**
 * 按步骤名片段找 run 块文本，找不到或不是字符串时报错。
 */
function findRunBlock(doc, wfName, nameFragment) {
  const stepDef = flattenSteps(doc, wfName).find((entry) => entry.name === nameFragment);
  assertCase(stepDef !== undefined, `${wfName}: 找不到步骤「${nameFragment}」`);
  assertCase(typeof stepDef.run === 'string' && stepDef.run.trim().length > 0,
    `${wfName}: 步骤「${nameFragment}」缺 run 块`);
  return stepDef.run;
}

/**
 * 收集 run 块里引用的全部 scripts/ 路径（去重）。
 */
function collectScriptRefs(doc, wfName) {
  const refs = new Set();
  for (const stepDef of flattenSteps(doc, wfName)) {
    if (typeof stepDef.run !== 'string') {
      continue;
    }
    for (const match of stepDef.run.matchAll(/scripts\/[A-Za-z0-9][A-Za-z0-9._/-]*/g)) {
      refs.add(match[0]);
    }
  }
  return [...refs];
}

/**
 * 建 issue 步骤的 run 块注入 --dry-run（两个 if/else 分支各一处，共两处）。
 * 本仓边界禁止开发期创建真实 issue；workflow 头注也写明配置期用 --dry-run。
 */
function withDryRun(block, wfName) {
  const needle = 'create-mutation-issues.mjs';
  const occurrences = block.split(needle).length - 1;
  assertCase(occurrences === 2, `${wfName}: issue 步骤应恰有两处 create-mutation-issues.mjs 调用（if/else 各一），实际 ${occurrences}`);
  return block.split(needle).join(`${needle} --dry-run`);
}

/* ------------------------------------------------------------------ */
/* 沙箱组装（测试仓库 = 夹具 + 工具脚本副本 + workflow 安装）            */
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
      if (baseName.endsWith('.egg-info')) {
        return false;
      }
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
 * 按模板头注「随迁清单」复制工具脚本到沙箱 scripts/，并断言齐全。
 */
function copyToolScripts(sandbox, scriptNames, wfName) {
  const destDir = path.join(sandbox, 'scripts');
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of scriptNames) {
    const source = path.join(__dirname, name);
    assertCase(fs.existsSync(source), `${wfName}: 随迁脚本在本仓不存在：scripts/${name}`);
    fs.copyFileSync(source, path.join(destDir, name));
  }
}

/**
 * 把 workflow 模板安装到沙箱 .github/workflows/（等效 checkout 后的仓库）。
 */
function installWorkflow(sandbox, templatePath, wfFileName) {
  const dir = path.join(sandbox, '.github', 'workflows');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, wfFileName);
  fs.copyFileSync(templatePath, dest);
  assertCase(fs.existsSync(dest), `workflow 应已安装到沙箱：${dest}`);
  return dest;
}

/**
 * 清理沙箱：先摘 junction 再删树；校验夹具 node_modules 完好（--keep 保留）。
 */
function cleanupSandbox(sandbox, linkedNodeModules) {
  if (KEEP_SANDBOXES) {
    return `沙箱保留（--keep）：${sandbox}`;
  }
  const junction = path.join(sandbox, 'node_modules');
  if (fs.existsSync(junction)) {
    fs.rmSync(junction, { recursive: true, force: true });
  }
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

/* ------------------------------------------------------------------ */
/* 产物契约断言                                                         */
/* ------------------------------------------------------------------ */

/**
 * 校验统一变异体报告契约要点（docs/formats/unified-mutation-report.md v1.1）。
 * 返回 { score, mutants } 供后续步骤断言。
 */
function assertUnifiedReport(data, expectedTool, filePath) {
  assertCase(data.tool === expectedTool, `${filePath}: tool 应为 ${expectedTool}，实际 ${JSON.stringify(data.tool)}`);
  assertCase(typeof data.timestamp === 'string' && data.timestamp.length > 0, `${filePath}: timestamp 应为非空字符串`);
  assertCase(Array.isArray(data.mutants) && data.mutants.length > 0, `${filePath}: mutants 应为非空数组`);
  assertCase(
    typeof data.score === 'number' && data.score >= 0 && data.score <= 100,
    `${filePath}: score 应为 [0,100] 内的数字，实际 ${JSON.stringify(data.score)}`
  );
  for (const mutant of data.mutants) {
    for (const field of ['id', 'file', 'line', 'column', 'mutationType', 'original', 'mutated', 'status']) {
      assertCase(
        mutant[field] !== undefined && mutant[field] !== null && mutant[field] !== '',
        `${filePath}: mutant 缺字段 ${field}`
      );
    }
    assertCase(mutant.status === 'Survived', `${filePath}: 统一报告只应含存活变异体`);
  }
  return { score: data.score, mutants: data.mutants };
}

/**
 * 校验基线文件契约要点并返回 baseline 对象（契约 v1.0）。
 */
function assertBaselineFile(filePath, wfName) {
  const data = readJson(filePath);
  assertCase(data.version === '1.0', `${wfName}: 基线 version 应为 "1.0"`);
  assertCase(typeof data.updated === 'string' && data.updated.length > 0, `${wfName}: 基线应有 updated 时间戳`);
  assertCase(data.baseline && typeof data.baseline === 'object', `${wfName}: 基线应含 baseline 对象`);
  for (const field of ['score', 'killed', 'survived', 'total']) {
    assertCase(typeof data.baseline[field] === 'number', `${wfName}: baseline.${field} 应为数字`);
  }
  assertCase(data.baseline.total >= 1, `${wfName}: baseline.total 应 >= 1`);
  return data.baseline;
}

/**
 * 递归收集目录下的全部文件相对路径（队列文件按源码目录分层嵌套，
 * 如 .mutation-queue/src/calculator.ts.json）。
 */
function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 读取 .mutation-queue/ 下全部队列文件并校验要点，返回 Map(file -> mutants)。
 */
function assertQueueFiles(sandbox, wfName) {
  const queueDir = path.join(sandbox, '.mutation-queue');
  assertCase(fs.existsSync(queueDir), `${wfName}: .mutation-queue/ 应存在`);
  const queueFiles = listFilesRecursive(queueDir).filter((name) => name.endsWith('.json'));
  assertCase(queueFiles.length > 0, `${wfName}: .mutation-queue/ 应至少有一个队列 JSON（含子目录）`);
  const mutantsByFile = new Map();
  for (const filePath of queueFiles) {
    const queue = readJson(filePath);
    const displayName = path.relative(sandbox, filePath);
    assertCase(queue.version === '1.0', `${wfName}: 队列文件 ${displayName} version 应为 "1.0"`);
    assertCase(typeof queue.file === 'string' && queue.file.length > 0, `${wfName}: 队列文件 ${displayName} 应有 file 字段`);
    assertCase(Array.isArray(queue.mutants) && queue.mutants.length > 0, `${wfName}: 队列文件 ${displayName} 应有非空 mutants`);
    mutantsByFile.set(queue.file, queue.mutants);
  }
  return mutantsByFile;
}

/**
 * 核对 workflow artifacts path 配置与实际产物一一对应（upload-artifact 的
 * 本地等效断言；目录项要求至少一个队列 JSON）。
 */
function assertArtifactPaths(artifactPaths, sandbox, wfName) {
  assertCase(artifactPaths.length > 0, `${wfName}: artifacts path 配置为空`);
  for (const entry of artifactPaths) {
    const target = path.join(sandbox, entry);
    assertCase(fs.existsSync(target), `${wfName}: artifacts 路径应存在：${entry}`);
    if (entry.endsWith('/')) {
      const files = listFilesRecursive(target).filter((name) => name.endsWith('.json'));
      assertCase(files.length > 0, `${wfName}: artifacts 目录应有队列 JSON（含子目录）：${entry}`);
    }
  }
  return `${artifactPaths.length} 个 artifacts 路径全部在场`;
}

/**
 * 断言被豁免的变异体 id 不在任何队列文件里，且豁免后仍有存活组。
 */
function assertExemptedAbsent(mutantsByFile, targetId, wfName) {
  let remaining = 0;
  for (const mutants of mutantsByFile.values()) {
    remaining += mutants.length;
    assertCase(
      !mutants.some((mutant) => mutant.id === targetId),
      `${wfName}: 被豁免的 ${targetId} 不应出现在任何队列文件`
    );
  }
  assertCase(remaining > 0, `${wfName}: 豁免后应仍有待补测变异体`);
}

/* ------------------------------------------------------------------ */
/* 结构校验用例                                                         */
/* ------------------------------------------------------------------ */

/**
 * YAML 语法解析（VAL-CONFIG-001 / 预期行为「验证 workflow 语法」）。
 * 解析结果存 state.docs 供后续用例复用。
 */
function caseYamlParse(results, state) {
  const ctx = { failed: false };
  for (const [lang, file] of [['ts', TEMPLATE_TS], ['py', TEMPLATE_PY]]) {
    step(results, ctx, `[yaml] parse nightly-mutation-${lang}.yml`, () => {
      assertCase(fs.existsSync(file), `模板应存在：${file}`);
      const doc = parseWorkflowYaml(file);
      assertCase(doc && typeof doc === 'object' && !Array.isArray(doc), 'workflow 顶层应是映射');
      assertCase(typeof doc.name === 'string' && doc.name.length > 0, 'workflow 应有 name');
      state.docs.set(lang, doc);
      return `PyYAML safe_load 通过（name=${doc.name}）`;
    });
  }
}

/**
 * 触发器、权限、runner、步骤形状与关键 if 条件
 * （VAL-CONFIG-002 / 003 / 012，预期行为「步骤齐全」「GITHUB_TOKEN 正确」前置）。
 */
function caseWorkflowStructure(results, state) {
  const ctx = { failed: false };
  step(results, ctx, '[structure] triggers/permissions/steps', () => {
    const notes = [];
    for (const [lang, wfName] of [['ts', 'nightly-mutation-ts'], ['py', 'nightly-mutation-py']]) {
      const doc = state.docs.get(lang);
      assertCase(doc !== undefined, `${wfName}: 未解析（前序失败）`);
      const triggers = triggersOf(doc, wfName);

      // 定时触发 + 手动触发（头注口径：每晚 02:00 UTC）
      assertCase(Array.isArray(triggers.schedule) && triggers.schedule.length === 1,
        `${wfName}: 应有且只有一个 schedule 触发器`);
      assertCase(triggers.schedule[0].cron === EXPECTED_CRON,
        `${wfName}: cron 应为 "${EXPECTED_CRON}"，实际 ${JSON.stringify(triggers.schedule[0].cron)}`);
      assertCase('workflow_dispatch' in triggers, `${wfName}: 应支持 workflow_dispatch 手动触发`);

      // 最小权限：读代码 + 写 issues
      assertCase(
        doc.permissions && doc.permissions.contents === 'read' && doc.permissions.issues === 'write',
        `${wfName}: permissions 应为 contents: read + issues: write`
      );

      const steps = flattenSteps(doc, wfName);
      for (const [jobName, job] of Object.entries(doc.jobs)) {
        assertCase(job['runs-on'] === 'ubuntu-latest', `${wfName}: job ${jobName} 应 runs-on ubuntu-latest（模拟执行按 bash 口径）`);
      }
      for (const stepDef of steps) {
        assertCase(typeof stepDef.name === 'string' && stepDef.name.length > 0,
          `${wfName}: 每个步骤应有 name`);
        assertCase(typeof stepDef.run === 'string' || typeof stepDef.uses === 'string',
          `${wfName}: 步骤「${stepDef.name}」缺 run/uses`);
        assertCase(!(typeof stepDef.run === 'string' && typeof stepDef.uses === 'string'),
          `${wfName}: 步骤「${stepDef.name}」run 与 uses 互斥`);
        if (typeof stepDef.uses === 'string') {
          assertCase(ALLOWED_ACTIONS.has(stepDef.uses),
            `${wfName}: uses ${stepDef.uses} 不在白名单（升级版本时同步更新本脚本白名单与本验证）`);
        }
      }

      // 基线互补条件：每轮必有其一执行，不静默跳过
      const initStep = steps.find((entry) => typeof entry.run === 'string' && /mutation-baseline\.mjs init/.test(entry.run));
      const checkStep = steps.find((entry) => typeof entry.run === 'string' && /mutation-baseline\.mjs check/.test(entry.run));
      assertCase(initStep !== undefined, `${wfName}: 缺 baseline init 步骤`);
      assertCase(checkStep !== undefined, `${wfName}: 缺 baseline check 步骤`);
      assertCase(initStep.if === "hashFiles('.mutation-baseline.json') == ''",
        `${wfName}: init 步骤条件应为 hashFiles 判空，实际 ${JSON.stringify(initStep.if)}`);
      assertCase(checkStep.if === "hashFiles('.mutation-baseline.json') != ''",
        `${wfName}: check 步骤条件应为 hashFiles 判非空，实际 ${JSON.stringify(checkStep.if)}`);

      // 工具链钉位
      const nodeStep = steps.find((entry) => entry.uses === 'actions/setup-node@v4');
      assertCase(nodeStep !== undefined && nodeStep.with && nodeStep.with['node-version'] === '24',
        `${wfName}: setup-node 应钉 Node 24（工具链验证版本）`);
      if (lang === 'py') {
        const pythonStep = steps.find((entry) => entry.uses === 'actions/setup-python@v5');
        assertCase(pythonStep !== undefined && pythonStep.with && pythonStep.with['python-version'] === '3.12',
          `${wfName}: setup-python 应钉 Python 3.12（解析器要求 3.8+）`);
      }

      notes.push(`${wfName}: ${steps.length} 步`);
    }
    return notes.join('；');
  });
}

/**
 * run 块引用的 scripts/ 脚本在本仓都存在，且与模板头注「随迁清单」完全一致
 * （预期行为「验证所有步骤可找到对应的脚本」；多了冗余、少了断链都不行）。
 */
function caseScriptReferences(results, state) {
  const ctx = { failed: false };
  step(results, ctx, '[structure] run 块脚本引用与随迁清单一致', () => {
    const notes = [];
    const expected = new Map([['ts', TS_TOOL_SCRIPTS], ['py', PY_TOOL_SCRIPTS]]);
    for (const [lang, wfName] of [['ts', 'nightly-mutation-ts'], ['py', 'nightly-mutation-py']]) {
      const doc = state.docs.get(lang);
      const refs = collectScriptRefs(doc, wfName);
      assertCase(refs.length > 0, `${wfName}: run 块未引用任何 scripts/ 脚本`);
      for (const ref of refs) {
        assertCase(fs.existsSync(path.join(REPO_ROOT, ref)), `${wfName}: 引用的脚本不存在：${ref}`);
      }
      const refSet = new Set(refs);
      const listSet = new Set(expected.get(lang));
      for (const name of listSet) {
        assertCase(refSet.has(`scripts/${name}`), `${wfName}: 随迁清单中的 ${name} 未被任何 run 块引用（头注与步骤失同步）`);
      }
      for (const ref of refSet) {
        assertCase(listSet.has(ref.slice('scripts/'.length)), `${wfName}: run 块引用的 ${ref} 不在头注随迁清单（目标项目会断链）`);
      }
      notes.push(`${wfName}: ${refSet.size} 个脚本引用全部可解析`);
    }
    return notes.join('；');
  });
}

/**
 * secrets.GITHUB_TOKEN 引用（VAL-CONFIG-004）：
 * 经 GH_TOKEN env 注入建 issue 步骤，每 workflow 恰一处，表达式形态正确。
 */
function caseTokenReference(results, state) {
  const ctx = { failed: false };
  step(results, ctx, '[structure] secrets.GITHUB_TOKEN 引用', () => {
    const notes = [];
    for (const [lang, wfName] of [['ts', 'nightly-mutation-ts'], ['py', 'nightly-mutation-py']]) {
      const doc = state.docs.get(lang);
      const tokenSteps = flattenSteps(doc, wfName)
        .filter((entry) => entry.env && entry.env.GH_TOKEN !== undefined);
      assertCase(tokenSteps.length === 1, `${wfName}: 应恰有一个步骤注入 GH_TOKEN，实际 ${tokenSteps.length}`);
      const stepDef = tokenSteps[0];
      assertCase(stepDef.env.GH_TOKEN === '${{ secrets.GITHUB_TOKEN }}',
        `${wfName}: GH_TOKEN 应为 \${{ secrets.GITHUB_TOKEN }}，实际 ${JSON.stringify(stepDef.env.GH_TOKEN)}`);
      assertCase(typeof stepDef.run === 'string' && stepDef.run.includes('create-mutation-issues.mjs'),
        `${wfName}: GH_TOKEN 应注入建 issue 步骤`);
      notes.push(`${wfName}: 建 issue 步骤经 GH_TOKEN 引用仓库自带 token`);
    }
    return notes.join('；');
  });
}

/**
 * upload-artifact 配置（VAL-CONFIG-005）+ 提取 path 清单供模拟用例核对。
 */
function caseArtifactUpload(results, state) {
  const ctx = { failed: false };
  step(results, ctx, '[structure] upload-artifact 配置', () => {
    const notes = [];
    for (const [lang, wfName] of [['ts', 'nightly-mutation-ts'], ['py', 'nightly-mutation-py']]) {
      const doc = state.docs.get(lang);
      const uploadSteps = flattenSteps(doc, wfName)
        .filter((entry) => typeof entry.uses === 'string' && entry.uses.startsWith('actions/upload-artifact@'));
      assertCase(uploadSteps.length === 1, `${wfName}: 应恰有一个 upload-artifact 步骤，实际 ${uploadSteps.length}`);
      const stepDef = uploadSteps[0];
      assertCase(stepDef.uses === 'actions/upload-artifact@v4', `${wfName}: upload-artifact 应钉 v4`);
      assertCase(stepDef.if === 'always()', `${wfName}: artifacts 应 if: always()（失败也上传便于排查）`);
      const withSection = stepDef.with || {};
      assertCase(typeof withSection.name === 'string' && withSection.name.length > 0, `${wfName}: artifacts 应有 name`);
      assertCase(typeof withSection.path === 'string' && withSection.path.trim().length > 0, `${wfName}: artifacts 应有 path`);
      assertCase(withSection['if-no-files-found'] === 'warn', `${wfName}: if-no-files-found 应为 warn`);
      assertCase(withSection['retention-days'] === 30, `${wfName}: retention-days 应为 30`);
      const paths = withSection.path.split('\n').map((line) => line.trim()).filter(Boolean);
      state.artifactPaths.set(lang, paths);
      notes.push(`${wfName}: ${withSection.name}（${paths.length} 路径）`);
    }
    return notes.join('；');
  });
}

/* ------------------------------------------------------------------ */
/* TS workflow 模拟执行（VAL-CROSS-005 主体）                            */
/* ------------------------------------------------------------------ */

function caseSimulateTsWorkflow(base, results, state) {
  const ctx = { failed: false };
  const sandbox = path.join(base, 'sample-ts');
  const wfName = 'nightly-mutation-ts';

  step(results, ctx, '[ts-wf] assemble test repo', () => {
    assertCase(BASH_EXE !== null, 'Git Bash 未解析');
    assertCase(fs.existsSync(NODE_MODULES_CANARY),
      `TS 夹具缺少 node_modules（${NODE_MODULES_CANARY}），请先在 fixtures/sample-ts 执行 npm install`);
    const doc = state.docs.get('ts');
    assertCase(doc !== undefined, 'ts workflow 未解析');
    makeSandbox(base, 'sample-ts', FIXTURE_TS);
    linkNodeModules(sandbox);
    copyToolScripts(sandbox, TS_TOOL_SCRIPTS, wfName);
    installWorkflow(sandbox, TEMPLATE_TS, `${wfName}.yml`);
    return `测试仓库 ${sandbox}（夹具 + ${TS_TOOL_SCRIPTS.length} 个随迁脚本 + workflow 安装到 .github/workflows/）`;
  });

  // 步骤 3 Install dependencies：npm ci 追加 --dry-run（真实 ci 会先删
  // node_modules，破坏夹具 junction；--dry-run 校验 lockfile 同步）
  step(results, ctx, '[ts-wf] npm ci (dry-run)', () => {
    const block = findRunBlock(state.docs.get('ts'), wfName, 'Install dependencies');
    assertCase(block.trim() === 'npm ci', `${wfName}: 安装步骤应为 npm ci，实际 ${JSON.stringify(block)}`);
    assertBashOk(runBashBlock(`${block} --dry-run`, sandbox, null, SPAWN_TIMEOUT_MS.install), 'npm ci --dry-run');
    return 'lockfile 与 package.json 同步（依赖可安装性由夹具 node_modules + Stryker 实跑证明）';
  });

  // 步骤 4 Run mutation tests (Stryker)：原文执行
  step(results, ctx, '[ts-wf] npx stryker run', () => {
    const block = findRunBlock(state.docs.get('ts'), wfName, 'Run mutation tests (Stryker)');
    assertCase(block.trim() === 'npx stryker run', `${wfName}: 变异步骤应为 npx stryker run，实际 ${JSON.stringify(block)}`);
    assertBashOk(runBashBlock(block, sandbox, null, SPAWN_TIMEOUT_MS.stryker), 'npx stryker run');
    const report = readJson(path.join(sandbox, 'reports', 'mutation', 'mutation.json'));
    const totals = Object.values(report.files || {}).flatMap((entry) => entry.mutants || []);
    assertCase(totals.length > 0, 'Stryker 报告应含变异体');
    return `Stryker 退出 0，报告 ${totals.length} 个变异体`;
  });

  // 步骤 5 解析统一报告：原文执行（相对路径与 CI 一致）
  const parsed = { score: 0, mutants: [] };
  step(results, ctx, '[ts-wf] parse stryker report', () => {
    const block = findRunBlock(state.docs.get('ts'), wfName, 'Parse surviving mutants into unified report');
    assertBashOk(runBashBlock(block, sandbox, null, SPAWN_TIMEOUT_MS.quick), 'parse-stryker-report');
    const unified = assertUnifiedReport(
      readJson(path.join(sandbox, 'unified-mutation-report.json')), 'stryker',
      path.join(sandbox, 'unified-mutation-report.json')
    );
    Object.assign(parsed, unified);
    return `统一报告 ${unified.mutants.length} 个存活变异体，score=${unified.score}`;
  });

  // 步骤 6 首轮 init（hashFiles 判空分支；注意工作流未传 --output，靠工具
  // 默认落 cwd/.mutation-baseline.json，本步同时验证该默认行为）
  step(results, ctx, '[ts-wf] baseline init (first run)', () => {
    const block = findRunBlock(state.docs.get('ts'), wfName, 'Initialize baseline (first run only)');
    assertCase(!fs.existsSync(path.join(sandbox, '.mutation-baseline.json')),
      '沙箱不应预置基线（模拟首轮）');
    assertBashOk(runBashBlock(block, sandbox, null, SPAWN_TIMEOUT_MS.quick), 'baseline init');
    const baseline = assertBaselineFile(path.join(sandbox, '.mutation-baseline.json'), wfName);
    assertCase(
      Math.abs(baseline.score - parsed.score) <= 1e-9,
      `${wfName}: 基线分数 ${baseline.score} 应与统一报告分数 ${parsed.score} 一致`
    );
    return `首轮基线冻结 score=${baseline.score}（无 --output 默认落仓库根）`;
  });

  // 步骤 7 常规 check（hashFiles 判非空分支，模拟下一夜：同分应 PASS）
  step(results, ctx, '[ts-wf] baseline check (next night)', () => {
    const block = findRunBlock(state.docs.get('ts'), wfName, 'Check baseline (ratchet; exit 2 on regression)');
    const run = runBashBlock(block, sandbox, null, SPAWN_TIMEOUT_MS.quick);
    assertBashOk(run, 'baseline check');
    assertCase(/PASS/.test(run.stdout), `baseline check 应输出 PASS，实际：${run.stdout}`);
    return '同分检查通过（exit 0，回归拒绝路径由 test_nightly_loop 覆盖）';
  });

  // 步骤 8 建 issue：注入 --dry-run（边界：不建真实 issue），else 分支（无豁免）
  step(results, ctx, '[ts-wf] create issues (dry-run, no exemptions)', () => {
    const block = findRunBlock(state.docs.get('ts'), wfName, 'Create per-file mutation issues');
    assertCase(!block.includes('--dry-run'), `${wfName}: workflow 原文不应自带 --dry-run（默认实跑）`);
    const run = runBashBlock(withDryRun(block, wfName), sandbox,
      { GH_TOKEN: 'dry-run-no-auth' }, SPAWN_TIMEOUT_MS.quick);
    assertBashOk(run, 'create-issues (dry-run)');
    const mutantsByFile = assertQueueFiles(sandbox, wfName);
    const distinctFiles = new Set(parsed.mutants.map((mutant) => mutant.file)).size;
    assertCase(mutantsByFile.size === distinctFiles,
      `应按 ${distinctFiles} 个文件分组，实际 ${mutantsByFile.size}`);
    return `${mutantsByFile.size} 个队列组（GH_TOKEN env 接线与 workflow 一致）`;
  });

  // 步骤 8 的 if 分支：存在 .equivalent-mutants.json 时自动加 --exemptions
  step(results, ctx, '[ts-wf] create issues (dry-run, with exemptions)', () => {
    const target = parsed.mutants[0];
    const exemptionsPath = path.join(sandbox, '.equivalent-mutants.json');
    fs.writeFileSync(exemptionsPath, JSON.stringify({
      version: '1.0',
      exemptions: [{
        id: 'equiv-001',
        file: target.file,
        line: target.line,
        mutationType: target.mutationType,
        reason: 'workflow 模板验证用豁免：test_workflow_templates 验证 if 分支的豁免过滤链路。',
        exemptedBy: 'test_workflow_templates',
        exemptedAt: `${new Date().toISOString().slice(0, 19)}Z`,
        reviewRequired: false
      }]
    }, null, 2));
    const block = findRunBlock(state.docs.get('ts'), wfName, 'Create per-file mutation issues');
    // CI 每晚都是全新 checkout，.mutation-queue/ 不入库：上一轮的队列文件
    // 不存在。本地连续两轮时，整组被豁免的旧队列文件会残留（工具按本轮
    // 分组重写、不追溯清理消失的组），先清空以对齐 CI 语义。
    fs.rmSync(path.join(sandbox, '.mutation-queue'), { recursive: true, force: true });
    const run = runBashBlock(withDryRun(block, wfName), sandbox,
      { GH_TOKEN: 'dry-run-no-auth' }, SPAWN_TIMEOUT_MS.quick);
    assertBashOk(run, 'create-issues with exemptions (dry-run)');
    assertExemptedAbsent(assertQueueFiles(sandbox, wfName), target.id, wfName);
    return `豁免 ${target.id} 已被 if 分支的 --exemptions 过滤出队列`;
  });

  // 步骤 9 artifacts：upload-artifact 的本地等效断言
  step(results, ctx, '[ts-wf] artifacts present', () => {
    const detail = assertArtifactPaths(state.artifactPaths.get('ts'), sandbox, wfName);
    return detail;
  });

  step(results, ctx, '[ts-wf] cleanup', () => cleanupSandbox(sandbox, true), true);
}

/* ------------------------------------------------------------------ */
/* PY workflow 模拟执行                                                  */
/* ------------------------------------------------------------------ */

function caseSimulatePyWorkflow(base, results, state) {
  const ctx = { failed: false };
  const sandbox = path.join(base, 'sample-py');
  const wfName = 'nightly-mutation-py';
  const doc = state.docs.get('py');
  let venv = null;

  step(results, ctx, '[py-wf] venv + assemble test repo', () => {
    assertCase(BASH_EXE !== null, 'Git Bash 未解析');
    venv = ensurePythonVenv();
    assertCase(doc !== undefined, 'py workflow 未解析');
    makeSandbox(base, 'sample-py', FIXTURE_PY);
    copyToolScripts(sandbox, PY_TOOL_SCRIPTS, wfName);
    installWorkflow(sandbox, TEMPLATE_PY, `${wfName}.yml`);
    return `测试仓库 ${sandbox}${venv.provisioned ? '（venv 为本轮自动装配）' : ''}`;
  });

  // 步骤 5 mutmut run（continue-on-error：存活变异体导致的非零码要容忍，
  // 与 test_nightly_loop 相同按位标志裁决：奇数退出码才是致命错误位）
  step(results, ctx, '[py-wf] mutmut run', () => {
    const block = findRunBlock(doc, wfName, 'Run mutation tests (mutmut)');
    assertCase(block.trim() === 'mutmut run', `${wfName}: 变异步骤应为 mutmut run，实际 ${JSON.stringify(block)}`);
    const run = runBashBlock(block, sandbox, pyEnv(venv, sandbox), SPAWN_TIMEOUT_MS.mutmut);
    assertCase(run.status !== null, `mutmut run 未能执行：${run.error}`);
    assertCase((run.status & 1) === 0,
      `mutmut run 命中致命错误位（奇数退出码 ${run.status}）：${(run.stderr || run.stdout || '').slice(-600)}`);
    assertCase(fs.existsSync(path.join(sandbox, '.mutmut-cache')), 'mutmut run 后应生成 .mutmut-cache');
    return `mutmut 退出 ${run.status}（存活变异体位，预期；workflow 用 continue-on-error 容忍）`;
  });

  // 步骤 6 导出结果 JSON（heredoc 原文执行；此前从未被真实执行过，
  // test_nightly_loop 是用 JS 复刻的等价逻辑）
  step(results, ctx, '[py-wf] export results JSON', () => {
    const block = findRunBlock(doc, wfName, 'Export mutmut results JSON (baseline input)');
    assertBashOk(runBashBlock(block, sandbox, pyEnv(venv, sandbox), SPAWN_TIMEOUT_MS.quick), 'export mutmut results');
    const exportData = readJson(path.join(sandbox, 'mutmut-results-export.json'));
    const expectedStatuses = ['killed', 'timeout', 'survived', 'suspicious', 'skipped', 'untested'];
    for (const statusName of expectedStatuses) {
      assertCase(Array.isArray(exportData[statusName]), `导出应含 ${statusName} 数组`);
      for (const id of exportData[statusName]) {
        assertCase(typeof id === 'string' && id.length > 0, `导出 ${statusName} 应为字符串数组`);
      }
    }
    const total = expectedStatuses.reduce((sum, key) => sum + exportData[key].length, 0);
    assertCase(total > 0, '导出各类别合计应为正');
    return `导出 killed=${exportData.killed.length} survived=${exportData.survived.length} total=${total}`;
  });

  // 步骤 7 show all 捕获 + 缓存解析（原文执行）
  const parsed = { score: 0, mutants: [] };
  step(results, ctx, '[py-wf] show + parse cache', () => {
    const block = findRunBlock(doc, wfName, 'Parse surviving mutants into unified report');
    assertBashOk(runBashBlock(block, sandbox, pyEnv(venv, sandbox), SPAWN_TIMEOUT_MS.quick), 'show all + parse');
    assertCase(fs.existsSync(path.join(sandbox, '.mutmut-show-all.txt')), '应捕获 .mutmut-show-all.txt');
    const unified = assertUnifiedReport(
      readJson(path.join(sandbox, 'unified-mutation-report.json')), 'mutmut',
      path.join(sandbox, 'unified-mutation-report.json')
    );
    Object.assign(parsed, unified);
    return `统一报告 ${unified.mutants.length} 个存活变异体，score=${unified.score}`;
  });

  // 步骤 8 首轮 init（无 --output，默认落仓库根；输入为导出 JSON）
  step(results, ctx, '[py-wf] baseline init (first run)', () => {
    const block = findRunBlock(doc, wfName, 'Initialize baseline (first run only)');
    assertCase(!fs.existsSync(path.join(sandbox, '.mutation-baseline.json')), '沙箱不应预置基线（模拟首轮）');
    assertBashOk(runBashBlock(block, sandbox, null, SPAWN_TIMEOUT_MS.quick), 'baseline init');
    const baseline = assertBaselineFile(path.join(sandbox, '.mutation-baseline.json'), wfName);
    const exportData = readJson(path.join(sandbox, 'mutmut-results-export.json'));
    const total = Object.values(exportData).reduce((sum, ids) => sum + ids.length, 0);
    assertCase(baseline.total === total, `${wfName}: baseline.total ${baseline.total} 应与导出合计 ${total} 一致`);
    return `首轮基线冻结 score=${baseline.score} killed=${baseline.killed} total=${baseline.total}`;
  });

  // 步骤 9 常规 check（hashFiles 判非空分支，模拟下一夜：同分应 PASS）
  step(results, ctx, '[py-wf] baseline check (next night)', () => {
    const block = findRunBlock(doc, wfName, 'Check baseline (ratchet; exit 2 on regression)');
    const run = runBashBlock(block, sandbox, null, SPAWN_TIMEOUT_MS.quick);
    assertBashOk(run, 'baseline check');
    assertCase(/PASS/.test(run.stdout), `baseline check 应输出 PASS，实际：${run.stdout}`);
    return '同分检查通过（exit 0）';
  });

  // 步骤 10 建 issue：注入 --dry-run（else 分支，无豁免）
  step(results, ctx, '[py-wf] create issues (dry-run, no exemptions)', () => {
    const block = findRunBlock(doc, wfName, 'Create per-file mutation issues');
    assertCase(!block.includes('--dry-run'), `${wfName}: workflow 原文不应自带 --dry-run（默认实跑）`);
    const run = runBashBlock(withDryRun(block, wfName), sandbox,
      { GH_TOKEN: 'dry-run-no-auth' }, SPAWN_TIMEOUT_MS.quick);
    assertBashOk(run, 'create-issues (dry-run)');
    const mutantsByFile = assertQueueFiles(sandbox, wfName);
    const distinctFiles = new Set(parsed.mutants.map((mutant) => mutant.file)).size;
    assertCase(mutantsByFile.size === distinctFiles,
      `应按 ${distinctFiles} 个文件分组，实际 ${mutantsByFile.size}`);
    return `${mutantsByFile.size} 个队列组`;
  });

  // 步骤 11 artifacts：upload-artifact 的本地等效断言
  step(results, ctx, '[py-wf] artifacts present', () => {
    const detail = assertArtifactPaths(state.artifactPaths.get('py'), sandbox, wfName);
    return detail;
  });

  step(results, ctx, '[py-wf] cleanup', () => cleanupSandbox(sandbox, false), true);
}

/* ------------------------------------------------------------------ */
/* CLI 参数与汇总                                                       */
/* ------------------------------------------------------------------ */

const LANG_ALIASES = {
  ts: 'ts', typescript: 'ts', javascript: 'ts', js: 'ts',
  py: 'py', python: 'py'
};

/**
 * 解析命令行参数；非法用法抛 CliError。
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
  process.stdout.write(`Usage: node scripts/test_workflow_templates.mjs [--lang ts|py|all] [--keep]\n\nValidate the GitHub Actions workflow templates (VAL-CROSS-005): structural checks\n(YAML parse, triggers, permissions, script references, GITHUB_TOKEN, artifacts)\nplus a simulated run of every run: block inside fixture-based test repos via\nGit Bash (the ubuntu runner default shell).\n\nOptions:\n  --lang <l>  Simulate one workflow only: ts|typescript|javascript|js, py|python, or all (default: all)\n  --keep      Keep the sandbox directories for debugging (default: removed and verified)\n  -h, --help  Show this help and exit\n\nExit codes:\n  0  all steps passed\n  1  any step failed/skipped, or bad arguments\n`);
}

/**
 * 打印汇总表并返回是否存在失败。
 */
function printSummary(results) {
  const width = Math.max(...results.map((entry) => entry.label.length), 20);
  for (const entry of results) {
    const mark = entry.status === 'PASS' ? '✓' : entry.status === 'FAIL' ? '✗' : '·';
    process.stdout.write(`${mark} ${entry.label.padEnd(width)}  ${entry.status}${entry.detail ? `  ${entry.detail}` : ''}\n`);
  }
  const failed = results.filter((entry) => entry.status === 'FAIL').length;
  const skipped = results.filter((entry) => entry.status === 'SKIP').length;
  const passed = results.filter((entry) => entry.status === 'PASS').length;
  process.stdout.write(`\n${passed} passed, ${failed} failed, ${skipped} skipped (共 ${results.length} 步)\n`);
  if (failed > 0) {
    process.stderr.write('存在失败步骤；用 --keep 保留沙箱排查后删除。\n');
  }
  return failed === 0 && skipped === 0;
}

/**
 * 入口：解析参数 → 结构校验 → 模拟执行 → 汇总退出码。
 */
function main() {
  let options;
  try {
    options = parseArgv(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n${err instanceof CliError ? 'Run with --help for usage.\n' : ''}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }
  KEEP_SANDBOXES = options.keep;

  const results = [];
  const state = { docs: new Map(), artifactPaths: new Map() };
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-templates-'));
  try {
    step(results, { failed: false }, '[shared] git-bash', () => {
      BASH_EXE = resolveGitBash();
      return BASH_EXE;
    });
    caseYamlParse(results, state);
    caseWorkflowStructure(results, state);
    caseScriptReferences(results, state);
    caseTokenReference(results, state);
    caseArtifactUpload(results, state);
    if (options.langs.includes('ts')) {
      caseSimulateTsWorkflow(base, results, state);
    }
    if (options.langs.includes('py')) {
      caseSimulatePyWorkflow(base, results, state);
    }
  } finally {
    if (!KEEP_SANDBOXES) {
      try {
        fs.rmSync(base, { recursive: true, force: true });
      } catch {
        // 汇总阶段报告；不影响退出码判定（各用例清理已自行断言）
      }
    }
  }
  const allPassed = printSummary(results);
  process.exitCode = allPassed ? 0 : 1;
}

main();
