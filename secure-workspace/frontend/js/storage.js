/**
 * storage.js — IndexedDB wrapper for local message, key, and audit storage.
 * All sensitive data lives here; nothing is sent to the server except encrypted blobs.
 */

const DB_NAME = 'workspace_db';
const DB_VERSION = 1;

const STORES = {
  MESSAGES: 'messages',
  KEYS: 'keys',
  ROOMS: 'rooms',
  QUEUE: 'outbox_queue',
  AUDIT: 'audit_log',
};

let db = null;

/**
 * Opens (or upgrades) the IndexedDB database.
 * Must be called once on app start before any other storage call.
 * @returns {Promise<IDBDatabase>}
 */
export async function openDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORES.MESSAGES)) {
        const msgs = database.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
        msgs.createIndex('roomId', 'roomId', { unique: false });
        msgs.createIndex('timestamp', 'timestamp', { unique: false });
        msgs.createIndex('expiresAt', 'expiresAt', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.KEYS)) {
        database.createObjectStore(STORES.KEYS, { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains(STORES.ROOMS)) {
        database.createObjectStore(STORES.ROOMS, { keyPath: 'roomId' });
      }

      if (!database.objectStoreNames.contains(STORES.QUEUE)) {
        const queue = database.createObjectStore(STORES.QUEUE, { keyPath: 'id' });
        queue.createIndex('roomId', 'roomId', { unique: false });
        queue.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.AUDIT)) {
        const audit = database.createObjectStore(STORES.AUDIT, { keyPath: 'id' });
        audit.createIndex('timestamp', 'timestamp', { unique: false });
        audit.createIndex('type', 'type', { unique: false });
      }
    };

    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Saves a message record to IndexedDB.
 * @param {object} message - Full message object (see messages.js for schema).
 */
export async function saveMessage(message) {
  await promisify(tx(STORES.MESSAGES, 'readwrite').put(message));
}

/**
 * Retrieves all messages for a room, sorted by timestamp ascending.
 * @param {string} roomId
 * @returns {Promise<object[]>}
 */
export async function getMessages(roomId) {
  const store = tx(STORES.MESSAGES);
  const index = store.index('roomId');
  const all = await promisify(index.getAll(roomId));
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Deletes a single message by ID.
 * @param {string} id
 */
export async function deleteMessage(id) {
  await promisify(tx(STORES.MESSAGES, 'readwrite').delete(id));
}

/**
 * Deletes all messages for a room (e.g. when room self-destructs).
 * @param {string} roomId
 */
export async function deleteRoomMessages(roomId) {
  const store = tx(STORES.MESSAGES, 'readwrite');
  const index = store.index('roomId');
  const keys = await promisify(index.getAllKeys(roomId));
  await Promise.all(keys.map(key => promisify(store.delete(key))));
}

/**
 * Updates a message's status field (sent / delivered / read).
 * @param {string} id
 * @param {'sent'|'delivered'|'read'} status
 */
export async function updateMessageStatus(id, status) {
  const store = tx(STORES.MESSAGES, 'readwrite');
  const msg = await promisify(store.get(id));
  if (msg) {
    msg.status = status;
    await promisify(store.put(msg));
  }
}

/**
 * Returns all messages whose expiresAt is in the past (for cleanup sweep).
 * @returns {Promise<object[]>}
 */
export async function getExpiredMessages() {
  const all = await promisify(tx(STORES.MESSAGES).getAll());
  const now = Date.now();
  return all.filter(m => m.expiresAt && m.expiresAt < now);
}

// ─── Crypto Keys ──────────────────────────────────────────────────────────────

/**
 * Stores a key material buffer (PKCS8 private key) in IndexedDB.
 * @param {string} roomId
 * @param {ArrayBuffer} privateKeyBuffer
 * @param {string} publicKeyBase64
 */
export async function saveKeyPair(roomId, privateKeyBuffer, publicKeyBase64) {
  await promisify(tx(STORES.KEYS, 'readwrite').put({
    id: `keypair:${roomId}`,
    privateKey: privateKeyBuffer,
    publicKey: publicKeyBase64,
    createdAt: Date.now(),
  }));
}

/**
 * Retrieves stored key material for a room.
 * @param {string} roomId
 * @returns {Promise<{privateKey: ArrayBuffer, publicKey: string}|null>}
 */
export async function getKeyPair(roomId) {
  const record = await promisify(tx(STORES.KEYS).get(`keypair:${roomId}`));
  return record ?? null;
}

/**
 * Stores the raw CryptoKey-derived session key fingerprint.
 * @param {string} roomId
 * @param {string} fingerprint
 */
export async function saveFingerprint(roomId, fingerprint) {
  await promisify(tx(STORES.KEYS, 'readwrite').put({
    id: `fp:${roomId}`,
    fingerprint,
    savedAt: Date.now(),
  }));
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

/**
 * Saves a room record locally.
 * @param {object} room - Room metadata (roomId, nickname, settings, etc.)
 */
export async function saveRoom(room) {
  await promisify(tx(STORES.ROOMS, 'readwrite').put(room));
}

/**
 * Returns all locally stored rooms.
 * @returns {Promise<object[]>}
 */
export async function getRooms() {
  return promisify(tx(STORES.ROOMS).getAll());
}

/**
 * Deletes a room and all its messages from local storage.
 * @param {string} roomId
 */
export async function deleteRoom(roomId) {
  await Promise.all([
    promisify(tx(STORES.ROOMS, 'readwrite').delete(roomId)),
    deleteRoomMessages(roomId),
    promisify(tx(STORES.KEYS, 'readwrite').delete(`keypair:${roomId}`)),
    promisify(tx(STORES.KEYS, 'readwrite').delete(`fp:${roomId}`)),
  ]);
}

// ─── Outbox Queue ─────────────────────────────────────────────────────────────

/**
 * Queues an outgoing message to be sent when reconnected.
 * @param {object} envelope - Serialisable message envelope.
 */
export async function enqueue(envelope) {
  await promisify(tx(STORES.QUEUE, 'readwrite').put({
    ...envelope,
    queuedAt: Date.now(),
  }));
}

/**
 * Returns all queued messages for a room, in queue order.
 * @param {string} roomId
 * @returns {Promise<object[]>}
 */
export async function getQueue(roomId) {
  const index = tx(STORES.QUEUE).index('roomId');
  const all = await promisify(index.getAll(roomId));
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

/**
 * Removes a message from the outbox queue after successful send.
 * @param {string} id
 */
export async function dequeue(id) {
  await promisify(tx(STORES.QUEUE, 'readwrite').delete(id));
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

/**
 * Appends a tamper-evident audit entry.
 * Each entry chains to the hash of the previous entry.
 * @param {string} type - Audit event type constant.
 * @param {object} details - Event-specific detail fields.
 */
export async function logAuditEvent(type, details = {}) {
  const prevHash = await getLastAuditHash();

  const entry = {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    details,
    prevHash,
  };

  entry.hash = await hashAuditEntry(entry);
  await promisify(tx(STORES.AUDIT, 'readwrite').put(entry));
}

/**
 * Returns all audit log entries sorted by timestamp.
 * @returns {Promise<object[]>}
 */
export async function getAuditLog() {
  const all = await promisify(tx(STORES.AUDIT).getAll());
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

async function getLastAuditHash() {
  const all = await promisify(tx(STORES.AUDIT).getAll());
  if (all.length === 0) return '0'.repeat(64);
  const last = all.sort((a, b) => b.timestamp - a.timestamp)[0];
  return last.hash;
}

async function hashAuditEntry(entry) {
  const data = JSON.stringify({
    id: entry.id,
    type: entry.type,
    timestamp: entry.timestamp,
    details: entry.details,
    prevHash: entry.prevHash,
  });
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
}
