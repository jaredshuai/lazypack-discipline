import { strictEqual, throws } from 'assert';
import { applyDiscount, clampAmount } from '../src/discount';

describe('discount', () => {
  it('gives the bulk discount above the threshold', () => {
    strictEqual(applyDiscount(200), 180);
  });

  it('charges full price well below the threshold', () => {
    strictEqual(applyDiscount(50), 50);
  });

  it('rejects negative totals', () => {
    throws(() => applyDiscount(-1), /must not be negative/);
  });

  it('keeps amounts inside the range untouched', () => {
    strictEqual(clampAmount(7, 0, 10), 7);
  });
});
