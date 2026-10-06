import { strictEqual, throws } from 'assert';
import { add, average, divide } from '../src/calculator';

describe('calculator', () => {
  it('adds two numbers', () => {
    strictEqual(add(2, 3), 5);
  });

  it('divides by a non-zero divisor', () => {
    strictEqual(divide(10, 4), 2.5);
  });

  it('averages a list of values', () => {
    strictEqual(average([2, 4, 6]), 4);
  });

  it('rejects a zero divisor (smoke test for the guard)', () => {
    throws(() => divide(1, 0), /must not be zero/);
  });
});
