/**
 * Deterministic, dependency-free regression for issue #85.
 * Test fixtures are in OS temp; NEVER execute a hook from a real project.
 * Usage: node scripts/test_verify_hook_install.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectHookBytes, inspectHookInstallation } from '../skills/lazypack-setup/scripts/verify_hook_install.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.resolve(here, '../skills/lazypack-setup/scripts/verify_hook_install.mjs');
const marker = '# lazypack:start block=pre-commit-hook src=DECISIONS.md@0.7.0 gen=x input=x fp=x\n';
const good = '#!/bin/sh\n' + marker + 'printf SAFE_GIT_HOOK_FIXTURE > hook-invoked.flag\n';
let n = 0;
function check(name, fn) {
  fn();
  n++;
  console.log('PASS ' + n + ': ' + name);
}

check('valid new hook bytes', () => assert.equal(inspectHookBytes(Buffer.from(good)).ok, true));
check('incident: missing shebang is rejected', () => assert.equal(inspectHookBytes(Buffer.from(marker)).code, 'WRONG_NEW_SHEBANG'));
check('UTF-8 BOM before shebang is rejected', () => assert.equal(inspectHookBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(good)])).code, 'BOM_BEFORE_SHEBANG'));
check('CRLF first-line is rejected', () => assert.equal(inspectHookBytes(Buffer.from(good.replace('#!/bin/sh\n', '#!/bin/sh\r\n'))).code, 'CRLF_SHEBANG'));
check('existing bash shebang preserved but not accepted as new', () => {
  const custom = Buffer.from(good.replace('#!/bin/sh', '#!/usr/bin/env bash'));
  assert.equal(inspectHookBytes(custom, 'existing').ok, true);
  assert.equal(inspectHookBytes(custom, 'new').ok, false);
});
check('unmanaged hook is rejected', () => assert.equal(inspectHookBytes(Buffer.from('#!/bin/sh\necho hi\n')).code, 'MISSING_MANAGED_MARKER'));

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-hook-issue85-'));
try {
  const git = spawnSync('git', ['init', '-q', base], { encoding: 'utf8' });
  assert.equal(git.status, 0, 'git init failed: ' + git.stderr);
  const hookDir = path.join(base, '.githooks');
  fs.mkdirSync(hookDir);
  const hookFile = path.join(hookDir, 'pre-commit');
  fs.writeFileSync(hookFile, good);
  fs.chmodSync(hookFile, 0o755);
  check('missing core.hooksPath fails closed', () => assert.equal(inspectHookInstallation({ cwd: base }).code, 'HOOKS_PATH_NOT_CONFIGURED'));
  const config = spawnSync('git', ['-C', base, 'config', 'core.hooksPath', '.githooks'], { encoding: 'utf8' });
  assert.equal(config.status, 0);
  check('correct route passes static verification only', () => assert.equal(inspectHookInstallation({ cwd: base }).code, 'CONFIGURED_STATIC_ONLY'));
  check('CLI returns structured static evidence', () => {
    const p = spawnSync(process.execPath, [checker, '--cwd', base, '--mode', 'new'], { encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
    assert.equal(JSON.parse(p.stdout).code, 'CONFIGURED_STATIC_ONLY');
  });
  check('native Git invocation of isolated harmless fixture succeeds', () => {
    const p = spawnSync('git', ['-C', base, 'hook', 'run', 'pre-commit'], { encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
    assert.equal(fs.readFileSync(path.join(base, 'hook-invoked.flag'), 'utf8'), 'SAFE_GIT_HOOK_FIXTURE');
  });
  check('wrong hook path fails closed', () => {
    const p = spawnSync('git', ['-C', base, 'config', 'core.hooksPath', '.git/hooks'], { encoding: 'utf8' });
    assert.equal(p.status, 0);
    assert.equal(inspectHookInstallation({ cwd: base }).code, 'HOOKS_PATH_MISMATCH');
    spawnSync('git', ['-C', base, 'config', 'core.hooksPath', '.githooks'], { encoding: 'utf8' });
  });
  if (process.platform !== 'win32') {
    check('non-executable POSIX hook fails closed', () => {
      fs.chmodSync(hookFile, 0o644);
      assert.equal(inspectHookInstallation({ cwd: base }).code, 'HOOK_NOT_EXECUTABLE');
      fs.chmodSync(hookFile, 0o755);
    });
  }
  check('CLI fails if shebang was omitted in generated file', () => {
    fs.writeFileSync(hookFile, marker + 'printf SAFE_GIT_HOOK_FIXTURE > hook-invoked.flag\n');
    const p = spawnSync(process.execPath, [checker, '--cwd', base, '--mode', 'new'], { encoding: 'utf8' });
    assert.equal(p.status, 1);
    assert.equal(JSON.parse(p.stdout).code, 'WRONG_NEW_SHEBANG');
    assert.equal(fs.readFileSync(hookFile, 'utf8').startsWith('# lazypack:start'), true, 'must not mutate target');
  });
  check('BOM is not silently repaired', () => {
    const content = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(good)]);
    fs.writeFileSync(hookFile, content);
    assert.equal(inspectHookInstallation({ cwd: base }).code, 'BOM_BEFORE_SHEBANG');
    assert.deepEqual(fs.readFileSync(hookFile), content);
  });
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
console.log(n + '/' + n + ' PASS; isolated Git test only; real project hooks were NOT executed');
