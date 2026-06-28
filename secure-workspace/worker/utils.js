/**
 * utils.js — Shared helpers: security headers, CORS, error responses.
 * Imported by index.js and room.js.
 */

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' cdnjs.cloudflare.com fonts.googleapis.com; " +
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com fonts.gstatic.com; " +
    "font-src fonts.gstatic.com; connect-src 'self' wss:; img-src 'self' data: blob:; " +
    "worker-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/**
 * Merges security + CORS headers with any additional headers.
 * @param {Record<string,string>} extra - Additional headers to include.
 * @returns {Record<string,string>}
 */
export function buildHeaders(extra = {}) {
  return { ...SECURITY_HEADERS, ...CORS_HEADERS, ...extra };
}

/**
 * Returns a JSON response with security headers applied.
 * @param {unknown} data - JSON-serialisable response body.
 * @param {number} status - HTTP status code.
 * @returns {Response}
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
  });
}

/**
 * Returns a standardised error response.
 * @param {string} message - Human-readable error message.
 * @param {number} status - HTTP status code.
 * @returns {Response}
 */
export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message, status }, status);
}

/**
 * Returns a 204 No Content response for OPTIONS preflight requests.
 * @returns {Response}
 */
export function corsPreflightResponse() {
  return new Response(null, { status: 204, headers: buildHeaders() });
}

/**
 * Generates a cryptographically random 128-bit base64url token (22 chars).
 * @returns {string}
 */
export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generates a random 8-character alphanumeric room ID.
 * @returns {string}
 */
export function generateRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
}

/**
 * Parses a JSON request body safely; returns null on failure.
 * @param {Request} request
 * @returns {Promise<unknown|null>}
 */
export async function parseJSON(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
