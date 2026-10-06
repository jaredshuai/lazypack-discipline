"""grader 的不完整测试：全部输入都远离 60/70/80/90 边界。"""

from samplepy.grader import is_passing, letter_grade


def test_high_score_is_a():
    assert letter_grade(95) == "A"


def test_low_score_is_f():
    assert letter_grade(42) == "F"


def test_comfortable_score_passes():
    assert is_passing(85) is True


def test_very_low_score_fails():
    assert is_passing(10) is False
