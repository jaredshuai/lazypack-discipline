/**
 * scripts/test_clean_room_install.mjs
 *
 * 净室安装测试（#109）。只把 skills/lazypack-setup/ 拷到系统临时目录，
 * 再把夹具仓库拷到旁边，用拷出的那份 skill 里现有的确定性入口完成装配，
 * 然后断言产物。全程不调用本仓库里 skill 目录以外的任何脚本。
 *
 * 装配由夹具旁的预置回答文件 answers.json 驱动：
 *   - step3_answers 对应 SKILL.md 第 3 步会向用户提的问题；
 *   - assumed 替代真实装配中由探测、安装和 AI 撰写得到的结果。
 *
 * skill 里没有确定性入口的环节，由本文件「胶水」一节的函数代做。
 * 哪些环节是胶水、哪些完全没有覆盖，逐条列在
 * docs/agents/clean-room-install.md。本测试同时核对那张表：每一行的步骤
 * 编号都出自 SKILL.md，SKILL.md 的每个步骤编号也都在表里。
 *
 * 用法: node scripts/test_clean_room_install.mjs
 * 由 scripts/run_tests.mjs 汇总运行；.github/workflows/tests.yml 在
 * Linux、Windows、macOS 三个 runner 上各跑一次。只用 Node 标准库和 git。
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_SRC = path.join(REPO_ROOT, 'skills', 'lazypack-setup');
const FIXTURES = path.join(REPO_ROOT, 'scripts', 'fixtures', 'clean-room');
const COVERAGE_DOC = path.join(REPO_ROOT, 'docs', 'agents', 'clean-room-install.md');
const IS_WINDOWS = process.platform === 'win32';

const SLOTS = ['format', 'lint', 'test', 'type'];
const HOOK_PATH = '.githooks/pre-commit';

/** 受管产物：目标路径、所用模板、托管块名。顺序即写入顺序（Layer 0 在前，常驻入口最后）。 */
const LAYER0 = [
  { path: HOOK_PATH, template: 'pre-commit.sh', block: 'pre-commit-hook' },
  { path: 'CODING_STANDARDS.md', template: 'CODING_STANDARDS.md', block: 'coding-standards' },
  { path: 'RELEASE.md', template: 'RELEASE.md', block: 'release-discipline' },
  { path: 'docs/agents/roles.md', template: 'roles.md', block: 'agent-roles' }
];

/** 常驻入口托管块的固定依赖（references/managed-blocks.md §3.1.2）与各自的指针占位符。 */
const RESIDENT_DEPENDENCIES = [
  { path: 'CODING_STANDARDS.md', token: '__STANDARDS_POINTER__', answerKey: 'standards' },
  { path: 'RELEASE.md', token: '__RELEASE_POINTER__', answerKey: 'release' },
  { path: 'docs/ARTIFACTS.md', token: '__ARTIFACTS_POINTER__', answerKey: null },
  { path: 'docs/agents/roles.md', token: '__ROLES_POINTER__', answerKey: null }
];

/** 步骤覆盖表里唯一不带 SKILL.md 编号的行：第 5 步末尾的最终产物检查在 SKILL.md 里没有编号。 */
const UNNUMBERED_COVERAGE_ROW = '5（最终产物检查）';

/** 包内唯一规定了文字的指针行（references/managed-blocks.md §3.1.2 的 P7）。 */
const ROLES_POINTER =
  '- **角色与职责**：查阅 [docs/agents/roles.md](docs/agents/roles.md)，遵循各角色防撞车边界与项目指引。';

/** 留存维度的默认落点（SKILL.md 第 5 步第 5 项）。 */
const RETENTION_DEFAULT_PATHS = { ideas: 'docs/ideas/inbox.md', minutes: 'docs/interviews' };

/** 原样复制的种子文件：模板名 → 目标仓内路径（SKILL.md 第 5 步第 5 项）。 */
const SEED_COPIES = [
  { template: 'changelog.mjs', path: 'scripts/changelog.mjs' },
  { template: 'check_report_layers.mjs', path: 'scripts/check_report_layers.mjs' },
  { template: 'section9-discussion-protocol.md', path: 'docs/agents/section9-discussion-protocol.md' }
];

// ---------------------------------------------------------------------------
// 工作区与进程
// ---------------------------------------------------------------------------

/**
 * 建一个净室工作区：临时根目录下放 skill 的拷贝、夹具仓库的拷贝和一个放
 * 基线与 spec 的目录。三者互为兄弟，后者在目标仓之外，满足工具的路径要求。
 * 临时根取规范真实路径：macOS 的 /var 是符号链接，Windows 的 TEMP 可能是
 * 8.3 短名，两者都会被 skill 的脚本拒绝或误判。
 */
function makeWorkspace(t, fixtureName) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'lazypack-clean-room-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = {
    root,
    skill: path.join(root, 'lazypack-setup'),
    repo: path.join(root, 'repo'),
    artifacts: path.join(root, 'artifacts'),
    fixtureRepo: path.join(FIXTURES, fixtureName, 'repo'),
    answers: JSON.parse(fs.readFileSync(path.join(FIXTURES, fixtureName, 'answers.json'), 'utf8'))
  };
  fs.cpSync(SKILL_SRC, workspace.skill, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src)
  });
  fs.cpSync(workspace.fixtureRepo, workspace.repo, { recursive: true });
  fs.mkdirSync(workspace.artifacts);
  run('git', ['init', '--quiet', workspace.repo], { cwd: root, expect: [0] });
  return workspace;
}

/** 运行一个子进程，返回退出码与输出。expect 给出时，退出码不在其中即抛错并带上输出。 */
function run(command, args, { cwd, expect } = {}) {
  const child = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60000, windowsHide: true });
  if (child.error) {
    throw new Error(`无法运行 ${command} ${args.join(' ')}：${child.error.message}`);
  }
  if (expect && !expect.includes(child.status)) {
    throw new Error(
      `${command} ${args.join(' ')} 退出码 ${child.status}，预期 ${expect.join('/')}\n` +
        `stdout: ${child.stdout}\nstderr: ${child.stderr}`
    );
  }
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

/** 运行拷出的 skill 里的脚本。所有确定性入口都经这里调用，保证用的是拷贝而不是本仓库源目录。 */
function runSkillScript(workspace, script, args, options) {
  return run(process.execPath, [path.join(workspace.skill, 'scripts', script), ...args], options);
}

/** 调用 managed_blocks.mjs，成功时解析它输出的那一行 JSON。 */
function managedBlocks(workspace, args) {
  const result = runSkillScript(workspace, 'managed_blocks.mjs', args, { cwd: workspace.repo, expect: [0] });
  return JSON.parse(result.stdout);
}

/** 把 JSON 写到目标仓之外的 artifacts 目录，返回绝对路径。 */
function writeArtifact(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

// ---------------------------------------------------------------------------
// 胶水：skill 里没有确定性入口、真实装配中由 AI 按文档手算或手写的环节
// ---------------------------------------------------------------------------

/** 去 BOM 并把 CRLF 规范化为 LF。 */
function normalizeText(text) {
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

/** SHA-256 前 16 位小写十六进制。 */
function digest16(data) {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/** 读取拷出的 skill 里的文本文件。 */
function readSkillText(workspace, ...segments) {
  return fs.readFileSync(path.join(workspace.skill, ...segments), 'utf8');
}

/** 模板生成标识 gen（references/managed-blocks.md §4）。 */
function computeGen(workspace) {
  const dir = path.join(workspace.skill, 'templates');
  const names = fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const hash = createHash('sha256');
  for (const name of names) {
    hash.update(`${name}\0${normalizeText(fs.readFileSync(path.join(dir, name), 'utf8'))}\0`);
  }
  return hash.digest('hex').slice(0, 16);
}

/** 规范序列化：键按码点升序、紧凑 JSON（references/managed-blocks.md §3.2）。 */
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 输入摘要 input。 */
function computeInput(dictionary) {
  return digest16(Buffer.from(canonicalJson(dictionary), 'utf8'));
}

/** 从模板的 start 标记行读出固定层来源戳，例如 DECISIONS.md@0.7.0。 */
function templateSrc(template) {
  const match = /lazypack:start block=\S+ src=(\S+) /.exec(template);
  assert.ok(match, '模板的 start 标记行应带 src 字段');
  return match[1];
}

/** 由第 3 步的留存选择得到留存策略字典（references/managed-blocks.md §3.1.1）。 */
function buildRetention(workspace) {
  const { step3_answers: answers, assumed } = workspace.answers;
  const selected = answers['3.A.retention'].selected;
  const dimensions = selected.filter((item) => item !== 'decisions-only').sort();
  for (const dimension of dimensions) {
    assert.ok(dimension in RETENTION_DEFAULT_PATHS, `净室测试不支持留存维度 ${dimension}`);
  }
  const singleModes = { ideas: 'ideas-pool', minutes: 'minutes-only' };
  const mode =
    dimensions.length === 0 ? 'decisions-only' : dimensions.length === 1 ? singleModes[dimensions[0]] : 'hybrid';
  const enabled = (dimension) => dimensions.includes(dimension);
  const paths = {};
  const visibility = {};
  for (const dimension of ['ideas', 'minutes']) {
    paths[dimension] = enabled(dimension) ? RETENTION_DEFAULT_PATHS[dimension] : '';
    visibility[dimension] = enabled(dimension) ? assumed.repo_visibility : 'none';
  }
  paths.raw_qa = '';
  visibility.raw_qa = 'none';
  const retentionSrc = digest16(
    Buffer.from(normalizeText(readSkillText(workspace, 'references', 'retention-sections.md')), 'utf8')
  );
  return { dimensions, mode, paths, retentionSrc, visibility };
}

/** 读取所采纳的配方卡，返回身份、来源摘要和四槽的状态与命令。 */
function buildPreset(workspace) {
  const { step3_answers: answers, assumed } = workspace.answers;
  const chosen = answers['3.B.preset'];
  const card = readSkillText(workspace, 'presets', `${chosen.id}.md`);
  const id = /^id: (\S+)\s*$/m.exec(card)?.[1];
  const version = /^version: (\S+)\s*$/m.exec(card)?.[1];
  assert.equal(id, chosen.id, '配方卡 frontmatter 的 id 应与回答文件选的配方一致');
  assert.ok(version, '配方卡 frontmatter 应带 version');
  const slots = {};
  for (const slot of SLOTS) {
    assert.equal(chosen.slots[slot], 'accept', `净室测试只支持四槽全采纳的夹具，${slot} 不是 accept`);
    const { state, command } = assumed.slot_results[slot];
    assert.ok(
      card.includes(`\`${command}\``),
      `回答文件假定的 ${slot} 命令「${command}」应逐字出现在配方卡 ${chosen.id}.md 里`
    );
    slots[slot] = { state, command, provenance: `${state}:preset:recommended` };
  }
  return { id, version, presetSrc: digest16(Buffer.from(normalizeText(card), 'utf8')), slots };
}

/** 门禁命令写进单引号赋值前的转义（references/managed-blocks.md §5.4）。 */
function shellSingleQuoted(command) {
  return command.replaceAll("'", "'\\''");
}

/** 从磁盘事实得到依赖状态词（references/managed-blocks.md §3.1.2 第 2 点）。 */
function sampleArtifactState(repo, rel) {
  const abs = path.join(repo, rel);
  if (!fs.existsSync(abs)) {
    return 'missing';
  }
  const text = fs.readFileSync(abs, 'utf8');
  const hasStart = /lazypack:start block=/.test(text);
  const hasEnd = /lazypack:end block=/.test(text);
  if (hasStart && hasEnd) {
    return 'managed';
  }
  return hasStart || hasEnd ? 'broken' : 'paused';
}

/** 目标不存在时原样复制，已存在则保留本地副本。 */
function copyIfAbsent(source, target) {
  if (fs.existsSync(target)) {
    return 'preserved';
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return 'copied';
}

// ---------------------------------------------------------------------------
// 装配：先做第 1 步的包检查，再按 SKILL.md 第 5 步的顺序走一遍；只记录结果，不做断言
// ---------------------------------------------------------------------------

/**
 * 对工作区里的目标仓执行一遍装配。pass 用作 artifacts 子目录名，
 * 每一遍都重新取基线（基线文件不允许覆盖）。
 * 返回各步的结果；快照、写入、留存段落渲染或 CHANGELOG 初始化意外失败时抛错。
 * 包检查没通过时在写任何文件之前返回，record.stoppedAt 为 'package-check'。
 */
function install(workspace, pass) {
  const { assumed } = workspace.answers;
  const residentEntry = assumed.resident_entry;
  const record = { writes: {}, seeds: {}, stoppedAt: null };

  // 第 1 步里唯一的确定性入口：包完整性检查，在 skill 目录里运行。
  // SKILL.md 规定退出码非 0 时立即停止、不写入任何文件，这里照做。
  record.packageCheck = runSkillScript(workspace, 'package_manifest.mjs', ['check'], { cwd: workspace.skill });
  if (record.packageCheck.status !== 0) {
    record.stoppedAt = 'package-check';
    return record;
  }
  const artifacts = path.join(workspace.artifacts, pass);
  fs.mkdirSync(artifacts);

  // 写前基线。
  const managedPaths = [...LAYER0.map((item) => item.path), residentEntry];
  const baseline = path.join(artifacts, 'baseline.json');
  managedBlocks(workspace, [
    'snapshot',
    '--cwd',
    workspace.repo,
    '--files-json',
    writeArtifact(artifacts, 'files.json', managedPaths),
    '--out',
    baseline
  ]);

  const gen = computeGen(workspace);
  const preset = buildPreset(workspace);
  const retention = buildRetention(workspace);
  const commands = Object.fromEntries(SLOTS.map((slot) => [slot, preset.slots[slot].command]));

  /** 组装一份 spec 并调用 write，记录工具返回的状态。 */
  const write = (target, template, block, extraInput, replacements) => {
    const input = { commands, gen, platform: 'generic', src: templateSrc(template), ...extraInput };
    const spec = {
      path: target,
      block,
      template,
      replacements: { __GEN__: gen, __INPUT__: computeInput(input), ...replacements }
    };
    const specFile = writeArtifact(artifacts, `spec-${block}.json`, spec);
    const result = managedBlocks(workspace, [
      'write',
      '--cwd',
      workspace.repo,
      '--baseline',
      baseline,
      '--spec',
      specFile
    ]);
    record.writes[target] = result.status;
  };

  // 第 5 步第 5 项：Layer 0 的四份受管产物。
  for (const item of LAYER0) {
    const template = readSkillText(workspace, 'templates', item.template);
    if (item.block === 'pre-commit-hook') {
      const provenanceLine =
        `lazypack:preset id=${preset.id} version=${preset.version} ` +
        SLOTS.map((slot) => `${slot}=${preset.slots[slot].provenance}`).join(' ');
      const replacements = { __PRESET_PROVENANCE_LINE__: provenanceLine };
      for (const slot of SLOTS) {
        replacements[`__${slot.toUpperCase()}_STATUS__`] = preset.slots[slot].state;
        replacements[`__${slot.toUpperCase()}_CMD__`] = shellSingleQuoted(preset.slots[slot].command);
      }
      const extraInput = {
        preset: { id: preset.id, version: preset.version },
        presetSrc: preset.presetSrc,
        provenance: Object.fromEntries(SLOTS.map((slot) => [slot, preset.slots[slot].provenance]))
      };
      write(item.path, template, item.block, extraInput, replacements);
    } else if (item.block === 'agent-roles') {
      const policy = writeArtifact(artifacts, 'retention.json', retention);
      const section = runSkillScript(workspace, 'managed_blocks.mjs', ['render-retention', '--retention-json', policy], {
        cwd: workspace.repo,
        expect: [0]
      }).stdout;
      write(item.path, template, item.block, { retention }, {
        __INTERVIEW_RETENTION_SECTION__: section.replace(/\n$/, '')
      });
    } else {
      write(item.path, template, item.block, {}, {});
    }
  }

  // 第 5 步第 5 项：非受管种子。
  for (const seed of SEED_COPIES) {
    record.seeds[seed.path] = copyIfAbsent(
      path.join(workspace.skill, 'templates', seed.template),
      path.join(workspace.repo, ...seed.path.split('/'))
    );
  }
  if (retention.dimensions.includes('ideas')) {
    record.seeds[retention.paths.ideas] = copyIfAbsent(
      path.join(workspace.skill, 'templates', 'ideas-inbox.md'),
      path.join(workspace.repo, ...retention.paths.ideas.split('/'))
    );
  }
  if (retention.dimensions.includes('minutes')) {
    const minutesDir = path.join(workspace.repo, ...retention.paths.minutes.split('/'));
    record.seeds[retention.paths.minutes] = fs.existsSync(minutesDir) ? 'preserved' : 'created';
    fs.mkdirSync(minutesDir, { recursive: true });
  }
  const changelog = run(process.execPath, [path.join('scripts', 'changelog.mjs'), 'init'], {
    cwd: workspace.repo,
    expect: [0, 1]
  });
  record.changelogInit = /^changelog init: (\S+)$/m.exec(changelog.stdout)?.[1] ?? null;

  // 第 5 步第 6 项（登记册 docs/ARTIFACTS.md）没有确定性入口，这里不写。

  // 第 5 步第 7 项：Layer 0 写完后重新从磁盘采样依赖状态，再写常驻入口。
  const artifactStates = Object.fromEntries(
    RESIDENT_DEPENDENCIES.map((item) => [item.path, sampleArtifactState(workspace.repo, item.path)])
  );
  record.artifactStates = artifactStates;
  let residentTemplate = readSkillText(workspace, 'templates', 'resident-entry.md');
  const pointerReplacements = {};
  for (const dependency of RESIDENT_DEPENDENCIES) {
    if (artifactStates[dependency.path] !== 'managed') {
      // 依赖未受管时整行省略，不留空行。
      residentTemplate = residentTemplate.replace(new RegExp(`^${dependency.token}\\r?\\n`, 'm'), '');
    } else if (dependency.token === '__ROLES_POINTER__') {
      pointerReplacements[dependency.token] = ROLES_POINTER;
    } else if (dependency.answerKey) {
      pointerReplacements[dependency.token] = assumed.resident_pointers[dependency.answerKey];
    } else {
      throw new Error(`${dependency.path} 已受管，但净室测试没有它的指针行文字`);
    }
  }
  write(residentEntry, residentTemplate, 'resident-discipline', { artifacts: artifactStates }, pointerReplacements);

  // 第 5 步第 8 项：生效副作用。SKILL.md 写的是直接执行 git config，这里照做，不先读后写；
  // git 每次都会重写 .git/config，所以重跑的不变断言对它只比字节（见 describeTree）。
  run('git', ['-C', workspace.repo, 'config', 'core.hooksPath', '.githooks'], { expect: [0] });
  if (!IS_WINDOWS) {
    fs.chmodSync(path.join(workspace.repo, '.githooks', 'pre-commit'), 0o755);
  }
  record.hookVerify = runSkillScript(workspace, 'verify_hook_install.mjs', [
    '--cwd',
    workspace.repo,
    '--mode',
    assumed.hook_mode
  ]);

  // 第 5 步末尾的最终产物检查。
  record.blocksVerify = runSkillScript(
    workspace,
    'managed_blocks.mjs',
    ['verify', '--cwd', workspace.repo, '--baseline', baseline],
    { cwd: workspace.repo }
  );
  record.managedPaths = managedPaths;
  return record;
}

// ---------------------------------------------------------------------------
// 断言用的辅助
// ---------------------------------------------------------------------------

/**
 * 目标仓的文件清单，用来判断原样重跑动过什么。
 * 工作树里每个文件记字节摘要和修改时间，POSIX 上再记权限位（Windows 上不记）；
 * 目录只记存在。.git 目录里只记 .git/config 的字节摘要，不记修改时间：
 * 装配每一遍都执行 git config，git 会用相同内容重写这个文件。
 */
function describeTree(repo) {
  const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const tree = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(repo, abs).split(path.sep).join('/');
      if (rel === '.git') {
        continue;
      }
      if (entry.isDirectory()) {
        tree[`${rel}/`] = 'dir';
        walk(abs);
      } else {
        const stat = fs.statSync(abs, { bigint: true });
        const mode = IS_WINDOWS ? '' : ` mode=${(Number(stat.mode) & 0o777).toString(8)}`;
        tree[rel] = `sha256=${sha256(abs)} mtime=${stat.mtimeNs}${mode}`;
      }
    }
  };
  walk(repo);
  tree['.git/config'] = `sha256=${sha256(path.join(repo, '.git', 'config'))}`;
  return tree;
}

/** 解析工具输出的最后一行 JSON；解析不了时返回 null。 */
function lastJsonLine(text) {
  const line = text.trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** 断言 Hook 静态验收通过。 */
function assertHookVerified(record) {
  assert.equal(record.hookVerify.status, 0, `Hook 静态验收应通过：${record.hookVerify.stdout}${record.hookVerify.stderr}`);
  assert.equal(lastJsonLine(record.hookVerify.stdout)?.code, 'CONFIGURED_STATIC_ONLY');
}

/** 断言托管产物通过 managed_blocks.mjs verify。 */
function assertBlocksVerified(record) {
  assert.equal(
    record.blocksVerify.status,
    0,
    `managed_blocks.mjs verify 应通过：${record.blocksVerify.stdout}${record.blocksVerify.stderr}`
  );
  const report = JSON.parse(record.blocksVerify.stdout);
  assert.equal(report.status, 'verified');
  assert.equal(report.files, record.managedPaths.length);
  assert.deepEqual(report.failures, []);
}

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

for (const fixtureName of ['ts-new', 'py-new']) {
  test(`${fixtureName}：只用拷出的 skill 完成装配，产物通过核验，原样重跑不改工作树`, (t) => {
    const workspace = makeWorkspace(t, fixtureName);
    const { assumed, step3_answers: answers } = workspace.answers;
    const hookFile = path.join(workspace.repo, '.githooks', 'pre-commit');
    const residentEntry = assumed.resident_entry;
    const residentBefore = fs.readFileSync(path.join(workspace.fixtureRepo, residentEntry));

    const first = install(workspace, 'pass-1');

    assert.equal(
      first.packageCheck.status,
      0,
      `拷出的 skill 应通过包检查：${first.packageCheck.stdout}${first.packageCheck.stderr}`
    );
    assert.equal(first.stoppedAt, null);

    // pre-commit hook：存在、第一行是 shebang、POSIX 上有可执行位。
    assert.ok(fs.statSync(hookFile).isFile(), 'pre-commit hook 应存在且是普通文件');
    const hookBytes = fs.readFileSync(hookFile);
    assert.equal(hookBytes.subarray(0, hookBytes.indexOf(0x0a) + 1).toString('utf8'), '#!/bin/sh\n');
    assert.ok(!hookBytes.includes(0x0d), 'pre-commit hook 全文应只有 LF');
    if (!IS_WINDOWS) {
      assert.equal(fs.statSync(hookFile).mode & 0o111, 0o111, 'pre-commit hook 应有可执行位');
    }
    assert.equal(
      run('git', ['-C', workspace.repo, 'config', '--get', 'core.hooksPath'], { expect: [0] }).stdout.trim(),
      '.githooks'
    );
    assertHookVerified(first);

    // Hook 里的槽位状态、命令和出处行来自回答文件。
    const hookText = hookBytes.toString('utf8');
    for (const slot of SLOTS) {
      const { state, command } = assumed.slot_results[slot];
      assert.ok(hookText.includes(`${slot.toUpperCase()}_STATUS='${state}'\n`), `${slot} 槽位状态应写进 Hook`);
      assert.ok(hookText.includes(`${slot.toUpperCase()}_CMD='${command}'\n`), `${slot} 槽位命令应写进 Hook`);
    }
    // 出处行整行核对：配方身份取自回答文件与配方卡，四槽出处都是「状态:preset:recommended」。
    const presetId = answers['3.B.preset'].id;
    const presetVersion = /^version: (\S+)\s*$/m.exec(readSkillText(workspace, 'presets', `${presetId}.md`))?.[1];
    assert.ok(presetVersion, '配方卡应带 version');
    const provenanceLine =
      `# lazypack:preset id=${presetId} version=${presetVersion} ` +
      SLOTS.map((slot) => `${slot}=${assumed.slot_results[slot].state}:preset:recommended`).join(' ');
    assert.deepEqual(
      hookText.split('\n').filter((line) => line.startsWith('# lazypack:preset')),
      [provenanceLine],
      'Hook 应恰有一行出处行，且四个槽位的出处都与回答文件一致'
    );

    // 托管产物：新文件走 create，已有的常驻入口走 append 且块外字节不变。
    const expectedWrites = Object.fromEntries(LAYER0.map((item) => [item.path, 'create']));
    expectedWrites[residentEntry] = 'append';
    assert.deepEqual(first.writes, expectedWrites);
    assertBlocksVerified(first);
    for (const rel of first.managedPaths) {
      const text = fs.readFileSync(path.join(workspace.repo, ...rel.split('/')), 'utf8');
      assert.doesNotMatch(text, /__[A-Z][A-Z0-9_]*__/, `${rel} 不应残留占位符`);
    }
    const residentAfter = fs.readFileSync(path.join(workspace.repo, residentEntry));
    assert.ok(
      residentAfter.subarray(0, residentBefore.length).equals(residentBefore),
      `${residentEntry} 原有内容应逐字节保留在托管块之前`
    );

    // 常驻入口的指针行跟随依赖的真实状态：登记册没写，所以没有它的指针行。
    assert.deepEqual(first.artifactStates, {
      'CODING_STANDARDS.md': 'managed',
      'RELEASE.md': 'managed',
      'docs/ARTIFACTS.md': 'missing',
      'docs/agents/roles.md': 'managed'
    });
    const residentText = residentAfter.toString('utf8');
    assert.ok(residentText.includes(ROLES_POINTER), '常驻入口应带角色指针行');
    assert.ok(!residentText.includes('docs/ARTIFACTS.md'), '登记册未生成时常驻入口不应指向它');
    assert.ok(
      readSkillText(workspace, 'references', 'managed-blocks.md').includes(`\`${ROLES_POINTER}\``),
      '测试里的角色指针行文字应与 references/managed-blocks.md 规定的一致'
    );

    // 留存：角色文件里有留存段落，种子与入口跟随第 3 步的选择。
    const selected = answers['3.A.retention'].selected;
    const rolesText = fs.readFileSync(path.join(workspace.repo, 'docs', 'agents', 'roles.md'), 'utf8');
    assert.match(rolesText, /## 3\. 规划者访谈与碎片想法留存指引\n\n> [^\n]+\n\n\S/);
    assert.equal(fs.existsSync(path.join(workspace.repo, 'docs', 'ideas', 'inbox.md')), selected.includes('ideas'));
    assert.equal(fs.existsSync(path.join(workspace.repo, 'docs', 'interviews')), selected.includes('minutes'));

    // 非受管种子。
    for (const seed of SEED_COPIES) {
      assert.equal(first.seeds[seed.path], 'copied');
      assert.ok(
        fs
          .readFileSync(path.join(workspace.repo, ...seed.path.split('/')))
          .equals(fs.readFileSync(path.join(workspace.skill, 'templates', seed.template))),
        `${seed.path} 应与模板逐字节相同`
      );
    }
    assert.equal(first.changelogInit, 'created');
    assert.ok(fs.statSync(path.join(workspace.repo, 'CHANGELOG.md')).size > 0, 'CHANGELOG.md 应非空');

    // 原样重跑：每份托管产物都是 noop，种子不覆盖；工作树文件的字节和修改时间不变，
    // .git/config 的字节不变。
    const treeBefore = describeTree(workspace.repo);
    const second = install(workspace, 'pass-2');
    assert.deepEqual(
      second.writes,
      Object.fromEntries(first.managedPaths.map((rel) => [rel, 'noop']))
    );
    assert.ok(
      Object.values(second.seeds).every((action) => action === 'preserved'),
      `重跑时种子应全部原位保留：${JSON.stringify(second.seeds)}`
    );
    assert.equal(second.changelogInit, 'exists-kept');
    assertHookVerified(second);
    assertBlocksVerified(second);
    assert.deepEqual(describeTree(workspace.repo), treeBefore);
  });
}

test('拷出的 skill 里去掉 Hook 模板的 shebang：包检查拦下并中止，清单一并改过时由 Hook 静态验收拦下', (t) => {
  const workspace = makeWorkspace(t, 'ts-new');
  const templateFile = path.join(workspace.skill, 'templates', 'pre-commit.sh');
  const template = fs.readFileSync(templateFile, 'utf8');
  assert.ok(template.startsWith('#!/bin/sh\n'), 'Hook 模板第一行应是 shebang');
  fs.writeFileSync(templateFile, template.slice('#!/bin/sh\n'.length), 'utf8');

  // 只改模板：清单对不上，包检查失败，装配在写任何文件之前停下。
  const treeBefore = describeTree(workspace.repo);
  const stopped = install(workspace, 'pass-1');
  assert.notEqual(stopped.packageCheck.status, 0, '模板被改后包检查应失败');
  assert.equal(stopped.stoppedAt, 'package-check');
  assert.deepEqual(stopped.writes, {});
  assert.deepEqual(describeTree(workspace.repo), treeBefore, '包检查失败后目标仓不应有任何改动');
  assert.deepEqual(fs.readdirSync(workspace.artifacts), [], '包检查失败后不应取基线');

  // 清单也按改过的模板重新生成：包检查不再能发现，装配继续，由 Hook 静态验收拦下。
  runSkillScript(workspace, 'package_manifest.mjs', ['generate'], { cwd: workspace.skill, expect: [0] });
  const record = install(workspace, 'pass-2');
  assert.equal(record.packageCheck.status, 0, '清单重新生成后包检查应通过');
  assert.equal(record.stoppedAt, null);
  assert.equal(record.writes[HOOK_PATH], 'create');
  assert.notEqual(
    fs.readFileSync(path.join(workspace.repo, '.githooks', 'pre-commit'), 'utf8').split('\n')[0],
    '#!/bin/sh'
  );
  assert.equal(record.hookVerify.status, 1);
  assert.equal(lastJsonLine(record.hookVerify.stdout)?.code, 'WRONG_NEW_SHEBANG');
});

test('步骤覆盖表每一行的编号都出自 SKILL.md，SKILL.md 的每个步骤编号都在表里', () => {
  const skill = fs.readFileSync(path.join(SKILL_SRC, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const expected = new Set();
  const withSubItems = new Set();
  for (const match of skill.matchAll(/^#### (\d+)\.([A-Z]) /gm)) {
    expected.add(`${match[1]}.${match[2]}`);
    withSubItems.add(match[1]);
  }
  const stepFive = /^### 第 5 步[^\n]*\n([\s\S]*?)^### 第 6 步/m.exec(skill)?.[1] ?? '';
  for (const match of stepFive.matchAll(/^(\d+)\. \*\*/gm)) {
    expected.add(`5.${match[1]}`);
    withSubItems.add('5');
  }
  for (const match of skill.matchAll(/^### 第 (\d+) 步/gm)) {
    if (!withSubItems.has(match[1])) {
      expected.add(match[1]);
    }
  }
  assert.ok(expected.size >= 16, `应能从 SKILL.md 读出全部步骤编号，实际只有 ${[...expected].join(' ')}`);

  const doc = fs.readFileSync(COVERAGE_DOC, 'utf8').replace(/\r\n/g, '\n');
  const table = /^## 步骤覆盖表\n([\s\S]*?)(?=^## )/m.exec(doc)?.[1] ?? '';
  const firstCells = table
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1].trim());
  assert.deepEqual(firstCells.slice(0, 2), ['步骤', '---'], '步骤覆盖表应以表头行和分隔行开头');
  const listed = new Set();
  const unknown = [];
  for (const cell of firstCells.slice(2)) {
    if (expected.has(cell)) {
      listed.add(cell);
    } else if (cell !== UNNUMBERED_COVERAGE_ROW) {
      unknown.push(cell);
    }
  }
  assert.deepEqual(unknown, [], '步骤覆盖表里有不是 SKILL.md 步骤编号的行');
  const sorted = (set) => [...set].sort();
  assert.deepEqual(sorted(listed), sorted(expected), 'SKILL.md 的每个步骤编号都应在步骤覆盖表里');
});
