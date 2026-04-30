const { asyncHandler } = require('../middleware/error');
const notifService = require('../services/notification.service');

exports.list = asyncHandler(async (req, res) => {
  const unread = req.query.unread === 'true';
  res.json(await notifService.listForUser(req.user.userID, unread));
});

exports.markRead = asyncHandler(async (req, res) => {
  await notifService.markRead(req.user.userID, req.params.id);
  res.json({ message: 'Marked read' });
});
