/**
 * scripts/check_commit_msg.mjs
 *
 * 判定口径以 docs/agents/commit-msg-check.md 为唯一正文。
 * 用法: node scripts/check_commit_msg.mjs <message-file>
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
 * 读取消息文件与 §5.1 词表，只对标题做格式判定。
 */
function main() {
  const given = process.argv[2];
  if (process.argv.length !== 3 || given === undefined || given === '') {
    finish('not-run', { reason: '未提供消息文件路径' });
  }
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

  let decisions;
  try {
    decisions = fs.readFileSync(DECISIONS_PATH);
  } catch (error) {
    finish('exec-failed', { reason: `无法读取 docs/DECISIONS.md: ${error.code || error.message}` });
  }
  const decisionsText = decodeUtf8(decisions);
  if (decisionsText === null) {
    finish('exec-failed', { reason: 'docs/DECISIONS.md 不是合法 UTF-8' });
  }

  let types;
  try {
    types = extractTypes(decisionsText.replace(/^\uFEFF/, ''));
  } catch (error) {
    finish('exec-failed', { reason: error.message });
  }

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
