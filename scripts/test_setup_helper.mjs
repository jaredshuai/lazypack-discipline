/**
 * scripts/test_setup_helper.mjs
 *
 * setup 管线入口 setup_helper.mjs 的 scan 与 plan 的回归测试（#114）。
 * 针对 #86：既有聚合命令（`npm test` = 先查版本、再 tsc、再 node --test）曾被拆进
 * type 和 test 两个槽。本测试用「已有聚合脚本的 TypeScript 仓」夹具复现那个输入，
 * 并用性质断言守住两件事：
 *   1. 事实文件里每条既有命令的完整调用，在计划的槽命令里逐字出现；
 *   2. 聚合脚本没有被展开成子命令。
 * 反向用例：人为把聚合命令拆开，断言必须失败，证明断言本身有效。
 *
 * 和净室测试一样，只把 skills/lazypack-setup/ 拷到系统临时目录，运行拷出的那份脚本；
 * 夹具仓拷到旁边。临时根取规范真实路径（macOS 的 /var 是符号链接，Windows 的 TEMP
 * 可能是 8.3 短名）。事实、回答、计划文件写在目标仓之外。只用 Node 标准库。
 *
 * 用法: node scripts/test_setup_helper.mjs
 * 由 scripts/run_tests.mjs 汇总运行；.github/workflows/tests.yml 的 clean-room 作业
 * 在 Linux、Windows、macOS 三个 runner 上各跑一次。
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_SRC = path.join(REPO_ROOT, 'skills', 'lazypack-setup');
const FIXTURE = path.join(REPO_ROOT, 'scripts', 'fixtures', 'setup-pipeline', 'ts-aggregate-gates');
const TEST_FACT_ID = 'cmd:package.json#scripts.test';
const EXIT = { OK: 0, ERROR: 1, USAGE: 2, UNSAFE: 3, STALE: 4 };

// ---------------------------------------------------------------------------
// 工作区与进程
// ---------------------------------------------------------------------------

function makeWorkspace(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-setup-pipeline-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = {
    root,
    skill: path.join(root, 'lazypack-setup'),
    repo: path.join(root, 'repo'),
    out: path.join(root, 'artifacts')
  };
  fs.cpSync(SKILL_SRC, workspace.skill, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src)
  });
  fs.cpSync(path.join(FIXTURE, 'repo'), workspace.repo, { recursive: true });
  fs.mkdirSync(workspace.out);
  workspace.judgments = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'judgments.json'), 'utf8'));
  workspace.answers = path.join(workspace.out, 'answers.json');
  fs.copyFileSync(path.join(FIXTURE, 'answers.json'), workspace.answers);
  return workspace;
}

function helper(workspace, args, { expect } = {}) {
  const child = spawnSync(process.execPath, [path.join(workspace.skill, 'scripts', 'setup_helper.mjs'), ...args], {
    cwd: workspace.root,
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true
  });
  if (child.error) throw new Error(`无法运行 setup_helper.mjs：${child.error.message}`);
  if (expect !== undefined && child.status !== expect) {
    throw new Error(`setup_helper.mjs ${args.join(' ')} 退出码 ${child.status}，预期 ${expect}\nstdout: ${child.stdout}\nstderr: ${child.stderr}`);
  }
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** scan 并（可选）把判断写进事实文件，返回事实文件路径与内容。 */
function scan(workspace, { withJudgments = true } = {}) {
  const file = path.join(workspace.out, 'facts.json');
  helper(workspace, ['scan', '--cwd', workspace.repo, '--out', file], { expect: EXIT.OK });
  const facts = readJson(file);
  if (withJudgments) {
    facts.judgments = workspace.judgments;
    fs.writeFileSync(file, `${JSON.stringify(facts, null, 2)}\n`, 'utf8');
  }
  return { file, facts };
}

function plan(workspace, factsFile, { expect = EXIT.OK } = {}) {
  const file = path.join(workspace.out, 'plan.json');
  const result = helper(
    workspace,
    ['plan', '--cwd', workspace.repo, '--facts', factsFile, '--answers', workspace.answers, '--out', file],
    { expect }
  );
  return { result, file, plan: fs.existsSync(file) ? readJson(file) : null };
}

/** 改目标仓里的 package.json：回调拿到解析后的对象，返回新对象。 */
function editPackageJson(workspace, edit) {
  const file = path.join(workspace.repo, 'package.json');
  const manifest = edit(readJson(file));
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/** 按 managed-blocks.md §3.2 的写法独立算摘要：用替换函数排键，不复用被测代码。 */
function independentDigest(value) {
  const sorted = JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v
  );
  return crypto.createHash('sha256').update(Buffer.from(sorted, 'utf8')).digest('hex');
}

// ---------------------------------------------------------------------------
// 性质断言：既有命令逐字保留、聚合脚本不被展开
// ---------------------------------------------------------------------------

/** 把定义按 shell 的串联符号切成片段。只用来判断「槽命令是不是定义的内部片段」，从不用来产出命令。 */
function definitionSegments(definition) {
  return definition.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
}

function assertGateCommandsKeptVerbatim(factsFile, plan) {
  const facts = new Map(factsFile.facts.map((fact) => [fact.id, fact]));
  const referenced = new Set(plan.slots.filter((s) => s.origin === 'existing').map((s) => s.from));
  const unassigned = new Set((plan.unassigned || []).map((u) => u.from));

  // 1. 每条既有命令：要么在某个槽里，要么被计划明确列为未分配。
  for (const fact of facts.values()) {
    assert.ok(
      referenced.has(fact.id) || unassigned.has(fact.id),
      `事实 ${fact.id} 的完整调用「${fact.value.invocation}」既不在任何槽里，也没有被计划列为未分配`
    );
  }

  for (const slot of plan.slots) {
    if (slot.origin === 'existing') {
      const fact = facts.get(slot.from);
      assert.ok(fact, `槽 ${slot.slot} 引用了不存在的事实 ${slot.from}`);
      // 2. 逐字相同：不去空白、不改写、不换入口。
      assert.strictEqual(
        slot.command,
        fact.value.invocation,
        `槽 ${slot.slot} 的命令「${slot.command}」与事实 ${fact.id} 的完整调用「${fact.value.invocation}」不逐字相同`
      );
      assert.strictEqual(slot.cwd, fact.value.cwd, `槽 ${slot.slot} 的工作目录与事实 ${fact.id} 不同`);
    }
    // 3. 没有展开：任何槽的命令都不能是某条聚合脚本定义里的内部片段。
    for (const fact of facts.values()) {
      const segments = definitionSegments(fact.value.definition);
      if (segments.length > 1 && slot.command !== null) {
        assert.ok(
          !segments.includes(slot.command.trim()),
          `槽 ${slot.slot} 的命令「${slot.command}」是聚合脚本 ${fact.id}（${fact.value.definition}）的内部子命令片段，聚合脚本被展开了`
        );
      }
    }
  }

  // 4. 一条聚合命令覆盖多个槽时，这些槽的命令是同一条完整调用。
  const byFact = new Map();
  for (const slot of plan.slots.filter((s) => s.origin === 'existing')) {
    byFact.set(slot.from, [...(byFact.get(slot.from) || []), slot.command]);
  }
  for (const [id, commands] of byFact) {
    assert.ok(commands.every((c) => c === commands[0]), `事实 ${id} 覆盖多个槽，但各槽的命令不是同一条：${JSON.stringify(commands)}`);
  }
}

const slotOf = (plan, name) => plan.slots.find((slot) => slot.slot === name);

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

test('scan：事实文件的形状、逐字记录与摘要', (t) => {
  const workspace = makeWorkspace(t);
  const { facts } = scan(workspace, { withJudgments: false });

  assert.equal(facts.schema, 'lazypack-facts/1');
  assert.equal(facts.scope, 'full');
  assert.deepEqual(facts.covers, [4]);
  assert.deepEqual(facts.judgments, []);
  assert.deepEqual(
    facts.facts.map((f) => f.id),
    ['cmd:package.json#scripts.format', 'cmd:package.json#scripts.lint', 'cmd:package.json#scripts.test']
  );
  for (const fact of facts.facts) {
    assert.equal(fact.item, 4);
    assert.equal(fact.kind, 'existing-command');
    assert.equal(fact.source, 'machine');
    assert.equal(fact.value.cwd, '.');
    assert.deepEqual(fact.evidence, fact.value.definedAt);
  }
  const test_ = facts.facts.find((f) => f.id === TEST_FACT_ID);
  assert.equal(test_.value.invocation, 'npm test');
  assert.equal(test_.value.definition, 'npm run check:versions && npm run check && node --test');
  assert.deepEqual(test_.value.definedAt, { path: 'package.json', locator: 'scripts.test' });
  assert.equal(facts.facts.find((f) => f.id.endsWith('.lint')).value.invocation, 'npm run lint');

  assert.equal(facts.machineFp, independentDigest(facts.facts));
  assert.match(facts.machineFp, /^[0-9a-f]{64}$/);
});

test('scan 与 plan 是只读的：目标仓的字节与目录内容都不变', (t) => {
  const workspace = makeWorkspace(t);
  const snapshot = () =>
    fs.readdirSync(workspace.repo, { recursive: true }).sort().map((rel) => {
      const abs = path.join(workspace.repo, rel);
      return `${rel}:${fs.statSync(abs).isFile() ? crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex') : 'dir'}`;
    });
  const before = snapshot();
  const { file } = scan(workspace);
  plan(workspace, file);
  assert.deepEqual(snapshot(), before);
});

test('#86：聚合脚本整条保留，type 与 test 槽都是完整的 npm test，没有展开', (t) => {
  const workspace = makeWorkspace(t);
  const { file, facts } = scan(workspace);
  const { plan: result } = plan(workspace, file);

  assert.equal(result.schema, 'lazypack-plan/1');
  assert.equal(result.answersOrigin, 'preset');
  assert.equal(result.docPlanFp, null);
  assert.equal(result.factsFp, facts.machineFp);
  assert.equal(Object.hasOwn(result, 'actions'), false, '本票只出 slots，不出 actions');
  assert.deepEqual(result.slots.map((s) => s.slot), ['format', 'lint', 'type', 'test']);

  assert.equal(slotOf(result, 'type').command, 'npm test');
  assert.equal(slotOf(result, 'test').command, 'npm test');
  assert.equal(slotOf(result, 'type').from, TEST_FACT_ID);
  assert.equal(slotOf(result, 'test').from, TEST_FACT_ID);
  assert.equal(slotOf(result, 'format').command, 'npm run format');
  assert.equal(slotOf(result, 'lint').command, 'npm run lint');
  for (const slot of result.slots) {
    assert.equal(slot.origin, 'existing');
    assert.deepEqual(slot.needs, []);
    assert.equal(slot.outcomes.wired.provenance, 'wired:existing:pre-existing');
  }
  assert.deepEqual(result.aiItems, ['j1']);
  assert.deepEqual(result.unassigned, []);

  assertGateCommandsKeptVerbatim(facts, result);
});

test('反向用例：人为把聚合命令拆进 type 和 test 两槽，断言必须失败（#86 的现场）', (t) => {
  const workspace = makeWorkspace(t);
  const { file, facts } = scan(workspace);
  const { plan: good } = plan(workspace, file);
  assertGateCommandsKeptVerbatim(facts, good); // 对照：未拆时断言通过

  // 拆法一：就是 #86 报告的样子，npm run check 归 type，其余归 test。
  const split = structuredClone(good);
  slotOf(split, 'type').command = 'npm run check';
  slotOf(split, 'test').command = 'npm run check:versions && node --test';
  assert.throws(
    () => assertGateCommandsKeptVerbatim(facts, split),
    (err) => {
      assert.match(err.message, /不逐字相同/);
      assert.match(err.message, /npm run check/);
      return true;
    }
  );

  // 拆法二：绕开 from，把子命令当成配方槽写进去。逐字比对管不到它，「没有展开」这一条必须抓到。
  const bypass = structuredClone(good);
  Object.assign(slotOf(bypass, 'type'), { origin: 'preset', from: null, command: 'npm run check' });
  assert.throws(
    () => assertGateCommandsKeptVerbatim(facts, bypass),
    /内部子命令片段，聚合脚本被展开了/
  );

  // 拆法三：事实对应的槽整个消失（既不在槽里也没列为未分配）。
  const dropped = structuredClone(good);
  dropped.slots = dropped.slots.filter((s) => s.from !== TEST_FACT_ID);
  assert.throws(() => assertGateCommandsKeptVerbatim(facts, dropped), /既不在任何槽里/);
});

test('性质：多种仓形状下，每条既有命令逐字保留（包管理器与改动后的脚本）', (t) => {
  for (const [lockfile, prefix, testCommand] of [
    ['pnpm-lock.yaml', 'pnpm', 'pnpm test'],
    ['yarn.lock', 'yarn', 'yarn test'],
    ['bun.lock', 'bun', 'bun run test'],
    ['package-lock.json', 'npm', 'npm test']
  ]) {
    const workspace = makeWorkspace(t);
    fs.writeFileSync(path.join(workspace.repo, lockfile), '', 'utf8');
    const { file, facts } = scan(workspace);
    const { plan: result } = plan(workspace, file);
    assert.equal(slotOf(result, 'test').command, testCommand, lockfile);
    assert.equal(slotOf(result, 'lint').command, `${prefix} run lint`, lockfile);
    assertGateCommandsKeptVerbatim(facts, result);
  }

  // 定义里的符号、引号、空白都不影响调用字符串，也不会被拿去拆
  const workspace = makeWorkspace(t);
  editPackageJson(workspace, (manifest) => {
    manifest.scripts.test = 'echo "a && b" ; node --test   ||   exit 1';
    return manifest;
  });
  const { file, facts } = scan(workspace);
  const { plan: result } = plan(workspace, file);
  assertGateCommandsKeptVerbatim(facts, result);
  assert.equal(slotOf(result, 'test').command, 'npm test');
});

test('没有 coverage 判断时只按脚本名分配，type 槽没有命令，聚合命令仍不展开', (t) => {
  const workspace = makeWorkspace(t);
  const { file, facts } = scan(workspace, { withJudgments: false });
  const { plan: result } = plan(workspace, file);
  assert.equal(slotOf(result, 'test').command, 'npm test');
  const type = slotOf(result, 'type');
  assert.equal(type.origin, 'none');
  assert.equal(type.command, null);
  assert.equal(type.reason, 'no-existing-command');
  assert.deepEqual(result.aiItems, []);
  assertGateCommandsKeptVerbatim(facts, result);
});

test('coverage.compliant 为 false：不分配任何槽，列入 unassigned 并标 hook-pause，不盲目拆解', (t) => {
  const workspace = makeWorkspace(t);
  workspace.judgments = [{ ...workspace.judgments[0], value: { slots: ['type', 'test'], compliant: false } }];
  const { file, facts } = scan(workspace);
  const { plan: result } = plan(workspace, file);
  assert.equal(slotOf(result, 'test').origin, 'none');
  assert.equal(slotOf(result, 'test').reason, `hook-pause:${TEST_FACT_ID}`);
  assert.equal(slotOf(result, 'type').reason, `hook-pause:${TEST_FACT_ID}`);
  assert.deepEqual(result.unassigned, [{ from: TEST_FACT_ID, reason: 'hook-pause' }]);
  assertGateCommandsKeptVerbatim(facts, result);
});

test('同一个槽被两条既有命令认领：停下，不猜', (t) => {
  const workspace = makeWorkspace(t);
  editPackageJson(workspace, (manifest) => {
    manifest.scripts.type = 'tsc --noEmit';
    manifest.scripts.typecheck = 'tsc -p . --noEmit';
    return manifest;
  });
  const { file } = scan(workspace, { withJudgments: false });
  const { result } = plan(workspace, file, { expect: EXIT.ERROR });
  assert.match(result.stderr, /槽 type 被多条既有命令认领/);
});

test('plan 重扫：目标仓的既有命令变了就停下，零输出，并指出哪条变了', (t) => {
  const workspace = makeWorkspace(t);
  const { file } = scan(workspace);
  editPackageJson(workspace, (manifest) => {
    manifest.scripts.test = 'node --test';
    return manifest;
  });
  const { result, plan: produced } = plan(workspace, file, { expect: EXIT.STALE });
  assert.equal(produced, null, '不一致时不得留下计划文件');
  assert.match(result.stderr, /变化：cmd:package\.json#scripts\.test/);
});

test('plan 不信任事实文件自称的内容：facts 被改动即停下', (t) => {
  const workspace = makeWorkspace(t);
  const { file, facts } = scan(workspace);
  // 只改 facts 里的调用字符串，不动 machineFp
  const forged = structuredClone(facts);
  forged.facts.find((f) => f.id === TEST_FACT_ID).value.invocation = 'npm run check';
  fs.writeFileSync(file, JSON.stringify(forged), 'utf8');
  const { result } = plan(workspace, file, { expect: EXIT.STALE });
  assert.match(result.stderr, /machineFp 不一致/);

  // 连 machineFp 一起伪造成自洽：仍与重扫结果对不上
  forged.machineFp = independentDigest(forged.facts);
  fs.writeFileSync(file, JSON.stringify(forged), 'utf8');
  const second = plan(workspace, file, { expect: EXIT.STALE });
  assert.match(second.result.stderr, /变化：cmd:package\.json#scripts\.test/);
});

test('判断的校验：指向不存在的事实、槽名非法、来源不是 ai，都被拒绝', (t) => {
  for (const [label, mutate, pattern] of [
    ['about 不存在', (j) => { j.about = 'cmd:package.json#scripts.nope'; }, /about 必须指向一条现有事实/],
    ['槽名非法', (j) => { j.value.slots = ['type', 'build']; }, /coverage\.slots/],
    ['来源是 machine', (j) => { j.source = 'machine'; }, /source 必须是 ai/],
    ['缺 compliant', (j) => { delete j.value.compliant; }, /compliant 必须是布尔值/]
  ]) {
    const workspace = makeWorkspace(t);
    workspace.judgments = structuredClone(workspace.judgments);
    mutate(workspace.judgments[0]);
    const { file } = scan(workspace);
    const { result } = plan(workspace, file, { expect: EXIT.ERROR });
    assert.match(result.stderr, pattern, label);
  }
});

test('回答文件：origin 原样带进计划；schema 不对则拒绝；摘要随内容变化', (t) => {
  const workspace = makeWorkspace(t);
  const { file } = scan(workspace);
  const first = plan(workspace, file).plan;
  assert.equal(first.answersFp, independentDigest(readJson(workspace.answers)));

  const answers = readJson(workspace.answers);
  answers.origin = 'interactive';
  fs.writeFileSync(workspace.answers, JSON.stringify(answers), 'utf8');
  const second = plan(workspace, file).plan;
  assert.equal(second.answersOrigin, 'interactive');
  assert.notEqual(second.answersFp, first.answersFp);
  assert.notEqual(second.planFp, first.planFp);

  answers.schema = 'lazypack-answers/0';
  fs.writeFileSync(workspace.answers, JSON.stringify(answers), 'utf8');
  const { result } = plan(workspace, file, { expect: EXIT.ERROR });
  assert.match(result.stderr, /lazypack-answers\/1/);
});

test('planFp 是除自身以外全部字段的摘要，同输入两次计划相同', (t) => {
  const workspace = makeWorkspace(t);
  const { file } = scan(workspace);
  const a = plan(workspace, file).plan;
  const b = plan(workspace, file).plan;
  assert.deepEqual(a, b);
  const { planFp, ...rest } = a;
  assert.equal(planFp, independentDigest(rest));
  assert.equal(a.judgmentsFp, independentDigest(workspace.judgments));
});

test('CRLF 检出的 package.json 得到同一份事实（Windows 的 autocrlf）', (t) => {
  const workspace = makeWorkspace(t);
  const lf = scan(workspace, { withJudgments: false }).facts;
  const manifest = path.join(workspace.repo, 'package.json');
  fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
  const crlf = scan(workspace, { withJudgments: false }).facts;
  assert.equal(crlf.machineFp, lf.machineFp);
});

test('输出文件放进目标仓里：拒绝，退出码 3，且不写任何东西', (t) => {
  const workspace = makeWorkspace(t);
  const inside = path.join(workspace.repo, 'facts.json');
  helper(workspace, ['scan', '--cwd', workspace.repo, '--out', inside], { expect: EXIT.UNSAFE });
  assert.equal(fs.existsSync(inside), false);
  const { file } = scan(workspace);
  const planInside = path.join(workspace.repo, 'src', 'plan.json');
  helper(workspace, ['plan', '--cwd', workspace.repo, '--facts', file, '--answers', workspace.answers, '--out', planInside], { expect: EXIT.UNSAFE });
  assert.equal(fs.existsSync(planInside), false);
});

test('没有 package.json 的仓：没有事实，计划里四个槽都没有命令', (t) => {
  const workspace = makeWorkspace(t);
  fs.rmSync(path.join(workspace.repo, 'package.json'));
  const { file, facts } = scan(workspace, { withJudgments: false });
  assert.deepEqual(facts.facts, []);
  const { plan: result } = plan(workspace, file);
  assert.ok(result.slots.every((slot) => slot.origin === 'none'));
  // 没有既有命令的槽不预告最后状态：配方是否补它还没有迁入管线。
  assert.ok(result.slots.every((slot) => Object.keys(slot.outcomes).length === 0));
});

test('render、execute、verify 尚未迁入：明确拒绝，退出码 2', (t) => {
  const workspace = makeWorkspace(t);
  for (const command of ['render', 'execute', 'verify']) {
    const result = helper(workspace, [command], { expect: EXIT.USAGE });
    assert.match(result.stderr, /尚未迁入/);
  }
  helper(workspace, ['nope'], { expect: EXIT.USAGE });
});
