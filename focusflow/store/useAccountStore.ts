import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  deriveAccountKeys,
  randomSaltB64,
  sha256B64,
  encryptJSON,
  decryptJSON,
  generateDEKRaw,
  importDEK,
  wrapDEK,
  unwrapDEK,
  generateRecoveryKey,
  normalizeRecoveryKey,
  type AccountKeys,
} from "@/lib/sync/crypto";
import {
  fetchSalt,
  registerAccount,
  pullData,
  pushData,
  recoverData,
  updateKeys,
} from "@/lib/sync/api";
import {
  collectSnapshot,
  applySnapshot,
  subscribeAll,
  type Snapshot,
} from "@/lib/sync/snapshot";
import {
  rememberSession,
  loadRememberedSession,
  clearRememberedSession,
} from "@/lib/sync/remember";

export type SyncStatus = "off" | "unlocked" | "syncing" | "error";

interface AccountState {
  accountId: string | null; // persisted so we know an account exists / prefill
  lastSyncedAt: number | null;
  status: SyncStatus;
  busy: boolean;
  error: string | null;
  /** A freshly generated recovery key to show the user ONCE (never persisted). */
  recoveryKey: string | null;
  /** Persisted preference: stay signed in on this device. */
  rememberMe: boolean;
  /** True while attempting to auto-restore a remembered session on load. */
  restoring: boolean;

  setup: (accountId: string, passphrase: string) => Promise<boolean>;
  unlock: (accountId: string, passphrase: string) => Promise<boolean>;
  recover: (accountId: string, recoveryKey: string, newPassphrase: string) => Promise<boolean>;
  regenerateRecoveryKey: () => Promise<string | null>;
  dismissRecoveryKey: () => void;
  setRememberMe: (on: boolean) => void;
  restoreSession: () => Promise<boolean>;
  signOut: () => void;
  forgetAccount: () => void;
  syncNow: () => Promise<void>;
  clearError: () => void;
}

// In-memory only — secrets never persist except via the device-key remember blob.
let keys: AccountKeys | null = null; // passphrase-derived (KEK + authToken)
let dek: CryptoKey | null = null; // the data encryption key
let dekRaw: string | null = null; // raw DEK (base64) — kept so we can re-wrap it
let authToken: string | null = null; // server auth (survives a remembered restore)
let unsubscribe: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => {
      const pushSnapshot = async () => {
        const { accountId } = get();
        if (!authToken || !dek || !accountId) return;
        set({ status: "syncing" });
        try {
          const payload = await encryptJSON(dek, collectSnapshot());
          const { status, data } = await pushData(accountId, authToken, payload);
          if (status !== 200) throw new Error(data.error || "push failed");
          set({ status: "unlocked", lastSyncedAt: Date.now(), error: null });
        } catch {
          set({ status: "error", error: "Sync failed — will retry on next change." });
        }
      };

      // Persist a device-key-wrapped login so the same device auto-unlocks.
      const saveRememberIfEnabled = async (id: string) => {
        if (get().rememberMe && dekRaw && authToken) {
          await rememberSession({ accountId: id, dekRaw, authToken });
        }
      };

      const schedulePush = () => {
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => void pushSnapshot(), 1500);
      };

      const startEngine = () => {
        stopEngine();
        unsubscribe = subscribeAll(schedulePush);
      };

      const stopEngine = () => {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = null;
      };

      const reset = () => {
        keys = null;
        dek = null;
        dekRaw = null;
        authToken = null;
      };

      return {
        accountId: null,
        lastSyncedAt: null,
        status: "off",
        busy: false,
        error: null,
        recoveryKey: null,
        rememberMe: true,
        restoring: true,

        setup: async (accountId, passphrase) => {
          const id = accountId.trim().toLowerCase();
          if (!id || passphrase.length < 6) {
            set({ error: "Enter an email and a passphrase of at least 6 characters." });
            return false;
          }
          set({ busy: true, error: null });
          try {
            const existing = await fetchSalt(id);
            if (existing.exists) {
              set({ busy: false, error: "That account already exists — sign in instead." });
              return false;
            }
            // Envelope: random DEK, wrapped by both the passphrase and a recovery key.
            const salt = randomSaltB64();
            keys = await deriveAccountKeys(passphrase, salt);
            authToken = keys.authToken;
            dekRaw = generateDEKRaw();
            dek = await importDEK(dekRaw);

            const recoveryKey = generateRecoveryKey();
            const recoverySalt = randomSaltB64();
            const recKeys = await deriveAccountKeys(normalizeRecoveryKey(recoveryKey), recoverySalt);

            const { status, data } = await registerAccount({
              accountId: id,
              salt,
              authVerifier: await sha256B64(keys.authToken),
              recoverySalt,
              recoveryVerifier: await sha256B64(recKeys.authToken),
              wrapPass: await wrapDEK(keys.encKey, dekRaw),
              wrapRec: await wrapDEK(recKeys.encKey, dekRaw),
              payload: await encryptJSON(dek, collectSnapshot()),
            });
            if (status !== 200) throw new Error(data.error || "register failed");
            set({
              accountId: id,
              status: "unlocked",
              busy: false,
              lastSyncedAt: Date.now(),
              recoveryKey, // shown once by the UI
            });
            await saveRememberIfEnabled(id);
            startEngine();
            return true;
          } catch {
            reset();
            set({ busy: false, status: "error", error: "Couldn't reach the sync service." });
            return false;
          }
        },

        unlock: async (accountId, passphrase) => {
          const id = accountId.trim().toLowerCase();
          if (!id || !passphrase) {
            set({ error: "Enter your email and passphrase." });
            return false;
          }
          set({ busy: true, error: null });
          try {
            const lookup = await fetchSalt(id);
            if (!lookup.exists || !lookup.salt) {
              set({ busy: false, error: "No such account — create one first." });
              return false;
            }
            keys = await deriveAccountKeys(passphrase, lookup.salt);
            authToken = keys.authToken;
            const { status, data } = await pullData(id, keys.authToken);
            if (status === 401) {
              reset();
              set({ busy: false, error: "Incorrect passphrase." });
              return false;
            }
            if (status !== 200 || !data.payload) throw new Error("pull failed");

            if (data.wrap) {
              dekRaw = await unwrapDEK(keys.encKey, data.wrap);
              dek = await importDEK(dekRaw);
            } else {
              // Legacy account (pre-envelope): data is keyed to the passphrase.
              dek = keys.encKey;
              dekRaw = null;
            }
            const snap = await decryptJSON<Snapshot>(dek, data.payload);
            applySnapshot(snap); // remote wins on unlock
            set({ accountId: id, status: "unlocked", busy: false, lastSyncedAt: Date.now() });
            await saveRememberIfEnabled(id);
            startEngine();
            return true;
          } catch {
            reset();
            set({ busy: false, status: "error", error: "Couldn't unlock — check your passphrase/connection." });
            return false;
          }
        },

        recover: async (accountId, recoveryKeyInput, newPassphrase) => {
          const id = accountId.trim().toLowerCase();
          if (!id || !recoveryKeyInput.trim()) {
            set({ error: "Enter your email and recovery key." });
            return false;
          }
          if (newPassphrase.length < 6) {
            set({ error: "Choose a new passphrase of at least 6 characters." });
            return false;
          }
          set({ busy: true, error: null });
          try {
            const lookup = await fetchSalt(id);
            if (!lookup.exists || !lookup.recoverySalt) {
              set({ busy: false, error: "No recovery key is set for this account." });
              return false;
            }
            const recKeys = await deriveAccountKeys(
              normalizeRecoveryKey(recoveryKeyInput),
              lookup.recoverySalt,
            );
            const { status, data } = await recoverData(id, recKeys.authToken);
            if (status === 401) {
              reset();
              set({ busy: false, error: "Incorrect recovery key." });
              return false;
            }
            if (status !== 200 || !data.payload || !data.wrap) throw new Error("recover failed");

            dekRaw = await unwrapDEK(recKeys.encKey, data.wrap);
            dek = await importDEK(dekRaw);
            const snap = await decryptJSON<Snapshot>(dek, data.payload);
            applySnapshot(snap);

            // Set the new passphrase: re-wrap the (unchanged) DEK under it.
            const newSalt = randomSaltB64();
            keys = await deriveAccountKeys(newPassphrase, newSalt);
            authToken = keys.authToken;
            const upd = await updateKeys({
              accountId: id,
              recoveryToken: recKeys.authToken,
              salt: newSalt,
              authVerifier: await sha256B64(keys.authToken),
              wrapPass: await wrapDEK(keys.encKey, dekRaw),
            });
            if (upd.status !== 200) throw new Error("reset failed");

            set({ accountId: id, status: "unlocked", busy: false, lastSyncedAt: Date.now() });
            await saveRememberIfEnabled(id);
            startEngine();
            return true;
          } catch {
            reset();
            set({ busy: false, status: "error", error: "Recovery failed — check the key/connection." });
            return false;
          }
        },

        regenerateRecoveryKey: async () => {
          const { accountId } = get();
          if (!dek || !authToken || !accountId) return null;
          try {
            // Migrate a legacy (passphrase-keyed) account to a real DEK first.
            // (Only possible when we hold the passphrase KEK — i.e. not after a
            // remembered restore. DEK accounts never need this.)
            let raw = dekRaw;
            let migrate: { payload: Awaited<ReturnType<typeof encryptJSON>>; wrapPass: Awaited<ReturnType<typeof wrapDEK>> } | null = null;
            if (!raw) {
              if (!keys) {
                set({ error: "Re-enter your passphrase to set a recovery key." });
                return null;
              }
              raw = generateDEKRaw();
              const newDek = await importDEK(raw);
              migrate = {
                payload: await encryptJSON(newDek, collectSnapshot()),
                wrapPass: await wrapDEK(keys.encKey, raw),
              };
              dek = newDek;
              dekRaw = raw;
            }

            const recoveryKey = generateRecoveryKey();
            const recoverySalt = randomSaltB64();
            const recKeys = await deriveAccountKeys(normalizeRecoveryKey(recoveryKey), recoverySalt);

            const upd = await updateKeys({
              accountId,
              authToken,
              recoverySalt,
              recoveryVerifier: await sha256B64(recKeys.authToken),
              wrapRec: await wrapDEK(recKeys.encKey, raw),
              ...(migrate ? { payload: migrate.payload, wrapPass: migrate.wrapPass } : {}),
            });
            if (upd.status !== 200) {
              set({ error: "Couldn't update the recovery key." });
              return null;
            }
            set({ recoveryKey });
            return recoveryKey;
          } catch {
            set({ error: "Couldn't update the recovery key." });
            return null;
          }
        },

        dismissRecoveryKey: () => set({ recoveryKey: null }),

        setRememberMe: (on) => {
          set({ rememberMe: on });
          if (on) {
            // Persist the current session right away if we're already signed in.
            const { accountId, status } = get();
            if ((status === "unlocked" || status === "syncing") && accountId && dekRaw && authToken) {
              void rememberSession({ accountId, dekRaw, authToken });
            }
          } else {
            void clearRememberedSession();
          }
        },

        restoreSession: async () => {
          const secrets = await loadRememberedSession();
          if (!secrets) {
            set({ restoring: false });
            return false;
          }
          try {
            dek = await importDEK(secrets.dekRaw);
            dekRaw = secrets.dekRaw;
            authToken = secrets.authToken;
            keys = null; // we don't have the passphrase KEK from a remembered login

            // Validate + pull the latest; tolerate being offline (local data persists).
            try {
              const { status, data } = await pullData(secrets.accountId, secrets.authToken);
              if (status === 401) {
                // Credentials no longer valid (e.g. passphrase reset elsewhere).
                await clearRememberedSession();
                reset();
                set({ status: "off", restoring: false });
                return false;
              }
              if (status === 200 && data.payload) {
                const snap = await decryptJSON<Snapshot>(dek, data.payload);
                applySnapshot(snap);
              }
            } catch {
              /* offline — proceed with locally persisted data */
            }

            set({
              accountId: secrets.accountId,
              status: "unlocked",
              restoring: false,
              lastSyncedAt: Date.now(),
            });
            startEngine();
            return true;
          } catch {
            reset();
            set({ restoring: false });
            return false;
          }
        },

        signOut: () => {
          stopEngine();
          reset();
          void clearRememberedSession();
          set({ status: "off", error: null, recoveryKey: null });
        },

        forgetAccount: () => {
          stopEngine();
          reset();
          void clearRememberedSession();
          set({ accountId: null, status: "off", lastSyncedAt: null, error: null, recoveryKey: null });
        },

        syncNow: async () => {
          await pushSnapshot();
        },

        clearError: () => set({ error: null }),
      };
    },
    {
      name: "focusflow-account",
      // Persist only the non-secret slot info — never keys, passphrase or recovery key.
      partialize: (s) => ({
        accountId: s.accountId,
        lastSyncedAt: s.lastSyncedAt,
        rememberMe: s.rememberMe,
      }),
    },
  ),
);
