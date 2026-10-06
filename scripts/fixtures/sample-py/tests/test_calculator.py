"""calculator 的不完整测试：subtract、空列表均值、除零边界都不在覆盖内。"""

import pytest

from samplepy.calculator import add, average, divide


def test_add():
    assert add(2, 3) == 5


def test_divide_non_zero():
    assert divide(10, 4) == 2.5


def test_average_list():
    assert average([2, 4, 6]) == 4


def test_divide_rejects_zero():
    with pytest.raises(ValueError, match="must not be zero"):
        divide(1, 0)
