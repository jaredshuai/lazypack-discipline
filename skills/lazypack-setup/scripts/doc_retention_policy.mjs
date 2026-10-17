import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// roles.md stores rendered policy, not a reliably parseable retention JSON object.
// Bind its exact bytes (including absence) rather than infer policy from prose.
// Only this fixed metadata file is read; no raw_qa contents or aliases are opened.
export function readRetentionPolicySnapshot(repoRoot) {
  const segments = ['docs', 'agents', 'roles.md'];
  let current = path.resolve(repoRoot);
  try {
    for (const [index, segment] of segments.entries()) {
      current = path.join(current, segment);
      const stat = fs.lstatSync(current, { throwIfNoEntry: false });
      if (!stat) return { version: 1, sha256: null };
      if (stat.isSymbolicLink() || (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
        throw new Error('Unsafe policy file or parent');
      }
    }
    const fd = fs.openSync(current, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      if (!fs.fstatSync(fd).isFile()) throw new Error('Policy is not a regular file');
      const bytes = fs.readFileSync(fd);
      return { version: 1, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    const error = new Error('RETENTION_POLICY_UNREADABLE: Cannot safely read docs/agents/roles.md; restore a regular readable file and regenerate the plan.');
    error.code = 'ERR_RETENTION_POLICY_UNREADABLE';
    throw error;
  }
}

export function isRetentionPolicySnapshot(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    value.version === 1 && Object.keys(value).sort().join(',') === 'sha256,version' &&
    (value.sha256 === null || (typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)));
}
