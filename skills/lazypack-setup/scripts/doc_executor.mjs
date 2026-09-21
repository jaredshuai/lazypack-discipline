/**
 * doc_executor.mjs
 * 
 * 迁移与登记执行器 (Execution Engine with WAL Journal & Compensating Rollback)
 * 纯 Node.js 标准库 (ES Modules)
 * 来源: 复用 S4 WAL/Backup 与 S6 补偿回滚，修复 B1 备份隔离、B2 执行入口边界校验与 B3 回滚防覆写
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { computeSha256, normalizeRelPath } from './doc_scanner.mjs';
import { assertPathWithinRepo } from './doc_plan.mjs';

/**
 * 冲突类型常量
 */
export const ConflictType = Object.freeze({
  PRE_WRITE_TARGET_COLLISION: 'pre_write_target_collision',
  MID_EXECUTION_MUTATION: 'mid_execution_mutation',
  PRE_ROLLBACK_COLLISION: 'pre_rollback_collision'
});

/**
 * 执行状态常量
 */
export const ExecutionStatus = Object.freeze({
  SUCCESS: 'SUCCESS',
  APPROVAL_DRIFT_BLOCKED: 'APPROVAL_DRIFT_BLOCKED',
  HALTED_PRE_WRITE_COLLISION: 'HALTED_PRE_WRITE_COLLISION',
  COMPENSATION_SUCCEEDED: 'COMPENSATION_SUCCEEDED',
  SUSPENDED_ON_CONFLICT: 'SUSPENDED_ON_CONFLICT'
});

/**
 * 审计与 WAL 日志
 */
export class SimpleWalJournal {
  constructor(journalPath, txId) {
    this.journalPath = journalPath;
    this.txId = txId;
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    this.entries = [];
  }

  append(action, target, result = 'SUCCESS', details = {}) {
    const entry = {
      txId: this.txId,
      step: this.entries.length + 1,
      timestamp: new Date().toISOString(),
      action,
      target,
      result,
      details
    };
    this.entries.push(entry);
    fs.appendFileSync(this.journalPath, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  }
}

/**
 * 备份存储管理器 (B1 修复: 强制物理隔离)
 */
export class SimpleBackupStore {
  constructor(backupRoot, txId, repoRoot) {
    this.txId = txId;
    this.repoRoot = path.resolve(repoRoot);

    // 默认使用系统临时目录，每个事务独立目录
    const root = backupRoot
      ? path.resolve(backupRoot)
      : path.resolve(os.tmpdir(), 'lazypack-backup');
    this.backupDir = path.resolve(root, txId);

    // B1: 严格核验证明 backupDir 物理位于 repoRoot 外部
    this.assertBackupIsolation();

    fs.mkdirSync(this.backupDir, { recursive: true });
    this.snapshots = new Map(); // relPath -> { backupPath, sha256, exists }
  }

  assertBackupIsolation() {
    const realRepo = fs.realpathSync(this.repoRoot);
    let checkDir = this.backupDir;
    while (!fs.existsSync(checkDir) && checkDir !== path.dirname(checkDir)) {
      checkDir = path.dirname(checkDir);
    }
    const realBackup = fs.existsSync(checkDir) ? fs.realpathSync(checkDir) : path.resolve(checkDir);

    const rel = path.relative(realRepo, realBackup);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      const err = new Error(`ERR_PARAM_BACKUP_ROOT_INSIDE_REPO: backupRoot (${this.backupDir}) must NOT be inside repoRoot (${this.repoRoot})`);
      err.code = 'ERR_PARAM_BACKUP_ROOT_INSIDE_REPO';
      throw err;
    }
  }

  snapshotFile(repoRoot, relPath) {
    const norm = normalizeRelPath(relPath);
    const srcAbs = path.resolve(repoRoot, norm);
    if (!fs.existsSync(srcAbs)) {
      this.snapshots.set(norm, { exists: false });
      return;
    }
    const backupTarget = path.resolve(this.backupDir, norm);
    fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
    fs.copyFileSync(srcAbs, backupTarget);
    const hash = computeSha256(srcAbs);
    this.snapshots.set(norm, { exists: true, backupPath: backupTarget, sha256: hash });
  }

  getSnapshot(relPath) {
    return this.snapshots.get(normalizeRelPath(relPath));
  }
}

/**
 * 执行迁移与登记计划的主引擎
 */
export async function executePlan(plan, options = {}) {
  const repoRoot = path.resolve(plan.repoRoot);
  const txId = options.txId || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const approvedFp = options.approvedPlanFp;

  // 1. 验证用户批准与指纹绑定
  if (!approvedFp) {
    return {
      status: ExecutionStatus.APPROVAL_DRIFT_BLOCKED,
      reason: 'MISSING_APPROVAL: No approved_plan_fp was provided.',
      txId
    };
  }
  if (approvedFp !== plan.planFp) {
    return {
      status: ExecutionStatus.APPROVAL_DRIFT_BLOCKED,
      reason: `PLAN_DRIFT_BLOCKED: Approved plan_fp (${approvedFp}) does not match current plan_fp (${plan.planFp}).`,
      details: { approvedFp, currentPlanFp: plan.planFp },
      txId
    };
  }

  // 2. B2: 执行入口统一路径边界防伪校验 (不信任外部输入计划)
  for (const action of plan.fileActions) {
    if (action.sourcePath) assertPathWithinRepo(repoRoot, action.sourcePath, 'action.sourcePath');
    if (action.targetPath) assertPathWithinRepo(repoRoot, action.targetPath, 'action.targetPath');
    if (action.filePath) assertPathWithinRepo(repoRoot, action.filePath, 'action.filePath');
  }
  for (const relPath of Object.keys(plan.inputDigests)) {
    assertPathWithinRepo(repoRoot, relPath, 'inputDigests');
  }

  // 3. 写前重读与冲突校验
  // 3a. 目标占用校验 (pre_write_target_collision)
  for (const action of plan.fileActions) {
    if (action.action === 'MIGRATE_FILE') {
      const tgtAbs = path.resolve(repoRoot, action.targetPath);
      if (fs.existsSync(tgtAbs)) {
        return {
          status: ExecutionStatus.HALTED_PRE_WRITE_COLLISION,
          conflictType: ConflictType.PRE_WRITE_TARGET_COLLISION,
          reason: `Target path already exists before write: ${action.targetPath}`,
          affectedPath: action.targetPath,
          txId
        };
      }
    }
  }

  // 3b. 输入文件哈希重读 (pre_write drift / mid_execution_mutation)
  for (const [relPath, expectedDigest] of Object.entries(plan.inputDigests)) {
    const absPath = path.resolve(repoRoot, relPath);
    if (expectedDigest !== null) {
      if (!fs.existsSync(absPath)) {
        return {
          status: ExecutionStatus.APPROVAL_DRIFT_BLOCKED,
          conflictType: ConflictType.MID_EXECUTION_MUTATION,
          reason: `Input file was removed before write: ${relPath}`,
          affectedPath: relPath,
          txId
        };
      }
      const currentDigest = computeSha256(absPath);
      if (currentDigest !== expectedDigest) {
        return {
          status: ExecutionStatus.APPROVAL_DRIFT_BLOCKED,
          conflictType: ConflictType.MID_EXECUTION_MUTATION,
          reason: `Input file drifted before write: ${relPath} (expected ${expectedDigest}, found ${currentDigest})`,
          affectedPath: relPath,
          txId
        };
      }
    }
  }

  // 4. B1: 初始化 WAL 与隔离 BackupStore
  const backupStore = new SimpleBackupStore(options.backupRoot, txId, repoRoot);
  const journalPath = path.resolve(backupStore.backupDir, 'journal.jsonl');
  const wal = new SimpleWalJournal(journalPath, txId);

  wal.append('BEGIN_TRANSACTION', repoRoot, 'SUCCESS', { planFp: plan.planFp, actionsCount: plan.fileActions.length });

  // 5. 前置物理备份所有受影响文件
  for (const [relPath] of Object.entries(plan.inputDigests)) {
    backupStore.snapshotFile(repoRoot, relPath);
  }

  const executedSteps = []; // 追踪已执行写操作及其写前写后状态

  try {
    if (options.simulateFailure === 'PRE_WRITE_ERROR') {
      throw new Error('SIMULATED_PRE_WRITE_ERROR');
    }

    // 6. 阶段 1: 写入目标文件 (Write-Ahead Logging)
    for (const action of plan.fileActions) {
      if (action.action === 'MIGRATE_FILE') {
        const tgtAbs = path.resolve(repoRoot, action.targetPath);
        fs.mkdirSync(path.dirname(tgtAbs), { recursive: true });

        // 写前记录意向
        wal.append('WRITE_TARGET_INTENDED', action.targetPath, 'IN_PROGRESS', {
          expectedSha256: action.expectedTargetSha256
        });

        fs.writeFileSync(tgtAbs, action.contentToWrite, 'utf8');
        const writtenSha = computeSha256(tgtAbs);

        executedSteps.push({
          action: 'CREATE_TARGET',
          path: action.targetPath,
          postHash: writtenSha
        });

        wal.append('WRITE_TARGET', action.targetPath, 'SUCCESS', {
          actualSha256: writtenSha,
          rewrittenOutbound: action.hasRewrittenOutboundLinks
        });
      }
    }

    if (options.simulateFailure === 'MID_WRITE_TARGET_ERROR') {
      throw new Error('SIMULATED_MID_WRITE_TARGET_ERROR');
    }

    // 7. 阶段 2: 改写引用文件
    for (const action of plan.fileActions) {
      if (action.action === 'REWRITE_INBOUND_REFERENCE') {
        const refAbs = path.resolve(repoRoot, action.filePath);

        wal.append('REWRITE_REF_INTENDED', action.filePath, 'IN_PROGRESS', {
          expectedSha256: action.expectedSha256
        });

        fs.writeFileSync(refAbs, action.contentToWrite, 'utf8');
        const writtenSha = computeSha256(refAbs);

        executedSteps.push({
          action: 'REWRITE_REF',
          path: action.filePath,
          preHash: action.sourceSha256,
          postHash: writtenSha
        });

        wal.append('REWRITE_REF', action.filePath, 'SUCCESS', { actualSha256: writtenSha });
      }
    }

    // 8. 阶段 3: 更新 docs/ARTIFACTS.md
    for (const action of plan.fileActions) {
      if (action.action === 'UPDATE_ARTIFACTS_REGISTER') {
        const artAbs = path.resolve(repoRoot, action.filePath);
        fs.mkdirSync(path.dirname(artAbs), { recursive: true });

        wal.append('UPDATE_ARTIFACTS_INTENDED', action.filePath, 'IN_PROGRESS', {
          expectedSha256: action.expectedSha256
        });

        fs.writeFileSync(artAbs, action.contentToWrite, 'utf8');
        const writtenSha = computeSha256(artAbs);

        executedSteps.push({
          action: 'UPDATE_ARTIFACTS',
          path: action.filePath,
          preHash: action.sourceSha256,
          postHash: writtenSha
        });

        wal.append('UPDATE_ARTIFACTS', action.filePath, 'SUCCESS', { actualSha256: writtenSha });
      }
    }

    if (options.simulateFailure === 'MID_UPDATE_ERROR') {
      throw new Error('SIMULATED_MID_UPDATE_ERROR');
    }

    // 9. 阶段 4: 删除已迁移源文件
    for (const action of plan.fileActions) {
      if (action.action === 'MIGRATE_FILE') {
        const srcAbs = path.resolve(repoRoot, action.sourcePath);
        if (fs.existsSync(srcAbs)) {
          wal.append('DELETE_SOURCE_INTENDED', action.sourcePath, 'IN_PROGRESS');

          fs.unlinkSync(srcAbs);
          executedSteps.push({
            action: 'DELETE_SOURCE',
            path: action.sourcePath,
            preHash: action.sourceSha256
          });

          wal.append('DELETE_SOURCE', action.sourcePath, 'SUCCESS');
        }
      }
    }

    // 10. 阶段 5: 事后物证与哈希核验
    const verificationDetails = [];
    for (const action of plan.fileActions) {
      if (action.action === 'MIGRATE_FILE') {
        const tgtAbs = path.resolve(repoRoot, action.targetPath);
        if (!fs.existsSync(tgtAbs)) {
          throw new Error(`Target file was not created: ${action.targetPath}`);
        }
        const currentSha = computeSha256(tgtAbs);
        if (currentSha !== action.expectedTargetSha256) {
          throw new Error(
            `Target hash mismatch for ${action.targetPath}: expected ${action.expectedTargetSha256}, got ${currentSha}`
          );
        }
        const srcAbs = path.resolve(repoRoot, action.sourcePath);
        if (fs.existsSync(srcAbs)) {
          throw new Error(`Source file was not unlinked: ${action.sourcePath}`);
        }
        verificationDetails.push({ path: action.targetPath, sha256: currentSha, status: 'VERIFIED' });
      } else if (action.action === 'REWRITE_INBOUND_REFERENCE' || action.action === 'UPDATE_ARTIFACTS_REGISTER') {
        const fileAbs = path.resolve(repoRoot, action.filePath);
        const currentSha = computeSha256(fileAbs);
        if (currentSha !== action.expectedSha256) {
          throw new Error(
            `Rewritten hash mismatch for ${action.filePath}: expected ${action.expectedSha256}, got ${currentSha}`
          );
        }
        verificationDetails.push({ path: action.filePath, sha256: currentSha, status: 'VERIFIED' });
      }
    }

    wal.append('COMMIT_TRANSACTION', repoRoot, 'SUCCESS', { verifiedFiles: verificationDetails.length });

    return {
      status: ExecutionStatus.SUCCESS,
      txId,
      backupDir: backupStore.backupDir,
      journalPath,
      verificationDetails,
      executedSteps
    };
  } catch (err) {
    // -------------------------------------------------------------
    // 执行失败: 触发应用层逆序补偿回滚 (B3 强化防覆写)
    // -------------------------------------------------------------
    wal.append('TRIGGER_ROLLBACK', repoRoot, 'INITIATED', { error: err.message });

    // B3 严格防覆写: 检查所有已触及文件的实时状态
    let preRollbackCollisionDetected = false;
    let collisionPath = null;
    let collisionReason = null;

    for (const step of executedSteps) {
      const fileAbs = path.resolve(repoRoot, step.path);

      if (step.action === 'DELETE_SOURCE') {
        // 源文件被删除后，若当前磁盘上又存在该文件，说明被外部重建！
        if (fs.existsSync(fileAbs)) {
          preRollbackCollisionDetected = true;
          collisionPath = step.path;
          collisionReason = 'Source file was externally recreated after deletion; rollback restoration prohibited.';
          break;
        }
      } else if (step.action === 'REWRITE_REF' || step.action === 'UPDATE_ARTIFACTS') {
        // 引用文件与登记册: 比较当前磁盘哈希与本事务写入后的 postHash
        if (!fs.existsSync(fileAbs)) {
          preRollbackCollisionDetected = true;
          collisionPath = step.path;
          collisionReason = 'File was externally deleted after rewrite; rollback restoration prohibited.';
          break;
        }
        const currentHash = computeSha256(fileAbs);
        if (currentHash !== step.postHash) {
          preRollbackCollisionDetected = true;
          collisionPath = step.path;
          collisionReason = `File was externally modified after rewrite (expected ${step.postHash}, found ${currentHash}); rollback overwrite prohibited.`;
          break;
        }
      } else if (step.action === 'CREATE_TARGET') {
        // 目标文件: 检查是否被外部篡改
        if (fs.existsSync(fileAbs)) {
          const currentHash = computeSha256(fileAbs);
          if (currentHash !== step.postHash) {
            preRollbackCollisionDetected = true;
            collisionPath = step.path;
            collisionReason = `Target file was externally modified after creation; rollback deletion prohibited.`;
            break;
          }
        }
      }
    }

    if (options.simulatePreRollbackCollision) {
      preRollbackCollisionDetected = true;
      collisionPath = options.simulatePreRollbackCollision;
      collisionReason = 'Simulated external collision before rollback.';
    }

    if (preRollbackCollisionDetected) {
      // 冲突挂起: 严禁覆盖外部新建/修改文件，保留部分完成现场
      wal.append('ROLLBACK_SUSPENDED', collisionPath, 'SUSPENDED', {
        reason: collisionReason
      });
      return {
        status: ExecutionStatus.SUSPENDED_ON_CONFLICT,
        conflictType: ConflictType.PRE_ROLLBACK_COLLISION,
        reason: `Pre-rollback collision detected at: ${collisionPath} (${collisionReason}). Execution paused and partial state preserved.`,
        txId,
        originalError: err.message,
        executedSteps
      };
    }

    // 无冲突时执行逆序物理补偿
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const step = executedSteps[i];
      const fileAbs = path.resolve(repoRoot, step.path);

      if (step.action === 'CREATE_TARGET') {
        if (fs.existsSync(fileAbs)) {
          fs.unlinkSync(fileAbs);
        }
      } else if (step.action === 'REWRITE_REF' || step.action === 'UPDATE_ARTIFACTS' || step.action === 'DELETE_SOURCE') {
        const snapshot = backupStore.getSnapshot(step.path);
        if (snapshot && snapshot.exists && snapshot.backupPath) {
          fs.copyFileSync(snapshot.backupPath, fileAbs);
        }
      }
    }

    wal.append('ROLLBACK_COMPLETED', repoRoot, 'COMPENSATION_SUCCEEDED');

    return {
      status: ExecutionStatus.COMPENSATION_SUCCEEDED,
      reason: `Execution failed (${err.message}). Compensating rollback completed successfully.`,
      txId,
      originalError: err.message
    };
  }
}
