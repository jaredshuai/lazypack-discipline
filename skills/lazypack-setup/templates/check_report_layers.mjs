/**
 * check_report_layers.mjs — 交付/验收报告「用户体验与证据分层」段落的播种与结构校验器（v3）
 *
 * 判定口径唯一正文：lazypack-discipline 仓 docs/agents/report-layers.md。
 * 用法:
 *   node check_report_layers.mjs init  --file <report.md> [--cwd <dir>]
 *   node check_report_layers.mjs check --file <report.md> [--cwd <dir>]
 *
 * init：报告文件存在且尚无分层段落时，在文件末尾追加规范骨架（created）；
 *       已有段落返回 exists-kept 不写盘；文件缺失或不是普通文件返回 not-run，
 *       不代写报告正文。
 * check：对段落做机器可判定的结构校验（format-pass / format-fail）；
 *        文件缺失或不是普通文件 not-run；参数错误、stat 失败、读取失败
 *        （含文件过大）、非法 UTF-8 或写盘失败 exec-failed。
 *        报告没有分层段落但含用户体验类声称词时为 format-fail；
 *        无段落也无声称词时为 format-pass（本工具不判断报告是否需要该段落）。
 *
 * v3 相对 v2 的变化（可用性修复，全部确定性判定）：
 *   - 删除「双方交互点数必须相等才可 aligned」：点数不同改为必须有差异说明
 *     （interaction-count-differs-without-difference-record），异常分支单侧存在不再阻断；
 *   - 差异表新增第 5 列「是否违反已确认体验要求」（yes|no）；只有 in-scope、
 *     未 resolved 且为 yes 的差异才阻断 aligned；
 *   - 取消「control_evidence 与 ux_evidence 相同即判冒充」：共享同一份日志/录像/
 *     测试记录是合法的，仅在两处文本完全逐字相同且未写明维度或位置时记
 *     evidence-not-distinguished；
 *   - 重复字段行不再静默覆盖：同值记 duplicate-field=，异值记 conflicting-field=；
 *   - 来源与路径类支持含空格/中文的仓内相对路径：反引号包裹时整项即路径，
 *     否则取相对 cwd 真实存在的最长空白分隔前缀；越界、绝对路径、缺失路径仍拒绝；
 *   - 否定句、条件句按语境豁免（中文紧邻否定 + 英文否定 + 条件词整行生效）；
 *     自然语言体验声称降为 info 中的 review-hint，不再作为 format-fail；
 *   - 段落正文扫描跳过围栏代码块内的示例字段行。
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
const VIOLATION_VALUES = new Set(['yes', 'no']);

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
  '| observed_difference | 影响 | 本轮范围 | 状态 | 是否违反已确认体验要求 |',
  '|---|---|---|---|---|',
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

/** 严格 UTF-8 解码；非法字节返回 null。保留 BOM（需从原始字节判定是否存在）。 */
function decodeUtf8(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    return null;
  }
}

/** 原始字节是否以 UTF-8 BOM 开头。 */
function hasUtf8Bom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

/**
 * 报告路径的普通文件前置判定（init / check 共用，跟随符号链接）。
 * 返回 { kind, code }：
 *   'file'     —— 普通文件（符号链接指向普通文件也按普通文件处理）
 *   'missing'  —— ENOENT/ENOTDIR，路径不存在
 *   'not-file' —— stat 成功但不是普通文件（如目录）
 *   'error'    —— 其余 stat 失败（如无权限），code 为原始错误码
 * 该判定必须发生在 readFileSync 之前：目录会在读取时抛 EISDIR 未捕获异常，
 * 既不是本工具头部注释承诺的四态，也没有可读的状态摘要。
 */
function classifyReportFile(abs) {
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch (error) {
    const code = error && error.code ? error.code : 'unknown';
    return { kind: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'error', code };
  }
  return stat.isFile() ? { kind: 'file' } : { kind: 'not-file' };
}

/**
 * 读取报告文件为文本：读取与解码的失败一律转成可读错误码，不抛未捕获异常。
 * 与 changelog.mjs 的 readChangelog 同口径——读取阶段（含文件超过 Node
 * readFileSync 上限约 2 GiB、I/O 错误、权限错误）必须先落成状态，不能冒泡成
 * RangeError/EACCES 之类的未捕获异常，否则进程以退出码 1 和 Node 栈收场，
 * 落在本工具承诺的四态之外。
 * 返回 { ok: true, buf, text } 或 { ok: false, code }：
 *   code 为 Node 的 fs 错误码（如 ERR_FS_FILE_TOO_LARGE、EACCES、EIO…），
 *   解码失败时为 'invalid-utf8'。
 */
function readReportFile(abs) {
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch (error) {
    return { ok: false, code: error && error.code ? error.code : 'unknown' };
  }
  const text = decodeUtf8(buf);
  if (text === null) {
    return { ok: false, code: 'invalid-utf8' };
  }
  return { ok: true, buf, text };
}

/**
 * 读取阶段失败的统一文案。读取并不存在的路径不是这里的分支（那是 not-run），
 * 所以文案只覆盖「路径在、但读不出来」：非法 UTF-8 单列，其余按 fs 错误码如实报出。
 */
function readFailureReason(fileRel, code) {
  return code === 'invalid-utf8'
    ? `report file is not valid UTF-8: ${fileRel}`
    : `report file cannot be read: ${fileRel} (${code})`;
}

/**
 * stat 失败（非 ENOENT/ENOTDIR）时的统一文案：init 与 check 都不该声称「读取」——
 * init 这一步还没读该路径，失败的是对路径的 stat 本身（如权限、符号链接环 ELOOP）。
 */
function inspectFailureReason(fileRel, code) {
  return `report path cannot be inspected: ${fileRel} (${code})`;
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

/** 否定词（中英文）。用于识别「本轮**未**做…」这类如实降级表述。 */
const NEGATION_RE = /[不无未没勿非非]|not|never|cannot|can't|isn't|wasn't|without/i;
const CONDITION_RE = /如果|假如|若|一旦|除非|待|之后才|条件是|前提是|\bif\b|\bwhen\b|\bonce\b|\bunless\b|\bprovided\b/i;

/**
 * 判断某次命中是否处在否定或条件语境。
 *
 * 语境判定分两级：
 *  1. 否定：匹配点前若干字内出现否定词（中文紧邻、英文可隔一个词）；
 *  2. 条件：整行含条件词（如果/若/待…才/if/when…）。
 * 命中处于这两类语境时，视为如实表述，不作为「本轮已完成」的事实声称。
 */
function isNegatedOrConditional(line, index, token) {
  const head = line.slice(Math.max(0, index - 12), index);
  const tail = line.slice(index, index + String(token).length + 12);
  if (NEGATION_RE.test(head)) {
    return true;
  }
  // 否定出现在结论词之后（“…并非已对齐”“…不是全自动”）也算否定语境
  if (NEGATION_RE.test(tail) && /并非|不是|而非|not\b/i.test(tail)) {
    return true;
  }
  return CONDITION_RE.test(line);
}

/**
 * 在剥离后的文本中查找体验级事实声称，返回 {hit, line} 或 null。
 * 否定句、条件句、按引用豁免的命中一律不算命中。
 */
function findClaimHit(text, tokens, exemptHit) {
  for (const line of text.split(/\r?\n/)) {
    for (const token of tokens) {
      const exempt = () => (exemptHit ? exemptHit(line, token) : false);
      if (token instanceof RegExp) {
        const re = new RegExp(token.source, token.flags.includes('g') ? token.flags : `${token.flags}g`);
        for (const m of line.matchAll(re)) {
          if (!exempt() && !isNegatedOrConditional(line, m.index, token)) {
            return { hit: String(m[0]), line };
          }
        }
      } else {
        let idx = line.indexOf(token);
        while (idx !== -1) {
          if (!exempt() && !isNegatedOrConditional(line, idx, token)) {
            return { hit: token, line };
          }
          idx = line.indexOf(token, idx + 1);
        }
      }
    }
  }
  return null;
}

/** 兼容旧调用：只关心是否命中的布尔版本。 */
function hasClaimHit(text, tokens, exemptHit) {
  return findClaimHit(text, tokens, exemptHit) !== null;
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

/**
 * 来源格切分：按 ; 或 ； 分项，trim，丢弃空项。
 * 整项被反引号包裹时保留「显式路径」标记——该形式下整项即为路径，
 * 路径内的空格不再与说明文字混淆。
 */
function sourceItems(cell) {
  return cell.split(/[;；]/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => {
      const m = /^`([^`]+)`(\s.*)?$/s.exec(s);
      if (m) {
        return { text: m[1].trim(), tail: (m[2] || '').trim(), explicit: true };
      }
      const bare = s.replace(/`/g, '');
      return { text: bare, tail: '', explicit: false };
    });
}

/** 去掉末尾锚点后缀（`#anchor`）。 */
function stripAnchor(s) {
  return s.replace(/#.*$/, '');
}

/** 去掉末尾行号后缀（`:12`、`:3-9`）。 */
function stripLine(s) {
  return s.replace(/:\d+(-\d+)?$/, '');
}

/** 来源项的行号后缀（如 `:12`、`:3-9`）；无则返回 ''。 */
function lineSuffixOf(text) {
  const m = /:\d+(-\d+)?(?=#|$)/.exec(text);
  return m ? m[0] : '';
}

/** 来源项的锚点后缀（如 `#anchor`）；无则返回 ''。 */
function anchorSuffixOf(text) {
  const hash = text.indexOf('#');
  return hash === -1 ? '' : text.slice(hash);
}

/** 去掉路径后的行号与锚点后缀，得到候选路径本体（可能仍含空格与说明文字）。 */
function candidatePathOf(text) {
  return stripLine(stripAnchor(text)).trim();
}

/**
 * 解析来源项的路径记号。返回 { token, anchor, line }。
 *
 * 显式形式（整项反引号包裹）：整项即路径，空格属于路径。
 * 非显式形式：先去掉行号与锚点，再取**相对 cwd 真实存在的最长前缀**，
 * 使 `src/a.js 行 12` 与 `src/my updater.js` 都能正确切分；
 * 若没有任何前缀存在，退回第一个空白前的部分，由存在性检查如实报缺失。
 */
function resolveSourcePath(item, cwd) {
  const anchor = anchorSuffixOf(item.text);
  const line = lineSuffixOf(item.text);
  const candidate = candidatePathOf(item.text);
  if (candidate === '') {
    return { token: '', anchor, line };
  }
  if (item.explicit) {
    return { token: candidate, anchor, line };
  }
  const words = candidate.split(' ').filter((w) => w !== '');
  for (let n = words.length; n >= 1; n -= 1) {
    const prefix = words.slice(0, n).join(' ');
    if (fs.existsSync(path.resolve(cwd, prefix))) {
      return { token: prefix, anchor, line };
    }
  }
  return { token: words[0] === undefined ? candidate : words[0], anchor, line };
}

/**
 * 共享证据的处理口径。
 *
 * 同一份日志、录像或测试记录**可以**同时支撑控制逻辑与用户可见体验两个维度——
 * 这是 #33 场景下的正常形态，不再按「两处文本或路径相同」判冒充。
 *
 * 机器只保留一条与共享证据直接相关、且不引入新表格的硬检查：
 * 两处证据**完全逐字相同且不含任何维度说明**时，报告没有回答
 * 「同一份材料分别支撑哪个结论」，记 evidence-not-distinguished 交人工补写。
 * 只要任一侧写明了它支撑的维度或具体位置，即视为已区分。
 * 是否真的分别支撑两个结论，属 §6 人工审查项。
 */
function isUndistinguishedSharedEvidence(cev, uev) {
  if (isEmptyValue(cev) || isEmptyValue(uev)) {
    return false;
  }
  const a = cev.replace(/\s+/g, ' ').trim();
  const b = uev.replace(/\s+/g, ' ').trim();
  if (a !== b) {
    return false;
  }
  // 文本完全相同：只有当两侧都写明了维度或具体位置才算已区分。
  const locates = /(:\d|#|@|\d{1,2}:\d{2})/.test(a) || /\.(log|json|txt|md|jsonl|mp4|mkv|mov)/i.test(a);
  const namesAxis = /控制|状态机|后端|流程|体验|用户可见|交互|界面/.test(a);
  const states = /支撑|证明|依据|evidence|shows?|supports?/i.test(a);
  return !(locates && namesAxis) && !(locates && states);
}

/**
 * 差异表是否为该路径登记了差异说明。
 * 差异表不含路径列，因此按差异文本中出现该路径名，或该路径存在任一差异行即视为已登记，
 * 再由人工审查核实登记内容是否真的对应。
 */
function hasDifferenceRecordFor(diffRows, stepPath) {
  const labels = { normal: /正常|normal|主路径|常规/, exception: /异常|exception|失败|失败分支|超时/ };
  const re = labels[stepPath];
  if (!re) {
    return diffRows.length > 0;
  }
  return diffRows.some((c) => c.length >= 1 && re.test(c[0]));
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
    if (item.text === 'none') {
      if (!allowNone) {
        failures.push(`missing-source=${rowName}`);
      }
      continue;
    }
    const { token } = resolveSourcePath(item, cwd);
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
 * 否则 path-class-entry-missing=<解析出的路径>。条目可带 #锚点 后缀用于同文件按锚点分层；
 * 条目本身可含空格（空格属于路径），末端的行号与锚点后缀照常剥离。
 * 返回归一化匹配器列表。
 */
function parsePathClass(value, failures, cwd) {
  if (isEmptyValue(value)) {
    return null;
  }
  const items = value.split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => {
      const m = /^`([^`]+)`$/.exec(s);
      return m ? { text: m[1].trim(), explicit: true } : { text: s.replace(/`/g, ''), explicit: false };
    });
  const matchers = [];
  for (const item of items) {
    if (isAbsOrUnsafe(item.text)) {
      failures.push(`bad-path-class-entry=${item.text}`);
      continue;
    }
    const anchor = anchorSuffixOf(item.text);
    const bare = resolveSourcePath(item, cwd).token;
    if (bare === '') {
      failures.push(`bad-path-class-entry=${item.text}`);
      continue;
    }
    if (!fs.existsSync(path.resolve(cwd, bare))) {
      failures.push(`path-class-entry-missing=${bare}`);
      continue;
    }
    const norm = normRel(bare);
    matchers.push({ raw: norm, prefix: norm.endsWith('/'), anchor: anchor === '' ? null : normAnchor(anchor) });
  }
  return matchers;
}

/** 路径类解析后的匹配器：raw 为归一化前缀或精确路径，anchor 为可选锚点限定。 */
function normAnchor(a) {
  return (a || '').replace(/^#/, '').toLowerCase();
}

/**
 * 来源路径记号命中路径类：
 *  - 路径类条目带锚点时，来源也必须命中同一锚点（支持同文件按锚点分层的声明办法）；
 *  - 路径类条目不带锚点时按前缀（/ 结尾）或精确相等匹配。
 */
function pathMatches(token, matchers, anchor) {
  if (!matchers) {
    return false;
  }
  const t = normRel(token);
  const a = normAnchor(anchor);
  return matchers.some((m) => {
    const byPath = m.prefix ? t.startsWith(m.raw) : t === m.raw;
    if (!byPath) {
      return false;
    }
    if (m.anchor === null) {
      return true;
    }
    return m.anchor === a;
  });
}

/** 步骤行各来源的 {token, anchor} 列表（不含 none 项与空记号）。 */
function sourceTokens(cell, cwd) {
  return sourceItems(cell)
    .filter((it) => it.text !== 'none')
    .map((it) => resolveSourcePath(it, cwd))
    .filter((row) => row.token !== '');
}

/**
 * 解析分层段落：返回 { fields, stepRows, compareRows, diffRows, problems }
 * problems 收集结构性错误（缺小节、缺表头、重复段落、旧格式步骤表等），供 check 汇总。
 */
function parseSection(lines) {
  const problems = [];
  const fieldProblems = [];
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
  // 围栏代码块内的示例行（字段行、表头等）不是本报告的真实内容，跳过。
  const bodyMask = fenceMask(body);

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

  for (let bi = 0; bi < body.length; bi += 1) {
    if (bodyMask[bi]) {
      continue;
    }
    const line = body[bi];
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
      // 同一字段重复出现时记录问题，不静默让后者覆盖前者。
      if (Object.prototype.hasOwnProperty.call(fields, field[1])) {
        const first = fields[field[1]];
        const second = field[2].trim();
        const kind = first === second ? 'duplicate-field' : 'conflicting-field';
        if (!fieldProblems.includes(`${kind}=${field[1]}`)) {
          fieldProblems.push(`${kind}=${field[1]}`);
        }
      }
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
  problems.push(...fieldProblems);
  return { fields, stepRows, compareRows, diffRows, problems };
}

function cmdInit(flags) {
  const fileRel = flags['--file'];
  if (!fileRel) {
    finish('init', 'exec-failed', { reason: 'missing --file <report.md>' });
  }
  const cwd = path.resolve(flags['--cwd'] || '.');
  const abs = path.resolve(cwd, fileRel);
  const status = classifyReportFile(abs);
  if (status.kind === 'error') {
    finish('init', 'exec-failed', { reason: inspectFailureReason(fileRel, status.code) });
  }
  if (status.kind === 'missing') {
    finish('init', 'not-run', { reason: `report file does not exist: ${fileRel}`, info: { lines: ['init 不代写报告正文，先由交付方写出报告再补分层段落'] } });
  }
  if (status.kind === 'not-file') {
    finish('init', 'not-run', { reason: `report path is not a regular file: ${fileRel}`, info: { lines: ['init 不代写报告正文（不是普通文件，不追加分层段落）'] } });
  }
  const read = readReportFile(abs);
  if (!read.ok) {
    finish('init', 'exec-failed', { reason: readFailureReason(fileRel, read.code) });
  }
  const { buf, text } = read;
  const lines = text.split(/\r?\n/);
  const mask = fenceMask(lines);
  if (lines.some((l, i) => !mask[i] && SECTION_HEADING.test(l))) {
    finish('init', 'exists-kept', { reason: 'layer section already present', info: { lines: [`path: ${fileRel}`] } });
  }
  // 既有报告带 UTF-8 BOM 时原样写回（BOM 从原始字节判定，decode 已保留它）。
  const hasBom = hasUtf8Bom(buf);
  const body = hasBom && text.startsWith('\uFEFF') ? text.slice(1) : text;
  const crlf = (buf.toString('binary').match(/\r\n/g) || []).length;
  const loneLf = (buf.toString('binary').match(/(?<!\r)\n/g) || []).length;
  const eol = crlf > loneLf ? '\r\n' : '\n';
  let out = body;
  if (!out.endsWith('\n')) {
    out += eol;
  }
  if (!out.endsWith(eol + eol) && !out.endsWith('\n\n')) {
    out += eol;
  }
  out += SECTION_SKELETON.join(eol);
  const outText = hasBom ? `\uFEFF${out}` : out;
  // 写入、写后读回核验与 rename 三步都可能失败（目标只读、磁盘满、路径被占用等）。
  // 与 changelog.mjs 的 init 同口径：失败一律落 exec-failed(3)，清理自己创建的 tmp，
  // 既不抛未捕获异常，也不在目标目录留下半成品。
  const tmp = `${abs}.report-layers-tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, outText);
    const reread = decodeUtf8(fs.readFileSync(tmp));
    if (reread !== outText) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        // 清理尽力而为，不覆盖上面已定的失败原因
      }
      finish('init', 'exec-failed', { reason: `write-back verification failed for ${fileRel}` });
    }
    fs.renameSync(tmp, abs);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // 清理尽力而为，不覆盖下面如实报出的写盘错误
    }
    const detail = error && error.code ? error.code : (error && error.message) || 'unknown error';
    const errno = error && typeof error.errno === 'number' ? ` errno=${error.errno}` : '';
    finish('init', 'exec-failed', { reason: `write failed for ${fileRel}: ${detail}${errno}` });
  }
  finish('init', 'created', {
    info: { lines: [`path: ${fileRel}`, 'layer section appended at end of file', ...(hasBom ? ['bom: 已保留原有 UTF-8 BOM'] : [])] }
  });
}

function cmdCheck(flags) {
  const fileRel = flags['--file'];
  if (!fileRel) {
    finish('check', 'exec-failed', { reason: 'missing --file <report.md>' });
  }
  const cwd = path.resolve(flags['--cwd'] || '.');
  const abs = path.resolve(cwd, fileRel);
  const status = classifyReportFile(abs);
  if (status.kind === 'error') {
    finish('check', 'exec-failed', { reason: inspectFailureReason(fileRel, status.code) });
  }
  if (status.kind === 'missing') {
    finish('check', 'not-run', { reason: `report file does not exist: ${fileRel}` });
  }
  if (status.kind === 'not-file') {
    finish('check', 'not-run', { reason: `report path is not a regular file: ${fileRel}`, info: { lines: ['不是普通文件（不代写报告正文）：check 只校验既有报告正文，不代写正文'] } });
  }
  const read = readReportFile(abs);
  if (!read.ok) {
    finish('check', 'exec-failed', { reason: readFailureReason(fileRel, read.code) });
  }
  const text = read.text;
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
    const tokens = sourceTokens(cells[4], cwd);
    if (tag === 'test_harness_prerequisite') {
      if (!tokens.some((t) => pathMatches(t.token, harnessMatchers, t.anchor))) {
        failures.push(`harness-row-source-outside-harness-paths=${rowName}`);
      }
    } else if (tag === 'operator_or_maintainer_flow') {
      if (!tokens.some((t) => pathMatches(t.token, maintainerMatchers, t.anchor))) {
        failures.push(`maintainer-row-source-outside-maintainer-paths=${rowName}`);
      }
    } else if (tag === 'product_user_flow') {
      if (tokens.some((t) => pathMatches(t.token, harnessMatchers, t.anchor))) {
        failures.push(`product-row-source-in-harness-paths=${rowName}`);
      }
      if (tokens.some((t) => pathMatches(t.token, maintainerMatchers, t.anchor))) {
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

  // 差异表行：新增第 5 列「是否违反已确认体验要求」，取值 yes | no。
  // 只有 in-scope、未解决且违反验收要求的差异才阻断 aligned；
  // 影响说明、是否属本轮范围、是否违反要求由人工在表中如实记录。
  const unresolvedViolations = [];
  for (const cells of diffRows) {
    if (cells.length !== 5 || cells.some((c) => c === '')) {
      failures.push(`bad-diff-row=${cells.join('|')}`);
      continue;
    }
    if (!SCOPE_VALUES.has(cells[2])) {
      failures.push(`bad-diff-scope=${cells[2]}`);
    }
    if (!DIFF_STATES.has(cells[3])) {
      failures.push(`bad-diff-state=${cells[3]}`);
    }
    if (!VIOLATION_VALUES.has(cells[4])) {
      failures.push(`bad-diff-violation=${cells[4]}`);
    }
    const open = cells[2] === 'in-scope' && cells[3] !== 'resolved';
    if (open && cells[4] === 'yes') {
      unresolvedViolations.push(cells[0]);
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
  // 共享证据允许：同一份日志/录像/测试记录可以同时支撑控制逻辑与用户体验两个维度。
  // 不再按路径或文本相同判冒充；只有两处完全相同且未写明维度时才提示补写。
  if (isUndistinguishedSharedEvidence(cev, uev)) {
    failures.push('evidence-not-distinguished');
  }
  if (ux === 'aligned') {
    if (isEmptyValue(ref)) {
      failures.push('aligned-without-reference-product');
    }
    if (!isEmptyValue(uev) && containsAny(uev, STATIC_EVIDENCE_TOKENS)) {
      failures.push('aligned-with-static-only-evidence');
    }
    // 只有「违反已确认体验要求且本轮未解决」的差异才阻断 aligned；
    // 差异的影响、是否属本轮范围、是否违反验收要求由人工在差异表与审查依据中记录。
    if (unresolvedViolations.length > 0) {
      failures.push(`aligned-with-unresolved-requirement-violations=${unresolvedViolations.length}`);
    }
    if (review !== 'reviewed') {
      failures.push('aligned-without-layer-review');
    }
    // 双方正常路径都要有实测记录；但不要求点数相等，也不要求异常分支两边同时存在。
    const normal = compareCounts.normal || {};
    if (!Number.isInteger(normal.reference) || !Number.isInteger(normal.project)) {
      failures.push('aligned-without-two-sided-comparison path=normal');
    }
    // 点数不同必须有对应差异说明；单侧未观察的分支不得写成已验证。
    for (const p of Object.keys(compareCounts)) {
      const r = compareCounts[p].reference;
      const pr = compareCounts[p].project;
      const bothInt = Number.isInteger(r) && Number.isInteger(pr);
      if (bothInt && r !== pr && !hasDifferenceRecordFor(diffRows, p)) {
        failures.push(`interaction-count-differs-without-difference-record path=${p}`);
      }
      if (Number.isInteger(r) !== Number.isInteger(pr)) {
        const oneSide = Number.isInteger(r) ? 'reference' : 'project';
        const recorded = compareRows.some((c) => c.length === 5 && c[0] === p && c[1] === oneSide);
        if (!recorded) {
          failures.push(`one-sided-branch-not-recorded path=${p} side=${oneSide}`);
        }
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

  // R9 声称扫描：否定句、条件句与引用已豁免。
  // 硬检查以结构化结论与证据的一致性为准；自然语言声称无法可靠判断时只给审查提示，
  // 不作为武断的 format-fail——是否夸大由 §6 人工审查项负责。
  const hints = [];
  const alignedClaimExempt = (line, token) => token === '已对齐'
    && line.includes('控制逻辑') && !line.includes('体验');
  if (ux && ux !== 'aligned') {
    const over = findClaimHit(claimText, OVERCLAIM_PHRASES);
    if (over) {
      hints.push(`review-hint: 体验状态为 ${ux}，正文出现「${over.hit}」，请人工确认是否夸大`);
    }
  }
  if (ux === 'unverified' || ux === 'not-applicable') {
    const fact = findClaimHit(claimText, FACT_CLAIM_PHRASES, alignedClaimExempt);
    if (fact) {
      hints.push(`review-hint: 体验状态为 ${ux}，正文出现「${fact.hit}」，请人工确认是否为如实降级表述`);
    }
  }

  if (failures.length > 0) {
    finish('check', 'format-fail', {
      reason: failures.join('; '),
      info: {
        lines: [
          `path: ${fileRel}`,
          `step-rows: ${stepRows.length}`,
          `compare-rows: ${compareRows.length}`,
          `diff-rows: ${diffRows.length}`,
          ...hints
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
        `reference_product: ${f.reference_product}`,
        ...hints
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
