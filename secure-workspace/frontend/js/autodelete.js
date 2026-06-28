/**
 * autodelete.js — Message expiry timers and view-once deletion logic.
 * Deletes from both the DOM and IndexedDB — not just hidden.
 */

import { deleteMessage } from './storage.js';

/** @type {Map<string, ReturnType<setTimeout>>} messageId → timer handle */
const expiryTimers = new Map();

/**
 * Schedules a message for auto-deletion at its expiresAt timestamp.
 * If the message is already expired, deletes it immediately.
 *
 * @param {object} message - Message record with id, expiresAt, roomId.
 * @param {Function} onDelete - Callback called with messageId after deletion.
 */
export function scheduleExpiry(message, onDelete) {
  if (!message.expiresAt) return;

  const delay = message.expiresAt - Date.now();

  if (delay <= 0) {
    deleteMessageNow(message.id, onDelete);
    return;
  }

  const timer = setTimeout(() => deleteMessageNow(message.id, onDelete), delay);
  expiryTimers.set(message.id, timer);
}

/**
 * Cancels an expiry timer (e.g. if message was manually deleted).
 * @param {string} messageId
 */
export function cancelExpiry(messageId) {
  const timer = expiryTimers.get(messageId);
  if (timer !== undefined) {
    clearTimeout(timer);
    expiryTimers.delete(messageId);
  }
}

/**
 * Marks a view-once message as read and deletes it after a short grace period.
 * Triggers on: recipient tab focus, scroll-into-view, or tab visibility change.
 *
 * @param {string} messageId
 * @param {Function} onDelete
 */
export function scheduleViewOnceDelete(messageId, onDelete) {
  if (expiryTimers.has(messageId)) return;

  // Short grace period lets the user see the message before it disappears
  const timer = setTimeout(() => deleteMessageNow(messageId, onDelete), 3000);
  expiryTimers.set(messageId, timer);
}

/**
 * Immediately deletes a message from DOM and IndexedDB.
 * @param {string} messageId
 * @param {Function} [onDelete]
 */
export async function deleteMessageNow(messageId, onDelete) {
  cancelExpiry(messageId);

  // Remove from DOM
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (el) {
    el.classList.add('message--deleting');
    setTimeout(() => el.remove(), 150);
  }

  // Remove from IndexedDB
  await deleteMessage(messageId);

  onDelete?.(messageId);
}

/**
 * Sweeps the loaded message list and schedules expiry for all messages
 * that have a non-null expiresAt. Call on room load and after reconnect.
 *
 * @param {object[]} messages - Array of message records.
 * @param {Function} onDelete
 */
export function sweepExpiredMessages(messages, onDelete) {
  for (const msg of messages) {
    if (msg.expiresAt) {
      scheduleExpiry(msg, onDelete);
    }
    if (msg.viewOnce && msg.status === 'read') {
      deleteMessageNow(msg.id, onDelete);
    }
  }
}

/**
 * Registers a visibility-change listener to trigger view-once deletion
 * when the user switches away from the tab.
 * @param {string[]} viewOnceIds - Array of message IDs that are view-once.
 * @param {Function} onDelete
 */
export function watchViewOnce(viewOnceIds, onDelete) {
  if (viewOnceIds.length === 0) return;

  const handler = () => {
    if (document.visibilityState === 'hidden') {
      for (const id of viewOnceIds) {
        scheduleViewOnceDelete(id, onDelete);
      }
    }
  };

  document.addEventListener('visibilitychange', handler, { once: true });
}
