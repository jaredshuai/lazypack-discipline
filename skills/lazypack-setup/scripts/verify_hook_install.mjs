/**
 * Read-only, deterministic pre-commit installation check for lazypack native hooks.
 * This verifies static wiring only. It NEVER executes the target hook or tests.
 *
 * Usage:
 *   node verify_hook_install.mjs --cwd <target-repo> --mode new
 *   node verify_hook_install.mjs --cwd <target-repo> --mode existing
 *
 * Exit codes: 0 = static checks passed, 1 = check failed, 2 = invalid invocation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const FIRST_LINE_NEW = Buffer.from('#!/bin/sh\n', 'utf8');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const MARKER = '# lazypack:start block=pre-commit-hook ';

function result(ok, code, description) {
  return { ok, code, description };
}

/** Does not decode/rewrite the file before checking its first bytes. */
export function inspectHookBytes(bytes, mode = 'new') {
  if (!['new', 'existing'].includes(mode)) return result(false, 'INVALID_MODE', 'mode must be new or existing');
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return result(false, 'EMPTY_HOOK', 'hook is empty');
  if (bytes.subarray(0, BOM.length).equals(BOM)) {
    return result(false, 'BOM_BEFORE_SHEBANG', 'UTF-8 BOM precedes the interpreter; pause for an explicit repair decision');
  }
  const eol = bytes.indexOf(0x0a);
  if (eol < 0) return result(false, 'NO_FIRST_LINE_LF', 'first line has no LF terminator');
  if (eol > 0 && bytes[eol - 1] === 0x0d) {
    return result(false, 'CRLF_SHEBANG', 'first line contains CRLF; interpreter must end with LF');
  }
  const firstLine = bytes.subarray(0, eol + 1);
  if (mode === 'new') {
    if (!firstLine.equals(FIRST_LINE_NEW)) {
      return result(false, 'WRONG_NEW_SHEBANG', 'new native lazypack hook must start with #!/bin/sh followed by LF');
    }
  } else if (!/^#!\/[\x21-\x7e]+(?: [\x21-\x7e]+)*\n$/.test(firstLine.toString('utf8'))) {
    return result(false, 'INVALID_EXISTING_SHEBANG', 'existing native hook must retain a valid absolute-interpreter shebang');
  }
  if (!bytes.toString('utf8').includes(MARKER)) {
    return result(false, 'MISSING_MANAGED_MARKER', 'native hook is not a lazypack managed pre-commit hook');
  }
  return result(true, 'STATIC_BYTES_OK', 'first-line bytes and managed marker verified');
}

function readGit(repo, args) {
  const p = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  if (p.error) return result(false, 'GIT_UNAVAILABLE', 'git could not be invoked');
  if (p.status !== 0) return result(false, 'GIT_QUERY_FAILED', 'git query did not succeed');
  return { ok: true, value: p.stdout.trim() };
}

/** Read-only check. Never runs git hook run or project-specific commands. */
export function inspectHookInstallation({ cwd = process.cwd(), mode = 'new' } = {}) {
  if (!['new', 'existing'].includes(mode)) return result(false, 'INVALID_MODE', 'mode must be new or existing');
  const root = readGit(path.resolve(cwd), ['rev-parse', '--show-toplevel']);
  if (!root.ok) return root;
  const repo = path.resolve(root.value);
  const hookPath = path.join(repo, '.githooks', 'pre-commit');
  let stat;
  try {
    stat = fs.lstatSync(hookPath);
  } catch {
    return result(false, 'HOOK_NOT_FOUND', 'native pre-commit hook is absent');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return result(false, 'HOOK_NOT_REGULAR_FILE', 'hook must be a regular file, not a symlink');
  }
  let bytes;
  try {
    bytes = fs.readFileSync(hookPath);
  } catch {
    return result(false, 'HOOK_READ_FAILED', 'cannot read hook bytes');
  }
  const checked = inspectHookBytes(bytes, mode);
  if (!checked.ok) return checked;
  if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
    return result(false, 'HOOK_NOT_EXECUTABLE', 'POSIX hook has no executable mode bits');
  }
  const conf = readGit(repo, ['config', '--get', 'core.hooksPath']);
  if (!conf.ok) return result(false, 'HOOKS_PATH_NOT_CONFIGURED', 'effective core.hooksPath is missing or unreadable');
  if (path.resolve(repo, conf.value) !== path.join(repo, '.githooks')) {
    return result(false, 'HOOKS_PATH_MISMATCH', 'effective core.hooksPath does not point to repository .githooks');
  }
  return result(true, 'CONFIGURED_STATIC_ONLY', 'static hook bytes, executable bit (where applicable), and effective Git hook route verified; Git invocation NOT tested');
}

function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        cwd: { type: 'string', default: process.cwd() },
        mode: { type: 'string', default: 'new' }
      },
      strict: true
    }));
  } catch (e) {
    console.error(JSON.stringify(result(false, 'INVALID_ARGUMENTS', e.message)));
    process.exitCode = 2;
    return;
  }
  const outcome = inspectHookInstallation(values);
  console.log(JSON.stringify(outcome));
  if (!outcome.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
