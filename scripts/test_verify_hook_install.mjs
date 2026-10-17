/**
 * Isolated Git regression for #85. Real target hooks are NEVER executed.
 * Execute: node scripts/test_verify_hook_install.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectHookBytes, inspectHookInstallation } from '../skills/lazypack-setup/scripts/verify_hook_install.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.resolve(here, '../skills/lazypack-setup/scripts/verify_hook_install.mjs');
const template = fs.readFileSync(path.resolve(here, '../skills/lazypack-setup/templates/pre-commit.sh'), 'utf8');
const header = '# lazypack:start block=pre-commit-hook ';
const footer = '# lazypack:end block=pre-commit-hook';
let checks = 0;
function check(label, fn) {
  fn();
  checks++;
  console.log('PASS ' + checks + ': ' + label);
}
function git(cwd, ...args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5000, windowsHide: true });
}
function renderRealTemplate() {
  let value = template.replace('# __PRESET_PROVENANCE_LINE__\n', '');
  value = value.replace('__GEN__', '1234567890abcdef').replace('__INPUT__', 'abcdef1234567890');
  for (const slot of ['FORMAT', 'LINT', 'TYPE', 'TEST']) {
    value = value.replace('__' + slot + '_STATUS__', 'missing').replace('__' + slot + '_CMD__', ':');
  }
  const startLine = value.indexOf(header);
  const begin = value.indexOf('\n', startLine) + 1;
  const end = value.indexOf(footer, begin);
  assert.ok(startLine >= 0 && begin > startLine && end > begin && value.includes('run_gate "test"'));
  const fp = crypto.createHash('sha256').update(value.slice(begin, end), 'utf8').digest('hex').slice(0, 16);
  return value.replace('__FP__', fp);
}
const good = renderRealTemplate();
const bytes = Buffer.from(good, 'utf8');
const first = '#!/bin/sh\n';
check('real pre-commit template renders complete four-gate block + matching fingerprint', () => {
  for (const gate of ['format', 'lint', 'type', 'test']) assert.ok(good.includes('run_gate "' + gate + '"'));
  assert.equal(inspectHookBytes(bytes).code, 'STATIC_BYTES_OK');
});
check('incident: missing shebang rejected', () => assert.equal(inspectHookBytes(Buffer.from(good.slice(first.length))).code, 'WRONG_NEW_SHEBANG'));
check('UTF-8 BOM before shebang rejected', () => assert.equal(inspectHookBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])).code, 'BOM_BEFORE_SHEBANG'));
check('CRLF first-line rejected', () => assert.equal(inspectHookBytes(Buffer.from(good.replace(first, '#!/bin/sh\r\n'))).code, 'CRLF_SHEBANG'));
check('existing valid Bash interpreter accepted, not replaced by new-mode', () => {
  const bash = Buffer.from(good.replace('#!/bin/sh', '#!/usr/bin/env bash'));
  assert.equal(inspectHookBytes(bash, 'existing').code, 'STATIC_BYTES_OK');
  assert.equal(inspectHookBytes(bash, 'new').code, 'WRONG_NEW_SHEBANG');
});
check('new hook with LF shebang and CRLF managed body is rejected', () => {
  const broken = Buffer.from(good.replace('EXIT_CODE=0\n', 'EXIT_CODE=0\r\n'));
  assert.equal(inspectHookBytes(broken, 'new').code, 'NEW_HOOK_NON_LF');
});
check('malformed UTF-8 rejected even if its lossy-decoded body hash was planted', () => {
  let raw = Buffer.from(good, 'utf8');
  raw[raw.indexOf(Buffer.from('EXIT_CODE=0'))] = 0xff;
  const text = raw.toString('utf8');
  const begin = text.indexOf('\n', text.indexOf(header)) + 1;
  const end = text.indexOf(footer, begin);
  const fake = crypto.createHash('sha256').update(text.slice(begin, end), 'utf8').digest('hex').slice(0, 16);
  raw = Buffer.from(raw.toString('latin1').replace(/fp=[0-9a-f]{16}/, 'fp=' + fake), 'latin1');
  assert.equal(inspectHookBytes(raw, 'new').code, 'INVALID_UTF8');
});
check('existing managed block immediately after unconditional exit 0 is rejected', () => {
  const stopped = Buffer.from(good.replace(header, 'exit 0\n' + header));
  assert.equal(inspectHookBytes(stopped, 'existing').code, 'UNREACHABLE_MANAGED_BLOCK');
});
check('Bash interpreter with CRLF rejected, repair must preserve Bash', () => {
  const bash = Buffer.from(good.replace(first, '#!/usr/bin/env bash\r\n'));
  assert.equal(inspectHookBytes(bash, 'existing').code, 'CRLF_SHEBANG');
  assert.equal(inspectHookBytes(Buffer.from(good.replace(first, '#!/usr/bin/env bash\n')), 'existing').code, 'STATIC_BYTES_OK');
});
check('truncated block lacking end marker rejected', () => {
  assert.equal(inspectHookBytes(Buffer.from(good.slice(0, good.indexOf(footer)))).code, 'INVALID_MANAGED_BOUNDARY');
});
check('start-marker substring embedded in shell code is not accepted', () => {
  const fake = Buffer.from('#!/bin/sh\nprintf "# lazypack:start block=pre-commit-hook x"\n');
  assert.equal(inspectHookBytes(fake).code, 'INVALID_MANAGED_BOUNDARY');
});
check('duplicate managed start markers rejected', () => {
  const startLine = good.split('\n').find(x => x.startsWith(header));
  assert.equal(inspectHookBytes(Buffer.from(good.replace(footer, startLine + '\n' + footer))).code, 'INVALID_MANAGED_BOUNDARY');
});
check('managed block body corruption rejected by recorded fingerprint', () => {
  assert.equal(inspectHookBytes(Buffer.from(good.replace('run_gate "test"', 'run_gate "TEST"'))).code, 'MANAGED_FP_MISMATCH');
});
check('altered fingerprint rejected', () => {
  assert.equal(inspectHookBytes(Buffer.from(good.replace(/fp=[0-9a-f]{16}/, 'fp=0000000000000000'))).code, 'MANAGED_FP_MISMATCH');
});
check('invalid markers rejected', () => assert.equal(inspectHookBytes(Buffer.from(good.replace(footer, '# lazypack:end block=other'))).code, 'INVALID_MANAGED_MARKERS'));
check('empty input rejected', () => assert.equal(inspectHookBytes(Buffer.alloc(0)).code, 'EMPTY_HOOK'));
check('unterminated shebang rejected', () => assert.equal(inspectHookBytes(Buffer.from('#!/bin/sh')).code, 'NO_FIRST_LINE_LF'));
check('invalid existing interpreter rejected', () => assert.equal(inspectHookBytes(Buffer.from(good.replace(first, '#!bin/sh\n')), 'existing').code, 'INVALID_EXISTING_SHEBANG'));
check('invalid mode rejected', () => assert.equal(inspectHookBytes(bytes, 'bad').code, 'INVALID_MODE'));

// Explicitly ignore host global and system Git configs. Restore the host env afterward.
const isolation = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_COUNT'];
const previous = Object.fromEntries(isolation.map(k => [k, process.env[k]]));
process.env.GIT_CONFIG_GLOBAL = os.devNull;
process.env.GIT_CONFIG_SYSTEM = os.devNull;
process.env.GIT_CONFIG_NOSYSTEM = '1';
process.env.GIT_CONFIG_COUNT = '0';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-hook-issue85-'));
try {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  assert.equal(git(repo, 'init', '-q').status, 0);
  const hookDir = path.join(repo, '.githooks');
  fs.mkdirSync(hookDir);
  const hookPath = path.join(hookDir, 'pre-commit');
  fs.writeFileSync(hookPath, bytes);
  fs.chmodSync(hookPath, 0o755);
  const cli = (...args) => spawnSync(process.execPath, [checker, '--cwd', repo, ...args], { encoding: 'utf8', windowsHide: true });
  check('missing core.hooksPath fails closed under isolated Git config', () => {
    assert.equal(inspectHookInstallation({ cwd: repo }).code, 'HOOKS_PATH_NOT_CONFIGURED');
  });
  assert.equal(git(repo, 'config', '--local', 'core.hooksPath', '.githooks').status, 0);
  check('static verification succeeds on complete real template', () => assert.equal(inspectHookInstallation({ cwd: repo }).code, 'CONFIGURED_STATIC_ONLY'));
  check('CLI emits structured static-only evidence', () => {
    const p = cli('--mode', 'new');
    assert.equal(p.status, 0, p.stderr);
    assert.equal(JSON.parse(p.stdout).code, 'CONFIGURED_STATIC_ONLY');
  });
  check('native Git invokes harmless full-template fixture, not a real project hook', () => {
    const p = git(repo, 'hook', 'run', 'pre-commit');
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stdout + p.stderr, /\[lazypack\]/);
    assert.equal(git(repo, 'rev-list', '--all', '--count').stdout.trim(), '0');
  });
  check('nonstandard effective hook path fails closed', () => {
    assert.equal(git(repo, 'config', '--local', 'core.hooksPath', '.git/hooks').status, 0);
    assert.equal(inspectHookInstallation({ cwd: repo }).code, 'HOOKS_PATH_MISMATCH');
    assert.equal(git(repo, 'config', '--local', 'core.hooksPath', '.githooks').status, 0);
  });
  check('trailing whitespace in Git hooksPath does not get trimmed into a false match', () => {
    assert.equal(git(repo, 'config', '--local', 'core.hooksPath', '.githooks ').status, 0);
    try { assert.equal(inspectHookInstallation({ cwd: repo }).code, 'HOOKS_PATH_MISMATCH'); }
    finally { assert.equal(git(repo, 'config', '--local', 'core.hooksPath', '.githooks').status, 0); }
  });
  check('invalid --mode uses documented exit code 2', () => {
    const p = cli('--mode', 'bogus');
    assert.equal(p.status, 2, p.stdout + p.stderr);
    assert.equal(JSON.parse(p.stdout).code, 'INVALID_MODE');
  });
  check('unknown CLI switch uses documented exit code 2', () => assert.equal(cli('--unknown').status, 2));
  check('missing hook rejects even though config points to hook directory', () => {
    fs.renameSync(hookPath, hookPath + '.bak');
    try { assert.equal(inspectHookInstallation({ cwd: repo }).code, 'HOOK_NOT_FOUND'); }
    finally { fs.renameSync(hookPath + '.bak', hookPath); }
  });
  check('zero-length hook fails closed', () => {
    fs.writeFileSync(hookPath, '');
    try { assert.equal(inspectHookInstallation({ cwd: repo }).code, 'EMPTY_HOOK'); }
    finally { fs.writeFileSync(hookPath, bytes); fs.chmodSync(hookPath, 0o755); }
  });
  check('checker never repairs or overwrites malformed hook', () => {
    const bad = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]);
    fs.writeFileSync(hookPath, bad);
    assert.equal(inspectHookInstallation({ cwd: repo }).code, 'BOM_BEFORE_SHEBANG');
    assert.deepEqual(fs.readFileSync(hookPath), bad);
    fs.writeFileSync(hookPath, bytes);
  });
  if (process.platform !== 'win32') {
    check('POSIX effective X_OK fails for missing execute bits', () => {
      fs.chmodSync(hookPath, 0o644);
      try { assert.equal(inspectHookInstallation({ cwd: repo }).code, 'HOOK_NOT_EXECUTABLE'); }
      finally { fs.chmodSync(hookPath, 0o755); }
    });
    if (process.getuid?.() !== 0) {
      check('POSIX owner mode 0401: readable but not executable by owner', () => {
        fs.chmodSync(hookPath, 0o401);
        try { assert.equal(inspectHookInstallation({ cwd: repo }).code, 'HOOK_NOT_EXECUTABLE'); }
        finally { fs.chmodSync(hookPath, 0o755); }
      });
    } else {
      console.log('SKIP owner-permission precedence test: running as root');
    }
    check('symlink to a hook outside .githooks rejected', () => {
      const external = path.join(dir, 'external.sh');
      fs.writeFileSync(external, bytes);
      fs.renameSync(hookPath, hookPath + '.bak');
      fs.symlinkSync(external, hookPath);
      try { assert.equal(inspectHookInstallation({ cwd: repo }).code, 'HOOK_NOT_REGULAR_FILE'); }
      finally { fs.unlinkSync(hookPath); fs.renameSync(hookPath + '.bak', hookPath); }
    });
    check('symlinked .githooks parent rejected before any target execution', () => {
      const externalDir = path.join(dir, 'external-hooks');
      fs.mkdirSync(externalDir);
      fs.writeFileSync(path.join(externalDir, 'pre-commit'), bytes);
      fs.renameSync(hookDir, hookDir + '.bak');
      fs.symlinkSync(externalDir, hookDir, 'dir');
      try { assert.equal(inspectHookInstallation({ cwd: repo }).code, 'HOOK_DIR_UNSAFE'); }
      finally { fs.unlinkSync(hookDir); fs.renameSync(hookDir + '.bak', hookDir); }
    });
    check('invoking verifier through a symlink never exits silently', () => {
      const alias = path.join(dir, 'alias-checker.mjs');
      fs.symlinkSync(checker, alias);
      try {
        const p = spawnSync(process.execPath, [alias, '--cwd', repo, '--mode', 'new'], { encoding: 'utf8' });
        assert.equal(p.status, 0, p.stderr);
        assert.equal(JSON.parse(p.stdout).code, 'CONFIGURED_STATIC_ONLY');
      } finally { fs.unlinkSync(alias); }
    });
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [k, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[k];
    else process.env[k] = value;
  }
}
console.log(checks + '/' + checks + ' PASS in isolated Git fixtures; real target hooks were NOT run');
