/**
 * status_engine.js
 * 
 * Deterministic batch rollup evaluation and temporary ledger management
 * for /lazypack-harvest.
 * 
 * Complies with SPEC.md §5.1 (Per-Candidate Status) and §5.2 (8-Level Batch Rollup Ladder).
 * Zero external dependencies (Node.js standard library only).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

/**
 * Valid Per-Candidate Status Codes (SPEC §5.1)
 */
const CANDIDATE_STATUSES = Object.freeze([
  "CANDIDATE_PUBLISHED",
  "CANDIDATE_DRAFT",
  "CANDIDATE_REJECTED",
  "CANDIDATE_DUPLICATE_CONFIRMED",
  "CANDIDATE_DUPLICATE_SUSPECTED",
  "CANDIDATE_UNKNOWN",
  "CANDIDATE_SKIPPED"
]);

/**
 * Valid Batch Rollup Status Codes (SPEC §5.2)
 */
const BATCH_ROLLUP_STATUSES = Object.freeze([
  "NO_CANDIDATE",
  "RESULT_UNKNOWN",
  "PERSIST_FAILED",
  "PARTIAL_SUCCESS",
  "PUBLISHED_SUCCESS",
  "DUPLICATE_SUPPRESSED",
  "DEPENDENCY_BLOCKED",
  "DRAFT_ONLY"
]);

/**
 * Generate candidate fingerprint based on clause and abstract pain.
 * @param {string} clause - Suggested clause (e.g. "固定层 §4.1")
 * @param {string} abstractPain - Abstracted pain description
 * @returns {string} SHA-256 fingerprint prefix (16 hex chars)
 */
function generateCandidateFingerprint(clause, abstractPain) {
  const normClause = (clause || "").trim().toLowerCase();
  const normPain = (abstractPain || "").trim().toLowerCase();
  const hash = crypto.createHash("sha256")
    .update(`${normClause}::${normPain}`)
    .digest("hex");
  return hash.substring(0, 16);
}

/**
 * Evaluates the unique batch rollup status based on the 8-level priority ladder (SPEC §5.2).
 * 
 * Ladder:
 * 1. NO_CANDIDATE: candidates count is 0
 * 2. RESULT_UNKNOWN: at least one CANDIDATE_UNKNOWN
 * 3. PERSIST_FAILED: at least one candidate has local_persist_failed === true
 * 4. PARTIAL_SUCCESS: published >= 1 AND exists REJECTED / DRAFT / SKIPPED / SUSPECTED
 * 5. PUBLISHED_SUCCESS: published >= 1 AND rest are DUPLICATE_CONFIRMED (or none)
 * 6. DUPLICATE_SUPPRESSED: zero published, zero unknown, at least one CONFIRMED or SUSPECTED
 * 7. DEPENDENCY_BLOCKED: precheck blocked / missing label / offline / sanitization blocked
 * 8. DRAFT_ONLY: dependencies passed, zero published, zero unknown, zero duplicates, all DRAFT/REJECTED/SKIPPED
 * 
 * @param {Array<Object>} candidates - List of processed candidate objects
 * @param {Object} [precheckResult] - Optional precheck result
 * @returns {Object} Rollup evaluation result { batchStatus, duplicate_unconfirmed, reason, details }
 */
function evaluateBatchRollup(candidates, precheckResult = null) {
  // Precheck block prior to dispatch
  if (precheckResult && precheckResult.blocked) {
    return {
      batchStatus: "DEPENDENCY_BLOCKED",
      duplicate_unconfirmed: false,
      reason: precheckResult.reason || "Precheck dependency blocked prior to dispatch",
      ladder_step: 7
    };
  }

  // Step 1: Is candidate list empty?
  if (!candidates || candidates.length === 0) {
    return {
      batchStatus: "NO_CANDIDATE",
      duplicate_unconfirmed: false,
      reason: "No discipline friction or unwithdrawn proposal candidates identified",
      ladder_step: 1
    };
  }

  // Step 2: Does any candidate have CANDIDATE_UNKNOWN?
  const hasUnknown = candidates.some(c => c.status === "CANDIDATE_UNKNOWN");
  if (hasUnknown) {
    return {
      batchStatus: "RESULT_UNKNOWN",
      duplicate_unconfirmed: false,
      reason: "At least one candidate dispatch resulted in unknown status (timeout or 504)",
      ladder_step: 2
    };
  }

  // Step 3: Does any candidate have local_persist_failed === true?
  const hasPersistFailed = candidates.some(c => c.local_persist_failed === true);
  if (hasPersistFailed) {
    return {
      batchStatus: "PERSIST_FAILED",
      duplicate_unconfirmed: false,
      reason: "Remote creation succeeded but local state persistence failed",
      ladder_step: 3
    };
  }

  const published = candidates.filter(c => c.status === "CANDIDATE_PUBLISHED");
  const confirmed = candidates.filter(c => c.status === "CANDIDATE_DUPLICATE_CONFIRMED");
  const suspected = candidates.filter(c => c.status === "CANDIDATE_DUPLICATE_SUSPECTED");
  const rejected = candidates.filter(c => c.status === "CANDIDATE_REJECTED");
  const draft = candidates.filter(c => c.status === "CANDIDATE_DRAFT");
  const skipped = candidates.filter(c => c.status === "CANDIDATE_SKIPPED");

  // Step 4: Published >= 1 AND exists REJECTED / DRAFT / SKIPPED / SUSPECTED
  const hasIncomplete = (rejected.length + draft.length + skipped.length + suspected.length) > 0;
  if (published.length >= 1 && hasIncomplete) {
    return {
      batchStatus: "PARTIAL_SUCCESS",
      duplicate_unconfirmed: suspected.length > 0,
      reason: "At least one candidate published, but some candidates were not published (rejected, skipped, draft, or suspected duplicate)",
      ladder_step: 4
    };
  }

  // Step 5: Published >= 1 AND all others are DUPLICATE_CONFIRMED (or no others)
  if (published.length >= 1 && (published.length + confirmed.length === candidates.length)) {
    return {
      batchStatus: "PUBLISHED_SUCCESS",
      duplicate_unconfirmed: false,
      reason: "All candidates fully resolved (published or confirmed duplicates)",
      ladder_step: 5
    };
  }

  // Step 6: Zero published, zero unknown, and at least one CONFIRMED or SUSPECTED
  if (published.length === 0 && (confirmed.length + suspected.length > 0)) {
    const isUnconfirmed = suspected.length > 0;
    return {
      batchStatus: "DUPLICATE_SUPPRESSED",
      duplicate_unconfirmed: isUnconfirmed,
      reason: isUnconfirmed
        ? "Duplicates suspected or suppressed without new publication (contains unverified suspected duplicates)"
        : "All duplicates confirmed without new publication",
      ladder_step: 6
    };
  }

  // Step 7: Before dispatch dependency block
  const allDraftDueToDep = candidates.every(c => c.status === "CANDIDATE_DRAFT") &&
    candidates.some(c => c.blocked_by_dependency === true);
  if (allDraftDueToDep) {
    return {
      batchStatus: "DEPENDENCY_BLOCKED",
      duplicate_unconfirmed: false,
      reason: "All candidates blocked by dependency or validation failure before dispatch",
      ladder_step: 7
    };
  }

  // Step 8: Rest (dependencies passed; all DRAFT / REJECTED / SKIPPED)
  if (published.length === 0 && confirmed.length === 0 && suspected.length === 0) {
    return {
      batchStatus: "DRAFT_ONLY",
      duplicate_unconfirmed: false,
      reason: "Zero published, zero unknown, zero duplicates; all candidates remain draft, rejected, or skipped",
      ladder_step: 8
    };
  }

  // Defensive fallback
  return {
    batchStatus: "DRAFT_ONLY",
    duplicate_unconfirmed: false,
    reason: "Fallback evaluation (all incomplete without duplicates)",
    ladder_step: 8
  };
}

/**
 * Temporary Ledger Manager
 * Writes state files ONLY inside system temp directory.
 * Protects corrupted/unreadable ledgers against accidental overwrite.
 */
class TempLedger {
  constructor(baseTempDir = null) {
    const rootTemp = baseTempDir || path.join(os.tmpdir(), "lazypack-harvest");
    this.ledgerDir = rootTemp;
    this.ledgerFile = path.join(this.ledgerDir, "harvest_ledger.json");
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.ledgerDir)) {
        fs.mkdirSync(this.ledgerDir, { recursive: true });
      }
      this.initError = null;
    } catch (err) {
      this.initError = err.message;
    }
  }

  /**
   * Internal inspection of existing ledger file.
   * Strictly distinguishes non-existent, valid, and unreadable/corrupted files.
   */
  _checkExistingLedger() {
    if (this.initError) {
      return { exists: false, corrupted: true, error: `Directory initialization failed: ${this.initError}` };
    }
    if (!fs.existsSync(this.ledgerFile)) {
      return { exists: false, corrupted: false, error: null };
    }

    let raw;
    try {
      raw = fs.readFileSync(this.ledgerFile, "utf8");
    } catch (err) {
      return { exists: true, corrupted: true, error: `Read failed: ${err.message}` };
    }

    // Strip optional UTF-8 BOM
    if (raw.charCodeAt(0) === 0xfeff) {
      raw = raw.slice(1);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { exists: true, corrupted: true, error: `JSON parse failed: ${err.message}` };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { exists: true, corrupted: true, error: "Invalid ledger structure: root must be a JSON object" };
    }

    if (!parsed.runs || typeof parsed.runs !== "object" || Array.isArray(parsed.runs)) {
      return { exists: true, corrupted: true, error: "Invalid ledger structure: 'runs' field must be an object" };
    }

    if (!parsed.candidates || typeof parsed.candidates !== "object" || Array.isArray(parsed.candidates)) {
      return { exists: true, corrupted: true, error: "Invalid ledger structure: 'candidates' field must be an object" };
    }

    return { exists: true, corrupted: false, error: null, data: parsed };
  }

  /**
   * Loads ledger data.
   * If non-existent: returns empty structure with isNew: true.
   * If valid: returns ledger data.
   * If unreadable or corrupted: returns explicit error and corrupted: true; NEVER returns empty runs/candidates.
   */
  load() {
    this._ensureDir();
    const check = this._checkExistingLedger();
    if (!check.exists) {
      if (check.corrupted) {
        return { corrupted: true, error: check.error, runs: null, candidates: null };
      }
      return { runs: {}, candidates: {}, isNew: true, corrupted: false, error: null };
    }
    if (check.corrupted) {
      return { corrupted: true, error: check.error, runs: null, candidates: null };
    }
    return check.data;
  }

  /**
   * Saves ledger data safely.
   * Refuses to overwrite if existing file is corrupted or unreadable.
   */
  save(data) {
    try {
      this._ensureDir();
      if (this.initError) {
        return { success: false, error: this.initError };
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return { success: false, error: "Invalid ledger data: must be an object" };
      }

      const check = this._checkExistingLedger();
      if (check.corrupted) {
        return {
          success: false,
          error: `Corrupted ledger protection: existing ledger file is invalid or unreadable (${check.error}). Refusing to overwrite.`
        };
      }

      // Safe write: write to isolated temp file in ledgerDir then rename
      const tmpFile = path.join(
        this.ledgerDir,
        `.harvest_ledger.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
      );
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf8");
      try {
        fs.renameSync(tmpFile, this.ledgerFile);
      } catch (renameErr) {
        try {
          fs.copyFileSync(tmpFile, this.ledgerFile);
          fs.unlinkSync(tmpFile);
        } catch (copyErr) {
          try { fs.unlinkSync(tmpFile); } catch (e) {}
          return { success: false, error: `Failed to commit ledger file: ${renameErr.message}` };
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Initializes a run in the ledger.
   * Refuses to write if existing ledger is corrupted.
   */
  initRun(runId, metadata = {}) {
    const existing = this.load();
    if (existing.corrupted) {
      return {
        success: false,
        error: `Corrupted ledger protection: existing ledger file is invalid or unreadable (${existing.error}). Refusing to initialize run.`
      };
    }
    if (!existing.runs) {
      existing.runs = {};
    }
    if (!existing.candidates) {
      existing.candidates = {};
    }
    if (!existing.runs[runId]) {
      existing.runs[runId] = {
        runId,
        timestamp: new Date().toISOString(),
        candidates: [],
        ...metadata
      };
    }
    return this.save(existing);
  }

  /**
   * Records candidate execution state.
   * Refuses to write if existing ledger is corrupted.
   */
  recordCandidate(runId, candidate) {
    const existing = this.load();
    if (existing.corrupted) {
      return {
        success: false,
        error: `Corrupted ledger protection: existing ledger file is invalid or unreadable (${existing.error}). Refusing to record candidate.`
      };
    }
    if (!candidate || typeof candidate !== "object") {
      return { success: false, error: "Invalid candidate object" };
    }
    if (!existing.runs) {
      existing.runs = {};
    }
    if (!existing.candidates) {
      existing.candidates = {};
    }
    if (!existing.runs[runId]) {
      existing.runs[runId] = { runId, timestamp: new Date().toISOString(), candidates: [] };
    }
    existing.runs[runId].candidates.push(candidate);
    
    // Store in global candidate index by fingerprint
    if (candidate.fingerprint) {
      if (!existing.candidates[candidate.fingerprint]) {
        existing.candidates[candidate.fingerprint] = [];
      }
      existing.candidates[candidate.fingerprint].push({
        runId,
        timestamp: new Date().toISOString(),
        status: candidate.status,
        url: candidate.url || null,
        local_persist_failed: !!candidate.local_persist_failed
      });
    }
    return this.save(existing);
  }

  /**
   * Finds historical unknown records for a candidate fingerprint.
   */
  findHistoricalUnknown(fingerprint) {
    const data = this.load();
    if (data.corrupted || !data.candidates) {
      return null;
    }
    const history = data.candidates[fingerprint] || [];
    // Return latest entry if unknown
    const unknowns = history.filter(h => h.status === "CANDIDATE_UNKNOWN");
    return unknowns.length > 0 ? unknowns[unknowns.length - 1] : null;
  }

  /**
   * Gets run data by runId.
   */
  getRun(runId) {
    const data = this.load();
    if (data.corrupted || !data.runs) {
      return null;
    }
    return data.runs[runId] || null;
  }
}

module.exports = {
  CANDIDATE_STATUSES,
  BATCH_ROLLUP_STATUSES,
  generateCandidateFingerprint,
  evaluateBatchRollup,
  TempLedger
};
