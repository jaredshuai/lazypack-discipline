/**
 * scripts/handoff_manifest.js
 *
 * 跨阶段交接同源清单与文件核验工具 (CommonJS, 零外部依赖)
 *
 * 子命令:
 *   generate --root <基准根> --files-json <显式相对路径字符串数组JSON文件> --out-dir <尚不存在的新交付目录> [--include-lf-normalized]
 *   verify   --root <基准根> --manifest <清单JSON> [--table <摘要表Markdown>]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 错误类型与代码体系
 */
const ERROR_CODES = {
  // 参数与输入错误
  CLI_ARGUMENT_ERROR: 'CLI_ARGUMENT_ERROR',
  ROOT_NOT_FOUND: 'ROOT_NOT_FOUND',
  FILES_JSON_NOT_FOUND: 'FILES_JSON_NOT_FOUND',
  INVALID_FILES_JSON: 'INVALID_FILES_JSON',
  EMPTY_PATH_ERROR: 'EMPTY_PATH_ERROR',
  ABSOLUTE_PATH_FORBIDDEN: 'ABSOLUTE_PATH_FORBIDDEN',
  PATH_TRAVERSAL_FORBIDDEN: 'PATH_TRAVERSAL_FORBIDDEN',
  PATH_OUTSIDE_ROOT: 'PATH_OUTSIDE_ROOT',
  DUPLICATE_PATH_ERROR: 'DUPLICATE_PATH_ERROR',
  CASE_COLLISION_ERROR: 'CASE_COLLISION_ERROR',
  SYMLINK_FORBIDDEN: 'SYMLINK_FORBIDDEN',
  NOT_A_REGULAR_FILE: 'NOT_A_REGULAR_FILE',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',

  // 安全边界过滤
  FORBIDDEN_PATH_GIT: 'FORBIDDEN_PATH_GIT',
  FORBIDDEN_PATH_NODE_MODULES: 'FORBIDDEN_PATH_NODE_MODULES',
  CREDENTIAL_FILE_FORBIDDEN: 'CREDENTIAL_FILE_FORBIDDEN',

  // 输出与重叠保护
  OUT_DIR_EXISTS: 'OUT_DIR_EXISTS',
  PARENT_DIR_NOT_FOUND: 'PARENT_DIR_NOT_FOUND',
  INPUT_INSIDE_OUTDIR_ERROR: 'INPUT_INSIDE_OUTDIR_ERROR',
  OUTDIR_INSIDE_INPUT_ERROR: 'OUTDIR_INSIDE_INPUT_ERROR',

  // 规范化与类型限制
  BINARY_FILE_FOR_NORMALIZATION: 'BINARY_FILE_FOR_NORMALIZATION',
  INVALID_UTF8_FOR_NORMALIZATION: 'INVALID_UTF8_FOR_NORMALIZATION',

  // 阶段与重读比对错误
  INPUT_MISSING_DURING_REREAD: 'INPUT_MISSING_DURING_REREAD',
  INPUT_MODIFIED_DURING_REREAD: 'INPUT_MODIFIED_DURING_REREAD',
  STAGE_CORRUPTION: 'STAGE_CORRUPTION',

  // Verify 错误
  MANIFEST_NOT_FOUND: 'MANIFEST_NOT_FOUND',
  INVALID_MANIFEST_JSON: 'INVALID_MANIFEST_JSON',
  SCHEMA_VALIDATION_ERROR: 'SCHEMA_VALIDATION_ERROR'
};

class HandoffError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'HandoffError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 判断是否为明确的敏感/凭据文件
 */
function isForbiddenCredentialPath(relPath) {
  const baseName = path.basename(relPath).toLowerCase();
  if (baseName === '.env' || baseName.startsWith('.env.')) {
    return true;
  }
  const credentialExtensions = ['.pem', '.key', '.pfx', '.p12', '.keystore'];
  for (const ext of credentialExtensions) {
    if (baseName.endsWith(ext)) {
      return true;
    }
  }
  const credentialKeyFiles = [
    'id_rsa', 'id_rsa.pub',
    'id_ed25519', 'id_ed25519.pub',
    'id_dsa', 'id_dsa.pub',
    'id_ecdsa', 'id_ecdsa.pub'
  ];
  if (credentialKeyFiles.includes(baseName)) {
    return true;
  }
  return false;
}

/**
 * 校验路径安全与禁止规则（generate 与 verify 共享）
 * - 拒绝 .git 路径段
 * - 拒绝 node_modules 路径段
 * - 拒绝明确凭据/密钥文件
 */
function checkPathSecurity(normalizedPosix) {
  const segments = normalizedPosix.split('/');
  if (segments.includes('.git')) {
    return {
      forbidden: true,
      reason: ERROR_CODES.FORBIDDEN_PATH_GIT,
      message: `Accessing .git path is forbidden: ${normalizedPosix}`
    };
  }
  if (segments.includes('node_modules')) {
    return {
      forbidden: true,
      reason: ERROR_CODES.FORBIDDEN_PATH_NODE_MODULES,
      message: `Accessing node_modules path is forbidden: ${normalizedPosix}`
    };
  }
  if (isForbiddenCredentialPath(normalizedPosix)) {
    return {
      forbidden: true,
      reason: ERROR_CODES.CREDENTIAL_FILE_FORBIDDEN,
      message: `Explicit credential or key file is forbidden: ${normalizedPosix}`
    };
  }
  return { forbidden: false };
}

/**
 * 探测文件换行类型
 * - NONE: 0 字节或无任何换行字符
 * - CRLF: 仅包含 \r\n 换行
 * - LF: 仅包含单独 \n 换行
 * - CR: 仅包含单独 \r 换行
 * - MIXED: 包含混合换行模式
 */
function detectLineEndings(buffer) {
  if (buffer.length === 0) {
    return 'NONE';
  }
  let crlfCount = 0;
  let loneLfCount = 0;
  let loneCrCount = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x0D) { // \r
      if (i + 1 < buffer.length && buffer[i + 1] === 0x0A) { // \r\n
        crlfCount++;
        i++; // 跳过 \n
      } else {
        loneCrCount++;
      }
    } else if (buffer[i] === 0x0A) { // \n 且前一个不是 \r
      loneLfCount++;
    }
  }

  const totalBreaks = crlfCount + loneLfCount + loneCrCount;
  if (totalBreaks === 0) {
    return 'NONE';
  }
  if (crlfCount > 0 && loneLfCount === 0 && loneCrCount === 0) {
    return 'CRLF';
  }
  if (loneLfCount > 0 && crlfCount === 0 && loneCrCount === 0) {
    return 'LF';
  }
  if (loneCrCount > 0 && crlfCount === 0 && loneLfCount === 0) {
    return 'CR';
  }
  return 'MIXED';
}

/**
 * 对 UTF-8 文本执行 CRLF -> LF 规范化并计算 SHA256
 */
function computeLfNormalizedSha256(buffer, relPath) {
  // 检查是否含 0x00 空字节（二进制特征）
  if (buffer.includes(0x00)) {
    throw new HandoffError(
      ERROR_CODES.BINARY_FILE_FOR_NORMALIZATION,
      `Cannot compute LF-normalized hash on binary file (null byte detected): ${relPath}`
    );
  }

  // 严格 UTF-8 解码
  let text;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    text = decoder.decode(buffer);
  } catch (err) {
    throw new HandoffError(
      ERROR_CODES.INVALID_UTF8_FOR_NORMALIZATION,
      `Cannot compute LF-normalized hash on invalid UTF-8 text: ${relPath}`
    );
  }

  // 仅替换 \r\n 为 \n，保留单独 \r 或单独 \n
  const normalizedText = text.replace(/\r\n/g, '\n');
  const normalizedBuffer = Buffer.from(normalizedText, 'utf8');
  return crypto.createHash('sha256').update(normalizedBuffer).digest('hex');
}

/**
 * 安全格式化 Markdown 表格代码单元格
 * - 默认使用 CommonMark / GFM 规范的行内代码围栏（code span），处理独立管道转义（\|）与动态多反引号围栏
 * - 对反斜杠紧邻管道（\+|）这类 code span 无法在维持奇数防分列的同时还原单数反斜杠的组合，
 *   采用固定 <code> 容器结合全字符 Unicode 码点数字字符引用（NCR, e.g. &#102;）的整体纯文本编码：
 *   1. 将整个输入按 Unicode 码点完整转换为 &#<codePoint>;，不包含任何裸字符；
 *   2. 彻底杜绝管道符拆列（管道为 &#124;，无字面 | 存在）；
 *   3. 彻底杜绝 Markdown 内联强调（*、_）、链接（[]()）、加粗（**）与反引号解析；
 *   4. 彻底杜绝 HTML 节点注入（<、> 为 &#60;、&#62;）；
 *   5. GFM / Markdown 渲染引擎在 <code> 容器内将 NCR 100% 精确解码为原始字符，实现严格往返一致。
 */
function formatMarkdownCodeSpan(text) {
  const clean = String(text).replace(/[\r\n\t]+/g, ' ');

  // 针对反斜杠紧邻管道（\+|），采用固定 <code> 容器内 Unicode 码点 NCR 纯文本编码
  if (/\\+\|/.test(clean)) {
    let ncrContent = '';
    for (const char of clean) {
      ncrContent += `&#${char.codePointAt(0)};`;
    }
    return `<code>${ncrContent}</code>`;
  }

  // 默认使用 CommonMark 规范行内代码围栏
  const escaped = clean.replace(/(\\*)(\|)/g, (_, slashes) => {
    return '\\'.repeat(slashes.length * 2 + 1) + '|';
  });

  const matches = escaped.match(/`+/g);
  if (!matches) {
    return `\`${escaped}\``;
  }
  let maxLen = 0;
  for (const m of matches) {
    if (m.length > maxLen) {
      maxLen = m.length;
    }
  }
  const fence = '`'.repeat(maxLen + 1);
  const pad = (escaped.startsWith('`') || escaped.endsWith('`')) ? ' ' : '';
  return `${fence}${pad}${escaped}${pad}${fence}`;
}

/**
 * 纯渲染函数：从内存 manifest 渲染 Markdown 表格
 */
function renderMarkdownTable(manifest) {
  if (!manifest || !Array.isArray(manifest.files)) {
    throw new HandoffError(ERROR_CODES.SCHEMA_VALIDATION_ERROR, 'Invalid manifest structure for table rendering');
  }

  const hasLfNormalized = manifest.files.some(f => f && typeof f.sha256_lf_normalized === 'string');

  const headers = hasLfNormalized
    ? ['相对路径', '大小 (bytes)', 'SHA256 (Raw)', '换行类型', 'SHA256 (LF规范化)']
    : ['相对路径', '大小 (bytes)', 'SHA256 (Raw)', '换行类型'];

  const lines = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);

  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') continue;
    const row = [
      formatMarkdownCodeSpan(file.relative_path),
      String(file.size_bytes),
      `\`${file.sha256_raw}\``,
      file.line_endings
    ];
    if (hasLfNormalized) {
      row.push(file.sha256_lf_normalized ? `\`${file.sha256_lf_normalized}\`` : '-');
    }
    lines.push(`| ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}

/**
 * 校验 Manifest Schema 格式（将 manifest 当做不可信输入）
 */
function validateManifestSchema(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['Manifest root must be an object'] };
  }

  if (manifest.schema_version !== '1.0.0') {
    errors.push(`Invalid or unsupported schema_version: ${manifest.schema_version}`);
  }
  if (typeof manifest.generated_at !== 'string' || !manifest.generated_at) {
    errors.push('Missing or invalid generated_at timestamp');
  }
  if (typeof manifest.files_count !== 'number' || !Number.isInteger(manifest.files_count) || manifest.files_count < 0) {
    errors.push('files_count must be a non-negative integer');
  }
  if (!Array.isArray(manifest.files)) {
    errors.push('files must be an array');
  } else {
    if (manifest.files_count !== manifest.files.length) {
      errors.push(`files_count (${manifest.files_count}) does not match files array length (${manifest.files.length})`);
    }
    for (let i = 0; i < manifest.files.length; i++) {
      const item = manifest.files[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`File entry at index ${i} must be a non-null object`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 生产 API：同源生成清单与摘要表 (generateHandoffArtifacts)
 */
async function generateHandoffArtifacts(options) {
  const {
    root,
    filesJsonPath,
    files,
    outDir,
    includeLfNormalized = false,
    _testHooks = null
  } = options || {};

  // 1. 基础参数校验
  if (!root || typeof root !== 'string') {
    throw new HandoffError(ERROR_CODES.CLI_ARGUMENT_ERROR, 'Parameter "root" is required');
  }
  const absRoot = path.resolve(root);
  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    throw new HandoffError(ERROR_CODES.ROOT_NOT_FOUND, `Root directory does not exist: ${absRoot}`);
  }

  if (!outDir || typeof outDir !== 'string') {
    throw new HandoffError(ERROR_CODES.CLI_ARGUMENT_ERROR, 'Parameter "outDir" is required');
  }
  const absOutDir = path.resolve(outDir);

  // 保护：输出目录若已存在直接报错
  if (fs.existsSync(absOutDir)) {
    throw new HandoffError(ERROR_CODES.OUT_DIR_EXISTS, `Target out-dir already exists and will not be overwritten: ${absOutDir}`);
  }

  const parentOutDir = path.dirname(absOutDir);
  if (!fs.existsSync(parentOutDir) || !fs.statSync(parentOutDir).isDirectory()) {
    throw new HandoffError(ERROR_CODES.PARENT_DIR_NOT_FOUND, `Parent directory of out-dir does not exist: ${parentOutDir}`);
  }

  // 2. 读取显式文件清单
  let rawFilesList;
  if (filesJsonPath) {
    const absFilesJson = path.resolve(filesJsonPath);
    if (!fs.existsSync(absFilesJson)) {
      throw new HandoffError(ERROR_CODES.FILES_JSON_NOT_FOUND, `files-json file does not exist: ${absFilesJson}`);
    }
    let content;
    try {
      content = fs.readFileSync(absFilesJson, 'utf8');
    } catch (e) {
      throw new HandoffError(ERROR_CODES.FILES_JSON_NOT_FOUND, `Failed to read files-json: ${e.message}`);
    }
    try {
      rawFilesList = JSON.parse(content);
    } catch (e) {
      throw new HandoffError(ERROR_CODES.INVALID_FILES_JSON, `files-json content is not valid JSON: ${e.message}`);
    }
    if (!Array.isArray(rawFilesList)) {
      throw new HandoffError(ERROR_CODES.INVALID_FILES_JSON, 'files-json must contain a JSON array of strings');
    }
  } else if (Array.isArray(files)) {
    rawFilesList = files;
  } else {
    throw new HandoffError(ERROR_CODES.CLI_ARGUMENT_ERROR, 'Either "filesJsonPath" or "files" array must be provided');
  }

  // 3. 规范化与安全校验
  const seenPaths = new Set();
  const seenLowerPaths = new Set();
  const validatedRelPaths = [];

  for (const rawPath of rawFilesList) {
    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      throw new HandoffError(ERROR_CODES.EMPTY_PATH_ERROR, 'Empty or non-string file path in files list');
    }

    // 绝对路径拒绝
    if (path.isAbsolute(rawPath) || /^[a-zA-Z]:[/\\]/.test(rawPath) || rawPath.startsWith('/') || rawPath.startsWith('\\')) {
      throw new HandoffError(ERROR_CODES.ABSOLUTE_PATH_FORBIDDEN, `Absolute path is forbidden in files list: ${rawPath}`);
    }

    // 转换为正斜杠并规范化
    const normalizedPosix = path.posix.normalize(rawPath.replace(/\\/g, '/'));

    // 逃逸检查
    if (normalizedPosix.startsWith('../') || normalizedPosix === '..' || path.posix.isAbsolute(normalizedPosix)) {
      throw new HandoffError(ERROR_CODES.PATH_TRAVERSAL_FORBIDDEN, `Path traversal segment is forbidden: ${rawPath}`);
    }

    // 敏感段与凭据检查 (.git, node_modules, 明确凭据)
    const secCheck = checkPathSecurity(normalizedPosix);
    if (secCheck.forbidden) {
      throw new HandoffError(secCheck.reason, secCheck.message);
    }

    // 重复路径与大小写碰撞检查
    if (seenPaths.has(normalizedPosix)) {
      throw new HandoffError(ERROR_CODES.DUPLICATE_PATH_ERROR, `Duplicate relative path in files list: ${normalizedPosix}`);
    }
    seenPaths.add(normalizedPosix);

    const lower = normalizedPosix.toLowerCase();
    if (seenLowerPaths.has(lower)) {
      throw new HandoffError(ERROR_CODES.CASE_COLLISION_ERROR, `Case collision detected for path: ${normalizedPosix}`);
    }
    seenLowerPaths.add(lower);

    // 解析绝对路径并验证文件属性
    const absPath = path.resolve(absRoot, normalizedPosix);
    const relFromRoot = path.relative(absRoot, absPath);
    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
      throw new HandoffError(ERROR_CODES.PATH_OUTSIDE_ROOT, `Resolved path escapes root directory: ${rawPath}`);
    }

    if (!fs.existsSync(absPath)) {
      throw new HandoffError(ERROR_CODES.FILE_NOT_FOUND, `File does not exist: ${normalizedPosix}`);
    }

    const lstat = fs.lstatSync(absPath);
    if (lstat.isSymbolicLink()) {
      throw new HandoffError(ERROR_CODES.SYMLINK_FORBIDDEN, `Symbolic link is forbidden: ${normalizedPosix}`);
    }
    if (!lstat.isFile()) {
      throw new HandoffError(ERROR_CODES.NOT_A_REGULAR_FILE, `Not a regular file: ${normalizedPosix}`);
    }

    // 自引用与输出目录重叠检查
    const relToOutDir = path.relative(absOutDir, absPath);
    if (!relToOutDir.startsWith('..') && !path.isAbsolute(relToOutDir)) {
      throw new HandoffError(ERROR_CODES.INPUT_INSIDE_OUTDIR_ERROR, `Input file cannot reside inside out-dir: ${normalizedPosix}`);
    }
    const outRelToInput = path.relative(absPath, absOutDir);
    if (!outRelToInput.startsWith('..') && !path.isAbsolute(outRelToInput)) {
      throw new HandoffError(ERROR_CODES.OUTDIR_INSIDE_INPUT_ERROR, `Out-dir cannot reside inside input file path: ${absOutDir}`);
    }

    validatedRelPaths.push(normalizedPosix);
  }

  // 4. 稳定路径排序（序数 / ASCII Code-Point 排序，不用本地化排序）
  validatedRelPaths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // 5. 内存物理采样
  const fileEntries = [];
  for (const relPath of validatedRelPaths) {
    const absPath = path.resolve(absRoot, relPath);
    const buffer = fs.readFileSync(absPath);
    const size_bytes = buffer.length;
    const sha256_raw = crypto.createHash('sha256').update(buffer).digest('hex');
    const line_endings = detectLineEndings(buffer);

    const entry = {
      relative_path: relPath,
      size_bytes,
      sha256_raw,
      line_endings
    };

    if (includeLfNormalized) {
      entry.sha256_lf_normalized = computeLfNormalizedSha256(buffer, relPath);
    }

    fileEntries.push(entry);
  }

  // 6. 内存组装 manifest 与渲染 table
  const manifest = {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    files_count: fileEntries.length,
    files: fileEntries
  };

  const markdownTable = renderMarkdownTable(manifest);

  // 7. Staging 目录安全隔离写入
  const stageDirName = `.stage-${path.basename(absOutDir)}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const absStageDir = path.join(parentOutDir, stageDirName);

  fs.mkdirSync(absStageDir, { recursive: false });

  const manifestJsonContent = JSON.stringify(manifest, null, 2) + '\n';
  const tableMdContent = markdownTable + '\n';

  function cleanupStageSafely() {
    try {
      if (fs.existsSync(absStageDir)) {
        fs.rmSync(absStageDir, { recursive: true, force: true });
      }
    } catch (_) {
      // 保持异常不被吞噬
    }
  }

  try {
    fs.writeFileSync(path.join(absStageDir, 'manifest.json'), manifestJsonContent, 'utf8');
    fs.writeFileSync(path.join(absStageDir, 'table.md'), tableMdContent, 'utf8');

    // 8. 可控测试接缝调用 (在采样后、重读前)
    if (_testHooks && typeof _testHooks.beforeReread === 'function') {
      await _testHooks.beforeReread();
    }

    // 9. 交付前输入重读比对（探测并发篡改/删除/不可读）
    for (const entry of fileEntries) {
      const absPath = path.resolve(absRoot, entry.relative_path);
      if (!fs.existsSync(absPath)) {
        throw new HandoffError(
          ERROR_CODES.INPUT_MISSING_DURING_REREAD,
          `Input file missing during pre-delivery reread: ${entry.relative_path}`
        );
      }
      const currentBuf = fs.readFileSync(absPath);
      if (currentBuf.length !== entry.size_bytes) {
        throw new HandoffError(
          ERROR_CODES.INPUT_MODIFIED_DURING_REREAD,
          `Input file size changed during generation: ${entry.relative_path} (was ${entry.size_bytes}, now ${currentBuf.length})`
        );
      }
      const currentSha = crypto.createHash('sha256').update(currentBuf).digest('hex');
      if (currentSha !== entry.sha256_raw) {
        throw new HandoffError(
          ERROR_CODES.INPUT_MODIFIED_DURING_REREAD,
          `Input file hash changed during generation: ${entry.relative_path}`
        );
      }
    }

    // 10. 核验 staging 产物与内存一致性
    const stagedManifestRead = fs.readFileSync(path.join(absStageDir, 'manifest.json'), 'utf8');
    const stagedTableRead = fs.readFileSync(path.join(absStageDir, 'table.md'), 'utf8');
    if (stagedManifestRead !== manifestJsonContent) {
      throw new HandoffError(ERROR_CODES.STAGE_CORRUPTION, 'Staged manifest.json corrupted before publish');
    }
    if (stagedTableRead !== tableMdContent) {
      throw new HandoffError(ERROR_CODES.STAGE_CORRUPTION, 'Staged table.md corrupted before publish');
    }

    // 11. 再次确认目标目录不存在，原子重命名发布
    if (fs.existsSync(absOutDir)) {
      throw new HandoffError(ERROR_CODES.OUT_DIR_EXISTS, `Target out-dir was created concurrently: ${absOutDir}`);
    }

    fs.renameSync(absStageDir, absOutDir);
  } catch (err) {
    cleanupStageSafely();
    throw err;
  }

  return {
    success: true,
    outDir: absOutDir,
    manifestPath: path.join(absOutDir, 'manifest.json'),
    tablePath: path.join(absOutDir, 'table.md'),
    manifest,
    table: markdownTable
  };
}

/**
 * 生产 API：不可信清单反向核验实物 (verifyHandoffManifest)
 */
async function verifyHandoffManifest(options) {
  const { root, manifest, table } = options || {};

  if (!root || typeof root !== 'string') {
    throw new HandoffError(ERROR_CODES.CLI_ARGUMENT_ERROR, 'Parameter "root" is required');
  }
  const absRoot = path.resolve(root);
  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    throw new HandoffError(ERROR_CODES.ROOT_NOT_FOUND, `Root directory does not exist: ${absRoot}`);
  }

  if (!manifest || typeof manifest !== 'string') {
    throw new HandoffError(ERROR_CODES.CLI_ARGUMENT_ERROR, 'Parameter "manifest" is required');
  }
  const absManifest = path.resolve(manifest);
  if (!fs.existsSync(absManifest)) {
    throw new HandoffError(ERROR_CODES.MANIFEST_NOT_FOUND, `Manifest file does not exist: ${absManifest}`);
  }

  let rawManifest;
  try {
    rawManifest = fs.readFileSync(absManifest, 'utf8');
  } catch (e) {
    throw new HandoffError(ERROR_CODES.MANIFEST_NOT_FOUND, `Failed to read manifest: ${e.message}`);
  }

  let manifestObj;
  try {
    manifestObj = JSON.parse(rawManifest);
  } catch (e) {
    throw new HandoffError(ERROR_CODES.INVALID_MANIFEST_JSON, `Manifest is not valid JSON: ${e.message}`);
  }

  // Schema 严格校验
  const schemaValidation = validateManifestSchema(manifestObj);
  if (!schemaValidation.valid) {
    return {
      success: false,
      checkedCount: 0,
      mismatches: schemaValidation.errors.map(err => ({ reason: ERROR_CODES.SCHEMA_VALIDATION_ERROR, message: err })),
      tableVerified: false
    };
  }

  const mismatches = [];
  let tableVerified = false;

  // 若提供了 --table，用生产同一渲染函数核对摘要表一致性（按约定末尾追加换行严格逐字节比对，不使用 trim）
  if (table) {
    const absTable = path.resolve(table);
    if (!fs.existsSync(absTable)) {
      mismatches.push({
        reason: 'TABLE_FILE_NOT_FOUND',
        message: `Table file not found: ${absTable}`
      });
    } else {
      let tableContent;
      try {
        tableContent = fs.readFileSync(absTable, 'utf8');
      } catch (e) {
        mismatches.push({
          reason: 'TABLE_READ_ERROR',
          message: `Failed to read table file: ${e.message}`
        });
      }

      if (tableContent !== undefined) {
        const expectedTable = renderMarkdownTable(manifestObj) + '\n';
        if (tableContent !== expectedTable) {
          mismatches.push({
            reason: 'TABLE_CONTENT_MISMATCH',
            message: 'Markdown table does not match the rendered table from manifest.json',
            expected: expectedTable,
            actual: tableContent
          });
        } else {
          tableVerified = true;
        }
      }
    }
  }

  // 逐一核验清单中声明的实物
  const seenPaths = new Set();
  const seenLowerPaths = new Set();

  for (let i = 0; i < manifestObj.files.length; i++) {
    const file = manifestObj.files[i];
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      mismatches.push({
        reason: ERROR_CODES.SCHEMA_VALIDATION_ERROR,
        message: `File entry at index ${i} must be a non-null object`
      });
      continue;
    }

    const relPath = file.relative_path;
    if (typeof relPath !== 'string' || !relPath.trim()) {
      mismatches.push({ reason: ERROR_CODES.EMPTY_PATH_ERROR, file });
      continue;
    }

    const norm = relPath.replace(/\\/g, '/');
    if (norm.startsWith('../') || norm === '..' || path.posix.isAbsolute(norm)) {
      mismatches.push({ relative_path: norm, reason: ERROR_CODES.PATH_TRAVERSAL_FORBIDDEN });
      continue;
    }

    // 关键：在任何磁盘访问前执行禁止路径与凭据安全检查（I1-F1 修补，绝不触碰磁盘）
    const secCheck = checkPathSecurity(norm);
    if (secCheck.forbidden) {
      mismatches.push({
        relative_path: norm,
        reason: secCheck.reason,
        message: secCheck.message
      });
      continue;
    }

    if (seenPaths.has(norm)) {
      mismatches.push({ relative_path: norm, reason: ERROR_CODES.DUPLICATE_PATH_ERROR });
    }
    seenPaths.add(norm);

    const lower = norm.toLowerCase();
    if (seenLowerPaths.has(lower)) {
      mismatches.push({ relative_path: norm, reason: ERROR_CODES.CASE_COLLISION_ERROR });
    }
    seenLowerPaths.add(lower);

    if (typeof file.size_bytes !== 'number' || file.size_bytes < 0 || !Number.isInteger(file.size_bytes)) {
      mismatches.push({ relative_path: norm, reason: 'INVALID_SIZE_BYTES_FORMAT', expected: 'integer >= 0', actual: file.size_bytes });
    }

    if (typeof file.sha256_raw !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256_raw)) {
      mismatches.push({ relative_path: norm, reason: 'INVALID_SHA256_RAW_FORMAT', actual: file.sha256_raw });
    }

    if (!['NONE', 'LF', 'CRLF', 'CR', 'MIXED'].includes(file.line_endings)) {
      mismatches.push({ relative_path: norm, reason: 'INVALID_LINE_ENDINGS_VALUE', actual: file.line_endings });
    }

    if (file.sha256_lf_normalized !== undefined) {
      if (typeof file.sha256_lf_normalized !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256_lf_normalized)) {
        mismatches.push({ relative_path: norm, reason: 'INVALID_SHA256_LF_NORMALIZED_FORMAT', actual: file.sha256_lf_normalized });
      }
    }

    // 磁盘实物对比
    const absPath = path.resolve(absRoot, norm);
    const relFromRoot = path.relative(absRoot, absPath);
    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
      mismatches.push({ relative_path: norm, reason: ERROR_CODES.PATH_OUTSIDE_ROOT });
      continue;
    }

    if (!fs.existsSync(absPath)) {
      mismatches.push({ relative_path: norm, reason: ERROR_CODES.FILE_NOT_FOUND, path: absPath });
      continue;
    }

    let lstat;
    try {
      lstat = fs.lstatSync(absPath);
    } catch (e) {
      mismatches.push({ relative_path: norm, reason: 'FILE_STAT_ERROR', error: e.message });
      continue;
    }

    if (lstat.isSymbolicLink()) {
      mismatches.push({ relative_path: norm, reason: ERROR_CODES.SYMLINK_FORBIDDEN });
      continue;
    }
    if (!lstat.isFile()) {
      mismatches.push({ relative_path: norm, reason: ERROR_CODES.NOT_A_REGULAR_FILE });
      continue;
    }

    let buf;
    try {
      buf = fs.readFileSync(absPath);
    } catch (e) {
      mismatches.push({ relative_path: norm, reason: 'FILE_READ_ERROR', error: e.message });
      continue;
    }

    if (buf.length !== file.size_bytes) {
      mismatches.push({
        relative_path: norm,
        reason: 'SIZE_MISMATCH',
        expected: file.size_bytes,
        actual: buf.length
      });
    }

    const currentRawSha = crypto.createHash('sha256').update(buf).digest('hex');
    if (currentRawSha !== file.sha256_raw) {
      mismatches.push({
        relative_path: norm,
        reason: 'SHA256_RAW_MISMATCH',
        expected: file.sha256_raw,
        actual: currentRawSha
      });
    }

    if (file.sha256_lf_normalized) {
      try {
        const currentLfSha = computeLfNormalizedSha256(buf, norm);
        if (currentLfSha !== file.sha256_lf_normalized) {
          mismatches.push({
            relative_path: norm,
            reason: 'SHA256_LF_NORMALIZED_MISMATCH',
            expected: file.sha256_lf_normalized,
            actual: currentLfSha
          });
        }
      } catch (err) {
        mismatches.push({
          relative_path: norm,
          reason: 'LF_NORMALIZATION_VERIFICATION_FAILED',
          error: err.message
        });
      }
    }
  }

  return {
    success: mismatches.length === 0,
    checkedCount: manifestObj.files.length,
    mismatches,
    tableVerified
  };
}

/**
 * CLI 命令行入口解析
 */
async function runCli() {
  const args = process.argv.slice(2);
  const command = args[0];

  function getOption(flag) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return null;
  }

  function hasFlag(flag) {
    return args.includes(flag);
  }

  if (command === 'generate') {
    const root = getOption('--root');
    const filesJsonPath = getOption('--files-json');
    const outDir = getOption('--out-dir');
    const includeLfNormalized = hasFlag('--include-lf-normalized');

    if (!root || !filesJsonPath || !outDir) {
      console.error(JSON.stringify({
        success: false,
        code: ERROR_CODES.CLI_ARGUMENT_ERROR,
        message: 'Usage: generate --root <base_root> --files-json <files_array_json> --out-dir <new_out_dir> [--include-lf-normalized]'
      }, null, 2));
      process.exit(1);
    }

    try {
      const result = await generateHandoffArtifacts({
        root,
        filesJsonPath,
        outDir,
        includeLfNormalized
      });
      console.log(JSON.stringify({
        success: true,
        out_dir: result.outDir,
        files_count: result.manifest.files_count,
        manifest: result.manifestPath,
        table: result.tablePath
      }, null, 2));
      process.exit(0);
    } catch (err) {
      console.error(JSON.stringify({
        success: false,
        code: err.code || 'UNKNOWN_ERROR',
        message: err.message,
        details: err.details || null
      }, null, 2));
      process.exit(1);
    }
  } else if (command === 'verify') {
    const root = getOption('--root');
    const manifest = getOption('--manifest');
    const table = getOption('--table');

    if (!root || !manifest) {
      console.error(JSON.stringify({
        success: false,
        code: ERROR_CODES.CLI_ARGUMENT_ERROR,
        message: 'Usage: verify --root <base_root> --manifest <manifest_json> [--table <table_md>]'
      }, null, 2));
      process.exit(1);
    }

    try {
      const result = await verifyHandoffManifest({
        root,
        manifest,
        table
      });
      if (result.success) {
        console.log(JSON.stringify({
          success: true,
          checked_files_count: result.checkedCount,
          table_verified: result.tableVerified
        }, null, 2));
        process.exit(0);
      } else {
        console.error(JSON.stringify({
          success: false,
          checked_files_count: result.checkedCount,
          table_verified: result.tableVerified,
          mismatches: result.mismatches
        }, null, 2));
        process.exit(1);
      }
    } catch (err) {
      console.error(JSON.stringify({
        success: false,
        code: err.code || 'UNKNOWN_ERROR',
        message: err.message,
        details: err.details || null
      }, null, 2));
      process.exit(1);
    }
  } else {
    console.error(JSON.stringify({
      success: false,
      code: ERROR_CODES.CLI_ARGUMENT_ERROR,
      message: 'Unknown command. Available commands: generate, verify'
    }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  ERROR_CODES,
  HandoffError,
  detectLineEndings,
  computeLfNormalizedSha256,
  renderMarkdownTable,
  validateManifestSchema,
  generateHandoffArtifacts,
  verifyHandoffManifest
};
