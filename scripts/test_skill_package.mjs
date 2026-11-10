/**
 * scripts/test_skill_package.mjs
 *
 * skills/lazypack-setup/scripts/package_manifest.mjs 的回归测试（#108）。
 * 每个用例把 skill 目录拷到临时位置再改动，验证包检查在「只有 skill 目录」时
 * 仍能通过，并且对清单漂移、断链、配方源路径缺失、裸写本仓路径都会失败。
 * 经 scripts/run_tests.mjs 随 .github/workflows/tests.yml 运行。
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SKILL = fileURLToPath(new URL('../skills/lazypack-setup', import.meta.url));

function copySkill(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-package-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'lazypack-setup');
  fs.cpSync(SKILL, root, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src),
  });
  return root;
}

function run(root, cmd = 'check') {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'package_manifest.mjs'), cmd], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function edit(root, rel, fn) {
  const file = path.join(root, rel);
  fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8')));
}

test('repository copy of the skill passes', () => {
  const r = run(SKILL);
  assert.equal(r.code, 0, r.out);
});

test('skill copied alone to a temp directory still passes', (t) => {
  const root = copySkill(t);
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /包检查通过/);
});

test('CRLF checkout of text files still matches the manifest', (t) => {
  const root = copySkill(t);
  edit(root, 'SKILL.md', (s) => s.replace(/\n/g, '\r\n'));
  const r = run(root);
  assert.equal(r.code, 0, r.out);
});

test('changing a file without regenerating the manifest fails', (t) => {
  const root = copySkill(t);
  edit(root, 'assets/mutation/config/crontab.example', (s) => `${s}# tampered\n`);
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[manifest\] 文件内容与清单不符：assets\/mutation\/config\/crontab\.example/);
});

test('deleting a file without regenerating the manifest fails', (t) => {
  const root = copySkill(t);
  fs.rmSync(path.join(root, 'assets/react-vite-app-shell-1/SHA256SUMS'));
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[manifest\] 清单记录的文件缺失：assets\/react-vite-app-shell-1\/SHA256SUMS/);
});

test('an unregistered extra file fails', (t) => {
  const root = copySkill(t);
  fs.writeFileSync(path.join(root, 'assets/extra.txt'), 'x\n');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /包内文件未登记到清单：assets\/extra\.txt/);
});

test('bumping a tool @version without regenerating fails', (t) => {
  const root = copySkill(t);
  edit(root, 'assets/mutation/scripts/mutation-baseline.mjs', (s) => s.replace('@version 1.0.0', '@version 1.1.0'));
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /工具脚本版本与清单不符/);
});

test('missing manifest fails', (t) => {
  const root = copySkill(t);
  fs.rmSync(path.join(root, 'MANIFEST.json'));
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /缺少 MANIFEST\.json/);
});

test('a broken relative link fails even after regenerating', (t) => {
  const root = copySkill(t);
  edit(root, 'SKILL.md', (s) => `${s}\n- [gone](presets/mutation-testing.md)\n`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[links\] SKILL\.md:\d+ 链接目标不存在：presets\/mutation-testing\.md/);
});

test('a link escaping the package fails', (t) => {
  const root = copySkill(t);
  edit(root, 'recipes/react-vite-app-shell.md', (s) => `${s}\n[v](../../../docs/VISION.md)\n`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[links\] recipes\/react-vite-app-shell\.md:\d+ 链接跳出 skill 包/);
});

test('links inside code spans and fences are ignored', (t) => {
  const root = copySkill(t);
  edit(root, 'SKILL.md', (s) => `${s}\n\`[x](nope.md)\`\n\n\`\`\`\n[y](nope.md)\n\`\`\`\n`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 0, r.out);
});

test('a recipe source path missing from the package fails', (t) => {
  const root = copySkill(t);
  fs.rmSync(path.join(root, 'assets/mutation/config/mutation-testing.timer'));
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[sources\] recipes\/mutation-testing\.md:\d+ 源路径在包内不存在：assets\/mutation\/config\/mutation-testing\.timer/);
});

test('a bare path into the maintainer repository fails', (t) => {
  const root = copySkill(t);
  edit(root, 'references/agent-pipeline-models.md', (s) => `${s}\n见 \`docs/quality-gates/mutation-testing.md\`。\n`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[external\] references\/agent-pipeline-models\.md:\d+ 指向本仓的路径须写明「lazypack-discipline 仓」/);
});

test('generate output is stable', (t) => {
  const root = copySkill(t);
  const before = fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8');
  run(root, 'generate');
  assert.equal(fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8'), before);
});

test('unknown command exits 2', () => {
  const r = run(SKILL, 'nope');
  assert.equal(r.code, 2, r.out);
});
