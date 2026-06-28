/**
 * ratelimit.js — IP-based rate limiting using Cloudflare KV.
 * Sliding window counter: tracks request count per IP per minute.
 */

const LIMITS = {
  'room_create': 10,
  'general': 30,
  'join': 20,
  'invite': 20,
};

const WINDOW_SECONDS = 60;

/**
 * Checks rate limit for a given IP and action type.
 * Throws if the limit is exceeded.
 *
 * @param {KVNamespace} kv - Cloudflare KV namespace.
 * @param {string} ip - Client IP address.
 * @param {string} action - Action type key from LIMITS.
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
 */
export async function checkRateLimit(kv, ip, action = 'general') {
  const limit = LIMITS[action] ?? LIMITS['general'];
  const windowStart = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `rl:${action}:${ip}:${windowStart}`;

  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: (windowStart + 1) * WINDOW_SECONDS * 1000,
    };
  }

  await kv.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS * 2 });

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt: (windowStart + 1) * WINDOW_SECONDS * 1000,
  };
}

/**
 * Extracts the real client IP from Cloudflare request headers.
 * @param {Request} request
 * @returns {string}
 */
export function getClientIP(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
    '0.0.0.0'
  );
}
