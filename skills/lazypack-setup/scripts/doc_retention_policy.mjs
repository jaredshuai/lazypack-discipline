import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { realRepoRelPath, buildExclusionMatcher } from './doc_scanner.mjs';

export const RETENTION_POLICY_PATHS = Object.freeze(['docs/agents/roles.md', 'AGENTS.md', 'CLAUDE.md']);

// roles.md stores rendered policy, not a reliably parseable retention JSON object.
// Bind its exact bytes (including absence) rather than infer policy from prose.
// Include both supported legacy resident entries, even when roles.md exists.
// Only these metadata files are read; no raw_qa contents or aliases are opened.
export function readRetentionPolicySnapshot(repoRoot) {
  const root = path.resolve(repoRoot);
  try {
    const rootStat = fs.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Unsafe repository root');
    return { version: 2, files: Object.fromEntries(RETENTION_POLICY_PATHS.map(p => [p, readPolicyFile(root, p)])) };
  } catch {
    const error = new Error('RETENTION_POLICY_UNREADABLE: Cannot safely read roles.md or a supported resident entry; restore regular readable policy files and regenerate the plan.');
    error.code = 'ERR_RETENTION_POLICY_UNREADABLE';
    throw error;
  }
}

function readPolicyFile(root, relativePath) {
  const segments = relativePath.split('/');
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) return null;
    if (stat.isSymbolicLink() || (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error('Unsafe policy file or parent');
    }
  }
  const fd = fs.openSync(current, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('Policy is not a regular file');
    const bytes = fs.readFileSync(fd);
    return crypto.createHash('sha256').update(bytes).digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

export function retentionPoliciesEqual(a, b) {
  return RETENTION_POLICY_PATHS.every(p => a.files[p] === b.files[p]);
}

export function assertPolicyCarriersVisible(snapshot, exclusions) {
  const excluded = buildExclusionMatcher(exclusions);
  if (RETENTION_POLICY_PATHS.some(p => snapshot.files[p] !== null && excluded(p))) {
    const error = new Error('POLICY_CARRIER_EXCLUDED: Exclusions must not hide an existing retention policy carrier or its inbound references.');
    error.code = 'ERR_POLICY_CARRIER_EXCLUDED';
    throw error;
  }
}

export function assertSafePolicyOutput(repoRoot, output) {
  const absolute = path.resolve(output);
  assertNotPolicyCarrier(repoRoot, absolute);
  // Refuse links even when dangling: writing through one can create a carrier.
  for (let p = absolute; ; p = path.dirname(p)) {
    if (fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) {
      const error = new Error('POLICY_OUTPUT_UNSAFE: Output path and parents must not be symbolic links or junctions.');
      error.code = 'ERR_POLICY_OUTPUT_UNSAFE';
      throw error;
    }
    if (p === path.dirname(p)) break;
  }
}

export function assertRetentionPolicyUnchanged(repoRoot, approvedPolicy) {
  if (!retentionPoliciesEqual(readRetentionPolicySnapshot(repoRoot), approvedPolicy)) {
    const error = new Error('RETENTION_POLICY_DRIFT: Policy changed during planning; re-read policy and exclusions before generating a new plan.');
    error.code = 'ERR_RETENTION_POLICY_DRIFT';
    throw error;
  }
}

// The fixed policy carrier belongs to setup, not to the document migrator.
// Check physical aliases as well as portable, case-insensitive lexical names.
export function assertNotPolicyCarrier(repoRoot, value) {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(repoRoot, value)).replace(/\\/g, '/');
  const real = realRepoRelPath(repoRoot, value);
  const candidate = fs.statSync(path.resolve(repoRoot, value), { throwIfNoEntry: false, bigint: true });
  const hardLink = candidate?.isFile() && RETENTION_POLICY_PATHS.some(carrier => {
    const stat = fs.statSync(path.resolve(repoRoot, carrier), { throwIfNoEntry: false, bigint: true });
    return stat?.isFile() && stat.dev === candidate.dev && stat.ino === candidate.ino;
  });
  if (hardLink || [relative, real].some(p => RETENTION_POLICY_PATHS.some(carrier => p?.toLowerCase() === carrier.toLowerCase()))) {
    const error = new Error('POLICY_FILE_RESERVED: The document migrator cannot move, replace or rewrite a retention policy carrier; keep it in place and handle affected links through an approved setup update.');
    error.code = 'ERR_POLICY_FILE_RESERVED';
    throw error;
  }
}

export function isRetentionPolicySnapshot(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    value.version === 2 && Object.keys(value).sort().join(',') === 'files,version' &&
    value.files !== null && typeof value.files === 'object' && !Array.isArray(value.files) &&
    Object.keys(value.files).sort().join(',') === [...RETENTION_POLICY_PATHS].sort().join(',') &&
    RETENTION_POLICY_PATHS.every(p => value.files[p] === null ||
      (typeof value.files[p] === 'string' && /^[a-f0-9]{64}$/.test(value.files[p])));
}
