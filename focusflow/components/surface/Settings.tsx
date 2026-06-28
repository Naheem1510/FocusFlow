"use client";

import { useState } from "react";
import { Download, Trash2, Check, ShieldQuestion } from "lucide-react";
import { ACCENTS, useSettingsStore, type AccentKey } from "@/store/useSettingsStore";
import { SyncSettings } from "./SyncSettings";
import { clearPersistentIdentity } from "@/lib/vault/identity";
import { cn } from "@/lib/cn";

const STORE_KEYS = [
  "focusflow-notes",
  "focusflow-tasks",
  "focusflow-calendar",
  "focusflow-habits",
  "focusflow-focus",
  "focusflow-settings",
];

export function Settings() {
  const {
    profileName,
    plan,
    accent,
    requireVaultPin,
    receiveOfflineMessages,
    setProfileName,
    setAccent,
    setRequireVaultPin,
    setReceiveOfflineMessages,
  } = useSettingsStore();
  const [name, setName] = useState(profileName);
  const [saved, setSaved] = useState(false);

  const exportData = () => {
    const dump: Record<string, unknown> = {};
    for (const k of STORE_KEYS) {
      const v = localStorage.getItem(k);
      if (v) dump[k] = JSON.parse(v);
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "focusflow-data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearData = () => {
    if (!confirm("Erase all FocusFlow data on this device? This cannot be undone.")) return;
    for (const k of STORE_KEYS) localStorage.removeItem(k);
    location.reload();
  };

  return (
    <div className="custom-scrollbar mx-auto h-full max-w-3xl overflow-y-auto px-4 py-6 md:px-12 md:py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text-parchment md:text-4xl">
        Settings
      </h1>
      <p className="mt-1 text-text-bone">Tune your workspace.</p>

      {/* Profile */}
      <Section title="Profile">
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-stone">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment outline-none focus:border-accent-primary"
          />
          <button
            onClick={() => {
              setProfileName(name.trim());
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            }}
            className="flex items-center gap-1.5 rounded-DEFAULT bg-accent-primary px-4 py-2 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97]"
          >
            {saved ? <Check size={15} /> : null} {saved ? "Saved" : "Save"}
          </button>
        </div>
        <p className="mt-2 font-mono text-[11px] text-text-stone">Plan: {plan}</p>
      </Section>

      {/* Accent */}
      <Section title="Accent color">
        <p className="mb-3 text-sm text-text-bone">
          Re-tints the productivity surface. The Vault always uses Electric Teal.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(ACCENTS) as AccentKey[]).map((k) => {
            const a = ACCENTS[k];
            const active = accent === k;
            return (
              <button
                key={k}
                onClick={() => setAccent(k)}
                className={cn(
                  "flex items-center gap-2 rounded-DEFAULT border px-3 py-2.5 text-sm transition-colors",
                  active ? "border-accent-primary bg-accent-soft text-text-parchment" : "border-border-ash text-text-bone hover:text-text-parchment",
                )}
              >
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: a.primary }} />
                {a.label}
                {active && <Check size={14} className="ml-auto text-accent-primary" />}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Encrypted cloud sync */}
      <SyncSettings />

      {/* Vault security */}
      <Section title="Vault security">
        <Toggle
          label="Require a PIN to open the Vault"
          desc="Adds a PBKDF2-hashed lock screen for the covert layer. The PIN lives only in this tab's memory (cleared on close)."
          checked={requireVaultPin}
          onChange={setRequireVaultPin}
        />
        <div className="mt-5 border-t border-border-ash pt-5">
          <Toggle
            label="Receive messages sent while you were offline"
            desc="Stores a long-term identity key on this device and lets the relay hold encrypted messages for you until you reconnect. Turning this off restores the Vault's memory-only Zero-Trace mode (and forgets this device's identity key)."
            checked={receiveOfflineMessages}
            onChange={(on) => {
              setReceiveOfflineMessages(on);
              if (!on) void clearPersistentIdentity();
            }}
          />
        </div>
      </Section>

      {/* Data */}
      <Section title="Data">
        <p className="mb-3 text-sm text-text-bone">
          Productivity data (notes, tasks, calendar, habits, focus) is stored locally in
          this browser, plus encrypted in the cloud if you enable sync above. Vault
          messages are never stored.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportData}
            className="flex items-center gap-2 rounded-DEFAULT border border-border-ash px-4 py-2 text-sm text-text-parchment transition-colors hover:bg-background-tertiary"
          >
            <Download size={16} /> Export data
          </button>
          <button
            onClick={clearData}
            className="flex items-center gap-2 rounded-DEFAULT border border-accent-terracotta/40 px-4 py-2 text-sm text-accent-terracotta transition-colors hover:bg-accent-terracotta/10"
          >
            <Trash2 size={16} /> Erase all data
          </button>
        </div>
      </Section>

      <div className="mt-8 flex items-center gap-2 font-mono text-[11px] text-text-stone">
        <ShieldQuestion size={14} /> FocusFlow — Productivity · local-first
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-border-ash bg-background-secondary p-6">
      <h2 className="mb-4 font-display text-lg font-medium text-text-parchment">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-text-parchment">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-text-bone">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 flex-shrink-0 rounded-full transition-colors",
          checked ? "bg-accent-primary" : "bg-background-tertiary border border-border-ash",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-text-parchment transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
