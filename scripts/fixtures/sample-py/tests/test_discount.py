"""discount 的不完整测试：阈值 100 本身与 clamp 两条边界分支不在覆盖内。"""

import pytest

from samplepy.discount import apply_discount, clamp_amount


def test_bulk_discount_above_threshold():
    assert apply_discount(200) == 180


def test_full_price_below_threshold():
    assert apply_discount(50) == 50


def test_rejects_negative_total():
    with pytest.raises(ValueError, match="must not be negative"):
        apply_discount(-1)


def test_amount_inside_range_untouched():
    assert clamp_amount(7, 0, 10) == 7
