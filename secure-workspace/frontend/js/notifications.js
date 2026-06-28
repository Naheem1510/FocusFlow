/**
 * notifications.js — Tab title badge, favicon swap, and Web Push registration.
 * Push notification payloads never reveal messaging context.
 */

const BASE_TITLE = 'Workspace Dashboard';
const CHAT_TITLE = 'Collaboration Stream';
const FAVICON_NORMAL = '/assets/favicon.ico';
const FAVICON_DOT = '/assets/favicon-dot.ico';

let unreadCount = 0;
let inChatView = false;

/**
 * Initialises focus listener to clear unread count when tab is focused.
 */
export function initNotifications() {
  window.addEventListener('focus', () => {
    if (inChatView) clearUnread();
  });
}

/**
 * Call when the chat view becomes visible.
 */
export function onEnterChat() {
  inChatView = true;
  if (document.hasFocus()) clearUnread();
}

/**
 * Call when the dashboard view is shown (or panic activated).
 */
export function onLeaveChat() {
  inChatView = false;
  clearUnread();
  document.title = BASE_TITLE;
  setFavicon(FAVICON_NORMAL);
}

/**
 * Increments the unread counter and updates tab title + favicon.
 * Only increments when the tab is not focused or chat is not visible.
 */
export function addUnread() {
  if (document.hasFocus() && inChatView) return;
  unreadCount++;
  document.title = `(${unreadCount}) ${inChatView ? CHAT_TITLE : BASE_TITLE}`;
  setFavicon(FAVICON_DOT);
}

/**
 * Resets unread count and restores neutral tab state.
 */
export function clearUnread() {
  unreadCount = 0;
  document.title = inChatView ? CHAT_TITLE : BASE_TITLE;
  setFavicon(FAVICON_NORMAL);
}

// ─── Web Push ─────────────────────────────────────────────────────────────────

/**
 * Requests push permission and registers a subscription with the Worker.
 * @param {string} vapidPublicKey - VAPID public key from .env.
 * @param {string} userId - Ephemeral user ID.
 * @param {string} workerUrl - Base URL of the Cloudflare Worker.
 * @returns {Promise<PushSubscription|null>}
 */
export async function registerPush(vapidPublicKey, userId, workerUrl) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    await fetch(`${workerUrl}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
    });

    return subscription;
  } catch {
    return null;
  }
}

/**
 * Sends a push notification trigger for a specific room via the Worker.
 * @param {string} targetUserId - The recipient's ephemeral user ID.
 * @param {string} roomId
 * @param {string} workerUrl
 */
export async function triggerPush(targetUserId, roomId, workerUrl) {
  try {
    await fetch(`${workerUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId, roomId }),
    });
  } catch { /* non-critical */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setFavicon(href) {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
