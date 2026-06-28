/**
 * push.js — Web Push notification dispatch via VAPID.
 * Notification payloads never reveal messaging context.
 */

const PUSH_MESSAGES = [
  'Workspace updated',
  'New activity in your workspace',
  'Project status changed',
  'Team member left a comment',
  'Document review requested',
];

/**
 * Returns a random non-specific push notification title.
 * @returns {string}
 */
function getPushTitle() {
  return PUSH_MESSAGES[Math.floor(Math.random() * PUSH_MESSAGES.length)];
}

/**
 * Sends a Web Push notification to a stored subscription endpoint.
 * Uses the Web Push protocol with VAPID authentication.
 *
 * @param {object} subscription - PushSubscription JSON object from browser.
 * @param {string} vapidPublicKey - VAPID public key.
 * @param {string} vapidPrivateKey - VAPID private key.
 * @param {string} vapidSubject - VAPID contact mailto: URI.
 * @param {object} payload - Notification data (roomId, etc.).
 * @returns {Promise<boolean>} True if delivered, false if subscription expired.
 */
export async function sendPushNotification(
  subscription,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
  payload,
) {
  const notification = {
    title: 'Workspace Dashboard',
    body: getPushTitle(),
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    data: { roomId: payload.roomId },
    tag: `room-${payload.roomId}`,
    renotify: true,
  };

  const body = JSON.stringify(notification);

  const headers = await buildVapidHeaders(
    subscription.endpoint,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  );

  headers['Content-Type'] = 'application/json';
  headers['Content-Encoding'] = 'aes128gcm';
  headers['TTL'] = '86400';

  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body,
    });

    if (response.status === 410 || response.status === 404) {
      return false;
    }

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Stores a push subscription in KV under the user's ephemeral ID.
 *
 * @param {KVNamespace} kv
 * @param {string} userId - Ephemeral user ID.
 * @param {object} subscription - PushSubscription JSON.
 * @returns {Promise<void>}
 */
export async function storePushSubscription(kv, userId, subscription) {
  await kv.put(`push:${userId}`, JSON.stringify(subscription), {
    expirationTtl: 30 * 24 * 60 * 60,
  });
}

/**
 * Retrieves a stored push subscription.
 *
 * @param {KVNamespace} kv
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getPushSubscription(kv, userId) {
  const raw = await kv.get(`push:${userId}`);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Builds VAPID Authorization and Crypto-Key headers.
 * Minimal implementation for Cloudflare Workers environment.
 *
 * @param {string} endpoint - Push endpoint URL.
 * @param {string} publicKey - VAPID public key (base64url).
 * @param {string} privateKey - VAPID private key (base64url).
 * @param {string} subject - mailto: URI.
 * @returns {Promise<Record<string,string>>}
 */
async function buildVapidHeaders(endpoint, publicKey, privateKey, subject) {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const payload = btoa(JSON.stringify({
    aud: audience,
    exp: now + 43200,
    sub: subject,
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const sigInput = `${header}.${payload}`;

  const keyData = base64urlDecode(privateKey);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(sigInput),
  );

  const token = `${sigInput}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  return {
    Authorization: `vapid t=${token},k=${publicKey}`,
  };
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='));
  return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}
