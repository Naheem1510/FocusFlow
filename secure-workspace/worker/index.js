/**
 * index.js — Cloudflare Worker entry point and request router.
 * Handles all HTTP and WebSocket upgrade requests.
 * Imports: Room (Durable Object), invite helpers, rate limiter, utils.
 */

import { Room } from './room.js';
import { createInvite, validateInvite, getInvite, revokeInvite } from './invite.js';
import { checkRateLimit, getClientIP } from './ratelimit.js';
import { storePushSubscription, getPushSubscription, sendPushNotification } from './push.js';
import {
  handleSyncSalt,
  handleSyncRegister,
  handleSyncPull,
  handleSyncPush,
  handleSyncRecover,
  handleSyncUpdate,
} from './sync.js';
import { handlePreKeyPublish, handlePreKeyFetch } from './prekeys.js';
import {
  jsonResponse,
  errorResponse,
  corsPreflightResponse,
  generateRoomId,
  parseJSON,
  buildHeaders,
} from './utils.js';

export { Room };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return corsPreflightResponse();
    }

    const isLocalDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!isLocalDev && url.protocol === 'http:') {
      return Response.redirect(url.href.replace('http:', 'https:'), 301);
    }

    const ip = getClientIP(request);

    try {
      if (pathname === '/api/room/create' && request.method === 'POST') {
        return handleRoomCreate(request, env, ip);
      }

      if (pathname.startsWith('/api/room/') && request.method === 'GET') {
        const roomId = pathname.split('/')[3];
        return handleRoomGet(request, env, roomId);
      }

      if (pathname.startsWith('/api/room/') && pathname.endsWith('/join') && request.method === 'POST') {
        const roomId = pathname.split('/')[3];
        return handleRoomJoin(request, env, ip, roomId);
      }

      if (pathname.startsWith('/api/room/') && request.method === 'DELETE') {
        const roomId = pathname.split('/')[3];
        return handleRoomDelete(request, env, roomId);
      }

      if (pathname === '/api/invite/validate' && request.method === 'POST') {
        return handleInviteValidate(request, env, ip);
      }

      if (pathname.startsWith('/api/invite/') && request.method === 'GET') {
        const token = pathname.split('/')[3];
        return handleInviteGet(request, env, token);
      }

      if (pathname.startsWith('/ws/') && request.headers.get('Upgrade') === 'websocket') {
        const roomId = pathname.split('/')[2];
        return handleWebSocket(request, env, roomId);
      }

      if (pathname.startsWith('/api/keys/') && request.method === 'POST') {
        const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'general');
        if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);
        return handlePreKeyPublish(request, env, pathname.split('/')[3]);
      }

      if (pathname.startsWith('/api/keys/') && request.method === 'GET') {
        const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'general');
        if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);
        return handlePreKeyFetch(request, env, pathname.split('/')[3]);
      }

      if (pathname === '/api/sync/salt' && request.method === 'POST') {
        const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'general');
        if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);
        return handleSyncSalt(request, env);
      }

      if (pathname === '/api/sync/register' && request.method === 'POST') {
        const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'general');
        if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);
        return handleSyncRegister(request, env);
      }

      if (pathname === '/api/sync/pull' && request.method === 'POST') {
        return handleSyncPull(request, env);
      }

      if (pathname === '/api/sync/push' && request.method === 'POST') {
        return handleSyncPush(request, env);
      }

      if (pathname === '/api/sync/recover' && request.method === 'POST') {
        const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'general');
        if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);
        return handleSyncRecover(request, env);
      }

      if (pathname === '/api/sync/update' && request.method === 'POST') {
        return handleSyncUpdate(request, env);
      }

      if (pathname === '/api/push/subscribe' && request.method === 'POST') {
        return handlePushSubscribe(request, env);
      }

      if (pathname === '/api/push/send' && request.method === 'POST') {
        return handlePushSend(request, env);
      }

      if (pathname === '/api/upload' && request.method === 'POST') {
        return handleFileUpload(request, env, ip);
      }

      if (pathname.startsWith('/api/blob/') && request.method === 'GET') {
        const blobId = pathname.split('/')[3];
        return handleBlobDownload(request, env, blobId);
      }

      return new Response('Not found', {
        status: 404,
        headers: buildHeaders({ 'Content-Type': 'text/plain' }),
      });
    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse('Internal server error', 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupExpiredBlobs(env));
  },
};

async function handleRoomCreate(request, env, ip) {
  const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'room_create');
  if (!rl.allowed) {
    return errorResponse('Rate limit exceeded. Try again later.', 429);
  }

  const body = await parseJSON(request);
  if (!body) return errorResponse('Invalid JSON');

  const {
    creatorId,
    inviteExpiry = '7d',
    oneTimeInvite = false,
    messageDeleteMode = '7d',
    selfDestructAfter = '7d',
    roomPassword = null,
  } = body;

  if (!creatorId || typeof creatorId !== 'string') {
    return errorResponse('creatorId required');
  }

  const roomId = generateRoomId();
  const now = Date.now();

  const roomRecord = {
    roomId,
    creatorId,
    createdAt: now,
    messageDeleteMode,
    selfDestructAfter,
    hasPassword: !!roomPassword,
    memberCount: 0,
  };

  if (roomPassword) {
    roomRecord.passwordHash = roomPassword;
  }

  await env.WORKSPACE_KV.put(`room:${roomId}`, JSON.stringify(roomRecord), {
    expirationTtl: 30 * 24 * 60 * 60,
  });

  const { token, expiresAt } = await createInvite(env.WORKSPACE_KV, {
    roomId,
    creatorId,
    expiry: inviteExpiry,
    oneTime: oneTimeInvite,
  });

  return jsonResponse({ roomId, token, expiresAt, createdAt: now });
}

async function handleRoomGet(request, env, roomId) {
  const rl = await checkRateLimit(env.WORKSPACE_KV, getClientIP(request), 'general');
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);

  const raw = await env.WORKSPACE_KV.get(`room:${roomId}`);
  if (!raw) return errorResponse('Room not found', 404);

  const room = JSON.parse(raw);
  const { passwordHash, ...safeRoom } = room;

  return jsonResponse(safeRoom);
}

async function handleRoomJoin(request, env, ip, roomId) {
  const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'join');
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);

  const body = await parseJSON(request);
  if (!body) return errorResponse('Invalid JSON');

  const { token, userId, password } = body;
  if (!token || !userId) return errorResponse('token and userId required');

  const result = await validateInvite(env.WORKSPACE_KV, token);
  if (!result.valid) return errorResponse(result.reason, 403);
  if (result.record.roomId !== roomId) return errorResponse('Token/room mismatch', 403);

  const raw = await env.WORKSPACE_KV.get(`room:${roomId}`);
  if (!raw) return errorResponse('Room not found', 404);

  const room = JSON.parse(raw);

  if (room.hasPassword) {
    if (!password) return jsonResponse({ requiresPassword: true }, 401);
    if (room.passwordHash !== password) {
      await trackFailedPasswordAttempt(env.WORKSPACE_KV, ip, token);
      return errorResponse('Incorrect room password', 403);
    }
  }

  return jsonResponse({
    approved: true,
    roomId,
    messageDeleteMode: room.messageDeleteMode,
    selfDestructAfter: room.selfDestructAfter,
  });
}

async function handleRoomDelete(request, env, roomId) {
  const body = await parseJSON(request);
  if (!body) return errorResponse('Invalid JSON');

  const { creatorId } = body;
  if (!creatorId) return errorResponse('creatorId required');

  const raw = await env.WORKSPACE_KV.get(`room:${roomId}`);
  if (!raw) return errorResponse('Room not found', 404);

  const room = JSON.parse(raw);
  if (room.creatorId !== creatorId) return errorResponse('Unauthorized', 403);

  await env.WORKSPACE_KV.delete(`room:${roomId}`);

  return jsonResponse({ deleted: true, roomId });
}

async function handleInviteValidate(request, env, ip) {
  const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'invite');
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);

  const body = await parseJSON(request);
  if (!body?.token) return errorResponse('token required');

  const result = await validateInvite(env.WORKSPACE_KV, body.token);
  if (!result.valid) return errorResponse(result.reason, 403);

  return jsonResponse({ valid: true, roomId: result.record.roomId });
}

async function handleInviteGet(request, env, token) {
  const record = await getInvite(env.WORKSPACE_KV, token);
  if (!record) return errorResponse('Invite not found', 404);
  if (record.expiresAt && Date.now() > record.expiresAt) return errorResponse('Invite expired', 410);

  return jsonResponse({
    roomId: record.roomId,
    oneTime: record.oneTime,
    expiresAt: record.expiresAt,
  });
}

async function handleWebSocket(request, env, roomId) {
  const raw = await env.WORKSPACE_KV.get(`room:${roomId}`);
  if (!raw) return errorResponse('Room not found', 404);

  const doId = env.ROOMS.idFromName(roomId);
  const doStub = env.ROOMS.get(doId);
  return doStub.fetch(request);
}

async function handlePushSubscribe(request, env) {
  const body = await parseJSON(request);
  if (!body?.userId || !body?.subscription) return errorResponse('userId and subscription required');

  await storePushSubscription(env.WORKSPACE_KV, body.userId, body.subscription);
  return jsonResponse({ stored: true });
}

async function handlePushSend(request, env) {
  const body = await parseJSON(request);
  if (!body?.userId || !body?.roomId) return errorResponse('userId and roomId required');

  const subscription = await getPushSubscription(env.WORKSPACE_KV, body.userId);
  if (!subscription) return jsonResponse({ sent: false, reason: 'No subscription' });

  const sent = await sendPushNotification(
    subscription,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
    env.VAPID_SUBJECT,
    { roomId: body.roomId },
  );

  return jsonResponse({ sent });
}

async function handleFileUpload(request, env, ip) {
  const rl = await checkRateLimit(env.WORKSPACE_KV, ip, 'general');
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429);

  const contentLength = parseInt(request.headers.get('Content-Length') || '0');
  const MAX_SIZE = 10 * 1024 * 1024;
  if (contentLength > MAX_SIZE) return errorResponse('File too large (max 10 MB)', 413);

  const blobId = crypto.randomUUID();
  const buffer = await request.arrayBuffer();

  if (buffer.byteLength > MAX_SIZE) return errorResponse('File too large (max 10 MB)', 413);

  const expiresAt = Date.now() + 48 * 60 * 60 * 1000;

  await env.WORKSPACE_R2.put(blobId, buffer, {
    customMetadata: { expiresAt: String(expiresAt) },
  });

  await env.WORKSPACE_KV.put(`blob:${blobId}`, JSON.stringify({ expiresAt }), {
    expirationTtl: 48 * 60 * 60,
  });

  return jsonResponse({ blobId, expiresAt });
}

async function handleBlobDownload(request, env, blobId) {
  const meta = await env.WORKSPACE_KV.get(`blob:${blobId}`);
  if (!meta) return errorResponse('Blob not found or expired', 404);

  const object = await env.WORKSPACE_R2.get(blobId);
  if (!object) return errorResponse('Blob not found', 404);

  return new Response(object.body, {
    headers: buildHeaders({
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
    }),
  });
}

async function cleanupExpiredBlobs(env) {
  const list = await env.WORKSPACE_KV.list({ prefix: 'blob:' });
  const now = Date.now();

  for (const key of list.keys) {
    const raw = await env.WORKSPACE_KV.get(key.name);
    if (!raw) continue;
    const { expiresAt } = JSON.parse(raw);
    if (expiresAt && now > expiresAt) {
      const blobId = key.name.replace('blob:', '');
      await Promise.all([
        env.WORKSPACE_R2.delete(blobId),
        env.WORKSPACE_KV.delete(key.name),
      ]);
    }
  }
}

async function trackFailedPasswordAttempt(kv, ip, token) {
  const key = `pwfail:${ip}:${token}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) + 1 : 1;
  await kv.put(key, String(count), { expirationTtl: 600 });

  if (count >= 5) {
    await revokeInvite(kv, token);
  }
}
