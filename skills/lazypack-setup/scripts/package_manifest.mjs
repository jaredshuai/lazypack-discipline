#!/usr/bin/env node
/**
 * skills/lazypack-setup/scripts/package_manifest.mjs
 *
 * lazypack-setup 包的分发清单与包检查（#108）。只依赖 Node 标准库，
 * 只读本脚本所在的 skill 目录，因此把 skill 目录单独拷到别处也能运行。
 *
 *   node scripts/package_manifest.mjs generate   重写 MANIFEST.json
 *   node scripts/package_manifest.mjs check      检查包是否完整，失败退出码 1
 * 包根目录固定为本脚本的上一级目录（按真实路径解析，符号链接调用也一样）。
 *
 * check 覆盖六项：
 *   1. manifest：MANIFEST.json 与包内文件逐一一致（路径、sha256、工具版本）。
 *   2. links：SKILL.md、assets/、presets/、recipes/、references/ 下 Markdown 的
 *      行内链接与引用式链接都解析到包内存在的文件，不允许跳出包根目录
 *      （含经符号链接跳出）；引用式链接的标签必须有定义；代码围栏必须闭合
 *      （未闭合的围栏会让其后的链接与源路径都不被检查，按失败处理）。
 *   3. sources：配方「源模板 → 目标位置」表格与「源模板位置」列表里的源路径在包内存在。
 *   4. external：指向 lazypack-discipline 本仓的路径（docs/formats/、docs/quality-gates/、
 *      scripts/calculate_crap.mjs）所在行须写明「lazypack-discipline 仓」，
 *      避免在目标仓里被误读为目标仓自己的文件。
 *   5. eol：必须保持 LF 的文件（所有 .sh，加 assets/mutation/config/ 下全部文件，与仓库根
 *      .gitattributes 的 eol=lf 规则一致）不得含 CR 字节；bash 与 cron/systemd 不容忍 CRLF。
 *   6. units：单元契约（*.unit.json）字段齐全、引用的文件与章节在包内存在、版本与卡片一致、
 *      每张卡片和每个模板文件都有契约覆盖，且 references/unit-matrix.md 与契约一致。
 *      规则在同目录的 unit_contracts.mjs；该脚本缺失或加载失败时本项报 FAIL，前五项照常检查。
 *
 * 哈希按「文本文件把 CRLF 规范为 LF、二进制文件按原字节」计算，Windows 上
 * 开了 autocrlf 的检出也能通过；必须保持 LF 的文件另由第 5 项检查。
 * 退出码：0 通过；1 检查失败；2 用法错误。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 惰性加载：unit_contracts.mjs 缺失或损坏时，前五项照常检查，units 一项报 FAIL。
// 写成静态 import 的话，整个包检查会在加载阶段崩掉，一条 FAIL 行都不输出。
let checkUnits = null;
let unitsLoadError = null;
try {
  ({ checkUnits } = await import('./unit_contracts.mjs'));
  if (typeof checkUnits !== 'function') throw new Error('没有导出 checkUnits');
} catch (err) {
  checkUnits = null;
  unitsLoadError = err;
}

export const MANIFEST_NAME = 'MANIFEST.json';
export const SCHEMA = 'lazypack-skill-manifest/1';
const DOC_DIRS = ['assets', 'presets', 'recipes', 'references'];
const EXTERNAL_PATTERNS = [/docs\/formats\//, /docs\/quality-gates\//, /scripts\/calculate_crap\.mjs/];
const EXTERNAL_MARK = 'lazypack-discipline 仓';
const LF_ONLY = (rel) => rel.endsWith('.sh') || rel.startsWith('assets/mutation/config/');
const VERSION_RE = /^\s*(?:\*|#)?\s*@version\s+(\d+\.\d+\.\d+)\s*$/m;

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(abs);
      } else if (entry.isFile()) {
        const rel = toPosix(path.relative(root, abs));
        if (rel !== MANIFEST_NAME) out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}

function normalizedBytes(buf) {
  if (buf.includes(0)) return buf;
  return Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(normalizedBytes(buf)).digest('hex');
}

function toolVersion(buf) {
  if (buf.includes(0)) return null;
  const head = buf.toString('utf8').split(/\r?\n/).slice(0, 15).join('\n');
  const m = head.match(VERSION_RE);
  return m ? m[1] : null;
}

export function buildManifest(root) {
  const files = [];
  const tools = [];
  for (const rel of listFiles(root)) {
    const buf = fs.readFileSync(path.join(root, rel));
    files.push({ path: rel, sha256: sha256(buf) });
    const version = toolVersion(buf);
    if (version) tools.push({ path: rel, version });
  }
  return { schema: SCHEMA, files, tools };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function checkManifest(root, failures) {
  const file = path.join(root, MANIFEST_NAME);
  if (!fs.existsSync(file)) {
    failures.push({ check: 'manifest', detail: `缺少 ${MANIFEST_NAME}；运行 generate 生成` });
    return;
  }
  let recorded;
  try {
    recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    failures.push({ check: 'manifest', detail: `${MANIFEST_NAME} 不是合法 JSON：${err.message}` });
    return;
  }
  if (!recorded || typeof recorded !== 'object' || Array.isArray(recorded)) {
    failures.push({ check: 'manifest', detail: `${MANIFEST_NAME} 顶层必须是对象` });
    return;
  }
  if (recorded.schema !== SCHEMA) {
    failures.push({ check: 'manifest', detail: `schema 应为 ${SCHEMA}，实际 ${JSON.stringify(recorded.schema)}` });
  }
  const isEntry = (f, key) => f && typeof f === 'object' && typeof f.path === 'string' && typeof f[key] === 'string';
  if (!Array.isArray(recorded.files) || !recorded.files.every((f) => isEntry(f, 'sha256'))) {
    failures.push({ check: 'manifest', detail: `${MANIFEST_NAME} 的 files 必须是 {path, sha256} 字符串字段组成的数组` });
    return;
  }
  if (!Array.isArray(recorded.tools) || !recorded.tools.every((f) => isEntry(f, 'version'))) {
    failures.push({ check: 'manifest', detail: `${MANIFEST_NAME} 的 tools 必须是 {path, version} 字符串字段组成的数组` });
    return;
  }
  const actual = buildManifest(root);
  const want = new Map(recorded.files.map((f) => [f.path, f.sha256]));
  const have = new Map(actual.files.map((f) => [f.path, f.sha256]));
  for (const [p, h] of want) {
    if (!have.has(p)) failures.push({ check: 'manifest', detail: `清单记录的文件缺失：${p}` });
    else if (have.get(p) !== h) failures.push({ check: 'manifest', detail: `文件内容与清单不符：${p}` });
  }
  for (const p of have.keys()) {
    if (!want.has(p)) failures.push({ check: 'manifest', detail: `包内文件未登记到清单：${p}` });
  }
  const wantTools = JSON.stringify(recorded.tools.map((t) => ({ path: t.path, version: t.version })));
  if (wantTools !== JSON.stringify(actual.tools)) {
    failures.push({ check: 'manifest', detail: '工具脚本版本与清单不符；改了 @version 后须重新 generate' });
  }
}

function docFiles(root) {
  const out = [];
  if (fs.existsSync(path.join(root, 'SKILL.md'))) out.push('SKILL.md');
  for (const dir of DOC_DIRS) {
    if (!fs.existsSync(path.join(root, dir))) continue;
    for (const rel of listFiles(path.join(root, dir))) {
      if (rel.endsWith('.md')) out.push(`${dir}/${rel}`);
    }
  }
  return out;
}

function stripCode(line) {
  return line.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, '');
}

/** 按 CommonMark 规则剔除围栏代码块：记住开栏字符与长度，同字符且不短于开栏的行才闭合。 */
function proseLines(text) {
  const out = [];
  let fence = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len && m[2].trim() === '') fence = null;
      return;
    }
    if (m && !(m[1][0] === '`' && m[2].includes('`'))) {
      fence = { ch: m[1][0], len: m[1].length, no: i + 1 };
      return;
    }
    out.push({ line, no: i + 1 });
  });
  // 文档结束时围栏仍未闭合：按 CommonMark 其后全是代码，但检查器因此看不到那些内容，调用方须报失败
  out.unclosedFence = fence ? fence.no : null;
  return out;
}

/** 解析到真实路径后判断是否仍在包内；不存在的路径按词法判断。 */
function insideRoot(rootReal, abs) {
  let real = abs;
  try { real = fs.realpathSync(abs); } catch { /* 不存在：按词法 */ }
  return real === rootReal || real.startsWith(rootReal + path.sep);
}

function checkTarget(rootReal, fromRel, target, where, failures) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return;
  let clean;
  try { clean = decodeURIComponent(target.replace(/^<|>$/g, '').split('#')[0]); } catch { clean = target; }
  if (!clean) return;
  const abs = path.resolve(path.dirname(path.join(rootReal, fromRel)), clean);
  if (!insideRoot(rootReal, abs)) {
    failures.push({ check: 'links', detail: `${where} 链接跳出 skill 包：${target}` });
  } else if (!fs.existsSync(abs)) {
    failures.push({ check: 'links', detail: `${where} 链接目标不存在：${target}` });
  }
}

function checkLinks(rootReal, docs, failures) {
  const normLabel = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  for (const rel of docs) {
    const lines = proseLines(fs.readFileSync(path.join(rootReal, rel), 'utf8'));
    if (lines.unclosedFence) {
      failures.push({ check: 'links', detail: `${rel}:${lines.unclosedFence} 代码围栏未闭合，其后内容未被检查` });
    }
    const defs = new Set();
    const uses = [];
    for (const { line, no } of lines) {
      const where = `${rel}:${no}`;
      const def = line.match(/^ {0,3}\[([^\]]+)\]:\s*(\S+)/);
      if (def) {
        defs.add(normLabel(def[1]));
        checkTarget(rootReal, rel, def[2], where, failures);
        continue;
      }
      const prose = stripCode(line);
      for (const m of prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        checkTarget(rootReal, rel, m[1], where, failures);
      }
      for (const m of prose.matchAll(/\[([^\]]+)\]\[([^\]]*)\]/g)) {
        uses.push({ label: normLabel(m[2] || m[1]), where });
      }
    }
    for (const u of uses) {
      if (!defs.has(u.label)) {
        failures.push({ check: 'links', detail: `${u.where} 引用式链接的标签没有定义：[${u.label}]` });
      }
    }
  }
}

function expandBraces(p) {
  const m = p.match(/^(.*?)\{([^{}]+)\}(.*)$/);
  if (!m) return [p];
  return m[2].split(',').flatMap((alt) => expandBraces(`${m[1]}${alt}${m[3]}`));
}

function sourcePathsIn(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]).flatMap(expandBraces);
}

function checkSources(root, failures) {
  const dir = path.join(root, 'recipes');
  if (!fs.existsSync(dir)) return;
  for (const name of listFiles(dir).filter((f) => f.endsWith('.md'))) {
    const rel = `recipes/${name}`;
    const lines = fs.readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/);
    const found = [];
    const seen = new Set();
    const add = (p, line) => {
      const key = `${p}\0${line}`;
      if (!seen.has(key)) { seen.add(key); found.push({ p, line }); }
    };
    const prose = proseLines(lines.join('\n'));
    const outsideFence = new Set(prose.map((l) => l.no));
    let srcCol = -1;
    let inList = false;
    lines.forEach((line, i) => {
      // 围栏内的示例表格/列表不是源路径声明：围栏打断表格，但不结束外层列表
      if (!outsideFence.has(i + 1)) { srcCol = -1; return; }
      if (/^\|/.test(line)) {
        const cells = line.split('|').slice(1, -1).map((c) => c.trim());
        const header = cells.findIndex((c) => /^源(模板|路径)?$/.test(c));
        if (header >= 0) { srcCol = header; return; }
        if (srcCol >= 0 && !/^[-:\s]+$/.test(cells.join(''))) {
          for (const p of sourcePathsIn(cells[srcCol] || '')) add(p, i + 1);
        }
        return;
      }
      srcCol = -1;
      if (/^\*\*源模板位置\*\*/.test(line)) { inList = true; return; }
      if (inList) {
        if (/^\s*-\s/.test(line)) {
          for (const p of sourcePathsIn(line)) add(p, i + 1);
        } else if (line.trim() !== '') {
          inList = false;
        }
      }
    });
    for (const { line, no } of prose) {
      for (const p of sourcePathsIn(line.replace(/\\`/g, '')).filter((c) => /^(\.\/)?assets\//.test(c))) add(p, no);
    }
    for (const { p, line } of found) {
      const abs = path.resolve(root, p);
      if (!insideRoot(root, abs)) {
        failures.push({ check: 'sources', detail: `${rel}:${line} 源路径跳出 skill 包：${p}` });
      } else if (!fs.existsSync(abs)) {
        failures.push({ check: 'sources', detail: `${rel}:${line} 源路径在包内不存在：${p}` });
      }
    }
  }
}

function checkExternal(root, docs, failures) {
  for (const rel of docs) {
    const lines = fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (EXTERNAL_PATTERNS.some((re) => re.test(line)) && !line.includes(EXTERNAL_MARK)) {
        failures.push({ check: 'external', detail: `${rel}:${i + 1} 指向本仓的路径须写明「${EXTERNAL_MARK}」` });
      }
    });
  }
}

function checkEol(root, failures) {
  for (const rel of listFiles(root).filter(LF_ONLY)) {
    if (fs.readFileSync(path.join(root, rel)).includes(13)) {
      failures.push({ check: 'eol', detail: `须保持 LF 的文件含 CR：${rel}` });
    }
  }
}

function errorLine(err) {
  return String(err && err.message ? err.message : err).split(/\r?\n/)[0];
}

function checkUnitContracts(root, failures) {
  const fail = (detail) => failures.push({ check: 'units', detail });
  if (!checkUnits) {
    fail(`scripts/unit_contracts.mjs 无法加载，单元契约没有检查：${errorLine(unitsLoadError)}`);
    return;
  }
  try {
    for (const detail of checkUnits(root)) fail(detail);
  } catch (err) {
    fail(`单元契约检查中途出错：${errorLine(err)}`);
  }
}

export function checkPackage(rootDir) {
  const root = fs.realpathSync(rootDir);
  const failures = [];
  checkManifest(root, failures);
  const docs = docFiles(root);
  checkLinks(root, docs, failures);
  checkSources(root, failures);
  checkExternal(root, docs, failures);
  checkEol(root, failures);
  checkUnitContracts(root, failures);
  return failures;
}

function main(argv) {
  const args = argv.slice(2);
  const cmd = args.length === 1 ? args[0] : null;
  const root = fs.realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (cmd === 'generate') {
    const manifest = buildManifest(root);
    fs.writeFileSync(path.join(root, MANIFEST_NAME), serializeManifest(manifest));
    console.log(`已写入 ${MANIFEST_NAME}：${manifest.files.length} 个文件，${manifest.tools.length} 个带版本的工具脚本`);
    return 0;
  }
  if (cmd === 'check') {
    const failures = checkPackage(root);
    for (const f of failures) console.error(`FAIL [${f.check}] ${f.detail}`);
    if (failures.length) {
      console.error(`包检查失败：${failures.length} 项。资源缺失时 setup 不得继续装配。`);
      return 1;
    }
    console.log('包检查通过：manifest、links、sources、external、eol、units 六项均无差异');
    return 0;
  }
  console.error('用法：node scripts/package_manifest.mjs <generate|check>');
  return 2;
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exit(main(process.argv));
}
