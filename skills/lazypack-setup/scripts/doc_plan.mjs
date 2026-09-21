/**
 * doc_plan.mjs
 * 
 * 迁移与登记计划生成器 (Plan Generator, Link Rewrite Calculator & Fingerprinter)
 * 纯 Node.js 标准库 (ES Modules)
 * 来源: 复用 S6 batch-migrator 相对链接计算与 Markdown 重写逻辑，加强 B2 路径边界防御
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseMarkdownUrl, computeSha256, normalizeRelPath } from './doc_scanner.mjs';

/**
 * 严格路径边界核验 (B2 修复)
 * 严密检查: 相对逃逸 (..)、绝对路径跨根、跨盘符 (Windows)、符号链接与 Junction 越界
 */
export function assertPathWithinRepo(repoRoot, testPath, fieldName = 'path') {
  if (!testPath || typeof testPath !== 'string') {
    const err = new Error(`ERR_PATH_ESCAPE: ${fieldName} must be a non-empty string`);
    err.code = 'ERR_PATH_ESCAPE';
    throw err;
  }

  const absRepo = path.resolve(repoRoot);
  const absPath = path.resolve(absRepo, testPath);

  // 1. 跨盘符检查 (Windows C: vs D:)
  const repoParsed = path.parse(absRepo);
  const pathParsed = path.parse(absPath);
  if (repoParsed.root.toLowerCase() !== pathParsed.root.toLowerCase()) {
    const err = new Error(`ERR_PATH_ESCAPE: ${fieldName} (${testPath}) crosses drive boundaries from ${absRepo}`);
    err.code = 'ERR_PATH_ESCAPE';
    err.details = { fieldName, testPath, repoRoot: absRepo };
    throw err;
  }

  // 2. 相对逃逸检查
  const rel = path.relative(absRepo, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error(`ERR_PATH_ESCAPE: ${fieldName} (${testPath}) escapes repository root: ${absRepo}`);
    err.code = 'ERR_PATH_ESCAPE';
    err.details = { fieldName, testPath, repoRoot: absRepo };
    throw err;
  }

  // 3. 符号链接与 Junction 越界检查 (沿父级向上查找首个已存在的物理祖先)
  let curr = absPath;
  while (!fs.existsSync(curr) && curr !== path.dirname(curr)) {
    curr = path.dirname(curr);
  }
  if (fs.existsSync(curr)) {
    try {
      const realRepo = fs.realpathSync(absRepo);
      const realCurr = fs.realpathSync(curr);
      const realRel = path.relative(realRepo, realCurr);
      if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
        const err = new Error(`ERR_PATH_ESCAPE: ${fieldName} (${testPath}) resolves via symlink/junction outside repo root: ${realRepo}`);
        err.code = 'ERR_PATH_ESCAPE';
        err.details = { fieldName, testPath, realCurr, realRepo };
        throw err;
      }
    } catch (e) {
      if (e.code === 'ERR_PATH_ESCAPE') throw e;
      const err = new Error(`ERR_PATH_ESCAPE: Failed to reliably verify symlink boundary for ${fieldName}: ${e.message}`);
      err.code = 'ERR_PATH_ESCAPE';
      throw err;
    }
  }

  return normalizeRelPath(rel);
}

/**
 * 计算相对 Markdown 链接
 */
export function computeRelativeMarkdownLink(fromFilePath, toFilePath) {
  const fromDir = path.posix.dirname(normalizeRelPath(fromFilePath));
  const toFile = normalizeRelPath(toFilePath);
  let rel = path.posix.relative(fromDir, toFile);
  if (!rel.startsWith('.') && !rel.includes('/')) {
    rel = './' + rel;
  }
  return rel;
}

/**
 * 检查 Markdown 是否包含不支持的复杂 HTML/宏语法
 */
export function validateBoundedMarkdownSyntax(content, filePath) {
  if (/\{\{[\s\S]*?\}\}/.test(content) || /<%[\s\S]*?%>/.test(content)) {
    throw new Error(
      `ERR_UNSUPPORTED_MARKDOWN_SYNTAX: File ${filePath} contains template macros ({{...}} or <%...%>), automatic link rewrite cannot be safely performed.`
    );
  }

  if (/<a\s+[^>]*href\s*=\s*['"]?[^'"]*\{\{/i.test(content)) {
    throw new Error(
      `ERR_UNSUPPORTED_MARKDOWN_SYNTAX: File ${filePath} contains dynamic HTML <a> tags, automatic link rewrite cannot be safely performed.`
    );
  }
}

/**
 * 重写 Markdown 中的出站与入站链接
 */
export function rewriteMarkdownContent(content, currentRelPath, newRelPath, moveMap, repoRoot) {
  validateBoundedMarkdownSyntax(content, currentRelPath);

  const linkRegex = /(!?\[(?<text>[^\]]*)\]\((?<rawurl>[^\s\)]+)(?:\s+"(?<title>[^"]*)")?\))/g;

  return content.replace(linkRegex, (match, full, text, rawurl, title) => {
    if (
      rawurl.startsWith('http://') || rawurl.startsWith('https://') ||
      rawurl.startsWith('mailto:') || rawurl.startsWith('ftp:') ||
      rawurl.startsWith('#')
    ) {
      return match;
    }

    const { pathname, search, hash } = parseMarkdownUrl(rawurl);
    if (!pathname) {
      return match;
    }

    const origDir = path.posix.dirname(normalizeRelPath(currentRelPath));
    const resolvedOrig = path.posix.normalize(path.posix.join(origDir, pathname));

    let targetRel = resolvedOrig;
    if (moveMap.has(resolvedOrig)) {
      targetRel = moveMap.get(resolvedOrig);
    }

    const newRel = computeRelativeMarkdownLink(newRelPath, targetRel);
    const titlePart = title !== undefined ? ` "${title}"` : '';
    return `${full.startsWith('!') ? '!' : ''}[${text}](${newRel}${search}${hash}${titlePart})`;
  });
}

/**
 * 生成或更新 docs/ARTIFACTS.md Section 3 内容
 */
export function updateArtifactsSection3(existingContent, entries, artifactsRelPath = 'docs/ARTIFACTS.md') {
  const section3Header = '## 3. 已核对的入口登记';
  const tableHeader = '| 路径 | 类别 | 状态 | 依据与边界 |';
  const tableDivider = '|---|---|---|---|';

  let content = existingContent || `# 本仓文档归属与产物登记册\n\n${section3Header}\n\n${tableHeader}\n${tableDivider}\n`;

  if (!content.includes(section3Header)) {
    content = content.trimEnd() + `\n\n${section3Header}\n\n${tableHeader}\n${tableDivider}\n`;
  }

  const lines = content.split(/\r?\n/);
  let inSection3 = false;
  let section3EndIdx = lines.length;

  const existingKeys = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('## 3.')) {
      inSection3 = true;
    } else if (inSection3 && line.trim().startsWith('## ') && !line.trim().startsWith('## 3.')) {
      section3EndIdx = i;
      break;
    }

    if (inSection3 && line.trim().startsWith('|') && !line.includes('---|---')) {
      const parts = line.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 1) {
        const rawPath = parts[0].replace(/\[([^\]]+)\]\([^)]+\)/, '$1');
        existingKeys.add(rawPath);
      }
    }
  }

  const rowsToAdd = [];
  for (const item of entries) {
    const p = normalizeRelPath(item.path);
    if (!existingKeys.has(p)) {
      const relHref = computeRelativeMarkdownLink(artifactsRelPath, p);
      const linkText = `[${p}](${relHref})`;
      const zone = item.zone || '业务文档';
      const status = item.status || 'current';
      const note = item.description
        ? `${item.maintainer_trigger ? item.maintainer_trigger + '；' : ''}${item.description}`
        : item.maintainer_trigger || '按需维护';
      rowsToAdd.push(`| ${linkText} | ${zone} | ${status} | ${note} |`);
    }
  }

  if (rowsToAdd.length > 0) {
    const beforeSec3End = lines.slice(0, section3EndIdx);
    while (
      beforeSec3End.length > 0 &&
      beforeSec3End[beforeSec3End.length - 1].trim() === ''
    ) {
      beforeSec3End.pop();
    }
    const afterSec3End = lines.slice(section3EndIdx);
    return [...beforeSec3End, ...rowsToAdd, ...afterSec3End].join('\n');
  }

  return content;
}

/**
 * 计划生成主函数
 */
export function buildMigrationPlan(repoRoot, planSpec, scanResult) {
  const absRepo = path.resolve(repoRoot);
  const preserveItems = planSpec.preserve_items || [];
  const migrateItems = planSpec.migrate_items || [];

  const moveMap = new Map();
  const targetCollisions = [];
  const sourceMissing = [];
  const targetCaseMap = new Map(); // lowercase -> original

  // 1. 验证原位保留项路径边界与存在性
  const inputDigests = {};
  for (const item of preserveItems) {
    const norm = assertPathWithinRepo(absRepo, item.path, 'preserve_items.path');
    const absPath = path.resolve(absRepo, norm);
    if (!fs.existsSync(absPath)) {
      sourceMissing.push(norm);
    } else {
      inputDigests[norm] = computeSha256(absPath);
    }
  }

  // 2. 验证迁移项路径边界、大小写碰撞与存在性
  for (const item of migrateItems) {
    const src = assertPathWithinRepo(absRepo, item.source_path, 'migrate_items.source_path');
    const tgt = assertPathWithinRepo(absRepo, item.target_path, 'migrate_items.target_path');

    if (src === tgt) {
      throw new Error(`ERR_INVALID_PLAN: Source path and target path are identical: ${src}`);
    }

    // 检查批次内目标大小写碰撞 (Windows 大小写不敏感安全检查)
    const tgtLower = tgt.toLowerCase();
    if (targetCaseMap.has(tgtLower)) {
      const err = new Error(`ERR_TARGET_CASE_COLLISION: Target path collides with another target in case: ${tgt} vs ${targetCaseMap.get(tgtLower)}`);
      err.code = 'ERR_TARGET_CASE_COLLISION';
      throw err;
    }
    targetCaseMap.set(tgtLower, tgt);

    // 检查源文件存在性
    const absSrc = path.resolve(absRepo, src);
    if (!fs.existsSync(absSrc)) {
      sourceMissing.push(src);
    }

    // 检查目标是否已被占用 (写入前目标占用检查)
    const absTgt = path.resolve(absRepo, tgt);
    if (fs.existsSync(absTgt)) {
      targetCollisions.push(tgt);
    }

    moveMap.set(src, tgt);
  }

  if (sourceMissing.length > 0) {
    throw new Error(`ERR_SOURCE_FILE_NOT_FOUND: Source/Preserve files do not exist: ${sourceMissing.join(', ')}`);
  }

  if (targetCollisions.length > 0) {
    const err = new Error(`ERR_PRE_WRITE_TARGET_COLLISION: Target files already exist: ${targetCollisions.join(', ')}`);
    err.code = 'pre_write_target_collision';
    err.details = { collisions: targetCollisions };
    throw err;
  }

  // 3. 计算各迁移文件的出站链接重写与预期哈希
  const fileActions = [];

  for (const item of migrateItems) {
    const src = normalizeRelPath(item.source_path);
    const tgt = normalizeRelPath(item.target_path);
    const absSrc = path.resolve(absRepo, src);

    const origContent = fs.readFileSync(absSrc, 'utf8');
    const origSha256 = computeSha256(origContent);
    inputDigests[src] = origSha256;

    // 出站重写: 原文件移动到新路径后，其内部相对链接调整
    const rewrittenContent = rewriteMarkdownContent(origContent, src, tgt, moveMap, absRepo);
    const rewrittenSha256 = computeSha256(Buffer.from(rewrittenContent, 'utf8'));

    fileActions.push({
      action: 'MIGRATE_FILE',
      sourcePath: src,
      targetPath: tgt,
      sourceSha256: origSha256,
      expectedTargetSha256: rewrittenSha256,
      hasRewrittenOutboundLinks: origSha256 !== rewrittenSha256,
      contentToWrite: rewrittenContent
    });
  }

  // 4. 计算受影响引用文件 (Inbound References) 的重写与预期哈希
  const inboundRefsToUpdate = new Map();
  for (const item of migrateItems) {
    const src = normalizeRelPath(item.source_path);
    const refs = scanResult.inboundReferences[src] || [];
    for (const ref of refs) {
      const refPath = assertPathWithinRepo(absRepo, ref.sourceRelPath, 'inboundReferences.sourceRelPath');
      if (!moveMap.has(refPath)) {
        inboundRefsToUpdate.set(refPath, true);
      }
    }
  }

  for (const refPath of inboundRefsToUpdate.keys()) {
    const absRef = path.resolve(absRepo, refPath);
    if (fs.existsSync(absRef)) {
      const origContent = fs.readFileSync(absRef, 'utf8');
      const origSha256 = computeSha256(origContent);
      inputDigests[refPath] = origSha256;

      const rewrittenContent = rewriteMarkdownContent(origContent, refPath, refPath, moveMap, absRepo);
      const rewrittenSha256 = computeSha256(Buffer.from(rewrittenContent, 'utf8'));

      fileActions.push({
        action: 'REWRITE_INBOUND_REFERENCE',
        filePath: refPath,
        sourceSha256: origSha256,
        expectedSha256: rewrittenSha256,
        contentToWrite: rewrittenContent
      });
    }
  }

  // 5. 准备 docs/ARTIFACTS.md Section 3 登记项
  const artifactsRelPath = assertPathWithinRepo(absRepo, 'docs/ARTIFACTS.md', 'artifactsRelPath');
  const absArtifacts = path.resolve(absRepo, artifactsRelPath);
  let existingArtifactsContent = '';
  if (fs.existsSync(absArtifacts)) {
    existingArtifactsContent = fs.readFileSync(absArtifacts, 'utf8');
    inputDigests[artifactsRelPath] = computeSha256(existingArtifactsContent);
  } else {
    inputDigests[artifactsRelPath] = null;
  }

  const allEntriesToRegister = [];
  for (const item of preserveItems) {
    allEntriesToRegister.push({
      path: item.path,
      zone: item.zone,
      status: item.status || 'current',
      maintainer_trigger: item.maintainer_trigger,
      description: item.description
    });
  }
  for (const item of migrateItems) {
    allEntriesToRegister.push({
      path: item.target_path,
      zone: item.zone,
      status: item.status || 'current',
      maintainer_trigger: item.maintainer_trigger,
      description: item.description || `由 ${item.source_path} 迁移`
    });
  }

  const newArtifactsContent = updateArtifactsSection3(existingArtifactsContent, allEntriesToRegister, artifactsRelPath);
  const newArtifactsSha256 = computeSha256(Buffer.from(newArtifactsContent, 'utf8'));

  if (existingArtifactsContent !== newArtifactsContent) {
    fileActions.push({
      action: 'UPDATE_ARTIFACTS_REGISTER',
      filePath: artifactsRelPath,
      sourceSha256: inputDigests[artifactsRelPath],
      expectedSha256: newArtifactsSha256,
      contentToWrite: newArtifactsContent
    });
  }

  // 6. 计算双指纹 (input_fp & plan_fp)
  const inputFpHash = crypto.createHash('sha256');
  for (const [p, digest] of Object.entries(inputDigests).sort(([a], [b]) => a.localeCompare(b))) {
    inputFpHash.update(`${p}:${digest || 'null'};`);
  }
  const inputFp = inputFpHash.digest('hex');

  // 规范化 planSummary，完整包含原位保留项与迁移项，防止元数据篡改
  const planSummary = {
    preserveItems: preserveItems.map((p) => ({
      path: normalizeRelPath(p.path),
      zone: p.zone || '业务文档',
      status: p.status || 'current',
      maintainer_trigger: p.maintainer_trigger || '',
      description: p.description || ''
    })).sort((a, b) => a.path.localeCompare(b.path)),
    migrateItems: migrateItems.map((m) => ({
      source_path: normalizeRelPath(m.source_path),
      target_path: normalizeRelPath(m.target_path),
      zone: m.zone || '业务文档',
      status: m.status || 'current'
    })).sort((a, b) => a.source_path.localeCompare(b.source_path)),
    actionsCount: fileActions.length,
    inputFp,
    fileActions: fileActions.map((a) => ({
      action: a.action,
      sourcePath: a.sourcePath || a.filePath,
      targetPath: a.targetPath || null,
      expectedSha256: a.expectedTargetSha256 || a.expectedSha256
    })).sort((a, b) => (a.sourcePath + (a.targetPath || '')).localeCompare(b.sourcePath + (b.targetPath || '')))
  };

  const planFp = crypto.createHash('sha256').update(JSON.stringify(planSummary)).digest('hex');

  return {
    repoRoot: absRepo,
    planFp,
    inputFp,
    inputDigests,
    preserveItems,
    migrateItems,
    fileActions,
    planSummary
  };
}
