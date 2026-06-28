/**
 * identity.ts — the device's Vault identity.
 *
 * Offline delivery requires a *stable* identity: if your ECDH keypair changed
 * every session, a message encrypted for you while you were away could never be
 * decrypted on return. So when "receive offline messages" is enabled we persist
 * a long-term identity keypair (IndexedDB) + a stable userId (localStorage).
 *
 * This is the one place the Vault writes key material to disk — the deliberate
 * Zero-Trace trade-off for offline delivery. With the setting OFF we fall back
 * to a throwaway per-tab identity and nothing persists.
 */

import { generateKeyPair, exportPublicKey } from "./crypto";

const DB_NAME = "ff-vault";
const DB_STORE = "identity";
const KEYPAIR_ID = "identity-keypair";
const PERSIST_UID_KEY = "ff_vault_uid_persistent";
const SESSION_UID_KEY = "ff_vault_uid";

export interface VaultIdentity {
  userId: string;
  keyPair: CryptoKeyPair;
  /** Base64 SPKI of the public half — safe to broadcast / cache per contact. */
  publicKeyB64: string;
  persistent: boolean;
}

// ─── Minimal IndexedDB promise wrapper ──────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Identity loading ────────────────────────────────────────────────────────

/** A stable, on-disk identity (keypair in IndexedDB, userId in localStorage). */
export async function loadPersistentIdentity(): Promise<VaultIdentity> {
  let keyPair = await idbGet<CryptoKeyPair>(KEYPAIR_ID);
  if (!keyPair) {
    keyPair = await generateKeyPair();
    await idbSet(KEYPAIR_ID, keyPair);
  }
  let userId = localStorage.getItem(PERSIST_UID_KEY);
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(PERSIST_UID_KEY, userId);
  }
  const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
  return { userId, keyPair, publicKeyB64, persistent: true };
}

/** A throwaway identity that lives only for this tab session (Zero-Trace). */
export async function loadEphemeralIdentity(): Promise<VaultIdentity> {
  const keyPair = await generateKeyPair();
  let userId = sessionStorage.getItem(SESSION_UID_KEY);
  if (!userId) {
    userId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_UID_KEY, userId);
  }
  const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
  return { userId, keyPair, publicKeyB64, persistent: false };
}

/** Resolves the right identity for the current "receive offline" preference. */
export async function loadVaultIdentity(persistent: boolean): Promise<VaultIdentity> {
  return persistent ? loadPersistentIdentity() : loadEphemeralIdentity();
}

/** Wipes the persisted identity + prekeys (when the user turns offline off). */
export async function clearPersistentIdentity(): Promise<void> {
  try {
    await idbDelete(KEYPAIR_ID);
    await idbDelete("one-time-prekeys");
  } catch {
    /* best effort */
  }
  localStorage.removeItem(PERSIST_UID_KEY);
}
