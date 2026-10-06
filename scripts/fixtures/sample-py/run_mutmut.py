#!/usr/bin/env python
"""run_mutmut.py - mutmut 退出码归一化包装器（sample-py 夹具）。

mutmut 2.x 的退出码是按位组合的标志（见本目录 README「预期结果」一节）：

    位 1（值 1）= 致命错误：测试套件崩溃、缓存损坏等真实执行失败
    位 2（值 2）= 存在存活变异体（survived）
    位 4（值 4）= 存在超时变异体（timeout）
    位 8（值 8）= 存在可疑变异体（suspicious）

本夹具刻意欠测试、设计上稳定产出存活变异体，`mutmut run` 以 2 退出是
预期结果而非失败。CI/脚本若直接对接 `mutmut run`，会把这份夜跑闭环的
预期输入当成错误。包装器只把 0 与 2 归一化，其余原值透传，不掩盖真实
结果类别：

    mutmut 退出码             包装器退出码
    0（干净跑完）              0
    2（存在存活变异体，        0（夜跑闭环的正常输入，不是错误）
    本夹具的预期结果）
    其余（致命位 1、超时位 4、 原值透传（调用方自行裁决，非零即失败）
    可疑位 8 等任意组合）

用法：
    python run_mutmut.py [mutmut 参数...]   # 无参数时等价 mutmut run

示例：
    python run_mutmut.py            # 存活变异体不再表现为非零退出码
    python run_mutmut.py run        # 同上（显式写子命令）

mutmut 经当前解释器调用（sys.executable -m mutmut）：用夹具 .venv 的
python 运行本包装器即可保证 mutmut 2.x 就位（见 pyproject.toml [dev]）。
mutmut 的 stdout/stderr 原样透传，本脚本自身不产生输出。
"""

import subprocess
import sys


def normalize_exit_code(status):
    """mutmut 退出码 -> 包装器退出码。

    只有 0（干净跑完）与 2（存在存活变异体，本夹具的预期结果）归一化为 0；
    其余退出码（致命位 1、超时位 4、可疑位 8 等任意组合）原值透传，
    不掩盖真实结果类别。
    """
    if status in (0, 2):
        return 0
    return status


def main(argv):
    """以当前解释器运行 mutmut 子命令，返回归一化后的退出码。"""
    command = [sys.executable, "-m", "mutmut", *(argv or ["run"])]
    try:
        result = subprocess.run(command)
    except OSError as err:
        sys.stderr.write(
            "run_mutmut: 无法启动 mutmut（%s -m mutmut）：%s\n" % (command[0], err)
        )
        return 1
    return normalize_exit_code(result.returncode)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
