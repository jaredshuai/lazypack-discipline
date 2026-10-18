import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildMigrationPlan } from '../skills/lazypack-setup/scripts/doc_plan.mjs';
import { executePlan } from '../skills/lazypack-setup/scripts/doc_executor.mjs';
import { scanProjectDocuments } from '../skills/lazypack-setup/scripts/doc_scanner.mjs';

const helper = fileURLToPath(new URL('../skills/lazypack-setup/scripts/doc_helper.mjs', import.meta.url));
function fixture(t, roles = '# Roles\nraw_qa: docs/old-private\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-retention-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const policy = path.join(repo, 'docs/agents/roles.md');
  fs.mkdirSync(path.dirname(policy), { recursive: true });
  if (roles !== null) fs.writeFileSync(policy, roles);
  fs.writeFileSync(path.join(repo, 'notes.md'), '# Notes\n');
  const plan = buildMigrationPlan(repo, {
    migrate_items: [{ source_path: 'notes.md', target_path: 'docs/notes.md' }]
  }, { inboundReferences: {} }, { excludePaths: ['docs/old-private'] });
  return { root, repo, policy, plan, backup: path.join(root, 'backup') };
}
async function blockedBeforeIO(t, f, reason) {
  const reads = [];
  const originalRead = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', function (name, ...args) {
    if (typeof name === 'string' && Object.keys(f.plan.inputDigests).some(p => path.resolve(f.repo, p) === path.resolve(name))) {
      reads.push(name);
      throw new Error('Migration input must not be read before retention revalidation');
    }
    return originalRead.call(this, name, ...args);
  });
  const result = await executePlan(f.plan, { approvedPlanFp: f.plan.planFp, backupRoot: f.backup });
  t.mock.restoreAll();
  assert.equal(result.status, 'APPROVAL_DRIFT_BLOCKED');
  assert.match(result.reason, reason);
  assert.deepEqual(reads, []);
  assert.equal(fs.existsSync(f.backup), false, 'no backup or WAL before policy check');
  assert.equal(fs.existsSync(path.join(f.repo, 'docs/notes.md')), false);
  assert.equal(fs.existsSync(path.join(f.repo, 'docs/ARTIFACTS.md')), false);
  assert.equal(fs.readFileSync(path.join(f.repo, 'notes.md'), 'utf8'), '# Notes\n');
}

for (const [label, mutate] of [
  ['changed raw_qa path', f => fs.writeFileSync(f.policy, '# Roles\nraw_qa: notes.md\n')],
  ['removed retention section', f => fs.writeFileSync(f.policy, '# Roles\n')],
  ['deleted policy file', f => fs.unlinkSync(f.policy)],
  ['truncated policy', f => fs.writeFileSync(f.policy, '')],
  ['invalid UTF-8 replacement', f => fs.writeFileSync(f.policy, Buffer.from([0xff]))]
]) {
  test(label + ' blocks before migration reads/writes', async t => {
    const f = fixture(t); mutate(f);
    await blockedBeforeIO(t, f, /RETENTION_POLICY_DRIFT/);
  });
}
test('new roles file after approval blocks', async t => {
  const f = fixture(t, null);
  fs.writeFileSync(f.policy, '# Roles\nraw_qa: notes.md\n');
  await blockedBeforeIO(t, f, /RETENTION_POLICY_DRIFT/);
});
test('unreadable policy shape fails closed', async t => {
  const f = fixture(t); fs.unlinkSync(f.policy); fs.mkdirSync(f.policy);
  await blockedBeforeIO(t, f, /RETENTION_POLICY_UNREADABLE/);
});
test('policy read permission failure is not treated as absence', async t => {
  const f = fixture(t);
  const originalOpen = fs.openSync;
  t.mock.method(fs, 'openSync', function (name, ...args) {
    if (path.resolve(name) === f.policy) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    return originalOpen.call(this, name, ...args);
  });
  await blockedBeforeIO(t, f, /RETENTION_POLICY_UNREADABLE/);
});
test('parent junction/symlink is rejected without following it', async t => {
  const f = fixture(t);
  const moved = path.join(f.root, 'external-agents');
  fs.renameSync(path.dirname(f.policy), moved);
  fs.symlinkSync(moved, path.dirname(f.policy), process.platform === 'win32' ? 'junction' : 'dir');
  await blockedBeforeIO(t, f, /RETENTION_POLICY_UNREADABLE/);
});
for (const roles of [null, '# Legacy roles, no retention field\n', '# Roles\nraw_qa: docs/old-private\n']) {
  test('unchanged policy baseline succeeds: ' + (roles ?? 'absent'), async t => {
    const f = fixture(t, roles);
    const result = await executePlan(f.plan, { approvedPlanFp: f.plan.planFp, backupRoot: f.backup });
    assert.equal(result.status, 'SUCCESS', result.reason);
    assert.equal(fs.readFileSync(path.join(f.repo, 'docs/notes.md'), 'utf8'), '# Notes\n');
  });
}
test('legacy plan without policy baseline requires regeneration', async t => {
  const f = fixture(t);
  delete f.plan.planSummary.retentionPolicy;
  f.plan.planFp = crypto.createHash('sha256').update(JSON.stringify(f.plan.planSummary)).digest('hex');
  await blockedBeforeIO(t, f, /RETENTION_POLICY_BASELINE_MISSING/);
});
test('policy fingerprint is bound into approved plan fingerprint', async t => {
  const f = fixture(t);
  f.plan.planSummary.retentionPolicy.files['docs/agents/roles.md'] = '0'.repeat(64);
  await blockedBeforeIO(t, f, /PLAN_INTEGRITY_BLOCKED/);
});
test('planning fails closed when policy path cannot be inspected safely', t => {
  const f = fixture(t);
  fs.unlinkSync(f.policy); fs.mkdirSync(f.policy);
  assert.throws(() => buildMigrationPlan(f.repo, {}, { inboundReferences: {} }), { code: 'ERR_RETENTION_POLICY_UNREADABLE' });
});
test('new plans bind changes without publishing policy text', t => {
  const f = fixture(t);
  const sentinel = 'PRIVATE_STORAGE_ALIAS_DO_NOT_PUBLISH';
  fs.writeFileSync(f.policy, '# Roles\nraw_qa: ' + sentinel + '\n');
  const next = buildMigrationPlan(f.repo, { migrate_items: [{ source_path: 'notes.md', target_path: 'docs/notes.md' }] },
    { inboundReferences: {} }, { excludePaths: ['docs/old-private'] });
  assert.notEqual(next.planFp, f.plan.planFp);
  assert.equal(next.inputFp, f.plan.inputFp);
  assert.equal(JSON.stringify(next).includes(sentinel), false);
});
test('CLI execute also blocks policy drift', t => {
  const f = fixture(t);
  const planPath = path.join(f.root, 'plan.json');
  fs.writeFileSync(planPath, JSON.stringify(f.plan));
  fs.writeFileSync(f.policy, '# Roles\nraw_qa: notes.md\n');
  const p = spawnSync(process.execPath, [helper, 'execute', '--cwd', f.repo, '--plan', planPath,
    '--approved-fp', f.plan.planFp, '--backup-root', f.backup], { encoding: 'utf8', windowsHide: true });
  assert.equal(p.status, 1, p.stdout + p.stderr);
  assert.equal(JSON.parse(p.stdout).status, 'APPROVAL_DRIFT_BLOCKED');
  assert.match(JSON.parse(p.stdout).reason, /RETENTION_POLICY_DRIFT/);
  assert.equal(fs.existsSync(f.backup), false);
});
test('CLI plan and execute round trip preserves an absent-policy baseline', t => {
  const f = fixture(t, null);
  const specPath = path.join(f.root, 'spec.json');
  const planPath = path.join(f.root, 'cli-plan.json');
  fs.writeFileSync(specPath, JSON.stringify({ migrate_items: [{ source_path: 'notes.md', target_path: 'docs/notes.md' }] }));
  const planned = spawnSync(process.execPath, [helper, 'plan', '--cwd', f.repo, '--input', specPath, '--out', planPath],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(planned.status, 0, planned.stdout + planned.stderr);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.deepEqual(plan.planSummary.retentionPolicy, { version: 2, files: {
    'docs/agents/roles.md': null, 'AGENTS.md': null, 'CLAUDE.md': null
  } });
  const executed = spawnSync(process.execPath, [helper, 'execute', '--cwd', f.repo, '--plan', planPath,
    '--approved-fp', plan.planFp, '--backup-root', f.backup], { encoding: 'utf8', windowsHide: true });
  assert.equal(executed.status, 0, executed.stdout + executed.stderr);
  assert.equal(JSON.parse(executed.stdout).status, 'SUCCESS');
});

for (const carrier of ['AGENTS.md', 'CLAUDE.md']) {
  for (const transition of ['changed', 'deleted', 'created']) {
    test(`legacy ${carrier} ${transition} after approval blocks before input reads`, async t => {
      const f = fixture(t, null);
      const entry = path.join(f.repo, carrier);
      if (transition !== 'created') fs.writeFileSync(entry, '# Policy\nraw_qa: docs/old-private\n');
      f.plan = buildMigrationPlan(f.repo, { migrate_items: [{ source_path: 'notes.md', target_path: 'docs/notes.md' }] },
        { inboundReferences: {} }, { excludePaths: ['docs/old-private'] });
      if (transition === 'deleted') fs.unlinkSync(entry);
      else fs.writeFileSync(entry, '# Policy\nraw_qa: notes.md\n');
      await blockedBeforeIO(t, f, /RETENTION_POLICY_DRIFT/);
    });
  }
  test(`legacy ${carrier} cannot be migrated`, t => {
    const f = fixture(t, null); fs.writeFileSync(path.join(f.repo, carrier), '# Legacy policy\n');
    assert.throws(() => buildMigrationPlan(f.repo, { migrate_items: [{ source_path: carrier, target_path: 'docs/legacy.md' }] },
      { inboundReferences: {} }), /POLICY_FILE_RESERVED/);
  });
}

test('both unchanged legacy resident entries remain compatible', async t => {
  const f = fixture(t, null);
  for (const name of ['AGENTS.md', 'CLAUDE.md']) fs.writeFileSync(path.join(f.repo, name), '# Legacy policy\n');
  f.plan = buildMigrationPlan(f.repo, { migrate_items: [{ source_path: 'notes.md', target_path: 'docs/notes.md' }] }, { inboundReferences: {} });
  const result = await executePlan(f.plan, { approvedPlanFp: f.plan.planFp, backupRoot: f.backup });
  assert.equal(result.status, 'SUCCESS');
});

test('legacy entry changes are checked even when roles.md exists', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.repo, 'AGENTS.md'), '# Newly effective raw_qa: notes.md\n');
  await blockedBeforeIO(t, f, /RETENTION_POLICY_DRIFT/);
});

test('version 1 single-carrier snapshots require regeneration', async t => {
  const f = fixture(t);
  f.plan.planSummary.retentionPolicy = { version: 1, sha256: null };
  f.plan.planFp = crypto.createHash('sha256').update(JSON.stringify(f.plan.planSummary)).digest('hex');
  await blockedBeforeIO(t, f, /RETENTION_POLICY_BASELINE_MISSING/);
});

test('junction repository root is rejected', async t => {
  const f = fixture(t);
  const alias = path.join(f.root, 'alias');
  fs.symlinkSync(f.repo, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => buildMigrationPlan(alias, {}, { inboundReferences: {} }), /RETENTION_POLICY_UNREADABLE/);
});

for (const [label, roles, source, target] of [
  ['source', '# Roles\n', 'docs/agents/roles.md', 'docs/moved-roles.md'],
  ['target', null, 'notes.md', 'docs/agents/roles.md']
]) {
  test('policy carrier cannot be a migration ' + label, t => {
    const f = fixture(t, roles);
    assert.throws(() => buildMigrationPlan(f.repo, {
      migrate_items: [{ source_path: source, target_path: target }]
    }, { inboundReferences: {} }), /POLICY_FILE_RESERVED/);
  });
}

test('real scanner inbound policy reference is rejected before serializing its content', t => {
  const f = fixture(t);
  fs.writeFileSync(f.policy, '# Roles\nPRIVATE_ALIAS [notes](../../notes.md)\n');
  const scan = scanProjectDocuments(f.repo);
  assert.ok(scan.inboundReferences['notes.md'].some(ref => ref.sourceRelPath === 'docs/agents/roles.md'));
  assert.throws(() => buildMigrationPlan(f.repo, {
    migrate_items: [{ source_path: 'notes.md', target_path: 'docs/notes.md' }]
  }, scan), /POLICY_FILE_RESERVED/);
});

test('executor rejects a self-consistent plan replacing the policy carrier', async t => {
  const f = fixture(t);
  f.plan.fileActions.push({ action: 'REWRITE_INBOUND_REFERENCE', filePath: 'docs/agents/roles.md', contentToWrite: 'replacement' });
  f.plan.planSummary.fileActions.push({ action: 'REWRITE_INBOUND_REFERENCE', sourcePath: 'docs/agents/roles.md', targetPath: null });
  f.plan.planSummary.actionsCount++;
  f.plan.planFp = crypto.createHash('sha256').update(JSON.stringify(f.plan.planSummary)).digest('hex');
  await blockedBeforeIO(t, f, /POLICY_FILE_RESERVED/);
});

for (const command of ['plan', 'scan']) {
for (const changeDuringScan of [false, true]) {
  test(`CLI ${command}: ` + (changeDuringScan ? 'rejects a policy change during scanning' : 'validates policy before reading any scanned input'), t => {
    const f = fixture(t);
    if (!changeDuringScan) { fs.unlinkSync(f.policy); fs.mkdirSync(f.policy); }
    const guard = path.join(f.root, 'guard.mjs');
    const marker = path.join(f.root, 'input-was-read');
    const spec = path.join(f.root, 'spec.json');
    const out = path.join(f.root, 'cli-plan.json');
    fs.writeFileSync(spec, JSON.stringify({ preserve_items: [{ path: 'notes.md' }] }));
    fs.writeFileSync(guard, `import fs from 'node:fs'; import path from 'node:path';
const original=fs.readFileSync;
fs.readFileSync=function(p,...args){
 if(typeof p==='string' && path.resolve(p)===${JSON.stringify(path.join(f.repo, 'notes.md'))}){
  fs.writeFileSync(${JSON.stringify(marker)},'read');
  ${changeDuringScan ? `fs.writeFileSync(${JSON.stringify(f.policy)},'changed during scan');` : ''}
 }
 return original.call(this,p,...args);
};`);
    const p = spawnSync(process.execPath, ['--import', pathToFileURL(guard).href, helper, command, '--cwd', f.repo, '--input', spec, '--out', out],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(p.status, 1, p.stdout + p.stderr);
    assert.match(p.stderr, changeDuringScan ? /RETENTION_POLICY_DRIFT/ : /RETENTION_POLICY_UNREADABLE/);
    assert.equal(fs.existsSync(marker), changeDuringScan);
    assert.equal(fs.existsSync(out), false);
  });
}
}

test('CLI explicit exclusion is persisted and prevents an excluded migration', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.repo, 'docs/old-private'));
  fs.writeFileSync(path.join(f.repo, 'docs/old-private/secret.md'), 'SECRET_SENTINEL');
  const spec = path.join(f.root, 'spec.json');
  const out = path.join(f.root, 'cli-plan.json');
  const args = [helper, 'plan', '--cwd', f.repo, '--input', spec, '--out', out, '--exclude', 'docs/old-private/'];
  fs.writeFileSync(spec, JSON.stringify({ preserve_items: [{ path: 'notes.md' }] }));
  const p = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  const plan = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(plan.exclusions, ['docs/old-private']);
  assert.deepEqual(plan.planSummary.exclusions, ['docs/old-private']);
  assert.equal(JSON.stringify(plan).includes('SECRET_SENTINEL'), false);
  fs.unlinkSync(out);
  fs.writeFileSync(spec, JSON.stringify({ migrate_items: [{ source_path: 'docs/old-private/secret.md', target_path: 'docs/leak.md' }] }));
  const rejected = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /ERR_EXCLUDED_PATH/);
  assert.equal(fs.existsSync(out), false);
});

for (const carrier of ['docs/agents/roles.md', 'AGENTS.md', 'CLAUDE.md']) {
  test(`hard-link alias of ${carrier} cannot be migrated`, t => {
    const f = fixture(t);
    if (carrier !== 'docs/agents/roles.md') fs.writeFileSync(path.join(f.repo, carrier), '# Legacy policy\n');
    fs.linkSync(path.join(f.repo, carrier), path.join(f.repo, 'alias.md'));
    assert.throws(() => buildMigrationPlan(f.repo, { migrate_items: [{ source_path: 'alias.md', target_path: 'docs/leak.md' }] },
      { inboundReferences: {} }), /POLICY_FILE_RESERVED/);
  });
}
test('executor blocks rewriting a policy hard link before input IO', async t => {
  const f = fixture(t);
  fs.linkSync(f.policy, path.join(f.repo, 'alias.md'));
  f.plan.fileActions.push({ action: 'REWRITE_INBOUND_REFERENCE', filePath: 'alias.md', contentToWrite: 'replacement' });
  f.plan.planSummary.fileActions.push({ action: 'REWRITE_INBOUND_REFERENCE', sourcePath: 'alias.md', targetPath: null });
  f.plan.planSummary.actionsCount++;
  f.plan.planFp = crypto.createHash('sha256').update(JSON.stringify(f.plan.planSummary)).digest('hex');
  await blockedBeforeIO(t, f, /POLICY_FILE_RESERVED/);
});
