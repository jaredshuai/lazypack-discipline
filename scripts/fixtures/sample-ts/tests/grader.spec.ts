import { strictEqual } from 'assert';
import { isPassing, letterGrade } from '../src/grader';

describe('grader', () => {
  it('grades a high score as A', () => {
    strictEqual(letterGrade(95), 'A');
  });

  it('grades a low score as F', () => {
    strictEqual(letterGrade(42), 'F');
  });

  it('marks a comfortable score as passing', () => {
    strictEqual(isPassing(85), true);
  });

  it('marks a very low score as failing', () => {
    strictEqual(isPassing(10), false);
  });
});
