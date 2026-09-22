/**
 * scripts/check_doc_pairs.mjs
 *
 * 本仓文档关系声明的只读检查器（Node 标准库，零依赖）。
 * 声明正文以 docs/agents/doc-pairs.md 为唯一权威。
 * 脚本核对「## 声明」下的编号是否与已实现检查一一对应，并要求每条四要素都有正文。
 * 判定算法不复述字段正文。
 *
 * 用法: node scripts/check_doc_pairs.mjs
 * 只读：不写盘、不接 hook/CI。存在本脚本不等于门禁已生效。
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const DECISIONS_REL = 'docs/DECISIONS.md';
const DECISIONS_SNAPSHOT_REL = 'skills/lazypack-setup/references/DECISIONS.md';
const SKILL_REL = 'skills/lazypack-setup/SKILL.md';
const README_REL = 'README.md';
const AGENTS_REL = 'AGENTS.md';
const ARTIFACTS_REL = 'docs/ARTIFACTS.md';
const HANDOFF_DOC_REL = 'docs/agents/handoff-verification.md';
const HANDOFF_SCRIPT_REL = 'scripts/handoff_manifest.js';
const DOC_PAIRS_REL = 'docs/agents/doc-pairs.md';
const DECLARATION_FIELDS = ['来源', '目标范围', '检查方式', '处理权限'];
const FIELD_LINE_RE = /^-\s+\*\*(来源|目标范围|检查方式|处理权限)\*\*：(.*)$/;
const PAIR_HEADING_RE = /^###\s+(P\d+)\s+(\S.*)$/;
const PRECOMMIT_REL = 'skills/lazypack-setup/templates/pre-commit.sh';

const TEMPLATE_MD_RELS = [
  'skills/lazypack-setup/templates/ARTIFACTS.md',
  'skills/lazypack-setup/templates/CODING_STANDARDS.md',
  'skills/lazypack-setup/templates/RELEASE.md',
  'skills/lazypack-setup/templates/resident-entry.md',
  'skills/lazypack-setup/templates/roles.md'
];

const SEMVER = String.raw`(\d+\.\d+\.\d+)`;
const GIT_BLOB = /[0-9a-f]{40}/;
const FLAG_RE = /--[a-z][a-z0-9-]*/g;
const SRC_STAMP_RE = new RegExp(String.raw`src=DECISIONS\.md@${SEMVER}`, 'g');

/**
 * 把仓库内相对路径规范为正斜杠形式。
 */
function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

/**
 * 解析仓库根下的相对路径为绝对路径。
 */
function absOf(relPath) {
  return path.resolve(REPO_ROOT, relPath);
}

/**
 * 以 UTF-8 文本读取仓库内文件。
 */
function readUtf8(relPath) {
  return fs.readFileSync(absOf(relPath), 'utf8');
}

/**
 * 读取仓库内文件的原始字节。
 */
function readRaw(relPath) {
  return fs.readFileSync(absOf(relPath));
}

/**
 * 计算 Buffer 的 SHA-256 十六进制摘要。
 */
function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * 构造一条对子结果对象。
 */
function pairResult(id, status, evidence) {
  return { id, status, evidence };
}

/**
 * 在文本中收集正则的全部捕获组；无匹配时返回空数组。
 */
function matchAllGroup(text, regex, groupIndex = 1) {
  const values = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  for (const match of text.matchAll(re)) {
    values.push(match[groupIndex]);
  }
  return values;
}

/**
 * 断言一组字符串全相等，并返回该值；否则抛出带明细的错误。
 */
function assertAllEqual(label, values) {
  if (values.length === 0) {
    throw new Error(`${label}: 未抽出任何值`);
  }
  const unique = [...new Set(values)];
  if (unique.length !== 1) {
    throw new Error(`${label}: 不一致 ${JSON.stringify(values)}`);
  }
  return unique[0];
}

/**
 * 用 git hash-object 计算工作区文件的 blob 哈希。
 */
function gitHashObject(relPath) {
  const result = spawnSync('git', ['hash-object', toPosix(relPath)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error) {
    throw new Error(`git hash-object 无法启动: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`git hash-object 失败 (exit ${result.status}): ${err}`);
  }
  const hash = result.stdout.trim().toLowerCase();
  if (!GIT_BLOB.test(hash) || hash.length !== 40) {
    throw new Error(`git hash-object 输出不是 40 位十六进制: ${JSON.stringify(hash)}`);
  }
  return hash;
}

/**
 * 判断 URL 是否带协议或仅为锚点，因而不是仓内相对链接。
 */
function isNonRelativeUrl(url) {
  if (!url || url.startsWith('#') || url.startsWith('//')) {
    return true;
  }
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
}

/**
 * 识别一行是否为 CommonMark 围栏标记。
 * 反引号与波浪号都算，缩进不超过 3；返回字符、长度和标记后的余文。
 */
function matchFenceMarker(line) {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) {
    return null;
  }
  const marker = match[1];
  return {
    char: marker[0],
    length: marker.length,
    rest: match[2]
  };
}

/**
 * 判断这一行能否关闭当前围栏：字符必须相同，长度不少于开启围栏，余文只能是空白。
 */
function isClosingFence(line, openFence) {
  const marker = matchFenceMarker(line);
  if (!marker || marker.char !== openFence.char || marker.length < openFence.length) {
    return false;
  }
  return marker.rest.trim() === '';
}

/**
 * 判断这一行能否开启围栏。反引号围栏的信息串里不能再出现反引号。
 */
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

/**
 * 从 Markdown 抽出内联链接的目标 URL。
 * 跳过 CommonMark 围栏（反引号与波浪号，开闭必须同一字符）和行内反引号。
 */
function extractInlineLinks(content) {
  const links = [];
  const lines = content.split(/\r?\n/);
  let openFence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (openFence) {
      if (isClosingFence(line, openFence)) {
        openFence = null;
      }
      continue;
    }
    if (isOpeningFence(line)) {
      openFence = matchFenceMarker(line);
      continue;
    }
    const withoutInlineCode = line.replace(/`[^`]*`/g, (chunk) => ' '.repeat(chunk.length));
    const linkRe = /!?\[([^\]]*)\]\(([^)]+)\)/g;
    let match = linkRe.exec(withoutInlineCode);
    while (match) {
      const rawInside = match[2].trim();
      const rawUrl = rawInside.split(/\s+/)[0].replace(/^<|>$/g, '');
      links.push({
        line: i + 1,
        text: match[1],
        rawUrl
      });
      match = linkRe.exec(withoutInlineCode);
    }
  }
  return links;
}

/**
 * 把相对 URL 解析为仓库内正斜杠相对路径；无法落在仓内时返回 null。
 */
function resolveRepoTarget(fromRel, rawUrl) {
  const trimmed = rawUrl.split('#')[0].split('?')[0];
  if (!trimmed || isNonRelativeUrl(trimmed)) {
    return null;
  }
  const fromAbs = path.dirname(absOf(fromRel));
  const targetAbs = path.resolve(fromAbs, trimmed);
  const rel = path.relative(REPO_ROOT, targetAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return toPosix(rel);
}

/**
 * 检查相对链接目标是否存在；P4 额外要求非空。
 */
function inspectLinkTarget(targetRel, requireNonEmpty) {
  const abs = absOf(targetRel);
  if (!fs.existsSync(abs)) {
    return { ok: false, reason: 'missing' };
  }
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    if (requireNonEmpty && stat.size === 0) {
      return { ok: false, reason: 'empty-file', size: 0 };
    }
    return { ok: true, kind: 'file', size: stat.size };
  }
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(abs);
    if (requireNonEmpty && entries.length === 0) {
      return { ok: false, reason: 'empty-dir' };
    }
    return { ok: true, kind: 'dir', entries: entries.length };
  }
  return { ok: false, reason: 'not-file-or-dir' };
}

/**
 * 对指定 Markdown 文件执行相对链接存在性检查。
 */
function checkRelativeLinks(relPath, requireNonEmpty) {
  const content = readUtf8(relPath);
  const extracted = extractInlineLinks(content);
  const checked = [];
  const failures = [];
  const skipped = [];
  for (const link of extracted) {
    if (isNonRelativeUrl(link.rawUrl) || link.rawUrl.split('#')[0].split('?')[0] === '') {
      skipped.push({ line: link.line, rawUrl: link.rawUrl, reason: 'non-relative' });
      continue;
    }
    const targetRel = resolveRepoTarget(relPath, link.rawUrl);
    if (!targetRel) {
      failures.push({
        line: link.line,
        rawUrl: link.rawUrl,
        reason: 'outside-repo-or-unresolvable'
      });
      continue;
    }
    const inspection = inspectLinkTarget(targetRel, requireNonEmpty);
    const row = {
      line: link.line,
      rawUrl: link.rawUrl,
      targetRel,
      ...inspection
    };
    checked.push(row);
    if (!inspection.ok) {
      failures.push(row);
    }
  }
  return {
    source: relPath,
    extracted: extracted.length,
    checked: checked.length,
    skipped: skipped.length,
    failures
  };
}

/**
 * 从开始花括号位置切出配对的完整块（忽略字符串内的括号）。
 */
function extractBraceBlock(source, openIndex) {
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, i + 1);
      }
    }
  }
  throw new Error('CLI 源码花括号不配对');
}

/**
 * 按 Markdown ATX 标题切出一节（含起始行，不含下一同级或更高级标题）。
 */
function sliceAtxSection(markdown, startPattern, endPattern) {
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && startPattern.test(lines[i])) {
      start = i;
      continue;
    }
    if (start !== -1 && endPattern.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (start === -1) {
    throw new Error(`未找到标题: ${startPattern}`);
  }
  return lines.slice(start, end).join('\n');
}

/**
 * 规范化 CLI 规格为可比较的纯数据（子命令排序，flag 排序）。
 */
function normalizeCliSpec(spec) {
  const commands = Object.keys(spec).sort();
  const flags = {};
  for (const command of commands) {
    flags[command] = [...spec[command]].sort();
  }
  return { commands, flags };
}

/**
 * 从 `### 2.x` 标题抽出子命令名。
 * 标题里恰好一个反引号命令名时用它；否则用编号后的第一个命令名标记。
 */
function extractDeclaredCommandName(headingLine) {
  const backtickNames = [...headingLine.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((match) => match[1]);
  const unique = [...new Set(backtickNames)];
  if (unique.length === 1) {
    return unique[0];
  }
  if (unique.length > 1) {
    throw new Error(`handoff-verification.md 子命令标题含多个命令名: ${headingLine}`);
  }
  const afterNumber = headingLine.replace(/^### 2\.\d+\s+/, '');
  const token = afterNumber.split(/\s+/)[0];
  if (/^[a-z][a-z0-9-]*$/.test(token)) {
    return token;
  }
  throw new Error(`handoff-verification.md 未能从标题抽出子命令名: ${headingLine}`);
}

/**
 * 从交接文档 §2 的全部 `### 2.x` 小节抽出子命令与 flag。
 * 不写死小节编号或命令名；每个小节直到下一个同级或更高级标题为止。
 */
function extractDocCliSpec(markdown) {
  const section2 = sliceAtxSection(markdown, /^## 2[\.\s]/, /^## [^2]/);
  const lines = section2.split(/\r?\n/);
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^### 2\.\d+\s+/.test(lines[i])) {
      starts.push(i);
    }
  }
  if (starts.length === 0) {
    throw new Error('handoff-verification.md §2 未找到 ### 2.x 子命令小节');
  }
  const spec = {};
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^### |^## /.test(lines[i])) {
        end = i;
        break;
      }
    }
    const command = extractDeclaredCommandName(lines[start]);
    if (Object.prototype.hasOwnProperty.call(spec, command)) {
      throw new Error(`handoff-verification.md §2 子命令重复: ${command}`);
    }
    const body = lines.slice(start, end).join('\n');
    spec[command] = new Set(body.match(FLAG_RE) || []);
  }
  return spec;
}

/**
 * 从 handoff_manifest.js 的 runCli 解析分支抽出实际子命令与 flag。
 */
function extractImplCliSpec(source) {
  const runCliIndex = source.indexOf('async function runCli(');
  if (runCliIndex === -1) {
    throw new Error('handoff_manifest.js 未找到 runCli');
  }
  const runCliSource = source.slice(runCliIndex);
  const spec = {};
  const cmdRe = /(?:if|else if)\s*\(\s*command\s*===\s*['"]([^'"]+)['"]\s*\)/g;
  let match = cmdRe.exec(runCliSource);
  while (match) {
    const command = match[1];
    const braceStart = runCliSource.indexOf('{', match.index);
    if (braceStart === -1) {
      throw new Error(`runCli 中 ${command} 分支没有函数体`);
    }
    const block = extractBraceBlock(runCliSource, braceStart);
    const flags = new Set();
    const flagCallRe = /(?:getOption|hasFlag)\(\s*['"](--[a-z0-9-]+)['"]\s*\)/g;
    let flagMatch = flagCallRe.exec(block);
    while (flagMatch) {
      flags.add(flagMatch[1]);
      flagMatch = flagCallRe.exec(block);
    }
    spec[command] = flags;
    match = cmdRe.exec(runCliSource);
  }
  if (Object.keys(spec).length === 0) {
    throw new Error('runCli 未解析到任何子命令');
  }
  return spec;
}

/**
 * 从文档关系声明的「## 声明」节抽出编号与四要素正文。
 * 只认全角冒号字段；围栏内的标记不计入。这里不解释字段语义。
 */
function parseDeclarations(markdown) {
  const section = sliceAtxSection(markdown, /^## 声明\s*$/, /^## /);
  const lines = section.split(/\r?\n/);
  const declarations = new Map();
  let openFence = null;
  let current = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (openFence) {
      if (isClosingFence(line, openFence)) {
        openFence = null;
      }
      continue;
    }
    if (isOpeningFence(line)) {
      openFence = matchFenceMarker(line);
      continue;
    }
    const heading = PAIR_HEADING_RE.exec(line);
    if (heading) {
      const id = heading[1];
      if (declarations.has(id)) {
        declarations.get(id).duplicate = true;
      } else {
        const fields = {};
        for (const name of DECLARATION_FIELDS) {
          fields[name] = '';
        }
        declarations.set(id, {
          id,
          title: heading[2].trim(),
          fields,
          duplicateFields: [],
          duplicate: false,
          activeField: null
        });
      }
      current = declarations.get(id);
      current.activeField = null;
      continue;
    }
    if (/^###\s+/.test(line)) {
      throw new Error(`声明标题无法抽出编号: ${line}`);
    }
    const fieldMatch = FIELD_LINE_RE.exec(line);
    if (fieldMatch) {
      if (!current) {
        throw new Error('四要素出现在首条声明之前');
      }
      const name = fieldMatch[1];
      if (current.fields[name].trim()) {
        current.duplicateFields.push(name);
      }
      current.fields[name] = fieldMatch[2].trim();
      current.activeField = name;
      continue;
    }
    if (current && current.activeField && line.trim() !== '' && !/^#{1,6}\s/.test(line)) {
      current.fields[current.activeField] += `\n${line.trim()}`;
    }
  }
  return declarations;
}

/**
 * 列出一条声明相对四要素格式的问题；没有问题时返回空数组。
 * 声明缺席时记为 undeclared。
 */
function declarationProblems(decl) {
  if (!decl) {
    return ['undeclared'];
  }
  const problems = [];
  if (decl.duplicate) {
    problems.push('duplicate');
  }
  for (const name of DECLARATION_FIELDS) {
    if (!decl.fields[name] || !decl.fields[name].trim()) {
      problems.push(`missing:${name}`);
    }
  }
  for (const name of decl.duplicateFields) {
    problems.push(`duplicate-field:${name}`);
  }
  return problems;
}

/**
 * 声明格式有问题时把该条记为 FAIL，并保留原来的检查结果供对照。
 */
function applyDeclarationGate(checkRow, problems) {
  if (problems.length === 0) {
    return checkRow;
  }
  return {
    id: checkRow.id,
    status: 'FAIL',
    evidence: {
      ...checkRow.evidence,
      declarationProblems: problems,
      checkStatus: checkRow.status
    }
  };
}

/**
 * P1：固定层正文与 setup 快照原始字节 SHA-256 必须相等。
 */
function checkP1() {
  const left = readRaw(DECISIONS_REL);
  const right = readRaw(DECISIONS_SNAPSHOT_REL);
  const leftHash = sha256Hex(left);
  const rightHash = sha256Hex(right);
  if (leftHash !== rightHash) {
    return pairResult('P1', 'FAIL', {
      left: DECISIONS_REL,
      right: DECISIONS_SNAPSHOT_REL,
      leftSha256: leftHash,
      rightSha256: rightHash,
      leftBytes: left.length,
      rightBytes: right.length
    });
  }
  return pairResult('P1', 'PASS', {
    left: DECISIONS_REL,
    right: DECISIONS_SNAPSHOT_REL,
    sha256: leftHash,
    bytes: left.length
  });
}

/**
 * P2：固定层 git blob 与五份 Markdown 模板来源内容标识一致；hook 模板只要求版本戳。
 */
function checkP2() {
  const blob = gitHashObject(DECISIONS_REL);
  const templates = [];
  for (const rel of TEMPLATE_MD_RELS) {
    const text = readUtf8(rel);
    const ids = matchAllGroup(text, /来源内容标识:\s*([0-9a-f]{40})/);
    const id = assertAllEqual(`${rel} 来源内容标识`, ids);
    templates.push({ path: rel, sourceContentId: id, matchesBlob: id === blob });
  }
  const mismatches = templates.filter((row) => !row.matchesBlob);
  const hookText = readUtf8(PRECOMMIT_REL);
  const hookStamps = matchAllGroup(hookText, SRC_STAMP_RE);
  if (hookStamps.length === 0) {
    throw new Error(`${PRECOMMIT_REL} 缺少 src=DECISIONS.md@<版本>`);
  }
  const hookHasSourceId = /来源内容标识:\s*[0-9a-f]{40}/.test(hookText);
  if (mismatches.length > 0) {
    return pairResult('P2', 'FAIL', {
      blob,
      templates,
      hook: { path: PRECOMMIT_REL, srcVersions: hookStamps, hasSourceContentId: hookHasSourceId }
    });
  }
  return pairResult('P2', 'PASS', {
    blob,
    templates: templates.map((row) => row.path),
    hook: {
      path: PRECOMMIT_REL,
      srcVersions: hookStamps,
      requiresSourceContentId: false,
      hasSourceContentId: hookHasSourceId
    }
  });
}

/**
 * P3：文首版本、SKILL frontmatter、README 版本句与模板 src 戳四处 SemVer 一致。
 */
function checkP3() {
  const decisionsText = readUtf8(DECISIONS_REL);
  const decisionsVersions = matchAllGroup(decisionsText, new RegExp(String.raw`^版本：${SEMVER}`, 'm'));
  const version = assertAllEqual('DECISIONS 文首版本', decisionsVersions);

  const skillHead = readUtf8(SKILL_REL).split(/\r?\n/).slice(0, 12).join('\n');
  const skillVersions = matchAllGroup(skillHead, new RegExp(String.raw`fixed layer \(${SEMVER}\)`));
  const skillVersion = assertAllEqual('SKILL.md frontmatter 版本', skillVersions);

  const readmeVersions = matchAllGroup(readUtf8(README_REL), new RegExp(String.raw`当前版本为 ${SEMVER}`));
  const readmeVersion = assertAllEqual('README.md 版本句', readmeVersions);

  const stampRows = [];
  for (const rel of [...TEMPLATE_MD_RELS, PRECOMMIT_REL]) {
    const stamps = matchAllGroup(readUtf8(rel), SRC_STAMP_RE);
    const stampVersion = assertAllEqual(`${rel} src 戳`, stamps);
    stampRows.push({ path: rel, version: stampVersion });
  }

  const all = [
    { source: DECISIONS_REL, version },
    { source: SKILL_REL, version: skillVersion },
    { source: README_REL, version: readmeVersion },
    ...stampRows
  ];
  const mismatched = all.filter((row) => row.version !== version);
  if (mismatched.length > 0) {
    return pairResult('P3', 'FAIL', { expected: version, mismatched, all });
  }
  return pairResult('P3', 'PASS', {
    version,
    sources: {
      decisions: DECISIONS_REL,
      skillFrontmatter: SKILL_REL,
      readmeSentence: README_REL,
      templates: stampRows.map((row) => row.path)
    }
  });
}

/**
 * P4：ARTIFACTS.md 相对链接目标存在且非空。
 */
function checkP4() {
  const report = checkRelativeLinks(ARTIFACTS_REL, true);
  const status = report.failures.length === 0 ? 'PASS' : 'FAIL';
  return pairResult('P4', status, report);
}

/**
 * P5：AGENTS.md 与 README.md 相对链接目标存在。
 */
function checkP5() {
  const agents = checkRelativeLinks(AGENTS_REL, false);
  const readme = checkRelativeLinks(README_REL, false);
  const failures = [...agents.failures, ...readme.failures];
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return pairResult('P5', status, { agents, readme });
}

/**
 * P8：交接文档 §2 与 handoff_manifest.js CLI 解析的子命令/flag 集合相等。
 */
function checkP8() {
  const docSpec = normalizeCliSpec(extractDocCliSpec(readUtf8(HANDOFF_DOC_REL)));
  const implSpec = normalizeCliSpec(extractImplCliSpec(readUtf8(HANDOFF_SCRIPT_REL)));
  const docJson = JSON.stringify(docSpec);
  const implJson = JSON.stringify(implSpec);
  if (docJson !== implJson) {
    return pairResult('P8', 'FAIL', {
      doc: docSpec,
      impl: implSpec
    });
  }
  return pairResult('P8', 'PASS', {
    commands: docSpec.commands,
    flags: docSpec.flags
  });
}

/**
 * 运行一条对子；实现抛错时记为 FAIL 而不是让进程未处理崩溃。
 */
function runPair(id, fn) {
  try {
    return fn();
  } catch (err) {
    return pairResult(id, 'FAIL', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * 为单条对子结果生成摘要细节（不含声明格式问题）。
 */
function renderPairDetailBody(row) {
  const ev = row.evidence || {};
  if (ev.error) {
    return ` error=${ev.error}`;
  }
  if (row.id === 'P1') {
    const contentPassed = row.status === 'PASS' || ev.checkStatus === 'PASS';
    if (contentPassed) {
      return ` sha256=${ev.sha256}`;
    }
    return ` left=${ev.leftSha256} right=${ev.rightSha256}`;
  }
  if (row.id === 'P2') {
    return ev.blob ? ` blob=${ev.blob}` : '';
  }
  if (row.id === 'P3') {
    if (ev.version) {
      return ` version=${ev.version}`;
    }
    if (ev.expected && Array.isArray(ev.mismatched)) {
      const found = ev.mismatched.map((item) => `${item.source}=${item.version}`).join(',');
      return ` expected=${ev.expected} mismatched=${found}`;
    }
    return '';
  }
  if (row.id === 'P4') {
    return ` links=${ev.checked} failures=${ev.failures.length}`;
  }
  if (row.id === 'P5') {
    const agentsN = ev.agents?.checked ?? 0;
    const readmeN = ev.readme?.checked ?? 0;
    const failN = (ev.agents?.failures.length ?? 0) + (ev.readme?.failures.length ?? 0);
    return ` agents=${agentsN} readme=${readmeN} failures=${failN}`;
  }
  if (row.id === 'P8' && ev.commands) {
    return ` commands=${ev.commands.join(',')}`;
  }
  if (row.id === 'P8' && ev.doc && ev.impl) {
    const docCommands = Array.isArray(ev.doc.commands) ? ev.doc.commands.join(',') : '';
    const implCommands = Array.isArray(ev.impl.commands) ? ev.impl.commands.join(',') : '';
    return ` doc=${docCommands} impl=${implCommands}`;
  }
  return '';
}

/**
 * 拼上声明格式问题，便于和内容检查失败分开看。
 */
function renderPairDetail(row) {
  const detail = renderPairDetailBody(row);
  const problems = row.evidence && row.evidence.declarationProblems;
  if (!Array.isArray(problems) || problems.length === 0) {
    return detail;
  }
  const checkNote = row.evidence.checkStatus ? ` check=${row.evidence.checkStatus}` : '';
  return `${detail} declaration=${problems.join(',')}${checkNote}`;
}

/**
 * 渲染人类可读摘要（不含绝对路径）。
 */
function renderSummary(report) {
  const passed = report.pairs.filter((row) => row.status === 'PASS').length;
  const total = report.pairs.length;
  const lines = [`check_doc_pairs: ${passed}/${total} ${report.ok ? 'PASS' : 'FAIL'}`];
  for (const row of report.pairs) {
    lines.push(`  ${row.id} ${row.status}${renderPairDetail(row)}`);
  }
  lines.push('checker exists and is runnable; not wired to hook/CI; not a gate.');
  return lines.join('\n');
}

/**
 * 已实现的声明编号与检查函数。新增编号时先改声明正文，再改这一张表。
 */
const PAIR_CHECKS = [
  ['P1', checkP1],
  ['P2', checkP2],
  ['P3', checkP3],
  ['P4', checkP4],
  ['P5', checkP5],
  ['P8', checkP8]
];

/**
 * 写出摘要与 JSON，并按是否全过设置退出码。
 */
function emitReport(pairs) {
  const report = {
    ok: pairs.every((row) => row.status === 'PASS'),
    pairs
  };
  const summary = renderSummary(report);
  process.stdout.write(`${summary}\n\n${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

/**
 * 入口：先核对声明编号与四要素，再跑对应检查。
 * 声明读失败时，已实现的每条都记 FAIL，避免进程直接崩溃。
 */
function main() {
  let declarations;
  try {
    declarations = parseDeclarations(readUtf8(DOC_PAIRS_REL));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitReport(PAIR_CHECKS.map(([id]) => pairResult(id, 'FAIL', { error: message })));
    return;
  }

  const implemented = new Set(PAIR_CHECKS.map(([id]) => id));
  const pairs = PAIR_CHECKS.map(([id, fn]) => {
    const checkRow = runPair(id, fn);
    return applyDeclarationGate(checkRow, declarationProblems(declarations.get(id)));
  });

  const extras = [...declarations.keys()].filter((id) => !implemented.has(id)).sort();
  for (const id of extras) {
    const problems = ['no-implementation', ...declarationProblems(declarations.get(id))];
    pairs.push(pairResult(id, 'FAIL', { declarationProblems: problems }));
  }

  emitReport(pairs);
}

main();
