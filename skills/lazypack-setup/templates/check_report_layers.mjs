/**
 * check_report_layers.mjs — 交付/验收报告「用户体验与证据分层」段落的播种与结构校验器（v2）
 *
 * 判定口径唯一正文：lazypack-discipline 仓 docs/agents/report-layers.md。
 * 用法:
 *   node check_report_layers.mjs init  --file <report.md> [--cwd <dir>]
 *   node check_report_layers.mjs check --file <report.md> [--cwd <dir>]
 *
 * init：报告文件存在且尚无分层段落时，在文件末尾追加规范骨架（created）；
 *       已有段落返回 exists-kept 不写盘；文件缺失返回 not-run，不代写报告正文。
 * check：对段落做机器可判定的结构校验（format-pass / format-fail）；
 *        文件缺失 not-run；非法 UTF-8 或解析异常 exec-failed。
 *        报告没有分层段落但含用户体验类声称词时为 format-fail；
 *        无段落也无声称词时为 format-pass（本工具不判断报告是否需要该段落）。
 *
 * v2 相对 v1 的变化（全部确定性判定）：
 *   - 必填字段扩为 12 个（新增 harness_paths、maintainer_paths、layer_review_status、
 *     layer_review_basis、control_evidence、ux_evidence）；
 *   - 步骤表改为 5 列（步骤或事项 | 层标签 | 路径 | 说明 | 来源），旧 4 列格式
 *     以 legacy-steps-table-format 明确拒绝；
 *   - 新增「### 双方步骤对照」小节（路径 | 一方 | 交互点数 | 步骤 | 来源）；
 *   - 来源格逐项做仓内相对路径存在性检查（相对 --cwd，缺省进程 cwd）；
 *   - harness_paths / maintainer_paths 路径类约束各层标签的来源归属；
 *   - 状态判定改用 control_evidence / ux_evidence（旧 evidence 判定迁移）；
 *   - 声称扫描前剥离围栏代码、引用行、行内代码与成对引号片段；
 *     FACT_CLAIM_PHRASES 新增「已对齐」（含 控制逻辑 且无 体验 的行豁免）。
 *
 * 未接 hook/CI。不是门禁。结构合规不等于报告陈述在语义上真实。
 * Node 标准库实现，零 npm 依赖。
 */

import fs from 'node:fs';
import path from 'node:path';

const DISCLAIMER = '未接 hook/CI。不是门禁。结构合规不等于报告陈述在语义上真实。';

const EXIT_CODE = {
  created: 0,
  'format-pass': 0,
  'exists-kept': 1,
  'format-fail': 1,
  'not-run': 2,
  'exec-failed': 3
};

const SECTION_HEADING = /^##\s+用户体验与证据分层\s*$/;
const SUB_STEPS = /^###\s+步骤与交互点分层\s*$/;
const SUB_COMPARE = /^###\s+双方步骤对照\s*$/;
const SUB_DIFFS = /^###\s+与参考产品的差异\s*$/;
const ANY_H2 = /^##\s+(?!#)/;
const FIELD_LINE = /^-\s*([a-z_]+)\s*:\s*(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

const REQUIRED_FIELDS = [
  'reference_product',
  'control_logic_status',
  'user_experience_status',
  'product_user_step_count',
  'harness_paths',
  'maintainer_paths',
  'layer_review_status',
  'layer_review_basis',
  'control_evidence',
  'ux_evidence',
  'evidence',
  'unverified_boundary'
];
const CONTROL_STATUSES = new Set(['verified', 'partial', 'unverified', 'not-applicable']);
const UX_STATUSES = new Set(['aligned', 'partial', 'different', 'unverified', 'not-applicable']);
const LAYER_REVIEW_STATUSES = new Set(['reviewed', 'not-reviewed']);
const LAYER_TAGS = new Set([
  'product_user_flow',
  'operator_or_maintainer_flow',
  'test_harness_prerequisite',
  'environment_limitation'
]);
const STEP_PATHS = new Set(['normal', 'exception']);
const COMPARE_SIDES = new Set(['reference', 'project']);
const SCOPE_VALUES = new Set(['in-scope', 'out-of-scope']);
const DIFF_STATES = new Set(['resolved', 'open', 'accepted']);

/** 无分层段落时触发 format-fail 的用户体验类声称词（区分中英文；拉丁词按词边界匹配）。 */
const UX_TRIGGERS = [
  '用户体验', '已对齐', '全自动', '零人工', '人工操作', '手动点击', '需要点击',
  '体验一致', '参考产品', '对标', '交互点',
  /\buser experience\b/i, /\bux\b/i, /\bbenchmark(ed)?\b/i
];

/** 标为 product_user_flow 的行里出现这些词时按可疑错层处理（测试编排/环境限制不得冒充用户步骤）。 */
const SUSPICIOUS_PRODUCT_TOKENS = [
  '测试编排', '测试脚本', '自动化脚本', '冒烟', '前置条件', '环境限制', '前台锁',
  '不支持', '无法', '无权限',
  /\bsmoke\b/i, /\bharness\b/i, /\bprerequisite\b/i, /\bautomation\b/i
];

/** user_experience_status 不是 aligned 时，全文不得出现这些体验级对齐声称。 */
const OVERCLAIM_PHRASES = [
  '体验已对齐', '用户体验已对齐', '体验一致', '体验完全相同', '体验完全对齐',
  /\bsame user experience\b/i, /\bux aligned\b/i, /\bexperience aligned\b/i
];

/** user_experience_status 为 unverified 或 not-applicable 时，全文不得把体验事实写成已成立。 */
const FACT_CLAIM_PHRASES = [
  ...OVERCLAIM_PHRASES,
  '已对齐',
  '全自动', '零人工', '无需人工', '一键完成', '一键搞定',
  /\bzero-click\b/i, /\bfully automatic\b/i
];

/** 字段值为这些占位开头时按未填写处理，等同缺失。 */
const UNFILLED_RE = /^(未填写|待补充|todo(?![a-z])|tbd(?![a-z]))/i;

/** verified/aligned 状态下对应证据不得是这些静态/未实跑表述。 */
const STATIC_EVIDENCE_TOKENS = ['仅静态', '未实跑', '未验证', '未执行', 'static-only', 'static analysis only'];

const SECTION_SKELETON = [
  '## 用户体验与证据分层',
  '',
  '- reference_product: none',
  '- control_logic_status: unverified',
  '- user_experience_status: unverified',
  '- product_user_step_count: 0',
  '- harness_paths: none',
  '- maintainer_paths: none',
  '- layer_review_status: not-reviewed',
  '- layer_review_basis: none',
  '- control_evidence: none',
  '- ux_evidence: none',
  '- evidence: none',
  '- unverified_boundary: 待补充（如实逐条列出；确无则写 none）',
  '',
  '### 步骤与交互点分层',
  '',
  '| 步骤或事项 | 层标签 | 路径 | 说明 | 来源 |',
  '|---|---|---|---|---|',
  '',
  '### 双方步骤对照',
  '',
  '| 路径 | 一方 | 交互点数 | 步骤 | 来源 |',
  '|---|---|---|---|---|',
  '',
  '### 与参考产品的差异',
  '',
  '| observed_difference | 影响 | 本轮范围 | 状态 |',
  '|---|---|---|---|',
  ''
];

/** 写出一种状态的摘要与 JSON，并以上表退出码结束进程。 */
function finish(command, status, detail) {
  const exitCode = EXIT_CODE[status];
  const payload = {
    command,
    status,
    exit_code: exitCode,
    reason: detail.reason || null,
    info: detail.info || null,
    disclaimer: DISCLAIMER
  };
  const lines = [`report-layers ${command}: ${status}`, DISCLAIMER];
  if (payload.reason) {
    lines.push(`reason: ${payload.reason}`);
  }
  if (detail.info && Array.isArray(detail.info.lines)) {
    for (const line of detail.info.lines) {
      lines.push(`info ${line}`);
    }
  }
  process.stdout.write(`${lines.join('\n')}\n\n${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}

/** 严格 UTF-8 解码；非法字节返回 null。 */
function decodeUtf8(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/** 解析命令行参数；未知 flag 或缺值记为错误。 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const flags = {};
  const errors = [];
  const known = new Set(['--cwd', '--file']);
  for (let i = command === null ? 0 : 1; i < args.length; i += 1) {
    const arg = args[i];
    if (known.has(arg)) {
      const next = args[i + 1];
      if (next === undefined || next === '' || next.startsWith('--')) {
        errors.push(`${arg} 缺少值`);
      } else {
        flags[arg] = next;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--')) {
      errors.push(`未知选项 ${arg}`);
    } else {
      errors.push(`多余参数 ${arg}`);
    }
  }
  return { command, flags, errors };
}

/** 命中任一词表即返回 true；字符串走 includes，正则走 test。 */
function containsAny(text, tokens) {
  return tokens.some((token) => (token instanceof RegExp ? token.test(text) : text.includes(token)));
}

/**
 * 同一行内紧邻匹配点前 4 字内出现否定字（不/无/未/没/勿）时，该次命中按否定表述处理。
 * exemptHit(line, token) 返回 true 时该次命中豁免（目前仅 FACT_CLAIM 的「已对齐」
 * 在行内含「控制逻辑」且不含「体验」时豁免）。
 */
function hasClaimHit(text, tokens, exemptHit) {
  for (const line of text.split(/\r?\n/)) {
    for (const token of tokens) {
      const exempt = () => (exemptHit ? exemptHit(line, token) : false);
      if (token instanceof RegExp) {
        const re = new RegExp(token.source, token.flags.includes('g') ? token.flags : `${token.flags}g`);
        for (const m of line.matchAll(re)) {
          const before = line.slice(Math.max(0, m.index - 4), m.index);
          if (!/[不无未没勿]/.test(before) && !exempt()) {
            return true;
          }
        }
      } else {
        let idx = line.indexOf(token);
        while (idx !== -1) {
          const before = line.slice(Math.max(0, idx - 4), idx);
          if (!/[不无未没勿]/.test(before) && !exempt()) {
            return true;
          }
          idx = line.indexOf(token, idx + 1);
        }
      }
    }
  }
  return false;
}

/**
 * 围栏代码块掩码：mask[i]=true 表示该行处于 ``` 或 ~~~ 围栏内部（含开闭行）。
 * 段落定位、声称扫描与 init 的「已有段落」判定共用同一套围栏判定。
 */
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (fence === null) {
      if (t.startsWith('```')) {
        fence = '`';
        mask[i] = true;
        continue;
      }
      if (t.startsWith('~~~')) {
        fence = '~';
        mask[i] = true;
        continue;
      }
    } else {
      mask[i] = true;
      if (t.startsWith(fence.repeat(3))) {
        fence = null;
      }
    }
  }
  return mask;
}

/**
 * 声称扫描文本：去掉围栏代码块、以 > 开头的引用行、行内代码与
 * 成对引号片段（「…」『…』“…”"…"）。UX_TRIGGERS / OVERCLAIM / FACT_CLAIM
 * 三类扫描只扫这份文本。
 */
function stripClaimText(text) {
  const lines = text.split(/\r?\n/);
  const mask = fenceMask(lines);
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (mask[i]) {
      continue;
    }
    if (lines[i].trim().startsWith('>')) {
      kept.push('');
      continue;
    }
    kept.push(lines[i]);
  }
  let s = kept.join('\n');
  s = s.replace(/`[^`\n]*`/g, '');
  s = s.replace(/「[^」]*」/g, '');
  s = s.replace(/『[^』]*』/g, '');
  s = s.replace(/“[^”]*”/g, '');
  s = s.replace(/"[^"\n]*"/g, '');
  return s;
}

/** 把一段 Markdown 表格行切成单元格数组（去掉首末空壳）。 */
function splitRow(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  return cells;
}

/** 判断一行是否为表格分隔行（|---|---|）。 */
function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/** 字段值是否为空口径：未出现、空串、none 或占位开头。 */
function isEmptyValue(value) {
  return value === undefined || value === '' || value === 'none' || UNFILLED_RE.test(value);
}

/** 来源格切分：按 ; 或 ； 分项，trim 并去反引号，丢弃空项。 */
function sourceItems(cell) {
  return cell.split(/[;；]/).map((s) => s.trim().replace(/`/g, '')).filter((s) => s !== '');
}

/** 来源项的路径记号：第一个空白前的部分，再去掉末尾 :<数字>(-<数字>)? 或 #<锚点>。 */
function pathTokenOf(item) {
  let token = item.split(/\s+/)[0];
  token = token.replace(/:\d+(-\d+)?$/, '');
  token = token.replace(/#.*$/, '');
  return token;
}

/** 绝对路径或不安全（.. 段）判定；用于来源项与路径类条目。 */
function isAbsOrUnsafe(token) {
  return token.startsWith('/')
    || token.startsWith('\\')
    || /^[A-Za-z]:/.test(token)
    || token.split(/[\\/]+/).includes('..');
}

/** 路径比较归一化：\→/、posix 规范化（去 ./ 段、合并连续 /）、转小写。仅用于比较，存在性检查仍用原 token。 */
function normRel(p) {
  return path.posix.normalize(p.replace(/\\/g, '/')).replace(/^\.\//, '').toLowerCase();
}

/**
 * R4 来源格校验：逐项解析，none 仅在 allowNone 时合法；其余项按路径记号
 * 做相对性检查，并相对 cwd 做存在性检查。
 */
function checkSourceCell(cell, rowName, allowNone, cwd, failures) {
  const items = sourceItems(cell);
  if (items.length === 0) {
    failures.push(`missing-source=${rowName}`);
    return;
  }
  for (const item of items) {
    if (item === 'none') {
      if (!allowNone) {
        failures.push(`missing-source=${rowName}`);
      }
      continue;
    }
    const token = pathTokenOf(item);
    if (token === '') {
      failures.push(`missing-source=${rowName}`);
      continue;
    }
    if (isAbsOrUnsafe(token)) {
      failures.push(`source-not-relative=${token}`);
      continue;
    }
    if (!fs.existsSync(path.resolve(cwd, token))) {
      failures.push(`source-path-missing=${token}`);
    }
  }
}

/**
 * R5 路径类解析：none/占位/空 → null（无约束可命中）；否则按 , 或 ， 分项，
 * 每项须相对，否则 bad-path-class-entry；相对条目还须相对 cwd 存在，
 * 否则 path-class-entry-missing=<条目原文>。返回归一化匹配器列表。
 */
function parsePathClass(value, failures, cwd) {
  if (isEmptyValue(value)) {
    return null;
  }
  const items = value.split(/[,，]/).map((s) => s.trim().replace(/`/g, '')).filter((s) => s !== '');
  const matchers = [];
  for (const item of items) {
    if (isAbsOrUnsafe(item)) {
      failures.push(`bad-path-class-entry=${item}`);
      continue;
    }
    if (!fs.existsSync(path.resolve(cwd, item))) {
      failures.push(`path-class-entry-missing=${item}`);
      continue;
    }
    const norm = normRel(item);
    matchers.push({ raw: norm, prefix: norm.endsWith('/') });
  }
  return matchers;
}

/** 来源路径记号命中路径类：/ 结尾按前缀匹配，否则精确相等。 */
function pathMatches(token, matchers) {
  if (!matchers) {
    return false;
  }
  const t = normRel(token);
  return matchers.some((m) => (m.prefix ? t.startsWith(m.raw) : t === m.raw));
}

/** 步骤行各来源路径记号列表（不含 none 项）。 */
function sourceTokens(cell) {
  return sourceItems(cell).filter((it) => it !== 'none').map(pathTokenOf).filter((t) => t !== '');
}

/**
 * 解析分层段落：返回 { fields, stepRows, compareRows, diffRows, problems }
 * problems 收集结构性错误（缺小节、缺表头、重复段落、旧格式步骤表等），供 check 汇总。
 */
function parseSection(lines) {
  const problems = [];
  const headings = [];
  const mask = fenceMask(lines);
  lines.forEach((line, idx) => {
    if (!mask[idx] && SECTION_HEADING.test(line)) {
      headings.push(idx);
    }
  });
  if (headings.length === 0) {
    return null;
  }
  if (headings.length > 1) {
    problems.push('duplicate-layer-section');
  }
  const start = headings[0];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!mask[i] && ANY_H2.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start + 1, end);

  const fields = {};
  const stepRows = [];
  const compareRows = [];
  const diffRows = [];
  let stepsHeaderSeen = false;
  let compareHeaderSeen = false;
  let diffsHeaderSeen = false;
  let inSteps = false;
  let inCompare = false;
  let inDiffs = false;
  let stepsTableSeen = false;
  let compareTableSeen = false;
  let diffsTableSeen = false;
  let legacyStepsFormat = false;

  for (const line of body) {
    if (SUB_STEPS.test(line)) {
      stepsHeaderSeen = true;
      inSteps = true;
      inCompare = false;
      inDiffs = false;
      continue;
    }
    if (SUB_COMPARE.test(line)) {
      compareHeaderSeen = true;
      inSteps = false;
      inCompare = true;
      inDiffs = false;
      continue;
    }
    if (SUB_DIFFS.test(line)) {
      diffsHeaderSeen = true;
      inSteps = false;
      inCompare = false;
      inDiffs = true;
      continue;
    }
    const field = FIELD_LINE.exec(line);
    if (field) {
      fields[field[1]] = field[2].trim();
      continue;
    }
    if (TABLE_ROW.test(line)) {
      const cells = splitRow(line);
      if (isSeparatorRow(cells)) {
        continue;
      }
      if (inSteps) {
        if (cells[0] === '步骤或事项') {
          if (cells.length === 4 || cells[3] === '证据') {
            if (!legacyStepsFormat) {
              problems.push('legacy-steps-table-format');
              legacyStepsFormat = true;
            }
          }
          stepsTableSeen = true;
          continue;
        }
        if (stepsTableSeen) {
          stepRows.push(cells);
        }
        continue;
      }
      if (inCompare) {
        if (!compareTableSeen && cells[0] === '路径') {
          compareTableSeen = true;
          continue;
        }
        if (compareTableSeen) {
          compareRows.push(cells);
        }
        continue;
      }
      if (inDiffs) {
        if (!diffsTableSeen && cells[0] === 'observed_difference') {
          diffsTableSeen = true;
          continue;
        }
        if (diffsTableSeen) {
          diffRows.push(cells);
        }
        continue;
      }
    }
  }

  if (!stepsHeaderSeen) {
    problems.push('missing-steps-subsection');
  }
  if (!compareHeaderSeen) {
    problems.push('missing-compare-subsection');
  }
  if (!diffsHeaderSeen) {
    problems.push('missing-diffs-subsection');
  }
  if (stepsHeaderSeen && !stepsTableSeen) {
    problems.push('missing-steps-table');
  }
  if (compareHeaderSeen && !compareTableSeen) {
    problems.push('missing-compare-table');
  }
  if (diffsHeaderSeen && !diffsTableSeen) {
    problems.push('missing-diffs-table');
  }
  return { fields, stepRows, compareRows, diffRows, problems };
}

function cmdInit(flags) {
  const fileRel = flags['--file'];
  if (!fileRel) {
    finish('init', 'exec-failed', { reason: 'missing --file <report.md>' });
  }
  const cwd = path.resolve(flags['--cwd'] || '.');
  const abs = path.resolve(cwd, fileRel);
  if (!fs.existsSync(abs)) {
    finish('init', 'not-run', { reason: `report file does not exist: ${fileRel}`, info: { lines: ['init 不代写报告正文，先由交付方写出报告再补分层段落'] } });
  }
  const buf = fs.readFileSync(abs);
  const text = decodeUtf8(buf);
  if (text === null) {
    finish('init', 'exec-failed', { reason: 'report file is not valid UTF-8' });
  }
  const lines = text.split(/\r?\n/);
  const mask = fenceMask(lines);
  if (lines.some((l, i) => !mask[i] && SECTION_HEADING.test(l))) {
    finish('init', 'exists-kept', { reason: 'layer section already present', info: { lines: [`path: ${fileRel}`] } });
  }
  const crlf = (buf.toString('binary').match(/\r\n/g) || []).length;
  const loneLf = (buf.toString('binary').match(/(?<!\r)\n/g) || []).length;
  const eol = crlf > loneLf ? '\r\n' : '\n';
  let out = text;
  if (!out.endsWith('\n')) {
    out += eol;
  }
  if (!out.endsWith(eol + eol) && !out.endsWith('\n\n')) {
    out += eol;
  }
  out += SECTION_SKELETON.join(eol);
  const tmp = `${abs}.report-layers-tmp-${process.pid}`;
  fs.writeFileSync(tmp, out);
  const reread = decodeUtf8(fs.readFileSync(tmp));
  if (reread !== out) {
    fs.rmSync(tmp, { force: true });
    finish('init', 'exec-failed', { reason: 'write-back verification failed' });
  }
  fs.renameSync(tmp, abs);
  finish('init', 'created', { info: { lines: [`path: ${fileRel}`, 'layer section appended at end of file'] } });
}

function cmdCheck(flags) {
  const fileRel = flags['--file'];
  if (!fileRel) {
    finish('check', 'exec-failed', { reason: 'missing --file <report.md>' });
  }
  const cwd = path.resolve(flags['--cwd'] || '.');
  const abs = path.resolve(cwd, fileRel);
  if (!fs.existsSync(abs)) {
    finish('check', 'not-run', { reason: `report file does not exist: ${fileRel}` });
  }
  const buf = fs.readFileSync(abs);
  const text = decodeUtf8(buf);
  if (text === null) {
    finish('check', 'exec-failed', { reason: 'report file is not valid UTF-8' });
  }
  const claimText = stripClaimText(text);
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const parsed = parseSection(lines);

  if (parsed === null) {
    if (hasClaimHit(claimText, UX_TRIGGERS)) {
      finish('check', 'format-fail', {
        reason: 'missing-layer-section-with-ux-claims',
        info: { lines: ['报告含用户体验类声称词但无「## 用户体验与证据分层」段落'] }
      });
    }
    finish('check', 'format-pass', { info: { lines: ['layer-section: absent (no ux claims detected)'] } });
  }

  const failures = [...parsed.problems];
  const f = parsed.fields;
  const stepRows = parsed.stepRows;
  const compareRows = parsed.compareRows;
  const diffRows = parsed.diffRows;

  // R1 必填字段与枚举
  const missing = REQUIRED_FIELDS.filter((name) => !(name in f) || f[name] === '' || UNFILLED_RE.test(f[name]));
  if (missing.length > 0) {
    failures.push(`missing-or-unfilled-fields=${missing.join(',')}`);
  }
  if ('control_logic_status' in f && !UNFILLED_RE.test(f.control_logic_status) && !CONTROL_STATUSES.has(f.control_logic_status)) {
    failures.push(`bad-control_logic_status=${f.control_logic_status}`);
  }
  if ('user_experience_status' in f && !UNFILLED_RE.test(f.user_experience_status) && !UX_STATUSES.has(f.user_experience_status)) {
    failures.push(`bad-user_experience_status=${f.user_experience_status}`);
  }
  if ('layer_review_status' in f && !UNFILLED_RE.test(f.layer_review_status) && !LAYER_REVIEW_STATUSES.has(f.layer_review_status)) {
    failures.push(`bad-layer_review_status=${f.layer_review_status}`);
  }

  // R5 路径类（先解析，供各行来源归属判定）
  const harnessMatchers = parsePathClass(f.harness_paths, failures, cwd);
  const maintainerMatchers = parsePathClass(f.maintainer_paths, failures, cwd);

  // R3 步骤行、R4 来源格、R5 来源归属
  for (const cells of stepRows) {
    const rowName = cells[0] || cells.join('|');
    if (cells.length !== 5 || cells.some((c) => c === '')) {
      failures.push(`bad-step-row=${cells.join('|')}`);
      continue;
    }
    const tag = cells[1];
    if (!LAYER_TAGS.has(tag)) {
      failures.push(`bad-layer-tag=${tag}`);
      continue;
    }
    if (tag === 'product_user_flow') {
      if (!STEP_PATHS.has(cells[2])) {
        failures.push(`bad-step-path=${rowName}`);
      }
      if (containsAny(`${cells[0]} ${cells[3]}`, SUSPICIOUS_PRODUCT_TOKENS)) {
        failures.push(`suspicious-product-row=${cells[0]}`);
      }
    } else if (cells[2] !== '-') {
      failures.push(`non-product-row-has-path=${rowName}`);
    }
    checkSourceCell(cells[4], rowName, tag === 'environment_limitation', cwd, failures);
    const tokens = sourceTokens(cells[4]);
    if (tag === 'test_harness_prerequisite') {
      if (!tokens.some((t) => pathMatches(t, harnessMatchers))) {
        failures.push(`harness-row-source-outside-harness-paths=${rowName}`);
      }
    } else if (tag === 'operator_or_maintainer_flow') {
      if (!tokens.some((t) => pathMatches(t, maintainerMatchers))) {
        failures.push(`maintainer-row-source-outside-maintainer-paths=${rowName}`);
      }
    } else if (tag === 'product_user_flow') {
      if (tokens.some((t) => pathMatches(t, harnessMatchers))) {
        failures.push(`product-row-source-in-harness-paths=${rowName}`);
      }
      if (tokens.some((t) => pathMatches(t, maintainerMatchers))) {
        failures.push(`product-row-source-in-maintainer-paths=${rowName}`);
      }
    }
  }

  // R6 计数
  const productSteps = stepRows.filter((c) => c.length === 5 && c[1] === 'product_user_flow').length;
  if ('product_user_step_count' in f && !UNFILLED_RE.test(f.product_user_step_count)) {
    const declared = Number(f.product_user_step_count);
    if (!Number.isInteger(declared) || declared < 0) {
      failures.push(`bad-product_user_step_count=${f.product_user_step_count}`);
    } else if (declared !== productSteps) {
      failures.push(`product-step-count-mismatch declared=${declared} actual=${productSteps}`);
    }
  }

  // R7 对照表行
  const compareCounts = {};
  const seenCompare = new Set();
  for (const cells of compareRows) {
    if (cells.length !== 5 || cells.some((c) => c === '')) {
      failures.push(`bad-compare-row=${cells.join('|')}`);
      continue;
    }
    const p = cells[0];
    const side = cells[1];
    const countStr = cells[2];
    const src = cells[4];
    const isInt = /^\d+$/.test(countStr);
    if (!STEP_PATHS.has(p)) {
      failures.push(`bad-compare-path=${p}`);
    }
    if (!COMPARE_SIDES.has(side)) {
      failures.push(`bad-compare-side=${side}`);
    }
    if (!isInt && countStr !== 'unobserved') {
      failures.push(`bad-compare-count=${countStr}`);
    }
    if (STEP_PATHS.has(p) && COMPARE_SIDES.has(side)) {
      const key = `${p}/${side}`;
      if (seenCompare.has(key)) {
        failures.push(`duplicate-compare-row=${key}`);
      }
      seenCompare.add(key);
      compareCounts[p] = compareCounts[p] || {};
      compareCounts[p][side] = isInt ? Number(countStr) : 'unobserved';
    }
    if (side === 'project') {
      checkSourceCell(src, `${p}/project`, false, cwd, failures);
      if (isInt && STEP_PATHS.has(p)) {
        const actual = stepRows.filter(
          (c) => c.length === 5 && c[1] === 'product_user_flow' && c[2] === p
        ).length;
        if (Number(countStr) !== actual) {
          failures.push(`project-count-mismatch path=${p} declared=${countStr} actual=${actual}`);
        }
      }
    }
    if (side === 'reference' && isInt && isEmptyValue(src)) {
      failures.push(`reference-row-without-source=${p}`);
    }
  }
  if (isEmptyValue(f.reference_product)
      && compareRows.some((c) => c.length === 5 && c[1] === 'reference')) {
    failures.push('reference-none-but-reference-rows');
  }

  // 差异表行（沿用）
  for (const cells of diffRows) {
    if (cells.length < 4 || cells.some((c) => c === '')) {
      failures.push(`bad-diff-row=${cells.join('|')}`);
      continue;
    }
    if (!SCOPE_VALUES.has(cells[2])) {
      failures.push(`bad-diff-scope=${cells[2]}`);
    }
    if (!DIFF_STATES.has(cells[3])) {
      failures.push(`bad-diff-state=${cells[3]}`);
    }
  }

  // R8 状态
  const control = f.control_logic_status;
  const ux = f.user_experience_status;
  const ref = f.reference_product;
  const review = f.layer_review_status;
  const basis = f.layer_review_basis;
  const cev = f.control_evidence;
  const uev = f.ux_evidence;

  if ((control === 'verified' || control === 'partial') && isEmptyValue(cev)) {
    failures.push(`control-${control}-without-control-evidence`);
  }
  if (control === 'verified' && !isEmptyValue(cev) && containsAny(cev, STATIC_EVIDENCE_TOKENS)) {
    failures.push('control-verified-with-static-only-evidence');
  }
  if ((ux === 'aligned' || ux === 'partial' || ux === 'different') && isEmptyValue(uev)) {
    failures.push(`${ux}-without-ux-evidence`);
  }
  if (!isEmptyValue(cev) && !isEmptyValue(uev)
      && cev.replace(/\s+/g, ' ').trim() === uev.replace(/\s+/g, ' ').trim()) {
    failures.push('control-and-ux-evidence-identical');
  }
  if (ux === 'aligned') {
    if (isEmptyValue(ref)) {
      failures.push('aligned-without-reference-product');
    }
    if (!isEmptyValue(uev) && containsAny(uev, STATIC_EVIDENCE_TOKENS)) {
      failures.push('aligned-with-static-only-evidence');
    }
    const unresolved = diffRows.filter((c) => c.length >= 4 && c[2] === 'in-scope' && c[3] !== 'resolved');
    if (unresolved.length > 0) {
      failures.push(`aligned-with-unresolved-in-scope-diffs=${unresolved.length}`);
    }
    if (review !== 'reviewed') {
      failures.push('aligned-without-layer-review');
    }
    const normal = compareCounts.normal || {};
    if (!Number.isInteger(normal.reference) || !Number.isInteger(normal.project)) {
      failures.push('aligned-without-two-sided-comparison path=normal');
    }
    for (const p of Object.keys(compareCounts)) {
      const r = compareCounts[p].reference;
      const pr = compareCounts[p].project;
      if (Number.isInteger(r) !== Number.isInteger(pr)) {
        failures.push(`aligned-without-two-sided-comparison path=${p}`);
      } else if (Number.isInteger(r) && r !== pr) {
        failures.push(`aligned-but-interaction-count-differs path=${p}`);
      }
    }
  }
  if ((ux === 'partial' || ux === 'different') && ref && ref !== 'none' && !UNFILLED_RE.test(ref)) {
    const normal = compareCounts.normal || {};
    if (!Number.isInteger(normal.reference) || !Number.isInteger(normal.project)) {
      failures.push(`${ux}-without-two-sided-comparison`);
    }
  }
  if (ref === 'none' && (ux === 'aligned' || ux === 'partial' || ux === 'different')) {
    failures.push(`reference-none-but-ux-${ux}`);
  }
  if (ref && ref !== 'none' && !UNFILLED_RE.test(ref) && ux === 'not-applicable') {
    failures.push('reference-present-but-ux-not-applicable');
  }
  if (review === 'reviewed' && isEmptyValue(basis)) {
    failures.push('layer-review-without-basis');
  }

  // R9 声称扫描（剥离后的文本；否定豁免不变；已对齐的控制逻辑豁免）
  const alignedClaimExempt = (line, token) => token === '已对齐'
    && line.includes('控制逻辑') && !line.includes('体验');
  if (ux && ux !== 'aligned' && hasClaimHit(claimText, OVERCLAIM_PHRASES)) {
    failures.push('ux-overclaim-outside-aligned-status');
  }
  if ((ux === 'unverified' || ux === 'not-applicable') && hasClaimHit(claimText, FACT_CLAIM_PHRASES, alignedClaimExempt)) {
    failures.push('ux-fact-claim-while-unverified');
  }

  if (failures.length > 0) {
    finish('check', 'format-fail', {
      reason: failures.join('; '),
      info: {
        lines: [
          `path: ${fileRel}`,
          `step-rows: ${stepRows.length}`,
          `compare-rows: ${compareRows.length}`,
          `diff-rows: ${diffRows.length}`
        ]
      }
    });
  }
  finish('check', 'format-pass', {
    info: {
      lines: [
        `path: ${fileRel}`,
        `control_logic_status: ${f.control_logic_status}`,
        `user_experience_status: ${f.user_experience_status}`,
        `product_user_steps: ${productSteps}`,
        `reference_product: ${f.reference_product}`
      ]
    }
  });
}

const { command, flags, errors } = parseArgs(process.argv);
if (errors.length > 0) {
  finish(command || 'check', 'exec-failed', { reason: errors.join('; ') });
}
if (command === 'init') {
  cmdInit(flags);
} else if (command === 'check') {
  cmdCheck(flags);
} else {
  finish('check', 'exec-failed', { reason: `unknown or missing command: ${command || '(none)'}`, info: { lines: ['commands: init, check'] } });
}
