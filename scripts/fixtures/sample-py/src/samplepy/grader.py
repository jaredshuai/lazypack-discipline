"""分数 → 等级。边界值（90/80/70/60 恰好压线）没有任何测试，
比较边界变异体（>= 变 >）预期全部存活。
"""


def letter_grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def is_passing(score: float) -> bool:
    """及格线判定：测试只取远离 60 的输入，>= 60 的边界变异体存活。"""
    return score >= 60
