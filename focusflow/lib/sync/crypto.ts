/**
 * sync/crypto.ts — Zero-knowledge account key derivation + snapshot encryption.
 *
 * passphrase ──PBKDF2-SHA256(200k)──▶ master
 *   master ──HKDF info="ff-enc"──▶ encKey  (AES-GCM, never leaves the device)
 *   master ──HKDF info="ff-auth"─▶ authToken (sent to the server as a credential)
 *
 * The server stores only SHA-256(authToken) and the AES-GCM ciphertext, so it
 * can neither decrypt the data nor reproduce the auth token.
 */

import { bufferToBase64, base64ToBuffer } from "@/lib/vault/crypto";

const PBKDF2_ITERATIONS = 200_000;

function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  const src = new TextEncoder().encode(text);
  const out = new Uint8Array(src.length);
  out.set(src);
  return out;
}

export interface AccountKeys {
  encKey: CryptoKey;
  authToken: string;
}

export function randomSaltB64(): string {
  return bufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Derives the encryption key + auth token from a passphrase and account salt. */
export async function deriveAccountKeys(
  passphrase: string,
  saltB64: string,
): Promise<AccountKeys> {
  const salt = base64ToBuffer(saltB64);

  const pbkdfKey = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const masterBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    pbkdfKey,
    256,
  );

  const hkdfBase = await crypto.subtle.importKey(
    "raw",
    masterBits,
    "HKDF",
    false,
    ["deriveKey", "deriveBits"],
  );

  const encKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encodeUtf8("ff-enc") },
    hkdfBase,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  const authBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encodeUtf8("ff-auth") },
    hkdfBase,
    256,
  );

  return { encKey, authToken: bufferToBase64(new Uint8Array(authBits)) };
}

/** SHA-256(base64) → base64. Matches the server's authVerifier computation. */
export async function sha256B64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encodeUtf8(input));
  return bufferToBase64(new Uint8Array(digest));
}

export interface EncryptedPayload {
  iv: string;
  ct: string;
}

export async function encryptJSON(encKey: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encodeUtf8(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encKey, plaintext);
  return { iv: bufferToBase64(iv), ct: bufferToBase64(new Uint8Array(cipher)) };
}

export async function decryptJSON<T>(encKey: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(payload.iv) },
    encKey,
    base64ToBuffer(payload.ct),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

// ─── Envelope encryption: a random Data Encryption Key (DEK) ──────────────────
//
// Data is encrypted with a random DEK, and the DEK is *wrapped* (encrypted)
// separately under the passphrase-derived key AND under a recovery-key-derived
// key. Either secret can unwrap the DEK, so a forgotten passphrase is
// recoverable — while the server still only ever stores wrapped (ciphertext)
// keys and can decrypt nothing.

/** A fresh random 256-bit DEK, returned as base64 raw bytes. */
export function generateDEKRaw(): string {
  return bufferToBase64(crypto.getRandomValues(new Uint8Array(32)));
}

/** Imports a base64 raw DEK into an AES-GCM key for snapshot encrypt/decrypt. */
export function importDEK(rawB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", base64ToBuffer(rawB64), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Wraps the DEK (its raw base64) under a key-encryption key. */
export function wrapDEK(kek: CryptoKey, dekRawB64: string): Promise<EncryptedPayload> {
  return encryptJSON(kek, dekRawB64);
}

/** Unwraps a wrapped DEK back to its raw base64 form. */
export function unwrapDEK(kek: CryptoKey, wrapped: EncryptedPayload): Promise<string> {
  return decryptJSON<string>(kek, wrapped);
}

// ─── Recovery key ─────────────────────────────────────────────────────────────

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** A high-entropy, human-savable recovery code: 160 bits as XXXX-XXXX-… groups. */
export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20)); // 160 bits
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

/** Normalises user input (strip dashes/spaces, uppercase) before key derivation. */
export function normalizeRecoveryKey(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
