"""折扣逻辑 —— 内含一个刻意植入的边界 bug，测试没有覆盖到它：
apply_discount 在 total 恰好等于阈值时拿不到批量折扣（正确条件应为 >=）。
变异测试的意义就是把这类 bug 逼出来：`>` → `>=` 的变异体存活，
说明没有测试钉住这个边界。
"""

BULK_DISCOUNT_THRESHOLD = 100
BULK_DISCOUNT_RATE = 0.9


def apply_discount(total: float) -> float:
    if total < 0:
        raise ValueError("apply_discount: total must not be negative")
    if total > BULK_DISCOUNT_THRESHOLD:
        return round(total * BULK_DISCOUNT_RATE, 2)
    return total


def clamp_amount(amount: float, minimum: float, maximum: float) -> float:
    """三条分支只测了中间那条：两条边界分支的变异体存活。"""
    if amount < minimum:
        return minimum
    if amount > maximum:
        return maximum
    return amount
