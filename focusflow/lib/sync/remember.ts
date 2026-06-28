/**
 * sync/remember.ts — "Remember me on this device".
 *
 * Persists the minimum needed to auto-unlock on the same device — the data key
 * (DEK) + the server auth token — encrypted under a NON-EXTRACTABLE device key
 * that lives in IndexedDB. Because the device key can't be exported as bytes
 * (even by injected scripts), the remembered blob can only be decrypted in this
 * browser profile. It's still a convenience-vs-security trade-off: someone with
 * full access to this device/profile could auto-unlock too — so it's opt-in and
 * cleared on sign-out.
 */

import { idbGet, idbSet, idbDelete } from "@/lib/vault/identity";
import { encryptJSON, decryptJSON, type EncryptedPayload } from "./crypto";

const DEVICE_KEY_ID = "account-device-key";
const REMEMBER_LS = "ff_remember";

async function getDeviceKey(create: boolean): Promise<CryptoKey | null> {
  if (typeof indexedDB === "undefined") return null;
  let key = await idbGet<CryptoKey>(DEVICE_KEY_ID);
  if (!key && create) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    await idbSet(DEVICE_KEY_ID, key);
  }
  return key ?? null;
}

export interface RememberedSecrets {
  accountId: string;
  dekRaw: string; // base64 raw DEK
  authToken: string;
}

/** Encrypts and stores the session secrets under the device key. */
export async function rememberSession(secrets: RememberedSecrets): Promise<void> {
  try {
    const key = await getDeviceKey(true);
    if (!key) return;
    const payload = await encryptJSON(key, secrets);
    localStorage.setItem(REMEMBER_LS, JSON.stringify(payload));
  } catch {
    /* best effort — remembering is non-critical */
  }
}

/** Decrypts the remembered secrets, or null if none / undecryptable. */
export async function loadRememberedSession(): Promise<RememberedSecrets | null> {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(REMEMBER_LS);
  if (!raw) return null;
  const key = await getDeviceKey(false);
  if (!key) return null;
  try {
    const payload = JSON.parse(raw) as EncryptedPayload;
    return await decryptJSON<RememberedSecrets>(key, payload);
  } catch {
    return null;
  }
}

/** Forgets the device login (sign-out / forget-account). */
export async function clearRememberedSession(): Promise<void> {
  if (typeof localStorage !== "undefined") localStorage.removeItem(REMEMBER_LS);
  await idbDelete(DEVICE_KEY_ID).catch(() => {});
}

export function hasRememberedSession(): boolean {
  return typeof localStorage !== "undefined" && !!localStorage.getItem(REMEMBER_LS);
}
