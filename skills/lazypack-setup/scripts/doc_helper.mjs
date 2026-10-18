#!/usr/bin/env node
/**
 * doc_helper.mjs
 * 
 * 统一 CLI 工具入口 (CLI Interface for Agent & User Workflows)
 * 纯 Node.js 标准库 (ES Modules)
 * 
 * 命令列表:
 *   scan    --cwd <repoRoot> [--exclude <relpath>]... [--out <scan.json>]
 *   plan    --cwd <repoRoot> --input <plan_spec.json> [--exclude <relpath>]... [--out <plan.json>]
 *   execute --cwd <repoRoot> --plan <plan.json> --approved-fp <plan_fp> [--backup-root <dir>]
 *   verify  --cwd <repoRoot> --plan <plan.json> [--backup-dir <dir>]
 */

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { scanProjectDocuments, computeSha256 } from './doc_scanner.mjs';
import { buildMigrationPlan } from './doc_plan.mjs';
import { executePlan, ExecutionStatus } from './doc_executor.mjs';
import { readRetentionPolicySnapshot, assertRetentionPolicyUnchanged, assertPolicyCarriersVisible, assertSafePolicyOutput } from './doc_retention_policy.mjs';

const options = {
  cwd: { type: 'string', default: process.cwd() },
  input: { type: 'string' },
  plan: { type: 'string' },
  'approved-fp': { type: 'string' },
  'backup-root': { type: 'string' },
  'backup-dir': { type: 'string' },
  exclude: { type: 'string', multiple: true },
  out: { type: 'string' },
  help: { type: 'boolean', short: 'h' }
};

async function main() {
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  const command = positionals[0];

  if (!command || values.help) {
    console.log(`
Usage: node doc_helper.mjs <command> [options]

Commands:
  scan     Bounded scan of project Markdown files and reference graph
  plan     Validate spec, compute rewrites, expected hashes and plan_fp
  execute  Execute plan with WAL and compensating rollback
  verify   Verify disk state and WAL commit status against plan

Options:
  --exclude <relpath>  Repeatable. Also skip this repo-relative path and its
                       descendants (e.g. a configured retention.paths.raw_qa).

  Plans bind the exact docs/agents/roles.md, root AGENTS.md and CLAUDE.md bytes (or absence) to approval.
  Scan and plan validate policy before and after scanning; drift blocks output.
  Exclusions must not hide an existing policy carrier. Outputs cannot replace
  carriers or use symlink/junction paths or parents.
  Execute revalidates this snapshot before migration reads or writes.
  Changed/unreadable policy or an old plan without a snapshot requires replanning.
    `);
    process.exit(0);
  }

  const cwd = path.resolve(values.cwd);
  if (values.out && ['scan', 'plan'].includes(command)) assertSafePolicyOutput(cwd, values.out);

  if (command === 'scan') {
    const policyBeforeScan = readRetentionPolicySnapshot(cwd);
    assertPolicyCarriersVisible(policyBeforeScan, values.exclude || []);
    const result = scanProjectDocuments(cwd, { excludePaths: values.exclude || [] });
    assertRetentionPolicyUnchanged(cwd, policyBeforeScan);
    const json = JSON.stringify(result, null, 2);
    if (values.out) {
      assertSafePolicyOutput(cwd, values.out);
      fs.writeFileSync(path.resolve(values.out), json, 'utf8');
      console.log(`Scan completed. Output saved to ${values.out}`);
    } else {
      console.log(json);
    }
  } else if (command === 'plan') {
    if (!values.input) {
      console.error('Error: --input <plan_spec.json> is required for plan command');
      process.exit(1);
    }
    const specPath = path.resolve(values.input);
    const planSpec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

    const policyBeforeScan = readRetentionPolicySnapshot(cwd);
    assertPolicyCarriersVisible(policyBeforeScan, values.exclude || []);
    const scanResult = scanProjectDocuments(cwd, { excludePaths: values.exclude || [] });
    assertRetentionPolicyUnchanged(cwd, policyBeforeScan);
    const plan = buildMigrationPlan(cwd, planSpec, scanResult, { excludePaths: values.exclude || [] });
    assertRetentionPolicyUnchanged(cwd, policyBeforeScan);
    const json = JSON.stringify(plan, null, 2);

    if (values.out) {
      assertSafePolicyOutput(cwd, values.out);
      fs.writeFileSync(path.resolve(values.out), json, 'utf8');
      console.log(`Plan generated. plan_fp: ${plan.planFp}, input_fp: ${plan.inputFp}`);
      console.log(`Output saved to ${values.out}`);
    } else {
      console.log(json);
    }
  } else if (command === 'execute') {
    if (!values.plan) {
      console.error('Error: --plan <plan.json> is required for execute command');
      process.exit(1);
    }
    if (!values['approved-fp']) {
      console.error('Error: --approved-fp <plan_fp> is required for execute command');
      process.exit(1);
    }

    const planPath = path.resolve(values.plan);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

    const result = await executePlan(plan, {
      approvedPlanFp: values['approved-fp'],
      backupRoot: values['backup-root']
    });

    console.log(JSON.stringify(result, null, 2));
    if (result.status !== ExecutionStatus.SUCCESS) {
      process.exit(1);
    }
  } else if (command === 'verify') {
    if (!values.plan) {
      console.error('Error: --plan <plan.json> is required for verify command');
      process.exit(1);
    }
    const planPath = path.resolve(values.plan);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

    const verification = {
      verified: true,
      errors: [],
      files: [],
      walCommitted: false
    };

    // 1. 物理文件与哈希核验
    for (const action of plan.fileActions) {
      if (action.action === 'MIGRATE_FILE') {
        const tgtAbs = path.resolve(cwd, action.targetPath);
        if (!fs.existsSync(tgtAbs)) {
          verification.verified = false;
          verification.errors.push(`Target missing: ${action.targetPath}`);
        } else {
          const sha = computeSha256(tgtAbs);
          if (sha !== action.expectedTargetSha256) {
            verification.verified = false;
            verification.errors.push(`Target hash mismatch for ${action.targetPath}: expected ${action.expectedTargetSha256}, got ${sha}`);
          } else {
            verification.files.push({ path: action.targetPath, status: 'MATCH' });
          }
        }

        const srcAbs = path.resolve(cwd, action.sourcePath);
        if (fs.existsSync(srcAbs)) {
          verification.verified = false;
          verification.errors.push(`Source was not deleted: ${action.sourcePath}`);
        }
      } else if (action.action === 'REWRITE_INBOUND_REFERENCE' || action.action === 'UPDATE_ARTIFACTS_REGISTER') {
        const fileAbs = path.resolve(cwd, action.filePath);
        if (!fs.existsSync(fileAbs)) {
          verification.verified = false;
          verification.errors.push(`File missing: ${action.filePath}`);
        } else {
          const sha = computeSha256(fileAbs);
          if (sha !== action.expectedSha256) {
            verification.verified = false;
            verification.errors.push(`File hash mismatch for ${action.filePath}: expected ${action.expectedSha256}, got ${sha}`);
          } else {
            verification.files.push({ path: action.filePath, status: 'MATCH' });
          }
        }
      }
    }

    // 2. WAL 终态核验 (若提供了 backupDir)
    if (values['backup-dir']) {
      const journalFile = path.resolve(values['backup-dir'], 'journal.jsonl');
      if (fs.existsSync(journalFile)) {
        const lines = fs.readFileSync(journalFile, 'utf8').trim().split(/\r?\n/);
        const lastEntry = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;
        if (lastEntry && lastEntry.action === 'COMMIT_TRANSACTION') {
          verification.walCommitted = true;
        } else {
          verification.verified = false;
          verification.errors.push(`WAL transaction not committed (last action: ${lastEntry?.action})`);
        }
      }
    }

    console.log(JSON.stringify(verification, null, 2));
    if (!verification.verified) {
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
