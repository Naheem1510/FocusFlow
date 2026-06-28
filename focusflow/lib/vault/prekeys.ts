/**
 * prekeys.ts — client one-time-prekey management for X3DH.
 *
 * Maintains a small pool of one-time prekeys: the PUBLIC halves are published to
 * the relay (so others can start a forward-secret offline conversation with us),
 * while the PRIVATE halves stay in IndexedDB, consumed single-use on receipt.
 */

import { idbGet, idbSet } from "./identity";
import { getWorkerHttpUrl } from "./config";
import {
  generateOneTimePreKeys,
  toPublishedPreKey,
  type PublishedPreKey,
} from "./x3dh";

const OPK_STORE_KEY = "one-time-prekeys";
const TARGET_POOL = 10;

/** id → keypair (private kept locally; public was published). */
type StoredPreKeys = Record<string, CryptoKeyPair>;

/** Tops the pool back up to TARGET and (re)publishes our bundle to the relay. */
export async function ensurePreKeysPublished(
  userId: string,
  identityPublicKeyB64: string,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const stored = (await idbGet<StoredPreKeys>(OPK_STORE_KEY)) ?? {};
  const fresh: PublishedPreKey[] = [];

  const deficit = TARGET_POOL - Object.keys(stored).length;
  if (deficit > 0) {
    for (const opk of await generateOneTimePreKeys(deficit)) {
      stored[opk.id] = opk.keyPair;
      fresh.push(await toPublishedPreKey(opk));
    }
    await idbSet(OPK_STORE_KEY, stored);
  }

  // Always (re)publish the identity key; include any newly minted prekeys.
  try {
    await fetch(`${getWorkerHttpUrl()}/api/keys/${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityKey: identityPublicKeyB64, oneTimePreKeys: fresh }),
    });
  } catch {
    /* relay unreachable — prekeys are stored locally; retried next connect */
  }
}

/** Single-use: returns (and removes) the private prekey matching an id. */
export async function consumePreKey(opkId: string): Promise<CryptoKey | null> {
  if (typeof indexedDB === "undefined") return null;
  const stored = (await idbGet<StoredPreKeys>(OPK_STORE_KEY)) ?? {};
  const kp = stored[opkId];
  if (!kp) return null;
  delete stored[opkId];
  await idbSet(OPK_STORE_KEY, stored);
  return kp.privateKey;
}

export interface PreKeyBundle {
  identityKey: string;
  oneTimePreKey: PublishedPreKey | null;
  remaining?: number;
}

/** Fetches a peer's bundle (pops one of their one-time prekeys server-side). */
export async function fetchPreKeyBundle(peerUserId: string): Promise<PreKeyBundle | null> {
  try {
    const res = await fetch(`${getWorkerHttpUrl()}/api/keys/${encodeURIComponent(peerUserId)}`);
    if (!res.ok) return null;
    return (await res.json()) as PreKeyBundle;
  } catch {
    return null;
  }
}
