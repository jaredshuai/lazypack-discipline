#!/usr/bin/env node
/**
 * setup_helper.mjs
 *
 * setup 管线入口（#113 结论的迁移顺序第 1 项，#114）。只用 Node 标准库。
 * 文件格式与取舍见 references/setup-pipeline.md；本文件是该格式的实现。
 *
 * 命令列表（本票只实现前两个）:
 *   scan --cwd <repoRoot> [--out <facts.json>]
 *       只读探测第 2 步第 4 项：既有质量门禁命令。输出事实文件
 *       (schema lazypack-facts/1, covers [4])，facts 里只有 kind=existing-command；
 *       根 package.json 的每个 scripts 条目都是一条事实。
 *   plan --cwd <repoRoot> --facts <facts.json> --answers <answers.json> [--out <plan.json>]
 *       重扫目标仓并与事实文件的 machineFp 比对，一致才出计划
 *       (schema lazypack-plan/1)；本票只出 slots，不出 actions。
 *   render、execute、verify：尚未迁入。
 *
 * 退出码: 0 成功 | 1 输入或内容错误（含事实文件自身被改坏、同槽冲突） | 2 用法错误（含缺 --cwd）
 *         | 3 输出路径不安全 | 4 目标仓自 scan 后变了（零输出）
 *
 * 要点：
 *   - invocation 由包管理器与脚本名合成（依据 packageManager 字段或锁文件，默认 npm），
 *     不是逐字摘录；逐字记录的是 definition，它只作证据，任何阶段都不拿它拆子命令。
 *   - 探测只读，不运行包管理器、构建工具或项目测试。
 *   - 事实、回答、计划文件必须写在目标仓之外。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const EXIT = Object.freeze({ OK: 0, ERROR: 1, USAGE: 2, UNSAFE: 3, STALE: 4 });
export const FACTS_SCHEMA = 'lazypack-facts/1';
export const ANSWERS_SCHEMA = 'lazypack-answers/1';
export const PLAN_SCHEMA = 'lazypack-plan/1';
/** 槽的固定顺序与 verification.md §3.3 的执行顺序一致。 */
export const SLOTS = Object.freeze(['format', 'lint', 'type', 'test']);
/** 脚本名到槽的对应：只认这几个名字；其余脚本默认不认领任何槽，要覆盖某个槽须由 AI 读脚本后写 coverage 判断。 */
const NAME_TO_SLOT = Object.freeze({
  format: 'format',
  lint: 'lint',
  type: 'type',
  typecheck: 'type',
  'type-check': 'type',
  test: 'test'
});
const JUDGMENT_KINDS = ['coverage', 'dissent', 'repo-visibility'];
const ANSWER_ORIGINS = ['interactive', 'preset'];

export class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// 规范序列化与摘要（references/managed-blocks.md §3.2：键按码点升序、紧凑 JSON、UTF-8；
// 摘要取 SHA-256 十六进制全长）
// ---------------------------------------------------------------------------

/** UTF-8 字节序与 Unicode 码点序一致，所以用字节比较排键。 */
function compareCodePoints(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort(compareCodePoints);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  const text = JSON.stringify(value);
  if (text === undefined) throw new CliError(EXIT.ERROR, '内部错误：规范序列化遇到不可序列化的值');
  return text;
}

export function digest(value) {
  return crypto.createHash('sha256').update(Buffer.from(canonicalJson(value), 'utf8')).digest('hex');
}

// ---------------------------------------------------------------------------
// 路径与文件
// ---------------------------------------------------------------------------

function realRepoRoot(cwd) {
  let real;
  try {
    real = fs.realpathSync(path.resolve(cwd));
  } catch {
    throw new CliError(EXIT.ERROR, `目标仓目录不存在：${cwd}`);
  }
  if (!fs.statSync(real).isDirectory()) throw new CliError(EXIT.ERROR, `目标仓不是目录：${cwd}`);
  return real;
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** 输出文件必须在目标仓之外；父目录取真实路径再比较（macOS 的临时目录经过符号链接）。 */
function assertSafeOutput(repoRoot, out) {
  const abs = path.resolve(out);
  let parent;
  try {
    parent = fs.realpathSync(path.dirname(abs));
  } catch {
    throw new CliError(EXIT.UNSAFE, `输出目录不存在：${path.dirname(abs)}`);
  }
  const target = path.join(parent, path.basename(abs));
  if (isInside(repoRoot, target)) {
    throw new CliError(EXIT.UNSAFE, `输出文件不能放在目标仓内：${out}（事实、回答、计划文件放系统临时目录下本次运行专用的子目录）`);
  }
  try {
    if (fs.lstatSync(target).isSymbolicLink()) throw new CliError(EXIT.UNSAFE, `输出路径是符号链接：${out}`);
  } catch (err) {
    if (err instanceof CliError) throw err;
  }
  return target;
}

function readJsonFile(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new CliError(EXIT.ERROR, `读不到${label}：${file}`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new CliError(EXIT.ERROR, `${label}不是合法 JSON：${err.message}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// scan：既有质量门禁命令（第 2 步第 4 项）
// ---------------------------------------------------------------------------

function detectPackageManager(repoRoot, manifest) {
  if (typeof manifest.packageManager === 'string') {
    const name = manifest.packageManager.split('@')[0];
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(name)) return name;
  }
  const has = (file) => fs.existsSync(path.join(repoRoot, file));
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lock') || has('bun.lockb')) return 'bun';
  return 'npm';
}

/** 项目现在怎么调用这个脚本。bun 的 `bun test` 是内置测试运行器，不是脚本，所以一律写 run。 */
function invocationFor(packageManager, scriptName) {
  if (scriptName === 'test' && packageManager !== 'bun') return `${packageManager} test`;
  return `${packageManager} run ${scriptName}`;
}

export function scanExistingCommands(cwd) {
  const repoRoot = realRepoRoot(cwd);
  const manifestPath = path.join(repoRoot, 'package.json');
  let stat;
  try {
    stat = fs.lstatSync(manifestPath);
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return [];
    throw new CliError(EXIT.ERROR, `读取 package.json 的状态失败（${err?.code ?? err?.message}），不继续：${manifestPath}`);
  }
  if (!stat.isFile()) throw new CliError(EXIT.ERROR, 'package.json 不是普通文件（符号链接或目录），不读取');
  const manifest = readJsonFile(manifestPath, 'package.json');
  if (!isPlainObject(manifest) || !isPlainObject(manifest.scripts)) return [];

  const packageManager = detectPackageManager(repoRoot, manifest);
  const facts = [];
  for (const name of Object.keys(manifest.scripts)) {
    const definition = manifest.scripts[name];
    if (typeof definition !== 'string' || definition.trim() === '') continue;
    const locator = `scripts.${name}`;
    facts.push({
      id: `cmd:package.json#${locator}`,
      item: 4,
      kind: 'existing-command',
      value: {
        invocation: invocationFor(packageManager, name),
        cwd: '.',
        definedAt: { path: 'package.json', locator },
        definition
      },
      source: 'machine',
      evidence: { path: 'package.json', locator }
    });
  }
  facts.sort((a, b) => compareCodePoints(a.id, b.id));
  return facts;
}

export function buildFactsFile(cwd) {
  const facts = scanExistingCommands(cwd);
  return {
    schema: FACTS_SCHEMA,
    scope: 'full',
    covers: [4],
    facts,
    judgments: [],
    machineFp: digest(facts)
  };
}

// ---------------------------------------------------------------------------
// plan：槽位分配（只出 slots）
// ---------------------------------------------------------------------------

function describeFactChanges(recordedFacts, currentFacts) {
  const recorded = new Map(recordedFacts.map((fact) => [fact?.id, fact]));
  const current = new Map(currentFacts.map((fact) => [fact.id, fact]));
  const changes = [];
  for (const [id, fact] of current) {
    if (!recorded.has(id)) changes.push(`新增：${id}`);
    else if (canonicalJson(recorded.get(id)) !== canonicalJson(fact)) changes.push(`变化：${id}`);
  }
  for (const id of recorded.keys()) {
    if (!current.has(id)) changes.push(`消失：${id}`);
  }
  return changes;
}

function validateFactsFile(file) {
  if (!isPlainObject(file) || file.schema !== FACTS_SCHEMA) {
    throw new CliError(EXIT.ERROR, `事实文件的 schema 必须是 ${FACTS_SCHEMA}`);
  }
  if (file.scope !== 'full') throw new CliError(EXIT.ERROR, '事实文件的 scope 本票只支持 full');
  if (canonicalJson(file.covers) !== canonicalJson([4])) {
    throw new CliError(EXIT.ERROR, '事实文件的 covers 必须是 [4]（本票只迁入第 2 步第 4 项）');
  }
  if (!Array.isArray(file.facts)) throw new CliError(EXIT.ERROR, '事实文件缺少 facts 数组');
  if (!Array.isArray(file.judgments)) throw new CliError(EXIT.ERROR, '事实文件缺少 judgments 数组');
  if (typeof file.machineFp !== 'string') throw new CliError(EXIT.ERROR, '事实文件缺少 machineFp');
}

function validateJudgments(judgments, factIds) {
  const seen = new Set();
  for (const judgment of judgments) {
    const where = `判断 ${isPlainObject(judgment) ? JSON.stringify(judgment.id) : '(非对象)'}`;
    if (!isPlainObject(judgment)) throw new CliError(EXIT.ERROR, `judgments 里有非对象的项`);
    if (typeof judgment.id !== 'string' || judgment.id === '') throw new CliError(EXIT.ERROR, `${where}：缺少 id`);
    if (seen.has(judgment.id)) throw new CliError(EXIT.ERROR, `${where}：id 重复`);
    seen.add(judgment.id);
    if (judgment.source !== 'ai') throw new CliError(EXIT.ERROR, `${where}：source 必须是 ai`);
    if (!JUDGMENT_KINDS.includes(judgment.kind)) {
      throw new CliError(EXIT.ERROR, `${where}：kind 必须是 ${JUDGMENT_KINDS.join('、')} 之一`);
    }
    if (typeof judgment.basis !== 'string' || judgment.basis.trim() === '') {
      throw new CliError(EXIT.ERROR, `${where}：缺少 basis（依据）`);
    }
    if (!isPlainObject(judgment.value)) throw new CliError(EXIT.ERROR, `${where}：value 必须是对象`);
    if (judgment.about !== null && typeof judgment.about !== 'string') {
      throw new CliError(EXIT.ERROR, `${where}：about 必须是事实 id 或 null`);
    }
    if (judgment.about !== null && !factIds.has(judgment.about)) {
      throw new CliError(EXIT.ERROR, `${where}：about 必须指向一条现有事实的 id，收到 ${JSON.stringify(judgment.about)}`);
    }
    if (judgment.kind === 'coverage' && judgment.about === null) {
      throw new CliError(EXIT.ERROR, `${where}：coverage 的 about 必须指向一条现有事实的 id，不能是 null`);
    }
    if (judgment.kind === 'coverage') {
      const { slots, compliant } = judgment.value;
      const slotsOk = Array.isArray(slots) && new Set(slots).size === slots.length &&
        slots.every((slot) => SLOTS.includes(slot));
      if (!slotsOk) throw new CliError(EXIT.ERROR, `${where}：coverage.slots 必须是 ${SLOTS.join('、')} 的不重复子集（可以是空数组，表示这条命令不认领任何槽）`);
      if (typeof compliant !== 'boolean') throw new CliError(EXIT.ERROR, `${where}：coverage.compliant 必须是布尔值`);
    }
  }
}

function validateAnswers(answers) {
  if (!isPlainObject(answers) || answers.schema !== ANSWERS_SCHEMA) {
    throw new CliError(EXIT.ERROR, `回答文件的 schema 必须是 ${ANSWERS_SCHEMA}`);
  }
  if (!ANSWER_ORIGINS.includes(answers.origin)) {
    throw new CliError(EXIT.ERROR, `回答文件的 origin 必须是 ${ANSWER_ORIGINS.join(' 或 ')}`);
  }
  if (!isPlainObject(answers.answers)) throw new CliError(EXIT.ERROR, '回答文件缺少 answers 对象');
  if (answers.rulings !== undefined && !Array.isArray(answers.rulings)) {
    throw new CliError(EXIT.ERROR, '回答文件的 rulings 必须是数组');
  }
  (answers.rulings ?? []).forEach((ruling, index) => {
    if (!isPlainObject(ruling) || typeof ruling.judgment !== 'string' || typeof ruling.adopt !== 'boolean') {
      throw new CliError(EXIT.ERROR, `回答文件的 rulings[${index}] 必须是对象，含字符串 judgment 与布尔 adopt`);
    }
  });
}

const scriptNameOf = (fact) => fact.value.definedAt.locator.replace(/^scripts\./, '');

/**
 * 槽位分配。不读 definition 的内容，更不拆它：
 *   - 有 coverage 判断的事实：判断的 slots 就是它认领的全部槽（取代按名字认领），可以是空数组；
 *     compliant 为 false 则不认领任何槽（Hook PAUSE，不盲目拆解）。每条事实最多一条 coverage 判断。
 *   - 没有判断的事实：按脚本名认领同名的一个槽；名字不在表里则不认领。
 *   - 同一个槽被两条及以上不同事实认领（不论来自判断还是名字）：停下，由 AI 补判断，不择一。
 */
export function assignSlots(facts, judgments) {
  const coverageByFact = new Map();
  for (const judgment of judgments) {
    if (judgment.kind !== 'coverage') continue;
    if (coverageByFact.has(judgment.about)) {
      throw new CliError(EXIT.ERROR, `事实 ${judgment.about} 有多条 coverage 判断，只能保留一条`);
    }
    coverageByFact.set(judgment.about, judgment);
  }

  const claims = new Map(SLOTS.map((slot) => [slot, []]));
  const paused = new Map();
  const unassignedReason = new Map();
  for (const fact of facts) {
    const judgment = coverageByFact.get(fact.id);
    if (judgment) {
      if (!judgment.value.compliant) {
        paused.set(fact.id, judgment);
        unassignedReason.set(fact.id, 'hook-pause');
      } else if (judgment.value.slots.length === 0) {
        unassignedReason.set(fact.id, `judged-no-slot:${judgment.id}`);
      } else {
        for (const slot of judgment.value.slots) claims.get(slot).push({ fact, via: `判断 ${judgment.id}` });
      }
    } else {
      const slot = NAME_TO_SLOT[scriptNameOf(fact)];
      if (slot) claims.get(slot).push({ fact, via: '按名字' });
      else unassignedReason.set(fact.id, 'no-slot-name');
    }
  }

  const conflicts = SLOTS.filter((slot) => claims.get(slot).length > 1);
  if (conflicts.length > 0) {
    const lines = conflicts.map(
      (slot) => `槽 ${slot} 被多条既有命令认领：\n${claims.get(slot).map(({ fact, via }) => `    - ${fact.id}（来源：${via}）`).join('\n')}`
    );
    throw new CliError(
      EXIT.ERROR,
      `${lines.join('\n')}\n补救：改其中某条判断的 slots，去掉这个槽；或为某条按名字认领的事实写一条 coverage 判断（slots 不含这个槽，可以为空数组）。`
    );
  }

  const slots = [];
  const used = new Set();
  for (const slot of SLOTS) {
    const [claim] = claims.get(slot);
    if (claim) {
      const { fact } = claim;
      used.add(fact.id);
      slots.push({
        slot,
        origin: 'existing',
        command: fact.value.invocation,
        cwd: fact.value.cwd,
        from: fact.id,
        needs: [],
        outcomes: { wired: { provenance: 'wired:existing:pre-existing', writeCommand: true } }
      });
      continue;
    }
    const pausedFor = [...paused.values()].find(
      (judgment) => judgment.value.slots.includes(slot) || NAME_TO_SLOT[scriptNameOf(facts.find((f) => f.id === judgment.about))] === slot
    );
    slots.push({
      slot,
      origin: 'none',
      command: null,
      cwd: null,
      from: null,
      needs: [],
      reason: pausedFor ? `hook-pause:${pausedFor.about}` : 'no-existing-command',
      // 配方是否补这个槽尚未迁入管线，所以这里不预告它最后的状态。
      outcomes: {}
    });
  }

  const unassigned = facts
    .filter((fact) => !used.has(fact.id))
    .map((fact) => ({ from: fact.id, reason: unassignedReason.get(fact.id) }));
  return { slots, unassigned };
}

export function buildPlan({ cwd, factsFile, answersFile }) {
  const repoRoot = realRepoRoot(cwd);
  validateFactsFile(factsFile);
  validateAnswers(answersFile);

  // 不信任事实文件里 facts 段自称的内容：先看它与自带的 machineFp 是否自洽，再重扫比对。
  const currentFacts = scanExistingCommands(repoRoot);
  const currentFp = digest(currentFacts);
  if (digest(factsFile.facts) !== factsFile.machineFp) {
    throw new CliError(EXIT.ERROR, '事实文件的 facts 段与它自带的 machineFp 不一致，文件被改动过。请重新运行 scan');
  }
  if (currentFp !== factsFile.machineFp) {
    const changes = describeFactChanges(factsFile.facts, currentFacts);
    throw new CliError(
      EXIT.STALE,
      `目标仓的既有命令自上次 scan 以来变了（machineFp 不一致），不出计划：\n  ${changes.join('\n  ') || '（无法定位到具体条目）'}\n请重新运行 scan。`
    );
  }

  const factIds = new Set(currentFacts.map((fact) => fact.id));
  validateJudgments(factsFile.judgments, factIds);
  const judgments = [...factsFile.judgments].sort((a, b) => compareCodePoints(a.id, b.id));
  const { slots, unassigned } = assignSlots(currentFacts, judgments);

  const usedJudgmentIds = judgments
    .filter((judgment) => judgment.kind === 'coverage')
    .map((judgment) => judgment.id);

  const plan = {
    schema: PLAN_SCHEMA,
    factsFp: currentFp,
    judgmentsFp: digest(judgments),
    answersFp: digest(answersFile),
    answersOrigin: answersFile.origin,
    docPlanFp: null,
    covers: ['gate-slots'],
    slots,
    unassigned,
    aiItems: usedJudgmentIds
  };
  plan.planFp = digest(plan);
  return plan;
}

// ---------------------------------------------------------------------------
// 命令行
// ---------------------------------------------------------------------------

const OPTIONS = {
  cwd: { type: 'string' },
  facts: { type: 'string' },
  answers: { type: 'string' },
  out: { type: 'string' },
  help: { type: 'boolean', short: 'h' }
};

const USAGE = `
Usage: node setup_helper.mjs <command> [options]

Commands:
  scan  --cwd <repoRoot> [--out <facts.json>]
        只读探测既有质量门禁命令，输出事实文件 (lazypack-facts/1)
  plan  --cwd <repoRoot> --facts <facts.json> --answers <answers.json> [--out <plan.json>]
        重扫并与 machineFp 比对，一致才生成槽位计划 (lazypack-plan/1)
  render, execute, verify    尚未迁入

事实、回答、计划文件必须在目标仓之外。格式见 references/setup-pipeline.md。
`;

/** target 是 assertSafeOutput 返回的规范路径；没有 --out 时为 null，打印到标准输出。 */
function emit(value, target, summary) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (!target) {
    process.stdout.write(json);
    return;
  }
  fs.writeFileSync(target, json, 'utf8');
  console.log(`${summary}\n输出已写入 ${target}`);
}

export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (err) {
    throw new CliError(EXIT.USAGE, `${err.message}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  const command = positionals[0];
  if (values.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  if (!command) throw new CliError(EXIT.USAGE, `缺少子命令\n${USAGE}`);
  if ((command === 'scan' || command === 'plan') && !values.cwd) {
    throw new CliError(EXIT.USAGE, `缺少 --cwd <目标仓>（必填，不再默认当前目录）\n${USAGE}`);
  }

  if (command === 'scan') {
    const repoRoot = realRepoRoot(values.cwd);
    const target = values.out ? assertSafeOutput(repoRoot, values.out) : null;
    const factsFile = buildFactsFile(repoRoot);
    emit(factsFile, target, `扫描完成：${factsFile.facts.length} 条既有命令，machineFp ${factsFile.machineFp}`);
    return EXIT.OK;
  }

  if (command === 'plan') {
    if (!values.facts) throw new CliError(EXIT.USAGE, '缺少 --facts <facts.json>');
    if (!values.answers) throw new CliError(EXIT.USAGE, '缺少 --answers <answers.json>');
    const repoRoot = realRepoRoot(values.cwd);
    const target = values.out ? assertSafeOutput(repoRoot, values.out) : null;
    const plan = buildPlan({
      cwd: repoRoot,
      factsFile: readJsonFile(path.resolve(values.facts), '事实文件'),
      answersFile: readJsonFile(path.resolve(values.answers), '回答文件')
    });
    emit(plan, target, `计划已生成：planFp ${plan.planFp}，回答来源 ${plan.answersOrigin}`);
    return EXIT.OK;
  }

  if (['render', 'execute', 'verify'].includes(command)) {
    throw new CliError(EXIT.USAGE, `${command} 尚未迁入管线（本入口目前只有 scan 与 plan），按 SKILL.md 原写法执行对应步骤`);
  }
  throw new CliError(EXIT.USAGE, `未知命令：${command}\n${USAGE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`错误：${err.message}`);
      process.exitCode = err.code;
    } else {
      console.error('Fatal error:', err);
      process.exitCode = EXIT.ERROR;
    }
  }
}
