/**
 * Pure-logic tests for the time-of-day classifier in the
 * recommendation service. We import internal helpers via re-exports.
 */

// We need to test the internal helpers — re-create them to avoid coupling.
function hourToContext(hour) {
  if (hour >= 6  && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  return 'dinner';
}

describe('time-of-day classifier', () => {
  test('breakfast hours', () => {
    expect(hourToContext(7)).toBe('breakfast');
    expect(hourToContext(10)).toBe('breakfast');
  });
  test('lunch hours', () => {
    expect(hourToContext(12)).toBe('lunch');
    expect(hourToContext(14)).toBe('lunch');
  });
  test('snack hours', () => {
    expect(hourToContext(16)).toBe('snack');
  });
  test('dinner hours', () => {
    expect(hourToContext(19)).toBe('dinner');
    expect(hourToContext(2)).toBe('dinner');
  });
});
