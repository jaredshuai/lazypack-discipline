/**
 * check_report_layers.mjs — 交付/验收报告「用户体验与证据分层」段落的播种与结构校验器
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
const SUB_DIFFS = /^###\s+与参考产品的差异\s*$/;
const ANY_H2 = /^##\s+(?!#)/;
const FIELD_LINE = /^-\s*([a-z_]+)\s*:\s*(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

const REQUIRED_FIELDS = [
  'reference_product',
  'control_logic_status',
  'user_experience_status',
  'product_user_step_count',
  'evidence',
  'unverified_boundary'
];
const CONTROL_STATUSES = new Set(['verified', 'partial', 'unverified', 'not-applicable']);
const UX_STATUSES = new Set(['aligned', 'partial', 'different', 'unverified', 'not-applicable']);
const LAYER_TAGS = new Set([
  'product_user_flow',
  'operator_or_maintainer_flow',
  'test_harness_prerequisite',
  'environment_limitation'
]);
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
  '全自动', '零人工', '无需人工', '一键完成', '一键搞定',
  /\bzero-click\b/i, /\bfully automatic\b/i
];

/** 字段值为这些占位开头时按未填写处理，等同缺失。 */
const UNFILLED_RE = /^(未填写|待补充|todo(?![a-z])|tbd(?![a-z]))/i;

/** aligned 状态下 evidence 不得是这些静态/未实跑表述。 */
const STATIC_EVIDENCE_TOKENS = ['仅静态', '未实跑', '未验证', '未执行', 'static-only', 'static analysis only'];

const SECTION_SKELETON = [
  '## 用户体验与证据分层',
  '',
  '- reference_product: none',
  '- control_logic_status: unverified',
  '- user_experience_status: unverified',
  '- product_user_step_count: 0',
  '',
  '### 步骤与交互点分层',
  '',
  '| 步骤或事项 | 层标签 | 说明 | 证据 |',
  '|---|---|---|---|',
  '',
  '### 与参考产品的差异',
  '',
  '| observed_difference | 影响 | 本轮范围 | 状态 |',
  '|---|---|---|---|',
  '',
  '- evidence: none',
  '- unverified_boundary: 待补充（如实逐条列出；确无则写 none）',
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

/** 同一行内紧邻匹配点前 4 字内出现否定字（不/无/未/没/勿）时，该次命中按否定表述处理。 */
function hasClaimHit(text, tokens) {
  for (const line of text.split(/\r?\n/)) {
    for (const token of tokens) {
      if (token instanceof RegExp) {
        const re = new RegExp(token.source, token.flags.includes('g') ? token.flags : `${token.flags}g`);
        for (const m of line.matchAll(re)) {
          const before = line.slice(Math.max(0, m.index - 4), m.index);
          if (!/[不无未没勿]/.test(before)) {
            return true;
          }
        }
      } else {
        let idx = line.indexOf(token);
        while (idx !== -1) {
          const before = line.slice(Math.max(0, idx - 4), idx);
          if (!/[不无未没勿]/.test(before)) {
            return true;
          }
          idx = line.indexOf(token, idx + 1);
        }
      }
    }
  }
  return false;
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

/**
 * 解析分层段落：返回 { fields, stepRows, diffRows, problems }
 * problems 收集结构性错误（缺小节、缺表头、重复段落等），供 check 汇总。
 */
function parseSection(lines) {
  const problems = [];
  const headings = [];
  lines.forEach((line, idx) => {
    if (SECTION_HEADING.test(line)) {
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
    if (ANY_H2.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start + 1, end);

  const fields = {};
  const stepRows = [];
  const diffRows = [];
  let stepsHeaderSeen = false;
  let diffsHeaderSeen = false;
  let inSteps = false;
  let inDiffs = false;
  let stepsTableSeen = false;
  let diffsTableSeen = false;

  for (const line of body) {
    if (SUB_STEPS.test(line)) {
      stepsHeaderSeen = true;
      inSteps = true;
      inDiffs = false;
      continue;
    }
    if (SUB_DIFFS.test(line)) {
      diffsHeaderSeen = true;
      inSteps = false;
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
        if (!stepsTableSeen && cells[0] === '步骤或事项') {
          stepsTableSeen = true;
          continue;
        }
        if (stepsTableSeen) {
          stepRows.push(cells);
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
  if (!diffsHeaderSeen) {
    problems.push('missing-diffs-subsection');
  }
  if (stepsHeaderSeen && !stepsTableSeen) {
    problems.push('missing-steps-table');
  }
  if (diffsHeaderSeen && !diffsTableSeen) {
    problems.push('missing-diffs-table');
  }
  return { fields, stepRows, diffRows, problems };
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
  if (lines.some((l) => SECTION_HEADING.test(l))) {
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
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const parsed = parseSection(lines);

  if (parsed === null) {
    if (hasClaimHit(text, UX_TRIGGERS)) {
      finish('check', 'format-fail', {
        reason: 'missing-layer-section-with-ux-claims',
        info: { lines: ['报告含用户体验类声称词但无「## 用户体验与证据分层」段落'] }
      });
    }
    finish('check', 'format-pass', { info: { lines: ['layer-section: absent (no ux claims detected)'] } });
  }

  const failures = [...parsed.problems];
  const f = parsed.fields;

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

  const stepRows = parsed.stepRows;
  for (const cells of stepRows) {
    if (cells.length < 4 || cells.some((c) => c === '')) {
      failures.push(`bad-step-row=${cells.join('|')}`);
      continue;
    }
    if (!LAYER_TAGS.has(cells[1])) {
      failures.push(`bad-layer-tag=${cells[1]}`);
      continue;
    }
    if (cells[1] === 'product_user_flow' && containsAny(`${cells[0]} ${cells[2]}`, SUSPICIOUS_PRODUCT_TOKENS)) {
      failures.push(`suspicious-product-row=${cells[0]}`);
    }
  }

  const productSteps = stepRows.filter((c) => c.length >= 4 && c[1] === 'product_user_flow').length;
  if ('product_user_step_count' in f && !UNFILLED_RE.test(f.product_user_step_count)) {
    const declared = Number(f.product_user_step_count);
    if (!Number.isInteger(declared) || declared < 0) {
      failures.push(`bad-product_user_step_count=${f.product_user_step_count}`);
    } else if (declared !== productSteps) {
      failures.push(`product-step-count-mismatch declared=${declared} actual=${productSteps}`);
    }
  }

  const diffRows = parsed.diffRows;
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

  const ux = f.user_experience_status;
  const ref = f.reference_product;
  const ev = f.evidence;
  if (ux === 'aligned') {
    if (ref === 'none' || UNFILLED_RE.test(ref || '')) {
      failures.push('aligned-without-reference-product');
    }
    if (ev === 'none' || UNFILLED_RE.test(ev || '')) {
      failures.push('aligned-without-evidence');
    } else if (containsAny(ev, STATIC_EVIDENCE_TOKENS)) {
      failures.push('aligned-with-static-only-evidence');
    }
    const unresolved = diffRows.filter((c) => c.length >= 4 && c[2] === 'in-scope' && c[3] !== 'resolved');
    if (unresolved.length > 0) {
      failures.push(`aligned-with-unresolved-in-scope-diffs=${unresolved.length}`);
    }
  }
  if ((ux === 'partial' || ux === 'different') && (ev === 'none' || UNFILLED_RE.test(ev || ''))) {
    failures.push(`${ux}-without-evidence`);
  }
  if (ref === 'none' && (ux === 'aligned' || ux === 'partial' || ux === 'different')) {
    failures.push(`reference-none-but-ux-${ux}`);
  }
  if (ref && ref !== 'none' && !UNFILLED_RE.test(ref) && ux === 'not-applicable') {
    failures.push('reference-present-but-ux-not-applicable');
  }
  if (ux && ux !== 'aligned' && hasClaimHit(text, OVERCLAIM_PHRASES)) {
    failures.push('ux-overclaim-outside-aligned-status');
  }
  if ((ux === 'unverified' || ux === 'not-applicable') && hasClaimHit(text, FACT_CLAIM_PHRASES)) {
    failures.push('ux-fact-claim-while-unverified');
  }

  if (failures.length > 0) {
    finish('check', 'format-fail', {
      reason: failures.join('; '),
      info: { lines: [`path: ${fileRel}`, `step-rows: ${stepRows.length}`, `diff-rows: ${diffRows.length}`] }
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
