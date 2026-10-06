/**
 * 分数 → 等级。边界值（90/80/70/60 恰好压线）没有任何测试，
 * 条件边界变异体（>= 变 >）预期全部存活。
 */

export function letterGrade(score: number): string {
  if (score >= 90) {
    return 'A';
  }
  if (score >= 80) {
    return 'B';
  }
  if (score >= 70) {
    return 'C';
  }
  if (score >= 60) {
    return 'D';
  }
  return 'F';
}

/** 及格线判定：测试只取远离 60 的输入，>= 60 的边界变异体存活。 */
export function isPassing(score: number): boolean {
  return score >= 60;
}
