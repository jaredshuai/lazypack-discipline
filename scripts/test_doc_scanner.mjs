/**
 * scripts/test_doc_scanner.mjs
 *
 * 文档扫描/迁移计划排除逻辑的断言驱动回归（仿 test_check_commit_msg.mjs 模式）。
 * 在系统临时目录生成 Markdown 夹具，直接调用
 * skills/lazypack-setup/scripts 下的 doc_scanner.mjs 与 doc_plan.mjs，
 * 校验排除判定、链接过滤与计划拒绝路径，不修改本仓库。
 * 覆盖 #70 审查跟进新增的三处行为：
 *  1) excludePaths 归一化（尾斜杠/分隔符/大小写）使 `docs/x/` 与 `docs/x` 等价；
 *  2) 指向排除目录的链接不写入 outboundLinks/inboundReferences/deadlinks；
 *  3) buildMigrationPlan 对落在排除路径内的计划项抛 ERR_EXCLUDED_PATH。
 * 用法: node scripts/test_doc_scanner.mjs
 * 全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeExcludePaths,
  buildExclusionMatcher,
  scanProjectDocuments
} from '../skills/lazypack-setup/scripts/doc_scanner.mjs';
import { buildMigrationPlan } from '../skills/lazypack-setup/scripts/doc_plan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 断言条件成立，失败时抛出带场景信息的错误。
 */
function assertCase(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 生成一套带敏感目录的 Markdown 夹具，返回仓库根。
 */
function makeFixture(base, name) {
  const dir = path.join(base, name);
  fs.mkdirSync(path.join(dir, 'docs', 'raw-qa'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'private-qa'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'raw-qa', 'a.md'), '# canonical qa\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'docs', 'private-qa', 'b.md'), '# custom qa\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'docs', 'adr', 'c.md'), '# adr\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'd.md'), '# dep\n', 'utf8');
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    '# readme\n[qa1](docs/raw-qa/a.md)\n[qa2](docs/private-qa/b.md)\n[adr](docs/adr/c.md)\n',
    'utf8'
  );
  return dir;
}

/**
 * 取扫描结果中某个相对路径文件的出站链接目标集合。
 */
function outboundTargets(scan, relPath) {
  const entry = scan.files.find((f) => f.relPath === relPath);
  assertCase(entry, `扫描结果缺少文件 ${relPath}`);
  return entry.outboundLinks.map((l) => l.targetRel).sort();
}

/**
 * normalizeExcludePaths：分隔符归一、去尾斜杠、小写化、剔除空项。
 */
function caseNormalizeExcludePaths() {
  const got = normalizeExcludePaths(['docs/x/', 'a\\b', './y', 'Z/Q/', '   ']);
  assertCase(
    JSON.stringify(got) === JSON.stringify(['docs/x', 'a/b', 'y', 'z/q']),
    `normalizeExcludePaths 输出不符：${JSON.stringify(got)}`
  );
  assertCase(
    JSON.stringify(normalizeExcludePaths()) === JSON.stringify([]),
    'normalizeExcludePaths 默认值应为空数组'
  );
}

/**
 * buildExclusionMatcher：固定集合按路径段命中，配置路径命中自身及子孙，不误伤同前缀兄弟。
 */
function caseBuildExclusionMatcher() {
  const isExcluded = buildExclusionMatcher(['docs/private-qa/']);
  assertCase(isExcluded('node_modules/pkg/d.md'), '固定集合应命中 node_modules');
  assertCase(isExcluded('.env'), '固定集合应命中 .env');
  assertCase(isExcluded('docs/raw-qa/a.md'), '固定集合应命中 raw-qa');
  assertCase(isExcluded('docs/private-qa/b.md'), '配置路径应命中子孙');
  assertCase(isExcluded('docs/private-qa'), '配置路径应命中目录自身');
  assertCase(isExcluded('docs/private-qa\\b.md'), '反斜杠写法应命中');
  assertCase(isExcluded('docs/PRIVATE-QA/b.md'), '大小写不同应命中');
  assertCase(!isExcluded('docs/private-qa2/b.md'), '同前缀兄弟不应误伤');
  assertCase(!isExcluded('docs/adr/c.md'), '普通文档不应被排除');
}

/**
 * scanProjectDocuments：固定集合排除 raw-qa 与其链接，其它链接保留。
 */
function caseScanWithoutConfiguredExclude(base) {
  const dir = makeFixture(base, 'scan-plain');
  const scan = scanProjectDocuments(dir);
  const paths = scan.files.map((f) => f.relPath).sort();
  assertCase(
    JSON.stringify(paths) === JSON.stringify(['README.md', 'docs/adr/c.md', 'docs/private-qa/b.md']),
    `未排除时应只剩非 raw-qa 文档，实际 ${JSON.stringify(paths)}`
  );
  assertCase(
    JSON.stringify(outboundTargets(scan, 'README.md')) === JSON.stringify(['docs/adr/c.md', 'docs/private-qa/b.md']),
    `指向 raw-qa 的链接应被过滤，实际 ${JSON.stringify(outboundTargets(scan, 'README.md'))}`
  );
  assertCase(
    !Object.keys(scan.inboundReferences).some((k) => k.includes('raw-qa')),
    `入站引用不应包含 raw-qa 路径：${JSON.stringify(Object.keys(scan.inboundReferences))}`
  );
  assertCase(
    !scan.deadlinks.some((d) => `${d.targetRel}`.includes('raw-qa')),
    `死链不应包含 raw-qa 路径：${JSON.stringify(scan.deadlinks)}`
  );
}

/**
 * scanProjectDocuments：--exclude 传尾斜杠目录，按归一化剔除并过滤其链接。
 */
function caseScanWithTrailingSlashExclude(base) {
  const dir = makeFixture(base, 'scan-exclude');
  const scan = scanProjectDocuments(dir, { excludePaths: ['docs/private-qa/'] });
  const paths = scan.files.map((f) => f.relPath).sort();
  assertCase(
    JSON.stringify(paths) === JSON.stringify(['README.md', 'docs/adr/c.md']),
    `尾斜杠排除后应只剩普通文档，实际 ${JSON.stringify(paths)}`
  );
  assertCase(
    JSON.stringify(outboundTargets(scan, 'README.md')) === JSON.stringify(['docs/adr/c.md']),
    `被排除目录的链接应被过滤，实际 ${JSON.stringify(outboundTargets(scan, 'README.md'))}`
  );
  const serialized = JSON.stringify(scan);
  assertCase(!serialized.includes('private-qa'), '扫描产物不应残留 private-qa 路径');
  assertCase(!serialized.includes('raw-qa'), '扫描产物不应残留 raw-qa 路径');
}

/**
 * buildMigrationPlan：排除路径内的计划项一律拒绝，普通项放行。
 */
function casePlanRejectsExcludedItems(base) {
  const dir = makeFixture(base, 'plan');

  const expectThrow = (label, spec, options) => {
    let thrown = null;
    try {
      buildMigrationPlan(dir, spec, scanProjectDocuments(dir, options), options);
    } catch (e) {
      thrown = e;
    }
    assertCase(thrown && thrown.code === 'ERR_EXCLUDED_PATH', `${label}：应抛 ERR_EXCLUDED_PATH，实际 ${thrown ? thrown.code || thrown.message : '未抛错'}`);
  };

  // 1. 配置排除：preserve 项落在排除目录内
  expectThrow(
    'preserve 命中配置排除',
    { preserve_items: [{ path: 'docs/private-qa/b.md' }] },
    { excludePaths: ['docs/private-qa/'] }
  );
  // 2. 固定集合：preserve 项是规范 raw-qa
  expectThrow('preserve 命中固定集合', { preserve_items: [{ path: 'docs/raw-qa/a.md' }] }, {});
  // 3. 迁移目标落在排除路径内
  expectThrow(
    'migrate 目标命中配置排除',
    { migrate_items: [{ source_path: 'docs/adr/c.md', target_path: 'docs/private-qa/c.md' }] },
    { excludePaths: ['docs/private-qa/'] }
  );
  // 4. 迁移源落在排除路径内
  expectThrow(
    'migrate 源命中配置排除',
    { migrate_items: [{ source_path: 'docs/private-qa/b.md', target_path: 'docs/moved-b.md' }] },
    { excludePaths: ['docs/private-qa/'] }
  );

  // 5. 普通项放行
  const ok = buildMigrationPlan(
    dir,
    { preserve_items: [{ path: 'docs/adr/c.md' }] },
    scanProjectDocuments(dir, { excludePaths: ['docs/private-qa/'] }),
    { excludePaths: ['docs/private-qa/'] }
  );
  assertCase(ok && ok.inputDigests && ok.inputDigests['docs/adr/c.md'], '普通项应正常生成计划与摘要');

  // 6. 登记册 docs/ARTIFACTS.md 本身被排除：同样拒绝，不读取、不生成登记动作
  const dir2 = makeFixture(base, 'plan-artifacts');
  fs.writeFileSync(path.join(dir2, 'ROOT.md'), '# root doc\n', 'utf8');
  let thrown = null;
  try {
    buildMigrationPlan(
      dir2,
      { preserve_items: [{ path: 'ROOT.md' }] },
      scanProjectDocuments(dir2, { excludePaths: ['docs/ARTIFACTS.md'] }),
      { excludePaths: ['docs/ARTIFACTS.md'] }
    );
  } catch (e) {
    thrown = e;
  }
  assertCase(
    thrown && thrown.code === 'ERR_EXCLUDED_PATH' && thrown.details && thrown.details.fieldName === 'artifactsRelPath',
    `登记册被排除时应抛 ERR_EXCLUDED_PATH(artifactsRelPath)，实际 ${thrown ? thrown.code || thrown.message : '未抛错'}`
  );
}

const CASES = [
  ['normalizeExcludePaths 归一化', caseNormalizeExcludePaths],
  ['buildExclusionMatcher 命中判定', caseBuildExclusionMatcher],
  ['scan 固定集合排除与链接过滤', caseScanWithoutConfiguredExclude],
  ['scan 尾斜杠 --exclude 排除与链接过滤', caseScanWithTrailingSlashExclude],
  ['buildMigrationPlan 拒绝排除项', casePlanRejectsExcludedItems]
];

function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-scanner-test-'));
  let failed = 0;
  try {
    for (const [name, fn] of CASES) {
      try {
        fn(base);
        console.log(`PASS ${name}`);
      } catch (e) {
        failed++;
        console.error(`FAIL ${name}: ${e.message}`);
      }
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  if (failed > 0) {
    console.error(`test_doc_scanner: ${CASES.length - failed}/${CASES.length} PASS, ${failed} FAIL`);
    process.exit(1);
  }
  console.log(`test_doc_scanner: ${CASES.length}/${CASES.length} PASS`);
}

main();
