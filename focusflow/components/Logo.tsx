"use client";

import { useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * The FocusFlow wordmark. Tapping the "F" five times within 3 seconds is
 * Secret Entry #1 into the Vault. To any observer it's just a logo.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  const [clicks, setClicks] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterVault = useAppStore((s) => s.enterVault);

  const handleTapF = () => {
    const next = clicks + 1;
    setClicks(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setClicks(0), 3000);
    if (next >= 5) {
      enterVault();
      setClicks(0);
    }
  };

  return (
    <div className="flex items-center gap-2 select-none">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-accent-primary/15 ring-1 ring-accent-primary/30">
        <span
          onClick={handleTapF}
          className="cursor-pointer font-display text-xl font-semibold leading-none text-accent-primary"
          aria-hidden
        >
          F
        </span>
      </div>
      {!compact && (
        <span className="font-display text-lg font-semibold tracking-tight text-text-parchment">
          ocusFlow
        </span>
      )}
    </div>
  );
}
