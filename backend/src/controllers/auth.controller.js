const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../middleware/error');
const { logAction } = require('../services/audit.service');

/**
 * FR-C2 validation rules:
 *   (a) username, password, email, phone non-empty
 *   (b) username unique
 *   (c) username and password 6–20 chars
 *   (d) password contains letters AND numbers
 *   (e) confirmation matches
 */
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

exports.register = asyncHandler(async (req, res) => {
  const { username, password, confirmPassword, email, phone, role,
          businessName, address, category } = req.body;

  validateRegistration({ username, password, confirmPassword, email, phone, role });

  // Uniqueness check (username + email)
  const [dup] = await db.query(
    'SELECT userID FROM users WHERE username = ? OR email = ?', [username, email]);
  if (dup.length) throw new AppError('Username or email already exists', 409);

  const hash = await bcrypt.hash(password, 12);

  // Vendors are pending until admin approval (FR-A2); customers/drivers are active
  const accountStatus = role === 'vendor' ? 'pending' : 'active';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [u] = await conn.query(
      'INSERT INTO users (username, password, email, phone, role, accountStatus) VALUES (?,?,?,?,?,?)',
      [username, hash, email, phone, role, accountStatus]
    );
    const userID = u.insertId;

    if (role === 'vendor') {
      if (!businessName || !address || !category)
        throw new AppError('Business name, address, and category are required for vendors');
      await conn.query(
        'INSERT INTO vendors (userID, businessName, address, category, status) VALUES (?,?,?,?,?)',
        [userID, businessName, address, category, 'pending']
      );
    } else if (role === 'customer') {
      await conn.query('INSERT INTO loyalty (userID) VALUES (?)', [userID]);
    }

    await conn.commit();
    await logAction(userID, 'ACCOUNT_CREATED', `role=${role}`);

    res.status(201).json({
      message: role === 'vendor'
        ? 'Vendor registered. Awaiting admin approval.'
        : 'Account created successfully',
      userID,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) throw new AppError('Username and password required');

  const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  if (!rows.length) throw new AppError('Invalid credentials', 401);

  const user = rows[0];

  if (user.accountStatus === 'suspended')
    throw new AppError('Your account is suspended. Contact administrator.', 403);

  // Vendors with pending approval also blocked from login per FR-V1
  if (user.role === 'vendor' && user.accountStatus === 'pending')
    throw new AppError('Your vendor account is awaiting admin approval', 403);

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    await logAction(user.userID, 'LOGIN_FAILED', 'Invalid password');
    throw new AppError('Invalid credentials', 401);
  }

  const token = jwt.sign(
    { userID: user.userID, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  await logAction(user.userID, 'LOGIN_SUCCESS');

  res.json({
    token,
    user: {
      userID: user.userID,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
});

exports.me = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT userID, username, email, phone, role, accountStatus, createdAt FROM users WHERE userID = ?',
    [req.user.userID]
  );
  if (!rows.length) throw new AppError('User not found', 404);
  res.json(rows[0]);
});
