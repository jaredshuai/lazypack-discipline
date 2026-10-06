/**
 * 简单计算器 —— 故意留出测试空档，让变异测试能产生存活变异体。
 *
 * 这是夹具：不要"顺手补齐"这里的测试。缺口清单见 README.md。
 */

export function add(a: number, b: number): number {
  return a + b;
}

/** 完全没有测试：该函数的全部变异体都会存活。 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/** 除零守卫只写不测：守卫分支上的条件变异体存活。 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('divide: divisor must not be zero');
  }
  return a / b;
}

/** 空数组分支未测，累加与除法算术各有部分变异体存活。 */
export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}
