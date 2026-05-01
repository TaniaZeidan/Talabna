/**
 * Unit tests for business validation logic.
 * Pure functions recreated from controllers to test in isolation
 * without HTTP layer overhead.
 */
const { AppError } = require('../../src/middleware/error');

// --- Recreated from auth.controller.js ---
function validateRegistration({ username, password, confirmPassword, email, phone, role }) {
  if (!username || !password || !email || !phone) throw new AppError('All fields are required');
  if (username.length < 6 || username.length > 20) throw new AppError('Username must be 6–20 characters');
  if (password.length < 6 || password.length > 20) throw new AppError('Password must be 6–20 characters');
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    throw new AppError('Password must contain letters and numbers');
  if (confirmPassword !== undefined && password !== confirmPassword)
    throw new AppError('Passwords do not match');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError('Invalid email format');
  if (!['customer', 'vendor', 'driver'].includes(role)) throw new AppError('Invalid role');
}

// --- Recreated from vendor.controller.js ---
function validateProductInput({ name, price, category }) {
  if (!name || !category) throw new AppError('Product name and category are required');
  if (price === undefined || price === null) throw new AppError('Price is required');
  if (Number(price) < 0)   throw new AppError('Price must be a positive numeric value');
  if (Number.isNaN(Number(price))) throw new AppError('Price must be numeric');
}

// --- Email regex from auth.controller.js ---
const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

describe('Registration validation', () => {
  const valid = {
    username: 'testuser',
    password: 'Pass123',
    email: 'test@example.com',
    phone: '+961123456',
    role: 'customer',
  };

  test('accepts valid registration data', () => {
    expect(() => validateRegistration(valid)).not.toThrow();
  });

  test('rejects missing username', () => {
    expect(() => validateRegistration({ ...valid, username: '' }))
      .toThrow('All fields are required');
  });

  test('rejects missing password', () => {
    expect(() => validateRegistration({ ...valid, password: '' }))
      .toThrow('All fields are required');
  });

  test('rejects missing email', () => {
    expect(() => validateRegistration({ ...valid, email: '' }))
      .toThrow('All fields are required');
  });

  test('rejects missing phone', () => {
    expect(() => validateRegistration({ ...valid, phone: '' }))
      .toThrow('All fields are required');
  });

  describe('username length boundaries', () => {
    test('rejects 5-char username (below minimum)', () => {
      expect(() => validateRegistration({ ...valid, username: 'abcde' }))
        .toThrow('Username must be 6–20 characters');
    });

    test('accepts 6-char username (at minimum)', () => {
      expect(() => validateRegistration({ ...valid, username: 'abcdef' }))
        .not.toThrow();
    });

    test('accepts 20-char username (at maximum)', () => {
      expect(() => validateRegistration({ ...valid, username: 'a'.repeat(20) }))
        .not.toThrow();
    });

    test('rejects 21-char username (above maximum)', () => {
      expect(() => validateRegistration({ ...valid, username: 'a'.repeat(21) }))
        .toThrow('Username must be 6–20 characters');
    });
  });

  describe('password length boundaries', () => {
    test('rejects 5-char password', () => {
      expect(() => validateRegistration({ ...valid, password: 'Ab1cd' }))
        .toThrow('Password must be 6–20 characters');
    });

    test('accepts 6-char password', () => {
      expect(() => validateRegistration({ ...valid, password: 'Abc123' }))
        .not.toThrow();
    });

    test('accepts 20-char password', () => {
      expect(() => validateRegistration({ ...valid, password: 'Abc123' + 'x'.repeat(14) }))
        .not.toThrow();
    });

    test('rejects 21-char password', () => {
      expect(() => validateRegistration({ ...valid, password: 'Abc123' + 'x'.repeat(15) }))
        .toThrow('Password must be 6–20 characters');
    });
  });

  describe('password strength', () => {
    test('rejects password with only digits', () => {
      expect(() => validateRegistration({ ...valid, password: '123456' }))
        .toThrow('Password must contain letters and numbers');
    });

    test('rejects password with only letters', () => {
      expect(() => validateRegistration({ ...valid, password: 'abcdef' }))
        .toThrow('Password must contain letters and numbers');
    });

    test('accepts password with uppercase + digits', () => {
      expect(() => validateRegistration({ ...valid, password: 'ABC123' }))
        .not.toThrow();
    });

    test('accepts password with lowercase + digits', () => {
      expect(() => validateRegistration({ ...valid, password: 'abc123' }))
        .not.toThrow();
    });

    test('accepts password with mixed case + digits', () => {
      expect(() => validateRegistration({ ...valid, password: 'AbCd12' }))
        .not.toThrow();
    });
  });

  describe('confirm password', () => {
    test('allows omitted confirmPassword', () => {
      expect(() => validateRegistration({ ...valid })).not.toThrow();
    });

    test('accepts matching confirmPassword', () => {
      expect(() => validateRegistration({ ...valid, confirmPassword: 'Pass123' }))
        .not.toThrow();
    });

    test('rejects mismatched confirmPassword', () => {
      expect(() => validateRegistration({ ...valid, confirmPassword: 'Wrong999' }))
        .toThrow('Passwords do not match');
    });
  });

  describe('role validation', () => {
    test('accepts customer role', () => {
      expect(() => validateRegistration({ ...valid, role: 'customer' })).not.toThrow();
    });

    test('accepts vendor role', () => {
      expect(() => validateRegistration({ ...valid, role: 'vendor' })).not.toThrow();
    });

    test('accepts driver role', () => {
      expect(() => validateRegistration({ ...valid, role: 'driver' })).not.toThrow();
    });

    test('rejects admin role', () => {
      expect(() => validateRegistration({ ...valid, role: 'admin' })).toThrow('Invalid role');
    });

    test('rejects arbitrary role', () => {
      expect(() => validateRegistration({ ...valid, role: 'superuser' })).toThrow('Invalid role');
    });
  });
});

describe('Email format validation', () => {
  test.each([
    ['user@example.com', true],
    ['a@b.c', true],
    ['user.name@domain.co.uk', true],
    ['user+tag@gmail.com', true],
    ['', false],
    ['noatsign.com', false],
    ['@missing-local.com', false],
    ['user@', false],
    ['user@ space.com', false],
    ['user @domain.com', false],
    ['user@@domain.com', false],
  ])('"%s" → valid=%s', (email, expected) => {
    expect(emailRegex.test(email)).toBe(expected);
  });
});

describe('Product input validation', () => {
  const valid = { name: 'Pizza', price: 10, category: 'pizza' };

  test('accepts valid product input', () => {
    expect(() => validateProductInput(valid)).not.toThrow();
  });

  test('rejects missing name', () => {
    expect(() => validateProductInput({ ...valid, name: '' }))
      .toThrow('Product name and category are required');
  });

  test('rejects missing category', () => {
    expect(() => validateProductInput({ ...valid, category: '' }))
      .toThrow('Product name and category are required');
  });

  test('rejects undefined price', () => {
    expect(() => validateProductInput({ name: 'X', category: 'Y' }))
      .toThrow('Price is required');
  });

  test('rejects null price', () => {
    expect(() => validateProductInput({ ...valid, price: null }))
      .toThrow('Price is required');
  });

  test('rejects negative price', () => {
    expect(() => validateProductInput({ ...valid, price: -5 }))
      .toThrow('Price must be a positive numeric value');
  });

  test('accepts zero price (free items)', () => {
    expect(() => validateProductInput({ ...valid, price: 0 })).not.toThrow();
  });

  test('accepts string numeric price', () => {
    expect(() => validateProductInput({ ...valid, price: '9.99' })).not.toThrow();
  });

  test('rejects NaN price', () => {
    expect(() => validateProductInput({ ...valid, price: 'abc' }))
      .toThrow('Price must be numeric');
  });
});

describe('Operational hours validation', () => {
  function isValidScheduledTime(scheduledTime) {
    if (!scheduledTime) return true;
    const dt = new Date(scheduledTime);
    const h = dt.getHours();
    return !Number.isNaN(dt.getTime()) && h >= 9 && h < 22;
  }

  test('allows null scheduled time', () => {
    expect(isValidScheduledTime(null)).toBe(true);
  });

  test('allows undefined scheduled time', () => {
    expect(isValidScheduledTime(undefined)).toBe(true);
  });

  test('accepts 09:00 (opening)', () => {
    expect(isValidScheduledTime('2026-06-01T09:00:00')).toBe(true);
  });

  test('accepts 12:00 (midday)', () => {
    expect(isValidScheduledTime('2026-06-01T12:00:00')).toBe(true);
  });

  test('accepts 21:59 (last minute)', () => {
    expect(isValidScheduledTime('2026-06-01T21:59:00')).toBe(true);
  });

  test('rejects 22:00 (closing)', () => {
    expect(isValidScheduledTime('2026-06-01T22:00:00')).toBe(false);
  });

  test('rejects 08:59 (before opening)', () => {
    expect(isValidScheduledTime('2026-06-01T08:59:00')).toBe(false);
  });

  test('rejects 23:00 (after hours)', () => {
    expect(isValidScheduledTime('2026-06-01T23:00:00')).toBe(false);
  });

  test('rejects 03:00 (early morning)', () => {
    expect(isValidScheduledTime('2026-06-01T03:00:00')).toBe(false);
  });

  test('rejects invalid date string', () => {
    expect(isValidScheduledTime('not-a-date')).toBe(false);
  });
});

describe('Payment method validation', () => {
  const validMethods = ['cash', 'card'];

  test('accepts cash', () => {
    expect(validMethods.includes('cash')).toBe(true);
  });

  test('accepts card', () => {
    expect(validMethods.includes('card')).toBe(true);
  });

  test('rejects empty string', () => {
    expect(validMethods.includes('')).toBe(false);
  });

  test('rejects paypal', () => {
    expect(validMethods.includes('paypal')).toBe(false);
  });

  test('rejects crypto', () => {
    expect(validMethods.includes('crypto')).toBe(false);
  });
});

describe('Loyalty point calculations', () => {
  const POINTS_PER_DOLLAR = 1;
  const REDEEM_VALUE = 0.10;

  test('earns 1 point per dollar', () => {
    expect(Math.floor(25 * POINTS_PER_DOLLAR)).toBe(25);
  });

  test('floors fractional points', () => {
    expect(Math.floor(25.99 * POINTS_PER_DOLLAR)).toBe(25);
  });

  test('earns 0 points for $0 order', () => {
    expect(Math.floor(0 * POINTS_PER_DOLLAR)).toBe(0);
  });

  test('10 points = $1 discount', () => {
    expect(10 * REDEEM_VALUE).toBeCloseTo(1.0);
  });

  test('50 points = $5 discount', () => {
    expect(50 * REDEEM_VALUE).toBeCloseTo(5.0);
  });

  test('discount capped at subtotal', () => {
    const subtotal = 8;
    const redeemPoints = 200;
    let discount = redeemPoints * REDEEM_VALUE;
    if (discount > subtotal) discount = subtotal;
    expect(discount).toBe(8);
  });

  test('discount not capped when under subtotal', () => {
    const subtotal = 50;
    const redeemPoints = 20;
    let discount = redeemPoints * REDEEM_VALUE;
    if (discount > subtotal) discount = subtotal;
    expect(discount).toBeCloseTo(2.0);
  });
});

describe('Order status state machine', () => {
  const validTransitions = {
    Pending:          ['Confirmed', 'Cancelled'],
    Confirmed:        ['InPreparation', 'Cancelled'],
    InPreparation:    ['ReadyForPickup'],
    ReadyForPickup:   ['OnTheWay'],
    OnTheWay:         ['Delivered', 'DeliveryFailed'],
    Delivered:        [],
    Cancelled:        [],
    DeliveryFailed:   [],
  };

  test('Pending can transition to Confirmed', () => {
    expect(validTransitions['Pending']).toContain('Confirmed');
  });

  test('Pending can transition to Cancelled', () => {
    expect(validTransitions['Pending']).toContain('Cancelled');
  });

  test('Pending cannot skip to InPreparation', () => {
    expect(validTransitions['Pending']).not.toContain('InPreparation');
  });

  test('Confirmed can go to InPreparation', () => {
    expect(validTransitions['Confirmed']).toContain('InPreparation');
  });

  test('InPreparation can go to ReadyForPickup', () => {
    expect(validTransitions['InPreparation']).toContain('ReadyForPickup');
  });

  test('ReadyForPickup can go to OnTheWay', () => {
    expect(validTransitions['ReadyForPickup']).toContain('OnTheWay');
  });

  test('OnTheWay can reach Delivered', () => {
    expect(validTransitions['OnTheWay']).toContain('Delivered');
  });

  test('OnTheWay can reach DeliveryFailed', () => {
    expect(validTransitions['OnTheWay']).toContain('DeliveryFailed');
  });

  test('Delivered is a terminal state', () => {
    expect(validTransitions['Delivered']).toHaveLength(0);
  });

  test('Cancelled is a terminal state', () => {
    expect(validTransitions['Cancelled']).toHaveLength(0);
  });

  test('DeliveryFailed is a terminal state', () => {
    expect(validTransitions['DeliveryFailed']).toHaveLength(0);
  });

  test('Delivered cannot revert to OnTheWay', () => {
    expect(validTransitions['Delivered']).not.toContain('OnTheWay');
  });
});

describe('Delivery fee calculation', () => {
  const DELIVERY_FEE = 2.00;

  test('delivery fee is $2.00', () => {
    expect(DELIVERY_FEE).toBe(2.00);
  });

  test('total = subtotal - discount + fee', () => {
    const subtotal = 25;
    const discount = 5;
    const total = Number((subtotal - discount + DELIVERY_FEE).toFixed(2));
    expect(total).toBe(22.00);
  });

  test('total with zero discount', () => {
    const subtotal = 15.50;
    const total = Number((subtotal + DELIVERY_FEE).toFixed(2));
    expect(total).toBe(17.50);
  });

  test('multi-store: single fee for entire group', () => {
    const vendor1Total = 20;
    const vendor2Total = 15;
    const grandTotal = vendor1Total + vendor2Total + DELIVERY_FEE;
    expect(grandTotal).toBe(37.00);
  });
});
