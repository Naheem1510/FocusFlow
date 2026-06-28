"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Global search. Functions as a normal search box — but typing the
 * incantation "vault" and pressing Enter is Secret Entry #2.
 */
export function GlobalSearch() {
  const [value, setValue] = useState("");
  const enterVault = useAppStore((s) => s.enterVault);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim().toLowerCase() === "vault") {
      e.preventDefault();
      setValue("");
      enterVault();
    }
  };

  return (
    <div className="relative w-full max-w-sm">
      <Search
        size={18}
        strokeWidth={1.75}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-stone"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search notes, tasks, people…"
        className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary py-2 pl-10 pr-3 text-sm text-text-parchment placeholder:text-text-stone outline-none transition-colors focus:border-accent-primary"
      />
    </div>
  );
}
