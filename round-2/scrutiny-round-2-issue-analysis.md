# Scrutiny Round 2 - Issue Analysis

## Summary

Reviewed 5 blocking issues from scrutiny round 2 synthesis. All 5 are genuine defects with precise locations identified. Issues 2 and 3 can be grouped as they're both schema validation gaps in the same function.

---

## Issue 1: Python wrapper accepts all even codes, should only accept 0 and 2

**Status**: ✅ GENUINE DEFECT

**Location**: `scripts/fixtures/sample-py/run_mutmut.py:37-47`

**Current Code**:
```python
def normalize_exit_code(status):
    """mutmut 退出码 -> 包装器退出码。

    只有命中致命错误位（位 1，奇数退出码）才判失败并透传原值；
    干净跑完（0）与存活/超时/可疑位（偶数）一律归一化为 0。
    """
    if status == 0:
        return 0
    if status & 1:
        return status
    return 0
```

**Problem**: 
The wrapper normalizes ALL even exit codes to 0. According to mutmut's bit flags:
- Bit 1 (value 1) = fatal error
- Bit 2 (value 2) = survived mutants
- Bit 4 (value 4) = timeout mutants
- Bit 8 (value 8) = suspicious mutants

The approved fix contract (per synthesis description) permits normalization ONLY for exit codes 0 and 2 (survived mutants are expected output for the fixture). However, the current implementation also normalizes:
- Exit code 4 (timeout) → 0
- Exit code 6 (survived + timeout) → 0
- Exit code 8 (suspicious) → 0
- Exit code 10 (survived + suspicious) → 0
- Exit code 12 (timeout + suspicious) → 0
- Exit code 14 (survived + timeout + suspicious) → 0

These codes indicate timeout or suspicious results that should fail rather than be hidden.

**Fix**:
```python
def normalize_exit_code(status):
    """mutmut 退出码 -> 包装器退出码。

    按批准的修复契约，只有 0（干净跑完）与 2（存活变异体）
    归一化为 0（夜跑闭环的预期输入）；其他退出码透传。
    """
    if status in (0, 2):
        return 0
    return status
```

**Can be grouped**: No, standalone fix.

---

## Issue 2: E2E validators allow extra fields (no additionalProperties:false enforcement)

**Status**: ✅ GENUINE DEFECT

**Location**: `scripts/test_nightly_loop.mjs:434-449` (assertUnifiedReport) and `scripts/test_nightly_loop.mjs:456-491` (assertBaselineFile)

**Problem**: 
The format specifications explicitly require `additionalProperties: false`:

1. **Unified report** (`docs/formats/unified-mutation-report.md:67`):
   > "除本表字段外不得有其他顶层字段（schema `additionalProperties: false`）"
   
   The JSON schema at line 228 shows: `"additionalProperties": false`
   
   And for mutant objects (line 256): `"additionalProperties": false`

2. **Baseline file** (`docs/formats/mutation-baseline.md:55`):
   > "除本契约字段外不得有其他字段（schema `additionalProperties: false`）"
   
   The JSON schema at line 172 shows: `"additionalProperties": false`
   
   And for baseline object (line 187): `"additionalProperties": false`

**Current validation**: 
- `assertUnifiedReport` checks only `tool`, `timestamp`, `mutants`, `score` - accepts unknown fields
- `assertBaselineFile` checks only `version`, `updated`, `baseline.{score,killed,survived,total}` - accepts unknown fields
- `assertMutantObject` checks 8 required fields - accepts unknown fields
- Queue file validation (lines 573-581) checks only `version`, `file`, `tool`, `timestamp`, `mutants`, `issueNumber` - accepts unknown fields

**Fix**: Add Object.keys() validation to reject unknown properties in all five locations:

1. **assertUnifiedReport** (after line 444):
```javascript
const allowedTopLevel = new Set(['tool', 'timestamp', 'mutants', 'score']);
const actualKeys = Object.keys(data);
const unknownKeys = actualKeys.filter(k => !allowedTopLevel.has(k));
assertCase(
  unknownKeys.length === 0,
  `${filePath}: 不得有额外顶层字段（additionalProperties:false），发现：${unknownKeys.join(', ')}`
);
```

2. **assertMutantObject** (after line 427):
```javascript
const allowedMutantFields = new Set(['id', 'file', 'line', 'column', 'mutationType', 'original', 'mutated', 'status']);
const actualFields = Object.keys(mutant);
const unknownFields = actualFields.filter(f => !allowedMutantFields.has(f));
assertCase(
  unknownFields.length === 0,
  `${filePath}: mutant 不得有额外字段（additionalProperties:false），发现：${unknownFields.join(', ')}`
);
```

3. **assertBaselineFile** (after line 462):
```javascript
const allowedTopLevel = new Set(['version', 'updated', 'baseline']);
const actualKeys = Object.keys(data);
const unknownKeys = actualKeys.filter(k => !allowedTopLevel.has(k));
assertCase(
  unknownKeys.length === 0,
  `${filePath}: 不得有额外顶层字段（additionalProperties:false），发现：${unknownKeys.join(', ')}`
);
```

4. **assertBaselineFile baseline object** (after line 485):
```javascript
const allowedBaselineFields = new Set(['score', 'killed', 'survived', 'total']);
const actualFields = Object.keys(baseline);
const unknownFields = actualFields.filter(f => !allowedBaselineFields.has(f));
assertCase(
  unknownFields.length === 0,
  `${filePath}: baseline 不得有额外字段（additionalProperties:false），发现：${unknownFields.join(', ')}`
);
```

5. **Queue file validation** (after line 581):
```javascript
const allowedQueueFields = new Set(['version', 'file', 'tool', 'timestamp', 'mutants', 'issueNumber']);
const actualFields = Object.keys(queue);
const unknownFields = actualFields.filter(f => !allowedQueueFields.has(f));
assertCase(
  unknownFields.length === 0,
  `队列文件 ${queuePath}: 不得有额外字段（additionalProperties:false），发现：${unknownFields.join(', ')}`
);
```

**Can be grouped**: Yes, with Issue 3 (both are schema validation enhancements in test_nightly_loop.mjs).

---

## Issue 3: E2E baseline validation accepts >2 decimal places

**Status**: ✅ GENUINE DEFECT

**Location**: `scripts/test_nightly_loop.mjs:464-468`

**Current Code**:
```javascript
assertCase(
  typeof baseline.score === 'number' && Number.isFinite(baseline.score) &&
  baseline.score >= 0 && baseline.score <= 100,
  `${filePath}: baseline.score 应为 [0,100] 内的数字，实际 ${JSON.stringify(baseline.score)}`
);
```

**Problem**:
The baseline format specification (`docs/formats/mutation-baseline.md:92`) states:
> "StrykerJS 的报告界面与 clear-text 输出恒为两位小数（如 42.55），本契约与之对齐：`score` 最多 2 位小数。"

The current validation only checks the range [0, 100] but does NOT enforce the maximum of two decimal places. A score like `42.555` or `42.123456789` would incorrectly pass validation.

**Fix** (replace lines 464-468):
```javascript
assertCase(
  typeof baseline.score === 'number' && Number.isFinite(baseline.score) &&
  baseline.score >= 0 && baseline.score <= 100,
  `${filePath}: baseline.score 应为 [0,100] 内的数字，实际 ${JSON.stringify(baseline.score)}`
);
// 最多 2 位小数（docs/formats/mutation-baseline.md §4）
const decimalPlaces = (baseline.score.toString().split('.')[1] || '').length;
assertCase(
  decimalPlaces <= 2,
  `${filePath}: baseline.score 最多 2 位小数，实际 ${decimalPlaces} 位：${baseline.score}`
);
```

**Can be grouped**: Yes, with Issue 2 (both are schema validation enhancements in test_nightly_loop.mjs).

---

## Issue 4: Guide lists parse_mutmut_report.py but omits from copy command

**Status**: ✅ GENUINE DEFECT

**Location**: `docs/quality-gates/nightly-mutation-loop.md:231-236`

**Current Text** (lines 231-236):
```bash
# 工具脚本一并复制到目标项目 scripts/（runner 逐步调用它们）：
# TypeScript：parse-stryker-report.mjs、mutation-baseline.mjs、create-mutation-issues.mjs
# Python：parse_mutmut_report.py、mutation-baseline.mjs、create-mutation-issues.mjs
cp scripts/parse-stryker-report.mjs scripts/mutation-baseline.mjs \
   scripts/create-mutation-issues.mjs your-project/scripts/
```

**Problem**:
The comment explicitly lists `parse_mutmut_report.py` for Python projects, but the actual `cp` command only copies three `.mjs` files. The Python parser is required for the Python workflow (see lines 11, 189, 233, 1012, 1072).

Without this file, Python projects following the setup guide would fail at the parse step with "file not found" errors.

**Fix** (replace lines 234-236):
```bash
# TypeScript 项目只需 .mjs 工具
cp scripts/parse-stryker-report.mjs scripts/mutation-baseline.mjs \
   scripts/create-mutation-issues.mjs your-project/scripts/

# Python 项目还需 parse_mutmut_report.py
cp scripts/parse_mutmut_report.py scripts/mutation-baseline.mjs \
   scripts/create-mutation-issues.mjs your-project/scripts/
```

Or as a single command covering both languages:
```bash
cp scripts/parse-stryker-report.mjs scripts/parse_mutmut_report.py \
   scripts/mutation-baseline.mjs scripts/create-mutation-issues.mjs \
   your-project/scripts/
```

**Can be grouped**: Yes, with Issue 5 (both are documentation accuracy fixes in the same file).

---

## Issue 5: Guide lacks actual #37 reference

**Status**: ✅ GENUINE DEFECT

**Location**: `docs/quality-gates/nightly-mutation-loop.md:10-11` and `1011-1012`

**Current Text**:
```markdown
- `parse-stryker-report.mjs` - Stryker JSON 报告解析器（#37）
- `parse_mutmut_report.py` - mutmut 报告解析器（#37）
```

And in section 9:
```markdown
- [Stryker 报告解析器](../../scripts/parse-stryker-report.mjs) (#37) - 源码与 CLI 说明
- [mutmut 报告解析器](../../scripts/parse_mutmut_report.py) (#37) - 源码与 CLI 说明
```

**Problem**:
The text "(#37)" appears as literal text in parentheses, but there is NO actual link to issue #37 or the quality-rhythm reference mentioned in the approved cross-reference requirement. This is just placeholder text, not a semantic reference.

According to the synthesis: "The guide still labels parser links as the required #37 quality-rhythm reference and provides no actual #37 reference, so the approved cross-reference requirement remains unmet."

**Investigation**:
Looking at the context, #37 refers to the parser implementation ticket. The proper reference should be a link to the quality-rhythm document or the actual issue, not just the text "#37" in parentheses.

The existing Markdown links point to the source code files (which is correct), but the "#37" annotation is misleading because it suggests a semantic cross-reference that doesn't exist.

**Fix Option 1** (Remove misleading annotation):
```markdown
- `parse-stryker-report.mjs` - Stryker JSON 报告解析器
- `parse_mutmut_report.py` - mutmut 报告解析器
```

And in section 9:
```markdown
- [Stryker 报告解析器](../../scripts/parse-stryker-report.mjs) - 源码与 CLI 说明
- [mutmut 报告解析器](../../scripts/parse_mutmut_report.py) - 源码与 CLI 说明
```

**Fix Option 2** (Add actual quality-rhythm reference if one exists):
This requires identifying what #37 actually refers to and providing a proper link or cross-reference.

**Can be grouped**: Yes, with Issue 4 (both are documentation accuracy fixes in the same file).

---

## Grouping Recommendations

**Group A**: Schema validation enhancements in `scripts/test_nightly_loop.mjs`
- Issue 2: Add additionalProperties enforcement (5 locations)
- Issue 3: Add decimal places validation (1 location)
- **Rationale**: Both are data validation improvements in the same test file

**Group B**: Documentation accuracy fixes in `docs/quality-gates/nightly-mutation-loop.md`
- Issue 4: Add parse_mutmut_report.py to copy command
- Issue 5: Remove or fix misleading #37 annotation
- **Rationale**: Both are textual corrections in the same guide document

**Standalone**: 
- Issue 1: Python wrapper exit code logic fix in `scripts/fixtures/sample-py/run_mutmut.py`
- **Rationale**: Different file, different subsystem (fixture vs validator vs docs)

---

## Priority

All 5 issues are marked blocking in the synthesis. Suggested order:

1. **Issue 1** (Python wrapper) - Highest risk: can hide genuine failures
2. **Group A** (Issues 2+3) - High risk: validation gaps allow malformed data
3. **Group B** (Issues 4+5) - Medium risk: documentation errors cause setup failures

---

## Verification

After fixes are applied:
1. **Issue 1**: Add test cases for exit codes 4, 6, 8, 10, 12, 14 to verify they now fail instead of normalizing to 0
2. **Issues 2+3**: Add negative test cases with extra fields and >2 decimal places to verify rejection
3. **Issue 4**: Verify the copy command includes all 4 required files
4. **Issue 5**: Verify #37 annotation is either removed or replaced with actual reference
