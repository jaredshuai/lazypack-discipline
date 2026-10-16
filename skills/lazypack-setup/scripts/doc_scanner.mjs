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
  // `raw-qa` 为规范 raw_qa 留存目录名（docs/raw-qa/），纳入同一排除集合，防止扫描读取敏感原始问答。
  const excludedDirs = new Set([
    'node_modules', '.git', 'vendor', 'dist', 'build', 'target',
    'out', '.cache', '.pytest_cache', '__pycache__', '.venv', 'venv',
    '.idea', '.vscode', '.lazypack-backup', '.ds_store', 'raw-qa'
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
 * 规范化调用方传入的排除路径：分隔符归一、按 POSIX 折叠 `.` 与 `..` 段、去掉尾部斜杠，再小写化供前缀匹配。
 * 目录写法（如 `docs/raw-qa/`）与不带斜杠或含 `.` 段的写法（`docs/raw-qa`、`docs/./raw-qa`）等价。
 * 仅剔除空白项；`. `（仓根本身）保留为「排除仓根」哨兵，不静默丢弃，避免失败开放。
 * @param {string[]} excludePaths 仓内相对路径
 * @returns {string[]} 规范化后的排除路径
 */
export function normalizeExcludePaths(excludePaths = []) {
  const normalized = excludePaths
    .map((p) => String(p).trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const n = path.posix.normalize(normalizeRelPath(p)).replace(/\/+$/, '');
      return (n || '.').toLowerCase();
    });
  // 去重并排序：等价写法（`docs/x` 与 `docs/x/`）或参数顺序不同必须产出同一规范集合，
  // 否则会因无意义的差异触发重新审批（规范集合会写入计划指纹）。
  return [...new Set(normalized)].sort();
}

/**
 * 解析仓内相对路径的真实路径，用于拦截经仓内符号链接/Junction 别名指向被排除目录的绕过。
 * 沿父级向上找到首个已存在的祖先并取其 realpath，再拼回未存在的尾段。
 * @param {string} repoRoot 仓库根
 * @param {string} relPath 仓内相对路径
 * @returns {string|null} 仓内相对的真实路径；越界或不可解析时为 null
 */
export function realRepoRelPath(repoRoot, relPath) {
  const absRepo = path.resolve(repoRoot);
  const abs = path.resolve(absRepo, normalizeRelPath(String(relPath)));
  let cur = abs;
  while (!fs.existsSync(cur) && cur !== path.dirname(cur)) cur = path.dirname(cur);
  if (!fs.existsSync(cur)) return null;
  try {
    const realRepo = fs.realpathSync(absRepo);
    const realCur = fs.realpathSync(cur);
    const relCur = path.relative(realRepo, realCur);
    if (relCur.startsWith('..') || path.isAbsolute(relCur)) return null;
    const suffix = path.relative(cur, abs);
    const realRel = normalizeRelPath(suffix ? path.join(relCur, suffix) : relCur);
    return realRel || null;
  } catch {
    return null;
  }
}

/**
 * 构造排除判定函数：固定禁区/敏感集合，或调用方传入的排除路径（其自身及子孙）。
 * 供扫描与计划校验共用，避免两处各写一套匹配逻辑。
 * 路径为 `. `（仓根本身）时排除仓内一切路径，按失败关闭处理，不静默放行。
 * @param {string[]} excludePaths 仓内相对路径
 * @returns {(relPath: string) => boolean}
 */
export function buildExclusionMatcher(excludePaths = []) {
  const configured = normalizeExcludePaths(excludePaths);
  const excludesRoot = configured.includes('.');
  return (relPath) => {
    if (excludesRoot) return true;
    const lower = path.posix.normalize(normalizeRelPath(String(relPath))).toLowerCase();
    if (isExcludedOrSensitive(lower).excluded) return true;
    return configured.some((ex) => lower === ex || lower.startsWith(ex + '/'));
  };
}

/**
 * 为链接提取准备一行 Markdown。
 * 围栏标记行与围栏内的行整行跳过；围栏外的行内反引号替换为等长空白，避免代码示例被当成链接。
 * 只用于链接提取。标题抽取仍读取原始正文，不调用本函数。
 * @param {string} lineText 原始行
 * @param {boolean} inFence 进入本行之前是否处于围栏代码块内
 * @returns {{ skip: boolean, inFence: boolean, text: string }} skip 为真时不要在该行抽链；inFence 传给下一行
 */
export function prepareLineForLinkExtraction(lineText, inFence) {
  if (/^\s*```/.test(lineText)) {
    return { skip: true, inFence: !inFence, text: '' };
  }
  if (inFence) {
    return { skip: true, inFence: true, text: '' };
  }
  const text = lineText.replace(/`[^`]*`/g, (chunk) => ' '.repeat(chunk.length));
  return { skip: false, inFence: false, text };
}

/**
 * 判断链接目标是否应在扫描时忽略。
 * 与 scripts/check_doc_pairs.mjs 的非相对链接判定一致：纯锚点、协议相对 URL，以及带 scheme 的 URL（含 file:、http:、https:、mailto:、ftp:）。
 * @param {string} rawurl 链接括号内的目标
 * @returns {boolean} 为真时不写入出站图、入站图和死链
 */
export function isIgnoredLinkTarget(rawurl) {
  if (!rawurl || rawurl.startsWith('#') || rawurl.startsWith('//')) {
    return true;
  }
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawurl);
}

/**
 * 解码 Markdown 链接目标里的百分号编码，使 `docs/raw%2Dqa/x.md` 与 `docs/raw-qa/x.md` 归一到同一路径，
 * 排除判定才能命中（否则被排除目录的路径会以字面量绕过）。
 * 非法编码（decodeURIComponent 抛错）时按原文返回，不中断扫描。
 * @param {string} rawPathname 链接括号内的 pathname（已剥离 query 与 fragment）
 * @returns {string}
 */
function decodeUrlPathname(rawPathname) {
  try {
    return decodeURIComponent(rawPathname);
  } catch {
    return rawPathname;
  }
}

/**
 * 扫描项目全量 Markdown 文档并建立双向引用图谱。
 * 链接提取会先剥离围栏与行内代码；标题抽取使用原始正文。
 * 除固定的 `isExcludedOrSensitive` 集合外，`options.excludePaths` 可再传入仓内相对路径
 * （如已配置的 `retention.paths.raw_qa`），其自身及子孙一并静默排除，不读取内容。
 * 声明: 扫描与引用解析严格限于有界 Markdown 文件的标准内联链接与参考定义
 * @param {string} repoRoot 仓库根
 * @param {{ excludePaths?: string[] }} [options] 额外排除的仓内相对路径
 */
export function scanProjectDocuments(repoRoot, options = {}) {
  const absRepo = path.resolve(repoRoot);
  if (!fs.existsSync(absRepo)) {
    throw new Error(`Repository root does not exist: ${absRepo}`);
  }

  const isExcluded = buildExclusionMatcher(options.excludePaths);

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
          // 仓内符号链接/Junction 别名指向被排除目录时同样阻断（按真实路径判定，防止词法路径绕过）
          if (isExcluded(normalizeRelPath(relToRoot))) {
            boundedExclusionsCount++;
            continue;
          }
        } catch (e) {
          boundedExclusionsCount++;
          continue; // 损坏符号链接阻断
        }
      }

      if (isExcluded(relPath)) {
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

        let inFence = false;
        for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
          const prepared = prepareLineForLinkExtraction(lines[lineNum - 1], inFence);
          inFence = prepared.inFence;
          if (prepared.skip) {
            continue;
          }
          const lineText = prepared.text;
          linkRegex.lastIndex = 0;
          let match;
          while ((match = linkRegex.exec(lineText)) !== null) {
            const rawurl = match.groups.rawurl;
            if (isIgnoredLinkTarget(rawurl)) {
              continue;
            }

            const { pathname, search, hash } = parseMarkdownUrl(rawurl);
            let targetRel = relPath;
            if (pathname) {
              const fromDir = path.dirname(fullPath);
              const absTarget = path.resolve(fromDir, decodeUrlPathname(pathname));
              targetRel = normalizeRelPath(path.relative(absRepo, absTarget));
            }

            // 指向排除目录的链接一并跳过：不写出站边、不写入站引用、不报死链，
            // 避免在扫描产物里暴露敏感原始问答的路径与文件名。
            if (isExcluded(targetRel)) {
              continue;
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
