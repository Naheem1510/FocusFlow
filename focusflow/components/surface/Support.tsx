"use client";

import { useState } from "react";
import { Keyboard, ChevronDown, LifeBuoy, Mail, BookOpen } from "lucide-react";
import { cn } from "@/lib/cn";

const SHORTCUTS: [string, string][] = [
  ["Enter (composer)", "Send message / commit"],
  ["Esc", "Close dialog · exit Vault"],
  ["Double-click a day", "New calendar event"],
  ["Drag a task card", "Move between columns"],
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Where is my data stored?",
    a: "By default, notes, tasks, calendar, habits and focus history live in your browser's local storage on this device. You can also turn on encrypted cloud sync in Settings. Either way you can export or erase everything from Settings.",
  },
  {
    q: "Is the workspace synced across devices?",
    a: "Yes, if you enable it. Settings → Encrypted cloud sync lets you sign in with an email + passphrase. Your data is encrypted in the browser before it's uploaded, so the server only ever stores ciphertext it cannot read. Sign in with the same email + passphrase on another device to sync.",
  },
  {
    q: "What if I forget my sync passphrase?",
    a: "There is no reset — by design. The passphrase derives the encryption key and is never sent anywhere, so if you lose it the encrypted data cannot be recovered. Keep it somewhere safe.",
  },
  {
    q: "How do I keep my focus streak?",
    a: "Complete a Deep Work session on the Focus screen each day. Finished sessions are logged automatically and feed the Dashboard chart.",
  },
  {
    q: "Something looks off after an update.",
    a: "Try a hard refresh. If a screen won't load, Settings → Erase all data resets the workspace to a clean state (this cannot be undone).",
  },
];

export function Support() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="custom-scrollbar mx-auto h-full max-w-3xl overflow-y-auto px-4 py-6 md:px-12 md:py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text-parchment md:text-4xl">
        Support
      </h1>
      <p className="mt-1 text-text-bone">Help, shortcuts and answers.</p>

      {/* Quick links */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { icon: BookOpen, label: "Guides", sub: "Get started" },
          { icon: Mail, label: "Email us", sub: "support@focusflow.app" },
          { icon: LifeBuoy, label: "Status", sub: "All systems normal" },
        ].map(({ icon: Icon, label, sub }) => (
          <div key={label} className="rounded-xl border border-border-ash bg-background-secondary p-5">
            <Icon size={20} strokeWidth={1.75} className="text-accent-primary" />
            <p className="mt-3 text-sm font-medium text-text-parchment">{label}</p>
            <p className="font-mono text-[11px] text-text-bone">{sub}</p>
          </div>
        ))}
      </div>

      {/* Shortcuts */}
      <section className="mt-8 rounded-xl border border-border-ash bg-background-secondary p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-medium text-text-parchment">
          <Keyboard size={18} /> Keyboard shortcuts
        </h2>
        <ul className="divide-y divide-border-ash">
          {SHORTCUTS.map(([key, desc]) => (
            <li key={key} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-text-bone">{desc}</span>
              <kbd className="rounded-sm border border-border-ash bg-background-tertiary px-2 py-1 font-mono text-[11px] text-text-parchment">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="mt-8">
        <h2 className="mb-4 font-display text-lg font-medium text-text-parchment">Frequently asked</h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border-ash bg-background-secondary">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-medium text-text-parchment">{item.q}</span>
                <ChevronDown
                  size={18}
                  className={cn("text-text-bone transition-transform", open === i && "rotate-180")}
                />
              </button>
              {open === i && (
                <p className="border-t border-border-ash px-5 py-4 text-sm leading-relaxed text-text-bone">
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
