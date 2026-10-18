import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectHookInstallation } from '../skills/lazypack-setup/scripts/verify_hook_install.mjs';

const templatePath = fileURLToPath(new URL('../skills/lazypack-setup/templates/pre-commit.sh', import.meta.url));
const slots = ['format', 'lint', 'type', 'test'];
const quote = s => s.replaceAll("'", "'\"'\"'");
function render(commands, states = {}, provenance = '') {
  let hook = fs.readFileSync(templatePath, 'utf8').replaceAll('\r\n', '\n');
  hook = hook.replace('# __PRESET_PROVENANCE_LINE__\n', provenance ? provenance + '\n' : '');
  hook = hook.replace('__GEN__', '1234567890abcdef').replace('__INPUT__', 'abcdef1234567890');
  for (const slot of slots) {
    const upper = slot.toUpperCase();
    hook = hook.replace(`__${upper}_STATUS__`, quote(states[slot] ?? (commands[slot] ? 'wired' : 'missing')));
    hook = hook.replace(`__${upper}_CMD__`, quote(commands[slot] ?? ''));
  }
  const begin = hook.indexOf('\n', hook.indexOf('# lazypack:start')) + 1;
  const end = hook.indexOf('# lazypack:end');
  const fp = crypto.createHash('sha256').update(hook.slice(begin, end)).digest('hex').slice(0, 16);
  return hook.replace('__FP__', fp);
}
function git(repo, ...args) {
  const p = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(p.error, undefined, String(p.error));
  return p;
}
function fixture(t, commands, states = {}, provenance = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-aggregate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(git(root, 'init', '--quiet').status, 0);
  fs.mkdirSync(path.join(root, '.githooks'));
  fs.writeFileSync(path.join(root, 'stage.cjs'), `const fs=require('node:fs');const name=process.argv[2];fs.appendFileSync('events.log',name+'\\n');process.exit(process.env.FAIL_STAGE===name?7:0);\n`);
  fs.writeFileSync(path.join(root, '.githooks/pre-commit'), render(commands, states, provenance));
  fs.chmodSync(path.join(root, '.githooks/pre-commit'), 0o755);
  assert.equal(git(root, 'config', '--local', 'core.hooksPath', '.githooks').status, 0);
  const run = (env = {}) => {
    const p = spawnSync('git', ['-C', root, 'hook', 'run', 'pre-commit'], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, ...env } });
    assert.equal(p.error, undefined, String(p.error));
    return { ...p, output: p.stdout + p.stderr };
  };
  const events = () => fs.existsSync(path.join(root, 'events.log')) ? fs.readFileSync(path.join(root, 'events.log'), 'utf8').trim().split('\n').filter(Boolean) : [];
  return { root, run, events };
}
function npmFixture(f) {
  fs.writeFileSync(path.join(f.root, 'package.json'), JSON.stringify({ private: true, scripts: {
    'check:versions': 'node stage.cjs versions', check: 'node stage.cjs type',
    test: 'npm run check:versions && npm run check && node --test safe.test.cjs'
  } }));
  fs.writeFileSync(path.join(f.root, 'safe.test.cjs'), `require('node:fs').appendFileSync('events.log','test\\n');require('node:test')('safe fixture',()=>require('node:assert/strict').equal(1,1));\n`);
}
test('npm test remains intact across type/test and runs the full aggregate only once', t => {
  const f = fixture(t, { type: 'npm test', test: 'npm test' });
  npmFixture(f);
  const before = fs.readFileSync(path.join(f.root, 'package.json'));
  assert.equal(inspectHookInstallation({ cwd: f.root }).ok, true);
  assert.doesNotMatch(fs.readFileSync(path.join(f.root, '.githooks/pre-commit'), 'utf8'), /# lazypack:preset/);
  const p = f.run();
  assert.equal(p.status, 0, p.output);
  assert.deepEqual(f.events(), ['versions', 'type', 'test']);
  for (const slot of slots) assert.match(p.output, new RegExp('\\[lazypack\\] (?:Running )?' + slot));
  assert.match(p.output, /test: reused.*type.*passed/);
  const hook = fs.readFileSync(path.join(f.root, '.githooks/pre-commit'), 'utf8');
  assert.match(hook, /TYPE_CMD='npm test'/);
  assert.match(hook, /TEST_CMD='npm test'/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'package.json')), before);
});
test('failed aggregate is cached, short-circuits internally and still blocks after later success', t => {
  const f = fixture(t, { format: 'npm test', lint: 'node stage.cjs later', type: 'npm test', test: 'npm test' });
  npmFixture(f);
  const p = f.run({ FAIL_STAGE: 'versions' });
  assert.notEqual(p.status, 0, p.output);
  assert.deepEqual(f.events(), ['versions', 'later']);
  assert.match(p.output, /type: reused.*format.*failed/);
  assert.match(p.output, /test: reused.*format.*failed/);
});
test('four slots with the same command run once per Hook invocation, never across invocations', t => {
  const f = fixture(t, Object.fromEntries(slots.map(s => [s, 'node stage.cjs shared'])));
  for (let i = 0; i < 2; i++) assert.equal(f.run().status, 0);
  assert.deepEqual(f.events(), ['shared', 'shared']);
});
test('exact match reuses a nonadjacent command without skipping unrelated commands', t => {
  const f = fixture(t, { format: 'node stage.cjs shared', lint: 'node stage.cjs lint', type: 'node stage.cjs shared', test: 'node stage.cjs test' });
  const p = f.run();
  assert.equal(p.status, 0, p.output);
  assert.deepEqual(f.events(), ['shared', 'lint', 'test']);
});
test('whitespace differences are not normalized into a shared command', t => {
  const f = fixture(t, { type: 'node stage.cjs item', test: 'node  stage.cjs item' });
  assert.equal(f.run().status, 0);
  assert.deepEqual(f.events(), ['item', 'item']);
});
for (const status of ['install-failed', 'invalid', 'missing', 'n/a']) {
  test(`cached command never overrides ${status} slot state`, t => {
    const f = fixture(t, { format: 'node stage.cjs item', test: 'node stage.cjs item' }, { test: status });
    const p = f.run();
    assert.equal(p.status === 0, ['missing', 'n/a'].includes(status), p.output);
    assert.deepEqual(f.events(), ['item']);
    assert.doesNotMatch(p.output, /test: reused/);
  });
}
test('wired whitespace-only command is still rejected after a successful gate', t => {
  const f = fixture(t, { format: 'node stage.cjs item', test: '   ' });
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.events(), ['item']);
});
test('command strings with quotes, dollars, delimiters and newlines are compared literally', t => {
  const command = `node stage.cjs 'quoted|$literal'\nnode stage.cjs tail`;
  const f = fixture(t, { type: command, test: command });
  assert.equal(f.run().status, 0);
  assert.deepEqual(f.events(), ['quoted|$literal', 'tail']);
});
test('a child exit and variable assignments cannot clear a cached failure', t => {
  const f = fixture(t, { format: 'node stage.cjs bad', lint: 'EXIT_CODE=0; exit 0', type: 'node stage.cjs bad', test: 'node stage.cjs last' });
  const p = f.run({ FAIL_STAGE: 'bad' });
  assert.notEqual(p.status, 0, p.output);
  assert.deepEqual(f.events(), ['bad', 'last']);
});
