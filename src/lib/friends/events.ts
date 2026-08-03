/**
 * Lightweight event bus for friend-graph changes.
 * Future push/in-app notifications can subscribe without touching UI code.
 */

import type { FriendRequest, Friendship } from './types';

export type FriendEvent =
  | { type: 'request_sent'; request: FriendRequest }
  | { type: 'request_accepted'; request: FriendRequest; friendship: Friendship }
  | { type: 'request_declined'; request: FriendRequest }
  | { type: 'request_canceled'; request: FriendRequest }
  | { type: 'friend_removed'; userId: string; friendshipId?: string };

type Listener = (event: FriendEvent) => void;

const listeners = new Set<Listener>();

export function subscribeFriendEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitFriendEvent(event: FriendEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn('[friends] event listener failed', error);
    }
  }
}
