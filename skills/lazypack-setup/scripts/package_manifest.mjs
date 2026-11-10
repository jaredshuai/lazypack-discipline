#!/usr/bin/env node
/**
 * skills/lazypack-setup/scripts/package_manifest.mjs
 *
 * lazypack-setup 包的分发清单与包检查（#108）。只依赖 Node 标准库，
 * 只读本脚本所在的 skill 目录，因此把 skill 目录单独拷到别处也能运行。
 *
 *   node scripts/package_manifest.mjs generate   重写 MANIFEST.json
 *   node scripts/package_manifest.mjs check      检查包是否完整，失败退出码 1
 *   可选 --root <dir>：指定 skill 根目录（默认本脚本的上一级目录）
 *
 * check 覆盖四项：
 *   1. manifest：MANIFEST.json 与包内文件逐一一致（路径、sha256、工具版本）。
 *   2. links：SKILL.md、presets/、recipes/、references/ 下 Markdown 的相对链接
 *      都解析到包内存在的文件，不允许跳出包根目录。
 *   3. sources：配方「源模板 → 目标位置」表格与「源模板位置」列表里的源路径在包内存在。
 *   4. external：指向 lazypack-discipline 本仓的路径（docs/formats/、docs/quality-gates/、
 *      scripts/calculate_crap.mjs）所在行须写明「lazypack-discipline 仓」，
 *      避免在目标仓里被误读为目标仓自己的文件。
 *
 * 哈希按「文本文件把 CRLF 规范为 LF、二进制文件按原字节」计算，Windows 上
 * 开了 autocrlf 的检出也能通过。退出码：0 通过；1 检查失败；2 用法错误。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST_NAME = 'MANIFEST.json';
export const SCHEMA = 'lazypack-skill-manifest/1';
const DOC_DIRS = ['presets', 'recipes', 'references'];
const EXTERNAL_PATTERNS = [/docs\/formats\//, /docs\/quality-gates\//, /scripts\/calculate_crap\.mjs/];
const EXTERNAL_MARK = 'lazypack-discipline 仓';
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
  if (recorded.schema !== SCHEMA) {
    failures.push({ check: 'manifest', detail: `schema 应为 ${SCHEMA}，实际 ${JSON.stringify(recorded.schema)}` });
  }
  const actual = buildManifest(root);
  const want = new Map((recorded.files || []).map((f) => [f.path, f.sha256]));
  const have = new Map(actual.files.map((f) => [f.path, f.sha256]));
  for (const [p, h] of want) {
    if (!have.has(p)) failures.push({ check: 'manifest', detail: `清单记录的文件缺失：${p}` });
    else if (have.get(p) !== h) failures.push({ check: 'manifest', detail: `文件内容与清单不符：${p}` });
  }
  for (const p of have.keys()) {
    if (!want.has(p)) failures.push({ check: 'manifest', detail: `包内文件未登记到清单：${p}` });
  }
  const wantTools = JSON.stringify(recorded.tools || []);
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
  return line.replace(/`[^`]*`/g, '');
}

function checkLinks(root, docs, failures) {
  const rootAbs = path.resolve(root);
  for (const rel of docs) {
    const lines = fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/);
    let fenced = false;
    lines.forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return;
      for (const m of stripCode(line).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
        const clean = decodeURIComponent(target.split('#')[0]);
        if (!clean) continue;
        const abs = path.resolve(path.dirname(path.join(rootAbs, rel)), clean);
        const where = `${rel}:${i + 1}`;
        if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
          failures.push({ check: 'links', detail: `${where} 链接跳出 skill 包：${target}` });
        } else if (!fs.existsSync(abs)) {
          failures.push({ check: 'links', detail: `${where} 链接目标不存在：${target}` });
        }
      }
    });
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
    let srcCol = -1;
    let inList = false;
    lines.forEach((line, i) => {
      if (/^\|/.test(line)) {
        const cells = line.split('|').slice(1, -1).map((c) => c.trim());
        const header = cells.findIndex((c) => /^源(模板|路径)?$/.test(c));
        if (header >= 0) { srcCol = header; return; }
        if (srcCol >= 0 && !/^[-:\s]+$/.test(cells.join(''))) {
          for (const p of sourcePathsIn(cells[srcCol] || '')) found.push({ p, line: i + 1 });
        }
        return;
      }
      srcCol = -1;
      if (/^\*\*源模板位置\*\*/.test(line)) { inList = true; return; }
      if (inList) {
        if (/^\s*-\s/.test(line)) {
          for (const p of sourcePathsIn(line)) found.push({ p, line: i + 1 });
        } else if (line.trim() !== '') {
          inList = false;
        }
      }
    });
    for (const { p, line } of found) {
      if (!fs.existsSync(path.join(root, p))) {
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

export function checkPackage(root) {
  const failures = [];
  checkManifest(root, failures);
  const docs = docFiles(root);
  checkLinks(root, docs, failures);
  checkSources(root, failures);
  checkExternal(root, docs, failures);
  return failures;
}

function main(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const rootIdx = args.indexOf('--root');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(rootIdx >= 0 ? args[rootIdx + 1] || '' : path.join(here, '..'));
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
    console.log('包检查通过：manifest、links、sources、external 四项均无差异');
    return 0;
  }
  console.error('用法：node scripts/package_manifest.mjs <generate|check> [--root <skill 目录>]');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv));
}
