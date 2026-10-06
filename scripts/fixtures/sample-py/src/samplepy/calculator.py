"""简单计算器 —— 故意留出测试空档，让变异测试能产生存活变异体。

这是夹具：不要"顺手补齐"这里的测试。缺口清单见 README.md。
"""


def add(a: float, b: float) -> float:
    return a + b


def subtract(a: float, b: float) -> float:
    """完全没有测试：该函数的全部变异体都会存活。"""
    return a - b


def divide(a: float, b: float) -> float:
    """除零守卫只写不测：守卫分支上的比较变异体存活。"""
    if b == 0:
        raise ValueError("divide: divisor must not be zero")
    return a / b


def average(values: list) -> float:
    """空列表分支未测，累加与除法算术各有部分变异体存活。"""
    if len(values) == 0:
        return 0
    total = 0
    for value in values:
        total += value
    return total / len(values)
