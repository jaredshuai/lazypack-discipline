/**
 * changelog.mjs — Keep a Changelog 1.1.0 种子、结构校验与提交历史编译器
 *
 * 判定口径唯一正文：lazypack-discipline 仓 docs/agents/changelog-tool.md。
 * 用法:
 *   node changelog.mjs init    [--cwd <dir>] [--path <file>]
 *   node changelog.mjs check   [--cwd <dir>] [--path <file>]
 *   node changelog.mjs release --version <x.y.z> [--cwd <dir>] [--path <file>]
 *          [--date YYYY-MM-DD] [--from <ref>] [--to <ref>] [--tag <tag>]
 *          [--repo-url <url>] [--dry-run]
 *
 * 未接 hook/CI。不是门禁。结构合规不等于条目由提交真实生成。
 * Node 标准库实现，零 npm 依赖。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_ABS = fileURLToPath(import.meta.url);
const DISCLAIMER = '未接 hook/CI。不是门禁。结构合规不等于条目由提交真实生成。';

const EXIT_CODE = {
  created: 0,
  released: 0,
  'format-pass': 0,
  'exists-kept': 1,
  refused: 1,
  'format-fail': 1,
  'not-run': 2,
  'exec-failed': 3
};

const GROUPS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
const GROUP_SET = new Set(GROUPS);
const TYPE_TO_GROUP = {
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Changed',
  refactor: 'Changed',
  revert: 'Changed'
};
const INTERNAL_TYPES = new Set(['build', 'ci', 'docs', 'chore', 'test']);
const SUBJECT_SHAPE = /^([a-z][a-z0-9]*)(\(([^)]+)\))?(!)?: (\S.*)$/;
const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/;
const UNRELEASED_HEADING = /^## \[Unreleased\]\s*$/i;
const ANY_H2 = /^## (?!#)/;
const GROUP_HEADING = /^### (\S+)\s*$/;
const LIST_ITEM = /^\s*[-*]\s+\S/;
const TITLE_LINE = /^#\s+changelog\s*$/i;
const LINK_DEF = /^\[([^\]]+)\]:\s*(\S+)\s*$/;
const UNRELEASED_LINK = /^(\S+)\/compare\/(\S+)\.\.\.HEAD$/;
const VERSION_LINK = /\/(compare\/\S+\.\.\.\S+|releases\/tag\/\S+|tree\/\S+)$/;
const SEMVER_TAG = /^v?\d+\.\d+\.\d+$/;
const VERSION_ARG = /^\d+\.\d+\.\d+$/;
const DATE_ARG = /^\d{4}-\d{2}-\d{2}$/;

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
  const lines = [`changelog ${command}: ${status}`, DISCLAIMER];
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

/** 解析命令行参数为子命令与 flag 字典；未知 flag 或缺值记为错误。 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const flags = {};
  const errors = [];
  const known = new Set(['--cwd', '--path', '--version', '--date', '--from', '--to', '--tag', '--repo-url']);
  const booleans = new Set(['--dry-run']);
  for (let i = command === null ? 0 : 1; i < args.length; i += 1) {
    const arg = args[i];
    if (booleans.has(arg)) {
      flags[arg] = true;
      continue;
    }
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

/** 识别 CommonMark 围栏标记行（反引号或波浪号，缩进不超过 3）。 */
function matchFenceMarker(line) {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) {
    return null;
  }
  return { char: match[1][0], length: match[1].length, rest: match[2] };
}

function isClosingFence(line, openFence) {
  const marker = matchFenceMarker(line);
  if (!marker || marker.char !== openFence.char || marker.length < openFence.length) {
    return false;
  }
  return marker.rest.trim() === '';
}

function isOpeningFence(line) {
  const marker = matchFenceMarker(line);
  if (!marker) {
    return false;
  }
  if (marker.char === '`' && marker.rest.includes('`')) {
    return false;
  }
  return true;
}

/** 返回剔除围栏后的行数组副本（原行位置用空串占位保持行号）。 */
function stripFences(lines) {
  const out = lines.slice();
  let openFence = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (openFence) {
      if (isClosingFence(lines[i], openFence)) {
        openFence = null;
      }
      out[i] = '';
      continue;
    }
    if (isOpeningFence(lines[i])) {
      openFence = matchFenceMarker(lines[i]);
      out[i] = '';
    }
  }
  return out;
}

/** SemVer 三元组比较：a>b 返回 1，相等 0，a<b 返回 -1。 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) {
      return pa[i] > pb[i] ? 1 : -1;
    }
  }
  return 0;
}

/** YYYY-MM-DD 是否为真实日历日期。 */
function isRealDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    return false;
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * 解析 CHANGELOG 文本为结构化模型并给出违规清单。
 * lines 为 LF 规范化后的行数组（已剥离围栏）。
 */
function analyzeChangelog(lines) {
  const problems = [];
  const info = [];
  let titleIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === '') {
      continue;
    }
    titleIdx = i;
    break;
  }
  if (titleIdx === -1) {
    problems.push('文件为空');
    return { problems, info };
  }
  if (!TITLE_LINE.test(lines[titleIdx].trim())) {
    problems.push(`第 ${titleIdx + 1} 行：首个非空行必须是 \`# Changelog\``);
  }

  const headings = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const h2 = /^## \[([^\]]+)\](.*)$/.exec(line);
    if (UNRELEASED_HEADING.test(line)) {
      headings.push({ kind: 'unreleased', index: i });
      continue;
    }
    if (h2) {
      const vm = VERSION_HEADING.exec(line);
      if (vm) {
        headings.push({ kind: 'version', index: i, version: vm[1], date: vm[2] });
      } else {
        headings.push({ kind: 'bad-version', index: i, raw: line.trim() });
      }
      continue;
    }
    if (ANY_H2.test(line)) {
      headings.push({ kind: 'other-h2', index: i, raw: line.trim() });
      continue;
    }
    const g = GROUP_HEADING.exec(line);
    if (g) {
      headings.push({ kind: 'group', index: i, group: g[1] });
    }
  }

  const unreleased = headings.filter((h) => h.kind === 'unreleased');
  if (unreleased.length === 0) {
    problems.push('缺少 `## [Unreleased]` 区段');
  } else if (unreleased.length > 1) {
    problems.push('`## [Unreleased]` 区段出现多次');
  }
  const versions = headings.filter((h) => h.kind === 'version');
  for (const h of headings.filter((x) => x.kind === 'bad-version')) {
    problems.push(`第 ${h.index + 1} 行：版本头必须是 \`## [x.y.z] - YYYY-MM-DD\` 形态：${h.raw}`);
  }
  for (const h of headings.filter((x) => x.kind === 'other-h2')) {
    problems.push(`第 ${h.index + 1} 行：不允许版本区段以外的二级标题：${h.raw}`);
  }
  for (const v of versions) {
    if (!isRealDate(v.date)) {
      problems.push(`第 ${v.index + 1} 行：版本日期不是合法日历日期：${v.date}`);
    }
  }
  const dupVer = new Set();
  for (const v of versions) {
    if (dupVer.has(v.version)) {
      problems.push(`第 ${v.index + 1} 行：版本 ${v.version} 重复`);
    }
    dupVer.add(v.version);
  }
  for (let i = 1; i < versions.length; i += 1) {
    if (compareSemver(versions[i - 1].version, versions[i].version) <= 0) {
      problems.push(`第 ${versions[i].index + 1} 行：版本顺序未单调递减（${versions[i - 1].version} 后出现 ${versions[i].version}）`);
    }
  }

  // 条目与分组归属：每个 ### 分组必须落在某个 ## 区段内；列表条目必须落在分组内。
  let currentH2 = null;
  let currentGroup = null;
  const groupSeenInSection = new Set();
  for (let i = titleIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const h2 = /^## /.exec(line);
    const g = GROUP_HEADING.exec(line);
    const ld = LINK_DEF.exec(line);
    if (h2) {
      currentH2 = h2;
      currentGroup = null;
      groupSeenInSection.clear();
      continue;
    }
    if (g) {
      if (!currentH2) {
        problems.push(`第 ${i + 1} 行：分组标题出现在任何区段之外`);
      } else if (!GROUP_SET.has(g[1])) {
        problems.push(`第 ${i + 1} 行：分组 ${g[1]} 不在 Added/Changed/Deprecated/Removed/Fixed/Security 六分组内`);
      } else if (groupSeenInSection.has(g[1])) {
        problems.push(`第 ${i + 1} 行：同一区段内分组 ${g[1]} 重复`);
      } else {
        groupSeenInSection.add(g[1]);
      }
      currentGroup = GROUP_SET.has(g[1]) ? g[1] : null;
      continue;
    }
    if (ld) {
      currentGroup = null;
      continue;
    }
    if (LIST_ITEM.test(line) && !currentGroup) {
      problems.push(`第 ${i + 1} 行：条目必须写在六分组之内，不能直接挂在区段下`);
    }
  }

  // 链接引用形态（若启用）
  for (let i = 0; i < lines.length; i += 1) {
    const ld = LINK_DEF.exec(lines[i]);
    if (!ld) {
      continue;
    }
    const label = ld[1];
    const target = ld[2];
    if (/^unreleased$/i.test(label)) {
      if (!UNRELEASED_LINK.test(target)) {
        problems.push(`第 ${i + 1} 行：[Unreleased] 链接必须是 <repo>/compare/<ref>...HEAD 形态：${target}`);
      }
    } else if (/^\d+\.\d+\.\d+$/.test(label)) {
      if (!VERSION_LINK.test(target)) {
        problems.push(`第 ${i + 1} 行：[${label}] 链接必须是 compare / releases/tag / tree 形态：${target}`);
      }
    }
  }

  return { problems, info, titleIdx, headings, versions, unreleased: unreleased[0] || null };
}

/** 读取 CHANGELOG 文件；按 UTF-8 解码并剥离 BOM，统一为 LF 行数组与换行类型。 */
function readChangelog(absPath) {
  let buf;
  try {
    buf = fs.readFileSync(absPath);
  } catch (error) {
    return { ok: false, code: error && error.code ? error.code : 'unknown' };
  }
  const text = decodeUtf8(buf);
  if (text === null) {
    return { ok: false, code: 'invalid-utf8' };
  }
  const stripped = text.replace(/^\uFEFF/, '');
  const eol = stripped.includes('\r\n') ? '\r\n' : '\n';
  return { ok: true, lines: stripped.replace(/\r\n/g, '\n').split('\n'), eol };
}

/** 解析 --cwd 与 --path 为目标文件绝对路径；--cwd 必须是存在的目录。 */
function resolveTarget(flags) {
  const cwd = flags['--cwd'] ? path.resolve(flags['--cwd']) : process.cwd();
  let stat;
  try {
    stat = fs.statSync(cwd);
  } catch {
    return { ok: false, reason: `--cwd 目录不存在：${flags['--cwd']}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, reason: `--cwd 不是目录：${flags['--cwd']}` };
  }
  const rel = flags['--path'] || 'CHANGELOG.md';
  return { ok: true, cwd, abs: path.resolve(cwd, rel), rel };
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error) {
    return { ok: false, reason: `git 无法启动: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return { ok: false, reason: `git ${args[0]} 失败: ${(result.stderr || result.stdout || '').trim()}` };
  }
  return { ok: true, stdout: result.stdout };
}

/** 生成 init 骨架正文；selfRel 为相对 --cwd 的脚本自身路径。 */
function skeletonText(cwd) {
  const selfRel = path.relative(cwd, SELF_ABS).split(path.sep).join('/');
  const cmd = selfRel && !selfRel.startsWith('..') ? `node ${selfRel}` : 'node scripts/changelog.mjs';
  return [
    '# Changelog',
    '',
    '本文件遵循 Keep a Changelog 1.1.0 格式；版本区段由提交历史编译生成，不手写条目。',
    '',
    `生成：\`${cmd} release --version <x.y.z>\`（发版时执行）。校验：\`${cmd} check\`。播种：\`${cmd} init\`（文件缺失时执行一次，由 setup 或人工触发）。`,
    '',
    '## [Unreleased]',
    ''
  ].join('\n');
}

/** init：仅当目标不存在时写入骨架；存在即拒绝覆盖。 */
function cmdInit(flags) {
  const target = resolveTarget(flags);
  if (!target.ok) {
    finish('init', 'not-run', { reason: target.reason });
  }
  const stat = fs.existsSync(target.abs) ? fs.statSync(target.abs) : null;
  if (stat) {
    finish('init', 'exists-kept', {
      reason: `${target.rel} 已存在，未改动（既有文件受保护，不覆盖）`,
      info: { lines: [`path: ${target.rel}`] }
    });
  }
  const body = skeletonText(target.cwd);
  const tmp = `${target.abs}.changelog-tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, target.abs);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // 清理失败在 reason 中如实反映
    }
    finish('init', 'exec-failed', { reason: `写入失败: ${error.code || error.message}` });
  }
  const verify = readChangelog(target.abs);
  if (!verify.ok) {
    finish('init', 'exec-failed', { reason: '写后读回失败' });
  }
  finish('init', 'created', {
    info: { lines: [`path: ${target.rel}`, `bytes: ${Buffer.byteLength(body, 'utf8')}`] }
  });
}

/** check：按机器可判定子集校验结构。 */
function cmdCheck(flags) {
  const target = resolveTarget(flags);
  if (!target.ok) {
    finish('check', 'not-run', { reason: target.reason });
  }
  const read = readChangelog(target.abs);
  if (!read.ok) {
    if (read.code === 'ENOENT' || read.code === 'ENOTDIR') {
      finish('check', 'not-run', { reason: `${target.rel} 不存在或不是普通文件（不自动创建）` });
    }
    finish('check', 'exec-failed', { reason: `无法读取 ${target.rel}: ${read.code}` });
  }
  const stat = fs.statSync(target.abs);
  if (!stat.isFile()) {
    finish('check', 'not-run', { reason: `${target.rel} 不存在或不是普通文件（不自动创建）` });
  }
  const lines = stripFences(read.lines);
  const model = analyzeChangelog(lines);
  if (model.problems.length > 0) {
    finish('check', 'format-fail', {
      reason: `结构违规 ${model.problems.length} 处`,
      info: { lines: model.problems }
    });
  }
  finish('check', 'format-pass', {
    info: {
      lines: [
        `path: ${target.rel}`,
        `versions: ${(model.versions || []).map((v) => v.version).join(', ') || 'none'}`
      ]
    }
  });
}

/** 把一段 git log 输出解析为提交数组。 */
function parseCommits(raw) {
  const commits = [];
  const records = raw.split('\x1e').filter((rec) => rec.trim() !== '');
  for (const rec of records) {
    const fields = rec.split('\x1f');
    if (fields.length < 3) {
      continue;
    }
    commits.push({ sha: fields[0].trim(), subject: fields[1].trim(), body: fields.slice(2).join('\x1f') });
  }
  return commits;
}

/** 提交 → Keep a Changelog 分组条目；无法映射时返回 null 并计入对应桶。 */
function mapCommit(commit, buckets) {
  const m = SUBJECT_SHAPE.exec(commit.subject);
  if (!m) {
    buckets.nonconventional += 1;
    return null;
  }
  const type = m[1];
  const scope = m[3] || '';
  const bang = m[4] === '!';
  const desc = m[5].trim();
  if (INTERNAL_TYPES.has(type)) {
    buckets.internal += 1;
    return null;
  }
  const group = TYPE_TO_GROUP[type];
  if (!group) {
    buckets.unmapped += 1;
    return null;
  }
  const breaking = bang || /BREAKING[ -]CHANGE:/m.test(commit.body);
  const scopePrefix = scope ? `**${scope}:** ` : '';
  const entry = `- ${breaking ? '**BREAKING** ' : ''}${scopePrefix}${desc} (${commit.sha.slice(0, 7)})`;
  return { group, entry };
}

/**
 * 计算 release 的新文件内容（不触碰磁盘）。
 * 返回 { ok, reason, newLines, linkNotes, inserted } 或失败原因。
 */
function composeRelease(read, model, opts) {
  const lines = read.lines.slice();
  if (!model.unreleased) {
    return { ok: false, kind: 'refused', reason: '缺少 `## [Unreleased]` 区段，无法定位插入点；请先 init 或补齐骨架' };
  }
  const versionDup = (model.versions || []).find((v) => v.version === opts.version);
  if (versionDup) {
    return { ok: false, kind: 'refused', reason: `版本 ${opts.version} 已存在（第 ${versionDup.index + 1} 行），同一版本不重复生成` };
  }
  if (model.versions && model.versions.length > 0 && compareSemver(opts.version, model.versions[0].version) <= 0) {
    return { ok: false, kind: 'refused', reason: `新版本 ${opts.version} 必须大于现有最新版本 ${model.versions[0].version}` };
  }

  const buckets = { internal: 0, nonconventional: 0, unmapped: 0 };
  const grouped = new Map(GROUPS.map((g) => [g, []]));
  const seen = new Set();
  for (const commit of opts.commits) {
    const mapped = mapCommit(commit, buckets);
    if (!mapped) {
      continue;
    }
    if (seen.has(mapped.entry)) {
      continue;
    }
    seen.add(mapped.entry);
    grouped.get(mapped.group).push(mapped.entry);
  }

  const section = [`## [${opts.version}] - ${opts.date}`, ''];
  const nonEmptyGroups = GROUPS.filter((g) => grouped.get(g).length > 0);
  if (nonEmptyGroups.length === 0) {
    section.push(`本版无用户可见变更条目（编译自 ${opts.commits.length} 条提交，其中 ${buckets.internal} 条内部提交、${buckets.nonconventional} 条非约定式提交未列入）。`);
  } else {
    nonEmptyGroups.forEach((g, idx) => {
      section.push(`### ${g}`, '');
      for (const entry of grouped.get(g)) {
        section.push(entry);
      }
      if (idx < nonEmptyGroups.length - 1) {
        section.push('');
      }
    });
  }
  section.push('');

  // 插入点：Unreleased 区段结束处（下一个 ## 标题或文件尾部链接块之前）
  const unreleasedIdx = model.unreleased.index;
  let insertAt = lines.length;
  for (let i = unreleasedIdx + 1; i < lines.length; i += 1) {
    if (ANY_H2.test(lines[i])) {
      insertAt = i;
      break;
    }
  }
  // 尾部链接引用块（连续、仅链接定义行与空行）保持位于文件末尾
  const linkBlock = tailLinkBlock(lines);
  if (insertAt === lines.length && linkBlock) {
    insertAt = linkBlock.start;
  }

  const newLines = lines.slice(0, insertAt);
  while (newLines.length > 0 && newLines[newLines.length - 1].trim() === '') {
    newLines.pop();
  }
  newLines.push('', ...section);
  const tail = lines.slice(insertAt);
  newLines.push(...tail);

  // 链接引用维护：仅在严格形态可判定且可推断 base/tag 时更新
  const linkNotes = [];
  const finalLines = newLines.slice();
  const tb = tailLinkBlock(finalLines);
  const existingDefs = tb ? tb.defs : [];
  const unreleasedDef = existingDefs.find((d) => /^unreleased$/i.test(d.label));
  let base = opts.repoUrl || null;
  if (!base && unreleasedDef) {
    const m = UNRELEASED_LINK.exec(unreleasedDef.target);
    if (m) {
      base = m[1];
    }
  }
  const hasStrayDefs = !tb && existingDefs.length === 0 && finalLines.some((l) => LINK_DEF.test(l));
  if (hasStrayDefs) {
    linkNotes.push('检测到分散或夹在正文的链接引用行，未触碰；请保持链接块连续位于文件末尾后再启用自动维护');
  }
  if (opts.tag && base && !hasStrayDefs) {
    const defs = new Map();
    for (const d of existingDefs) {
      defs.set(d.label, d.target);
    }
    defs.set('Unreleased', `${base}/compare/${opts.tag}...HEAD`);
    const prevTag = opts.prevTag;
    defs.set(opts.version, prevTag ? `${base}/compare/${prevTag}...${opts.tag}` : `${base}/releases/tag/${opts.tag}`);
    const order = [];
    const seenLabels = new Set();
    const pushLabel = (label) => {
      if (!seenLabels.has(label.toLowerCase())) {
        seenLabels.add(label.toLowerCase());
        order.push(label);
      }
    };
    pushLabel('Unreleased');
    for (const v of [...(model.versions || []), { version: opts.version }].sort((a, b) => compareSemver(b.version, a.version))) {
      if (defs.has(v.version)) {
        pushLabel(v.version);
      }
    }
    for (const d of existingDefs) {
      if (!seenLabels.has(d.label.toLowerCase())) {
        pushLabel(d.label);
      }
    }
    const rebuilt = order.map((label) => `[${label}]: ${defs.get(label)}`);
    if (tb) {
      finalLines.splice(tb.start, tb.end - tb.start, ...rebuilt);
    } else {
      while (finalLines.length > 0 && finalLines[finalLines.length - 1].trim() === '') {
        finalLines.pop();
      }
      finalLines.push('', ...rebuilt, '');
    }
    linkNotes.push(`链接引用已更新：Unreleased -> compare/${opts.tag}...HEAD；[${opts.version}] -> ${defs.get(opts.version)}`);
  } else if (opts.tag && !base) {
    linkNotes.push('已提供 --tag 但无法确定仓库 URL（--repo-url 未给且文件无既有链接块），未写链接引用');
  } else if (!opts.tag && base) {
    linkNotes.push('未提供 --tag，链接引用保持原样');
  }

  return {
    ok: true,
    newLines: finalLines,
    buckets,
    mappedCount: seen.size,
    linkNotes,
    inserted: { version: opts.version, date: opts.date, groups: nonEmptyGroups }
  };
}

/** 尾部连续链接引用块；返回 {start,end,defs} 或 null。 */
function tailLinkBlock(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') {
    end -= 1;
  }
  let start = end;
  const defs = [];
  while (start > 0) {
    const m = LINK_DEF.exec(lines[start - 1]);
    if (!m) {
      break;
    }
    defs.unshift({ label: m[1], target: m[2], index: start - 1 });
    start -= 1;
  }
  if (defs.length === 0) {
    return null;
  }
  return { start, end, defs };
}

/** release：从 git 历史编译新版本区段并原子写入。 */
function cmdRelease(flags) {
  if (!flags['--version']) {
    finish('release', 'exec-failed', { reason: '缺少 --version <x.y.z>' });
  }
  if (!VERSION_ARG.test(flags['--version'])) {
    finish('release', 'exec-failed', { reason: `--version 必须是 x.y.z 形态：${flags['--version']}` });
  }
  if (flags['--date'] && !DATE_ARG.test(flags['--date'])) {
    finish('release', 'exec-failed', { reason: `--date 必须是 YYYY-MM-DD：${flags['--date']}` });
  }
  if (flags['--date'] && !isRealDate(flags['--date'])) {
    finish('release', 'exec-failed', { reason: `--date 不是合法日历日期：${flags['--date']}` });
  }
  const target = resolveTarget(flags);
  if (!target.ok) {
    finish('release', 'not-run', { reason: target.reason });
  }
  const read = readChangelog(target.abs);
  if (!read.ok) {
    if (read.code === 'ENOENT' || read.code === 'ENOTDIR') {
      finish('release', 'not-run', { reason: `${target.rel} 不存在；请先 init 播种或手工补齐骨架` });
    }
    finish('release', 'exec-failed', { reason: `无法读取 ${target.rel}: ${read.code}` });
  }

  const inTree = git(['rev-parse', '--is-inside-work-tree'], target.cwd);
  if (!inTree.ok || inTree.stdout.trim() !== 'true') {
    finish('release', 'not-run', { reason: '--cwd 不在 git 工作树内，无法读取提交历史' });
  }
  const to = flags['--to'] || 'HEAD';
  const resolved = git(['rev-parse', '--verify', `${to}^{commit}`], target.cwd);
  if (!resolved.ok) {
    finish('release', 'exec-failed', { reason: `--to 引用不可解析: ${to}` });
  }
  let from = flags['--from'] || null;
  let prevTag = null;
  if (!from) {
    const toSha = resolved.stdout.trim();
    const atTo = git(['tag', '--points-at', toSha], target.cwd);
    const atToTags = new Set(atTo.ok ? atTo.stdout.split('\n').map((t) => t.trim()).filter(Boolean) : []);
    const describe = git(['describe', '--tags', '--abbrev=0', to], target.cwd);
    let candidate = describe.ok && SEMVER_TAG.test(describe.stdout.trim()) ? describe.stdout.trim() : null;
    if (candidate && atToTags.has(candidate)) {
      // --to 自身就带标签时，最近标签是它自己；须退到父提交找更早的标签
      const parent = git(['describe', '--tags', '--abbrev=0', `${to}^`], target.cwd);
      candidate = parent.ok && SEMVER_TAG.test(parent.stdout.trim()) ? parent.stdout.trim() : null;
    }
    if (candidate) {
      from = candidate;
      prevTag = candidate;
    }
  } else {
    const fromResolved = git(['rev-parse', '--verify', `${from}^{commit}`], target.cwd);
    if (!fromResolved.ok) {
      finish('release', 'exec-failed', { reason: `--from 引用不可解析: ${from}` });
    }
    if (SEMVER_TAG.test(from)) {
      prevTag = from;
    }
  }
  const range = from ? `${from}..${to}` : to;
  const log = git(['log', range, '--format=%H%x1f%s%x1f%b%x1e'], target.cwd);
  if (!log.ok) {
    finish('release', 'exec-failed', { reason: log.reason });
  }
  const commits = parseCommits(log.stdout);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const date = flags['--date'] || today;
  const repoUrl = flags['--repo-url'] ? flags['--repo-url'].replace(/\.git$/, '').replace(/\/+$/, '') : null;

  const model = analyzeChangelog(stripFences(read.lines));
  if (model.problems.length > 0) {
    finish('release', 'refused', {
      reason: `文件结构不合规（${model.problems.length} 处违规），先人工修复再发版；不向不合规文件追加区段`,
      info: { lines: model.problems }
    });
  }
  const composed = composeRelease(read, model, {
    version: flags['--version'],
    date,
    commits,
    tag: flags['--tag'] || null,
    repoUrl,
    prevTag
  });
  if (!composed.ok) {
    finish('release', composed.kind === 'refused' ? 'refused' : 'exec-failed', { reason: composed.reason });
  }

  const newText = composed.newLines.join(read.eol);
  const infoLines = [
    `range: ${range}`,
    `commits: ${commits.length}（列入 ${composed.mappedCount}；内部 ${composed.buckets.internal}；非约定式 ${composed.buckets.nonconventional}；未映射 ${composed.buckets.unmapped}）`,
    `date: ${date}`,
    ...composed.linkNotes.map((n) => `links: ${n}`)
  ];
  if (flags['--dry-run']) {
    process.stdout.write(`----- ${target.rel} (dry-run, 未写盘) -----\n${newText}\n`);
    finish('release', 'released', { info: { lines: [...infoLines, 'dry-run: true'] } });
  }
  const tmp = `${target.abs}.changelog-tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, newText, 'utf8');
    fs.renameSync(tmp, target.abs);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // 清理失败在 reason 中如实反映
    }
    finish('release', 'exec-failed', { reason: `写入失败: ${error.code || error.message}` });
  }
  const verify = readChangelog(target.abs);
  if (!verify.ok || verify.lines.join('\n') !== composed.newLines.join('\n')) {
    finish('release', 'exec-failed', { reason: '写后读回核验失败' });
  }
  finish('release', 'released', {
    info: { lines: [`version: ${flags['--version']}`, ...infoLines] }
  });
}

function main() {
  const parsed = parseArgs(process.argv);
  if (!parsed.command || !['init', 'check', 'release'].includes(parsed.command)) {
    finish('changelog', 'exec-failed', { reason: '子命令必须是 init | check | release' });
  }
  if (parsed.errors.length > 0) {
    finish(parsed.command, 'exec-failed', { reason: parsed.errors.join('；') });
  }
  if (parsed.command === 'init') {
    cmdInit(parsed.flags);
  } else if (parsed.command === 'check') {
    cmdCheck(parsed.flags);
  } else {
    cmdRelease(parsed.flags);
  }
}

main();
