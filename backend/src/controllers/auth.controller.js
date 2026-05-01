const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../middleware/error');
const { logAction } = require('../services/audit.service');
const { sendResetCode } = require('../services/email.service');

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

/* ============================================================
 *  Password reset — two-step with email verification
 *
 *  Step 1: requestPasswordReset
 *    Body: { username, email }
 *    → Generates 6-digit code, hashes + stores it (15 min expiry),
 *      emails the code to the user.
 *
 *  Step 2: confirmPasswordReset
 *    Body: { username, email, code, newPassword, confirmPassword }
 *    → Verifies code matches the latest active reset for this user
 *      and updates password.
 * ============================================================
 */

const RESET_EXPIRY_MINUTES = 15;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

exports.requestPasswordReset = asyncHandler(async (req, res) => {
  const { username, email } = req.body;
  if (!username || !email)
    throw new AppError('Username and email are required');

  // Identity check: both fields must match the same user
  const [rows] = await db.query(
    'SELECT userID, email, username, accountStatus FROM users WHERE username = ? AND email = ?',
    [username, email]
  );

  // For privacy, return a generic success even if no match — but only
  // actually send an email when an account exists.
  if (!rows.length) {
    await new Promise(r => setTimeout(r, 600)); // mild timing-attack protection
    return res.json({ message: 'If that account exists, a verification code has been sent.' });
  }
  const user = rows[0];
  if (user.accountStatus === 'suspended')
    throw new AppError('This account is suspended. Contact an administrator.', 403);

  // Rate limit: at most 3 codes per user per hour
  const [[counts]] = await db.query(
    'SELECT COUNT(*) AS n FROM password_resets WHERE userID = ? AND createdAt >= NOW() - INTERVAL 1 HOUR',
    [user.userID]
  );
  if (counts.n >= 3)
    throw new AppError('Too many reset requests. Please wait an hour and try again.', 429);

  // Invalidate any previous active codes for this user
  await db.query(
    'UPDATE password_resets SET used = TRUE WHERE userID = ? AND used = FALSE',
    [user.userID]
  );

  // Generate and store a new code
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await db.query(
    'INSERT INTO password_resets (userID, codeHash, expiresAt) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
    [user.userID, codeHash, RESET_EXPIRY_MINUTES]
  );

  // Send the email
  try {
    await sendResetCode(user.email, user.username, code);
  } catch (err) {
    console.error('[reset] Failed to send email:', err.message);
    throw new AppError('Could not send the verification email. Please try again or contact support.', 500);
  }

  await logAction(user.userID, 'PASSWORD_RESET_REQUESTED', `email=${user.email}`);
  res.json({ message: 'A verification code has been sent to your email.' });
});

exports.confirmPasswordReset = asyncHandler(async (req, res) => {
  const { username, email, code, newPassword, confirmPassword } = req.body;

  if (!username || !email || !code || !newPassword)
    throw new AppError('All fields are required');
  if (newPassword !== confirmPassword)
    throw new AppError('Passwords do not match');
  if (newPassword.length < 6 || newPassword.length > 20)
    throw new AppError('Password must be 6–20 characters');
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword))
    throw new AppError('Password must contain letters and numbers');
  if (!/^\d{6}$/.test(String(code).trim()))
    throw new AppError('Verification code must be 6 digits');

  // Find user
  const [users] = await db.query(
    'SELECT userID FROM users WHERE username = ? AND email = ?',
    [username, email]
  );
  if (!users.length) throw new AppError('Invalid verification details', 400);
  const user = users[0];

  // Find the latest active reset for this user
  const [resets] = await db.query(
    `SELECT resetID, codeHash, expiresAt FROM password_resets
      WHERE userID = ? AND used = FALSE AND expiresAt > NOW()
      ORDER BY createdAt DESC LIMIT 1`,
    [user.userID]
  );
  if (!resets.length) throw new AppError('No active verification code. Please request a new one.', 400);
  const reset = resets[0];

  const codeOk = await bcrypt.compare(String(code).trim(), reset.codeHash);
  if (!codeOk) throw new AppError('Invalid verification code', 400);

  // Mark the code used and update the password atomically
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE password_resets SET used = TRUE WHERE resetID = ?', [reset.resetID]);
    const newHash = await bcrypt.hash(newPassword, 12);
    await conn.query('UPDATE users SET password = ? WHERE userID = ?', [newHash, user.userID]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await logAction(user.userID, 'PASSWORD_RESET_CONFIRMED', 'email-verified');
  res.json({ message: 'Password reset successful. You can now sign in.' });
});
