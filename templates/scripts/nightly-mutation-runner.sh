#!/usr/bin/env bash
# =============================================================================
# 夜跑变异测试闭环本地包装脚本（cron / systemd timer 触发面）
# =============================================================================
# 作用：把夜跑闭环四步串成一条命令——运行变异测试、解析存活变异体为统一
#       报告、baseline 只涨不跌检查、按文件分组创建补测 issue（人读
#       GitHub issue + agent 队列 JSON）。全程写带时间戳的日志文件并自动
#       清理过期日志；任何一步失败立即退出，退出码沿用失败工具的退出码
#       （baseline 回归为门槛失败，退出码 2）。
#
# 使用方式（复制到目标项目后使用；本仓自身不运行该闭环）：
#   1. 把本文件复制为目标项目的 scripts/nightly-mutation-runner.sh 并
#      chmod +x；
#   2. 把本仓 scripts/ 的工具脚本一并复制到目标项目 scripts/：
#      - TypeScript：parse-stryker-report.mjs、mutation-baseline.mjs、
#        create-mutation-issues.mjs；
#      - Python：parse_mutmut_report.py、mutation-baseline.mjs、
#        create-mutation-issues.mjs；
#   3. gh CLI 认证（gh auth login 的持久凭据，或导出 GH_TOKEN）；未认证时
#      先用 --dry-run 验证链路（零 gh 调用）；
#   4. 手动跑通后再挂定时：crontab 示例与 systemd service/timer 模板见
#      本仓 templates/config/。
#
# 用法：
#   scripts/nightly-mutation-runner.sh [选项]
#
# 选项：
#   --lang ts|py        变异测试工具链：ts=Stryker，py=mutmut（默认 ts）
#   --project-dir DIR   目标项目根（默认：本脚本所在目录的上一级，即脚本
#                       位于 <项目>/scripts/ 时的项目根）
#   --log-dir DIR       日志目录（默认环境变量 MUTATION_LOG_DIR，再默认
#                       /tmp/nightly-mutation）
#   --log-keep DAYS     日志保留天数，到期自动清理（默认 14）
#   --dry-run           issue 创建走 --dry-run：零 gh 调用，只写
#                       .mutation-queue/ 队列文件与 body 预览
#   -h, --help          显示本帮助并退出
#
# 流程与前置条件（与 templates/.github/workflows/ 同一口径）：
#   步骤 1  运行变异测试   ts: npx stryker run（要求 reporters 含 "json"，
#                          建议不配 thresholds.break，门槛由 baseline 承担）
#                          py: mutmut run（固定 2.x；存活变异体导致的非零
#                          退出属预期输入，不视为失败，真实崩溃由步骤 2 拦截）
#   步骤 2  解析存活变异体 ts: parse-stryker-report.mjs 读取
#                          reports/mutation/mutation.json
#                          py: 先 mutmut show all 捕获 diff，再由
#                          parse_mutmut_report.py 读 .mutmut-cache；
#                          两者的统一报告落项目根 unified-mutation-report.json
#   步骤 3  baseline 检查  ts: 读原生 Stryker 报告，首次 init、之后 check
#                          py: 需项目自备 mutmut results-export JSON
#                          （mutmut-results-export.json；baseline 工具不读
#                          .mutmut-cache，缺口见
#                          docs/research/vscode-scheduled-tasks.md §7.1），
#                          缺文件时跳过并记 WARN，其余环节照常
#   步骤 4  创建补测 issue gh CLI；存在 .equivalent-mutants.json 自动豁免
#                          过滤；与 open 同名 issue 去重
#   首次运行自动 init 基线；.mutation-baseline.json 按契约提交进版本库
#   （否则每轮重 init，棘轮失效）。
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ----------------------------- 默认值 ---------------------------------------
lang="ts"
project_dir=""
log_dir="${MUTATION_LOG_DIR:-/tmp/nightly-mutation}"
log_keep_days="14"
dry_run="false"
LOG_FILE=""

# ----------------------------- 通用函数 -------------------------------------

usage() {
  cat <<'EOF'
夜跑变异测试闭环本地包装脚本（cron / systemd timer 触发面）

用法：
  scripts/nightly-mutation-runner.sh [选项]

选项：
  --lang ts|py        变异测试工具链：ts=Stryker，py=mutmut（默认 ts）
  --project-dir DIR   目标项目根（默认：脚本所在目录的上一级）
  --log-dir DIR       日志目录（默认 $MUTATION_LOG_DIR 或 /tmp/nightly-mutation）
  --log-keep DAYS     日志保留天数，到期自动清理（默认 14）
  --dry-run           issue 创建走 --dry-run（零 gh 调用，只写队列与预览）
  -h, --help          显示本帮助并退出

流程：运行变异测试 -> 解析存活变异体 -> baseline 检查 -> 创建补测 issue。
任一步失败立即退出，退出码沿用失败工具（baseline 回归=2，用法错误=1）。
EOF
}

# 统一日志行：ISO-8601 本地时间 + 级别 + 正文（stdout/stderr 已整体经 tee
# 重定向，控制台与日志文件双写）
log() {
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$1" "$2"
}

die() {
  log "ERROR" "$1"
  exit "${2:-1}"
}

# 包装每个流水线步骤：失败即记日志并沿用工具退出码退出
run_step() {
  local step_name="$1"
  shift
  log "INFO" "==> ${step_name}"
  if "$@"; then
    log "INFO" "完成：${step_name}"
  else
    local rc=$?
    log "ERROR" "步骤失败（退出码 ${rc}）：${step_name}"
    log "ERROR" "完整输出见日志：${LOG_FILE}"
    exit "$rc"
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "缺少依赖命令：$1（${2:-请先安装并确保在 PATH 中}）"
  fi
}

# ----------------------------- 参数解析 -------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --lang)
      [ $# -ge 2 ] || die "参数 $1 缺少值"
      lang="$2"
      shift 2
      ;;
    --project-dir)
      [ $# -ge 2 ] || die "参数 $1 缺少值"
      project_dir="$2"
      shift 2
      ;;
    --log-dir)
      [ $# -ge 2 ] || die "参数 $1 缺少值"
      log_dir="$2"
      shift 2
      ;;
    --log-keep)
      [ $# -ge 2 ] || die "参数 $1 缺少值"
      log_keep_days="$2"
      shift 2
      ;;
    --dry-run)
      dry_run="true"
      shift
      ;;
    --*)
      die "未知参数：$1（--help 查看用法）"
      ;;
    *)
      die "意外参数：$1（本脚本不接受位置参数，--help 查看用法）"
      ;;
  esac
done

case "$lang" in
  ts|py) ;;
  *) die "--lang 只接受 ts 或 py（收到：${lang}）" ;;
esac

case "$log_keep_days" in
  ''|*[!0-9]*) die "--log-keep 需要非负整数（收到：${log_keep_days}）" ;;
esac

[ -n "$project_dir" ] || project_dir="$(dirname "$SCRIPT_DIR")"
if [ ! -d "$project_dir" ]; then
  die "项目目录不存在：${project_dir}"
fi
if [ ! -d "${project_dir}/scripts" ]; then
  die "项目目录缺少 scripts/ 子目录（工具脚本应随迁到该处）：${project_dir}/scripts"
fi

# ----------------------------- 日志管理 -------------------------------------

mkdir -p "$log_dir"
LOG_FILE="${log_dir}/nightly-mutation-$(date '+%Y%m%d-%H%M%S').log"
# 控制台与日志文件双写（stdout/stderr 整体经 tee 重定向），cron 下也不丢输出
exec > >(tee -a "$LOG_FILE") 2>&1

# 日志清理：删除超过保留期的旧日志，避免日志目录无限增长
# （-mtime +N 匹配修改时间早于约 N 天的文件，本轮新建日志不受影响）
find "$log_dir" -maxdepth 1 -type f -name 'nightly-mutation-*.log' -mtime +"$log_keep_days" -delete

# 未包裹步骤的命令（cd、mkdir、find 等）失败时兜底报错
trap 'rc=$?; log "ERROR" "命令在第 ${LINENO} 行失败（退出码 ${rc}）；日志：${LOG_FILE}"; exit "$rc"' ERR

log "INFO" "夜跑变异测试闭环开始：lang=${lang} project_dir=${project_dir}"
log "INFO" "日志文件：${LOG_FILE}（保留 ${log_keep_days} 天）"

cd "$project_dir"

# ----------------------------- 依赖检查 -------------------------------------

require_cmd node "Node.js（解析器、baseline、issue 创建工具都是 Node 程序）"
if [ "$dry_run" = "false" ]; then
  require_cmd gh "GitHub CLI（issue 创建用；gh auth login 或设置 GH_TOKEN）"
  if [ -z "${GH_TOKEN:-}" ] && ! gh auth status >/dev/null 2>&1; then
    die "gh CLI 未认证：先 gh auth login，或在 cron/systemd 环境导出 GH_TOKEN"
  fi
fi

# ----------------------------- 流水线步骤 -----------------------------------

run_ts_pipeline() {
  require_cmd npx "npm 随 Node.js 安装"
  # 先确认 Stryker 已随项目本地安装，避免 npx 在无人值守环境里挂起等网络
  # 安装（cron/定时器里没有交互输入）
  if [ ! -x node_modules/.bin/stryker ]; then
    die "未找到本地 Stryker（node_modules/.bin/stryker）：请在项目里安装（npm install --save-dev @stryker-mutator/core）"
  fi

  # 步骤 1：全量变异测试（原生 JSON 报告默认落 reports/mutation/mutation.json）
  run_step "运行变异测试（npx stryker run）" npx stryker run

  # 步骤 2：解析存活变异体为统一报告（落项目根；--output 不创建父目录）
  run_step "解析存活变异体（parse-stryker-report.mjs）" \
    node scripts/parse-stryker-report.mjs \
    --input reports/mutation/mutation.json \
    --output unified-mutation-report.json

  # 步骤 3：baseline 只涨不跌检查（读原生 Stryker 报告；回归=退出码 2）
  if [ -f .mutation-baseline.json ]; then
    run_step "检查 baseline（check；回归=失败）" \
      node scripts/mutation-baseline.mjs check \
      --input reports/mutation/mutation.json \
      --lang ts
  else
    run_step "初始化 baseline（首次运行）" \
      node scripts/mutation-baseline.mjs init \
      --input reports/mutation/mutation.json \
      --lang ts
    log "WARN" "已生成 .mutation-baseline.json，请提交进版本库（否则每轮重 init，棘轮失效）"
  fi
}

run_py_pipeline() {
  local python_bin
  require_cmd mutmut "mutmut 2.x（pip install \"mutmut<3\"；3.x 不再写 .mutmut-cache）"
  if command -v python3 >/dev/null 2>&1; then
    python_bin="python3"
  elif command -v python >/dev/null 2>&1; then
    python_bin="python"
  else
    die "缺少依赖命令：python3（解析器 parse_mutmut_report.py 要求 Python 3.8+）"
  fi

  # 步骤 1：全量变异测试。mutmut 在存在存活/可疑变异体时以非零码退出，
  # 而这正是夜跑闭环要处理的输入，不视为失败；测试套件真实崩溃由步骤 2
  # 的解析失败拦截（与 GitHub Actions 模板 continue-on-error 同一口径）。
  log "INFO" "==> 运行变异测试（mutmut run；存活变异体的非零退出属预期）"
  if ! mutmut run; then
    log "WARN" "mutmut run 非零退出（存活变异体的预期行为；若测试套件崩溃，下一步解析会失败）"
  fi

  # 步骤 2：先捕获 mutmut show 全量 diff（缓存不含替换片段，存活条目必须
  # 配 diff），再把 .mutmut-cache 解析为统一报告（落项目根）
  log "INFO" "==> 捕获 mutmut show 全量输出（.mutmut-show-all.txt）"
  if ! mutmut show all > .mutmut-show-all.txt; then
    log "ERROR" "mutmut show all 失败（无法为存活变异体配 diff）；日志：${LOG_FILE}"
    exit 1
  fi
  run_step "解析存活变异体（parse_mutmut_report.py）" \
    "$python_bin" scripts/parse_mutmut_report.py \
    --input .mutmut-cache \
    --show .mutmut-show-all.txt \
    --output unified-mutation-report.json

  # 步骤 3：baseline 只涨不跌检查（可选）。baseline 工具不读 .mutmut-cache，
  # 需项目自备 mutmut results-export JSON；缺文件时跳过并如实记日志。
  if [ -f mutmut-results-export.json ]; then
    if [ -f .mutation-baseline.json ]; then
      run_step "检查 baseline（check；回归=失败）" \
        node scripts/mutation-baseline.mjs check \
        --input mutmut-results-export.json \
        --lang py
    else
      run_step "初始化 baseline（首次运行）" \
        node scripts/mutation-baseline.mjs init \
        --input mutmut-results-export.json \
        --lang py
      log "WARN" "已生成 .mutation-baseline.json，请提交进版本库（否则每轮重 init，棘轮失效）"
    fi
  else
    log "WARN" "跳过 baseline 步骤：未找到 mutmut-results-export.json（baseline 工具不读 .mutmut-cache，见 docs/research/vscode-scheduled-tasks.md §7.1）"
  fi
}

run_issue_creation() {
  # 步骤 4：按文件分组创建补测 issue + agent 队列 JSON（与 open 同名 issue
  # 去重；存在 .equivalent-mutants.json 自动应用豁免过滤）
  local -a issue_cmd
  issue_cmd=(node scripts/create-mutation-issues.mjs --input unified-mutation-report.json)
  if [ -f .equivalent-mutants.json ]; then
    issue_cmd+=(--exemptions .equivalent-mutants.json)
  fi
  if [ "$dry_run" = "true" ]; then
    issue_cmd+=(--dry-run)
    log "INFO" "dry-run 模式：不调用 gh，只写 .mutation-queue/ 队列文件与 body 预览"
  fi
  run_step "创建补测 issue（create-mutation-issues.mjs）" "${issue_cmd[@]}"
}

# ----------------------------- 主流程 ---------------------------------------

if [ "$lang" = "ts" ]; then
  run_ts_pipeline
else
  run_py_pipeline
fi
run_issue_creation

log "INFO" "夜跑闭环完成：统一报告 unified-mutation-report.json；agent 队列 .mutation-queue/；日志 ${LOG_FILE}"
