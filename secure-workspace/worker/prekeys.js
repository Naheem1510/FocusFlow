/**
 * prekeys.js — X3DH prekey distribution (KV-backed).
 *
 * Stores each user's PUBLIC identity key + a pool of one-time prekeys so a sender
 * can derive a fresh, forward-secret shared key with a recipient who is offline.
 * The server only ever holds public keys; it never sees a private key or
 * plaintext. One-time prekeys are popped on fetch (single use).
 *
 * KV shape:  prekeys:<userId> → { identityKey, opks: [{ id, key }], updatedAt }
 */

import { jsonResponse, errorResponse } from './utils.js';

const KEY = (userId) => `prekeys:${userId}`;
const MAX_OPKS = 200;
const TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days

/** POST /api/keys/:userId — publish/merge a prekey bundle. */
export async function handlePreKeyPublish(request, env, userId) {
  if (!userId) return errorResponse('userId required');

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON');
  }

  const { identityKey, oneTimePreKeys } = body || {};
  if (typeof identityKey !== 'string') return errorResponse('identityKey required');

  const raw = await env.WORKSPACE_KV.get(KEY(userId));
  const record = raw ? JSON.parse(raw) : { identityKey, opks: [] };
  record.identityKey = identityKey;

  if (Array.isArray(oneTimePreKeys)) {
    const existing = new Set(record.opks.map((o) => o.id));
    for (const opk of oneTimePreKeys) {
      if (opk && typeof opk.id === 'string' && typeof opk.key === 'string' && !existing.has(opk.id)) {
        record.opks.push({ id: opk.id, key: opk.key });
      }
    }
    // Cap the pool so a client can't grow it unbounded.
    if (record.opks.length > MAX_OPKS) record.opks = record.opks.slice(-MAX_OPKS);
  }

  record.updatedAt = Date.now();
  await env.WORKSPACE_KV.put(KEY(userId), JSON.stringify(record), { expirationTtl: TTL_SECONDS });

  return jsonResponse({ stored: true, remaining: record.opks.length });
}

/** GET /api/keys/:userId — fetch the bundle, popping one one-time prekey. */
export async function handlePreKeyFetch(request, env, userId) {
  if (!userId) return errorResponse('userId required');

  const raw = await env.WORKSPACE_KV.get(KEY(userId));
  if (!raw) return errorResponse('No prekeys for user', 404);

  const record = JSON.parse(raw);
  const opk = record.opks.shift() || null; // single-use: remove from pool

  // Persist the consumed pool (best-effort; KV is eventually consistent).
  await env.WORKSPACE_KV.put(KEY(userId), JSON.stringify(record), { expirationTtl: TTL_SECONDS });

  return jsonResponse({
    identityKey: record.identityKey,
    oneTimePreKey: opk, // { id, key } or null when the pool is exhausted
    remaining: record.opks.length,
  });
}
