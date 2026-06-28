/** sync/api.ts — REST calls to the worker's zero-knowledge sync endpoints. */

import { getWorkerHttpUrl } from "@/lib/vault/config";
import type { EncryptedPayload } from "./crypto";

async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${getWorkerHttpUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

export async function fetchSalt(accountId: string) {
  const { data } = await post<{
    exists: boolean;
    salt?: string;
    recoverySalt?: string | null;
    hasRecovery?: boolean;
  }>("/api/sync/salt", { accountId });
  return data;
}

export async function registerAccount(args: {
  accountId: string;
  salt: string;
  authVerifier: string;
  payload: EncryptedPayload;
  recoverySalt: string;
  recoveryVerifier: string;
  wrapPass: EncryptedPayload;
  wrapRec: EncryptedPayload;
}) {
  return post<{ ok?: boolean; error?: string }>("/api/sync/register", args);
}

export async function pullData(accountId: string, authToken: string) {
  return post<{
    payload?: EncryptedPayload;
    wrap?: EncryptedPayload | null;
    version?: number;
    updatedAt?: number;
    error?: string;
  }>("/api/sync/pull", { accountId, authToken });
}

export async function pushData(accountId: string, authToken: string, payload: EncryptedPayload) {
  return post<{ ok?: boolean; version?: number; updatedAt?: number; error?: string }>(
    "/api/sync/push",
    { accountId, authToken, payload },
  );
}

/** Recovery-key auth → returns ciphertext + the recovery-wrapped DEK. */
export async function recoverData(accountId: string, recoveryToken: string) {
  return post<{ payload?: EncryptedPayload; wrap?: EncryptedPayload; error?: string }>(
    "/api/sync/recover",
    { accountId, recoveryToken },
  );
}

/** Update the security envelope (auth by passphrase OR recovery token). */
export async function updateKeys(args: {
  accountId: string;
  authToken?: string;
  recoveryToken?: string;
  salt?: string;
  authVerifier?: string;
  recoverySalt?: string;
  recoveryVerifier?: string;
  wrapPass?: EncryptedPayload;
  wrapRec?: EncryptedPayload;
  payload?: EncryptedPayload;
}) {
  return post<{ ok?: boolean; version?: number; error?: string }>("/api/sync/update", args);
}
