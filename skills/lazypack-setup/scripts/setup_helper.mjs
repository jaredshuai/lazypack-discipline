#!/usr/bin/env node
/**
 * setup_helper.mjs
 *
 * setup 管线入口（#113 结论的迁移顺序第 1 项，#114）。只用 Node 标准库。
 * 文件格式与取舍见 references/setup-pipeline.md；本文件是该格式的实现。
 *
 * 命令列表:
 *   scan --cwd <repoRoot> [--out <facts.json>]
 *       只读探测第 2 步第 4 项：既有质量门禁命令。输出事实文件
 *       (schema lazypack-facts/1, covers [4])，facts 里只有 kind=existing-command；
 *       根 package.json 的每个 scripts 条目都是一条事实。
 *   readback --cwd <repoRoot> [--out <readback.json>]
 *       只读第 2 步第 7 项：读回既有 Hook 的受管块与出处行。输出事实文件
 *       (schema lazypack-facts/1, covers [7])，状态固定在 hook:.githooks/pre-commit；
 *       valid / no-provenance 时另出四个 hook-slot 事实。不写目标仓，不执行 Hook。
 *   plan --cwd <repoRoot> --facts <facts.json> --answers <answers.json> [--readback <readback.json>] [--out <plan.json>]
 *       重扫目标仓并与事实文件的 machineFp 比对，一致才出计划
 *       (schema lazypack-plan/1)；本票只出 slots，不出 actions。
 *       带 --readback 时重跑读回比对，Hook 有命令以 Hook 为准。
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
import { scanBlock, parseStrictMarkers, fp16, lfNormalize, RESERVED_TOKEN } from './managed_blocks.mjs';

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

/** 名字到槽。只认自有键：`toString`、`constructor` 这类原型上的名字不是槽。 */
const slotForName = (name) => (Object.hasOwn(NAME_TO_SLOT, name) ? NAME_TO_SLOT[name] : undefined);

/**
 * 能安全拼进命令行的脚本名。Hook 用 shell 执行完整调用，名字里带空白、引号、`;`、`&`、`|`、`$`
 * 等字符会被当成另一段命令。这类脚本仍记成事实（参与指纹），但 invocation 为 null，不能认领槽。
 */
const SAFE_SCRIPT_NAME = /^[A-Za-z0-9_][A-Za-z0-9_:.\/@+-]*$/;
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
  if (!SAFE_SCRIPT_NAME.test(scriptName)) return null;
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
// readback：既有 Hook 的出处行读回（第 2 步第 7 项，#128）
// ---------------------------------------------------------------------------

export const HOOK_PATH = '.githooks/pre-commit';
const HOOK_BLOCK = 'pre-commit-hook';
const HOOK_STATE_FACT_ID = `hook:${HOOK_PATH}`;
const HOOK_KINDS = ['hook-managed-block', 'hook-slot'];
const SLOT_STATUS_VALUES = ['wired', 'missing', 'install-failed', 'n/a'];
const PROVENANCE_LINE_RE = /^# lazypack:preset id=([a-z0-9][a-z0-9-]*) version=(\d+\.\d+\.\d+) format=(\S+) lint=(\S+) test=(\S+) type=(\S+)$/;
const PROVENANCE_VALUE_RE = /^(wired|missing|install-failed|n\/a):(preset|existing|none):(recommended|declined|pre-existing|no-tool|install-error|not-applicable)$/;
const SLOT_VARIABLE_RE = /^([A-Z][A-Z0-9]*)_(STATUS|CMD)='(.*)'$/;

function hookStateValue() {
  return {
    path: HOOK_PATH,
    state: 'absent',
    header: null,
    currentFp: null,
    block: null,
    preset: null,
    diff: null
  };
}

/** broken 状态不带任何恢复值：header、currentFp、block、preset 全清空，只留 diff。 */
function markBroken(value, diff) {
  value.state = 'broken';
  value.header = null;
  value.currentFp = null;
  value.block = null;
  value.preset = null;
  value.diff = diff;
  return value;
}

function lstatOrNull(abs, label) {
  try {
    return fs.lstatSync(abs);
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return null;
    throw new CliError(EXIT.ERROR, `读取 ${label} 的状态失败（${err?.code ?? err?.message}），不继续：${abs}`);
  }
}

function lineNumberAt(buf, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (buf[i] === 0x0a) line += 1;
  }
  return line;
}

function headerInfo(header) {
  return { src: header.src, gen: header.gen, input: header.input, fp: header.fp };
}

/** §5.4 的 `'\''` 是 shell 单引号转义；读回时还原成字面单引号。 */
function unescapeSlotData(text) {
  return text.split("'\\''").join("'");
}

function parseSlotVariables(bodyLines, slot) {
  const name = slot.toUpperCase();
  const hits = { STATUS: [], CMD: [] };
  bodyLines.forEach((line, index) => {
    const match = SLOT_VARIABLE_RE.exec(line);
    if (!match || match[1] !== name) return;
    hits[match[2]].push({ value: match[3], line: index + 1 });
  });
  return hits;
}

function readHook(repoRoot) {
  const value = hookStateValue();
  let locator = 'none';
  const dirStat = lstatOrNull(path.join(repoRoot, '.githooks'), '.githooks');
  if (!dirStat) return { value, slotFacts: null, locator };
  locator = 'lazypack:start';
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    return {
      value: markBroken(value, { kind: 'not-a-regular-file', detail: '.githooks 不是普通目录（符号链接或文件），不读取' }),
      slotFacts: null,
      locator
    };
  }
  const fileAbs = path.join(repoRoot, HOOK_PATH);
  const fileStat = lstatOrNull(fileAbs, HOOK_PATH);
  if (!fileStat) return { value, slotFacts: null, locator: 'none' };
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    return {
      value: markBroken(value, { kind: 'not-a-regular-file', detail: `${HOOK_PATH} 不是普通文件（符号链接或目录），不读取` }),
      slotFacts: null,
      locator
    };
  }

  let buf;
  try {
    buf = fs.readFileSync(fileAbs);
  } catch (err) {
    throw new CliError(EXIT.ERROR, `读不到 ${HOOK_PATH}（${err?.code ?? err?.message}）`);
  }
  const scan = scanBlock(buf);
  if (!scan.present) {
    value.state = 'unmanaged';
    return { value, slotFacts: null, locator };
  }
  locator = `lazypack:start block=${HOOK_BLOCK}`;
  if (!scan.wellFormed) {
    return {
      value: markBroken(value, {
        kind: 'boundary',
        detail: '托管块标记不完整：需要恰好一对按顺序出现的 start/end 标记',
        line: null
      }),
      slotFacts: null,
      locator
    };
  }

  const header = parseStrictMarkers(scan.startLine.text, scan.endLine.text);
  if (!header.ok) {
    return { value: markBroken(value, { kind: 'header', detail: header.reason }), slotFacts: null, locator };
  }
  if (header.style !== 'sh') {
    return {
      value: markBroken(value, { kind: 'style-mismatch', detail: `托管块使用 ${header.style} 注释风格，Hook 必须是 sh` }),
      slotFacts: null,
      locator
    };
  }
  if (header.block !== HOOK_BLOCK) {
    return {
      value: markBroken(value, { kind: 'unexpected-block', detail: `托管块名是 ${header.block}，期望 ${HOOK_BLOCK}` }),
      slotFacts: null,
      locator
    };
  }
  if (RESERVED_TOKEN.test(scan.startLine.text) || RESERVED_TOKEN.test(scan.body.toString('utf8'))) {
    return {
      value: markBroken(value, { kind: 'placeholder', detail: '托管块 header 或正文仍含未展开的保留模板变量' }),
      slotFacts: null,
      locator
    };
  }

  const block = {
    name: header.block,
    style: header.style,
    startLine: lineNumberAt(buf, scan.startLine.start),
    endLine: lineNumberAt(buf, scan.endLine.start)
  };
  const currentFp = fp16(lfNormalize(scan.body));
  if (currentFp !== header.fp) {
    value.state = 'drift';
    value.header = headerInfo(header);
    value.currentFp = currentFp;
    value.block = block;
    value.diff = {
      kind: 'fp-mismatch',
      headerFp: header.fp,
      currentFp,
      detail: `正文指纹与 header.fp 不一致（header ${header.fp}，当前 ${currentFp}）`
    };
    return { value, slotFacts: null, locator };
  }

  const bodyLines = lfNormalize(scan.body).toString('utf8').split('\n');
  const provenanceLines = [];
  bodyLines.forEach((line, index) => {
    if (line.includes('lazypack:preset')) provenanceLines.push(index);
  });
  const firstNonEmpty = bodyLines.findIndex((line) => line.trim() !== '');

  if (provenanceLines.length > 1) {
    return {
      value: markBroken(value, {
        kind: 'provenance-ambiguous',
        detail: `正文里有 ${provenanceLines.length} 行 lazypack:preset`,
        line: provenanceLines[1] + 1
      }),
      slotFacts: null,
      locator
    };
  }

  let provenanceBySlot = null;
  let preset = null;
  let provenanceState = 'no-provenance';
  if (provenanceLines.length === 1) {
    const index = provenanceLines[0];
    if (index !== firstNonEmpty) {
      return {
        value: markBroken(value, {
          kind: 'provenance-ambiguous',
          detail: 'lazypack:preset 出处行不在正文头部',
          line: index + 1
        }),
        slotFacts: null,
        locator
      };
    }
    const match = PROVENANCE_LINE_RE.exec(bodyLines[index]);
    if (!match) {
      return {
        value: markBroken(value, { kind: 'provenance-grammar', detail: '出处行不符合严格语法', line: index + 1 }),
        slotFacts: null,
        locator
      };
    }
    const [, id, version, formatValue, lintValue, testValue, typeValue] = match;
    const parsed = { format: formatValue, lint: lintValue, type: typeValue, test: testValue };
    for (const slot of SLOTS) {
      if (!PROVENANCE_VALUE_RE.test(parsed[slot])) {
        return {
          value: markBroken(value, {
            kind: 'provenance-grammar',
            detail: `出处行的 ${slot} 段不是 <state>:<source>:<reason>`,
            line: index + 1
          }),
          slotFacts: null,
          locator
        };
      }
    }
    provenanceBySlot = parsed;
    preset = { id, version };
    provenanceState = 'valid';
  }

  const slotFacts = [];
  for (const slot of SLOTS) {
    const hits = parseSlotVariables(bodyLines, slot);
    const upper = slot.toUpperCase();
    const prefix = `${slot}/${upper}`;
    for (const variable of ['STATUS', 'CMD']) {
      const occurrences = hits[variable];
      if (occurrences.length === 0) {
        return {
          value: markBroken(value, { kind: 'slot-variables', detail: `${prefix}_${variable} 缺失`, line: null }),
          slotFacts: null,
          locator
        };
      }
      if (occurrences.length > 1) {
        return {
          value: markBroken(value, { kind: 'slot-variables', detail: `${prefix}_${variable} 出现多次`, line: occurrences[1].line }),
          slotFacts: null,
          locator
        };
      }
    }
    const status = hits.STATUS[0].value;
    if (!SLOT_STATUS_VALUES.includes(status)) {
      return {
        value: markBroken(value, { kind: 'slot-variables', detail: `${prefix}_STATUS 非法：${status}`, line: hits.STATUS[0].line }),
        slotFacts: null,
        locator
      };
    }
    const command = unescapeSlotData(hits.CMD[0].value);
    // valid 用出处行三段式；no-provenance 按通用既有命令处理（§5.6）。
    const provenance = provenanceBySlot ? provenanceBySlot[slot] : `${status}:existing:pre-existing`;
    const [state, source, reason] = provenance.split(':');
    slotFacts.push({
      id: `${HOOK_STATE_FACT_ID}#${slot}`,
      item: 7,
      kind: 'hook-slot',
      source: 'machine',
      value: { slot, state, source, reason, status, command },
      evidence: { path: HOOK_PATH, locator: `${upper}_STATUS/${upper}_CMD` }
    });
  }

  value.state = provenanceState;
  value.header = headerInfo(header);
  value.currentFp = currentFp;
  value.block = block;
  value.preset = preset;
  return { value, slotFacts, locator };
}

export function buildReadbackFactsFile(cwd) {
  const repoRoot = realRepoRoot(cwd);
  const { value, slotFacts, locator } = readHook(repoRoot);
  const facts = [
    {
      id: HOOK_STATE_FACT_ID,
      item: 7,
      kind: 'hook-managed-block',
      source: 'machine',
      value,
      evidence: { path: HOOK_PATH, locator }
    },
    ...(slotFacts ?? [])
  ].sort((a, b) => compareCodePoints(a.id, b.id));
  return {
    schema: FACTS_SCHEMA,
    scope: 'full',
    covers: [7],
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

function validateReadbackFile(file) {
  if (!isPlainObject(file) || file.schema !== FACTS_SCHEMA) {
    throw new CliError(EXIT.ERROR, `读回文件的 schema 必须是 ${FACTS_SCHEMA}`);
  }
  if (file.scope !== 'full') throw new CliError(EXIT.ERROR, '读回文件的 scope 必须是 full');
  if (canonicalJson(file.covers) !== canonicalJson([7])) {
    throw new CliError(EXIT.ERROR, '读回文件的 covers 必须是 [7]（第 2 步第 7 项的 Hook 出处读回）');
  }
  if (!Array.isArray(file.facts)) throw new CliError(EXIT.ERROR, '读回文件缺少 facts 数组');
  if (!Array.isArray(file.judgments) || file.judgments.length !== 0) {
    throw new CliError(EXIT.ERROR, '读回文件的 judgments 必须是空数组');
  }
  if (typeof file.machineFp !== 'string') throw new CliError(EXIT.ERROR, '读回文件缺少 machineFp');
  if (digest(file.facts) !== file.machineFp) {
    throw new CliError(EXIT.ERROR, '读回文件的 facts 段与它自带的 machineFp 不一致，文件被改动过。请重新运行 readback');
  }
  file.facts.forEach((fact, index) => {
    const where = `读回事实[${index}]`;
    if (!isPlainObject(fact)) throw new CliError(EXIT.ERROR, `${where} 必须是对象`);
    if (fact.item !== 7) throw new CliError(EXIT.ERROR, `${where} 的 item 必须是 7`);
    if (fact.source !== 'machine') throw new CliError(EXIT.ERROR, `${where} 的 source 必须是 machine`);
    if (!HOOK_KINDS.includes(fact.kind)) {
      throw new CliError(EXIT.ERROR, `${where} 的 kind 必须是 ${HOOK_KINDS.join('、')} 之一`);
    }
  });
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
      } else if (fact.value.invocation === null) {
        throw new CliError(EXIT.ERROR, `判断 ${judgment.id} 让 ${fact.id} 认领槽，但它的脚本名不能安全拼进命令行，不能分槽`);
      } else {
        for (const slot of judgment.value.slots) claims.get(slot).push({ fact, via: `判断 ${judgment.id}` });
      }
    } else {
      const slot = slotForName(scriptNameOf(fact));
      if (fact.value.invocation === null) unassignedReason.set(fact.id, 'unsafe-name');
      else if (slot) claims.get(slot).push({ fact, via: '按名字' });
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
    // 判断的 slots 取代按名字的认领，所以只有判断里列出的槽才标 PAUSE。
    const pausedFor = [...paused.values()].find((judgment) => judgment.value.slots.includes(slot));
    // 有同名脚本、但它的判断没有列这个槽：不是「没有既有命令」，单独标出来，免得被当成缺口另补。
    const judgedOut = facts.find((fact) => coverageByFact.has(fact.id) && slotForName(scriptNameOf(fact)) === slot);
    slots.push({
      slot,
      origin: 'none',
      command: null,
      cwd: null,
      from: null,
      needs: [],
      reason: pausedFor ? `hook-pause:${pausedFor.about}` : judgedOut ? `judged-not-covered:${judgedOut.id}` : 'no-existing-command',
      // 配方是否补这个槽尚未迁入管线，所以这里不预告它最后的状态。
      outcomes: {}
    });
  }

  const unassigned = facts
    .filter((fact) => !used.has(fact.id))
    .map((fact) => ({ from: fact.id, reason: unassignedReason.get(fact.id) }));
  return { slots, unassigned };
}

/**
 * 把 readback 的槽事实合到 assignSlots 的结果上。Hook 记录优先于本轮扫描，
 * 但两者都有命令且不一致时停下，不择一；也不因环境里找到同名命令就改写来源。
 */
function mergeReadbackSlots(slots, readbackFacts) {
  const slotFacts = new Map();
  for (const fact of readbackFacts) {
    if (fact.kind !== 'hook-slot') continue;
    const slot = fact.value?.slot;
    if (slotFacts.has(slot)) throw new CliError(EXIT.ERROR, `读回文件里有重复的槽事实：${slot}`);
    slotFacts.set(slot, fact);
  }

  return slots.map((slot) => {
    const fact = slotFacts.get(slot.slot);
    if (!fact) return { ...slot, commandSource: slot.command ? 'scan' : null, hook: null };

    const hookCommand = fact.value.command === '' ? null : fact.value.command;
    const scanCommand = slot.command;
    if (hookCommand !== null && scanCommand !== null && hookCommand !== scanCommand) {
      throw new CliError(
        EXIT.ERROR,
        `槽 ${slot.slot} 的 Hook 记录命令「${hookCommand}」与本轮扫描命令「${scanCommand}」不一致（#113：动手前内容变了就停下重问）。不择一：请确认后重新运行 scan/readback 并重新出计划。`
      );
    }
    if (hookCommand === null && scanCommand !== null) {
      throw new CliError(
        EXIT.ERROR,
        `槽 ${slot.slot} 的 Hook 记录为未接线（无命令），但本轮扫描找到「${scanCommand}」（#113：动手前内容变了就停下重问）。不择一：请确认后重新运行 scan/readback 并重新出计划。`
      );
    }

    const provenance = `${fact.value.state}:${fact.value.source}:${fact.value.reason}`;
    const origin = hookCommand ? 'existing' : 'none';
    const merged = {
      ...slot,
      origin,
      command: hookCommand,
      cwd: hookCommand ? '.' : null,
      from: fact.id,
      needs: [],
      commandSource: 'hook',
      hook: { state: fact.value.state, provenance, status: fact.value.status },
      outcomes: { [fact.value.state]: { provenance, writeCommand: !!(hookCommand && fact.value.state === 'wired') } }
    };
    // origin 为 none 时保留扫描槽的 reason；有命令的槽没有 reason。
    if (origin === 'existing') delete merged.reason;
    return merged;
  });
}

export function buildPlan({ cwd, factsFile, answersFile, readbackFile = null }) {
  const repoRoot = realRepoRoot(cwd);
  validateFactsFile(factsFile);
  validateAnswers(answersFile);
  if (readbackFile !== null) validateReadbackFile(readbackFile);

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

  let readbackFp = null;
  let hooks = [];
  let plannedSlots;
  if (readbackFile === null) {
    plannedSlots = mergeReadbackSlots(slots, []);
  } else {
    // readback 之后 Hook 变了：与 scan 的 machineFp 同理，停下不写。
    const fresh = buildReadbackFactsFile(repoRoot);
    if (fresh.machineFp !== readbackFile.machineFp) {
      const changes = describeFactChanges(readbackFile.facts, fresh.facts);
      throw new CliError(
        EXIT.STALE,
        `目标仓的受管 Hook 自上次 readback 以来变了（machineFp 不一致），不出计划：\n  ${changes.join('\n  ') || '（无法定位到具体条目）'}\n请重新运行 readback。`
      );
    }
    plannedSlots = mergeReadbackSlots(slots, readbackFile.facts);
    hooks = readbackFile.facts
      .filter((fact) => fact.kind === 'hook-managed-block')
      .map((fact) => ({ from: fact.id, path: fact.value.path, state: fact.value.state, preset: fact.value.preset }));
    readbackFp = readbackFile.machineFp;
  }

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
    readbackFp,
    hooks,
    slots: plannedSlots,
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
  readback: { type: 'string' },
  out: { type: 'string' },
  help: { type: 'boolean', short: 'h' }
};

const USAGE = `
Usage: node setup_helper.mjs <command> [options]

Commands:
  scan     --cwd <repoRoot> [--out <facts.json>]
           只读探测既有质量门禁命令，输出事实文件 (lazypack-facts/1)
  readback --cwd <repoRoot> [--out <readback.json>]
           只读读回既有 Hook 的受管块与出处行，输出事实文件 (lazypack-facts/1, covers [7])
  plan     --cwd <repoRoot> --facts <facts.json> --answers <answers.json> [--readback <readback.json>] [--out <plan.json>]
           重扫并与 machineFp 比对，一致才生成槽位计划 (lazypack-plan/1)
  render, execute, verify    尚未迁入

事实、回答、读回、计划文件必须在目标仓之外。格式见 references/setup-pipeline.md。
`;

/** target 是 assertSafeOutput 返回的规范路径；没有 --out 时为 null，打印到标准输出。 */
function emit(value, target, summary) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (!target) {
    process.stdout.write(json);
    return;
  }
  try {
    fs.writeFileSync(target, json, 'utf8');
  } catch (err) {
    throw new CliError(EXIT.ERROR, `写不进 ${target}：${err.code ?? err.message}`);
  }
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
  if ((command === 'scan' || command === 'plan' || command === 'readback') && !values.cwd) {
    throw new CliError(EXIT.USAGE, `缺少 --cwd <目标仓>（必填，不再默认当前目录）\n${USAGE}`);
  }

  if (command === 'scan') {
    const repoRoot = realRepoRoot(values.cwd);
    const target = values.out ? assertSafeOutput(repoRoot, values.out) : null;
    const factsFile = buildFactsFile(repoRoot);
    emit(factsFile, target, `扫描完成：${factsFile.facts.length} 条既有命令，machineFp ${factsFile.machineFp}`);
    return EXIT.OK;
  }

  if (command === 'readback') {
    const repoRoot = realRepoRoot(values.cwd);
    const target = values.out ? assertSafeOutput(repoRoot, values.out) : null;
    const readbackFile = buildReadbackFactsFile(repoRoot);
    const stateFact = readbackFile.facts.find((fact) => fact.kind === 'hook-managed-block');
    const state = stateFact ? stateFact.value.state : 'absent';
    const slotCount = readbackFile.facts.filter((fact) => fact.kind === 'hook-slot').length;
    emit(readbackFile, target, `读回完成：${HOOK_PATH} 状态 ${state}（${slotCount} 个槽，machineFp ${readbackFile.machineFp}）`);
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
      answersFile: readJsonFile(path.resolve(values.answers), '回答文件'),
      readbackFile: values.readback ? readJsonFile(path.resolve(values.readback), '读回文件') : null
    });
    emit(plan, target, `计划已生成：planFp ${plan.planFp}，回答来源 ${plan.answersOrigin}`);
    return EXIT.OK;
  }

  if (['render', 'execute', 'verify'].includes(command)) {
    throw new CliError(EXIT.USAGE, `${command} 尚未迁入管线（本入口目前只有 scan、readback 与 plan），按 SKILL.md 原写法执行对应步骤`);
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
