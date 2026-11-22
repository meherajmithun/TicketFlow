import type { NotificationChannel } from './channels.js';
import { PgNotificationRepository } from './repository.js';
import type { NotificationMessage } from './types.js';

export class NotificationService {
  constructor(private readonly notifications: PgNotificationRepository, private readonly channels: NotificationChannel[]) {}

  async publish(message: NotificationMessage) {
    if (!(await this.notifications.createIfMissing(message))) return;
    await Promise.all(this.channels.map((channel) => channel.send(message)));
  }

  listForUser(userId: string) { return this.notifications.listForUser(userId); }
  markRead(userId: string, notificationId: string) { return this.notifications.markRead(userId, notificationId); }
}
