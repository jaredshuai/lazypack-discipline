#!/usr/bin/env node
/**
 * skills/lazypack-setup/scripts/unit_contracts.mjs
 *
 * 单元契约（*.unit.json，schema lazypack-unit/1）的校验与验证矩阵生成（#110、#111）。
 * 只依赖 Node 标准库，只读本脚本所在的 skill 目录。
 *
 *   node scripts/unit_contracts.mjs check    校验全部契约，并比对已提交的矩阵
 *   node scripts/unit_contracts.mjs matrix   按契约重写 references/unit-matrix.md
 * 包根目录固定为本脚本的上一级目录（按真实路径解析）。
 *
 * 契约放在哪里：
 *   - presets/、recipes/ 下每张卡片旁各一份，文件名是卡片名去掉 .md 加 .unit.json；
 *   - 包根一份 lazypack-core.unit.json，描述不属于任何配方的通用纪律产物，card 是 SKILL.md。
 *
 * check 做的事：
 *   1. 字段：全部字段必填，类型与取值合法，不允许多余字段；verify 至少一条且命令非空。
 *   2. 引用：card、files[].source、rules 里的文件都在包内存在；rules 的章节号在该文件里
 *      恰好对应一个二级或三级标题（更深的标题常在小节内从 1 重新编号，不参与；
 *      代码围栏内的不算）。
 *   3. 版本：preset / recipe 的 id、version 与卡片 frontmatter 逐字相同；
 *      core 的 version 与 references/DECISIONS.md 的版本行相同。
 *   4. 覆盖：presets/、recipes/ 下每张卡片都有契约；templates/、assets/ 下每个文件
 *      都被某份契约的 files[].source 引用。
 *   5. 矩阵：references/unit-matrix.md 与按当前契约生成的内容一致。
 *
 * 证据（evidence）只登记有公开出处的记录：source 必须是 GitHub 的 issue 评论、
 * PR 评论或 Actions 运行/作业链接。矩阵里没有证据的格子显示「未验证」。
 * 退出码：0 通过；1 检查失败；2 用法错误。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UNIT_SCHEMA = 'lazypack-unit/1';
export const UNIT_SUFFIX = '.unit.json';
export const MATRIX_REL = 'references/unit-matrix.md';
export const CORE_CONTRACT = 'lazypack-core.unit.json';
export const PLATFORMS = ['linux', 'windows', 'macos'];

const CORE_CARD = 'SKILL.md';
const CORE_VERSION_SOURCE = 'references/DECISIONS.md';
const CARD_DIRS = { presets: 'preset', recipes: 'recipe' };
const COVERED_DIRS = ['templates', 'assets'];
const FIELDS = ['schema', 'id', 'version', 'kind', 'card', 'applies_when', 'provides', 'files', 'verify', 'evidence', 'rules'];
const KINDS = ['core', 'preset', 'recipe'];
const PROBES = {
  'path-exists': ['path'],
  'path-absent': ['path'],
  'command-exists': ['command'],
  'json-field': ['path', 'field', 'exists']
};
const FILE_FIELDS = ['source', 'target', 'mode', 'managed'];
const MODES = ['0644', '0755'];
const VERIFY_FIELDS = ['command', 'expect_exit', 'cwd'];
const EVIDENCE_FIELDS = ['kind', 'platform', 'environment', 'date', 'unit_version', 'scope', 'source'];
const EVIDENCE_KINDS = ['host-acceptance', 'fixture-test'];
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SOURCE_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:(issues|pull)\/(\d+)#issuecomment-\d+|pull\/(\d+)#discussion_r\d+|actions\/runs\/(\d+)(?:\/job\/\d+)?)$/;
const RULE_RE = /^(\S+) §(\d+(?:\.\d+)*)$/;
const HEADING_RE = /^#{2,3}[ \t]+(\d+(?:\.\d+)*)\.?(?:[ \t]|$)/;

const KIND_LABEL = { 'host-acceptance': '宿主验收', 'fixture-test': '夹具测试' };
const PLATFORM_LABEL = { linux: 'Linux', windows: 'Windows', macos: 'macOS' };

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function listFiles(dir) {
  const out = [];
  const walk = (cur) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(abs);
      } else if (entry.isFile()) {
        out.push(toPosix(path.relative(dir, abs)));
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function isText(v) {
  return typeof v === 'string' && v.trim() !== '' && !/[\r\n]/.test(v);
}

/** 包内或目标仓内的相对路径：POSIX 写法，不是绝对路径，不含 . 与 .. 段。 */
function isRelPath(v) {
  if (!isText(v) || v !== v.trim() || v.includes('\\') || v.startsWith('/') || /^[a-zA-Z]:/.test(v)) return false;
  return v.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

function isRealDate(v) {
  const m = typeof v === 'string' ? v.match(DATE_RE) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** 真实路径仍在包内的普通文件。 */
function packageFile(root, rel) {
  const abs = path.join(root, rel);
  let real;
  try { real = fs.realpathSync(abs); } catch { return false; }
  if (real !== root && !real.startsWith(root + path.sep)) return false;
  return fs.statSync(real).isFile();
}

/** 按字段表检查一个对象：缺字段、多余字段各报一条，返回是否齐全。 */
function checkKeys(obj, fields, where, fail) {
  if (!isPlainObject(obj)) {
    fail(`${where} 必须是对象`);
    return false;
  }
  let ok = true;
  for (const f of fields) {
    if (!Object.hasOwn(obj, f)) {
      fail(`${where} 缺少必填字段 ${f}`);
      ok = false;
    }
  }
  for (const k of Object.keys(obj)) {
    if (!fields.includes(k)) {
      fail(`${where} 有未定义的字段 ${k}`);
      ok = false;
    }
  }
  return ok;
}

function frontmatter(text) {
  const lines = text.split(/\r?\n/);
  const out = {};
  if (lines[0] !== '---') return out;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') return out;
    const m = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return {};
}

/** 文件里以章节号开头的二级、三级标题，跳过代码围栏。返回 Map<章节号, 出现次数>。 */
function headingNumbers(text) {
  const counts = new Map();
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const f = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && f[2].trim() === '') fence = null;
      continue;
    }
    if (f && !(f[1][0] === '`' && f[2].includes('`'))) {
      fence = { ch: f[1][0], len: f[1].length };
      continue;
    }
    const m = line.match(HEADING_RE);
    if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  return counts;
}

/** 包内全部契约文件的相对路径（POSIX），已排序。 */
export function findContracts(root) {
  return listFiles(root).filter((rel) => rel.endsWith(UNIT_SUFFIX));
}

function expectedPlacement(rel) {
  if (rel === CORE_CONTRACT) return { kind: 'core', card: CORE_CARD };
  const parts = rel.split('/');
  if (parts.length === 2 && Object.hasOwn(CARD_DIRS, parts[0])) {
    return { kind: CARD_DIRS[parts[0]], card: `${parts[1].slice(0, -UNIT_SUFFIX.length)}.md` };
  }
  return null;
}

function checkProbes(list, where, fail) {
  if (!Array.isArray(list)) {
    fail(`${where} 必须是数组`);
    return;
  }
  list.forEach((p, i) => {
    const at = `${where}[${i}]`;
    if (!isPlainObject(p) || !Object.hasOwn(PROBES, p.probe)) {
      fail(`${at} 的 probe 必须是 ${Object.keys(PROBES).join(' / ')} 之一`);
      return;
    }
    if (!checkKeys(p, ['probe', ...PROBES[p.probe]], at, fail)) return;
    if (Object.hasOwn(p, 'path') && !isRelPath(p.path)) fail(`${at}.path 必须是目标仓内的相对路径`);
    if (Object.hasOwn(p, 'command') && !/^[\w.+-]+$/.test(String(p.command))) fail(`${at}.command 必须是单个命令名`);
    if (Object.hasOwn(p, 'field') && !isText(p.field)) fail(`${at}.field 必须是非空字符串`);
    if (Object.hasOwn(p, 'exists') && typeof p.exists !== 'boolean') fail(`${at}.exists 必须是布尔值`);
  });
}

function checkProvides(list, where, fail) {
  if (!Array.isArray(list) || list.length === 0) {
    fail(`${where} 必须是非空数组`);
    return;
  }
  if (!list.every((v) => typeof v === 'string' && ID_RE.test(v))) fail(`${where} 的每一项必须是小写短横线写法的标签`);
  if (new Set(list).size !== list.length) fail(`${where} 有重复项`);
}

function checkFiles(root, list, where, fail) {
  if (!Array.isArray(list)) {
    fail(`${where} 必须是数组`);
    return;
  }
  const targets = new Set();
  list.forEach((f, i) => {
    const at = `${where}[${i}]`;
    if (!checkKeys(f, FILE_FIELDS, at, fail)) return;
    if (!isRelPath(f.source)) fail(`${at}.source 必须是相对包根的路径`);
    else if (!packageFile(root, f.source)) fail(`${at}.source 在包内不存在：${f.source}`);
    if (!isRelPath(f.target)) fail(`${at}.target 必须是相对目标仓根的路径`);
    else if (targets.has(f.target)) fail(`${at}.target 重复：${f.target}`);
    else targets.add(f.target);
    if (!MODES.includes(f.mode)) fail(`${at}.mode 必须是 ${MODES.map((m) => `"${m}"`).join(' 或 ')}`);
    if (typeof f.managed !== 'boolean') fail(`${at}.managed 必须是布尔值`);
  });
}

/** files[].target 里出现过的全部上级目录，verify[].cwd 只能取其中之一或 target-root。 */
function targetDirs(files) {
  const dirs = new Set();
  for (const f of Array.isArray(files) ? files : []) {
    if (!isPlainObject(f) || !isRelPath(f.target)) continue;
    const parts = f.target.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  return dirs;
}

function checkVerify(list, files, where, fail) {
  if (!Array.isArray(list) || list.length === 0) {
    fail(`${where} 必须是非空数组：每个单元至少有一条验证命令`);
    return;
  }
  const dirs = targetDirs(files);
  list.forEach((v, i) => {
    const at = `${where}[${i}]`;
    if (!checkKeys(v, VERIFY_FIELDS, at, fail)) return;
    if (!isText(v.command)) fail(`${at}.command 不能为空`);
    if (!Number.isInteger(v.expect_exit) || v.expect_exit < 0 || v.expect_exit > 255) fail(`${at}.expect_exit 必须是 0–255 的整数`);
    if (v.cwd !== 'target-root' && !dirs.has(v.cwd)) fail(`${at}.cwd 必须是 "target-root" 或 files[].target 里出现的某个目录`);
  });
}

function checkEvidence(list, where, fail) {
  if (!Array.isArray(list)) {
    fail(`${where} 必须是数组`);
    return;
  }
  list.forEach((e, i) => {
    const at = `${where}[${i}]`;
    if (!checkKeys(e, EVIDENCE_FIELDS, at, fail)) return;
    if (!EVIDENCE_KINDS.includes(e.kind)) fail(`${at}.kind 必须是 ${EVIDENCE_KINDS.join(' 或 ')}`);
    if (!PLATFORMS.includes(e.platform)) fail(`${at}.platform 必须是 ${PLATFORMS.join(' / ')} 之一`);
    if (!isText(e.environment)) fail(`${at}.environment 必须是单行非空字符串`);
    if (!isRealDate(e.date)) fail(`${at}.date 必须是真实存在的 YYYY-MM-DD 日期`);
    if (typeof e.unit_version !== 'string' || !SEMVER_RE.test(e.unit_version)) fail(`${at}.unit_version 必须是 SemVer`);
    if (!isText(e.scope)) fail(`${at}.scope 必须是单行非空字符串`);
    if (typeof e.source !== 'string' || !SOURCE_RE.test(e.source)) {
      fail(`${at}.source 必须是 GitHub 的 issue 评论、PR 评论或 Actions 运行/作业链接`);
    }
  });
}

function checkRules(root, contractRel, list, where, fail) {
  if (!Array.isArray(list) || list.length === 0) {
    fail(`${where} 必须是非空数组`);
    return;
  }
  const baseDir = path.posix.dirname(contractRel);
  const cache = new Map();
  list.forEach((rule, i) => {
    const at = `${where}[${i}]`;
    const m = typeof rule === 'string' ? rule.match(RULE_RE) : null;
    if (!m || !isRelPath(m[1])) {
      fail(`${at} 必须写成「<文件> §<章节号>」，文件相对契约所在目录`);
      return;
    }
    const rel = path.posix.join(baseDir, m[1]);
    if (!packageFile(root, rel)) {
      fail(`${at} 指向的文件在包内不存在：${m[1]}`);
      return;
    }
    if (!cache.has(rel)) cache.set(rel, headingNumbers(fs.readFileSync(path.join(root, rel), 'utf8')));
    const n = cache.get(rel).get(m[2]) || 0;
    if (n === 0) fail(`${at} 在 ${rel} 里找不到以 ${m[2]} 开头的标题`);
    else if (n > 1) fail(`${at} 在 ${rel} 里对应 ${n} 个标题，章节号不唯一`);
  });
}

function checkIdentity(root, rel, unit, placement, fail) {
  if (unit.kind !== placement.kind) fail(`kind 应为 ${placement.kind}（由契约所在位置决定），实际 ${JSON.stringify(unit.kind)}`);
  if (unit.card !== placement.card) {
    fail(`card 应为 ${placement.card}，实际 ${JSON.stringify(unit.card)}`);
    return;
  }
  const cardRel = path.posix.join(path.posix.dirname(rel), placement.card);
  if (!packageFile(root, cardRel)) {
    fail(`card 在包内不存在：${cardRel}`);
    return;
  }
  if (placement.kind === 'core') {
    if (unit.id !== 'lazypack-core') fail(`core 契约的 id 应为 lazypack-core，实际 ${JSON.stringify(unit.id)}`);
    if (!packageFile(root, CORE_VERSION_SOURCE)) {
      fail(`找不到 ${CORE_VERSION_SOURCE}，无法核对 core 的 version`);
      return;
    }
    const m = fs.readFileSync(path.join(root, CORE_VERSION_SOURCE), 'utf8').match(/^版本：(\d+\.\d+\.\d+)/m);
    if (!m) fail(`${CORE_VERSION_SOURCE} 里没有「版本：x.y.z」一行，无法核对 core 的 version`);
    else if (m[1] !== unit.version) fail(`version 应与 ${CORE_VERSION_SOURCE} 的版本 ${m[1]} 相同，实际 ${JSON.stringify(unit.version)}`);
    return;
  }
  const fm = frontmatter(fs.readFileSync(path.join(root, cardRel), 'utf8'));
  for (const key of ['id', 'version']) {
    if (fm[key] !== unit[key]) {
      fail(`${key} 应与卡片 ${cardRel} 的 frontmatter 相同（${JSON.stringify(fm[key] ?? null)}），实际 ${JSON.stringify(unit[key])}`);
    }
  }
}

function checkContract(root, rel, failures) {
  const fail = (detail) => failures.push(`${rel}：${detail}`);
  const placement = expectedPlacement(rel);
  if (!placement) {
    fail(`契约只能放在包根（${CORE_CONTRACT}）或 ${Object.keys(CARD_DIRS).map((d) => `${d}/`).join('、')} 下的卡片旁`);
    return null;
  }
  let unit;
  try {
    unit = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (err) {
    fail(`不是合法 JSON：${err.message}`);
    return null;
  }
  const before = failures.length;
  if (!checkKeys(unit, FIELDS, '契约', fail)) return null;
  if (unit.schema !== UNIT_SCHEMA) fail(`schema 应为 ${UNIT_SCHEMA}，实际 ${JSON.stringify(unit.schema)}`);
  if (typeof unit.id !== 'string' || !ID_RE.test(unit.id)) fail('id 必须是小写短横线写法的非空字符串');
  if (typeof unit.version !== 'string' || !SEMVER_RE.test(unit.version)) fail('version 必须是 SemVer（x.y.z）');
  if (!KINDS.includes(unit.kind)) fail(`kind 必须是 ${KINDS.join(' / ')} 之一`);
  if (!isRelPath(unit.card)) fail('card 必须是相对契约所在目录的路径');
  else checkIdentity(root, rel, unit, placement, fail);
  checkProbes(unit.applies_when, 'applies_when', fail);
  checkProvides(unit.provides, 'provides', fail);
  checkFiles(root, unit.files, 'files', fail);
  checkVerify(unit.verify, unit.files, 'verify', fail);
  checkEvidence(unit.evidence, 'evidence', fail);
  checkRules(root, rel, unit.rules, 'rules', fail);
  return failures.length === before ? { ...unit, contract: rel } : null;
}

function checkCoverage(root, contracts, parsed, failures) {
  const have = new Set(contracts);
  if (!have.has(CORE_CONTRACT)) failures.push(`缺少 ${CORE_CONTRACT}：通用纪律产物没有契约`);
  for (const dir of Object.keys(CARD_DIRS)) {
    for (const rel of listFiles(path.join(root, dir))) {
      if (rel.includes('/') || !rel.endsWith('.md')) continue;
      const want = `${dir}/${rel.slice(0, -3)}${UNIT_SUFFIX}`;
      if (!have.has(want)) failures.push(`卡片 ${dir}/${rel} 没有契约，应有 ${want}`);
    }
  }
  const sources = new Set();
  for (const text of parsed) {
    for (const f of Array.isArray(text.files) ? text.files : []) {
      if (isPlainObject(f) && typeof f.source === 'string') sources.add(f.source);
    }
  }
  for (const dir of COVERED_DIRS) {
    for (const rel of listFiles(path.join(root, dir))) {
      if (!sources.has(`${dir}/${rel}`)) failures.push(`${dir}/${rel} 没有被任何契约的 files[].source 引用`);
    }
  }
}

/**
 * 校验包内全部契约。返回 { units, failures }：units 是通过校验的契约（按矩阵行序），
 * failures 是说明字符串数组。任一契约没通过时不应据 units 生成矩阵。
 */
export function validateContracts(rootDir) {
  const root = fs.realpathSync(rootDir);
  const failures = [];
  const contracts = findContracts(root);
  const units = [];
  const raw = [];
  for (const rel of contracts) {
    const unit = checkContract(root, rel, failures);
    if (unit) units.push(unit);
    try { raw.push(JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))); } catch { /* 已报 */ }
  }
  const ids = new Map();
  for (const u of units) {
    if (ids.has(u.id)) failures.push(`${u.contract}：id ${u.id} 与 ${ids.get(u.id)} 重复`);
    else ids.set(u.id, u.contract);
  }
  checkCoverage(root, contracts, raw.filter(isPlainObject), failures);
  units.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { units, failures };
}

function cell(text) {
  return String(text).replace(/\|/g, '\\|');
}

function sourceLabel(url) {
  const m = url.match(SOURCE_RE);
  if (m && m[4]) return `Actions 运行 ${m[4]}`;
  if (m && m[1] === 'issues') return `issue #${m[2]} 评论`;
  if (m) return `PR #${m[2] || m[3]} 评论`;
  return '出处';
}

function sortedEvidence(unit) {
  return [...unit.evidence].sort((a, b) =>
    PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform)
    || EVIDENCE_KINDS.indexOf(a.kind) - EVIDENCE_KINDS.indexOf(b.kind)
    || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
    || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
}

function matrixCell(unit, platform) {
  const items = sortedEvidence(unit).filter((e) => e.platform === platform);
  if (items.length === 0) return '未验证';
  return items
    .map((e) => `${KIND_LABEL[e.kind]} [${e.date}](${e.source})${e.unit_version === unit.version ? '' : `（旧版 ${e.unit_version}）`}`)
    .join('<br>');
}

/** 按通过校验的契约渲染矩阵文件全文（LF 换行，结果只取决于契约内容）。 */
export function renderMatrix(units) {
  const lines = [
    '# 单元验证矩阵',
    '',
    '> 本文件由 `node scripts/unit_contracts.mjs matrix` 按各单元契约（`*.unit.json`）的 `evidence` 生成，不要手改。改了契约要重新生成，包检查会比对两者是否一致。',
    '',
    '## 怎么读',
    '',
    '- 一行是一个单元：`core` 是不属于任何配方的通用纪律产物，`preset` 是质量门禁配方，`recipe` 是按需配方。',
    '- 列是操作系统。AI 宿主（Claude Code、Codebuddy 等）和运行时版本不单独成列，写在明细的「环境」一栏。',
    '- 「宿主验收」是在真实环境里实跑过该单元的验证命令或文件写入路径；「夹具测试」是自动测试在本仓夹具上实跑。两者都不等于在你的项目里验证过。',
    '- 格子只表示有过这一类记录。覆盖到哪里、没覆盖什么，以明细的「范围」一栏为准。',
    '- 「未验证」表示没有可公开核对的记录，不表示不能用，也不表示验证失败。',
    '- 记录时的单元版本与当前版本不同，格子里标「旧版」。',
    '',
    '## 矩阵',
    '',
    `| 单元 | 类型 | 当前版本 | ${PLATFORMS.map((p) => PLATFORM_LABEL[p]).join(' | ')} |`,
    `|---|---|---|${PLATFORMS.map(() => '---').join('|')}|`
  ];
  for (const u of units) {
    lines.push(`| \`${u.id}\` | \`${u.kind}\` | ${u.version} | ${PLATFORMS.map((p) => matrixCell(u, p)).join(' | ')} |`);
  }
  lines.push('', '## 证据明细', '');
  const rows = units.flatMap((u) => sortedEvidence(u).map((e) => ({ u, e })));
  if (rows.length === 0) {
    lines.push('没有任何证据记录。');
  } else {
    lines.push('| 单元 | 系统 | 类别 | 日期 | 单元版本 | 环境 | 范围 | 出处 |', '|---|---|---|---|---|---|---|---|');
    for (const { u, e } of rows) {
      lines.push(`| \`${u.id}\` | ${PLATFORM_LABEL[e.platform]} | ${KIND_LABEL[e.kind]} | ${e.date} | ${e.unit_version} | ${cell(e.environment)} | ${cell(e.scope)} | [${sourceLabel(e.source)}](${e.source}) |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * 包检查用的入口：契约校验加矩阵一致性。返回说明字符串数组，空数组表示通过。
 * 契约本身没通过时不再比对矩阵，先修契约。
 */
export function checkUnits(rootDir) {
  const root = fs.realpathSync(rootDir);
  const { units, failures } = validateContracts(root);
  if (failures.length) return failures;
  const file = path.join(root, MATRIX_REL);
  if (!fs.existsSync(file)) return [`缺少 ${MATRIX_REL}；运行 node scripts/unit_contracts.mjs matrix 生成`];
  const recorded = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (recorded !== renderMatrix(units)) {
    return [`${MATRIX_REL} 与契约不一致；改了契约后须运行 node scripts/unit_contracts.mjs matrix 重新生成`];
  }
  return [];
}

function main(argv) {
  const args = argv.slice(2);
  const cmd = args.length === 1 ? args[0] : null;
  const root = fs.realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (cmd === 'matrix') {
    const { units, failures } = validateContracts(root);
    for (const f of failures) console.error(`FAIL ${f}`);
    if (failures.length) {
      console.error(`契约校验失败：${failures.length} 项。未写入 ${MATRIX_REL}。`);
      return 1;
    }
    fs.writeFileSync(path.join(root, MATRIX_REL), renderMatrix(units));
    console.log(`已写入 ${MATRIX_REL}：${units.length} 个单元，${units.reduce((n, u) => n + u.evidence.length, 0)} 条证据`);
    return 0;
  }
  if (cmd === 'check') {
    const failures = checkUnits(root);
    for (const f of failures) console.error(`FAIL ${f}`);
    if (failures.length) {
      console.error(`单元契约检查失败：${failures.length} 项。`);
      return 1;
    }
    console.log('单元契约检查通过：契约字段、包内引用、版本、覆盖与矩阵均无差异');
    return 0;
  }
  console.error('用法：node scripts/unit_contracts.mjs <check|matrix>');
  return 2;
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exit(main(process.argv));
}
