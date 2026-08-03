/**
 * Lightweight event bus for notification writes/reads.
 * Future push delivery can subscribe without touching UI.
 */

import type { AppNotification } from './types';

export type NotificationBusEvent =
  | { type: 'created'; notification: AppNotification }
  | { type: 'read'; ids: string[] }
  | { type: 'refreshed' };

type Listener = (event: NotificationBusEvent) => void;

const listeners = new Set<Listener>();

export function subscribeNotificationEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNotificationEvent(event: NotificationBusEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn('[notifications] event listener failed', error);
    }
  }
}
