/**
 * Read-only native lazypack pre-commit installation verifier.
 * Does not execute the target hook or modify project files/configuration.
 *
 * node verify_hook_install.mjs --cwd <repository> --mode new|existing
 * Exit codes: 0 = configured statically; 1 = static failure; 2 = invalid usage.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const EXPECTED_NEW = Buffer.from('#!/bin/sh\n');
const END_MARKER = '# lazypack:end block=pre-commit-hook';
const HEADER_RE = /^# lazypack:start block=pre-commit-hook src=DECISIONS\.md@\d+\.\d+\.\d+ gen=[a-f0-9]{16} input=[a-f0-9]{16} fp=([a-f0-9]{16})$/;

function result(ok, code, description) {
  return { ok, code, description };
}

/** Inspect bytes before trusting any decoded interpretation of the file. */
export function inspectHookBytes(bytes, mode = 'new') {
  if (!['new', 'existing'].includes(mode)) return result(false, 'INVALID_MODE', 'mode must be new or existing');
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return result(false, 'EMPTY_HOOK', 'hook is empty');
  if (bytes.subarray(0, 3).equals(BOM)) {
    return result(false, 'BOM_BEFORE_SHEBANG', 'UTF-8 BOM precedes shebang; stop and resolve without relocating BOM into shell body');
  }
  const firstLf = bytes.indexOf(0x0a);
  if (firstLf < 0) return result(false, 'NO_FIRST_LINE_LF', 'first line is not LF terminated');
  if (firstLf > 0 && bytes[firstLf - 1] === 0x0d) {
    return result(false, 'CRLF_SHEBANG', 'shebang must be LF terminated; preserve valid existing interpreter on repair');
  }
  const first = bytes.subarray(0, firstLf + 1);
  if (mode === 'new') {
    if (!first.equals(EXPECTED_NEW)) {
      return result(false, 'WRONG_NEW_SHEBANG', 'new native hook must start with exactly #!/bin/sh + LF');
    }
  } else if (!/^#!\/[\x21-\x7e]+(?:[ \t]+[\x21-\x7e]+)*\n$/.test(first.toString('utf8'))) {
    return result(false, 'INVALID_EXISTING_SHEBANG', 'existing native hook must preserve a valid absolute interpreter shebang');
  }
  // New native files must be entirely LF; CRLF in the body can break POSIX sh.
  // Existing-file CRLF is a separate protected-content/explicit-repair case.
  if (mode === 'new' && bytes.includes(0x0d)) {
    return result(false, 'NEW_HOOK_NON_LF', 'new native hook contains CR bytes after the shebang');
  }

  // Match complete, unique, line-delimited markers, not a substring in shell code.
  const source = bytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(bytes)) {
    return result(false, 'INVALID_UTF8', 'hook bytes are not valid round-trippable UTF-8');
  }
  const lines = [];
  let offset = 0;
  for (const raw of source.split('\n')) {
    lines.push({ raw, line: raw.endsWith('\r') ? raw.slice(0, -1) : raw, offset });
    offset += raw.length + 1;
  }
  const startIds = [];
  const endIds = [];
  lines.forEach((entry, i) => {
    if (entry.line.startsWith('# lazypack:start')) startIds.push(i);
    if (entry.line.startsWith('# lazypack:end')) endIds.push(i);
  });
  if (startIds.length !== 1 || endIds.length !== 1 || startIds[0] >= endIds[0]) {
    return result(false, 'INVALID_MANAGED_BOUNDARY', 'expected one ordered, complete start/end marker pair');
  }
  const start = lines[startIds[0]];
  const end = lines[endIds[0]];
  // Fail closed on a plainly terminal prelude; this does NOT parse arbitrary shell
  // control flow. Only a bare `exit` line counts; shell metacharacters (`;`, `&`, `|`)
  // mark a compound/conditional statement that may close a block and are skipped.
  // Actual managed-gate execution still needs runtime evidence.
  const preceding = lines.slice(0, startIds[0]).map(entry => entry.line.trim())
    .filter(line => line && !line.startsWith('#'));
  if (/^exit(?:[ \t]+[^#;&|]+)?(?:[ \t]*#.*)?$/.test(preceding.at(-1) ?? '')) {
    return result(false, 'UNREACHABLE_MANAGED_BLOCK', 'managed block follows an unconditional exit statement');
  }
  const header = HEADER_RE.exec(start.line);
  if (!header || end.line !== END_MARKER) {
    return result(false, 'INVALID_MANAGED_MARKERS', 'managed block metadata or end marker is malformed');
  }
  const bodyOffset = start.offset + start.raw.length + 1;
  const body = source.slice(bodyOffset, end.offset).replace(/\r\n/g, '\n');
  if (!body.length) return result(false, 'EMPTY_MANAGED_BODY', 'managed block contains no commands');
  const observedFp = crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex').slice(0, 16);
  if (observedFp !== header[1]) {
    return result(false, 'MANAGED_FP_MISMATCH', 'managed block content differs from recorded fp');
  }
  return result(true, 'STATIC_BYTES_OK', 'interpreter and complete managed block fingerprint are valid');
}

function readGit(repo, args) {
  const p = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', timeout: 8000, windowsHide: true
  });
  if (p.error?.code === 'ETIMEDOUT') return result(false, 'GIT_TIMEOUT', 'git query timed out');
  if (p.error) return result(false, 'GIT_UNAVAILABLE', 'git invocation failed');
  if (p.status !== 0) return result(false, 'GIT_QUERY_FAILED', 'git query returned nonzero exit code');
  // Preserve quoted leading/trailing whitespace in Git config values.
  // Only strip the record terminator emitted by Git itself.
  return { ok: true, value: p.stdout.replace(/\r?\n$/, '') };
}

/** Only reads target files and Git metadata, never executes Git hooks. */
export function inspectHookInstallation({ cwd = process.cwd(), mode = 'new' } = {}) {
  if (!['new', 'existing'].includes(mode)) return result(false, 'INVALID_MODE', 'mode must be new or existing');
  const root = readGit(path.resolve(cwd), ['rev-parse', '--show-toplevel']);
  if (!root.ok) return root;
  const repo = path.resolve(root.value);
  const hookDir = path.join(repo, '.githooks');
  const hookPath = path.join(hookDir, 'pre-commit');
  let dir, stat, repoReal, dirReal, hookReal;
  try {
    dir = fs.lstatSync(hookDir);
    if (!dir.isDirectory() || dir.isSymbolicLink()) {
      return result(false, 'HOOK_DIR_UNSAFE', '.githooks must be a real directory, not a symlink or junction');
    }
    stat = fs.lstatSync(hookPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return result(false, 'HOOK_NOT_REGULAR_FILE', 'hook must be a regular file, not a symlink');
    }
    repoReal = fs.realpathSync.native(repo);
    dirReal = fs.realpathSync.native(hookDir);
    hookReal = fs.realpathSync.native(hookPath);
  } catch (e) {
    if (e?.code === 'ENOENT') return result(false, 'HOOK_NOT_FOUND', 'native hook or its parent directory does not exist');
    return result(false, 'HOOK_PATH_INSPECTION_FAILED', 'cannot safely inspect hook path');
  }
  if (dirReal !== path.join(repoReal, '.githooks') || hookReal !== path.join(dirReal, 'pre-commit')) {
    return result(false, 'HOOK_PATH_ESCAPE', 'resolved hook path is not the expected location within the repository');
  }
  let bytes;
  try {
    bytes = fs.readFileSync(hookPath);
  } catch {
    return result(false, 'HOOK_READ_FAILED', 'cannot read hook bytes');
  }
  const checked = inspectHookBytes(bytes, mode);
  if (!checked.ok) return checked;
  if (process.platform !== 'win32') {
    try {
      fs.accessSync(hookPath, fs.constants.X_OK);
    } catch {
      return result(false, 'HOOK_NOT_EXECUTABLE', 'setup user has no effective execute permission');
    }
  }
  const conf = readGit(repo, ['config', '--get', 'core.hooksPath']);
  if (!conf.ok) return result(false, 'HOOKS_PATH_NOT_CONFIGURED', 'effective core.hooksPath is missing or unreadable');
  if (path.resolve(repo, conf.value) !== hookDir) {
    return result(false, 'HOOKS_PATH_MISMATCH', 'effective core.hooksPath does not point to .githooks');
  }
  return result(true, 'CONFIGURED_STATIC_ONLY', 'static bytes, managed fp, hook path, executable access and Git route valid; target hook NOT executed');
}

function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: {
      cwd: { type: 'string', default: process.cwd() },
      mode: { type: 'string', default: 'new' }
    }, strict: true }));
  } catch (e) {
    console.error(JSON.stringify(result(false, 'INVALID_ARGUMENTS', e.message)));
    process.exitCode = 2;
    return;
  }
  const outcome = inspectHookInstallation(values);
  console.log(JSON.stringify(outcome));
  if (!outcome.ok) process.exitCode = outcome.code === 'INVALID_MODE' ? 2 : 1;
}

// An installed or vendored script may be launched through a filesystem symlink.
if (process.argv[1]) {
  try {
    if (fs.realpathSync.native(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) main();
  } catch {
    // Imported as a module or invoked via a path that could not be resolved.
    if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
  }
}
