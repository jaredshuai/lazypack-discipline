/**
 * doc_scanner.mjs
 * 
 * 确定性文档扫描与引用图谱构建器 (Bounded Document Scanner & Reference Graph Builder)
 * 纯 Node.js 标准库 (ES Modules)
 * 来源: 复用 S1 document-routing.md 有界扫描与 S6 parseMarkdownUrl 逻辑
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function computeSha256(contentOrPath) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(contentOrPath)) {
    hash.update(contentOrPath);
  } else if (typeof contentOrPath === 'string') {
    if (!contentOrPath.includes('\n') && !contentOrPath.includes('\r') && fs.existsSync(contentOrPath)) {
      hash.update(fs.readFileSync(contentOrPath));
    } else {
      hash.update(Buffer.from(contentOrPath, 'utf8'));
    }
  }
  return hash.digest('hex');
}

export function normalizeRelPath(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Markdown URL 解构
 */
export function parseMarkdownUrl(rawUrl) {
  let pathname = rawUrl;
  let search = '';
  let hash = '';

  const hashIdx = pathname.indexOf('#');
  const queryIdx = pathname.indexOf('?');

  if (hashIdx !== -1 && queryIdx !== -1) {
    if (queryIdx < hashIdx) {
      search = pathname.slice(queryIdx, hashIdx);
      hash = pathname.slice(hashIdx);
      pathname = pathname.slice(0, queryIdx);
    } else {
      hash = pathname.slice(hashIdx);
      pathname = pathname.slice(0, hashIdx);
    }
  } else if (hashIdx !== -1) {
    hash = pathname.slice(hashIdx);
    pathname = pathname.slice(0, hashIdx);
  } else if (queryIdx !== -1) {
    search = pathname.slice(queryIdx);
    pathname = pathname.slice(0, queryIdx);
  }

  return { pathname, search, hash };
}

/**
 * 提取 Markdown 标题与 Slug
 */
export function extractHeadingsAndSlugs(content) {
  const headings = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const slug = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5\-_ ]+/g, '')
        .trim()
        .replace(/\s+/g, '-');
      headings.push({ level, text, slug, line: i + 1 });
    }
  }
  return headings;
}

/**
 * 检查路径是否属于禁区或敏感路径。
 * 排除目录与敏感文件都是显式集合：目录按路径段精确匹配；敏感文件按完整文件名或明确前后缀匹配，避免误排除讨论安全架构的普通设计文档。
 * 调用前会把整条相对路径小写化，因此集合字面量使用小写；`.DS_Store` 对应 `.ds_store`。
 * @param {string} relPath 相对仓库根的路径
 * @returns {{ excluded: boolean, reason?: string }} 命中时 reason 为 excluded_directory 或 sensitive_file
 */
export function isExcludedOrSensitive(relPath) {
  const norm = normalizeRelPath(relPath).toLowerCase();
  const segments = norm.split('/');

  // 排除目录。路径已小写化，`.DS_Store` 以 `.ds_store` 入集。
  const excludedDirs = new Set([
    'node_modules', '.git', 'vendor', 'dist', 'build', 'target',
    'out', '.cache', '.pytest_cache', '__pycache__', '.venv', 'venv',
    '.idea', '.vscode', '.lazypack-backup', '.ds_store'
  ]);

  for (const seg of segments) {
    if (excludedDirs.has(seg)) return { excluded: true, reason: 'excluded_directory' };
  }

  // 敏感文件精准匹配: 仅匹配真实敏感凭据文件，不根据子串误杀设计文档
  const base = path.basename(norm);
  if (
    base === '.env' || base.startsWith('.env.') ||
    base === 'credentials.json' || base === 'client_secret.json' ||
    base.endsWith('.pem') || base.endsWith('.key') ||
    base === 'id_rsa' || base === 'id_ed25519' ||
    norm.startsWith('.ssh/') || norm.includes('/.ssh/')
  ) {
    return { excluded: true, reason: 'sensitive_file' };
  }

  return { excluded: false };
}

/**
 * 扫描项目全量 Markdown 文档并建立双向引用图谱
 * 声明: 扫描与引用解析严格限于有界 Markdown 文件的标准内联链接与参考定义
 */
export function scanProjectDocuments(repoRoot) {
  const absRepo = path.resolve(repoRoot);
  if (!fs.existsSync(absRepo)) {
    throw new Error(`Repository root does not exist: ${absRepo}`);
  }

  const files = [];
  const inboundMap = new Map(); // targetRelPath -> [{ sourceRelPath, rawUrl, line }]
  const deadlinks = [];
  let boundedExclusionsCount = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      const relPath = normalizeRelPath(path.relative(absRepo, fullPath));

      // 检查符号链接越界
      if (ent.isSymbolicLink()) {
        try {
          const real = fs.realpathSync(fullPath);
          const relToRoot = path.relative(absRepo, real);
          if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
            boundedExclusionsCount++;
            continue; // 阻断越界符号链接
          }
        } catch (e) {
          boundedExclusionsCount++;
          continue; // 损坏符号链接阻断
        }
      }

      const check = isExcludedOrSensitive(relPath);
      if (check.excluded) {
        boundedExclusionsCount++;
        continue;
      }

      if (ent.isDirectory()) {
        walk(fullPath);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const sha256 = computeSha256(fullPath);
        const headings = extractHeadingsAndSlugs(content);

        // 提取链接
        const outboundLinks = [];
        const lines = content.split(/\r?\n/);
        const linkRegex = /(!?\[(?<text>[^\]]*)\]\((?<rawurl>[^\s\)]+)(?:\s+"(?<title>[^"]*)")?\))/g;

        for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
          const lineText = lines[lineNum - 1];
          let match;
          while ((match = linkRegex.exec(lineText)) !== null) {
            const rawurl = match.groups.rawurl;
            // 忽略外部协议
            if (
              rawurl.startsWith('http://') ||
              rawurl.startsWith('https://') ||
              rawurl.startsWith('mailto:') ||
              rawurl.startsWith('ftp:') ||
              rawurl.startsWith('#')
            ) {
              continue;
            }

            const { pathname, search, hash } = parseMarkdownUrl(rawurl);
            let targetRel = relPath;
            if (pathname) {
              const fromDir = path.dirname(fullPath);
              const absTarget = path.resolve(fromDir, pathname);
              targetRel = normalizeRelPath(path.relative(absRepo, absTarget));
            }

            outboundLinks.push({
              rawUrl: rawurl,
              pathname,
              targetRel,
              hash,
              line: lineNum,
              text: match.groups.text
            });

            // 注册入站引用
            if (!inboundMap.has(targetRel)) {
              inboundMap.set(targetRel, []);
            }
            inboundMap.get(targetRel).push({
              sourceRelPath: relPath,
              rawUrl: rawurl,
              line: lineNum,
              text: match.groups.text
            });

            // 检查死链 (仅限于当前有界范围)
            const absTargetFile = path.resolve(absRepo, targetRel);
            if (!fs.existsSync(absTargetFile)) {
              deadlinks.push({
                sourceRelPath: relPath,
                rawUrl: rawurl,
                targetRel,
                line: lineNum,
                reason: 'Target file does not exist'
              });
            }
          }
        }

        files.push({
          relPath,
          size: fs.statSync(fullPath).size,
          sha256,
          headings,
          outboundLinks
        });
      }
    }
  }

  walk(absRepo);

  const inboundReferences = {};
  for (const [targetRel, refs] of inboundMap.entries()) {
    inboundReferences[targetRel] = refs;
  }

  return {
    repoRoot: absRepo,
    totalFiles: files.length,
    boundedExclusionsCount,
    files,
    inboundReferences,
    deadlinks
  };
}
