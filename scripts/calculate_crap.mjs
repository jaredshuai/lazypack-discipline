/**
 * scripts/calculate_crap.mjs
 *
 * CRAP 计算器：读取覆盖率与圈复杂度 JSON 报告，按公式
 *   CRAP = complexity² × (1 − coverage)³ + complexity
 * 计算每个函数的 CRAP 值，上报达到或超过阈值的函数清单。
 * 输出为文本摘要 + JSON 报告；全部达标退出码 0，有违规或出错退出码 1。未接 hook/CI。
 *
 * 用法:
 *   node scripts/calculate_crap.mjs --coverage <path> --complexity <path> \
 *     [--threshold <number>] [--lang <ts|py>] [--output <path>] [--help]
 *
 * 报告格式（--lang 决定解析器，见 printHelp）:
 *   ts: c8 覆盖率 JSON + typhonjs-escomplex 复杂度 JSON
 *   py: pytest-cov 覆盖率 JSON + radon cc -j 复杂度 JSON
 */

import fs from 'node:fs';

/** 默认 CRAP 阈值（Uncle Bob 对 AI 生成代码的建议值）。 */
const DEFAULT_THRESHOLD = 6;

/** 语言别名到解析器族的映射。 */
const LANG_ALIASES = {
  ts: 'ts',
  typescript: 'ts',
  javascript: 'ts',
  js: 'ts',
  py: 'py',
  python: 'py'
};

/** 需要取值的命令行旗标。 */
const VALUE_FLAGS = new Set(['--coverage', '--complexity', '--threshold', '--lang', '--output']);

/**
 * CLI 用法/输入错误：只向 stderr 输出 message 并以退出码 1 结束。
 */
class CliError extends Error {}

/**
 * 把数值四舍五入到两位小数，规避浮点尾差。
 * @param {number} value - 原始数值
 * @returns {number} 两位小数数值
 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 把百分比折算并夹取到 [0, 1] 区间。
 * @param {number} pct - 0-100 的百分比
 * @returns {number} 0-1 的覆盖率分数
 */
function clamp01(fraction) {
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

/**
 * CRAP 公式：complexity² × (1 − coverage)³ + complexity。
 * @param {number} complexity - 圈复杂度（≥ 0）
 * @param {number} coverage - 0-1 的覆盖率分数
 * @returns {number} CRAP 值（未取整）
 */
function calculateCRAP(complexity, coverage) {
  return complexity * complexity * Math.pow(1 - coverage, 3) + complexity;
}

/**
 * 解析命令行参数。
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{help: boolean, coverage: string|undefined, complexity: string|undefined,
 *   threshold: string|undefined, lang: string|undefined, output: string|undefined}}
 */
function parseArgs(argv) {
  const args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (!VALUE_FLAGS.has(token)) {
      throw new CliError(`unknown option: ${token} (see --help)`);
    }
    if (i + 1 >= argv.length) {
      throw new CliError(`missing value for ${token}`);
    }
    const key = token.slice(2);
    if (args[key] !== undefined) {
      throw new CliError(`duplicate option: ${token}`);
    }
    args[key] = argv[++i];
  }
  return args;
}

/**
 * 解析并校验阈值；未提供时用默认值。
 * @param {string|undefined} raw - --threshold 的原始字符串
 * @returns {number} 非负数值阈值
 */
function parseThreshold(raw) {
  if (raw === undefined || raw === '') {
    return DEFAULT_THRESHOLD;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new CliError(`invalid threshold: ${raw} (expected a non-negative number)`);
  }
  return value;
}

/**
 * 归一化语言参数；未提供时按 ts 处理。
 * @param {string|undefined} raw - --lang 的原始字符串
 * @returns {'ts'|'py'} 解析器族
 */
function normalizeLang(raw) {
  if (raw === undefined || raw === '') {
    return 'ts';
  }
  const lang = LANG_ALIASES[raw.toLowerCase()];
  if (!lang) {
    throw new CliError(
      `unsupported language: ${raw} (supported: typescript, javascript, python; aliases: ts, js, py)`
    );
  }
  return lang;
}

/**
 * 读取并解析 JSON 文件，缺失与语法错误分别给出清晰提示。
 * @param {string} filePath - 报告路径
 * @param {string} label - 报错用的报告名（coverage/complexity）
 * @returns {unknown} 解析后的 JSON 值
 */
function readJsonFile(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new CliError(`${label} report not found: ${filePath}`);
    }
    throw new CliError(`failed to read ${label} report ${filePath}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new CliError(`failed to parse ${label} report as JSON: ${err.message} (${filePath})`);
  }
}

/**
 * 从单个覆盖率条目折算 0-1 覆盖率分数，
 * 优先 pct/percent_covered（0-100），其次 covered_lines/total_lines。
 * @param {object} entry - 覆盖率条目
 * @param {string} label - 报错用的条目标识
 * @returns {number} 0-1 的覆盖率分数
 */
function coverageFractionOf(entry, label) {
  const pct = entry.pct !== undefined ? entry.pct : entry.percent_covered;
  if (typeof pct === 'number' && Number.isFinite(pct)) {
    return clamp01(pct / 100);
  }
  const covered = entry.covered_lines;
  const total = entry.total_lines;
  if (typeof covered === 'number' && typeof total === 'number' && total > 0) {
    return clamp01(covered / total);
  }
  if (total === 0) {
    return 1;
  }
  throw new CliError(`${label} has no usable coverage value (expected pct or covered_lines/total_lines)`);
}

/**
 * 解析覆盖率报告为函数覆盖率条目列表。
 * @param {unknown} data - 覆盖率 JSON
 * @param {'ts'|'py'} lang - 解析器族
 * @param {string} sourcePath - 报错用的报告路径
 * @returns {{name: string, file: string, coverage: number}[]}
 */
function parseCoverageReport(data, lang, sourcePath) {
  if (lang === 'ts') {
    return parseTsCoverage(data, sourcePath);
  }
  return parsePyCoverage(data, sourcePath);
}

/**
 * 解析 c8 风格覆盖率：{ functions: [{ name, pct }] }，
 * 兼容 { files: [{ path|url, functions: [...] }] } 的分文件包装。
 * @param {unknown} data - 覆盖率 JSON
 * @param {string} sourcePath - 报错用的报告路径
 * @returns {{name: string, file: string, coverage: number}[]}
 */
function parseTsCoverage(data, sourcePath) {
  if (!data || typeof data !== 'object') {
    throw new CliError(`coverage report schema not recognized: expected { functions: [{ name, pct }] } (${sourcePath})`);
  }
  /** @type {{name: string, file: string, coverage: number}[]} */
  const entries = [];
  const pushEntry = (item, file) => {
    if (!item || typeof item !== 'object') {
      throw new CliError(`coverage entry is not an object (${sourcePath})`);
    }
    // c8 会输出模块级匿名函数（name 为空串），跳过即可。
    if (typeof item.name !== 'string' || item.name === '') {
      return;
    }
    entries.push({
      name: item.name,
      file: typeof item.file === 'string' ? item.file : file,
      coverage: coverageFractionOf(item, `coverage entry "${item.name}"`)
    });
  };
  if (Array.isArray(data.functions)) {
    const topFile = typeof data.file === 'string' ? data.file : '';
    data.functions.forEach((item) => pushEntry(item, topFile));
    return entries;
  }
  if (Array.isArray(data.files)) {
    data.files.forEach((item) => {
      if (!item || typeof item !== 'object' || !Array.isArray(item.functions)) {
        return;
      }
      const file = item.path || item.url || item.file || '';
      item.functions.forEach((fn) => pushEntry(fn, typeof file === 'string' ? file : ''));
    });
    return entries;
  }
  throw new CliError(`coverage report schema not recognized: expected { functions: [{ name, pct }] } (${sourcePath})`);
}

/**
 * 解析 pytest-cov 风格覆盖率：
 * { files: { "<path>": { functions: { "<name>": { covered_lines, total_lines } } } } }
 * @param {unknown} data - 覆盖率 JSON
 * @param {string} sourcePath - 报错用的报告路径
 * @returns {{name: string, file: string, coverage: number}[]}
 */
function parsePyCoverage(data, sourcePath) {
  if (!data || typeof data !== 'object' || !data.files || typeof data.files !== 'object' || Array.isArray(data.files)) {
    throw new CliError(
      `coverage report schema not recognized: expected { files: { "<path>": { functions: { "<name>": {...} } } } } (${sourcePath})`
    );
  }
  /** @type {{name: string, file: string, coverage: number}[]} */
  const entries = [];
  for (const [file, info] of Object.entries(data.files)) {
    const functions = info && typeof info === 'object' ? info.functions : null;
    if (!functions || typeof functions !== 'object') {
      continue;
    }
    const rows = Array.isArray(functions)
      ? functions
      : Object.entries(functions).map(([name, fn]) => ({ ...(fn && typeof fn === 'object' ? fn : {}), name }));
    for (const row of rows) {
      if (!row || typeof row.name !== 'string' || row.name === '') {
        continue;
      }
      entries.push({
        name: row.name,
        file,
        coverage: coverageFractionOf(row, `coverage entry "${row.name}" in ${file}`)
      });
    }
  }
  return entries;
}

/**
 * 解析复杂度报告为函数复杂度条目列表。
 * @param {unknown} data - 复杂度 JSON
 * @param {'ts'|'py'} lang - 解析器族
 * @param {string} sourcePath - 报错用的报告路径
 * @returns {{name: string, file: string, complexity: number}[]}
 */
function parseComplexityReport(data, lang, sourcePath) {
  if (lang === 'ts') {
    return parseTsComplexity(data, sourcePath);
  }
  return parsePyComplexity(data, sourcePath);
}

/**
 * 解析 typhonjs-escomplex 风格复杂度：{ reports: [{ name, cyclomatic }] }，
 * 兼容顶层报告数组与 aggregate.cyclomatic 聚合结构。
 * @param {unknown} data - 复杂度 JSON
 * @param {string} sourcePath - 报错用的报告路径
 * @returns {{name: string, file: string, complexity: number}[]}
 */
function parseTsComplexity(data, sourcePath) {
  const reports = Array.isArray(data) ? data : data && typeof data === 'object' ? data.reports : null;
  if (!Array.isArray(reports)) {
    throw new CliError(`complexity report schema not recognized: expected { reports: [{ name, cyclomatic }] } (${sourcePath})`);
  }
  /** @type {{name: string, file: string, complexity: number}[]} */
  const entries = [];
  for (const row of reports) {
    if (!row || typeof row !== 'object') {
      throw new CliError(`complexity report entry is not an object (${sourcePath})`);
    }
    const name = row.name !== undefined ? row.name : row.methodName;
    if (typeof name !== 'string' || name === '') {
      continue;
    }
    const cyclomatic = row.cyclomatic !== undefined ? row.cyclomatic : row.aggregate ? row.aggregate.cyclomatic : undefined;
    if (typeof cyclomatic !== 'number' || !Number.isFinite(cyclomatic) || cyclomatic < 0) {
      throw new CliError(`complexity entry "${name}" has invalid cyclomatic value (${sourcePath})`);
    }
    entries.push({
      name,
      file: typeof row.filePath === 'string' ? row.filePath : typeof row.file === 'string' ? row.file : '',
      complexity: cyclomatic
    });
  }
  return entries;
}

/**
 * 解析 radon cc -j 风格复杂度：{ "<path>": [{ name, complexity }] }，
 * 类块内的 methods 会一并展开。
 * @param {unknown} data - 复杂度 JSON
 * @param {string} sourcePath - 报错用的报告路径
 * @returns {{name: string, file: string, complexity: number}[]}
 */
function parsePyComplexity(data, sourcePath) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new CliError(`complexity report schema not recognized: expected { "<path>": [{ name, complexity }] } (${sourcePath})`);
  }
  /** @type {{name: string, file: string, complexity: number}[]} */
  const entries = [];
  for (const [file, blocks] of Object.entries(data)) {
    if (!Array.isArray(blocks)) {
      continue;
    }
    for (const block of blocks) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      const candidates = Array.isArray(block.methods) ? [block, ...block.methods] : [block];
      for (const row of candidates) {
        if (!row || typeof row !== 'object' || typeof row.name !== 'string' || row.name === '') {
          continue;
        }
        if (typeof row.complexity !== 'number' || !Number.isFinite(row.complexity) || row.complexity < 0) {
          throw new CliError(`complexity entry "${row.name}" has invalid complexity value in ${file}`);
        }
        entries.push({ name: row.name, file, complexity: row.complexity });
      }
    }
  }
  return entries;
}

/**
 * 按函数名联表计算 CRAP 并按阈值过滤违规。
 * 同名函数以复杂度报告中首次出现为准（架构约定以函数名为联表键）。
 * @param {{name: string, file: string, coverage: number}[]} coverageEntries - 覆盖率条目
 * @param {{name: string, file: string, complexity: number}[]} complexityEntries - 复杂度条目
 * @param {number} threshold - CRAP 阈值
 * @returns {{functions: object[], violations: object[]}} 全量函数行与违规行
 */
function evaluateViolations(coverageEntries, complexityEntries, threshold) {
  const complexityByName = new Map();
  for (const row of complexityEntries) {
    if (!complexityByName.has(row.name)) {
      complexityByName.set(row.name, row);
    }
  }
  /** @type {object[]} */
  const functions = [];
  for (const cov of coverageEntries) {
    const cx = complexityByName.get(cov.name);
    if (!cx) {
      process.stderr.write(`calculate_crap: warning: no complexity entry for function "${cov.name}", skipped\n`);
      continue;
    }
    functions.push({
      file: cov.file || cx.file || '',
      function: cov.name,
      crap: round2(calculateCRAP(cx.complexity, cov.coverage)),
      complexity: cx.complexity,
      coverage: round2(cov.coverage)
    });
  }
  const violations = functions
    .filter((row) => row.crap >= threshold)
    .sort((a, b) => b.crap - a.crap || a.function.localeCompare(b.function));
  return { functions, violations };
}

/**
 * 渲染文本摘要 + JSON 报告（check_doc_pairs.mjs 输出模式）。
 * @param {{ok: boolean, threshold: number, violations: object[]}} report - 汇总报告
 * @param {number} fileCount - 参与计算的函数涉及的文件数
 * @returns {string} 完整 stdout 文本
 */
function renderReport(report, fileCount) {
  const lines = [
    `calculate_crap: threshold=${report.threshold} violations=${report.violations.length} files=${fileCount}`
  ];
  if (report.violations.length === 0) {
    lines.push('No CRAP violations found');
  } else {
    for (const row of report.violations) {
      const pct = Math.round(row.coverage * 100);
      lines.push(`  ${row.file || '(unknown file)'} :: ${row.function} crap=${row.crap} complexity=${row.complexity} coverage=${pct}%`);
    }
  }
  return `${lines.join('\n')}\n\n${JSON.stringify(report, null, 2)}\n`;
}

/**
 * 打印用法说明（--help）。
 */
function printHelp() {
  const lines = [
    'Usage: node scripts/calculate_crap.mjs --coverage <path> --complexity <path> [options]',
    '',
    'Compute CRAP = complexity^2 * (1 - coverage)^3 + complexity for each function',
    'and list the functions at or above the CRAP threshold.',
    '',
    'Options:',
    '  --coverage <path>     Path to the coverage report JSON (required)',
    '  --complexity <path>   Path to the complexity report JSON (required)',
    '  --threshold <number>  CRAP threshold, default 6; a function violates when crap >= threshold',
    '  --lang <lang>         Report language/parser: typescript, javascript, python (aliases: ts, js, py); default ts',
    '  --output <path>       Also write the JSON report to this file',
    '  -h, --help            Show this help and exit',
    '',
    'Report formats:',
    '  ts: c8 coverage JSON + typhonjs-escomplex complexity JSON',
    '  py: pytest-cov coverage JSON + radon cc -j complexity JSON',
    '',
    'Output:',
    '  Text summary line, violation details (or "No CRAP violations found"),',
    '  then the JSON report:',
    '  { ok, threshold, violations: [{ file, function, crap, complexity, coverage }] }',
    '',
    'Exit codes:',
    '  0  no violations',
    '  1  violations found, or invalid input'
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

/**
 * CLI 入口：解析参数、读取报告、计算并输出，返回进程退出码。
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {number} 退出码：0 无违规；1 有违规
 */
function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }
  if (!args.coverage || !args.complexity) {
    throw new CliError('--coverage and --complexity required (see --help)');
  }
  const threshold = parseThreshold(args.threshold);
  const lang = normalizeLang(args.lang);
  const coverageData = readJsonFile(args.coverage, 'coverage');
  const complexityData = readJsonFile(args.complexity, 'complexity');
  const coverageEntries = parseCoverageReport(coverageData, lang, args.coverage);
  const complexityEntries = parseComplexityReport(complexityData, lang, args.complexity);
  const { functions, violations } = evaluateViolations(coverageEntries, complexityEntries, threshold);
  const report = { ok: violations.length === 0, threshold, violations };
  const fileCount = new Set(functions.map((row) => row.file)).size;
  process.stdout.write(renderReport(report, fileCount));
  if (args.output) {
    try {
      fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
    } catch (err) {
      throw new CliError(`failed to write output file ${args.output}: ${err.message}`);
    }
  }
  return violations.length > 0 ? 1 : 0;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (err) {
  const message = err instanceof CliError ? err.message : (err && err.stack) || String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}
