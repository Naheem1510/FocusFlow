"use client";

import { useState } from "react";
import { Copy, Check, KeyRound, ShieldAlert } from "lucide-react";
import { useAccountStore } from "@/store/useAccountStore";

/**
 * Shown once, right after a recovery key is generated (sign-up or regenerate).
 * The key is never stored anywhere we can show again — the user must save it now.
 */
export function RecoveryKeyModal() {
  const recoveryKey = useAccountStore((s) => s.recoveryKey);
  const dismiss = useAccountStore((s) => s.dismissRecoveryKey);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!recoveryKey) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-ash bg-background-secondary p-6 text-text-parchment shadow-2xl">
        <div className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-accent-primary">
          <KeyRound size={20} /> Save your recovery key
        </div>
        <p className="text-sm leading-relaxed text-text-bone">
          This is the <span className="text-text-parchment">only</span> way to get back
          into your account if you forget your passphrase. Store it somewhere safe — a
          password manager is ideal. We can&apos;t show it again or reset it for you.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-DEFAULT border border-accent-primary/30 bg-background-tertiary p-3">
          <code className="flex-1 select-all break-all font-mono text-sm tracking-wider text-text-parchment">
            {recoveryKey}
          </code>
          <button
            onClick={copy}
            title="Copy"
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-DEFAULT text-text-bone transition-colors hover:text-accent-primary"
          >
            {copied ? <Check size={16} className="text-accent-sage" /> : <Copy size={16} />}
          </button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-accent-ochre">
          <ShieldAlert size={13} className="mt-0.5 flex-shrink-0" />
          Anyone with this key can decrypt your data. Keep it private.
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-text-bone">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="h-4 w-4 accent-[color:var(--accent-primary)]"
          />
          I&apos;ve saved my recovery key somewhere safe
        </label>

        <button
          disabled={!confirmed}
          onClick={() => {
            setConfirmed(false);
            dismiss();
          }}
          className="mt-5 w-full rounded-DEFAULT bg-accent-primary px-5 py-2.5 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50"
        >
          Done
        </button>
      </div>
    </div>
  );
}
