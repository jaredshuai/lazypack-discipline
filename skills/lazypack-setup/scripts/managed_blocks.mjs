#!/usr/bin/env node
/**
 * managed_blocks.mjs — deterministic managed-block byte-range snapshot/write/verify
 * and the authoritative retention-section renderer.
 *
 * Dependency-free (Node standard library, ES modules). No global config, no writes
 * outside the explicit target bytes, no baseline absorption of outside changes.
 *
 *   node managed_blocks.mjs snapshot --cwd ROOT --files-json PATHS.json --out BASELINE.json
 *   node managed_blocks.mjs write    --cwd ROOT --baseline BASELINE.json --spec SPEC.json
 *   node managed_blocks.mjs verify   --cwd ROOT --baseline BASELINE.json
 *   node managed_blocks.mjs render-retention --retention-json POLICY.json
 *
 * Exit codes: 0 ok | 2 usage | 3 unsafe path/root | 4 stale drift (zero writes)
 *             5 malformed/duplicate/wrong block or fp mismatch | 6 unverifiable repair (PAUSE)
 *             7 unexpanded placeholder or header-format validation failure.
 *
 * fp contract (§2.1-2.2, same oracle as verify_hook_install.mjs): the bytes strictly
 * between the start-marker line and the end-marker line, CRLF->LF normalized, hashed
 * with SHA-256, first 16 lowercase hex. Every terminal LF participates; an empty body
 * hashes the empty byte string.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const EXIT = Object.freeze({ OK: 0, USAGE: 2, UNSAFE: 3, STALE: 4, BLOCK: 5, PAUSE: 6, VALIDATE: 7 });
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const RESERVED_TOKEN = /__[A-Z][A-Z0-9_]*__/;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RETENTION_REFERENCE = path.join(SCRIPT_DIR, '..', 'references', 'retention-sections.md');

class CliError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fp16 = (buf) => sha256(buf).slice(0, 16);
const lfNormalize = (buf) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const startsWithBom = (buf) => buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;

/** Native EOL = majority newline of the existing file (CRLF when tied but present). */
function detectEol(buf) {
  let crlf = 0;
  let loneLf = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x0a) (i > 0 && buf[i - 1] === 0x0d) ? (crlf += 1) : (loneLf += 1);
  }
  return crlf > 0 && crlf >= loneLf ? 'crlf' : 'lf';
}

function toNativeEol(blockLf, eol) {
  if (eol !== 'crlf') return blockLf;
  return Buffer.from(blockLf.toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
}

function stripTrailingEol(buf) {
  if (buf.length >= 2 && buf[buf.length - 1] === 0x0a && buf[buf.length - 2] === 0x0d) {
    return buf.subarray(0, buf.length - 2);
  }
  if (buf.length >= 1 && buf[buf.length - 1] === 0x0a) return buf.subarray(0, buf.length - 1);
  return buf;
}

// ---------------------------------------------------------------------------
// Marker scanning (byte offsets; latin1 keeps 1 char == 1 byte)
// ---------------------------------------------------------------------------
function markerKind(line) {
  const t = line.trimStart();
  if (/^(?:<!--\s*)?lazypack:start\b/.test(t)) return 'start';
  if (/^(?:<!--\s*)?lazypack:end\b/.test(t)) return 'end';
  if (/^#\s*lazypack:start\b/.test(t)) return 'start';
  if (/^#\s*lazypack:end\b/.test(t)) return 'end';
  return null;
}

function markerStyle(line) {
  const t = line.trimStart();
  if (t.startsWith('<!--')) return 'md';
  if (t.startsWith('#')) return 'sh';
  return null;
}

/**
 * Locate the managed block in `buf`. A leading UTF-8 BOM stays outside the block.
 * Returns { present, wellFormed, reason?, body, bodyStart, bodyEnd, blockStart,
 *           blockEnd, blockEndedWithNewline, startLine, endLine }
 */
function scanBlock(buf) {
  const bomLength = startsWithBom(buf) ? 3 : 0;
  const text = buf.toString('latin1');
  const lines = [];
  let offset = 0;
  for (const raw of text.split('\n')) {
    const withoutCr = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const lineText = offset === 0 && bomLength ? withoutCr.slice(bomLength) : withoutCr;
    lines.push({ raw, text: lineText, matchText: lineText, start: offset });
    offset += raw.length + 1;
  }
  const starts = [];
  const ends = [];
  lines.forEach((entry, index) => {
    const kind = markerKind(entry.matchText);
    if (kind === 'start') starts.push(index);
    if (kind === 'end') ends.push(index);
  });
  if (!starts.length && !ends.length) return { present: false };
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    return { present: true, wellFormed: false, reason: 'boundary' };
  }
  const startLine = lines[starts[0]];
  const endLine = lines[ends[0]];
  const blockStart = startLine.start + (starts[0] === 0 ? bomLength : 0);
  const bodyStart = Math.min(startLine.start + startLine.raw.length + 1, text.length);
  const bodyEnd = endLine.start;
  let blockEnd = endLine.start + endLine.raw.length;
  const blockEndedWithNewline = blockEnd < text.length && text.charCodeAt(blockEnd) === 0x0a;
  if (blockEndedWithNewline) blockEnd += 1;
  return {
    present: true,
    wellFormed: true,
    body: buf.subarray(bodyStart, bodyEnd),
    bodyStart,
    bodyEnd,
    blockStart,
    blockEnd,
    blockEndedWithNewline,
    startLine,
    endLine
  };
}

const STRICT_STYLES = [
  {
    style: 'md',
    start: /^<!-- lazypack:start block=(\S+) src=(DECISIONS\.md@\d+\.\d+\.\d+) gen=([0-9a-f]{16}) input=([0-9a-f]{16}) fp=([0-9a-f]{16}) -->$/,
    end: /^<!-- lazypack:end block=(\S+) -->$/
  },
  {
    style: 'sh',
    start: /^# lazypack:start block=(\S+) src=(DECISIONS\.md@\d+\.\d+\.\d+) gen=([0-9a-f]{16}) input=([0-9a-f]{16}) fp=([0-9a-f]{16})$/,
    end: /^# lazypack:end block=(\S+)$/
  }
];

/** Strict header/end parse; requires the same comment style for both markers. */
function parseStrictMarkers(startText, endText) {
  for (const { style, start, end } of STRICT_STYLES) {
    const s = start.exec(startText);
    const e = end.exec(endText);
    if (s && e) {
      if (s[1] !== e[1]) return { ok: false, reason: 'block name differs between start and end markers' };
      return { ok: true, style, block: s[1], src: s[2], gen: s[3], input: s[4], fp: s[5] };
    }
  }
  return { ok: false, reason: 'header or end marker does not match the managed marker grammar' };
}

const lenientBlockName = (line) => /\bblock=(\S+)/.exec(line ?? '')?.[1] ?? null;
const lenientFp = (line) => /\bfp=([0-9a-f]{16})\b/.exec(line ?? '')?.[1] ?? null;

/** A candidate block is valid only when complete, well-formed, fp-consistent and placeholder-free. */
function validateCandidateBlock(buf) {
  const scan = scanBlock(buf);
  if (!scan.present) throw new CliError(EXIT.VALIDATE, 'candidate has no managed block pair');
  if (!scan.wellFormed) throw new CliError(EXIT.BLOCK, 'candidate must contain exactly one ordered start/end marker pair');
  const header = parseStrictMarkers(scan.startLine.text, scan.endLine.text);
  if (!header.ok) throw new CliError(EXIT.VALIDATE, `candidate header invalid: ${header.reason}`);
  const expected = fp16(lfNormalize(scan.body));
  if (header.fp !== expected) {
    throw new CliError(EXIT.BLOCK, `candidate fp mismatch (header ${header.fp} vs computed ${expected})`);
  }
  if (RESERVED_TOKEN.test(scan.startLine.text) || RESERVED_TOKEN.test(scan.body.toString('utf8'))) {
    throw new CliError(EXIT.VALIDATE, 'candidate still contains a reserved __UPPERCASE__ placeholder');
  }
  return { scan, header };
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------
function resolveRoot(cwd) {
  const root = path.resolve(cwd);
  const stat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new CliError(EXIT.UNSAFE, `--cwd must be an existing real directory: ${root}`);
  }
  return root;
}

function assertSafeRelPath(value, label = 'path') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CliError(EXIT.USAGE, `${label} must be a non-empty string`);
  }
  if (value.includes('\\')) throw new CliError(EXIT.UNSAFE, `${label} must use POSIX separators`);
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw new CliError(EXIT.UNSAFE, `${label} must be repo-relative`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new CliError(EXIT.UNSAFE, `${label} must not contain empty, "." or ".." segments`);
  }
  return segments;
}

/** Resolve a repo-relative path, rejecting any symlink/junction component; always full path. */
function resolveSafeTarget(root, rel, label = 'path') {
  const segments = assertSafeRelPath(rel, label);
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      throw new CliError(EXIT.UNSAFE, `${label} traverses a symbolic link or junction: ${segment}`);
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new CliError(EXIT.UNSAFE, `${label} component is not a directory: ${segment}`);
    }
  }
  return path.join(root, ...segments);
}

function readRegularFile(abs, label = abs) {
  const stat = fs.lstatSync(abs, { throwIfNoEntry: false });
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new CliError(EXIT.UNSAFE, `${label} must be a regular file`);
  }
  const fd = fs.openSync(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (!fs.fstatSync(fd).isFile()) throw new CliError(EXIT.UNSAFE, `${label} must be a regular file`);
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function isWithinRoot(root, candidate) {
  const rel = path.relative(root, path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Baselines and specs must never live inside the target repository nor behind a link. */
function assertExternalArtifact(root, value, label) {
  const abs = path.resolve(value);
  if (isWithinRoot(root, abs)) {
    throw new CliError(EXIT.UNSAFE, `${label} must live outside the target repository: ${abs}`);
  }
  for (let current = abs; ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      throw new CliError(EXIT.UNSAFE, `${label} must not be reached through a symbolic link or junction: ${current}`);
    }
    if (current === path.dirname(current)) break;
  }
  const parent = path.dirname(abs);
  if (!fs.lstatSync(parent, { throwIfNoEntry: false })?.isDirectory()) {
    throw new CliError(EXIT.USAGE, `${label} parent directory does not exist: ${parent}`);
  }
  return abs;
}

// ---------------------------------------------------------------------------
// JSON IO
// ---------------------------------------------------------------------------
function readJson(abs, label) {
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (error) {
    throw new CliError(EXIT.USAGE, `cannot read ${label}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new CliError(EXIT.USAGE, `${label} is not valid JSON: ${error.message}`);
  }
}

function readJsonExternal(root, value, label) {
  const abs = assertExternalArtifact(root, value, label);
  if (!fs.lstatSync(abs, { throwIfNoEntry: false })?.isFile()) {
    throw new CliError(EXIT.USAGE, `${label} must be an existing regular file`);
  }
  return readJson(abs, label);
}

function writeJsonAtomic(abs, value) {
  const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, abs);
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------
function loadBaseline(baselinePath, root) {
  const baseline = readJsonExternal(root, baselinePath, '--baseline');
  if (!baseline || typeof baseline !== 'object' || baseline.version !== 1 ||
      typeof baseline.root !== 'string' || typeof baseline.files !== 'object' || baseline.files === null) {
    throw new CliError(EXIT.USAGE, '--baseline has an unsupported shape');
  }
  if (path.resolve(baseline.root) !== root) {
    throw new CliError(EXIT.UNSAFE, `baseline root (${baseline.root}) does not match --cwd (${root})`);
  }
  return { abs: path.resolve(baselinePath), baseline };
}

const outsideBytes = (buf, scan) => {
  if (!scan.present || !scan.wellFormed) return buf;
  return Buffer.concat([buf.subarray(0, scan.blockStart), buf.subarray(scan.blockEnd)]);
};

/**
 * Authorised bytes outside the managed block, derived ONLY from the original snapshot
 * (plus, for an originally unmarked file, the single explicit append separator, or the
 * approved template outside for a brand-new file). Never refreshed from written output,
 * so the helper can never bless its own corruption of user content.
 */
function expectedOutsideBytes(entry) {
  if (entry.original === null) {
    return Buffer.from(entry.approvedOutside ?? '', 'base64');
  }
  const original = Buffer.from(entry.original, 'base64');
  if (entry.originalHadBlock) return outsideBytes(original, scanBlock(original));
  const separator = entry.separator ? Buffer.from(entry.separator, 'base64') : Buffer.alloc(0);
  return Buffer.concat([original, separator]);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function cmdSnapshot({ cwd, filesJson, out }) {
  const root = resolveRoot(cwd);
  const outAbs = assertExternalArtifact(root, out, '--out');
  // Exclusive create: a repeat snapshot must never silently erase the original invariant.
  if (fs.lstatSync(outAbs, { throwIfNoEntry: false })) {
    throw new CliError(EXIT.USAGE, `--out already exists; refusing to overwrite an existing baseline: ${outAbs}`);
  }
  const list = readJsonExternal(root, filesJson, '--files-json');
  if (!Array.isArray(list) || list.length === 0) {
    throw new CliError(EXIT.USAGE, '--files-json must be a non-empty JSON array of repo-relative paths');
  }
  const seen = new Set();
  const files = {};
  for (const rel of list) {
    if (seen.has(rel)) throw new CliError(EXIT.USAGE, `--files-json contains a duplicate path: ${rel}`);
    seen.add(rel);
    const abs = resolveSafeTarget(root, rel, 'snapshot path');
    const bytes = readRegularFile(abs, rel);
    const mode = (fs.lstatSync(abs, { throwIfNoEntry: false })?.mode ?? 0o644) & 0o777;
    files[rel] = {
      exists: bytes !== null,
      original: bytes === null ? null : bytes.toString('base64'),
      originalSha256: bytes === null ? null : sha256(bytes),
      originalHadBlock: bytes !== null && scanBlock(bytes).wellFormed === true,
      expectedExists: bytes !== null,
      expectedSha256: bytes === null ? null : sha256(bytes),
      separator: null,
      approvedOutside: null,
      mode
    };
  }
  // Exclusive creation also protects the original baseline when two setups race.
  fs.writeFileSync(outAbs, `${JSON.stringify({ version: 1, root, files }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { status: 'snapshotted', root, files: Object.keys(files).length };
}

function expandTemplate(template, replacements) {
  if (typeof template !== 'string' || template.length === 0) {
    throw new CliError(EXIT.USAGE, 'spec.template must be a non-empty string');
  }
  if (replacements === null || typeof replacements !== 'object' || Array.isArray(replacements)) {
    throw new CliError(EXIT.USAGE, 'spec.replacements must be an object');
  }
  let expanded = template;
  for (const [token, value] of Object.entries(replacements)) {
    if (!/^__[A-Z][A-Z0-9_]*__$/.test(token)) {
      throw new CliError(EXIT.USAGE, `spec.replacements key is not a reserved placeholder token: ${token}`);
    }
    if (token === '__FP__') {
      throw new CliError(EXIT.USAGE, '__FP__ is computed by the helper and must not be supplied');
    }
    if (typeof value !== 'string') throw new CliError(EXIT.USAGE, `spec.replacements.${token} must be a string`);
    expanded = expanded.split(token).join(value);
  }
  return expanded;
}

/** Whole template normalized to LF with no leading BOM; block bytes are LF-only. */
function renderCandidateBlock(spec) {
  const expanded0 = expandTemplate(spec.template, spec.replacements ?? {});
  if (!/__FP__/.test(expanded0)) {
    throw new CliError(EXIT.VALIDATE, 'spec.template header must contain the __FP__ placeholder');
  }
  let text = lfNormalize(Buffer.from(expanded0, 'utf8')).toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const normalized = Buffer.from(text, 'utf8');
  const scan0 = scanBlock(normalized);
  if (!scan0.present || !scan0.wellFormed) {
    throw new CliError(EXIT.VALIDATE, 'spec.template must contain exactly one ordered start/end marker pair');
  }
  const fp = fp16(lfNormalize(scan0.body));
  const candidate = Buffer.from(text.split('__FP__').join(fp), 'utf8');
  const { scan, header } = validateCandidateBlock(candidate);
  if (header.block !== spec.block) {
    throw new CliError(EXIT.BLOCK, `spec.block (${spec.block}) does not match the template block (${header.block})`);
  }
  return { candidate, scan, header };
}

/**
 * Original integrity: markers must agree on block name and comment style, and the
 * recorded body fp must match. Only metadata-level repair (strict grammar broken but
 * markers sound) is permitted; user body drift always blocks.
 */
function assertOriginalIntegrity(curScan, expectedBlock, approvalSha) {
  const startText = curScan.startLine.text;
  const endText = curScan.endLine.text;
  const strict = parseStrictMarkers(startText, endText);
  const computed = fp16(lfNormalize(curScan.body));
  if (strict.ok) {
    if (expectedBlock && strict.block !== expectedBlock) {
      throw new CliError(EXIT.BLOCK, `existing block name (${strict.block}) does not match spec.block (${expectedBlock})`);
    }
    if (strict.fp !== computed) {
      // §5.2 compatibility: an explicit candidate choice may replace the body, but only
      // when the metadata is valid and the approval is bound to the exact current bytes.
      if (approvalSha) return { repaired: false, conflictApproved: true };
      throw new CliError(EXIT.BLOCK, `existing managed body was modified (fp ${strict.fp} vs computed ${computed}); refusing automatic overwrite`);
    }
    return { repaired: false };
  }
  // Not strictly well-formed: only proceed when the markers themselves still agree.
  const startName = lenientBlockName(startText);
  const endName = lenientBlockName(endText);
  if (!startName || !endName || startName !== endName) {
    throw new CliError(EXIT.PAUSE, `existing markers are broken or mismatched (${startName ?? 'none'} vs ${endName ?? 'none'}); manual adjudication required (PAUSE)`);
  }
  if (markerStyle(startText) !== markerStyle(endText)) {
    throw new CliError(EXIT.PAUSE, 'existing markers mix comment styles; manual adjudication required (PAUSE)');
  }
  if (expectedBlock && startName !== expectedBlock) {
    throw new CliError(EXIT.BLOCK, `existing block name (${startName}) does not match spec.block (${expectedBlock})`);
  }
  const recordedFp = lenientFp(startText);
  if (!recordedFp) {
    throw new CliError(EXIT.PAUSE, 'existing header has no well-formed fp; manual adjudication required (PAUSE)');
  }
  if (recordedFp !== computed) {
    throw new CliError(EXIT.BLOCK, `existing managed body was modified (fp ${recordedFp} vs computed ${computed}); refusing automatic overwrite`);
  }
  return { repaired: true };
}

function atomicReplace(abs, bytes, mode) {
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.lazypack-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
  const fd = fs.openSync(tmp, 'wx', mode ?? 0o644);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.chmodSync(tmp, mode ?? 0o644);
  } catch {
    /* best-effort permission preservation */
  }
  fs.renameSync(tmp, abs);
}

function cmdWrite({ cwd, baseline, spec }) {
  const root = resolveRoot(cwd);
  const { abs: baselineAbs, baseline: base } = loadBaseline(baseline, root);
  const specObj = readJsonExternal(root, spec, '--spec');
  if (!specObj || typeof specObj !== 'object' || typeof specObj.path !== 'string' || typeof specObj.block !== 'string') {
    throw new CliError(EXIT.USAGE, '--spec must be {path, block, template, replacements}');
  }
  const rel = specObj.path;
  if (!Object.prototype.hasOwnProperty.call(base.files, rel)) {
    throw new CliError(EXIT.USAGE, `spec.path is not part of the baseline: ${rel}`);
  }
  const entry = base.files[rel];
  const abs = resolveSafeTarget(root, rel, 'spec.path');
  const current = readRegularFile(abs, rel);
  const currentSha = current === null ? null : sha256(current);
  if (currentSha !== entry.expectedSha256) {
    throw new CliError(EXIT.STALE, `target changed outside this helper since the baseline: ${rel}`);
  }
  const approval = specObj.approvedConflictSha256;
  if (approval !== undefined && (typeof approval !== 'string' || !/^[0-9a-f]{64}$/.test(approval))) {
    throw new CliError(EXIT.USAGE, 'spec.approvedConflictSha256 must be a 64-character lowercase hex sha256');
  }
  if (approval !== undefined && approval !== currentSha) {
    throw new CliError(EXIT.BLOCK, `spec.approvedConflictSha256 does not match the current bytes of ${rel}; no recapture`);
  }

  const { candidate, scan: candidateScan } = renderCandidateBlock(specObj);
  const blockLf = candidate.subarray(candidateScan.blockStart, candidateScan.blockEnd);

  let next;
  let action;
  let newSeparator = null;
  let approvedOutside = null;
  if (!entry.expectedExists) {
    if (current !== null) throw new CliError(EXIT.STALE, `target should not exist yet but does: ${rel}`);
    next = candidate;
    action = 'create';
    approvedOutside = outsideBytes(next, scanBlock(next));
  } else {
    if (current === null) throw new CliError(EXIT.STALE, `target disappeared since the baseline: ${rel}`);
    const curScan = scanBlock(current);
    if (curScan.present && !curScan.wellFormed) {
      throw new CliError(EXIT.BLOCK, `existing markers are duplicated, unordered or truncated: ${rel}`);
    }
    if (curScan.present) {
      const integrity = assertOriginalIntegrity(curScan, specObj.block, currentSha !== null && approval === currentSha ? approval : null);
      let blockNative = toNativeEol(blockLf, detectEol(current));
      if (!curScan.blockEndedWithNewline) blockNative = stripTrailingEol(blockNative);
      next = Buffer.concat([current.subarray(0, curScan.blockStart), blockNative, current.subarray(curScan.blockEnd)]);
      action = integrity.conflictApproved ? 'resolve-conflict' : integrity.repaired ? 'repair' : 'replace';
    } else {
      const eol = detectEol(current);
      const needsSeparator = current.length > 0 && current[current.length - 1] !== 0x0a;
      newSeparator = needsSeparator ? (eol === 'crlf' ? Buffer.from('\r\n') : Buffer.from('\n')) : Buffer.alloc(0);
      next = Buffer.concat([current, newSeparator, toNativeEol(blockLf, eol)]);
      action = 'append';
    }
  }

  // Validate the authorised outside region BEFORE writing and never refresh it afterwards.
  const nextOutside = outsideBytes(next, scanBlock(next));
  if (action === 'create') {
    if (!nextOutside.equals(approvedOutside)) throw new CliError(EXIT.BLOCK, 'new file outside bytes are not the approved template outside');
  } else if (action === 'append') {
    const authorised = Buffer.concat([Buffer.from(entry.original, 'base64'), newSeparator]);
    if (!nextOutside.equals(authorised)) {
      throw new CliError(EXIT.BLOCK, 'append would change original bytes beyond the minimal separator');
    }
  } else if (!nextOutside.equals(expectedOutsideBytes(entry))) {
    throw new CliError(EXIT.BLOCK, `write would change bytes outside the managed block: ${rel}`);
  }

  if (next.equals(current ?? Buffer.alloc(0))) {
    return { status: 'noop', path: rel };
  }

  atomicReplace(abs, next, entry.exists ? entry.mode : 0o644);
  const readBack = readRegularFile(abs, rel);
  if (readBack === null || !readBack.equals(next)) {
    throw new CliError(EXIT.UNSAFE, `read-back verification failed for ${rel}`);
  }
  entry.expectedExists = true;
  entry.expectedSha256 = sha256(next);
  if (action === 'append') entry.separator = newSeparator.toString('base64');
  if (action === 'create') entry.approvedOutside = approvedOutside.toString('base64');
  writeJsonAtomic(baselineAbs, base);
  return { status: action, path: rel, sha256: entry.expectedSha256 };
}

function cmdVerify({ cwd, baseline }) {
  const root = resolveRoot(cwd);
  const { baseline: base } = loadBaseline(baseline, root);
  const failures = [];
  for (const [rel, entry] of Object.entries(base.files)) {
    try {
      const abs = resolveSafeTarget(root, rel, 'baseline path');
      const current = readRegularFile(abs, rel);
      const currentSha = current === null ? null : sha256(current);
      if (currentSha !== entry.expectedSha256) {
        failures.push({ path: rel, code: EXIT.STALE, reason: 'bytes differ from the tracked expected hash' });
        continue;
      }
      if (current === null) continue; // absent and expected absent
      const scan = scanBlock(current);
      if (!scan.present) {
        if (entry.exists && current.includes(Buffer.from('lazypack:start'))) {
          failures.push({ path: rel, code: EXIT.BLOCK, reason: 'managed markers were removed or truncated' });
        }
        continue; // untouched unmarked (paused) file with unchanged bytes
      }
      try {
        validateCandidateBlock(current);
      } catch (error) {
        failures.push({ path: rel, code: error.code === EXIT.VALIDATE ? EXIT.VALIDATE : EXIT.BLOCK, reason: error.message });
        continue;
      }
      if (entry.expectedExists && !outsideBytes(current, scan).equals(expectedOutsideBytes(entry))) {
        failures.push({ path: rel, code: EXIT.BLOCK, reason: 'bytes outside the managed block changed' });
      }
    } catch (error) {
      failures.push({ path: rel, code: error.code ?? EXIT.UNSAFE, reason: error.message });
    }
  }
  if (!failures.length) return { status: 'verified', files: Object.keys(base.files).length, failures: [] };
  const code = failures.some((f) => f.code === EXIT.VALIDATE) ? EXIT.VALIDATE
    : failures.some((f) => f.code === EXIT.BLOCK || f.code === EXIT.PAUSE) ? EXIT.BLOCK
      : failures.some((f) => f.code === EXIT.UNSAFE) ? EXIT.UNSAFE
        : EXIT.STALE;
  const error = new CliError(code, `${failures.length} file(s) failed baseline verification`);
  error.details = { failures };
  throw error;
}

// ---------------------------------------------------------------------------
// Retention rendering
// ---------------------------------------------------------------------------
const RETENTION_VARIABLES = Object.freeze(['__IDEAS_PATH__', '__MINUTES_DIR__', '__RAW_QA_PATH__', '__RAW_QA_VISIBILITY__']);
const DIMENSIONS = Object.freeze(['ideas', 'minutes', 'raw_qa']);
const MODE_BY_SINGLE_DIMENSION = Object.freeze({ ideas: 'ideas-pool', minutes: 'minutes-only', raw_qa: 'raw-qa' });
const SECTION_BY_KEY = Object.freeze({
  'decisions-only|': 1,
  'ideas-pool|ideas': 2,
  'minutes-only|minutes': 3,
  'raw-qa|raw_qa': 4,
  'hybrid|ideas,minutes': 5,
  'hybrid|ideas,raw_qa': 6,
  'hybrid|minutes,raw_qa': 7,
  'hybrid|ideas,minutes,raw_qa': 8,
  'unconfigured|': 9
});

function isRepoRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\')) return false;
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  return !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

const isSafeAlias = (value) =>
  typeof value === 'string' && /^[a-z][a-z0-9._-]*:[^\s/\\]+$/.test(value) && !/^[A-Za-z]:/.test(value);

function validateRetentionPolicy(policy) {
  if (!policy || typeof policy !== 'object') throw new CliError(EXIT.USAGE, '--retention-json must be an object');
  if (policy.mode === 'pending') {
    throw new CliError(EXIT.PAUSE, 'Retention policy is pending; do not render a section before the user answers');
  }
  const dimensions = policy.dimensions;
  if (!Array.isArray(dimensions) || dimensions.some((d) => !DIMENSIONS.includes(d)) ||
      new Set(dimensions).size !== dimensions.length) {
    throw new CliError(EXIT.USAGE, 'dimensions must be a unique subset of ["ideas","minutes","raw_qa"]');
  }
  if ([...dimensions].sort().join(',') !== dimensions.join(',')) {
    throw new CliError(EXIT.USAGE, 'dimensions must be in ascending order: ideas, minutes, raw_qa');
  }
  const expectedMode = dimensions.length === 0 ? null
    : dimensions.length === 1 ? MODE_BY_SINGLE_DIMENSION[dimensions[0]] : 'hybrid';
  if (expectedMode === null) {
    if (policy.mode !== 'decisions-only' && policy.mode !== 'unconfigured') {
      throw new CliError(EXIT.USAGE, 'an empty dimension set must use mode decisions-only or unconfigured');
    }
  } else if (policy.mode !== expectedMode) {
    throw new CliError(EXIT.USAGE, `mode ${policy.mode} is inconsistent with dimensions [${dimensions.join(',')}]`);
  }
  const { paths, visibility } = policy;
  if (!paths || typeof paths !== 'object' || !visibility || typeof visibility !== 'object') {
    throw new CliError(EXIT.USAGE, 'retention policy must include paths and visibility dictionaries');
  }
  for (const dimension of DIMENSIONS) {
    const enabled = dimensions.includes(dimension);
    const value = paths[dimension];
    const vis = visibility[dimension];
    if (!enabled) {
      if (value !== '' || vis !== 'none') {
        throw new CliError(EXIT.USAGE, `disabled dimension ${dimension} must have an empty path and visibility "none"`);
      }
      continue;
    }
    if (dimension === 'raw_qa') {
      if (vis === 'private-storage') {
        if (!isSafeAlias(value)) {
          throw new CliError(EXIT.UNSAFE, 'raw_qa with private-storage visibility needs a safe storage alias (e.g. vault:raw-qa)');
        }
      } else if (vis === 'private-repo') {
        if (!isRepoRelativePath(value)) {
          throw new CliError(EXIT.UNSAFE, 'raw_qa with private-repo visibility needs an in-repo relative path');
        }
      } else {
        throw new CliError(EXIT.UNSAFE, `raw_qa must stay in private storage or a private repository, not "${vis}"`);
      }
      continue;
    }
    if (vis !== 'public-repo' && vis !== 'private-repo') {
      throw new CliError(EXIT.USAGE, `${dimension} needs visibility public-repo or private-repo`);
    }
    if (!isRepoRelativePath(value)) {
      throw new CliError(EXIT.UNSAFE, `${dimension} needs a repo-relative path without "." or ".." segments`);
    }
  }
  return { dimensions, mode: policy.mode, paths, visibility };
}

function extractRetentionSection(sectionNumber) {
  const source = fs.readFileSync(RETENTION_REFERENCE, 'utf8').replace(/\r\n/g, '\n');
  const headingIndex = source.indexOf(`### 4.${sectionNumber} `);
  if (headingIndex < 0) throw new CliError(EXIT.USAGE, `retention-sections.md is missing section 4.${sectionNumber}`);
  const fenceStart = source.indexOf('```markdown', headingIndex);
  if (fenceStart < 0) throw new CliError(EXIT.USAGE, `section 4.${sectionNumber} has no fenced markdown block`);
  const bodyStart = source.indexOf('\n', fenceStart) + 1;
  const fenceEnd = source.indexOf('```', bodyStart);
  if (fenceEnd < 0) throw new CliError(EXIT.USAGE, `section 4.${sectionNumber} fence is not terminated`);
  return source.slice(bodyStart, fenceEnd);
}

function cmdRenderRetention({ retentionJson }) {
  const policy = readJsonExternal(process.cwd(), retentionJson, '--retention-json');
  const { dimensions, mode, paths, visibility } = validateRetentionPolicy(policy);
  const sectionNumber = SECTION_BY_KEY[`${mode}|${dimensions.join(',')}`];
  if (!sectionNumber) {
    throw new CliError(EXIT.USAGE, `no authoritative section for mode ${mode} / dimensions [${dimensions.join(',')}]`);
  }
  const substitutions = {
    __IDEAS_PATH__: paths.ideas,
    __MINUTES_DIR__: paths.minutes,
    __RAW_QA_PATH__: paths.raw_qa,
    __RAW_QA_VISIBILITY__: visibility.raw_qa
  };
  let rendered = extractRetentionSection(sectionNumber);
  for (const variable of RETENTION_VARIABLES) rendered = rendered.split(variable).join(substitutions[variable]);
  if (RESERVED_TOKEN.test(rendered)) {
    throw new CliError(EXIT.VALIDATE, 'rendered retention section still contains a reserved placeholder token');
  }
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        cwd: { type: 'string' },
        'files-json': { type: 'string' },
        out: { type: 'string' },
        baseline: { type: 'string' },
        spec: { type: 'string' },
        'retention-json': { type: 'string' }
      },
      strict: true
    }));
  } catch (error) {
    throw new CliError(EXIT.USAGE, error.message);
  }
  const [command] = positionals;
  const require = (value, flag) => {
    if (!value) throw new CliError(EXIT.USAGE, `${command} requires ${flag}`);
    return value;
  };

  if (command === 'snapshot') {
    console.log(JSON.stringify({ ok: true, ...cmdSnapshot({
      cwd: require(values.cwd, '--cwd'),
      filesJson: require(values['files-json'], '--files-json'),
      out: require(values.out, '--out')
    }) }));
    return;
  }
  if (command === 'write') {
    console.log(JSON.stringify({ ok: true, ...cmdWrite({
      cwd: require(values.cwd, '--cwd'),
      baseline: require(values.baseline, '--baseline'),
      spec: require(values.spec, '--spec')
    }) }));
    return;
  }
  if (command === 'verify') {
    console.log(JSON.stringify({ ok: true, ...cmdVerify({
      cwd: require(values.cwd, '--cwd'),
      baseline: require(values.baseline, '--baseline')
    }) }));
    return;
  }
  if (command === 'render-retention') {
    process.stdout.write(cmdRenderRetention({ retentionJson: require(values['retention-json'], '--retention-json') }));
    return;
  }
  throw new CliError(EXIT.USAGE, `unknown command: ${command ?? '(none)'}`);
}

try {
  main();
} catch (error) {
  if (error instanceof CliError) {
    console.error(JSON.stringify({ ok: false, code: error.code, error: error.message, ...(error.details ?? {}) }));
    process.exitCode = error.code;
  } else {
    console.error(JSON.stringify({ ok: false, code: EXIT.USAGE, error: error?.stack ?? String(error) }));
    process.exitCode = EXIT.USAGE;
  }
}
