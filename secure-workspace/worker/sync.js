/**
 * sync.js — Zero-knowledge encrypted blob sync for the FocusFlow account.
 *
 * The server stores only ciphertext. It never sees the passphrase, the recovery
 * key, or the data encryption key (DEK).
 *
 * Envelope model: data is encrypted with a random DEK. The DEK is wrapped
 * (encrypted) twice — once under a passphrase-derived key, once under a
 * recovery-key-derived key — so either secret can recover the data. The server
 * only holds the two WRAPPED DEKs (ciphertext) plus SHA-256 verifiers of the two
 * auth tokens, so it can neither decrypt the data nor reproduce a token.
 *
 * KV record at `sync:<accountId>`:
 *   { salt, authVerifier, payload:{iv,ct}, version, updatedAt,
 *     recoverySalt, recoveryVerifier, wrapPass:{iv,ct}, wrapRec:{iv,ct} }
 */

import { jsonResponse, errorResponse, parseJSON } from './utils.js';

const MAX_ACCOUNT_ID = 200;
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB of ciphertext is plenty

const kvKey = (accountId) => `sync:${accountId}`;

async function sha256Base64(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

const validAccountId = (id) =>
  typeof id === 'string' && id.length > 0 && id.length <= MAX_ACCOUNT_ID;

const validBlob = (p) =>
  p && typeof p.iv === 'string' && typeof p.ct === 'string' && p.ct.length <= MAX_PAYLOAD_BYTES;

/** POST /api/sync/salt — public salts for an account (or report absence). */
export async function handleSyncSalt(request, env) {
  const body = await parseJSON(request);
  if (!validAccountId(body?.accountId)) return errorResponse('accountId required');

  const raw = await env.WORKSPACE_KV.get(kvKey(body.accountId));
  if (!raw) return jsonResponse({ exists: false });

  const record = JSON.parse(raw);
  return jsonResponse({
    exists: true,
    salt: record.salt,
    recoverySalt: record.recoverySalt ?? null,
    hasRecovery: !!record.recoveryVerifier,
  });
}

/** POST /api/sync/register — claim a new account slot with its first ciphertext. */
export async function handleSyncRegister(request, env) {
  const body = await parseJSON(request);
  if (!validAccountId(body?.accountId)) return errorResponse('accountId required');
  if (typeof body.salt !== 'string' || typeof body.authVerifier !== 'string') {
    return errorResponse('salt and authVerifier required');
  }
  if (!validBlob(body.payload)) return errorResponse('valid payload required');

  const key = kvKey(body.accountId);
  if (await env.WORKSPACE_KV.get(key)) return errorResponse('Account already exists', 409);

  const record = {
    salt: body.salt,
    authVerifier: body.authVerifier,
    payload: body.payload,
    version: 1,
    updatedAt: Date.now(),
    // Recovery envelope (optional, but the current client always sends it).
    recoverySalt: typeof body.recoverySalt === 'string' ? body.recoverySalt : null,
    recoveryVerifier: typeof body.recoveryVerifier === 'string' ? body.recoveryVerifier : null,
    wrapPass: validBlob(body.wrapPass) ? body.wrapPass : null,
    wrapRec: validBlob(body.wrapRec) ? body.wrapRec : null,
  };
  await env.WORKSPACE_KV.put(key, JSON.stringify(record));
  return jsonResponse({ ok: true, version: 1 });
}

async function loadAuthed(env, accountId, token, verifierField) {
  if (!validAccountId(accountId) || typeof token !== 'string') return null;
  const raw = await env.WORKSPACE_KV.get(kvKey(accountId));
  if (!raw) return null;
  const record = JSON.parse(raw);
  const verifier = await sha256Base64(token);
  if (!record[verifierField] || verifier !== record[verifierField]) return null;
  return record;
}

/** POST /api/sync/pull — ciphertext + the passphrase-wrapped DEK (passphrase auth). */
export async function handleSyncPull(request, env) {
  const body = await parseJSON(request);
  const record = await loadAuthed(env, body?.accountId, body?.authToken, 'authVerifier');
  if (!record) return errorResponse('Unauthorized', 401);
  return jsonResponse({
    payload: record.payload,
    wrap: record.wrapPass ?? null,
    version: record.version,
    updatedAt: record.updatedAt,
  });
}

/** POST /api/sync/push — overwrite the stored ciphertext (last-write-wins). */
export async function handleSyncPush(request, env) {
  const body = await parseJSON(request);
  const record = await loadAuthed(env, body?.accountId, body?.authToken, 'authVerifier');
  if (!record) return errorResponse('Unauthorized', 401);
  if (!validBlob(body.payload)) return errorResponse('valid payload required');

  record.payload = body.payload;
  record.version += 1;
  record.updatedAt = Date.now();
  await env.WORKSPACE_KV.put(kvKey(body.accountId), JSON.stringify(record));
  return jsonResponse({ ok: true, version: record.version, updatedAt: record.updatedAt });
}

/** POST /api/sync/recover — ciphertext + recovery-wrapped DEK (recovery-key auth). */
export async function handleSyncRecover(request, env) {
  const body = await parseJSON(request);
  const record = await loadAuthed(env, body?.accountId, body?.recoveryToken, 'recoveryVerifier');
  if (!record) return errorResponse('Unauthorized', 401);
  if (!record.wrapRec) return errorResponse('No recovery key set for this account', 404);
  return jsonResponse({ payload: record.payload, wrap: record.wrapRec });
}

/**
 * POST /api/sync/update — update the security envelope. Authenticates with EITHER
 * the passphrase authToken (e.g. regenerating the recovery key) OR the recovery
 * token (e.g. resetting the passphrase after recovery). Only updates the fields
 * provided.
 */
export async function handleSyncUpdate(request, env) {
  const body = await parseJSON(request);
  let record = await loadAuthed(env, body?.accountId, body?.authToken, 'authVerifier');
  if (!record) {
    record = await loadAuthed(env, body?.accountId, body?.recoveryToken, 'recoveryVerifier');
  }
  if (!record) return errorResponse('Unauthorized', 401);

  if (typeof body.salt === 'string') record.salt = body.salt;
  if (typeof body.authVerifier === 'string') record.authVerifier = body.authVerifier;
  if (typeof body.recoverySalt === 'string') record.recoverySalt = body.recoverySalt;
  if (typeof body.recoveryVerifier === 'string') record.recoveryVerifier = body.recoveryVerifier;
  if (validBlob(body.wrapPass)) record.wrapPass = body.wrapPass;
  if (validBlob(body.wrapRec)) record.wrapRec = body.wrapRec;
  if (validBlob(body.payload)) record.payload = body.payload;

  record.version += 1;
  record.updatedAt = Date.now();
  await env.WORKSPACE_KV.put(kvKey(body.accountId), JSON.stringify(record));
  return jsonResponse({ ok: true, version: record.version });
}
