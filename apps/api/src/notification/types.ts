export type NotificationType = 'booking_confirmed' | 'booking_cancelled';
export type Notification = { id: string; userId: string; bookingId: string; type: NotificationType; message: string; readAt: string | null; createdAt: string };
export type NotificationMessage = { userId: string; bookingId: string; type: NotificationType; message: string };
