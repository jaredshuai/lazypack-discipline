/**
 * scripts/test_skill_package.mjs
 *
 * skills/lazypack-setup/scripts/package_manifest.mjs 的回归测试（#108）。
 * 每个用例把 skill 目录拷到临时位置再改动，验证包检查在「只有 skill 目录」时
 * 仍能通过，并且对清单漂移、断链、配方源路径缺失、裸写本仓路径、须保持 LF 的文件含 CR 都会失败。
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
  edit(root, 'SKILL.md', (s) => s.replace(/\r?\n/g, '\r\n'));
  const r = run(root);
  assert.equal(r.code, 0, r.out);
});

test('CRLF in a shell script fails the eol check even after regenerating', (t) => {
  const root = copySkill(t);
  edit(root, 'assets/mutation/scripts/nightly-mutation-runner.sh', (s) => s.replace(/\r?\n/g, '\r\n'));
  let r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL \[eol\] 须保持 LF 的文件含 CR：assets\/mutation\/scripts\/nightly-mutation-runner\.sh/);
  run(root, 'generate');
  r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[eol\] .*nightly-mutation-runner\.sh/);
});

test('CRLF in a file under assets/mutation/config/ fails the eol check', (t) => {
  const root = copySkill(t);
  edit(root, 'assets/mutation/config/crontab.example', (s) => s.replace(/\r?\n/g, '\r\n'));
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[eol\] 须保持 LF 的文件含 CR：assets\/mutation\/config\/crontab\.example/);
});

test('CRLF in Markdown still passes after regenerating', (t) => {
  const root = copySkill(t);
  edit(root, 'recipes/mutation-testing.md', (s) => s.replace(/\r?\n/g, '\r\n'));
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /\[eol\]/);
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

test('an assets path in a recipe fails even when the source table is not recognised', (t) => {
  const root = copySkill(t);
  edit(root, 'recipes/mutation-testing.md', (s) => s
    .replace('| 触发面 | 源模板 | 目标位置 |', '| 触发面 | 模板文件 | 目标位置 |')
    .replace('| `assets/mutation/config/crontab.example` |', '| `assets/mutation/config/crontab.missing` |'));
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[sources\] recipes\/mutation-testing\.md:\d+ 源路径在包内不存在：assets\/mutation\/config\/crontab\.missing/);
});

test('an assets path outside tables and lists is checked too', (t) => {
  const root = copySkill(t);
  edit(root, 'recipes/react-vite-app-shell.md', (s) => `${s}\n另见 \`assets/react-vite-app-shell-1/nope.txt\`。\n`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[sources\] recipes\/react-vite-app-shell\.md:\d+ 源路径在包内不存在：assets\/react-vite-app-shell-1\/nope\.txt/);
});

test('fences nested in lists or block quotes hide their content, and the closing fence is matched', (t) => {
  const root = copySkill(t);
  edit(root, 'recipes/react-vite-app-shell.md', (s) => `${s}
- 列表项

    \`\`\`
    [a](nope-a.md) \`assets/missing-a.txt\`
    \`\`\`

> \`\`\`
> [b](nope-b.md) \`assets/missing-b.txt\`
> \`\`\`

[after](nope-after.md)
`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /链接目标不存在：nope-after\.md/);
  assert.doesNotMatch(r.out, /nope-a\.md|nope-b\.md|missing-a|missing-b/);
});

test('an escaped backtick does not open an inline code span for assets paths', (t) => {
  const root = copySkill(t);
  edit(root, 'recipes/react-vite-app-shell.md', (s) => `${s}\n字面反引号 \\\`assets/missing-esc.txt\\\` 不是代码。\n`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 0, r.out);
});

test('a ./assets path in recipe prose is checked', (t) => {
  const root = copySkill(t);
  edit(root, 'recipes/react-vite-app-shell.md', (s) => `${s}\n另见 \`./assets/missing-dot.txt\`。\n`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[sources\] recipes\/react-vite-app-shell\.md:\d+ 源路径在包内不存在：\.\/assets\/missing-dot\.txt/);
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
  // CRLF 检出里已提交的清单是 CRLF，generate 总是写 LF；只规范化 before，输出按原样比较
  const before = fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8').replace(/\r\n/g, '\n');
  run(root, 'generate');
  assert.equal(fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8'), before);
});

test('unknown command or extra arguments exit 2', () => {
  assert.equal(run(SKILL, 'nope').code, 2);
  const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'package_manifest.mjs'), 'check', '--root', '/tmp'], { encoding: 'utf8' });
  assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
});

test('invoking the checker through a symlinked directory still runs the check', (t) => {
  const root = copySkill(t);
  fs.rmSync(path.join(root, 'assets/mutation/config/mutation-testing.timer'));
  const link = path.join(path.dirname(root), 'linked-skill');
  fs.symlinkSync(root, link, 'junction');
  const r = spawnSync(process.execPath, [path.join(link, 'scripts', 'package_manifest.mjs'), 'check'], { encoding: 'utf8' });
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(`${r.stdout}${r.stderr}`, /清单记录的文件缺失/);
});

test('a recipe source path that escapes the package fails even if it exists', (t) => {
  const root = copySkill(t);
  fs.writeFileSync(path.join(path.dirname(root), 'outside.txt'), 'x\n');
  edit(root, 'recipes/mutation-testing.md', (s) => s.replace(
    '| `assets/mutation/config/crontab.example` |',
    '| `../outside.txt` |',
  ));
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[sources\] recipes\/mutation-testing\.md:\d+ 源路径跳出 skill 包：\.\.\/outside\.txt/);
});

test('structurally malformed manifests fail without crashing', (t) => {
  for (const body of ['[]', '{"schema":"lazypack-skill-manifest/1","files":{},"tools":[]}', '{"schema":"lazypack-skill-manifest/1","files":[null],"tools":[]}', '{"schema":"lazypack-skill-manifest/1","files":[],"tools":"x"}']) {
    const root = copySkill(t);
    fs.writeFileSync(path.join(root, 'MANIFEST.json'), body);
    const r = run(root);
    assert.equal(r.code, 1, `${body}\n${r.out}`);
    assert.match(r.out, /FAIL \[manifest\]/);
    assert.doesNotMatch(r.out, /TypeError|at checkManifest/);
  }
});

test('reference-style links are resolved and labels must be defined', (t) => {
  const root = copySkill(t);
  edit(root, 'SKILL.md', (s) => `${s}\n见 [缺失][res]。\n\n[res]: presets/missing.md\n`);
  run(root, 'generate');
  let r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[links\] SKILL\.md:\d+ 链接目标不存在：presets\/missing\.md/);

  const root2 = copySkill(t);
  edit(root2, 'SKILL.md', (s) => `${s}\n见 [某处][nowhere]。\n`);
  run(root2, 'generate');
  r = run(root2);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /引用式链接的标签没有定义：\[nowhere\]/);
});

test('a shorter fence line inside a longer fence does not hide later links', (t) => {
  const root = copySkill(t);
  edit(root, 'SKILL.md', (s) => `${s}\n\`\`\`\`md\n\`\`\`\n[inner](nope.md)\n\`\`\`\`\n\n[after](presets/missing.md)\n`);
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /链接目标不存在：presets\/missing\.md/);
  assert.doesNotMatch(r.out, /nope\.md/);
});

test('Markdown under assets/ is link-checked too', (t) => {
  const root = copySkill(t);
  edit(root, 'assets/react-vite-app-shell-1/README.md', (s) => s.replace('](../../recipes/react-vite-app-shell.md)', '](../../skills/lazypack-setup/recipes/react-vite-app-shell.md)'));
  run(root, 'generate');
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[links\] assets\/react-vite-app-shell-1\/README\.md:\d+ 链接目标不存在/);
});
