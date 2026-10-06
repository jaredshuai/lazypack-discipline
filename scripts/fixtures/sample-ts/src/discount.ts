/**
 * 折扣逻辑 —— 内含一个刻意植入的边界 bug，测试没有覆盖到它：
 * applyDiscount 在 total 恰好等于阈值时拿不到批量折扣（正确条件应为 >=）。
 * 变异测试的意义就是把这类 bug 逼出来：`>` → `>=` 的变异体存活，
 * 说明没有测试钉住这个边界。
 */

export const BULK_DISCOUNT_THRESHOLD = 100;
export const BULK_DISCOUNT_RATE = 0.9;

export function applyDiscount(total: number): number {
  if (total < 0) {
    throw new Error('applyDiscount: total must not be negative');
  }
  if (total > BULK_DISCOUNT_THRESHOLD) {
    return roundToCents(total * BULK_DISCOUNT_RATE);
  }
  return total;
}

/** 三个分支只测了中间那个：两条边界分支的变异体存活。 */
export function clampAmount(amount: number, min: number, max: number): number {
  if (amount < min) {
    return min;
  }
  if (amount > max) {
    return max;
  }
  return amount;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
