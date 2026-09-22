/**
 * scripts/handoff_bom_classify_repro.js
 *
 * handoff_manifest.js 的 BOM / 换行分类回归。
 * 在系统临时目录写夹具并调用 generate / verify，不修改本仓库。
 * 用法: node scripts/handoff_bom_classify_repro.js
 * 全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  generateHandoffArtifacts,
  verifyHandoffManifest
} = require('./handoff_manifest.js');

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * 断言条件成立，失败时抛出带场景名的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 取出核验结果中的 reason 列表。
 */
function reasonList(result) {
  return (result.mismatches || []).map((row) => row.reason);
}

/**
 * 为夹具生成带 LF 规范化字段的清单。
 */
async function generatePayload(root, outDir) {
  await generateHandoffArtifacts({
    root,
    files: ['payload.txt'],
    outDir,
    includeLfNormalized: true
  });
}

/**
 * 准备一对尚不存在的根目录与输出目录。
 */
function makeDirs(base, name) {
  const root = path.join(base, name);
  const outDir = path.join(base, `${name}-out`);
  fs.mkdirSync(root, { recursive: true });
  return { root, outDir, payload: path.join(root, 'payload.txt') };
}

/**
 * 用 CLI verify 复跑同一清单，确认退出码与首条 reason。
 */
function assertCliVerify(root, outDir, expectedReason) {
  const cli = spawnSync(process.execPath, [
    path.join(__dirname, 'handoff_manifest.js'),
    'verify',
    '--root',
    root,
    '--manifest',
    path.join(outDir, 'manifest.json')
  ], { encoding: 'utf8', windowsHide: true });
  assertCase(cli.status === 1, `CLI verify 退出码应为 1，实际 ${cli.status}: ${cli.stderr}`);
  const parsed = JSON.parse(cli.stderr);
  assertCase(
    parsed.mismatches && parsed.mismatches[0] && parsed.mismatches[0].reason === expectedReason,
    `CLI 首条 reason 应为 ${expectedReason}，实际 ${cli.stderr}`
  );
}

/**
 * 清单来自 BOM+LF，磁盘只删掉 BOM：应记为仅 BOM 差异，退出码 1。
 */
async function caseBomRemoved(base) {
  const dirs = makeDirs(base, 'bom-removed');
  const body = Buffer.from('alpha\nbeta\n', 'utf8');
  fs.writeFileSync(dirs.payload, Buffer.concat([UTF8_BOM, body]));
  await generatePayload(dirs.root, dirs.outDir);
  fs.writeFileSync(dirs.payload, body);
  const result = await verifyHandoffManifest({
    root: dirs.root,
    manifest: path.join(dirs.outDir, 'manifest.json')
  });
  const reasons = reasonList(result);
  assertCase(result.success === false, '仅删 BOM 不得通过');
  assertCase(
    reasons.length === 1 && reasons[0] === 'UTF8_BOM_ONLY_DIFFERENCE',
    `仅删 BOM 的 reason 应为单独的 UTF8_BOM_ONLY_DIFFERENCE，实际 ${JSON.stringify(reasons)}`
  );
  assertCase(result.mismatches[0].actual_has_leading_bom === false, '删 BOM 后实际文件不应再带 BOM');
  assertCase(result.mismatches[0].expected_line_endings === 'LF', '期望换行应为 LF');
  assertCase(result.mismatches[0].actual_line_endings === 'LF', '实际换行应为 LF');
  assertCliVerify(dirs.root, dirs.outDir, 'UTF8_BOM_ONLY_DIFFERENCE');
}

/**
 * 清单无 BOM，磁盘只补上 BOM：同样记为仅 BOM 差异。
 */
async function caseBomAdded(base) {
  const dirs = makeDirs(base, 'bom-added');
  const body = Buffer.from('alpha\nbeta\n', 'utf8');
  fs.writeFileSync(dirs.payload, body);
  await generatePayload(dirs.root, dirs.outDir);
  fs.writeFileSync(dirs.payload, Buffer.concat([UTF8_BOM, body]));
  const result = await verifyHandoffManifest({
    root: dirs.root,
    manifest: path.join(dirs.outDir, 'manifest.json')
  });
  const reasons = reasonList(result);
  assertCase(result.success === false, '仅加 BOM 不得通过');
  assertCase(
    reasons.length === 1 && reasons[0] === 'UTF8_BOM_ONLY_DIFFERENCE',
    `仅加 BOM 的 reason 不符：${JSON.stringify(reasons)}`
  );
  assertCase(result.mismatches[0].actual_has_leading_bom === true, '加 BOM 后实际文件应带 BOM');
}

/**
 * CRLF 与 LF 且都没有 BOM：仍是换行可解释差异，不得通过。
 */
async function caseLineEndings(base) {
  const dirs = makeDirs(base, 'line-endings');
  fs.writeFileSync(dirs.payload, Buffer.from('alpha\nbeta\n', 'utf8'));
  await generatePayload(dirs.root, dirs.outDir);
  fs.writeFileSync(dirs.payload, Buffer.from('alpha\r\nbeta\r\n', 'utf8'));
  const result = await verifyHandoffManifest({
    root: dirs.root,
    manifest: path.join(dirs.outDir, 'manifest.json')
  });
  const reasons = reasonList(result);
  assertCase(result.success === false, '仅换行差异不得通过');
  assertCase(
    reasons.length === 1 && reasons[0] === 'LINE_ENDING_NORMALIZATION_EXPLAINABLE',
    `仅换行差异的 reason 不符：${JSON.stringify(reasons)}`
  );
}

/**
 * 带 BOM 的文件字节不变：verify 通过。
 */
async function caseIdenticalBom(base) {
  const dirs = makeDirs(base, 'identical-bom');
  fs.writeFileSync(dirs.payload, Buffer.concat([UTF8_BOM, Buffer.from('alpha\nbeta\n', 'utf8')]));
  await generatePayload(dirs.root, dirs.outDir);
  const result = await verifyHandoffManifest({
    root: dirs.root,
    manifest: path.join(dirs.outDir, 'manifest.json')
  });
  assertCase(result.success === true, `字节一致应通过，实际 ${JSON.stringify(reasonList(result))}`);
  assertCase(reasonList(result).length === 0, '字节一致不应有 mismatch');
}

/**
 * 改了正文：维持 SHA256_RAW_MISMATCH，不套用 BOM 或换行理由。
 */
async function caseContentChange(base) {
  const dirs = makeDirs(base, 'content-change');
  fs.writeFileSync(dirs.payload, Buffer.from('alpha\n', 'utf8'));
  await generatePayload(dirs.root, dirs.outDir);
  fs.writeFileSync(dirs.payload, Buffer.from('beta\n', 'utf8'));
  const result = await verifyHandoffManifest({
    root: dirs.root,
    manifest: path.join(dirs.outDir, 'manifest.json')
  });
  const reasons = reasonList(result);
  assertCase(result.success === false, '改内容不得通过');
  assertCase(reasons.includes('SHA256_RAW_MISMATCH'), `改内容应含 SHA256_RAW_MISMATCH，实际 ${JSON.stringify(reasons)}`);
  assertCase(!reasons.includes('UTF8_BOM_ONLY_DIFFERENCE'), '改内容不得记为仅 BOM');
  assertCase(!reasons.includes('LINE_ENDING_NORMALIZATION_EXPLAINABLE'), '改内容不得记为换行可解释');
}

/**
 * BOM 与换行同时变化：两种单独理由都不适用。
 */
async function caseBomAndNewlines(base) {
  const dirs = makeDirs(base, 'bom-and-newlines');
  fs.writeFileSync(dirs.payload, Buffer.concat([UTF8_BOM, Buffer.from('alpha\nbeta\n', 'utf8')]));
  await generatePayload(dirs.root, dirs.outDir);
  fs.writeFileSync(dirs.payload, Buffer.from('alpha\r\nbeta\r\n', 'utf8'));
  const result = await verifyHandoffManifest({
    root: dirs.root,
    manifest: path.join(dirs.outDir, 'manifest.json')
  });
  const reasons = reasonList(result);
  assertCase(result.success === false, 'BOM 加换行差异不得通过');
  assertCase(reasons.includes('SHA256_RAW_MISMATCH'), `混合差异应含 SHA256_RAW_MISMATCH，实际 ${JSON.stringify(reasons)}`);
  assertCase(!reasons.includes('UTF8_BOM_ONLY_DIFFERENCE'), '混合差异不得记为仅 BOM');
  assertCase(!reasons.includes('LINE_ENDING_NORMALIZATION_EXPLAINABLE'), '混合差异不得记为换行可解释');
}

/**
 * 依次跑分类回归，全过时向 stdout 写一行摘要。
 */
async function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-bom-repro-'));
  try {
    await caseBomRemoved(base);
    await caseBomAdded(base);
    await caseLineEndings(base);
    await caseIdenticalBom(base);
    await caseContentChange(base);
    await caseBomAndNewlines(base);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  process.stdout.write('handoff_bom_classify_repro: PASS cases=6\n');
}

main().catch((err) => {
  process.stderr.write(`handoff_bom_classify_repro: FAIL ${err.message}\n`);
  process.exit(1);
});
