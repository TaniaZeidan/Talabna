const db = require('../config/db');

/**
 * NFR-R2: Maintain audit logs of critical operations.
 * Logged operations include: account creation, order placement,
 * vendor approval, delivery completion.
 */
async function logAction(userID, action, details = '') {
  try {
    await db.query(
      'INSERT INTO audit_logs (userID, action, details) VALUES (?, ?, ?)',
      [userID, action, details]
    );
  } catch (err) {
    // Audit logging failures should never break the main flow.
    console.error('[audit] Failed to log action:', err.message);
  }
}

module.exports = { logAction };
