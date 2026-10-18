/**
 * scripts/test_doc_scanner.mjs
 *
 * 文档扫描/迁移计划排除逻辑的断言驱动回归（仿 test_check_commit_msg.mjs 模式）。
 * 在系统临时目录生成 Markdown 夹具，直接调用
 * skills/lazypack-setup/scripts 下的 doc_scanner.mjs 与 doc_plan.mjs，
 * 校验排除判定、链接过滤与计划拒绝路径，不修改本仓库。
 * 保留 #70 审查跟进的 7 个基础用例，并补齐 issue #83 的真实目录别名与 CLI 回归（共 18 用例）：
 *  - 归一化、固定/自定义排除判定、链接过滤、计划与执行器词法排除复核；
 *  - Windows Junction 与 dir 目录符号链接覆盖固定 raw-qa、自定义 excludePaths、仓外目标失败关闭；
 *  - buildMigrationPlan 拒绝 preserve/迁移源/迁移目标的真实排除路径，executePlan 在自洽指纹后复核真实路径；
 *  - doc_helper scan 以真实 Node 子进程验证无 exclude、尾斜杠与重复 --exclude 行为。
 * 真实链接能力不支持时只将对应能力用例记为 SKIP 并单列计数，不当作 PASS；其他断言错误一律 FAIL。
 * 用法: node scripts/test_doc_scanner.mjs
 * 全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  computeSha256,
  normalizeExcludePaths,
  buildExclusionMatcher,
  scanProjectDocuments,
  realRepoRelPath
} from '../skills/lazypack-setup/scripts/doc_scanner.mjs';
import { buildMigrationPlan } from '../skills/lazypack-setup/scripts/doc_plan.mjs';
import { executePlan } from '../skills/lazypack-setup/scripts/doc_executor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_HELPER = path.resolve(__dirname, '..', 'skills', 'lazypack-setup', 'scripts', 'doc_helper.mjs');
const createdLinks = new Set();

class CaseSkip extends Error {
  constructor(reasonCode, cause) {
    super(`${reasonCode}: ${cause.message}`);
    this.reasonCode = reasonCode;
  }
}

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
    '# readme\n[qa1](docs/raw-qa/a.md)\n[qa2](docs/private-qa/b.md)\n[adr](docs/adr/c.md)\n[qa3](docs/raw%2Dqa/a.md)\n',
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
 * 将夹具路径统一为扫描产物中的正斜杠形式。
 */
function toPosix(value) {
  return String(value).replace(/\\/g, '/');
}

function linkType(kind) {
  if (kind === 'junction' && process.platform !== 'win32') {
    throw new CaseSkip('JUNCTION_WINDOWS_ONLY', new Error('Junction 用例仅在 Windows 创建真实 Junction'));
  }
  return kind === 'junction' ? 'junction' : 'dir';
}

function isLinkCapabilityError(error) {
  return error && ['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code);
}

function createDirectoryLink(target, alias, kind) {
  try {
    fs.symlinkSync(target, alias, linkType(kind));
  } catch (error) {
    if (isLinkCapabilityError(error)) {
      throw new CaseSkip(`LINK_${kind.toUpperCase()}_CAPABILITY_UNAVAILABLE`, error);
    }
    throw error;
  }
  createdLinks.add(path.resolve(alias));
  assertCase(fs.lstatSync(alias).isSymbolicLink(), `${kind} 夹具未创建为符号链接：${alias}`);
  assertCase(
    fs.realpathSync(alias) === fs.realpathSync(target),
    `${kind} 夹具真实目标不符：${fs.realpathSync(alias)} !== ${fs.realpathSync(target)}`
  );
}

function createBrokenDirectoryLink(target, alias, kind) {
  try {
    fs.symlinkSync(target, alias, linkType(kind));
  } catch (error) {
    if (isLinkCapabilityError(error)) {
      throw new CaseSkip(`LINK_${kind.toUpperCase()}_CAPABILITY_UNAVAILABLE`, error);
    }
    throw error;
  }
  createdLinks.add(path.resolve(alias));
  assertCase(fs.lstatSync(alias).isSymbolicLink(), `${kind} 悬空夹具未创建为符号链接：${alias}`);
  assertCase(!fs.existsSync(alias), `${kind} 悬空夹具不应可解析：${alias}`);
}

function cleanupFixtureRoot(base) {
  const absBase = path.resolve(base);
  const absTemp = path.resolve(os.tmpdir());
  const relToTemp = path.relative(absTemp, absBase);
  assertCase(
    relToTemp && !relToTemp.startsWith('..') && !path.isAbsolute(relToTemp) && path.basename(absBase).startsWith('doc-scanner-test-'),
    `拒绝清理非本轮 os.tmpdir mkdtemp 根：${absBase}`
  );

  for (const linkPath of [...createdLinks].sort((a, b) => b.length - a.length)) {
    const absLink = path.resolve(linkPath);
    const relToBase = path.relative(absBase, absLink);
    assertCase(relToBase && !relToBase.startsWith('..') && !path.isAbsolute(relToBase), `拒绝清理夹具外链接：${absLink}`);
    const stat = fs.lstatSync(absLink, { throwIfNoEntry: false });
    if (stat) {
      assertCase(stat.isSymbolicLink(), `预期清理符号链接，实际不是：${absLink}`);
      fs.unlinkSync(absLink);
    }
  }
  createdLinks.clear();
  fs.rmSync(absBase, { recursive: true, force: true });
  assertCase(!fs.existsSync(absBase), `临时夹具清理失败：${absBase}`);
}

/**
 * 用 lstat 快照夹具内文件和目录；文件记录大小与 SHA-256，链接只记录链接文本，绝不跟随目标。
 */
function snapshotTree(root) {
  const result = {};
  function visit(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = toPosix(path.relative(root, abs));
      const stat = fs.lstatSync(abs, { bigint: true });
      if (stat.isSymbolicLink()) {
        result[rel] = { type: 'link', target: toPosix(fs.readlinkSync(abs)) };
      } else if (stat.isDirectory()) {
        result[rel] = { type: 'directory' };
        visit(abs);
      } else if (stat.isFile()) {
        result[rel] = { type: 'file', size: Number(stat.size), sha256: computeSha256(abs) };
      } else {
        result[rel] = { type: 'other', mode: String(stat.mode) };
      }
    }
  }
  visit(root);
  return result;
}

function computeInputFingerprint(inputDigests) {
  const hash = crypto.createHash('sha256');
  for (const [p, digest] of Object.entries(inputDigests).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${p}:${digest || 'null'};`);
  }
  return hash.digest('hex');
}

function runDocHelper(args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [DOC_HELPER, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
    env
  });
}

function parseSuccessfulJson(result, label) {
  assertCase(!result.error, `${label}：子进程启动失败 ${result.error && result.error.message}`);
  assertCase(result.status === 0, `${label}：退出码 ${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  assertCase(result.stderr === '', `${label}：stderr 应为空，实际 ${JSON.stringify(result.stderr)}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label}：stdout 不是 JSON：${error.message}\n${result.stdout}`);
  }
}

function makeAliasScanFixture(base, name, kind, excludedRel) {
  const repo = path.join(base, name);
  const target = path.join(repo, ...excludedRel.split('/'));
  const publicDir = path.join(repo, 'docs', 'adr');
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const aliasName = `alias-${kind}`;
  const outsideAliasName = `alias-outside-${kind}`;
  const aliasRel = `docs/${aliasName}`;
  const outsideAliasRel = `docs/${outsideAliasName}`;
  const secretTitle = `SYNTHETIC_ALIAS_SECRET_${name}_${kind}`;
  const outsideTitle = `SYNTHETIC_OUTSIDE_SECRET_${name}_${kind}`;
  const secretContent = `# ${secretTitle}\nsecret bytes for alias fixture\n`;
  const outsideContent = `# ${outsideTitle}\noutside secret bytes\n`;
  const secretPath = path.join(target, 'secret.md');
  const outsideTarget = path.join(base, `${name}-outside-target`);
  fs.mkdirSync(outsideTarget, { recursive: true });
  fs.writeFileSync(secretPath, secretContent, 'utf8');
  fs.writeFileSync(path.join(outsideTarget, 'outside.md'), outsideContent, 'utf8');
  fs.writeFileSync(path.join(publicDir, 'public.md'), '# public document\n', 'utf8');

  const encodedAliasRel = toPosix(aliasRel).replace(/-/g, '%2D');
  fs.writeFileSync(
    path.join(repo, 'README.md'),
    `# alias scan fixture\n[public](docs/adr/public.md)\n[missing](docs/missing.md)\n` +
      `[alias direct](${aliasRel}/secret.md)\n[alias encoded](${encodedAliasRel}/secret.md)\n` +
      `[outside](${outsideAliasRel}/outside.md)\n`,
    'utf8'
  );

  return {
    repo,
    target,
    aliasAbs: path.join(repo, ...aliasRel.split('/')),
    aliasRel,
    outsideAliasAbs: path.join(repo, ...outsideAliasRel.split('/')),
    outsideAliasRel,
    outsideTarget,
    secretTitle,
    outsideTitle,
    secretHash: crypto.createHash('sha256').update(secretContent).digest('hex'),
    outsideHash: crypto.createHash('sha256').update(outsideContent).digest('hex')
  };
}

function makeBrokenAliasFixture(base, name, kind) {
  const repo = path.join(base, name);
  const publicDir = path.join(repo, 'docs', 'adr');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'public.md'), '# public document\n', 'utf8');
  const aliasName = `alias-broken-${kind}`;
  const aliasRel = `docs/${aliasName}`;
  fs.writeFileSync(
    path.join(repo, 'README.md'),
    `# broken alias fixture\n[public](docs/adr/public.md)\n[missing](docs/missing.md)\n` +
      `[broken](${aliasRel}/secret.md)\n`,
    'utf8'
  );
  return {
    repo,
    aliasAbs: path.join(repo, ...aliasRel.split('/')),
    aliasRel,
    missingTarget: path.join(base, `${name}-missing-target`)
  };
}

function makePlanAliasFixture(base, name, kind, excludedRel, excludePaths) {
  const repo = path.join(base, name);
  const target = path.join(repo, ...excludedRel.split('/'));
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs', 'adr'), { recursive: true });
  const secretContent = `# SYNTHETIC_PLAN_ALIAS_SECRET_${name}_${kind}\nsecret plan content\n`;
  fs.writeFileSync(path.join(target, 'secret.md'), secretContent, 'utf8');
  fs.writeFileSync(path.join(repo, 'docs', 'adr', 'public.md'), '# public\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'move.md'), '# move\n[public](docs/adr/public.md)\n', 'utf8');
  fs.writeFileSync(
    path.join(repo, 'docs', 'ARTIFACTS.md'),
    '# Synthetic register\n\n## 3. 已核对的入口登记\n\n| 路径 | 类别 | 状态 | 依据与边界 |\n|---|---|---|---|\n',
    'utf8'
  );

  const aliasName = `alias-${kind}`;
  const aliasAbs = path.join(repo, 'docs', aliasName);
  createDirectoryLink(target, aliasAbs, kind);
  return {
    repo,
    target,
    aliasAbs,
    aliasRel: `docs/${aliasName}`,
    aliasSecretRel: `docs/${aliasName}/secret.md`,
    expectedSecretRealRel: `${excludedRel}/secret.md`,
    secretHash: crypto.createHash('sha256').update(secretContent).digest('hex'),
    excludePaths,
    scan: scanProjectDocuments(repo, { excludePaths })
  };
}

/**
 * normalizeExcludePaths：分隔符归一、去尾斜杠、小写化、剔除空项。
 */
function caseNormalizeExcludePaths() {
  const got = normalizeExcludePaths(['docs/x/', 'a\\b', './y', 'Z/Q/', '   ', 'docs/./private-qas', 'docs/x/../private-qas', '.', './']);
  assertCase(
    JSON.stringify(got) === JSON.stringify(['.', 'a/b', 'docs/private-qas', 'docs/x', 'y', 'z/q']),
    `normalizeExcludePaths 输出不符：${JSON.stringify(got)}`
  );
  // 等价写法与参数顺序不得改变规范集合（否则会无谓地触发重新审批）
  assertCase(
    JSON.stringify(normalizeExcludePaths(['docs/x/', 'docs/x', 'docs/./x'])) === JSON.stringify(normalizeExcludePaths(['docs/x'])),
    `等价写法应产出同一规范集合：${JSON.stringify(normalizeExcludePaths(['docs/x/', 'docs/x', 'docs/./x']))}`
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

  // 仓根哨兵：排除 `.` 即排除仓内一切路径，不得静默失败开放
  const isExcludedRoot = buildExclusionMatcher(['.']);
  assertCase(isExcludedRoot('README.md'), '排除仓根应命中根级文件');
  assertCase(isExcludedRoot('docs/adr/c.md'), '排除仓根应命中任意层级文件');
  assertCase(buildExclusionMatcher([])('README.md') === false, '空排除列表不应命中任何路径');
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
  // 百分号编码写法 docs/raw%2Dqa/a.md 须先解码再判定排除，不得以字面量绕过
  assertCase(
    !JSON.stringify(scan).includes('raw%2Dqa'),
    `百分号编码的排除路径不应进入扫描产物：${JSON.stringify(outboundTargets(scan, 'README.md'))}`
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
 * scanProjectDocuments：词法在仓外的链接维持既有处理（仍入图，不因真实路径核验失败关闭被丢弃）；
 * `realRepoRelPath` 对仓外路径返回 null。词法在仓内但真实路径无法核验（经符号链接解析到仓外）
 * 的失败关闭分支由本套件另列的真实链接夹具覆盖。
 */
function caseScanOutOfRepoLexicalLink(base) {
  const sibling = path.join(base, 'outside-docs');
  fs.mkdirSync(sibling, { recursive: true });
  fs.writeFileSync(path.join(sibling, 'keep.md'), '# outside\n', 'utf8');
  const dir = makeFixture(base, 'scan-outside');
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    '# readme\n[keep](../outside-docs/keep.md)\n[adr](docs/adr/c.md)\n',
    'utf8'
  );
  const scan = scanProjectDocuments(dir);
  assertCase(
    JSON.stringify(outboundTargets(scan, 'README.md')) === JSON.stringify(['../outside-docs/keep.md', 'docs/adr/c.md']),
    `仓外词法链接应维持既有处理仍入图，实际 ${JSON.stringify(outboundTargets(scan, 'README.md'))}`
  );
  assertCase(realRepoRelPath(dir, '../outside-docs/keep.md') === null, '仓外路径 realRepoRelPath 应返回 null');
  assertCase(!scan.deadlinks.some((d) => d.targetRel === '../outside-docs/keep.md'), '仓外已存在目标不应报死链');
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

  // 7. 排除集合随计划返回并计入 planFp：策略变化应改变指纹
  const scanPlain = scanProjectDocuments(dir, {});
  const planNoExclusion = buildMigrationPlan(dir, { preserve_items: [{ path: 'docs/adr/c.md' }] }, scanPlain, {});
  const planWithExclusion = buildMigrationPlan(dir, { preserve_items: [{ path: 'docs/adr/c.md' }] }, scanPlain, { excludePaths: ['docs/private-qa/'] });
  assertCase(Array.isArray(planNoExclusion.exclusions) && planNoExclusion.exclusions.length === 0, `无排除时 exclusions 应为空数组，实际 ${JSON.stringify(planNoExclusion.exclusions)}`);
  assertCase(JSON.stringify(planWithExclusion.exclusions) === JSON.stringify(['docs/private-qa']), `exclusions 应为归一化集合，实际 ${JSON.stringify(planWithExclusion.exclusions)}`);
  assertCase(planNoExclusion.planFp !== planWithExclusion.planFp, '排除集合不同时 planFp 必须不同（审批绑定当时的排除策略）');
}

/**
 * executePlan：计划自身记录的排除集合须在执行前复核，陈旧/手工改写的计划不得搬动已排除路径。
 */
async function caseExecutorRevalidatesExclusions(base) {
  const dir = makeFixture(base, 'executor');
  const scan = scanProjectDocuments(dir, {});
  const freshPlan = () =>
    buildMigrationPlan(dir, { preserve_items: [{ path: 'docs/adr/c.md' }] }, scan, { excludePaths: ['docs/private-qa/'] });

  // 7.1 自洽但含被排除动作的计划（重算指纹后仍自洽）：完整性通过、排除复核阻断且不落盘
  const forged = freshPlan();
  forged.fileActions.push({ action: 'MIGRATE_FILE', sourcePath: 'docs/private-qa/b.md', targetPath: 'docs/moved-b.md' });
  forged.planSummary.fileActions.push({ action: 'MIGRATE_FILE', sourcePath: 'docs/private-qa/b.md', targetPath: 'docs/moved-b.md', expectedSha256: null });
  forged.planSummary.actionsCount = forged.fileActions.length;
  forged.planFp = crypto.createHash('sha256').update(JSON.stringify(forged.planSummary)).digest('hex');
  const r1 = await executePlan(forged, { approvedPlanFp: forged.planFp });
  assertCase(
    r1 && r1.status === 'APPROVAL_DRIFT_BLOCKED' && /EXCLUDED_PATH_BLOCKED/.test(r1.reason || ''),
    `命中排除路径应被阻断，实际 ${JSON.stringify(r1 && r1.status)}: ${r1 && r1.reason}`
  );
  assertCase(!fs.existsSync(path.join(dir, 'docs', 'moved-b.md')), '被阻断的计划不得落盘任何文件');

  // 7.2 只删顶层排除数据、保留旧指纹：与指纹记录不一致即阻断
  const tampered = freshPlan();
  const approved = tampered.planFp;
  tampered.exclusions = [];
  const r2 = await executePlan(tampered, { approvedPlanFp: approved });
  assertCase(
    r2 && r2.status === 'APPROVAL_DRIFT_BLOCKED' && /PLAN_INTEGRITY_BLOCKED/.test(r2.reason || ''),
    `剔除排除数据应触发完整性阻断，实际 ${JSON.stringify(r2 && r2.status)}: ${r2 && r2.reason}`
  );

  // 7.3 改写内容但保留旧指纹：重算不一致即阻断
  const drifted = freshPlan();
  const approved2 = drifted.planFp;
  drifted.planSummary.actionsCount = 999;
  const r3 = await executePlan(drifted, { approvedPlanFp: approved2 });
  assertCase(
    r3 && r3.status === 'APPROVAL_DRIFT_BLOCKED' && /PLAN_INTEGRITY_BLOCKED/.test(r3.reason || ''),
    `内容与指纹不一致应阻断，实际 ${r3 && r3.reason}`
  );

  // 7.4 inputDigests 里只列了被排除文件：同样阻断
  const digests = freshPlan();
  digests.inputDigests['docs/private-qa/b.md'] = 'deadbeef';
  const r4 = await executePlan(digests, { approvedPlanFp: digests.planFp });
  assertCase(
    r4 && r4.status === 'APPROVAL_DRIFT_BLOCKED' && /EXCLUDED_PATH_BLOCKED/.test(r4.reason || '') && /inputDigests/.test(r4.reason || ''),
    `inputDigests 命中排除应阻断，实际 ${r4 && r4.reason}`
  );
}

/**
 * 扫描真实别名：词法名称不命中，只有真实路径命中固定或自定义排除。
 * 同时验证创建前后 boundedExclusionsCount 增量与仓外别名失败关闭。
 */
function caseScanAliasExclusion(base, kind, exclusionMode) {
  const fixed = exclusionMode === 'fixed';
  const excludedRel = fixed ? 'docs/raw-qa' : 'docs/custom-vault';
  const excludePaths = fixed ? [] : [`${excludedRel}/`];
  const name = `scan-${kind}-${exclusionMode}`;
  const f = makeAliasScanFixture(base, name, kind, excludedRel);
  assertCase(!buildExclusionMatcher(excludePaths)(f.aliasRel), `${kind} 别名词法路径不应命中排除：${f.aliasRel}`);

  const before = scanProjectDocuments(f.repo, { excludePaths });
  assertCase(before.files.some((file) => file.relPath === 'docs/adr/public.md'), `${name}：基线缺少普通文档`);
  createDirectoryLink(f.target, f.aliasAbs, kind);
  const realExcluded = realRepoRelPath(f.repo, f.aliasRel);
  assertCase(realExcluded === excludedRel, `${kind} 别名经真实路径应解析为 ${excludedRel}，实际 ${realExcluded}`);
  assertCase(buildExclusionMatcher(excludePaths)(realExcluded), `${kind} 真实路径应命中排除：${realExcluded}`);

  const afterPrimary = scanProjectDocuments(f.repo, { excludePaths });
  assertCase(
    afterPrimary.boundedExclusionsCount === before.boundedExclusionsCount + 1,
    `${kind} 别名创建后 boundedExclusionsCount 应增加 1，实际 ${before.boundedExclusionsCount} -> ${afterPrimary.boundedExclusionsCount}`
  );
  assertCase(!afterPrimary.files.some((file) => file.relPath.startsWith(f.aliasRel)), `${kind} 别名目录不应被 walk 遍历`);
  assertCase(!outboundTargets(afterPrimary, 'README.md').some((target) => target.startsWith(f.aliasRel)), `${kind} 指向别名的直接链接不应入图`);
  assertCase(
    !Object.keys(afterPrimary.inboundReferences).some((target) => target.startsWith(f.aliasRel)),
    `${kind} 别名不应产生入站引用`
  );
  assertCase(!afterPrimary.deadlinks.some((item) => item.targetRel.startsWith(f.aliasRel)), `${kind} 别名不应产生死链`);
  const primarySerialized = JSON.stringify(afterPrimary);
  assertCase(!primarySerialized.includes(f.secretTitle), `${kind} 扫描产物泄漏别名目标标题`);
  assertCase(!primarySerialized.includes(f.secretHash), `${kind} 扫描产物泄漏别名目标哈希`);
  assertCase(!primarySerialized.includes(f.aliasRel) && !primarySerialized.includes('%2D'), `${kind} 扫描产物泄漏直接或百分号编码别名`);

  createDirectoryLink(f.outsideTarget, f.outsideAliasAbs, kind);
  const outsideReal = realRepoRelPath(f.repo, f.outsideAliasRel);
  assertCase(outsideReal === null, `${kind} 仓外别名真实路径应无法核验，实际 ${outsideReal}`);
  const afterOutside = scanProjectDocuments(f.repo, { excludePaths });
  assertCase(
    afterOutside.boundedExclusionsCount === afterPrimary.boundedExclusionsCount + 1,
    `${kind} 仓外别名创建后 boundedExclusionsCount 应再增加 1，实际 ${afterPrimary.boundedExclusionsCount} -> ${afterOutside.boundedExclusionsCount}`
  );
  assertCase(!afterOutside.files.some((file) => file.relPath.startsWith(f.outsideAliasRel)), `${kind} 仓外别名目录不应被遍历`);
  assertCase(!outboundTargets(afterOutside, 'README.md').some((target) => target.startsWith(f.outsideAliasRel)), `${kind} 仓外别名链接应失败关闭`);
  assertCase(
    !Object.keys(afterOutside.inboundReferences).some((target) => target.startsWith(f.outsideAliasRel)),
    `${kind} 仓外别名不应产生入站引用`
  );
  assertCase(!afterOutside.deadlinks.some((item) => item.targetRel.startsWith(f.outsideAliasRel)), `${kind} 仓外别名不应产生死链`);

  const finalPaths = afterOutside.files.map((file) => file.relPath).sort();
  assertCase(
    JSON.stringify(finalPaths) === JSON.stringify(['README.md', 'docs/adr/public.md']),
    `${name}：普通文档应保留，实际 ${JSON.stringify(finalPaths)}`
  );
  assertCase(
    JSON.stringify(outboundTargets(afterOutside, 'README.md')) === JSON.stringify(['docs/adr/public.md', 'docs/missing.md']),
    `${name}：普通链接与真实死链应保留，实际 ${JSON.stringify(outboundTargets(afterOutside, 'README.md'))}`
  );
  assertCase(
    JSON.stringify(afterOutside.deadlinks.map((item) => item.targetRel)) === JSON.stringify(['docs/missing.md']),
    `${name}：真实死链正向对照应保留，实际 ${JSON.stringify(afterOutside.deadlinks)}`
  );
  const finalSerialized = JSON.stringify(afterOutside);
  assertCase(!finalSerialized.includes(f.outsideTitle), `${kind} 扫描产物泄漏仓外别名标题`);
  assertCase(!finalSerialized.includes(f.outsideHash), `${kind} 扫描产物泄漏仓外别名哈希`);
  assertCase(!finalSerialized.includes(f.outsideAliasRel), `${kind} 扫描产物泄漏仓外别名`);
}

/**
 * 不可解析的仓内目录链接必须失败关闭；用真实链接而非 mock 覆盖 realRepoRelPath 父级回溯分支。
 */
function caseScanBrokenAliasFailsClosed(base, kind) {
  const name = `scan-broken-${kind}`;
  const f = makeBrokenAliasFixture(base, name, kind);
  const before = scanProjectDocuments(f.repo, {});
  createBrokenDirectoryLink(f.missingTarget, f.aliasAbs, kind);
  const scan = scanProjectDocuments(f.repo, {});
  assertCase(
    scan.boundedExclusionsCount === before.boundedExclusionsCount + 1,
    `${kind} 悬空链接创建后 boundedExclusionsCount 应增加 1，实际 ${before.boundedExclusionsCount} -> ${scan.boundedExclusionsCount}`
  );
  assertCase(scan.files.some((file) => file.relPath === 'docs/adr/public.md'), `${name}：普通文档正向对照缺失`);
  assertCase(
    outboundTargets(scan, 'README.md').includes('docs/missing.md') && scan.deadlinks.some((item) => item.targetRel === 'docs/missing.md'),
    `${name}：真实死链正向对照缺失`
  );

  const brokenTargetRel = `${f.aliasRel}/secret.md`;
  const brokenReal = realRepoRelPath(f.repo, brokenTargetRel);
  const leaked = scan.files.some((file) => file.relPath.startsWith(f.aliasRel)) ||
    outboundTargets(scan, 'README.md').includes(brokenTargetRel) ||
    Object.hasOwn(scan.inboundReferences, brokenTargetRel) ||
    scan.deadlinks.some((item) => item.targetRel === brokenTargetRel);
  assertCase(
    brokenReal === null && !leaked,
    `${kind} 不可解析链接应失败关闭：realRepoRelPath=${JSON.stringify(brokenReal)}, leaked=${leaked}, outbound=${JSON.stringify(outboundTargets(scan, 'README.md'))}, deadlinks=${JSON.stringify(scan.deadlinks)}`
  );
}

/**
 * buildMigrationPlan：preserve、迁移源、迁移目标都只用别名词法路径，拒绝必须来自真实路径命中。
 */
function casePlanRejectsRealAlias(base, kind, exclusionMode) {
  const fixed = exclusionMode === 'fixed';
  const excludedRel = fixed ? 'docs/raw-qa' : 'docs/custom-vault';
  const excludePaths = fixed ? [] : [`${excludedRel}/`];
  const f = makePlanAliasFixture(base, `plan-${kind}-${exclusionMode}`, kind, excludedRel, excludePaths);

  const expectThrow = (label, spec, fieldName, expectedRealPath) => {
    let thrown = null;
    try {
      buildMigrationPlan(f.repo, spec, f.scan, { excludePaths });
    } catch (error) {
      thrown = error;
    }
    assertCase(
      thrown && thrown.code === 'ERR_EXCLUDED_PATH' && thrown.details && thrown.details.fieldName === fieldName,
      `${kind} ${label}：应抛 ERR_EXCLUDED_PATH(${fieldName})，实际 ${thrown ? thrown.code || thrown.message : '未抛错'}`
    );
    assertCase(
      thrown.details.realPath === expectedRealPath,
      `${kind} ${label}：字段 realPath 应为 ${expectedRealPath}，实际 ${thrown.details.realPath}`
    );
  };

  expectThrow(
    'preserve 真实别名',
    { preserve_items: [{ path: f.aliasSecretRel }] },
    'preserve_items.path',
    f.expectedSecretRealRel
  );
  expectThrow(
    '迁移源真实别名',
    { migrate_items: [{ source_path: f.aliasSecretRel, target_path: 'docs/adr/moved-secret.md' }] },
    'migrate_items.source_path',
    f.expectedSecretRealRel
  );
  expectThrow(
    '迁移目标真实别名',
    { migrate_items: [{ source_path: 'move.md', target_path: `${f.aliasRel}/new.md` }] },
    'migrate_items.target_path',
    `${excludedRel}/new.md`
  );
}

/**
 * executePlan：构造指纹与摘要自洽的计划，确保到达真实路径排除复核而非被一般完整性检查提前挡住。
 */
async function caseExecutorRejectsRealAlias(base, kind, exclusionMode) {
  const fixed = exclusionMode === 'fixed';
  const excludedRel = fixed ? 'docs/raw-qa' : 'docs/custom-vault';
  const excludePaths = fixed ? [] : [`${excludedRel}/`];
  const f = makePlanAliasFixture(base, `executor-${kind}-${exclusionMode}`, kind, excludedRel, excludePaths);
  const plan = buildMigrationPlan(
    f.repo,
    {
      preserve_items: [{ path: 'docs/adr/public.md' }],
      migrate_items: [{ source_path: 'move.md', target_path: 'docs/moved.md' }]
    },
    f.scan,
    { excludePaths }
  );
  assertCase(plan.fileActions.some((action) => action.action === 'UPDATE_ARTIFACTS_REGISTER'), `${kind} 夹具计划应含登记动作`);

  const aliasTargetRel = 'docs/forged-moved.md';
  plan.fileActions.push({
    action: 'MIGRATE_FILE',
    sourcePath: f.aliasSecretRel,
    targetPath: aliasTargetRel,
    sourceSha256: f.secretHash,
    expectedTargetSha256: f.secretHash,
    hasRewrittenOutboundLinks: false,
    contentToWrite: `# SYNTHETIC_PLAN_ALIAS_SECRET_${kind}\nsecret plan content\n`
  });
  plan.planSummary.fileActions.push({
    action: 'MIGRATE_FILE',
    sourcePath: f.aliasSecretRel,
    targetPath: aliasTargetRel,
    expectedSha256: f.secretHash
  });
  plan.planSummary.actionsCount = plan.fileActions.length;
  plan.inputDigests[f.aliasSecretRel] = f.secretHash;
  plan.inputFp = computeInputFingerprint(plan.inputDigests);
  plan.planSummary.inputFp = plan.inputFp;
  plan.planFp = crypto.createHash('sha256').update(JSON.stringify(plan.planSummary)).digest('hex');

  assertCase(
    plan.planFp === crypto.createHash('sha256').update(JSON.stringify(plan.planSummary)).digest('hex'),
    `${kind} 执行器夹具 planFp 应自洽`
  );
  assertCase(plan.inputFp === computeInputFingerprint(plan.inputDigests), `${kind} 执行器夹具 inputFp 应自洽`);
  assertCase(
    JSON.stringify(plan.exclusions) === JSON.stringify(plan.planSummary.exclusions),
    `${kind} 执行器夹具排除集合应自洽`
  );

  const artifactsPath = path.join(f.repo, 'docs', 'ARTIFACTS.md');
  const originalArtifacts = fs.readFileSync(artifactsPath);
  const originalSecret = fs.readFileSync(path.join(f.target, 'secret.md'));
  const originalMove = fs.readFileSync(path.join(f.repo, 'move.md'));
  const backupRoot = path.join(f.repo, '.fixture-backups');
  const beforeSnapshot = snapshotTree(f.repo);
  const result = await executePlan(plan, { approvedPlanFp: plan.planFp, backupRoot });
  const afterSnapshot = snapshotTree(f.repo);

  assertCase(
    result && result.status === 'APPROVAL_DRIFT_BLOCKED' && /EXCLUDED_PATH_BLOCKED/.test(result.reason || ''),
    `${kind} 自洽计划命中真实别名应进入排除阻断，实际 ${JSON.stringify(result)}`
  );
  assertCase(
    result.details && result.details.hits.some((hit) => hit.field === 'action.sourcePath' && hit.path === f.aliasSecretRel),
    `${kind} 阻断明细应包含 fileActions 的 alias 路径`
  );
  assertCase(
    result.details && result.details.hits.some((hit) => hit.field === 'inputDigests' && hit.path === f.aliasSecretRel),
    `${kind} 阻断明细应包含 inputDigests 的 alias 路径`
  );
  assertCase(!fs.existsSync(backupRoot), `${kind} 阻断前不得创建夹具内 backupRoot`);
  assertCase(!Object.keys(afterSnapshot).some((rel) => rel.endsWith('journal.jsonl')), `${kind} 阻断前后不得创建 WAL`);
  assertCase(JSON.stringify(afterSnapshot) === JSON.stringify(beforeSnapshot), `${kind} 阻断前后文件、目录及字节快照应完全一致`);
  assertCase(fs.readFileSync(artifactsPath).equals(originalArtifacts), `${kind} 阻断不得写登记册`);
  assertCase(fs.readFileSync(path.join(f.target, 'secret.md')).equals(originalSecret), `${kind} 阻断不得改动原始敏感输入`);
  assertCase(fs.readFileSync(path.join(f.repo, 'move.md')).equals(originalMove), `${kind} 阻断不得改动普通迁移源`);
}

/**
 * CLI 使用真实 Node 可执行文件启动 doc_helper，分别验证无 exclude 可见与重复尾斜杠 exclude 剔除。
 */
function caseCliExclude(base) {
  const help = runDocHelper(['--help']);
  assertCase(!help.error && help.status === 0 && help.stderr === '', `CLI help 启动失败：${JSON.stringify({ status: help.status, stderr: help.stderr, error: help.error && help.error.message })}`);
  assertCase(help.stdout.includes('--exclude <relpath>'), `CLI help 缺少 --exclude 参数：${help.stdout}`);

  const repo = path.join(base, 'cli-exclude');
  const secretDir = path.join(repo, 'docs', 'custom-cli-secret');
  fs.mkdirSync(secretDir, { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs', 'adr'), { recursive: true });
  const secretTitle = 'SYNTHETIC_CLI_SECRET_TITLE_ISSUE83';
  const secretContent = `# ${secretTitle}\ncli secret bytes\n`;
  const secretHash = crypto.createHash('sha256').update(secretContent).digest('hex');
  fs.writeFileSync(path.join(secretDir, 'secret.md'), secretContent, 'utf8');
  fs.writeFileSync(path.join(repo, 'docs', 'adr', 'public.md'), '# public cli document\n', 'utf8');
  fs.writeFileSync(
    path.join(repo, 'README.md'),
    '# cli fixture\n[public](docs/adr/public.md)\n[missing](docs/missing.md)\n' +
      '[secret](docs/custom-cli-secret/secret.md)\n[secret encoded](docs/custom%2Dcli%2Dsecret/secret.md)\n',
    'utf8'
  );

  const noExcludeProcess = runDocHelper(['scan', '--cwd', repo]);
  const noExclude = parseSuccessfulJson(noExcludeProcess, 'CLI scan 无 exclude');
  assertCase(noExclude.files.some((file) => file.relPath === 'docs/custom-cli-secret/secret.md'), 'CLI 无 exclude 时自定义文档应可见');
  assertCase(outboundTargets(noExclude, 'README.md').includes('docs/custom-cli-secret/secret.md'), 'CLI 无 exclude 时应保留自定义目录链接');

  const excludedProcess = runDocHelper([
    'scan', '--cwd', repo,
    '--exclude', 'docs/custom-cli-secret/',
    '--exclude', 'docs/custom-cli-secret'
  ]);
  const excluded = parseSuccessfulJson(excludedProcess, 'CLI scan 重复尾斜杠 exclude');
  const serialized = JSON.stringify(excluded);
  assertCase(excludedProcess.status === 0, `CLI exclude 退出码应为 0，实际 ${excludedProcess.status}`);
  assertCase(!excluded.files.some((file) => file.relPath.startsWith('docs/custom-cli-secret')), 'CLI exclude 后自定义文档仍进入 files');
  assertCase(JSON.stringify(outboundTargets(excluded, 'README.md')) === JSON.stringify(['docs/adr/public.md', 'docs/missing.md']), `CLI exclude 后链接图不符：${JSON.stringify(outboundTargets(excluded, 'README.md'))}`);
  assertCase(!Object.keys(excluded.inboundReferences).some((target) => target.includes('custom-cli-secret')), 'CLI exclude 后仍存在入站引用');
  assertCase(!excluded.deadlinks.some((item) => item.targetRel.includes('custom-cli-secret')), 'CLI exclude 后仍存在死链');
  assertCase(!serialized.includes('custom-cli-secret') && !serialized.includes('custom%2Dcli%2Dsecret'), 'CLI exclude 后 JSON 仍含路径或百分号编码路径');
  assertCase(!serialized.includes(secretTitle) && !serialized.includes(secretHash), 'CLI exclude 后 JSON 泄漏敏感标题或哈希');
  assertCase(excluded.files.some((file) => file.relPath === 'docs/adr/public.md'), 'CLI exclude 后普通文档应保留');
  assertCase(JSON.stringify(excluded.deadlinks.map((item) => item.targetRel)) === JSON.stringify(['docs/missing.md']), 'CLI exclude 后真实死链应保留');
}

const CASES = [
  ['normalizeExcludePaths 归一化', caseNormalizeExcludePaths],
  ['buildExclusionMatcher 命中判定', caseBuildExclusionMatcher],
  ['scan 固定集合排除与链接过滤', caseScanWithoutConfiguredExclude],
  ['scan 尾斜杠 --exclude 排除与链接过滤', caseScanWithTrailingSlashExclude],
  ['scan 仓外词法链接维持入图', caseScanOutOfRepoLexicalLink],
  ['buildMigrationPlan 拒绝排除项', casePlanRejectsExcludedItems],
  ['executePlan 排除路径复核', caseExecutorRevalidatesExclusions],
  ['scan raw-qa Junction 真实别名排除', (base) => caseScanAliasExclusion(base, 'junction', 'fixed')],
  ['scan 自定义目录 Junction 真实别名排除', (base) => caseScanAliasExclusion(base, 'junction', 'custom')],
  ['scan raw-qa dir 符号链接真实别名排除', (base) => caseScanAliasExclusion(base, 'dir', 'fixed')],
  ['scan 自定义目录 dir 符号链接真实别名排除', (base) => caseScanAliasExclusion(base, 'dir', 'custom')],
  ['scan 不可解析 Junction 链接失败关闭', (base) => caseScanBrokenAliasFailsClosed(base, 'junction')],
  ['scan 不可解析 dir 符号链接失败关闭', (base) => caseScanBrokenAliasFailsClosed(base, 'dir')],
  ['buildMigrationPlan Junction 真实路径拒绝', (base) => casePlanRejectsRealAlias(base, 'junction', 'fixed')],
  ['buildMigrationPlan dir 符号链接真实路径拒绝', (base) => casePlanRejectsRealAlias(base, 'dir', 'custom')],
  ['executePlan Junction 真实路径复核', (base) => caseExecutorRejectsRealAlias(base, 'junction', 'fixed')],
  ['executePlan dir 符号链接真实路径复核', (base) => caseExecutorRejectsRealAlias(base, 'dir', 'custom')],
  ['doc_helper CLI 重复尾斜杠 --exclude', caseCliExclude]
];

async function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-scanner-test-'));
  let failed = 0;
  let skipped = 0;
  try {
    for (const [name, fn] of CASES) {
      try {
        await fn(base);
        console.log(`PASS ${name}`);
      } catch (e) {
        if (e instanceof CaseSkip) {
          skipped++;
          console.log(`SKIP ${name}: ${e.message}`);
        } else {
          failed++;
          console.error(`FAIL ${name}: ${e.message}`);
        }
      }
    }
  } finally {
    cleanupFixtureRoot(base);
  }
  const passed = CASES.length - failed - skipped;
  const summary = `test_doc_scanner: ${passed}/${CASES.length} PASS, ${skipped} SKIP, ${failed} FAIL`;
  if (failed > 0) {
    console.error(summary);
    process.exit(1);
  }
  console.log(summary);
}

main().catch((e) => {
  console.error(`test_doc_scanner: 运行异常 ${e && e.message}`);
  process.exit(1);
});
