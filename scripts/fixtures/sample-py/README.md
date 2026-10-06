# sample-py —— 变异测试夹具（Python / mutmut 2.x）

夜跑变异测试闭环的**故意欠测试** Python 夹具。它是一个能独立安装运行的微型项目：
代码里有刻意植入的边界 bug，测试只覆盖部分路径，运行 mutmut 会稳定产出**存活变异体**
（surviving mutants），供下游解析、基线检查和补测 issue 流程做端到端验证。

运行手册见 [../../../docs/quality-gates/mutation-testing.md](../../../docs/quality-gates/mutation-testing.md)；
闭环的定时触发配置模板见 [../../../templates/.github/workflows/nightly-mutation-py.yml](../../../templates/.github/workflows/nightly-mutation-py.yml)。

## 目录结构

```
sample-py/
├── pyproject.toml        # 打包元数据（setuptools, src 布局）+ [dev] 依赖 + pytest 配置
├── requirements.txt      # 与 [dev] extras 同源的 pip 安装清单（py workflow 模板步骤 4 用）
├── run_mutmut.py         # mutmut 退出码归一化包装器（存活变异体位不再是「错误」）
├── setup.cfg             # [mutmut] 段：paths_to_mutate / tests_dir / runner
├── src/samplepy/         # 被变异的目标代码（3 个模块，41 个变异体）
│   ├── calculator.py     # 算术 + 除零守卫 + 均值
│   ├── grader.py         # 分数 → 等级（边界值无测试）
│   └── discount.py       # 批量折扣（内含植入的 >=/ > bug）+ clamp
└── tests/                # pytest 测试（故意不完整，12 个用例）
```

## 前置条件

- Python 3.9+（本仓验证于 3.12.10，与 py workflow 模板的 setup-python 版本一致）。
- mutmut 固定 **2.x**（`"mutmut<3"`）：夜跑闭环工具链读取的是 2.x 写的
  `.mutmut-cache`（SQLite），3.x 不再写该文件。3.x 也不认 setup.cfg 的
  `[mutmut]` 段。
- 首次安装需要访问 PyPI；之后 `pytest` / `mutmut run` 全部本地运行，不需要
  网络和任何外部服务。

## 快速开始

```bash
# 建议在虚拟环境里安装；[dev] extras 带 pytest 与 mutmut<3
pip install -e ".[dev]"
# 或按 py workflow 模板的方式安装（清单与 [dev] extras 同源，见 requirements.txt）：
#   pip install -r requirements.txt && pip install -e .

pytest                       # 12 passed，退出码 0
mutmut run                   # 变异测试，几分钟跑完
mutmut results               # 人读结果汇总
mutmut show all > .mutmut-show-all.txt   # 给解析器用的 diff 文本
```

PowerShell 下注意给 `".[dev]"` 加引号。

## mutmut 退出码包装器（run_mutmut.py）

`mutmut run` 的退出码是按位组合的标志，直接接进 CI/脚本会把「有存活变异体」
（退出码 2）当成错误。`run_mutmut.py` 按位裁决并把退出码归一化，只有
mutmut 真正崩掉（致命错误位，奇数退出码）才返回非零：

```bash
python run_mutmut.py        # 等价 mutmut run；本夹具的存活变异体位归一化为退出码 0
```

| mutmut 退出码 | 含义 | 包装器退出码 |
|---|---|---|
| 0 | 干净跑完 | 0 |
| 2（偶数） | 有存活变异体（本夹具的预期结果） | **0** |
| 其它偶数 | 超时/可疑位、无致命位 | 0 |
| 奇数 | 命中致命错误位（测试套件崩溃、缓存损坏等） | 原值透传（非零） |

脚本内部经当前解释器 `python -m mutmut` 调用（用夹具 `.venv` 的 python
运行即可），mutmut 的 stdout/stderr 原样透传。端到端验证脚本
`scripts/test_nightly_loop.mjs` 的 py 路径即经该包装器运行 `mutmut run`，
使 VAL-FIXTURES-009 的「退出码 0」口径成立。

## 预期结果（2026-10-06 实测，Python 3.12.10 / mutmut 2.5.1 / pytest 8.4.2）

| 步骤 | 结果 | 退出码 |
|---|---|---|
| `pip install -e ".[dev]"` | 可编辑安装 + dev 依赖 | 0 |
| `pytest` | 12 passed | 0 |
| `mutmut run` | 41 个变异体：16 killed / **25 survived** | **2** |
| `python run_mutmut.py`（包装上一步） | 结果同 `mutmut run` | **0**（存活位归一化） |

- 变异分数 **39.02%**（检出口径：(killed + timeout) / total）。
- mutmut 2.x 的退出码是按位组合的：位 1 = 致命错误、位 2 = 存活变异体、
  位 4 = 超时、位 8 = 可疑。本夹具命中"有存活变异体"→ 退出码 2，这是
  **预期结果**，不是执行失败；只有奇数退出码（致命错误位）才代表 mutmut
  本身崩了。

## 刻意留下的缺陷与覆盖缺口

| 位置 | 缺口 | 典型存活变异体 |
|---|---|---|
| `src/samplepy/discount.py` `apply_discount` | **植入 bug**：阈值判断用 `>` 而非 `>=`，`total` 恰好等于 100 时拿不到折扣；没有 100 压线测试 | `total > 100` → `total >= 100` |
| `src/samplepy/grader.py` `letter_grade` | 90/80/70/60 四个压线值全部无测试 | `>= 90` → `> 90` 等 4 条边界 |
| `src/samplepy/grader.py` `is_passing` | 测试只取 85/10，远离 60 边界 | `>= 60` → `> 60` |
| `src/samplepy/calculator.py` `subtract` | 整个函数无测试 | 全部存活 |
| `src/samplepy/calculator.py` `average` | 空列表分支未测 | `len(values) == 0` 边界 |
| `src/samplepy/discount.py` `clamp_amount` | 只测了区间内取值，两条边界分支未测 | `<` → `<=`、`>` → `>=` |

请保持这些缺口：夹具的价值就在存活变异体上。补上测试会让端到端验证失去输入。

## 与夜跑闭环工具的衔接

在夹具目录内跑完 mutmut 后，用本仓 `scripts/` 的工具走完整链路（路径相对本文件）：

```bash
# 1. 解析存活变异体（缓存不含替换片段，必须配 --show 的 diff 文本）
python ../../parse_mutmut_report.py --input .mutmut-cache --show .mutmut-show-all.txt --output unified-mutation-report.json

# 2. 冻结 / 检查基线（mutmut 没有一键 JSON 导出，用 result-ids 组装，见 workflow 模板步骤 6）
node ../../mutation-baseline.mjs init  --input mutmut-results-export.json --lang py
node ../../mutation-baseline.mjs check --input mutmut-results-export.json --lang py

# 3. 预览补测 issue（--dry-run 零 gh 调用，只写 .mutation-queue/）
node ../../create-mutation-issues.mjs --input unified-mutation-report.json --dry-run
```

`mutmut show all` 的捕获（`.mutmut-show-all.txt`）要和当前 `.mutmut-cache`
同轮生成；改了源码或测试后重跑 `mutmut run` 再重新捕获。

## 清理

`__pycache__/`、`.pytest_cache/`、`src/*.egg-info/`、`.mutmut-cache`、
`.mutmut-show-all.txt`、`mutmut-results-export.json`、`.venv/` 等已在
`.gitignore` 中，不影响版本库；需要彻底还原时删除它们即可。
