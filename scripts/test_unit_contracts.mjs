/**
 * scripts/test_unit_contracts.mjs
 *
 * skills/lazypack-setup/scripts/unit_contracts.mjs 的回归测试（#111）。
 * 每个用例把 skill 目录拷到临时位置再改动，验证：契约缺任一必填字段即失败；
 * 引用的文件、章节、版本对不上即失败；卡片与模板文件没有契约覆盖即失败；
 * 提交的矩阵与契约不一致即失败；矩阵里没有证据的格子显示「未验证」，
 * 有证据的格子都带出处链接。测试不联网，不核对链接能否打开。
 * 经 scripts/run_tests.mjs 随 .github/workflows/tests.yml 运行。
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  CORE_CONTRACT,
  MATRIX_REL,
  PLATFORMS,
  checkUnits,
  findContracts,
  renderMatrix,
  validateContracts,
} from '../skills/lazypack-setup/scripts/unit_contracts.mjs';

const SKILL = fileURLToPath(new URL('../skills/lazypack-setup', import.meta.url));
const FIELDS = ['schema', 'id', 'version', 'kind', 'card', 'applies_when', 'provides', 'files', 'verify', 'evidence', 'rules'];
const PRESET = 'presets/python-uv-ruff.unit.json';
const MUTATION = 'recipes/mutation-testing.unit.json';
const APP_SHELL = 'recipes/react-vite-app-shell.unit.json';
const APP_SHELL_ASSETS = 'assets/react-vite-app-shell-1';
const SOURCE_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(issues\/\d+#issuecomment-\d+|pull\/\d+#(issuecomment-|discussion_r)\d+|actions\/runs\/\d+(\/job\/\d+)?)$/;

function copySkill(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-unit-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'lazypack-setup');
  fs.cpSync(SKILL, root, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src),
  });
  return root;
}

function cli(root, script, cmd) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', script), cmd], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

/** 改一份契约的内容。fn 就地修改对象，或返回一个新对象。 */
function editContract(root, rel, fn) {
  const unit = readJson(root, rel);
  const next = fn(unit) ?? unit;
  fs.writeFileSync(path.join(root, rel), `${JSON.stringify(next, null, 2)}\n`);
}

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function listDir(dir) {
  const out = [];
  const walk = (cur) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.push(path.relative(dir, abs).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** 断言校验失败，且至少一条说明同时提到这份契约和给定文字。 */
function assertFails(root, rel, pattern) {
  const { failures } = validateContracts(root);
  const hit = failures.some((f) => (rel === null || f.startsWith(`${rel}：`)) && pattern.test(f));
  assert.ok(hit, `应有一条匹配 ${pattern} 的失败（${rel ?? '任意位置'}），实际：\n${failures.join('\n') || '（无失败）'}`);
  assert.notDeepEqual(checkUnits(root), [], 'checkUnits 也应报失败');
}

/** 矩阵表里的数据行，拆成单元格。 */
function matrixRows(text) {
  const lines = text.split('\n');
  const start = lines.indexOf('## 矩阵');
  const end = lines.indexOf('## 证据明细');
  assert.ok(start > 0 && end > start, '矩阵文件应有「矩阵」与「证据明细」两节');
  return lines
    .slice(start, end)
    .filter((l) => l.startsWith('| `'))
    .map((l) => l.split(' | ').map((c) => c.replace(/^\| /, '').replace(/ \|$/, '')));
}

test('repository copy of the skill passes', () => {
  assert.deepEqual(validateContracts(SKILL).failures, []);
  assert.deepEqual(checkUnits(SKILL), []);
  const r = cli(SKILL, 'unit_contracts.mjs', 'check');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /单元契约检查通过/);
});

test('skill copied alone to a temp directory still passes', (t) => {
  const root = copySkill(t);
  const r = cli(root, 'unit_contracts.mjs', 'check');
  assert.equal(r.code, 0, r.out);
});

test('there is one contract per card plus the core contract', () => {
  const contracts = findContracts(SKILL);
  const cards = ['presets', 'recipes'].flatMap((dir) =>
    fs.readdirSync(path.join(SKILL, dir)).filter((n) => n.endsWith('.md')).map((n) => `${dir}/${n.slice(0, -3)}.unit.json`));
  assert.deepEqual(contracts, [CORE_CONTRACT, ...cards].sort());
  assert.equal(validateContracts(SKILL).units.length, contracts.length);
});

test('removing any required field from any contract fails', async (t) => {
  for (const rel of findContracts(SKILL)) {
    for (const field of FIELDS) {
      await t.test(`${rel} without ${field}`, (t2) => {
        const root = copySkill(t2);
        editContract(root, rel, (u) => { delete u[field]; });
        assertFails(root, rel, new RegExp(`缺少必填字段 ${field}$`));
        const r = cli(root, 'unit_contracts.mjs', 'check');
        assert.equal(r.code, 1, r.out);
      });
    }
  }
});

test('removing a required field from a files, verify or evidence entry fails', async (t) => {
  const cases = [
    ['files', ['source', 'target', 'mode', 'managed']],
    ['verify', ['command', 'expect_exit', 'cwd']],
    ['evidence', ['kind', 'platform', 'environment', 'date', 'unit_version', 'scope', 'source']],
  ];
  for (const [list, fields] of cases) {
    for (const field of fields) {
      await t.test(`${list}[0] without ${field}`, (t2) => {
        const root = copySkill(t2);
        editContract(root, MUTATION, (u) => { delete u[list][0][field]; });
        assertFails(root, MUTATION, new RegExp(`${list}\\[0\\] 缺少必填字段 ${field}$`));
      });
    }
  }
});

test('an undefined field fails', (t) => {
  const root = copySkill(t);
  editContract(root, PRESET, (u) => { u.notes = 'x'; });
  assertFails(root, PRESET, /有未定义的字段 notes/);
});

test('a wrong schema, kind or card fails', async (t) => {
  const cases = [
    ['schema', 'lazypack-unit/2', /schema 应为 lazypack-unit\/1/],
    ['kind', 'recipe', /kind 应为 preset/],
    ['card', 'ts-biome-vitest.md', /card 应为 python-uv-ruff\.md/],
  ];
  for (const [field, value, pattern] of cases) {
    await t.test(field, (t2) => {
      const root = copySkill(t2);
      editContract(root, PRESET, (u) => { u[field] = value; });
      assertFails(root, PRESET, pattern);
    });
  }
});

test('a files source that is not in the package fails', (t) => {
  const root = copySkill(t);
  editContract(root, MUTATION, (u) => { u.files[0].source = 'assets/mutation/no-such-file.mjs'; });
  assertFails(root, MUTATION, /files\[0\]\.source 在包内不存在/);
});

test('deleting a file that a contract ships fails', (t) => {
  const root = copySkill(t);
  const source = readJson(root, CORE_CONTRACT).files[0].source;
  fs.rmSync(path.join(root, source));
  assertFails(root, CORE_CONTRACT, /files\[0\]\.source 在包内不存在/);
});

test('a source or target that leaves its root fails', async (t) => {
  for (const [field, value] of [['source', '../SKILL.md'], ['target', '/etc/passwd'], ['target', 'a/../../b']]) {
    await t.test(`${field} = ${value}`, (t2) => {
      const root = copySkill(t2);
      editContract(root, MUTATION, (u) => { u.files[0][field] = value; });
      assertFails(root, MUTATION, new RegExp(`files\\[0\\]\\.${field} 必须是相对`));
    });
  }
});

test('an empty verify list or an empty command fails', async (t) => {
  await t.test('verify is empty', (t2) => {
    const root = copySkill(t2);
    editContract(root, PRESET, (u) => { u.verify = []; });
    assertFails(root, PRESET, /verify 必须是非空数组/);
  });
  for (const value of ['', '   ']) {
    await t.test(`command is ${JSON.stringify(value)}`, (t2) => {
      const root = copySkill(t2);
      editContract(root, PRESET, (u) => { u.verify[1].command = value; });
      assertFails(root, PRESET, /verify\[1\]\.command 不能为空/);
    });
  }
});

test('a verify cwd that is not target-root or a directory of a shipped file fails', async (t) => {
  await t.test('directory of a shipped file is accepted', (t2) => {
    const root = copySkill(t2);
    editContract(root, MUTATION, (u) => { u.verify[0].cwd = 'scripts'; });
    assert.deepEqual(validateContracts(root).failures, []);
  });
  for (const cwd of ['no-such-dir', '..', '/tmp', '']) {
    await t.test(`cwd = ${JSON.stringify(cwd)}`, (t2) => {
      const root = copySkill(t2);
      editContract(root, MUTATION, (u) => { u.verify[0].cwd = cwd; });
      assertFails(root, MUTATION, /verify\[0\]\.cwd 必须是 "target-root" 或/);
    });
  }
});

test('evidence without a public GitHub source fails', async (t) => {
  const bad = [
    'file:///C:/Users/someone/acceptance.md',
    'https://example.com/report',
    'https://github.com/jaredshuai/lazypack-discipline/issues/82',
    'https://github.com/jaredshuai/lazypack-discipline/pull/103',
    'docs/reviews/somewhere.md',
  ];
  for (const source of bad) {
    await t.test(source, (t2) => {
      const root = copySkill(t2);
      editContract(root, MUTATION, (u) => { u.evidence[0].source = source; });
      assertFails(root, MUTATION, /evidence\[0\]\.source 必须是 GitHub/);
    });
  }
});

test('evidence with an unknown platform, kind or date fails', async (t) => {
  const cases = [
    ['platform', 'freebsd', /evidence\[0\]\.platform 必须是/],
    ['kind', 'self-reported', /evidence\[0\]\.kind 必须是/],
    ['date', '2026-02-30', /evidence\[0\]\.date 必须是真实存在/],
    ['unit_version', 'v1', /evidence\[0\]\.unit_version 必须是 SemVer/],
    ['scope', '', /evidence\[0\]\.scope 必须是单行非空/],
  ];
  for (const [field, value, pattern] of cases) {
    await t.test(`${field} = ${JSON.stringify(value)}`, (t2) => {
      const root = copySkill(t2);
      editContract(root, MUTATION, (u) => { u.evidence[0][field] = value; });
      assertFails(root, MUTATION, pattern);
    });
  }
});

test('an id or version that differs from the card frontmatter fails', async (t) => {
  await t.test('contract id changed', (t2) => {
    const root = copySkill(t2);
    editContract(root, PRESET, (u) => { u.id = 'python-other'; });
    assertFails(root, PRESET, /id 应与卡片 presets\/python-uv-ruff\.md 的 frontmatter 相同/);
  });
  await t.test('contract version changed', (t2) => {
    const root = copySkill(t2);
    editContract(root, PRESET, (u) => { u.version = '9.9.9'; });
    assertFails(root, PRESET, /version 应与卡片 presets\/python-uv-ruff\.md 的 frontmatter 相同/);
  });
  await t.test('card version bumped without the contract', (t2) => {
    const root = copySkill(t2);
    const card = path.join(root, 'presets/python-uv-ruff.md');
    const text = fs.readFileSync(card, 'utf8');
    const bumped = text.replace(/^version: .*$/m, 'version: 9.9.9');
    assert.notEqual(bumped, text);
    fs.writeFileSync(card, bumped);
    assertFails(root, PRESET, /version 应与卡片/);
  });
});

test('the core version must equal the fixed layer version', async (t) => {
  await t.test('contract version changed', (t2) => {
    const root = copySkill(t2);
    editContract(root, CORE_CONTRACT, (u) => { u.version = '0.0.1'; });
    assertFails(root, CORE_CONTRACT, /version 应与 references\/DECISIONS\.md 的版本/);
  });
  await t.test('fixed layer version bumped without the contract', (t2) => {
    const root = copySkill(t2);
    const file = path.join(root, 'references/DECISIONS.md');
    const text = fs.readFileSync(file, 'utf8');
    const bumped = text.replace(/^版本：\d+\.\d+\.\d+/m, '版本：99.0.0');
    assert.notEqual(bumped, text);
    fs.writeFileSync(file, bumped);
    assertFails(root, CORE_CONTRACT, /version 应与 references\/DECISIONS\.md 的版本 99\.0\.0 相同/);
  });
});

test('a rule that does not resolve to exactly one heading fails', async (t) => {
  await t.test('section number does not exist', (t2) => {
    const root = copySkill(t2);
    editContract(root, PRESET, (u) => { u.rules[0] = 'python-uv-ruff.md §99'; });
    assertFails(root, PRESET, /rules\[0\] 在 presets\/python-uv-ruff\.md 里找不到以 99 开头的标题/);
  });
  await t.test('file does not exist', (t2) => {
    const root = copySkill(t2);
    editContract(root, PRESET, (u) => { u.rules[0] = 'no-such-card.md §1'; });
    assertFails(root, PRESET, /rules\[0\] 指向的文件在包内不存在/);
  });
  await t.test('not written as <file> §<n>', (t2) => {
    const root = copySkill(t2);
    editContract(root, PRESET, (u) => { u.rules[0] = 'python-uv-ruff.md 第 2 节'; });
    assertFails(root, PRESET, /rules\[0\] 必须写成/);
  });
  await t.test('number appears on two headings', (t2) => {
    const root = copySkill(t2);
    write(root, 'references/dup.md', '# 标题\n\n## 1. 甲\n\n### 1.1 子节\n\n## 1. 乙\n');
    editContract(root, CORE_CONTRACT, (u) => { u.rules.push('references/dup.md §1'); });
    assertFails(root, CORE_CONTRACT, /对应 2 个标题，章节号不唯一/);
  });
  await t.test('number only appears below level three or inside a code fence', (t2) => {
    const root = copySkill(t2);
    write(root, 'references/deep.md', '# 标题\n\n## 1. 甲\n\n#### 7. 深层\n\n```\n## 8. 围栏里的\n```\n');
    editContract(root, CORE_CONTRACT, (u) => { u.rules.push('references/deep.md §7', 'references/deep.md §8'); });
    assertFails(root, CORE_CONTRACT, /里找不到以 7 开头的标题/);
    assertFails(root, CORE_CONTRACT, /里找不到以 8 开头的标题/);
  });
});

test('an empty provides or rules list fails', async (t) => {
  for (const field of ['provides', 'rules']) {
    await t.test(field, (t2) => {
      const root = copySkill(t2);
      editContract(root, PRESET, (u) => { u[field] = []; });
      assertFails(root, PRESET, new RegExp(`${field} 必须是非空数组`));
    });
  }
});

test('an applies_when entry with an unknown probe or a missing argument fails', async (t) => {
  await t.test('unknown probe', (t2) => {
    const root = copySkill(t2);
    editContract(root, PRESET, (u) => { u.applies_when[0] = { probe: 'run-script', path: 'x' }; });
    assertFails(root, PRESET, /applies_when\[0\] 的 probe 必须是/);
  });
  await t.test('missing argument', (t2) => {
    const root = copySkill(t2);
    editContract(root, PRESET, (u) => { u.applies_when[0] = { probe: 'json-field', path: 'package.json' }; });
    assertFails(root, PRESET, /applies_when\[0\] 缺少必填字段 field/);
  });
});

test('a card without a contract fails', async (t) => {
  await t.test('new card added', (t2) => {
    const root = copySkill(t2);
    write(root, 'presets/go-std.md', '---\nid: go-std\nversion: 0.1.0\n---\n\n# Go\n');
    assertFails(root, null, /卡片 presets\/go-std\.md 没有契约，应有 presets\/go-std\.unit\.json/);
  });
  await t.test('existing contract removed', (t2) => {
    const root = copySkill(t2);
    fs.rmSync(path.join(root, MUTATION));
    assertFails(root, null, /卡片 recipes\/mutation-testing\.md 没有契约/);
  });
  await t.test('core contract removed', (t2) => {
    const root = copySkill(t2);
    fs.rmSync(path.join(root, CORE_CONTRACT));
    assertFails(root, null, /缺少 lazypack-core\.unit\.json/);
  });
});

test('a template or asset file that no contract ships fails', async (t) => {
  for (const rel of ['templates/new-template.md', 'assets/mutation/tools/new-tool.mjs', `${APP_SHELL_ASSETS}/src/extra.ts`]) {
    await t.test(rel, (t2) => {
      const root = copySkill(t2);
      write(root, rel, 'x\n');
      const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assertFails(root, null, new RegExp(`^${escaped} 没有被任何契约的 files\\[\\]\\.source 引用$`));
    });
  }
});

test('a contract outside the allowed places fails', (t) => {
  const root = copySkill(t);
  fs.copyFileSync(path.join(root, PRESET), path.join(root, 'references/stray.unit.json'));
  assertFails(root, 'references/stray.unit.json', /契约只能放在包根/);
});

test('a contract that is not valid JSON fails', (t) => {
  const root = copySkill(t);
  fs.writeFileSync(path.join(root, PRESET), '{ "schema": ');
  assertFails(root, PRESET, /不是合法 JSON/);
});

test('two contracts with the same id fail', (t) => {
  const root = copySkill(t);
  write(root, 'recipes/python-uv-ruff.md', '---\nid: python-uv-ruff\nversion: 0.1.0\n---\n\n# 重名\n\n## 2. 甲\n\n## 3. 乙\n\n### 5.1 丙\n');
  editContract(root, PRESET, (u) => ({ ...u, kind: 'recipe' }));
  fs.copyFileSync(path.join(root, PRESET), path.join(root, 'recipes/python-uv-ruff.unit.json'));
  editContract(root, PRESET, (u) => ({ ...u, kind: 'preset' }));
  assertFails(root, null, /id python-uv-ruff 与 .* 重复/);
});

test('the App Shell contract ships exactly the files of its asset directory', () => {
  const unit = readJson(SKILL, APP_SHELL);
  const files = listDir(path.join(SKILL, APP_SHELL_ASSETS));
  assert.deepEqual(unit.files.map((f) => f.source).sort(), files.map((f) => `${APP_SHELL_ASSETS}/${f}`).sort());
  for (const f of unit.files) {
    assert.equal(f.source, `${APP_SHELL_ASSETS}/${f.target}`);
  }
});

test('every template and asset file is shipped by exactly one contract', () => {
  const seen = new Map();
  for (const rel of findContracts(SKILL)) {
    for (const f of readJson(SKILL, rel).files) {
      assert.ok(!seen.has(f.source), `${f.source} 同时出现在 ${seen.get(f.source)} 与 ${rel}`);
      seen.set(f.source, rel);
    }
  }
  const expected = ['templates', 'assets'].flatMap((dir) => listDir(path.join(SKILL, dir)).map((f) => `${dir}/${f}`));
  assert.deepEqual([...seen.keys()].sort(), expected.sort());
});

test('the committed matrix equals the generated one, also from a CRLF checkout', (t) => {
  const { units, failures } = validateContracts(SKILL);
  assert.deepEqual(failures, []);
  assert.equal(fs.readFileSync(path.join(SKILL, MATRIX_REL), 'utf8').replace(/\r\n/g, '\n'), renderMatrix(units));
  const root = copySkill(t);
  const file = path.join(root, MATRIX_REL);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\r?\n/g, '\r\n'));
  assert.deepEqual(checkUnits(root), []);
});

test('changing a contract without regenerating the matrix fails, regenerating fixes it', (t) => {
  const root = copySkill(t);
  editContract(root, MUTATION, (u) => { u.evidence[0].date = '2026-11-01'; });
  assert.deepEqual(validateContracts(root).failures, []);
  const stale = checkUnits(root);
  assert.equal(stale.length, 1, stale.join('\n'));
  assert.match(stale[0], /references\/unit-matrix\.md 与契约不一致/);
  assert.equal(cli(root, 'unit_contracts.mjs', 'check').code, 1);

  const regen = cli(root, 'unit_contracts.mjs', 'matrix');
  assert.equal(regen.code, 0, regen.out);
  assert.match(regen.out, /已写入 references\/unit-matrix\.md/);
  assert.deepEqual(checkUnits(root), []);
  assert.match(fs.readFileSync(path.join(root, MATRIX_REL), 'utf8'), /\[2026-11-01\]/);
});

test('a hand-edited or missing matrix fails', async (t) => {
  await t.test('cell changed by hand', (t2) => {
    const root = copySkill(t2);
    const file = path.join(root, MATRIX_REL);
    const text = fs.readFileSync(file, 'utf8');
    const edited = text.replace('未验证', '宿主验收');
    assert.notEqual(edited, text);
    fs.writeFileSync(file, edited);
    assert.match(checkUnits(root).join('\n'), /与契约不一致/);
  });
  await t.test('file removed', (t2) => {
    const root = copySkill(t2);
    fs.rmSync(path.join(root, MATRIX_REL));
    assert.match(checkUnits(root).join('\n'), /缺少 references\/unit-matrix\.md/);
  });
});

test('matrix refuses to write while a contract is invalid', (t) => {
  const root = copySkill(t);
  const file = path.join(root, MATRIX_REL);
  const before = fs.readFileSync(file);
  editContract(root, PRESET, (u) => { delete u.verify; });
  const r = cli(root, 'unit_contracts.mjs', 'matrix');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /未写入 references\/unit-matrix\.md/);
  assert.ok(fs.readFileSync(file).equals(before), '矩阵文件不应被改动');
});

test('cells without evidence read 未验证 and every other cell links to its source', () => {
  const { units } = validateContracts(SKILL);
  const text = fs.readFileSync(path.join(SKILL, MATRIX_REL), 'utf8').replace(/\r\n/g, '\n');
  const rows = matrixRows(text);
  assert.equal(rows.length, units.length);
  rows.forEach((cells, i) => {
    const unit = units[i];
    assert.equal(cells.length, 3 + PLATFORMS.length);
    assert.equal(cells[0], `\`${unit.id}\``);
    assert.equal(cells[2], unit.version);
    PLATFORMS.forEach((platform, j) => {
      const cellText = cells[3 + j];
      const evidence = unit.evidence.filter((e) => e.platform === platform);
      if (evidence.length === 0) {
        assert.equal(cellText, '未验证', `${unit.id} / ${platform}`);
        return;
      }
      const parts = cellText.split('<br>');
      assert.equal(parts.length, evidence.length, `${unit.id} / ${platform}`);
      const linked = parts.map((part) => {
        const m = part.match(/^(宿主验收|夹具测试) \[(\d{4}-\d{2}-\d{2})\]\((\S+)\)(（旧版 \d+\.\d+\.\d+）)?$/);
        assert.ok(m, `${unit.id} / ${platform} 的格子应是「类别 [日期](出处)」：${part}`);
        assert.match(m[3], SOURCE_RE);
        return m[3];
      });
      assert.deepEqual(linked.sort(), evidence.map((e) => e.source).sort());
    });
  });
});

test('a unit with no evidence is 未验证 in every column', () => {
  const { units } = validateContracts(SKILL);
  const bare = units.filter((u) => u.evidence.length === 0);
  assert.ok(bare.length > 0, '本测试需要至少一个没有证据的单元');
  const rows = matrixRows(renderMatrix(units));
  for (const unit of bare) {
    const cells = rows.find((r) => r[0] === `\`${unit.id}\``);
    assert.deepEqual(cells.slice(3), PLATFORMS.map(() => '未验证'));
  }
});

test('evidence recorded against an older unit version is marked', (t) => {
  const root = copySkill(t);
  editContract(root, MUTATION, (u) => { u.evidence[0].unit_version = '0.9.0'; });
  const { units, failures } = validateContracts(root);
  assert.deepEqual(failures, []);
  assert.match(renderMatrix(units), /夹具测试 \[\d{4}-\d{2}-\d{2}\]\(\S+\)（旧版 0\.9\.0）/);
});

test('rendering does not depend on the order of evidence entries', (t) => {
  const root = copySkill(t);
  const before = renderMatrix(validateContracts(root).units);
  editContract(root, CORE_CONTRACT, (u) => { u.evidence.reverse(); });
  assert.equal(renderMatrix(validateContracts(root).units), before);
});

test('the package check reports contract failures under units', (t) => {
  const root = copySkill(t);
  editContract(root, PRESET, (u) => { delete u.verify; });
  const r = cli(root, 'package_manifest.mjs', 'check');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL \[units\] presets\/python-uv-ruff\.unit\.json：契约 缺少必填字段 verify/);
});

test('the package check reports a stale matrix under units', (t) => {
  const root = copySkill(t);
  editContract(root, MUTATION, (u) => { u.evidence = []; });
  const r = cli(root, 'package_manifest.mjs', 'check');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL \[units\] references\/unit-matrix\.md 与契约不一致/);
});

test('usage errors exit with 2', () => {
  for (const args of [[], ['generate'], ['check', 'extra']]) {
    const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'unit_contracts.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
  }
});
