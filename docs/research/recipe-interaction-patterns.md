# Recipe Interaction Patterns Research

**Research Date**: 2024
**Sources**: 
- `skills/lazypack-setup/presets/python-uv-ruff.md` (v0.1.0)
- `skills/lazypack-setup/presets/ts-biome-vitest.md` (v0.1.0)

---

## 1. When Recipes Ask Users Questions

### Python Preset
- **Timing**: Questions occur during the interactive adoption phase, after initial detection and recommendation
- **What's Asked**: User confirms whether to adopt each missing gating tool (format, lint, type, test) individually
- **Pattern**: "按项补缺" (per-item supplementation) - only asks about tools that are missing, never about tools already present

### TypeScript Preset
- **Timing**: Same pattern - questions occur during interactive adoption phase after detection
- **What's Asked**: 
  - User confirms adoption of missing gating tools
  - For new/empty repositories: explicitly asks if user wants to initialize a TypeScript project (Priority 6 branch)
- **Pattern**: Same "按项补缺" approach, with additional explicit language selection for new repos

### Common Pattern
**Established Rule**: Both presets follow strict "ask before install" discipline:
- Detection phase is read-only
- Recommendations are presented with explicit user confirmation required
- Only confirmed tools proceed to installation
- Never assumes or auto-installs without consent

---

## 2. How Recipes Handle Optional Components

### Python Preset
- **GitHub Actions workflows**: Not mentioned in the preset itself (likely handled at skill level)
- **Optional tools beyond the four gates**: Not covered in this preset (focused on format/lint/type/test only)
- **Tool-specific configs**: Explicitly refuses to create them (`ruff.toml`, `pytest.ini`) - zero config write principle

### TypeScript Preset
- **MCP Server support** (§5.4): Fully optional capability
  - Only added when "工程规划为 MCP 服务提供者"
  - Brings additional deps: `@modelcontextprotocol/server@2.0.0`, `zod@^4.2.0`
  - Has separate production consumption verification
- **Tool-specific configs**: Same zero config write principle (`biome.json`, `vitest.config.ts` not created)

### Common Pattern
**Established Rule**: Optional components use explicit opt-in:
- Never bundle optional features with required gates
- Optional features have clear capability boundaries documented
- Zero external tool config write policy is universal (tool-or-user ownership)

---

## 3. How Recipes Check Preconditions

### Python Preset - Priority Matrix (§2)

| Priority | Condition | Branch | Behavior |
|----------|-----------|--------|----------|
| 1 | Non-Python manifests exist | Multi-language | 100% preserve other language gates; only evaluate Python portion |
| 2 | Non-uv manager detected | `alternative-manager` | Preserve existing commands; output manual install guidance; **never auto-migrate** |
| 3 | `pyproject.toml` + `uv` in PATH | **Full support** | Offer complete recipe |
| 4 | `pyproject.toml` but no `uv` | `uv-binary-missing` | Report missing; prompt manual install; preserve existing commands |
| 5 | Legacy layout (setup.py, requirements.txt) | `unsupported-legacy-layout` | Preserve existing gates; output manual guidance; no restructure |
| 6 | No Python manifests | `uninitialized-python-project` | Exit this recipe; **general setup continues** |

### TypeScript Preset - Priority Matrix (§2)

| Priority | Condition | Branch | Behavior |
|----------|-----------|--------|----------|
| 1 | Non-TS/JS manifests exist | Multi-language | 100% preserve other language gates; only evaluate TS/JS portion |
| 2 | Non-pnpm manager detected | `alternative-manager` | Preserve existing commands; output manual guidance; **never auto-migrate** |
| 3 | `package.json` + `pnpm` in PATH + TS signals | **Full support** | Offer complete recipe |
| 4 | `package.json` + TS signals but no `pnpm` | `pnpm-binary-missing` | Report missing; prompt manual install; preserve existing |
| 5 | Plain JS without `tsconfig.json` | `unsupported-legacy-layout` | Preserve existing gates; output manual guidance; no restructure |
| 6 | Empty directory **and user explicitly chose TS** | `new-ts-project` | Initialize with minimal scaffold |
| Unmatched | No TS manifest and user didn't choose TS | `uninitialized-ts-project` | Exit this recipe; **general setup continues** |

### Common Pattern
**Established Rules**:
1. **Multi-language priority**: Always check for other languages first; never downgrade non-target language gates
2. **Alternative package manager respect**: Detect lock files and config patterns; preserve existing tooling; never force migration
3. **Binary availability check**: Verify tool in PATH before offering full recipe
4. **Graceful degradation**: Missing preconditions trigger limited branches with manual guidance, not errors
5. **Recipe exit ≠ setup abort**: Failing recipe preconditions exits the recipe but allows general setup to continue

---

## 4. How Recipes Handle Existing Files

### Python Preset

**Command Preservation** (§3.2, §4.2):
- Existing valid gating commands are **100% preserved verbatim**
- Never replace existing commands with preset literals
- Existing commands marked as `source=existing`, never downgraded
- If baseline safety unknown, mark as `not-run` rather than modify

**Installation Impact** (§4.3):
- Installation failure only affects newly adopted tools (`install-failed`)
- Pre-existing tools (`source=existing`) remain `wired:existing:pre-existing`
- No claimed automatic rollback (package managers aren't transactional)
- Disk residue reported honestly for manual cleanup

**Config Files**:
- Zero write policy: never creates `ruff.toml`, `pytest.ini`, etc.
- User or tool owns all external config files

### TypeScript Preset

**Command Preservation** (§3.2, §4.3):
- Same 100% preservation of existing commands
- Same `source=existing` marking and no downgrade
- Same `not-run` marking for unknown safety

**Manifest Handling** (§5.2, Priority 6):
- Existing `package.json`: Per-item supplementation with overall confirmation
- Existing fields/deps/scripts: **100% preserved**
- Field conflicts trigger `PAUSE` for manual resolution
- Parent workspace: **never overwrite or tamper**

**Config Files**:
- Same zero write policy: no `biome.json`, `vitest.config.ts`
- Relies on CLI args and dual tsconfig mechanism

### Common Pattern
**Established Rules**:
1. **Existing command sanctity**: Never modify, replace, or remove existing gating commands
2. **Source attribution**: Clear `existing` vs `preset` provenance tracking
3. **Non-transactional honesty**: Installation failures acknowledged, residue reported, no false rollback claims
4. **Per-item supplementation**: Only add missing pieces, never wholesale replacement
5. **Conflict escalation**: Unknown conflicts stop automation and defer to human judgment

---

## 5. Post-Installation Guidance

### Python Preset

**Callable Verification** (§4.4):
- After install command returns 0, must verify each tool individually:
  - `uv run --no-sync ruff --version`
  - `uv run --no-sync ty --version`
  - `uv run --no-sync pytest --version`
- Only mark `wired` after callable verification passes
- Callable failure → `install-failed` (distinct from code quality check failure)

**Zero Test Handling** (§5.1):
- pytest ExitCode 5 (no tests collected) is honestly reported
- Hook remains `wired`, result shows `failed (ExitCode 5: no tests collected)`
- Never mask as green, never change state to `n/a`

**Authorized Cache Writes** (§5.2):
- Explicitly authorizes: `.ruff_cache/`, `.pytest_cache/`, `**/__pycache__/*.pyc`
- Test side effects acknowledged but not blanket-authorized
- Unknown test environments can mark test as `not-run`

### TypeScript Preset

**Callable Verification** (§4.4):
- Same pattern - verify after install:
  - `pnpm exec biome --version`
  - `pnpm exec tsc --version`
  - `pnpm exec vitest --version`
- Same `wired` vs `install-failed` distinction

**Zero Test Handling** (§5.1):
- Vitest ExitCode 1 (no test files found) honestly reported
- Hook remains `wired`, result shows `failed (ExitCode 1: no test files found)`
- Additional `not-ready` supplementary note (not a formal hook state)
- Never mask as green, never change to `n/a`

**Self-Install Protection** (§4.2):
- Creates `pnpm-workspace.yaml` with `verifyDepsBeforeRun: error`
- Prevents silent network installs during pre-commit hooks
- Forces lockfile sync check before running scripts
- **Not a monorepo authorization** - only dependency integrity enforcement

**New Repo Scaffolding** (§5.2):
- Minimal `package.json` with exact version pins
- Dual tsconfig (base + build) for test file exclusion
- CLI packaging rules: shebang, explicit `.js` extensions, `files: ["dist"]`
- Optional MCP server capability with separate verification

### Common Pattern
**Established Rules**:
1. **Two-phase verification**: Install success + callable verification before marking `wired`
2. **Honest failure reporting**: Zero tests/files reported as failures with diagnostic details, never masked
3. **Separate failure domains**: Installation failure ≠ code quality failure
4. **Authorized boundaries**: Explicit list of allowed cache/build artifacts
5. **Protection mechanisms**: Prevent unwanted side effects (self-install, test pollution)
6. **Production verification**: For distributable packages, verify from tarball in isolated environment

---

## 6. Provenance and Lifecycle Management

### Exit/Reset Protection (§6.2 in both)

Both presets implement identical strict lifecycle pre-checks:

**Fingerprint Verification**:
- Read `.githooks/pre-commit` managed block and compute `current_fp`
- Compare against header fingerprint

**Drift/Conflict Detection**:
- `[BROKEN]`: Marker corruption
- `[DRIFT]`: User manually modified commands without updating provenance (`current_fp !== header.fp`)
- `[CONFLICT]`: Version mismatch or unrecognized command literal

**Automatic Exit Conditions** - ALL must be true:
1. `current_fp === header.fp` (no drift)
2. Source is valid and safe exit can be determined
3. Command literals strictly match current recipe recommendation

**When Auto-Exit is Blocked**:
- **Immediately stop** automatic exit branch
- Preserve existing commands, provenance line, and preset input fields
- Show 2-way diff to user for manual resolution
- **Never auto-delete provenance while leaving orphaned commands**

**Safe Cleanup Scope**:
- Only reset slots with `source=preset` AND matching command literals to `missing`
- Remove `# lazypack:preset` provenance line from block header
- Remove preset fields (`preset`, `presetSrc`, `provenance`) from input
- **Recalculate hook block `fp` and `input`** after changes
- `source=existing` slots and all out-of-block content **100% preserved**

**File Deletion Triple Condition** - ALL must be true:
1. Hook file was 100% created by setup (provable ownership)
2. Zero user content outside managed block
3. Zero `existing` or other preserved slots after cleanup (all slots `missing` or `n/a`)

**Mixed Hook Protection**:
- If ANY `source=existing` slots remain, **never physically delete file**
- Only clean preset slots and provenance, keep existing commands and executable permission

**Post-Exit Behavior**:
- Other discipline docs may still update via normal decision tree
- Residual tools in environment don't imply re-acceptance
- Re-running setup treats residual tools as unwired environment tools, requires explicit re-adoption

### Common Pattern
**Established Rules**:
1. **Drift detection before any automated change**: Fingerprint validation is mandatory
2. **Conservative exit policy**: When in doubt, stop and show diff rather than auto-delete
3. **Provenance-command coupling**: Never remove provenance marker without removing associated commands
4. **Ownership proof required**: File deletion requires triple-condition proof of safety
5. **Mixed content protection**: Any user content (existing slots or out-of-block code) prevents file deletion
6. **Re-adoption requires consent**: Past adoption doesn't imply future adoption

---

## 7. Quality Check Rhythm (§7 in both)

Both presets define identical three-tier rhythm:

| Timing | Content | Time Budget | Handler |
|--------|---------|-------------|---------|
| Pre-commit (local) | Unit tests + lint | Seconds | Developer fixes locally |
| PR / CI | Coverage threshold + incremental mutation (changed files only) | ≤15 min | CI blocks PR merge |
| Nightly | Full mutation + heavy static analysis | Unlimited | Morning standup handles failures |

**Design Principles** (identical):
- Everything that runs during work hours must be fast
- Slow checks are nightly-only
- Every tier has clear failure owner
- Incremental mutation for PR/CI, full mutation for nightly

**Tool Examples**:
- Python: `pytest --cov`, `mutmut run`, `radon cc -a`
- TypeScript: `vitest run --coverage`, `stryker run`, `dependency-cruiser`

### Common Pattern
**Established Rules**:
1. **Three-tier rhythm**: Local (seconds) → CI (≤15 min) → Nightly (unlimited)
2. **Time budget discipline**: CI must stay under 15 minutes; move slow checks to nightly
3. **Incremental vs full**: CI runs incremental mutation on changed files, nightly runs full mutation
4. **Clear ownership**: Each tier has designated failure handler
5. **New tools are optional**: Mutation testing and heavy analysis are recommended candidates, not baseline requirements

---

## Summary: Core Interaction Patterns

### Detection Phase
- Read-only exploration
- Multi-language aware with strict priority
- Alternative package manager respect
- Graceful degradation when preconditions fail

### User Interaction
- Explicit confirmation for each missing tool
- Per-item supplementation (never wholesale replacement)
- Clear separation of required vs optional features
- New repo initialization requires explicit language selection

### Installation
- Batch install with deduplication
- Two-phase verification (exit code + callable check)
- Honest non-transactional failure reporting
- Unified failure attribution for batch operations

### File Handling
- 100% preservation of existing commands
- Zero external tool config writes
- Clear source provenance tracking
- Conflict escalation to human judgment

### Lifecycle Management
- Fingerprint-based drift detection
- Conservative auto-exit with triple-condition safety
- Mixed content protection
- Provenance-command coupling

### Post-Installation
- Authorized cache boundaries
- Honest zero-test failure reporting
- Protection mechanisms (self-install, build pollution)
- Three-tier quality check rhythm with clear time budgets
