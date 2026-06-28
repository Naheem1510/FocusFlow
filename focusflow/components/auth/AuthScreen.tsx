"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, Lock } from "lucide-react";
import { useAccountStore } from "@/store/useAccountStore";
import { cn } from "@/lib/cn";

/**
 * Full-screen sign-in / sign-up gate. The app is account-first: nothing renders
 * until an encrypted account is unlocked, so every user's data is always synced.
 * Keys are derived from the passphrase in-browser and never persisted, so a
 * reload (or a new device) requires signing in again — that's the zero-knowledge
 * guarantee, not a bug.
 */
type Mode = "signin" | "signup" | "recover";

export function AuthScreen() {
  const { accountId, busy, error, rememberMe, setRememberMe, setup, unlock, recover, forgetAccount, clearError } =
    useAccountStore();

  // Returning on a known device → default to sign-in with the email prefilled.
  const [mode, setMode] = useState<Mode>(accountId ? "signin" : "signup");
  const [email, setEmail] = useState(accountId ?? "");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");

  const submit = async () => {
    clearError();
    if (mode === "signup") {
      if (pass !== confirmPass) {
        useAccountStore.setState({ error: "Passphrases don't match." });
        return;
      }
      await setup(email, pass);
    } else if (mode === "recover") {
      if (pass !== confirmPass) {
        useAccountStore.setState({ error: "Passphrases don't match." });
        return;
      }
      await recover(email, recoveryKey, pass);
    } else {
      await unlock(email, pass);
    }
  };

  const switchMode = (m: Mode) => {
    clearError();
    setPass("");
    setConfirmPass("");
    setRecoveryKey("");
    setMode(m);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background-base px-6 py-10 text-text-parchment">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex items-center justify-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/30">
            F
          </span>
          <span className="text-text-parchment">ocusFlow</span>
        </div>

        <div className="rounded-2xl border border-border-ash bg-background-secondary p-6 shadow-2xl">
          <h1 className="font-display text-xl font-semibold text-text-parchment">
            {mode === "signup"
              ? "Create your account"
              : mode === "recover"
                ? "Recover your account"
                : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-text-bone">
            {mode === "signup"
              ? "Your notes, tasks, calendar, habits and Vault contacts are end-to-end encrypted and synced to your account — reachable from any device."
              : mode === "recover"
                ? "Enter your recovery key to decrypt your data and set a new passphrase."
                : "Sign in to decrypt and restore everything on this device."}
          </p>

          {error && (
            <p className="mt-4 rounded-DEFAULT border border-accent-terracotta/30 bg-accent-terracotta/10 px-3 py-2 text-xs text-accent-terracotta">
              {error}
            </p>
          )}

          <div className="mt-5 space-y-3">
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              onEnter={submit}
            />
            {mode === "recover" && (
              <Field
                label="Recovery key"
                type="text"
                value={recoveryKey}
                onChange={setRecoveryKey}
                placeholder="XXXX-XXXX-XXXX-…"
                onEnter={submit}
              />
            )}
            <Field
              label={mode === "recover" ? "New passphrase" : "Passphrase"}
              type="password"
              value={pass}
              onChange={setPass}
              placeholder={mode === "recover" ? "Choose a new passphrase" : "Something only you know"}
              onEnter={submit}
            />
            {(mode === "signup" || mode === "recover") && (
              <Field
                label={mode === "recover" ? "Confirm new passphrase" : "Confirm passphrase"}
                type="password"
                value={confirmPass}
                onChange={setConfirmPass}
                placeholder="Repeat it"
                onEnter={submit}
              />
            )}
          </div>

          {mode === "signup" && (
            <p className="mt-3 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-text-stone">
              <ShieldCheck size={13} className="mt-0.5 flex-shrink-0 text-accent-sage" />
              Zero-knowledge: the server only ever stores ciphertext. There is no
              password reset — if you forget the passphrase, the data can&apos;t be
              recovered.
            </p>
          )}

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-text-bone">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--accent-primary)]"
            />
            Remember me on this device
          </label>

          <button
            disabled={busy}
            onClick={submit}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-DEFAULT bg-accent-primary px-5 py-2.5 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
            {mode === "signup" ? "Create account" : mode === "recover" ? "Recover account" : "Sign in"}
          </button>

          <div className="mt-4 space-y-1.5 text-center font-mono text-[11px] text-text-stone">
            {mode === "signup" && (
              <button
                onClick={() => switchMode("signin")}
                className="underline-offset-2 transition-colors hover:text-accent-primary hover:underline"
              >
                I already have an account — sign in
              </button>
            )}
            {mode === "signin" && (
              <>
                <button
                  onClick={() => switchMode("recover")}
                  className="block w-full underline-offset-2 transition-colors hover:text-accent-primary hover:underline"
                >
                  Forgot your passphrase? Recover with your recovery key
                </button>
                <button
                  onClick={() => {
                    if (accountId) {
                      forgetAccount();
                      setEmail("");
                    }
                    switchMode("signup");
                  }}
                  className="block w-full underline-offset-2 transition-colors hover:text-accent-primary hover:underline"
                >
                  Create a new account
                </button>
              </>
            )}
            {mode === "recover" && (
              <button
                onClick={() => switchMode("signin")}
                className="underline-offset-2 transition-colors hover:text-accent-primary hover:underline"
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[10px] text-text-stone">
          FocusFlow — Productivity
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  onEnter?: () => void;
}) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-stone">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary",
        )}
      />
    </div>
  );
}
