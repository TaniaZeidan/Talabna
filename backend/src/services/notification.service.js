const db = require('../config/db');

/**
 * Persists an in-app notification for the user. Supports FR-C5
 * (real-time tracking) and FR-V4/FR-V5 (vendor/driver notifications).
 */
async function notify(userID, message, relatedOrderID = null) {
  try {
    await db.query(
      'INSERT INTO notifications (userID, message, relatedOrderID) VALUES (?, ?, ?)',
      [userID, message, relatedOrderID]
    );
  } catch (err) {
    console.error('[notify] Failed:', err.message);
  }
}

async function listForUser(userID, unreadOnly = false) {
  const sql = `
    SELECT * FROM notifications
    WHERE userID = ?  ${unreadOnly ? 'AND isRead = FALSE' : ''}
    ORDER BY createdAt DESC LIMIT 50`;
  const [rows] = await db.query(sql, [userID]);
  return rows;
}

async function markRead(userID, notificationID) {
  await db.query(
    'UPDATE notifications SET isRead = TRUE WHERE notificationID = ? AND userID = ?',
    [notificationID, userID]
  );
}

module.exports = { notify, listForUser, markRead };
