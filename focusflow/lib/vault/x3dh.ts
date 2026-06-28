/**
 * x3dh.ts — a reduced X3DH key agreement for forward-secret, offline first
 * messages. Lets a sender derive a fresh shared key with a recipient who is
 * offline, using the recipient's published identity key + a one-time prekey.
 *
 * We use ECDH P-256 throughout (matching crypto.ts). Versus full Signal X3DH we
 * omit the *signed* prekey + its signature — authentication instead comes from
 * the out-of-band invite link and the verifiable session fingerprint. The
 * three DH legs still bind both identities and add forward secrecy via the
 * sender's ephemeral key and the recipient's single-use one-time prekey:
 *
 *   DH1 = ECDH(IK_A, IK_B)      DH2 = ECDH(EK_A, IK_B)      DH3 = ECDH(EK_A, OPK_B)
 *   SK  = HKDF-SHA-256( DH1 ‖ DH2 ‖ DH3 )
 */

import {
  generateKeyPair,
  importPublicKey,
  exportPublicKey,
} from "./crypto";

const X3DH_INFO = new TextEncoder().encode("focusflow-x3dh-v1");
const X3DH_SALT = new Uint8Array(32);

async function ecdhBits(myPriv: CryptoKey, theirPub: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits({ name: "ECDH", public: theirPub }, myPriv, 256);
}

function concatBits(parts: ArrayBuffer[]): Uint8Array {
  const total = parts.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of parts) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out;
}

async function hkdfToAesKey(ikm: Uint8Array): Promise<CryptoKey> {
  // Copy into a fresh ArrayBuffer-backed view for BufferSource typing.
  const material = new Uint8Array(ikm.length);
  material.set(ikm);
  const base = await crypto.subtle.importKey("raw", material, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: X3DH_SALT, info: X3DH_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// ─── One-time prekeys ─────────────────────────────────────────────────────────

export interface OneTimePreKey {
  id: string;
  keyPair: CryptoKeyPair;
}

/** Public form of a one-time prekey — safe to publish to the relay. */
export interface PublishedPreKey {
  id: string;
  key: string; // base64 SPKI
}

export async function generateOneTimePreKeys(count: number): Promise<OneTimePreKey[]> {
  const keys: OneTimePreKey[] = [];
  for (let i = 0; i < count; i++) {
    keys.push({ id: crypto.randomUUID(), keyPair: await generateKeyPair() });
  }
  return keys;
}

export async function toPublishedPreKey(opk: OneTimePreKey): Promise<PublishedPreKey> {
  return { id: opk.id, key: await exportPublicKey(opk.keyPair.publicKey) };
}

// ─── X3DH agreement ───────────────────────────────────────────────────────────

/** The header a sender attaches so the recipient can reconstruct the key. */
export interface X3DHHeader {
  identityKey: string; // sender IK (base64 SPKI)
  ephemeralKey: string; // sender EK (base64 SPKI)
  opkId: string; // which of the recipient's one-time prekeys was used
}

export interface X3DHInitiation {
  sk: CryptoKey;
  header: X3DHHeader;
}

/** Sender side: derive SK from the recipient's published IK + one-time prekey. */
export async function x3dhInitiate(
  myIdentityPub: string,
  myIdentityPriv: CryptoKey,
  theirIdentityKeyB64: string,
  theirOpk: PublishedPreKey,
): Promise<X3DHInitiation> {
  const theirIK = await importPublicKey(theirIdentityKeyB64);
  const theirOPK = await importPublicKey(theirOpk.key);
  const ek = await generateKeyPair();

  const dh1 = await ecdhBits(myIdentityPriv, theirIK);
  const dh2 = await ecdhBits(ek.privateKey, theirIK);
  const dh3 = await ecdhBits(ek.privateKey, theirOPK);
  const sk = await hkdfToAesKey(concatBits([dh1, dh2, dh3]));

  return {
    sk,
    header: {
      identityKey: myIdentityPub,
      ephemeralKey: await exportPublicKey(ek.publicKey),
      opkId: theirOpk.id,
    },
  };
}

/** Recipient side: derive the same SK using our IK + the consumed one-time prekey. */
export async function x3dhReceive(
  myIdentityPriv: CryptoKey,
  myOpkPriv: CryptoKey,
  header: X3DHHeader,
): Promise<CryptoKey> {
  const theirIK = await importPublicKey(header.identityKey);
  const theirEK = await importPublicKey(header.ephemeralKey);

  const dh1 = await ecdhBits(myIdentityPriv, theirIK);
  const dh2 = await ecdhBits(myIdentityPriv, theirEK);
  const dh3 = await ecdhBits(myOpkPriv, theirEK);
  return hkdfToAesKey(concatBits([dh1, dh2, dh3]));
}
