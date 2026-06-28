/**
 * crypto.ts — End-to-end encryption via the Web Crypto API only.
 * TypeScript port of the secure-workspace client crypto: ECDH P-256 key
 * exchange, HKDF-SHA-256 derivation, AES-GCM-256 encrypt/decrypt, and a short
 * session fingerprint for out-of-band verification.
 *
 * No external libraries. Keys never leave the browser. In FocusFlow they are
 * also never persisted — they live only in memory for the session.
 */

const CURVE = "P-256";
const HKDF_INFO = encodeUtf8("secure-workspace-v1");
const HKDF_SALT = new Uint8Array(32);
const AES_KEY_LENGTH = 256;

// ─── ECDH key exchange ──────────────────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: CURVE },
    true,
    // deriveBits is needed for X3DH (raw ECDH secrets are concatenated then HKDF'd).
    ["deriveKey", "deriveBits"],
  );
}

/** Exports a public key as a base64 SPKI string safe to broadcast. */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("spki", publicKey);
  return bufferToBase64(new Uint8Array(raw));
}

/** Imports a base64 SPKI public key string back into a CryptoKey. */
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    base64ToBuffer(base64Key),
    { name: "ECDH", namedCurve: CURVE },
    true,
    [],
  );
}

// ─── Key derivation ─────────────────────────────────────────────────────────

/**
 * Derives a shared AES-GCM-256 session key from an ECDH exchange, stretched and
 * domain-separated through HKDF-SHA-256.
 */
export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
): Promise<CryptoKey> {
  const ecdhKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    ecdhKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

// ─── AES-GCM message encryption ─────────────────────────────────────────────

export interface CipherPayload {
  iv: string;
  ciphertext: string;
}

/** Encrypts a plaintext string with AES-GCM-256 and a fresh 96-bit IV. */
export async function encryptMessage(
  sessionKey: CryptoKey,
  plaintext: string,
): Promise<CipherPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sessionKey,
    encodeUtf8(plaintext),
  );
  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(cipherBuffer)),
  };
}

/** Decrypts a received AES-GCM ciphertext back to plaintext. */
export async function decryptMessage(
  sessionKey: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string,
): Promise<string> {
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(ivBase64) },
    sessionKey,
    base64ToBuffer(ciphertextBase64),
  );
  return new TextDecoder().decode(plainBuffer);
}

// ─── PBKDF2 PIN hashing (Vault lock) ────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;

/** Derives a base64 256-bit hash from a PIN using PBKDF2-SHA-256. */
export async function hashPIN(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    AES_KEY_LENGTH,
  );
  return bufferToBase64(new Uint8Array(bits));
}

export function generatePINSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

// ─── Fingerprint ────────────────────────────────────────────────────────────

/**
 * Short human-readable session fingerprint for out-of-band verification —
 * 6 colon-separated hex bytes, e.g. "3a:f2:9b:c1:7e:04".
 */
export async function generateFingerprint(sessionKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", sessionKey);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  const bytes = new Uint8Array(hash).slice(0, 6);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(":");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function bufferToBase64(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i]);
  return btoa(binary);
}

/**
 * Decodes base64 into an ArrayBuffer-backed Uint8Array. Constructing via
 * `new Uint8Array(len)` (rather than `Uint8Array.from`) keeps the buffer type
 * as `ArrayBuffer`, which Web Crypto's `BufferSource` parameters require under
 * TypeScript 5.7+'s stricter typed-array generics.
 */
export function base64ToBuffer(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes a string to an ArrayBuffer-backed Uint8Array (see base64ToBuffer). */
function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(text);
  const bytes = new Uint8Array(encoded.length);
  bytes.set(encoded);
  return bytes;
}

export function randomUUID(): string {
  return crypto.randomUUID();
}
