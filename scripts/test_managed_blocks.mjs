import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { inspectHookBytes } from '../skills/lazypack-setup/scripts/verify_hook_install.mjs';

const CLI = fileURLToPath(new URL('../skills/lazypack-setup/scripts/managed_blocks.mjs', import.meta.url));
const RETENTION_REF = fileURLToPath(new URL('../skills/lazypack-setup/references/retention-sections.md', import.meta.url));
const HOOK_TEMPLATE = fileURLToPath(new URL('../skills/lazypack-setup/templates/pre-commit.sh', import.meta.url));

// Exit code contract of managed_blocks.mjs
const EXIT = Object.freeze({ OK: 0, USAGE: 2, UNSAFE: 3, STALE: 4, BLOCK: 5, PAUSE: 6, VALIDATE: 7 });

function run(args, cli = CLI) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function tmpRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-mb-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repo, tmp: (name) => path.join(root, name) };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

// Contract §2.1-2.2 oracle (mirrors verify_hook_install.mjs): hash EVERY extracted body
// byte after CRLF->LF only. Empty body hashes the empty byte string. No trailing-LF
// canonicalization: `body\n\n` hashes both LFs; a missing final LF is a different digest.
function fpOf(body) {
  const lf = String(body).replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(Buffer.from(lf, 'utf8')).digest('hex').slice(0, 16);
}

// Historical buggy fp: the final LF was dropped (lines.join), so `body` without its
// terminal LF hashes differently from the same body with it.
function legacyFp(body) {
  return fpOf(String(body).replace(/\n$/, ''));
}

const HDR = (block, fp) =>
  `<!-- lazypack:start block=${block} src=DECISIONS.md@0.7.0 gen=0123456789abcdef input=fedcba9876543210 fp=${fp} -->`;
const END = (block) => `<!-- lazypack:end block=${block} -->`;

function markdownFile(block, body, fp = fpOf(body), eol = '\n') {
  const text = `${HDR(block, fp)}\n${body}${END(block)}\n`;
  return eol === '\n' ? Buffer.from(text, 'utf8') : Buffer.from(text.replace(/\n/g, eol), 'utf8');
}

function snapshot(repo, root, files, extra = []) {
  const filesJson = writeJson(path.join(root, `files-${Math.random().toString(16).slice(2)}.json`), files);
  const baseline = path.join(root, `baseline-${Math.random().toString(16).slice(2)}.json`);
  const res = run(['snapshot', '--cwd', repo, '--files-json', filesJson, '--out', baseline, ...extra]);
  return { res, baseline, filesJson };
}

function writeSpec(root, spec) {
  const specPath = writeJson(path.join(root, `spec-${Math.random().toString(16).slice(2)}.json`), spec);
  return specPath;
}

const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);
const startsWithBom = (buf) => buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;

// Offsets of a single managed block inside a buffer (bytes), assuming "<END>\n" or "<END>" tail.
function splitOutside(buf) {
  const text = buf.toString('utf8');
  const start = text.indexOf('<!-- lazypack:start');
  const endMarker = text.lastIndexOf('<!-- lazypack:end');
  assert.ok(start >= 0 && endMarker > start, 'fixture must contain one managed pair');
  const endOfLine = text.indexOf('\n', endMarker);
  const end = endOfLine === -1 ? text.length : endOfLine + 1;
  return {
    prefix: Buffer.from(text.slice(0, start), 'utf8'),
    block: Buffer.from(text.slice(start, end), 'utf8'),
    suffix: Buffer.from(text.slice(end), 'utf8')
  };
}

// ---------------------------------------------------------------------------
// F1: leftover placeholder with self-consistent fp must not pass verify; write repairs it.
// ---------------------------------------------------------------------------
test('F1 leftover placeholder with self-consistent fp fails verify and write repairs it', (t) => {
  const { root, repo } = tmpRepo(t);
  const target = path.join(repo, 'docs/agents/roles.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const body = '\n# 角色\n\n- **目标路径**：`__IDEAS_PATH__`（状态为 `exploration`）\n';
  fs.writeFileSync(target, markdownFile('agent-roles', body, fpOf(body)));

  const { res: snap, baseline } = snapshot(repo, root, ['docs/agents/roles.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);

  const bad = run(['verify', '--cwd', repo, '--baseline', baseline]);
  assert.equal(bad.status, EXIT.VALIDATE, `verify must reject leftover placeholder, got ${bad.status}: ${bad.stderr}`);

  const fixedBody = '\n# 角色\n\n- **目标路径**：`docs/ideas/inbox.md`（状态为 `exploration`）\n';
  const template = `${HDR('agent-roles', '__FP__')}\n${fixedBody}${END('agent-roles')}\n`;
  const spec = writeSpec(root, { path: 'docs/agents/roles.md', block: 'agent-roles', template, replacements: {} });
  const written = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(written.status, EXIT.OK, written.stderr);

  const good = run(['verify', '--cwd', repo, '--baseline', baseline]);
  assert.equal(good.status, EXIT.OK, `verify after repair failed: ${good.stderr}`);

  // Rerun with identical spec is a true no-op.
  const before = fs.statSync(target).mtimeMs;
  const again = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(again.status, EXIT.OK, again.stderr);
  assert.equal(fs.statSync(target).mtimeMs, before, 'no-op must not touch mtime');
});

// ---------------------------------------------------------------------------
// Header/placeholder validation
// ---------------------------------------------------------------------------
test('unexpanded header fp token and reserved header variables are rejected', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 内容\n';
  const raw = `${HDR('agent-roles', '__FP__')}\n${body}${END('agent-roles')}\n`;
  fs.mkdirSync(path.join(repo, 'docs/agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs/agents/roles.md'), raw);

  const { res: snap, baseline } = snapshot(repo, root, ['docs/agents/roles.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const res = run(['verify', '--cwd', repo, '--baseline', baseline]);
  assert.equal(res.status, EXIT.VALIDATE, `expected placeholder validation failure, got ${res.status}`);
});

test('malformed header key format fails validation', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 内容\n';
  const header = `<!-- lazypack:start block=agent-roles src=DECISIONS.md@0.7.0 gen=0123456789abcdef input=fedcba9876543210 fp=${fpOf(body)} extra=1 -->`;
  fs.mkdirSync(path.join(repo, 'docs/agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs/agents/roles.md'), `${header}\n${body}${END('agent-roles')}\n`);

  const { res: snap, baseline } = snapshot(repo, root, ['docs/agents/roles.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const res = run(['verify', '--cwd', repo, '--baseline', baseline]);
  assert.equal(res.status, EXIT.VALIDATE, `expected header format failure, got ${res.status}`);
});

// ---------------------------------------------------------------------------
// fp oracle: hash every body byte (all terminal LFs); empty body stays empty
// ---------------------------------------------------------------------------
test('fp hashes exact body bytes: terminal LFs preserved, empty body empty, historical dropped-LF rejected', (t) => {
  const { root, repo } = tmpRepo(t);

  const oneLf = '\n# 标题\n\n末行\n';   // body ends with exactly one LF (END on its own line)
  const twoLf = '\n# 标题\n\n末行\n\n'; // body ends with two LFs (END on its own line)
  const empty = '';                     // consecutive marker lines

  // Oracle must not collapse parallel terminal LFs and must not drop the final LF.
  assert.notEqual(fpOf(oneLf), fpOf(twoLf), 'parallel terminal LFs must hash differently');
  assert.notEqual(fpOf(oneLf), fpOf(oneLf.slice(0, -1)), 'final LF must participate in the digest');
  assert.equal(fpOf(empty), crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex').slice(0, 16));

  // Every physical fixture keeps the start/end markers on their own lines.
  const goodFiles = {
    'a-one-lf.md': markdownFile('coding-standards', oneLf),
    'c-two-lf.md': markdownFile('coding-standards', twoLf),
    'd-empty.md': markdownFile('coding-standards', empty)
  };
  for (const [name, buf] of Object.entries(goodFiles)) fs.writeFileSync(path.join(repo, name), buf);

  // Historical bug: header recorded fp over the body with its final LF dropped.
  const badName = 'e-historical.md';
  fs.writeFileSync(path.join(repo, badName), markdownFile('coding-standards', oneLf, fpOf(oneLf.slice(0, -1))));

  const { res: snap, baseline } = snapshot(repo, root, [...Object.keys(goodFiles), badName]);
  assert.equal(snap.status, EXIT.OK, snap.stderr);

  // Isolate the three well-formed files: they must all pass.
  const ok = tmpRepo(t);
  const okNames = Object.keys(goodFiles);
  for (const name of okNames) fs.copyFileSync(path.join(repo, name), path.join(ok.repo, name));
  const okSnap = snapshot(ok.repo, ok.root, okNames);
  assert.equal(okSnap.res.status, EXIT.OK, okSnap.res.stderr);
  const okVerify = run(['verify', '--cwd', ok.repo, '--baseline', okSnap.baseline]);
  assert.equal(okVerify.status, EXIT.OK, `exact-byte fp variants must pass: ${okVerify.stderr}`);

  // The historical (dropped final LF) header is a genuine mismatch.
  const badVerify = run(['verify', '--cwd', repo, '--baseline', baseline]);
  assert.equal(badVerify.status, EXIT.BLOCK, `historical dropped-LF fp must be rejected, got ${badVerify.status}`);

  // write must emit the exact-byte fp, including both terminal LFs for c-two-lf.md.
  const template = `${HDR('coding-standards', '__FP__')}\n${twoLf}${END('coding-standards')}\n`;
  const spec = writeSpec(ok.root, { path: 'c-two-lf.md', block: 'coding-standards', template, replacements: {} });
  const res = run(['write', '--cwd', ok.repo, '--baseline', okSnap.baseline, '--spec', spec]);
  assert.equal(res.status, EXIT.OK, res.stderr);
  const out = fs.readFileSync(path.join(ok.repo, 'c-two-lf.md'), 'utf8');
  assert.match(out, new RegExp(`fp=${fpOf(twoLf)} -->`));
});

// ---------------------------------------------------------------------------
// No-op must not write
// ---------------------------------------------------------------------------
test('identical re-write is a byte-identical no-op', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 内容\n';
  const template = `${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n`;
  const spec = writeSpec(root, { path: 'CODING_STANDARDS.md', block: 'coding-standards', template, replacements: {} });

  const { res: snap, baseline } = snapshot(repo, root, ['CODING_STANDARDS.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const first = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(first.status, EXIT.OK, first.stderr);

  const target = path.join(repo, 'CODING_STANDARDS.md');
  const bytesBefore = fs.readFileSync(target);
  const mtimeBefore = fs.statSync(target).mtimeMs;

  const second = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(second.status, EXIT.OK, second.stderr);
  assert.ok(fs.readFileSync(target).equals(bytesBefore), 'no-op changed bytes');
  assert.equal(fs.statSync(target).mtimeMs, mtimeBefore, 'no-op changed mtime');
});

// ---------------------------------------------------------------------------
// Mixed EOL + BOM + unicode: outside bytes survive write + metadata repair
// ---------------------------------------------------------------------------
test('BOM and mixed CRLF/LF unmanaged prefix/suffix stay byte-identical across repair', (t) => {
  const { root, repo } = tmpRepo(t);
  const target = path.join(repo, 'CLAUDE.md');
  const body = '\n## 工程纪律指针\n\n- 说明 é ✓\n';
  const blockCrlf = `${HDR('resident-discipline', fpOf(body))}\n${body}${END('resident-discipline')}\n`.replace(/\n/g, '\r\n');
  const raw = `\uFEFF# 项目说明\r\n\r\n用户前缀行\r\n${blockCrlf}尾注行\n混合 LF 行\r\n末行无换行`;
  fs.writeFileSync(target, Buffer.from(raw, 'utf8'));

  const { res: snap, baseline } = snapshot(repo, root, ['CLAUDE.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  const before = splitOutside(fs.readFileSync(target));
  const template =
    `<!-- lazypack:start block=resident-discipline src=DECISIONS.md@0.7.0 gen=0123456789abcdef input=2222222222222222 fp=__FP__ -->\n` +
    `${body}${END('resident-discipline')}\n`;
  const spec = writeSpec(root, { path: 'CLAUDE.md', block: 'resident-discipline', template, replacements: {} });
  const res = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(res.status, EXIT.OK, res.stderr);

  const after = splitOutside(fs.readFileSync(target));
  assert.ok(after.prefix.equals(before.prefix), 'unmanaged prefix bytes changed');
  assert.ok(after.suffix.equals(before.suffix), 'unmanaged suffix bytes changed');
  assert.match(fs.readFileSync(target, 'utf8'), /input=2222222222222222/);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  // A second metadata repair must still preserve the ORIGINAL outside bytes (no F2 drift).
  const secondTemplate =
    `<!-- lazypack:start block=resident-discipline src=DECISIONS.md@0.7.0 gen=0123456789abcdef input=3333333333333333 fp=__FP__ -->\n` +
    `${body}${END('resident-discipline')}\n`;
  const secondSpec = writeSpec(root, { path: 'CLAUDE.md', block: 'resident-discipline', template: secondTemplate, replacements: {} });
  assert.equal(run(['write', '--cwd', repo, '--baseline', baseline, '--spec', secondSpec]).status, EXIT.OK);
  const third = splitOutside(fs.readFileSync(target));
  assert.ok(third.prefix.equals(before.prefix), 'original prefix bytes changed after second repair');
  assert.ok(third.suffix.equals(before.suffix), 'original suffix bytes changed after second repair');
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);
});

// ---------------------------------------------------------------------------
// Outside-of-block bytes are immutable for existing managed files
// ---------------------------------------------------------------------------
test('external edits outside the managed block are rejected by verify', (t) => {
  const { root, repo } = tmpRepo(t);
  const target = path.join(repo, 'CLAUDE.md');
  const body = '\n## 指针\n';
  fs.writeFileSync(target, Buffer.from(`# 前缀\r\n${markdownFile('resident-discipline', body, fpOf(body), '\r\n').toString('utf8')}后缀无换行`, 'utf8'));

  const { res: snap, baseline } = snapshot(repo, root, ['CLAUDE.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  const template = `${HDR('resident-discipline', '__FP__')}\n${body}${END('resident-discipline')}\n`;
  const spec = writeSpec(root, { path: 'CLAUDE.md', block: 'resident-discipline', template, replacements: {} });
  assert.equal(run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]).status, EXIT.OK);

  // Append user content outside the block: expected hash changes and, even after a helper
  // rewrite of the block, the outside bytes must still be compared to the ORIGINAL snapshot.
  const original = fs.readFileSync(target);
  fs.appendFileSync(target, '\n用户块外追加\n');
  const drifted = fs.readFileSync(target);
  const rewritten = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(rewritten.status, EXIT.STALE, `external outside edit must block the write, got ${rewritten.status}`);
  assert.ok(fs.readFileSync(target).equals(drifted), 'blocked write must not modify the file');
  assert.notEqual(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);
  assert.ok(original.length > 0);
});

// ---------------------------------------------------------------------------
// snapshot --out is exclusive-create: a repeated snapshot must never erase it
// ---------------------------------------------------------------------------
test('snapshot --out refuses to overwrite an existing baseline, even after target drift', (t) => {
  const { root, repo } = tmpRepo(t);
  fs.writeFileSync(path.join(repo, 'CODING_STANDARDS.md'), markdownFile('coding-standards', '\n# 内容\n'));
  const { res: snap, baseline } = snapshot(repo, root, ['CODING_STANDARDS.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const baselineBefore = fs.readFileSync(baseline);

  // Drift the target, then retry the same --out: must be refused and leave the baseline byte-identical.
  fs.appendFileSync(path.join(repo, 'CODING_STANDARDS.md'), '\n外部漂移\n');
  const filesJson = writeJson(path.join(root, 'files-repeat.json'), ['CODING_STANDARDS.md']);
  const repeat = run(['snapshot', '--cwd', repo, '--files-json', filesJson, '--out', baseline]);
  assert.equal(repeat.status, EXIT.USAGE, `repeat snapshot must be refused, got ${repeat.status}: ${repeat.stderr}`);
  assert.ok(fs.readFileSync(baseline).equals(baselineBefore), 'refused repeat snapshot must not rewrite the original baseline');

  // A fresh --out still works and records the drifted bytes.
  const fresh = path.join(root, 'fresh-baseline.json');
  const freshRes = run(['snapshot', '--cwd', repo, '--files-json', filesJson, '--out', fresh]);
  assert.equal(freshRes.status, EXIT.OK, freshRes.stderr);
  assert.notEqual(fs.readFileSync(fresh).toString('utf8'), baselineBefore.toString('utf8'));
});

// ---------------------------------------------------------------------------
// Self-audit: baseline tampering, in-root baselines, unsafe templates
// ---------------------------------------------------------------------------
test('baseline root mismatch, in-root baseline, and unsafe templates fail closed', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 内容\n';
  fs.writeFileSync(path.join(repo, 'CODING_STANDARDS.md'), markdownFile('coding-standards', body));
  const { res: snap, baseline } = snapshot(repo, root, ['CODING_STANDARDS.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);

  // Tampered baseline root must be refused.
  const tampered = JSON.parse(fs.readFileSync(baseline, 'utf8'));
  tampered.root = path.join(root, 'somewhere-else');
  const tamperedPath = writeJson(path.join(root, 'tampered-baseline.json'), tampered);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', tamperedPath]).status, EXIT.UNSAFE);

  // A baseline placed inside the target repository must be refused.
  const inRepoBaseline = path.join(repo, 'baseline.json');
  fs.copyFileSync(baseline, inRepoBaseline);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', inRepoBaseline]).status, EXIT.UNSAFE);
  assert.equal(run(['write', '--cwd', repo, '--baseline', inRepoBaseline, '--spec', writeSpec(root, {
    path: 'CODING_STANDARDS.md', block: 'coding-standards',
    template: `${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n`, replacements: {}
  })]).status, EXIT.UNSAFE);
  assert.equal(fs.existsSync(path.join(repo, 'CODING_STANDARDS.md')), true, 'refused write must not touch the target');

  // Unsafe templates: leftover reserved placeholder, duplicate pair, and no __FP__.
  const specDir = root;
  const cases = [
    { template: `${HDR('coding-standards', '__FP__')}\n- __IDEAS_PATH__\n${END('coding-standards')}\n`, expect: EXIT.VALIDATE },
    { template: `${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n`, expect: EXIT.VALIDATE },
    { template: `${HDR('coding-standards', '0123456789abcdef')}\n${body}${END('coding-standards')}\n`, expect: EXIT.VALIDATE }
  ];
  for (const [index, testCase] of cases.entries()) {
    const spec = writeSpec(specDir, { path: 'CODING_STANDARDS.md', block: 'coding-standards', template: testCase.template, replacements: {} });
    const res = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
    assert.equal(res.status, testCase.expect, `unsafe template ${index} must fail closed, got ${res.status}: ${res.stderr}`);
  }
});

// ---------------------------------------------------------------------------
// Append to unmarked file with no terminal LF
// ---------------------------------------------------------------------------
test('append to unmarked no-final-LF file preserves prefix and adds minimal separator', (t) => {
  const { root, repo } = tmpRepo(t);
  const target = path.join(repo, 'AGENTS.md');
  const original = Buffer.from('# 标题\n\n- 项一', 'utf8');
  fs.writeFileSync(target, original);

  const { res: snap, baseline } = snapshot(repo, root, ['AGENTS.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  // untouched unmarked (paused) file passes verify
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  const body = '\n## 工程纪律指针\n';
  const template = `${HDR('resident-discipline', '__FP__')}\n${body}${END('resident-discipline')}\n`;
  const spec = writeSpec(root, { path: 'AGENTS.md', block: 'resident-discipline', template, replacements: {} });
  const res = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(res.status, EXIT.OK, res.stderr);

  const out = fs.readFileSync(target);
  assert.ok(out.subarray(0, original.length).equals(original), 'original prefix bytes changed');
  assert.equal(out[original.length], 0x0a, 'expected exactly one LF separator');
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);
});

// ---------------------------------------------------------------------------
// Existing manually-edited body must block writes
// ---------------------------------------------------------------------------
test('manually edited managed body blocks write and leaves file untouched', (t) => {
  const { root, repo } = tmpRepo(t);
  const target = path.join(repo, 'docs/agents/roles.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const originalBody = '\n# 角色\n';
  const editedBody = '\n# 角色（用户手改）\n';
  fs.writeFileSync(target, markdownFile('agent-roles', editedBody, fpOf(originalBody)));

  const { res: snap, baseline } = snapshot(repo, root, ['docs/agents/roles.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const bytes = fs.readFileSync(target);

  const template = `${HDR('agent-roles', '__FP__')}\n${originalBody}${END('agent-roles')}\n`;
  const spec = writeSpec(root, { path: 'docs/agents/roles.md', block: 'agent-roles', template, replacements: {} });
  const res = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(res.status, EXIT.BLOCK, `expected drift block, got ${res.status}: ${res.stderr}`);
  assert.ok(fs.readFileSync(target).equals(bytes), 'drift block must not write');
});

test('approved candidate choice may resolve a body conflict; wrong approval never writes', (t) => {
  const { root, repo } = tmpRepo(t);
  const target = path.join(repo, 'CLAUDE.md');
  const originalBody = '\n## 指针\n';
  const editedBody = '\n## 指针（用户手改）\n';
  const prefix = Buffer.from('# 前缀 CRLF\r\n', 'utf8');
  fs.writeFileSync(target, Buffer.concat([prefix, markdownFile('resident-discipline', editedBody, fpOf(originalBody), '\r\n')]));
  const beforeOutside = fs.readFileSync(target).subarray(0, prefix.length);

  const { res: snap, baseline } = snapshot(repo, root, ['CLAUDE.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const currentSha = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');

  const template = `${HDR('resident-discipline', '__FP__')}\n${originalBody}${END('resident-discipline')}\n`;

  // Wrong approval hash: must block with zero writes.
  const wrongSpec = writeSpec(root, {
    path: 'CLAUDE.md', block: 'resident-discipline', template, replacements: {},
    approvedConflictSha256: 'f'.repeat(64)
  });
  const bytesBefore = fs.readFileSync(target);
  const wrong = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', wrongSpec]);
  assert.equal(wrong.status, EXIT.BLOCK, `wrong approval must block, got ${wrong.status}`);
  assert.ok(fs.readFileSync(target).equals(bytesBefore), 'wrong approval must not write');

  // A malformed approval value is a usage error, not a silent default.
  const badSpec = writeSpec(root, { path: 'CLAUDE.md', block: 'resident-discipline', template, replacements: {}, approvedConflictSha256: 'nope' });
  assert.equal(run(['write', '--cwd', repo, '--baseline', baseline, '--spec', badSpec]).status, EXIT.USAGE);

  // Exact approval bound to the current bytes: replaces the body, preserves outside, verifies.
  const okSpec = writeSpec(root, {
    path: 'CLAUDE.md', block: 'resident-discipline', template, replacements: {},
    approvedConflictSha256: currentSha
  });
  const approved = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', okSpec]);
  assert.equal(approved.status, EXIT.OK, approved.stderr);
  assert.match(approved.stdout, /resolve-conflict/);
  const after = fs.readFileSync(target);
  assert.ok(after.subarray(0, prefix.length).equals(beforeOutside), 'approved resolution must preserve original outside bytes');
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  // Replaying the same approval after a successful rewrite is now stale.
  const replay = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', okSpec]);
  assert.equal(replay.status, EXIT.BLOCK, `stale approval must block, got ${replay.status}`);
});

// ---------------------------------------------------------------------------
// Stale/concurrent drift: zero writes, baseline untouched
// ---------------------------------------------------------------------------
test('stale external drift blocks write with zero writes', (t) => {
  const { root, repo } = tmpRepo(t);
  const target = path.join(repo, 'CODING_STANDARDS.md');
  const body = '\n# 内容\n';
  fs.writeFileSync(target, markdownFile('coding-standards', body));

  const { res: snap, baseline } = snapshot(repo, root, ['CODING_STANDARDS.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const baselineBefore = fs.readFileSync(baseline);

  fs.appendFileSync(target, '外部并发追加\n');
  const bytes = fs.readFileSync(target);

  const template = `${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n`;
  const spec = writeSpec(root, { path: 'CODING_STANDARDS.md', block: 'coding-standards', template, replacements: {} });
  const res = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(res.status, EXIT.STALE, `expected stale drift, got ${res.status}: ${res.stderr}`);
  assert.ok(fs.readFileSync(target).equals(bytes), 'stale drift must not write');
  assert.ok(fs.readFileSync(baseline).equals(baselineBefore), 'baseline must not absorb external changes');
});

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------
test('path escapes, link components, and in-repo baseline outputs are refused', (t) => {
  const { root, repo } = tmpRepo(t);
  fs.writeFileSync(path.join(root, 'outside.md'), '# outside\n');

  const escape = snapshot(repo, root, ['../outside.md']);
  assert.equal(escape.res.status, EXIT.UNSAFE, `path escape must be refused, got ${escape.res.status}`);
  assert.equal(fs.existsSync(escape.baseline), false, 'refused snapshot must not write a baseline');

  const inRepo = snapshot(repo, root, ['AGENTS.md'], ['--out', path.join(repo, 'baseline.json')]);
  assert.equal(inRepo.res.status, EXIT.UNSAFE, `in-repo baseline must be refused, got ${inRepo.res.status}`);
  assert.equal(fs.existsSync(path.join(repo, 'baseline.json')), false);

  // Junction component pointing outside the root.
  const outsideDir = path.join(root, 'outside-dir');
  fs.mkdirSync(outsideDir, { recursive: true });
  const linkPath = path.join(repo, 'linked');
  try {
    fs.symlinkSync(outsideDir, linkPath, 'junction');
  } catch {
    t.skip('junction creation unavailable');
    return;
  }
  const linked = snapshot(repo, root, ['linked/evil.md']);
  assert.equal(linked.res.status, EXIT.UNSAFE, `link component must be refused, got ${linked.res.status}`);
});

// ---------------------------------------------------------------------------
// Fail-closed malformed blocks
// ---------------------------------------------------------------------------
test('duplicate, broken, wrong-name and unverifiable blocks fail closed', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 内容\n';
  const pair = markdownFile('coding-standards', body).toString('utf8');

  const dupRepo = tmpRepo(t).repo;
  fs.writeFileSync(path.join(dupRepo, 'CODING_STANDARDS.md'), pair + pair);
  const dupSnap = snapshot(dupRepo, root, ['CODING_STANDARDS.md']);
  assert.equal(dupSnap.res.status, EXIT.OK, dupSnap.res.stderr);
  assert.equal(run(['verify', '--cwd', dupRepo, '--baseline', dupSnap.baseline]).status, EXIT.BLOCK);

  const brokenRepo = tmpRepo(t).repo;
  fs.writeFileSync(path.join(brokenRepo, 'CODING_STANDARDS.md'), `${HDR('coding-standards', fpOf(body))}\n${body}`);
  const brokenSnap = snapshot(brokenRepo, root, ['CODING_STANDARDS.md']);
  assert.equal(brokenSnap.res.status, EXIT.OK, brokenSnap.res.stderr);
  assert.equal(run(['verify', '--cwd', brokenRepo, '--baseline', brokenSnap.baseline]).status, EXIT.BLOCK);

  // wrong block name in spec
  const wrongRepo = tmpRepo(t).repo;
  fs.writeFileSync(path.join(wrongRepo, 'CODING_STANDARDS.md'), markdownFile('coding-standards', body));
  const wrongSnap = snapshot(wrongRepo, root, ['CODING_STANDARDS.md']);
  const wrongSpec = writeSpec(root, {
    path: 'CODING_STANDARDS.md',
    block: 'release-discipline',
    template: `${HDR('release-discipline', '__FP__')}\n${body}${END('release-discipline')}\n`,
    replacements: {}
  });
  const wrong = run(['write', '--cwd', wrongRepo, '--baseline', wrongSnap.baseline, '--spec', wrongSpec]);
  assert.equal(wrong.status, EXIT.BLOCK, `wrong block name must fail closed, got ${wrong.status}`);

  // unverifiable malformed header (no fp value at all) -> PAUSE
  const pauseRepo = tmpRepo(t).repo;
  fs.writeFileSync(
    path.join(pauseRepo, 'CODING_STANDARDS.md'),
    `<!-- lazypack:start block=coding-standards src=DECISIONS.md@0.7.0 gen=0123456789abcdef input=fedcba9876543210 -->\n${body}${END('coding-standards')}\n`
  );
  const pauseSnap = snapshot(pauseRepo, root, ['CODING_STANDARDS.md']);
  const pauseSpec = writeSpec(root, {
    path: 'CODING_STANDARDS.md',
    block: 'coding-standards',
    template: `${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n`,
    replacements: {}
  });
  const paused = run(['write', '--cwd', pauseRepo, '--baseline', pauseSnap.baseline, '--spec', pauseSpec]);
  assert.equal(paused.status, EXIT.PAUSE, `unverifiable header must pause, got ${paused.status}`);

  // verifiable malformed header (extra attr, valid fp matching body) -> repairable
  const repairRepo = tmpRepo(t).repo;
  fs.writeFileSync(
    path.join(repairRepo, 'CODING_STANDARDS.md'),
    `<!-- lazypack:start block=coding-standards src=DECISIONS.md@0.7.0 gen=0123456789abcdef input=fedcba9876543210 fp=${fpOf(body)} note=legacy -->\n${body}${END('coding-standards')}\n`
  );
  const repairSnap = snapshot(repairRepo, root, ['CODING_STANDARDS.md']);
  const repairSpec = writeSpec(root, {
    path: 'CODING_STANDARDS.md',
    block: 'coding-standards',
    template: `${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n`,
    replacements: {}
  });
  const repaired = run(['write', '--cwd', repairRepo, '--baseline', repairSnap.baseline, '--spec', repairSpec]);
  assert.equal(repaired.status, EXIT.OK, `verifiable header repair must succeed: ${repaired.stderr}`);
  assert.equal(run(['verify', '--cwd', repairRepo, '--baseline', repairSnap.baseline]).status, EXIT.OK);
});

// ---------------------------------------------------------------------------
// New artifacts
// ---------------------------------------------------------------------------
test('new artifact is created with a valid block and verifies', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 发版\n';
  const template = `<!-- lazypack:start block=release-discipline src=DECISIONS.md@0.7.0 gen=0123456789abcdef input=fedcba9876543210 fp=__FP__ -->\n${body}${END('release-discipline')}\n`;
  const spec = writeSpec(root, { path: 'RELEASE.md', block: 'release-discipline', template, replacements: {} });

  const { res: snap, baseline } = snapshot(repo, root, ['RELEASE.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const res = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(res.status, EXIT.OK, res.stderr);
  const out = fs.readFileSync(path.join(repo, 'RELEASE.md'), 'utf8');
  assert.match(out, /fp=[0-9a-f]{16} -->/);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);
});

// ---------------------------------------------------------------------------
// Retention rendering
// ---------------------------------------------------------------------------
function retentionPolicy(dimensions, mode, overrides = {}) {
  const paths = { ideas: '', minutes: '', raw_qa: '' };
  const visibility = { ideas: 'none', minutes: 'none', raw_qa: 'none' };
  if (dimensions.includes('ideas')) { paths.ideas = 'docs/ideas/inbox.md'; visibility.ideas = 'private-repo'; }
  if (dimensions.includes('minutes')) { paths.minutes = 'docs/interviews'; visibility.minutes = 'public-repo'; }
  if (dimensions.includes('raw_qa')) { paths.raw_qa = 'vault:raw-qa'; visibility.raw_qa = 'private-storage'; }
  return { dimensions, mode, paths, visibility, retentionSrc: '0123456789abcdef', ...overrides, ...(overrides.paths ? { paths: { ...paths, ...overrides.paths } } : {}), ...(overrides.visibility ? { visibility: { ...visibility, ...overrides.visibility } } : {}) };
}

test('render-retention covers all dimension subsets deterministically', (t) => {
  const { root } = tmpRepo(t);
  const cases = [
    { dimensions: [], mode: 'decisions-only' },
    { dimensions: ['ideas'], mode: 'ideas-pool' },
    { dimensions: ['minutes'], mode: 'minutes-only' },
    { dimensions: ['raw_qa'], mode: 'raw-qa' },
    { dimensions: ['ideas', 'minutes'], mode: 'hybrid' },
    { dimensions: ['ideas', 'raw_qa'], mode: 'hybrid' },
    { dimensions: ['minutes', 'raw_qa'], mode: 'hybrid' },
    { dimensions: ['ideas', 'minutes', 'raw_qa'], mode: 'hybrid' },
    { dimensions: [], mode: 'unconfigured' }
  ];
  for (const [index, c] of cases.entries()) {
    const policyPath = writeJson(path.join(root, `policy-${index}.json`), retentionPolicy(c.dimensions, c.mode));
    const first = run(['render-retention', '--retention-json', policyPath]);
    const second = run(['render-retention', '--retention-json', policyPath]);
    assert.equal(first.status, EXIT.OK, `case ${JSON.stringify(c)}: ${first.stderr}`);
    assert.equal(first.stdout, second.stdout, 'render must be deterministic');
    assert.match(first.stdout, new RegExp('`' + c.mode + '`'), 'mode label missing');
    assert.doesNotMatch(first.stdout, /__[A-Z][A-Z0-9_]*__/, 'unsubstituted placeholder leaked');
    if (c.dimensions.includes('ideas')) assert.match(first.stdout, /docs\/ideas\/inbox\.md/);
    if (c.dimensions.includes('minutes')) assert.match(first.stdout, /docs\/interviews/);
    if (c.dimensions.includes('raw_qa')) assert.match(first.stdout, /vault:raw-qa/);
  }
});

test('render-retention rejects pending, inconsistent modes and unsafe paths', (t) => {
  const { root } = tmpRepo(t);
  const pending = writeJson(path.join(root, 'pending.json'), retentionPolicy([], 'pending'));
  assert.notEqual(run(['render-retention', '--retention-json', pending]).status, EXIT.OK);

  const mismatch = writeJson(path.join(root, 'mismatch.json'), retentionPolicy(['ideas'], 'hybrid'));
  assert.notEqual(run(['render-retention', '--retention-json', mismatch]).status, EXIT.OK);

  const unsafePath = writeJson(path.join(root, 'unsafe.json'), retentionPolicy(['ideas'], 'ideas-pool', { paths: { ideas: '../escape.md' } }));
  assert.notEqual(run(['render-retention', '--retention-json', unsafePath]).status, EXIT.OK);

  const unsafeRaw = writeJson(path.join(root, 'unsafe-raw.json'), retentionPolicy(['raw_qa'], 'raw-qa', { visibility: { raw_qa: 'public-repo' } }));
  assert.notEqual(run(['render-retention', '--retention-json', unsafeRaw]).status, EXIT.OK);

  // no writes to repo, and reference file untouched
  const refBefore = fs.readFileSync(RETENTION_REF);
  assert.ok(fs.readFileSync(RETENTION_REF).equals(refBefore));
});

// ---------------------------------------------------------------------------
// verify: block validation applies even when bytes are unchanged
// ---------------------------------------------------------------------------
test('verify validates untouched managed blocks, but tolerates untouched unmarked files', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 内容\n';
  fs.writeFileSync(path.join(repo, 'CODING_STANDARDS.md'), markdownFile('coding-standards', body));
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# 未标记人工文件\n');

  const { res: snap, baseline } = snapshot(repo, root, ['CODING_STANDARDS.md', 'AGENTS.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  // Tamper only the managed file's body without updating fp: unchanged bytes would be fine,
  // changed bytes must fail both the hash and block checks.
  fs.writeFileSync(path.join(repo, 'CODING_STANDARDS.md'), markdownFile('coding-standards', '\n# 篡改\n'));
  assert.notEqual(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);
});

// ---------------------------------------------------------------------------
// Shell markers: real pre-commit.sh template + immutable hook oracle
// ---------------------------------------------------------------------------
test('native shell hook renders, verifies, and matches the immutable inspectHookBytes oracle', (t) => {
  const { root, repo } = tmpRepo(t);
  const template = fs.readFileSync(HOOK_TEMPLATE, 'utf8');
  const replacements = {
    __GEN__: '0123456789abcdef',
    __INPUT__: 'fedcba9876543210',
    __PRESET_PROVENANCE_LINE__: '# no preset selected',
    __FORMAT_STATUS__: 'missing',
    __FORMAT_CMD__: '',
    __LINT_STATUS__: 'missing',
    __LINT_CMD__: '',
    __TYPE_STATUS__: 'missing',
    __TYPE_CMD__: '',
    __TEST_STATUS__: 'missing',
    __TEST_CMD__: ''
  };
  const spec = writeSpec(root, { path: '.githooks/pre-commit', block: 'pre-commit-hook', template, replacements });

  const { res: snap, baseline } = snapshot(repo, root, ['.githooks/pre-commit']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const res = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(res.status, EXIT.OK, res.stderr);

  const bytes = fs.readFileSync(path.join(repo, '.githooks/pre-commit'));
  assert.ok(bytes.subarray(0, 10).equals(Buffer.from('#!/bin/sh\n')), 'template shebang must be retained');
  assert.equal(bytes.includes(0x0d), false, 'new hook must be LF-only');
  const oracle = inspectHookBytes(bytes, 'new');
  assert.equal(oracle.ok, true, `hook oracle rejected rendered hook: ${oracle.code} ${oracle.description}`);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  // Shell markers must also be recognised as "managed" (not appended/duplicated).
  const before = fs.readFileSync(path.join(repo, '.githooks/pre-commit'));
  const again = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(again.status, EXIT.OK, again.stderr);
  assert.ok(fs.readFileSync(path.join(repo, '.githooks/pre-commit')).equals(before), 'shell block must not be re-appended');
});

// ---------------------------------------------------------------------------
// BOM handling
// ---------------------------------------------------------------------------
test('a BOM directly before the first marker is preserved as unmanaged prefix, never emitted for new files', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 内容\n';
  const target = path.join(repo, 'RELEASE.md');
  const withBom = Buffer.concat([BOM_BYTES, Buffer.from(markdownFile('release-discipline', body).toString('utf8'), 'utf8')]);
  fs.writeFileSync(target, withBom);

  const { res: snap, baseline } = snapshot(repo, root, ['RELEASE.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK, 'BOM + first-line marker must verify');

  const template = `${HDR('release-discipline', '__FP__')}\n${body}${END('release-discipline')}\n`;
  const spec = writeSpec(root, { path: 'RELEASE.md', block: 'release-discipline', template, replacements: {} });
  const rewritten = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(rewritten.status, EXIT.OK, rewritten.stderr);
  assert.equal(rewritten.status, EXIT.OK);
  const out = fs.readFileSync(target);
  assert.ok(out.subarray(0, 3).equals(BOM_BYTES), 'existing file BOM must be preserved outside the block');
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  // A new file must never inherit a BOM from its template.
  const newTemplate = `${'\uFEFF'}${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n`;
  const newSpec = writeSpec(root, { path: 'CODING_STANDARDS.md', block: 'coding-standards', template: newTemplate, replacements: {} });
  const newSnap = snapshot(repo, root, ['CODING_STANDARDS.md', 'RELEASE.md']);
  assert.equal(newSnap.res.status, EXIT.OK, newSnap.res.stderr);
  assert.equal(run(['write', '--cwd', repo, '--baseline', newSnap.baseline, '--spec', newSpec]).status, EXIT.OK);
  const created = fs.readFileSync(path.join(repo, 'CODING_STANDARDS.md'));
  assert.equal(startsWithBom(created), false, 'new files must not start with a BOM');
});

// ---------------------------------------------------------------------------
// New nested artifact with initially absent parent directories
// ---------------------------------------------------------------------------
test('new nested artifact creates missing parents and verifies', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 角色\n';
  const template = `${HDR('agent-roles', '__FP__')}\n${body}${END('agent-roles')}\n`;
  const spec = writeSpec(root, { path: 'docs/agents/roles.md', block: 'agent-roles', template, replacements: {} });

  const { res: snap, baseline } = snapshot(repo, root, ['docs/agents/roles.md']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  const res = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(res.status, EXIT.OK, res.stderr);
  assert.equal(fs.existsSync(path.join(repo, 'docs/agents/roles.md')), true);
  assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);

  // A second write against the tracked current bytes is allowed (not treated as original absence).
  const again = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
  assert.equal(again.status, EXIT.OK, again.stderr);
});

// ---------------------------------------------------------------------------
// Writer-side marker integrity
// ---------------------------------------------------------------------------
test('writer refuses mismatched marker names/styles and duplicate markers', (t) => {
  const { root, repo } = tmpRepo(t);
  const body = '\n# 内容\n';
  const target = path.join(repo, 'CODING_STANDARDS.md');

  // start says coding-standards (valid fp); end says a different block name.
  fs.writeFileSync(
    target,
    `${HDR('coding-standards', fpOf(body))}\n${body}<!-- lazypack:end block=other-block -->\n`
  );
  const mismatchSnap = snapshot(repo, root, ['CODING_STANDARDS.md']);
  assert.equal(mismatchSnap.res.status, EXIT.OK, mismatchSnap.res.stderr);
  const bytes = fs.readFileSync(target);
  const template = `${HDR('coding-standards', '__FP__')}\n${body}${END('coding-standards')}\n`;
  const spec = writeSpec(root, { path: 'CODING_STANDARDS.md', block: 'coding-standards', template, replacements: {} });
  const mismatched = run(['write', '--cwd', repo, '--baseline', mismatchSnap.baseline, '--spec', spec]);
  assert.ok([EXIT.PAUSE, EXIT.BLOCK].includes(mismatched.status), `mismatched markers must not be repaired, got ${mismatched.status}`);
  assert.ok(fs.readFileSync(target).equals(bytes), 'mismatched markers must be left untouched');

  // duplicate markers -> explicit BLOCK on the write path
  const dup = tmpRepo(t);
  const dupBody = markdownFile('coding-standards', body).toString('utf8');
  fs.writeFileSync(path.join(dup.repo, 'CODING_STANDARDS.md'), dupBody + dupBody);
  const dupSnap = snapshot(dup.repo, dup.root, ['CODING_STANDARDS.md']);
  const dupSpec = writeSpec(dup.root, { path: 'CODING_STANDARDS.md', block: 'coding-standards', template, replacements: {} });
  const duplicated = run(['write', '--cwd', dup.repo, '--baseline', dupSnap.baseline, '--spec', dupSpec]);
  assert.equal(duplicated.status, EXIT.BLOCK, `duplicate markers must fail closed, got ${duplicated.status}`);
});

// ---------------------------------------------------------------------------
// Follow-up (PR93 bot review): own-temp cleanup, live-mode rewrites, bounded
// retention fence extraction. Fault injection runs the real CLI under a native
// `--import` preload that monkeypatches `node:fs` for the helper's OWN temp only.
// ---------------------------------------------------------------------------
const PRELOAD_SOURCE = `
import fs from 'node:fs';
import path from 'node:path';

const realOpenSync = fs.openSync;
const realWriteFileSync = fs.writeFileSync;
const realRenameSync = fs.renameSync;
const realChmodSync = fs.chmodSync;
const realLstatSync = fs.lstatSync;
const fdPaths = new Map();

const op = process.env.LAZYPACK_FAULT_OP || '';
const match = process.env.LAZYPACK_FAULT_MATCH || '';
const logPath = process.env.LAZYPACK_FAULT_LOG || '';
const collideMatch = process.env.LAZYPACK_COLLIDE_MATCH || '';
const collideBytes = process.env.LAZYPACK_COLLIDE_BYTES || '';
const ownTemp = (p) => typeof p === 'string' && path.basename(p).endsWith('.tmp') && (match === '' || p.includes(match));
const record = (entry) => { if (logPath) fs.appendFileSync(logPath, JSON.stringify(entry) + '\\n'); };

fs.openSync = (p, flag, ...rest) => {
  if (collideMatch && typeof p === 'string' && p.includes(collideMatch) && String(flag).includes('x')) {
    realWriteFileSync(p, collideBytes);
    record({ collide: p });
  }
  const fd = realOpenSync(p, flag, ...rest);
  if (typeof p === 'string') fdPaths.set(fd, p);
  return fd;
};
fs.writeFileSync = (target, ...rest) => {
  const p = typeof target === 'number' ? fdPaths.get(target) : target;
  if (op === 'writeFileSync' && ownTemp(p)) {
    record({ fault: 'writeFileSync', path: p });
    throw new Error('injected writeFileSync failure');
  }
  return realWriteFileSync(target, ...rest);
};
fs.chmodSync = (p, mode, ...rest) => {
  if (ownTemp(p)) {
    if (op === 'chmodSync') {
      record({ fault: 'chmodSync', path: p, mode: mode & 0o777 });
      throw new Error('injected chmodSync failure');
    }
    record({ chmod: p, mode: mode & 0o777 });
  }
  return realChmodSync(p, mode, ...rest);
};
fs.renameSync = (from, to, ...rest) => {
  if (op === 'renameSync' && ownTemp(from)) {
    record({ fault: 'renameSync', from, to });
    throw new Error('injected renameSync failure');
  }
  return realRenameSync(from, to, ...rest);
};

const forced = process.env.LAZYPACK_LSTAT_FORCE ? JSON.parse(process.env.LAZYPACK_LSTAT_FORCE) : null;
if (forced) {
  fs.lstatSync = (p, ...rest) => {
    const st = realLstatSync(p, ...rest);
    if (st && path.resolve(String(p)) === forced.path) {
      const patched = Object.create(st);
      patched.mode = forced.mode;
      return patched;
    }
    return st;
  };
}
`;

function writePreload(dir, source) {
  const file = path.join(dir, `preload-${crypto.randomBytes(4).toString('hex')}.mjs`);
  fs.writeFileSync(file, source);
  return file;
}

function runPreload({ cli = CLI, args, preload, env = {} }) {
  return spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

function findTemps(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith('.tmp')) found.push(abs);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found;
}

function logEntries(logFile) {
  return fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const oct = (mode) => `0o${(mode ?? 0).toString(8)}`;
function recordedTempMode(logFile) {
  const entries = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const hit = entries.find((entry) => typeof entry.chmod === 'string' && path.basename(entry.chmod).endsWith('.tmp'));
  return hit?.mode;
}

function copyRetentionLayout(root) {
  const layout = path.join(root, 'layout');
  fs.mkdirSync(path.join(layout, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(layout, 'references'), { recursive: true });
  const cli = path.join(layout, 'scripts', 'managed_blocks.mjs');
  const ref = path.join(layout, 'references', 'retention-sections.md');
  fs.copyFileSync(CLI, cli);
  fs.copyFileSync(RETENTION_REF, ref);
  return { layout, cli, ref };
}

test('atomicReplace deletes its own temp on write/rename/chmod failure, target+baseline untouched', (t) => {
  for (const op of ['writeFileSync', 'renameSync', 'chmodSync']) {
    const { root, repo } = tmpRepo(t);
    const target = path.join(repo, 'docs/notes.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const original = markdownFile('notes-block', '\n# 原始\n');
    fs.writeFileSync(target, original);
    const { res: snap, baseline } = snapshot(repo, root, ['docs/notes.md']);
    assert.equal(snap.status, EXIT.OK, snap.stderr);
    const baselineBefore = fs.readFileSync(baseline);

    const body = `\n# 原始\n\n更新 ${op}\n`;
    const template = `${HDR('notes-block', '__FP__')}\n${body}${END('notes-block')}\n`;
    const spec = writeSpec(root, { path: 'docs/notes.md', block: 'notes-block', template, replacements: {} });
    const preload = writePreload(root, PRELOAD_SOURCE);
    const faultLog = path.join(root, `fault-${op}.log`);

    const faulted = runPreload({
      args: ['write', '--cwd', repo, '--baseline', baseline, '--spec', spec],
      preload,
      env: { LAZYPACK_FAULT_OP: op, LAZYPACK_FAULT_LOG: faultLog }
    });
    assert.notEqual(faulted.status, EXIT.OK, `${op}: injected failure must fail the write, got ${faulted.status}: ${faulted.stderr}`);
    assert.match(fs.readFileSync(faultLog, 'utf8'), /"fault"/, `${op}: injection did not fire on the helper temp`);
    assert.ok(fs.readFileSync(target).equals(original), `${op}: target bytes changed on a pre-target failure`);
    assert.ok(fs.readFileSync(baseline).equals(baselineBefore), `${op}: baseline changed on a pre-target failure`);
    assert.deepEqual(findTemps(root), [], `${op}: helper left an orphan temp`);

    const recovered = run(['write', '--cwd', repo, '--baseline', baseline, '--spec', spec]);
    assert.equal(recovered.status, EXIT.OK, `${op}: recovery write failed: ${recovered.stderr}`);
    assert.deepEqual(findTemps(root), [], `${op}: recovery left a temp`);
    assert.equal(run(['verify', '--cwd', repo, '--baseline', baseline]).status, EXIT.OK);
  }
});

test('writeJsonAtomic deletes its own baseline temp on write/rename failure, baseline never rewritten', (t) => {
  for (const op of ['writeFileSync', 'renameSync']) {
    const { root, repo } = tmpRepo(t);
    const target = path.join(repo, 'docs/notes.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, markdownFile('notes-block', '\n# 原始\n'));
    const { res: snap, baseline } = snapshot(repo, root, ['docs/notes.md']);
    assert.equal(snap.status, EXIT.OK, snap.stderr);
    const baselineBefore = fs.readFileSync(baseline);

    const body = `\n# 原始\n\n基线 ${op}\n`;
    const template = `${HDR('notes-block', '__FP__')}\n${body}${END('notes-block')}\n`;
    const spec = writeSpec(root, { path: 'docs/notes.md', block: 'notes-block', template, replacements: {} });
    const preload = writePreload(root, PRELOAD_SOURCE);
    const faultLog = path.join(root, `baseline-fault-${op}.log`);

    const faulted = runPreload({
      args: ['write', '--cwd', repo, '--baseline', baseline, '--spec', spec],
      preload,
      env: { LAZYPACK_FAULT_OP: op, LAZYPACK_FAULT_MATCH: baseline, LAZYPACK_FAULT_LOG: faultLog }
    });
    assert.notEqual(faulted.status, EXIT.OK, `${op}: injected baseline failure must fail the write`);
    assert.match(fs.readFileSync(faultLog, 'utf8'), /"fault"/, `${op}: injection did not fire on the baseline temp`);
    assert.ok(fs.readFileSync(baseline).equals(baselineBefore), `${op}: baseline bytes changed although the atomic rename failed`);
    assert.deepEqual(findTemps(root), [], `${op}: helper left an orphan baseline temp`);
  }
});

test('a pre-existing foreign temp is never overwritten or unlinked (EEXIST stays owned by its creator)', (t) => {
  const FOREIGN = 'foreign-temp-payload\n';

  // (a) target rewrite: atomicReplace's exclusive open collides; the foreign temp must survive.
  {
    const { root, repo } = tmpRepo(t);
    const target = path.join(repo, 'docs/notes.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const original = markdownFile('notes-block', '\n# 原始\n');
    fs.writeFileSync(target, original);
    const { res: snap, baseline } = snapshot(repo, root, ['docs/notes.md']);
    assert.equal(snap.status, EXIT.OK, snap.stderr);
    const spec = writeSpec(root, { path: 'docs/notes.md', block: 'notes-block', template: `${HDR('notes-block', '__FP__')}\n\n# 变更\n${END('notes-block')}\n`, replacements: {} });
    const preload = writePreload(root, PRELOAD_SOURCE);
    const log = path.join(root, 'collide-target.log');
    const faulted = runPreload({
      args: ['write', '--cwd', repo, '--baseline', baseline, '--spec', spec],
      preload,
      env: { LAZYPACK_COLLIDE_MATCH: '.lazypack-', LAZYPACK_COLLIDE_BYTES: FOREIGN, LAZYPACK_FAULT_LOG: log }
    });
    assert.notEqual(faulted.status, EXIT.OK, `target collision must fail the write, got ${faulted.status}: ${faulted.stderr}`);
    const collided = logEntries(log).find((entry) => entry.collide)?.collide;
    assert.ok(collided, 'preload must have created the colliding target temp');
    assert.equal(fs.readFileSync(collided, 'utf8'), FOREIGN, 'atomicReplace touched a temp it did not create');
    assert.ok(fs.readFileSync(target).equals(original), 'target bytes changed on an EEXIST failure');
    fs.unlinkSync(collided);
    assert.deepEqual(findTemps(root), [], 'no other target temp may be left behind');
  }

  // (b) baseline write: writeJsonAtomic must exclusive-create, never overwrite the foreign temp.
  {
    const { root, repo } = tmpRepo(t);
    const target = path.join(repo, 'docs/notes.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, markdownFile('notes-block', '\n# 原始\n'));
    const { res: snap, baseline } = snapshot(repo, root, ['docs/notes.md']);
    assert.equal(snap.status, EXIT.OK, snap.stderr);
    const baselineBefore = fs.readFileSync(baseline);
    const spec = writeSpec(root, { path: 'docs/notes.md', block: 'notes-block', template: `${HDR('notes-block', '__FP__')}\n\n# 变更\n${END('notes-block')}\n`, replacements: {} });
    const preload = writePreload(root, PRELOAD_SOURCE);
    const log = path.join(root, 'collide-baseline.log');
    const faulted = runPreload({
      args: ['write', '--cwd', repo, '--baseline', baseline, '--spec', spec],
      preload,
      env: { LAZYPACK_COLLIDE_MATCH: baseline, LAZYPACK_COLLIDE_BYTES: FOREIGN, LAZYPACK_FAULT_LOG: log }
    });
    assert.notEqual(faulted.status, EXIT.OK, `baseline collision must fail the write, got ${faulted.status}: ${faulted.stderr}`);
    const collided = logEntries(log).find((entry) => entry.collide)?.collide;
    assert.ok(collided, 'preload must have created the colliding baseline temp');
    assert.equal(fs.readFileSync(collided, 'utf8'), FOREIGN, 'writeJsonAtomic clobbered or removed a temp it did not create');
    assert.ok(fs.readFileSync(baseline).equals(baselineBefore), 'baseline bytes changed');
    fs.unlinkSync(collided);
    assert.deepEqual(findTemps(root), [], 'no other baseline temp may be left behind');
  }
});

test('rewrites inherit the live target mode, never the snapshot default (Windows POSIX-mode simulation)', (t) => {
  const { root, repo } = tmpRepo(t);
  const mkTemplate = (body) => `${HDR('hook-block', '__FP__')}\n${body}${END('hook-block')}\n`;
  const preload = writePreload(root, PRELOAD_SOURCE);

  // (a) file this helper just created, then authorised chmod +x, then a metadata rewrite.
  // Windows cannot set real executable bits, so the second write SIMULATES a live 0755
  // stat through the preload; this asserts the mode SOURCE, not real POSIX bits.
  const created = path.join(repo, 'scripts/hook.sh');
  fs.mkdirSync(path.dirname(created), { recursive: true });
  const snapA = snapshot(repo, root, ['scripts/hook.sh']);
  assert.equal(snapA.res.status, EXIT.OK, snapA.res.stderr);
  const firstA = run(['write', '--cwd', repo, '--baseline', snapA.baseline, '--spec', writeSpec(root, { path: 'scripts/hook.sh', block: 'hook-block', template: mkTemplate('\n# v1\n'), replacements: {} })]);
  assert.equal(firstA.status, EXIT.OK, firstA.stderr);
  const logA = path.join(root, 'chmod-created.log');
  const secondA = runPreload({
    args: ['write', '--cwd', repo, '--baseline', snapA.baseline, '--spec', writeSpec(root, { path: 'scripts/hook.sh', block: 'hook-block', template: mkTemplate('\n# v2\n'), replacements: {} })],
    preload,
    env: { LAZYPACK_LSTAT_FORCE: JSON.stringify({ path: created, mode: 0o100755 }), LAZYPACK_FAULT_LOG: logA }
  });
  assert.equal(secondA.status, EXIT.OK, secondA.stderr);
  const modeA = recordedTempMode(logA);
  assert.equal(modeA, 0o755, `created-then-chmod rewrite must chmod its temp to the live mode, got ${oct(modeA)}`);

  // (b) pre-existing file whose permissions changed after the snapshot: same live-mode rule.
  const existing = path.join(repo, 'scripts/existing.sh');
  fs.writeFileSync(existing, markdownFile('existing-block', '\n# e1\n'));
  const snapB = snapshot(repo, root, ['scripts/existing.sh']);
  assert.equal(snapB.res.status, EXIT.OK, snapB.res.stderr);
  const logB = path.join(root, 'chmod-existing.log');
  const third = runPreload({
    args: ['write', '--cwd', repo, '--baseline', snapB.baseline, '--spec', writeSpec(root, { path: 'scripts/existing.sh', block: 'existing-block', template: `${HDR('existing-block', '__FP__')}\n\n# e2\n${END('existing-block')}\n`, replacements: {} })],
    preload,
    env: { LAZYPACK_LSTAT_FORCE: JSON.stringify({ path: existing, mode: 0o100755 }), LAZYPACK_FAULT_LOG: logB }
  });
  assert.equal(third.status, EXIT.OK, third.stderr);
  const modeB = recordedTempMode(logB);
  assert.equal(modeB, 0o755, `post-snapshot chmod rewrite must chmod its temp to the live mode, got ${oct(modeB)}`);
  assert.deepEqual(findTemps(root), []);
});

test('POSIX only: a real post-snapshot chmod 0755 survives the rewrite', { skip: process.platform === 'win32' }, (t) => {
  const { root, repo } = tmpRepo(t);
  const target = path.join(repo, 'scripts/hook.sh');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const mkTemplate = (body) => `${HDR('hook-block', '__FP__')}\n${body}${END('hook-block')}\n`;
  const { res: snap, baseline } = snapshot(repo, root, ['scripts/hook.sh']);
  assert.equal(snap.status, EXIT.OK, snap.stderr);
  assert.equal(run(['write', '--cwd', repo, '--baseline', baseline, '--spec', writeSpec(root, { path: 'scripts/hook.sh', block: 'hook-block', template: mkTemplate('\n# v1\n'), replacements: {} })]).status, EXIT.OK);
  fs.chmodSync(target, 0o755);
  assert.equal(run(['write', '--cwd', repo, '--baseline', baseline, '--spec', writeSpec(root, { path: 'scripts/hook.sh', block: 'hook-block', template: mkTemplate('\n# v2\n'), replacements: {} })]).status, EXIT.OK);
  assert.equal(fs.statSync(target).mode & 0o777, 0o755);
});

test('render-retention reads a bounded section across inline and shorter fences', (t) => {
  const { root } = tmpRepo(t);
  const { cli, ref } = copyRetentionLayout(root);
  // The checkout ships the authority file with CRLF: normalize ONLY the copied fixture
  // text before editing it; the real authority bytes stay untouched.
  const authorityBefore = fs.readFileSync(RETENTION_REF);
  const text = fs.readFileSync(ref, 'utf8').replace(/\r\n/g, '\n');
  const startOfSection = text.indexOf('### 4.9 ');
  const openIndex = text.indexOf('```markdown', startOfSection);
  const closeIndex = text.indexOf('\n```\n', openIndex);
  assert.ok(startOfSection >= 0 && openIndex > startOfSection && closeIndex > openIndex, '4.9 fence layout must be found');
  const mutated = '````markdown\n'
    + '- **当前项目留存模式**：`unconfigured`（INLINE-SENTINEL ```inline span``` 与下方短围栏）\n'
    + '## 内嵌小节标题\n'
    + '### 内嵌说明\n'
    + '# 顶格注释\n'
    + '```\n'
    + '- **执行规范**：TAIL-SENTINEL 保底正文\n'
    + '````\n';
  fs.writeFileSync(ref, text.slice(0, openIndex) + mutated + text.slice(closeIndex + 5));

  const policy = writeJson(path.join(root, 'policy.json'), retentionPolicy([], 'unconfigured'));
  const res = run(['render-retention', '--retention-json', policy], cli);
  assert.equal(res.status, EXIT.OK, res.stderr);
  assert.match(res.stdout, /INLINE-SENTINEL/, 'inline sentinel lost');
  assert.match(res.stdout, /TAIL-SENTINEL/, 'body after a shorter inner fence was truncated');
  assert.match(res.stdout, /```inline span```/, 'inline triple-backtick run must survive extraction');
  assert.match(res.stdout, /^## 内嵌小节标题$/m, 'an emitted ## heading must stay inside the extracted body');
  assert.match(res.stdout, /^### 内嵌说明$/m, 'an emitted ### heading must stay inside the extracted body');
  assert.match(res.stdout, /^# 顶格注释$/m, 'an emitted # heading must stay inside the extracted body');
  assert.ok(fs.readFileSync(RETENTION_REF).equals(authorityBefore), 'real authority reference bytes must stay unchanged');
});

test('render-retention fails closed on a missing closing fence instead of consuming the next section', (t) => {
  const { root } = tmpRepo(t);
  const { cli, ref } = copyRetentionLayout(root);
  // The checkout ships the authority file with CRLF: normalize ONLY the copied fixture
  // text before editing it; the real authority bytes stay untouched.
  const authorityBefore = fs.readFileSync(RETENTION_REF);
  const text = fs.readFileSync(ref, 'utf8').replace(/\r\n/g, '\n');
  const needle = '- **防污染边界**：保持仓库精简，零额外资产负担；未成文讨论不作为现行基准。\n```\n';
  assert.ok(text.includes(needle), '4.1 closing fence must be found');
  fs.writeFileSync(ref, text.replace(needle, '- **防污染边界**：保持仓库精简，零额外资产负担；未成文讨论不作为现行基准。\n'));

  const policy = writeJson(path.join(root, 'policy.json'), retentionPolicy([], 'decisions-only'));
  const res = run(['render-retention', '--retention-json', policy], cli);
  assert.notEqual(res.status, EXIT.OK, 'a missing closing fence must fail closed');
  assert.doesNotMatch(res.stdout, /ideas-pool/, 'must not fall through into the following section');
  assert.ok(fs.readFileSync(RETENTION_REF).equals(authorityBefore), 'real authority reference bytes must stay unchanged');
});

test('render-retention fails closed when a section has no own fence instead of borrowing the next', (t) => {
  const { root } = tmpRepo(t);
  const { cli, ref } = copyRetentionLayout(root);
  // The checkout ships the authority file with CRLF: normalize ONLY the copied fixture
  // text before editing it; the real authority bytes stay untouched.
  const authorityBefore = fs.readFileSync(RETENTION_REF);
  const text = fs.readFileSync(ref, 'utf8').replace(/\r\n/g, '\n');
  const needle = '### 4.1 组合 1：仅留决议 (decisions-only, dimensions=[])\n\n适用于极简项目或用户明确选择不额外持久化过程材料的场景。\n\n```markdown\n';
  assert.ok(text.includes(needle), '4.1 opening fence must be found');
  fs.writeFileSync(ref, text.replace(needle, '### 4.1 组合 1：仅留决议 (decisions-only, dimensions=[])\n\n适用于极简项目或用户明确选择不额外持久化过程材料的场景。\n\n'));

  const policy = writeJson(path.join(root, 'policy.json'), retentionPolicy([], 'decisions-only'));
  const res = run(['render-retention', '--retention-json', policy], cli);
  assert.notEqual(res.status, EXIT.OK, 'a missing own fence must fail closed');
  assert.doesNotMatch(res.stdout, /ideas-pool/, 'must not borrow the following section fence');
  assert.ok(fs.readFileSync(RETENTION_REF).equals(authorityBefore), 'real authority reference bytes must stay unchanged');
});
