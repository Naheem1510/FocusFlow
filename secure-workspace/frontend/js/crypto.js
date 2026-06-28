/**
 * crypto.js — All end-to-end encryption via Web Crypto API only.
 * Provides: ECDH key exchange, HKDF key derivation, AES-GCM encrypt/decrypt,
 * PBKDF2 PIN hashing, key fingerprint generation.
 * NO external libraries. All keys stay in the browser.
 */

const CURVE = 'P-256';
const HKDF_INFO = new TextEncoder().encode('secure-workspace-v1');
const HKDF_SALT = new Uint8Array(32);
const PBKDF2_ITERATIONS = 100_000;
const AES_KEY_LENGTH = 256;

// ─── ECDH Key Exchange ────────────────────────────────────────────────────────

/**
 * Generates an ECDH P-256 key pair for this session.
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveKey'],
  );
}

/**
 * Exports a public key as a base64-encoded SPKI string safe to share.
 * @param {CryptoKey} publicKey
 * @returns {Promise<string>}
 */
export async function exportPublicKey(publicKey) {
  const raw = await crypto.subtle.exportKey('spki', publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

/**
 * Imports a base64-encoded SPKI public key string into a CryptoKey.
 * @param {string} base64Key
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKey(base64Key) {
  const binary = atob(base64Key);
  const buffer = Uint8Array.from(binary, c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'spki',
    buffer,
    { name: 'ECDH', namedCurve: CURVE },
    true,
    [],
  );
}

/**
 * Exports a private key as PKCS8 for IndexedDB storage.
 * @param {CryptoKey} privateKey
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportPrivateKey(privateKey) {
  return crypto.subtle.exportKey('pkcs8', privateKey);
}

/**
 * Imports a stored PKCS8 private key back into a CryptoKey.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<CryptoKey>}
 */
export async function importPrivateKey(buffer) {
  return crypto.subtle.importKey(
    'pkcs8',
    buffer,
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveKey'],
  );
}

// ─── Key Derivation ───────────────────────────────────────────────────────────

/**
 * Derives a shared AES-GCM-256 session key from an ECDH key exchange.
 * Uses HKDF with SHA-256 to stretch and domain-separate the shared secret.
 *
 * @param {CryptoKey} myPrivateKey - This device's ECDH private key.
 * @param {CryptoKey} theirPublicKey - The remote peer's ECDH public key.
 * @returns {Promise<CryptoKey>} AES-GCM-256 key for encrypt/decrypt.
 */
export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  const ecdhKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: HKDF_INFO,
    },
    ecdhKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ─── AES-GCM Encryption ───────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string with AES-GCM-256.
 * A fresh random 96-bit IV is generated for every message.
 *
 * @param {CryptoKey} sessionKey - AES-GCM key from deriveSharedKey.
 * @param {string} plaintext - The message to encrypt.
 * @returns {Promise<{iv: string, ciphertext: string}>} Base64-encoded iv and ciphertext.
 */
export async function encryptMessage(sessionKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    encoded,
  );

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(cipherBuffer)),
  };
}

/**
 * Decrypts a received AES-GCM ciphertext back to plaintext.
 *
 * @param {CryptoKey} sessionKey
 * @param {string} ivBase64 - Base64-encoded IV.
 * @param {string} ciphertextBase64 - Base64-encoded ciphertext.
 * @returns {Promise<string>} Decrypted plaintext.
 */
export async function decryptMessage(sessionKey, ivBase64, ciphertextBase64) {
  const iv = base64ToBuffer(ivBase64);
  const cipherBuffer = base64ToBuffer(ciphertextBase64);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    cipherBuffer,
  );

  return new TextDecoder().decode(plainBuffer);
}

/**
 * Encrypts a binary file buffer with AES-GCM-256.
 *
 * @param {ArrayBuffer} fileBuffer - Raw file bytes.
 * @param {CryptoKey} sessionKey
 * @returns {Promise<{iv: Uint8Array, encrypted: ArrayBuffer}>}
 */
export async function encryptFile(fileBuffer, sessionKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    fileBuffer,
  );
  return { iv, encrypted };
}

/**
 * Decrypts an encrypted file buffer.
 *
 * @param {ArrayBuffer} encryptedBuffer
 * @param {Uint8Array} iv
 * @param {CryptoKey} sessionKey
 * @returns {Promise<ArrayBuffer>}
 */
export async function decryptFile(encryptedBuffer, iv, sessionKey) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    encryptedBuffer,
  );
}

// ─── PBKDF2 PIN Hashing ───────────────────────────────────────────────────────

/**
 * Derives a 256-bit hash from a PIN using PBKDF2-SHA-256.
 * @param {string} pin - Numeric PIN string.
 * @param {Uint8Array} salt - 16-byte random salt.
 * @returns {Promise<string>} Base64-encoded hash.
 */
export async function hashPIN(pin, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    AES_KEY_LENGTH,
  );

  return bufferToBase64(new Uint8Array(bits));
}

/**
 * Generates a new random 16-byte PIN salt.
 * @returns {Uint8Array}
 */
export function generatePINSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

// ─── Key Fingerprint ──────────────────────────────────────────────────────────

/**
 * Generates a short human-readable session fingerprint for out-of-band verification.
 * Displays as 6 colon-separated hex bytes, e.g. "3a:f2:9b:c1:7e:04".
 *
 * @param {CryptoKey} sessionKey
 * @returns {Promise<string>}
 */
export async function generateFingerprint(sessionKey) {
  const raw = await crypto.subtle.exportKey('raw', sessionKey);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  const bytes = new Uint8Array(hash).slice(0, 6);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(':');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a Uint8Array to a base64 string.
 * @param {Uint8Array} buffer
 * @returns {string}
 */
export function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...buffer));
}

/**
 * Converts a base64 string back to a Uint8Array.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToBuffer(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Generates a UUID v4 using cryptographic randomness.
 * @returns {string}
 */
export function randomUUID() {
  return crypto.randomUUID();
}
