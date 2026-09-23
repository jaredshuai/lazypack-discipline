/**
 * scripts/check_commit_msg.mjs
 *
 * 判定口径以 docs/agents/commit-msg-check.md 为唯一正文。
 * 用法: node scripts/check_commit_msg.mjs <message-file> [--rules <path>]
 * 未接 hook/CI。本脚本不是门禁。格式通过不等于语义已验证，不等于代码正确或需求完成。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DECISIONS_PATH = path.join(REPO_ROOT, 'docs', 'DECISIONS.md');

const EXIT_CODE = {
  'format-pass': 0,
  'format-fail': 1,
  'not-run': 2,
  'exec-failed': 3
};

const DISCLAIMER = '未接 hook/CI。不是门禁。格式通过不等于语义已验证，不等于代码正确或需求完成。';

const TYPE_TOKEN = /^[a-z][a-z0-9]*$/;
const SUBJECT_SHAPE = /^([a-z][a-z0-9]*)(\(([^)]+)\))?(!)?: (\S.*)$/;
const FOOTER_LINE = /^(Closes|Fixes|Refs) #(\d+)$/;
const ILLUSTRATION = /[A-Z#()!]|[^\x00-\x7F]/;

/**
 * 写出一种状态的摘要与 JSON，并以上表退出码结束进程。
 */
function finish(status, detail) {
  const exitCode = EXIT_CODE[status];
  const payload = {
    status,
    exit_code: exitCode,
    rule: detail.rule || null,
    reason: detail.reason || null,
    info: detail.info || null,
    types: detail.types || null,
    disclaimer: DISCLAIMER
  };
  const lines = [`check_commit_msg: ${status}`, DISCLAIMER];
  if (payload.rule) {
    lines.push(`rule: ${payload.rule}`);
  }
  if (payload.reason) {
    lines.push(`reason: ${payload.reason}`);
  }
  if (payload.info) {
    lines.push(`info body-nonempty: ${payload.info.body_nonempty ? 'yes' : 'no'}`);
    const footers = payload.info.footers.length > 0 ? payload.info.footers.join(', ') : 'none';
    lines.push(`info footer: ${footers}`);
  }
  process.stdout.write(`${lines.join('\n')}\n\n${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}

/**
 * 把缓冲区按 UTF-8 严格解码；非法字节时返回 null。
 */
function decodeUtf8(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/**
 * 只读打开路径并严格按 UTF-8 解码。失败时返回错误说明，不写盘。
 */
function readUtf8(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (error) {
    return { ok: false, reason: `无法读取 ${path.basename(filePath)}: ${error.code || error.message}` };
  }
  const text = decodeUtf8(buf);
  if (text === null) {
    return { ok: false, reason: `${path.basename(filePath)} 不是合法 UTF-8` };
  }
  return { ok: true, text: text.replace(/^\uFEFF/, '') };
}

/**
 * 从 §5.1 正文行抽出 type 词表。结构不符时抛出错误，不返回内置清单。
 */
function extractTypes(decisionsText) {
  const lines = decisionsText.split(/\r?\n/).filter((line) => /^5\.1\s+\S/.test(line));
  if (lines.length !== 1) {
    throw new Error(`§5.1 正文行数量为 ${lines.length}，需要恰好 1 行`);
  }
  const line = lines[0];
  const counted = [...line.matchAll(/(\d+)\s*个（`([^`]*)`）/g)];
  if (counted.length !== 1) {
    throw new Error(`§5.1 带数量的反引号词表有 ${counted.length} 处，需要恰好 1 处`);
  }
  const expected = Number(counted[0][1]);
  const listed = counted[0][2].split(/\s+/).filter((token) => token !== '');
  if (listed.length !== expected || listed.some((token) => !TYPE_TOKEN.test(token))) {
    throw new Error(`§5.1 括号词表无法按「${expected} 个」拆成 type 标记`);
  }
  const types = [...listed];
  const spans = [...line.matchAll(/`([^`]*)`/g)].map((match) => match[1]);
  for (const span of spans) {
    if (span === counted[0][2]) {
      continue;
    }
    if (TYPE_TOKEN.test(span)) {
      types.push(span);
      continue;
    }
    if (ILLUSTRATION.test(span)) {
      continue;
    }
    throw new Error('§5.1 存在无法归类的反引号片段');
  }
  if (types.length === 0 || new Set(types).size !== types.length) {
    throw new Error('§5.1 type 词表为空或有重复');
  }
  return types;
}

/**
 * 判断标题第一行是否符合形状，且 type 属于抽出的集合。
 */
function judgeSubject(subject, types) {
  const match = SUBJECT_SHAPE.exec(subject);
  if (!match) {
    return { ok: false, rule: '标题缺 `type: 描述` 形状' };
  }
  const type = match[1];
  if (!types.includes(type)) {
    return { ok: false, rule: `type「${type}」不在 §5.1 允许集合` };
  }
  return { ok: true, rule: null };
}

/**
 * 收集正文是否非空，以及未裁定的脚注出现情况。
 */
function collectInfo(lines) {
  const rest = lines.slice(1);
  const footers = [];
  for (const raw of rest) {
    const line = raw.replace(/\r$/, '').trim();
    const hit = FOOTER_LINE.exec(line);
    if (hit) {
      footers.push(`${hit[1]} #${hit[2]}`);
    }
  }
  return {
    body_nonempty: rest.some((line) => line.trim() !== ''),
    footers
  };
}

/**
 * 解析命令行。没有 --rules 时仍要求恰好一个消息文件路径。
 * 有 --rules 时，消息文件是唯一位置参数，规则路径跟在该标记后面；标记可在消息文件前或后。
 * 认不出消息文件时只返回空路径，调用方按 not-run 结束，不读规则文件。
 */
function parseInvocation(argv) {
  const args = argv.slice(2);
  const rulesIndexes = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--rules') {
      rulesIndexes.push(i);
    }
  }
  if (rulesIndexes.length === 0) {
    if (args.length !== 1 || args[0] === '') {
      return { messagePath: null, rulesPath: null, rulesError: null };
    }
    return { messagePath: args[0], rulesPath: null, rulesError: null };
  }

  const consumed = new Set();
  let rulesPath = null;
  let rulesError = null;
  if (rulesIndexes.length > 1) {
    rulesError = '--rules 出现了多次';
    for (const index of rulesIndexes) {
      consumed.add(index);
      if (args[index + 1] !== undefined) {
        consumed.add(index + 1);
      }
    }
  } else {
    const index = rulesIndexes[0];
    consumed.add(index);
    const next = args[index + 1];
    if (next === undefined || next === '') {
      rulesError = '--rules 缺少路径';
    } else {
      rulesPath = next;
      consumed.add(index + 1);
    }
  }
  const positionals = args.filter((_, index) => !consumed.has(index));
  if (positionals.length !== 1 || positionals[0] === '') {
    return { messagePath: null, rulesPath: null, rulesError: null };
  }
  return { messagePath: positionals[0], rulesPath, rulesError };
}

/**
 * 从规则文件抽出 type 词表。
 * explicitRules 为真时，失败原因写「规则文件」，不写入调用方路径。
 * 缺省调用仍写出「docs/DECISIONS.md」，与改参之前的原因句相同。
 */
function loadTypes(filePath, explicitRules) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (error) {
    const code = error && (error.code || error.message) ? error.code || error.message : 'unknown';
    const reason = explicitRules
      ? `无法读取规则文件: ${code}`
      : `无法读取 docs/DECISIONS.md: ${code}`;
    return { ok: false, reason };
  }
  const text = decodeUtf8(buf);
  if (text === null) {
    const reason = explicitRules ? '规则文件不是合法 UTF-8' : 'docs/DECISIONS.md 不是合法 UTF-8';
    return { ok: false, reason };
  }
  try {
    return { ok: true, types: extractTypes(text.replace(/^\uFEFF/, '')) };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/**
 * 读取消息文件与 §5.1 词表，只对标题做格式判定。
 * 不传 --rules 时规则文件仍是脚本所在仓的 docs/DECISIONS.md。
 */
function main() {
  const parsed = parseInvocation(process.argv);
  if (parsed.messagePath === null) {
    finish('not-run', { reason: '未提供消息文件路径' });
  }
  const given = parsed.messagePath;
  let stat;
  try {
    stat = fs.statSync(given);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      finish('not-run', { reason: '消息文件不存在或不是普通文件' });
    }
    const code = error && error.code ? error.code : 'unknown';
    finish('exec-failed', { reason: `无法查看消息文件: ${code}` });
  }
  if (!stat.isFile()) {
    finish('not-run', { reason: '消息文件不存在或不是普通文件' });
  }

  const message = readUtf8(given);
  if (!message.ok) {
    finish('exec-failed', { reason: message.reason });
  }
  if (parsed.rulesError) {
    finish('exec-failed', { reason: parsed.rulesError });
  }

  const explicitRules = parsed.rulesPath !== null;
  const rulesPath = explicitRules ? parsed.rulesPath : DECISIONS_PATH;
  const loaded = loadTypes(rulesPath, explicitRules);
  if (!loaded.ok) {
    finish('exec-failed', { reason: loaded.reason });
  }
  const types = loaded.types;

  const lines = message.text.split('\n');
  const subject = (lines[0] || '').replace(/\r$/, '');
  const info = collectInfo(lines);
  const judged = judgeSubject(subject, types);
  finish(judged.ok ? 'format-pass' : 'format-fail', {
    rule: judged.rule,
    info,
    types
  });
}

main();
