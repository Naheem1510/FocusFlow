"use client";

import { useState } from "react";
import {
  Cloud,
  CloudOff,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  KeyRound,
} from "lucide-react";
import { useAccountStore } from "@/store/useAccountStore";
import { cn } from "@/lib/cn";

function timeAgo(ts: number | null) {
  if (!ts) return "never";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return new Date(ts).toLocaleString();
}

export function SyncSettings() {
  const { accountId, status, busy, error, lastSyncedAt, rememberMe, setRememberMe, setup, unlock, signOut, forgetAccount, syncNow, regenerateRecoveryKey, clearError } =
    useAccountStore();

  const [email, setEmail] = useState(accountId ?? "");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const unlocked = status === "unlocked" || status === "syncing";
  const hasAccount = !!accountId;
  const mode: "active" | "unlock" | "setup" = unlocked ? "active" : hasAccount ? "unlock" : "setup";

  const submitSetup = async () => {
    clearError();
    if (pass !== confirmPass) {
      useAccountStore.setState({ error: "Passphrases don't match." });
      return;
    }
    if (await setup(email, pass)) {
      setPass("");
      setConfirmPass("");
    }
  };

  const submitUnlock = async () => {
    clearError();
    if (await unlock(email, pass)) setPass("");
  };

  return (
    <section className="mt-8 rounded-xl border border-border-ash bg-background-secondary p-6">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-display text-lg font-medium text-text-parchment">Encrypted cloud sync</h2>
        {unlocked ? (
          <span className="flex items-center gap-1 rounded-full bg-accent-sage/15 px-2 py-0.5 font-mono text-[10px] text-accent-sage">
            {status === "syncing" ? <Loader2 size={11} className="animate-spin" /> : <Cloud size={11} />}
            {status === "syncing" ? "syncing" : "synced"}
          </span>
        ) : hasAccount ? (
          <span className="flex items-center gap-1 rounded-full bg-accent-ochre/15 px-2 py-0.5 font-mono text-[10px] text-accent-ochre">
            <Lock size={11} /> locked
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-background-tertiary px-2 py-0.5 font-mono text-[10px] text-text-bone">
            <CloudOff size={11} /> off
          </span>
        )}
      </div>

      <p className="mb-4 flex items-start gap-1.5 text-sm leading-relaxed text-text-bone">
        <ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-accent-sage" />
        This is your account. Your notes, tasks, calendar, habits, focus history,
        settings and saved Vault contacts are encrypted in this browser (AES-GCM)
        with a key derived from your passphrase, then stored as ciphertext on the
        server — it can never read your data. Sign in with the same email +
        passphrase on any device to get everything back. (Vault message history
        stays on-device only, by design.)
      </p>

      {error && (
        <p className="mb-4 rounded-DEFAULT border border-accent-terracotta/30 bg-accent-terracotta/10 px-3 py-2 text-xs text-accent-terracotta">
          {error}
        </p>
      )}

      {mode === "active" && (
        <div className="space-y-4">
          <div className="rounded-DEFAULT border border-border-ash bg-background-tertiary p-3">
            <p className="text-sm text-text-parchment">{accountId}</p>
            <p className="font-mono text-[11px] text-text-bone">Last synced {timeAgo(lastSyncedAt)}</p>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm text-text-parchment">
              Remember me on this device
              <span className="mt-0.5 block text-xs text-text-bone">
                Stay signed in here without re-entering your passphrase. Turn off on shared devices.
              </span>
            </span>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 flex-shrink-0 accent-[color:var(--accent-primary)]"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void syncNow()}
              className="flex items-center gap-2 rounded-DEFAULT bg-accent-primary px-4 py-2 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97]"
            >
              <RefreshCw size={15} /> Sync now
            </button>
            <button
              onClick={() => void regenerateRecoveryKey()}
              className="flex items-center gap-2 rounded-DEFAULT border border-border-ash px-4 py-2 text-sm text-text-parchment transition-colors hover:bg-background-tertiary"
            >
              <KeyRound size={15} /> Recovery key
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-2 rounded-DEFAULT border border-border-ash px-4 py-2 text-sm text-text-parchment transition-colors hover:bg-background-tertiary"
            >
              <LogOut size={15} /> Sign out
            </button>
            <button
              onClick={() => {
                if (window.confirm("Forget this account on this device? Your encrypted data stays in the cloud; you'll need your passphrase to sign back in.")) {
                  forgetAccount();
                  setEmail("");
                }
              }}
              className="flex items-center gap-2 rounded-DEFAULT border border-accent-terracotta/40 px-4 py-2 text-sm text-accent-terracotta transition-colors hover:bg-accent-terracotta/10"
            >
              <Trash2 size={15} /> Forget account
            </button>
          </div>
        </div>
      )}

      {mode !== "active" && (
        <div className="space-y-3">
          <Input label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" disabled={mode === "unlock"} />
          <Input
            label="Passphrase"
            value={pass}
            onChange={setPass}
            placeholder="Something only you know"
            type="password"
            onEnter={mode === "setup" ? submitSetup : submitUnlock}
          />
          {mode === "setup" && (
            <Input label="Confirm passphrase" value={confirmPass} onChange={setConfirmPass} placeholder="Repeat it" type="password" onEnter={submitSetup} />
          )}

          {mode === "setup" && (
            <p className="font-mono text-[10px] leading-relaxed text-text-stone">
              ⚠ There is no password reset. If you forget the passphrase, the encrypted
              data cannot be recovered — that&apos;s what keeps it private.
            </p>
          )}

          <button
            disabled={busy}
            onClick={mode === "setup" ? submitSetup : submitUnlock}
            className="flex items-center gap-2 rounded-DEFAULT bg-accent-primary px-5 py-2.5 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {mode === "setup" ? "Enable encrypted sync" : "Unlock & sync"}
          </button>

          {mode === "unlock" && (
            <button
              onClick={() => {
                forgetAccount();
                setEmail("");
              }}
              className="block font-mono text-[11px] text-text-stone underline-offset-2 hover:text-text-bone hover:underline"
            >
              Use a different account
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-stone">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary",
          disabled && "opacity-60",
        )}
      />
    </div>
  );
}
