import type { NotificationMessage } from './types.js';

export interface NotificationChannel {
  send(notification: NotificationMessage): Promise<void>;
}

export class ConsoleEmailChannel implements NotificationChannel {
  async send(notification: NotificationMessage) {
    console.info(JSON.stringify({ channel: 'email', toUserId: notification.userId, type: notification.type, bookingId: notification.bookingId, message: notification.message }));
  }
}
