#!/bin/sh
# lazypack:start block=pre-commit-hook src=DECISIONS.md@0.7.0 gen=__GEN__ input=__INPUT__ fp=__FP__
# __PRESET_PROVENANCE_LINE__
# -----------------------------------------------------------------------------
# lazypack-discipline 提交前质量门禁 (DECISIONS §6)
# -----------------------------------------------------------------------------

EXIT_CODE=0
FORMAT_RESULT=''
LINT_RESULT=''
TYPE_RESULT=''
TEST_RESULT=''

# Exact command strings shared by covered slots run once in this invocation.
reuse_gate_result() {
  for PREVIOUS_GATE in format lint type test; do
    case "$PREVIOUS_GATE" in
      format) PREVIOUS_CMD=${FORMAT_CMD-}; PREVIOUS_RESULT=$FORMAT_RESULT ;;
      lint) PREVIOUS_CMD=${LINT_CMD-}; PREVIOUS_RESULT=$LINT_RESULT ;;
      type) PREVIOUS_CMD=${TYPE_CMD-}; PREVIOUS_RESULT=$TYPE_RESULT ;;
      test) PREVIOUS_CMD=${TEST_CMD-}; PREVIOUS_RESULT=$TEST_RESULT ;;
    esac
    case "$PREVIOUS_RESULT" in
      passed|failed)
        if [ "$GATE_CMD" = "$PREVIOUS_CMD" ]; then
          echo "[lazypack] $GATE_NAME: reused aggregate result from $PREVIOUS_GATE ($PREVIOUS_RESULT)"
          if [ "$PREVIOUS_RESULT" = failed ]; then
            EXIT_CODE=1
          fi
          return 0
        fi
        ;;
    esac
  done
  return 1
}

remember_gate_result() {
  case "$GATE_NAME" in
    format) FORMAT_RESULT="$1" ;;
    lint) LINT_RESULT="$1" ;;
    type) TYPE_RESULT="$1" ;;
    test) TEST_RESULT="$1" ;;
  esac
}

run_gate() {
  GATE_NAME="$1"
  GATE_STATUS="$2"
  GATE_CMD="$3"

  case "$GATE_STATUS" in
    wired)
      # Reject empty or whitespace-only command (POSIX sh compliant)
      case "$GATE_CMD" in
        *[![:space:]]*)
          ;;
        *)
          echo "❌ [lazypack] $GATE_NAME: wired status but command is empty or whitespace only!" >&2
          EXIT_CODE=1
          return
          ;;
      esac
      if reuse_gate_result; then
        return
      fi
      echo "[lazypack] Running $GATE_NAME: $GATE_CMD"
      # Execute command in an isolated subshell to prevent exit 0 bypass or variable leakage
      if ! ( eval "$GATE_CMD" ); then
        echo "❌ [lazypack] $GATE_NAME check failed!" >&2
        EXIT_CODE=1
        remember_gate_result failed
      else
        echo "✅ [lazypack] $GATE_NAME check passed."
        remember_gate_result passed
      fi
      ;;
    missing)
      echo "⚠️ [lazypack] $GATE_NAME: skipped (unwired / tool missing)"
      ;;
    n/a)
      echo "ℹ️ [lazypack] $GATE_NAME: skipped (not applicable for project)"
      ;;
    install-failed)
      echo "❌ [lazypack] $GATE_NAME: blocked (dependency installation failed)" >&2
      EXIT_CODE=1
      ;;
    *)
      echo "❌ [lazypack] $GATE_NAME: invalid status ($GATE_STATUS), failing closed." >&2
      EXIT_CODE=1
      ;;
  esac
}

# Gate 1: Format
FORMAT_STATUS='__FORMAT_STATUS__'
FORMAT_CMD='__FORMAT_CMD__'
run_gate "format" "$FORMAT_STATUS" "$FORMAT_CMD"

# Gate 2: Lint
LINT_STATUS='__LINT_STATUS__'
LINT_CMD='__LINT_CMD__'
run_gate "lint" "$LINT_STATUS" "$LINT_CMD"

# Gate 3: Type
TYPE_STATUS='__TYPE_STATUS__'
TYPE_CMD='__TYPE_CMD__'
run_gate "type" "$TYPE_STATUS" "$TYPE_CMD"

# Gate 4: Test
TEST_STATUS='__TEST_STATUS__'
TEST_CMD='__TEST_CMD__'
run_gate "test" "$TEST_STATUS" "$TEST_CMD"

if [ $EXIT_CODE -ne 0 ]; then
  echo "🚫 [lazypack] Pre-commit quality gates failed. Commit aborted." >&2
  exit $EXIT_CODE
fi

exit 0
# lazypack:end block=pre-commit-hook
