/**
 * invite.js — Invite token generation, KV storage, validation, and expiry.
 * Tokens are 128-bit cryptographically random base64url strings.
 */

import { generateToken } from './utils.js';

const KV_PREFIX = 'invite:';
const EXPIRY_OPTIONS_MS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  'never': null,
};

/**
 * Creates a new invite token and stores it in KV.
 *
 * @param {KVNamespace} kv - Cloudflare KV namespace.
 * @param {object} opts
 * @param {string} opts.roomId - Room ID this invite grants access to.
 * @param {string} opts.creatorId - Ephemeral creator ID.
 * @param {'1h'|'24h'|'7d'|'never'} opts.expiry - Token lifetime.
 * @param {boolean} opts.oneTime - Whether token can only be used once.
 * @returns {Promise<{token: string, expiresAt: number|null}>}
 */
export async function createInvite(kv, { roomId, creatorId, expiry = '7d', oneTime = false }) {
  const token = generateToken();
  const now = Date.now();
  // Use `in` rather than `??`: 'never' maps to a deliberate null (no expiry),
  // which `??` would wrongly treat as "missing" and fall back to 7d.
  const ttlMs = expiry in EXPIRY_OPTIONS_MS ? EXPIRY_OPTIONS_MS[expiry] : EXPIRY_OPTIONS_MS['7d'];
  const expiresAt = ttlMs ? now + ttlMs : null;

  const record = {
    roomId,
    createdAt: now,
    expiresAt,
    oneTime,
    used: false,
    creatorId,
  };

  const kvOpts = expiresAt
    ? { expirationTtl: Math.ceil(ttlMs / 1000) }
    : {};

  await kv.put(`${KV_PREFIX}${token}`, JSON.stringify(record), kvOpts);

  return { token, expiresAt };
}

/**
 * Validates an invite token. Returns the invite record on success.
 * Marks one-time tokens as used.
 *
 * @param {KVNamespace} kv
 * @param {string} token
 * @returns {Promise<{valid: boolean, record?: object, reason?: string}>}
 */
export async function validateInvite(kv, token) {
  const raw = await kv.get(`${KV_PREFIX}${token}`);
  if (!raw) {
    return { valid: false, reason: 'Token not found or expired' };
  }

  const record = JSON.parse(raw);

  if (record.expiresAt && Date.now() > record.expiresAt) {
    await kv.delete(`${KV_PREFIX}${token}`);
    return { valid: false, reason: 'Token expired' };
  }

  if (record.oneTime && record.used) {
    return { valid: false, reason: 'Token already used' };
  }

  if (record.oneTime) {
    record.used = true;
    const remainingTtl = record.expiresAt
      ? Math.ceil((record.expiresAt - Date.now()) / 1000)
      : undefined;
    const kvOpts = remainingTtl ? { expirationTtl: remainingTtl } : {};
    await kv.put(`${KV_PREFIX}${token}`, JSON.stringify(record), kvOpts);
  }

  return { valid: true, record };
}

/**
 * Retrieves invite metadata without marking as used (read-only lookup).
 *
 * @param {KVNamespace} kv
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function getInvite(kv, token) {
  const raw = await kv.get(`${KV_PREFIX}${token}`);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Revokes an invite token immediately.
 *
 * @param {KVNamespace} kv
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function revokeInvite(kv, token) {
  await kv.delete(`${KV_PREFIX}${token}`);
}
