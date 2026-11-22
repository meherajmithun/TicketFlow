import type { Pool } from 'pg';
import type { NotificationMessage, Notification } from './types.js';

export class PgNotificationRepository {
  constructor(private readonly pool: Pool) {}

  async createIfMissing(message: NotificationMessage): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO notifications (user_id, booking_id, type, message)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = $1 AND booking_id = $2 AND type = $3)`,
      [message.userId, message.bookingId, message.type, message.message],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listForUser(userId: string): Promise<Notification[]> {
    const result = await this.pool.query<Notification>(
      `SELECT id, user_id AS "userId", booking_id AS "bookingId", type, message, read_at AS "readAt", created_at AS "createdAt"
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`, [userId],
    );
    return result.rows.map((notification) => ({ ...notification, readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null, createdAt: new Date(notification.createdAt).toISOString() }));
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.pool.query('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2', [notificationId, userId]);
    return (result.rowCount ?? 0) > 0;
  }
}
