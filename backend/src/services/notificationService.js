const { Expo } = require('expo-server-sdk');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

// ── Send notification to a user ───────────────────────────────────
exports.sendToUser = async (userId, { type, title, body, data = {} }) => {
  try {
    // Store in DB regardless of push delivery
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, body, JSON.stringify(data)]
    );

    // Get user's push token
    const userResult = await query(
      'SELECT expo_push_token FROM users WHERE id = $1',
      [userId]
    );

    const token = userResult.rows[0]?.expo_push_token;
    if (!token || !Expo.isExpoPushToken(token)) return;

    const message = {
      to: token,
      sound: 'default',
      title,
      body,
      data: { type, ...data },
      priority: 'high',
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        // Mark as sent
        await query(
          `UPDATE notifications SET sent = TRUE, sent_at = NOW()
           WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1`,
          [userId, type]
        );

        // Handle errors from Expo
        for (const ticket of tickets) {
          if (ticket.status === 'error') {
            logger.warn('Push notification error', { ticket, userId });
            if (ticket.details?.error === 'DeviceNotRegistered') {
              await query(
                'UPDATE users SET expo_push_token = NULL WHERE id = $1',
                [userId]
              );
            }
          }
        }
      } catch (err) {
        logger.error('Expo send error', err);
      }
    }
  } catch (err) {
    logger.error('Send notification error', err);
  }
};

// ── Get user notifications ────────────────────────────────────────
exports.getUserNotifications = async (userId, page = 1, limit = 30) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const result = await query(
    `SELECT id, type, title, body, data, read, created_at
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, parseInt(limit), offset]
  );
  return result.rows;
};

// ── Mark notifications as read ────────────────────────────────────
exports.markRead = async (userId, notificationIds) => {
  if (notificationIds && notificationIds.length > 0) {
    await query(
      'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id = ANY($2)',
      [userId, notificationIds]
    );
  } else {
    await query(
      'UPDATE notifications SET read = TRUE WHERE user_id = $1',
      [userId]
    );
  }
};

// ── Get unread count ──────────────────────────────────────────────
exports.getUnreadCount = async (userId) => {
  const result = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE',
    [userId]
  );
  return parseInt(result.rows[0].count);
};
