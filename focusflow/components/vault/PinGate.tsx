"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lock, ShieldCheck, Delete } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  hashPIN,
  generatePINSalt,
  base64ToBuffer,
  bufferToBase64,
} from "@/lib/vault/crypto";
import { cn } from "@/lib/cn";

const SS_KEY = "ff_vault_pin"; // sessionStorage: { salt, hash } — cleared on tab close
const PIN_LEN = 4;

interface StoredPin {
  salt: string;
  hash: string;
}

/**
 * Optional PIN lock for the Vault. When enabled in Settings, the covert layer
 * is gated behind a PBKDF2-hashed PIN held only in this tab's sessionStorage
 * (no lasting trace). Re-entry after a panic exit re-locks, since this component
 * remounts each time the Vault opens.
 */
export function PinGate({ children }: { children: React.ReactNode }) {
  const required = useSettingsStore((s) => s.requireVaultPin);
  const [unlocked, setUnlocked] = useState(!required);
  const [stored, setStored] = useState<StoredPin | null>(null);
  const [phase, setPhase] = useState<"set" | "confirm" | "enter">("enter");
  const [entry, setEntry] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (!required) return setUnlocked(true);
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) {
      setStored(JSON.parse(raw));
      setPhase("enter");
    } else {
      setPhase("set");
    }
  }, [required]);

  const submit = async (pin: string) => {
    if (phase === "set") {
      setFirstPin(pin);
      setEntry("");
      setPhase("confirm");
      return;
    }
    if (phase === "confirm") {
      if (pin !== firstPin) {
        setError("PINs didn't match. Try again.");
        setFirstPin("");
        setEntry("");
        setPhase("set");
        return;
      }
      const salt = generatePINSalt();
      const hash = await hashPIN(pin, salt);
      const record: StoredPin = { salt: bufferToBase64(salt), hash };
      sessionStorage.setItem(SS_KEY, JSON.stringify(record));
      setUnlocked(true);
      return;
    }
    // enter
    if (!stored) return;
    const hash = await hashPIN(pin, base64ToBuffer(stored.salt));
    if (hash === stored.hash) {
      setUnlocked(true);
    } else {
      setError("Incorrect PIN.");
      setEntry("");
    }
  };

  const press = (digit: string) => {
    setError("");
    const next = (entry + digit).slice(0, PIN_LEN);
    setEntry(next);
    if (next.length === PIN_LEN) {
      void submit(next);
    }
  };

  const removeDigit = () => {
    setError("");
    setEntry((e) => e.slice(0, -1));
  };

  // Type the PIN straight from the keyboard: digits enter, Backspace deletes.
  // Bound on window so no input needs focus; re-binds as entry/phase change so
  // the captured `press`/`submit` always see current state.
  useEffect(() => {
    if (unlocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        removeDigit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, entry, phase, firstPin, stored]);

  if (unlocked) return <>{children}</>;

  const title =
    phase === "set" ? "Set a Vault PIN" : phase === "confirm" ? "Confirm your PIN" : "Vault locked";
  const subtitle =
    phase === "set"
      ? "Choose a 4-digit PIN for this session."
      : phase === "confirm"
        ? "Enter it once more to confirm."
        : "Enter your PIN to continue.";

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background-vault px-6 text-text-parchment">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xs text-center"
      >
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/30">
          <Lock size={26} strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-parchment">{title}</h1>
        <p className="mt-1 text-sm text-text-bone">{subtitle}</p>

        <div className="my-7 flex justify-center gap-3">
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-3.5 w-3.5 rounded-full border transition-colors",
                i < entry.length ? "border-accent-primary bg-accent-primary" : "border-border-ash",
              )}
            />
          ))}
        </div>

        {error && <p className="mb-4 text-sm text-accent-terracotta">{error}</p>}

        <div className="mx-auto grid max-w-[240px] grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Key key={d} onClick={() => press(d)}>{d}</Key>
          ))}
          <span />
          <Key onClick={() => press("0")}>0</Key>
          <Key onClick={removeDigit} aria-label="Delete">
            <Delete size={18} />
          </Key>
        </div>

        <p className="mt-5 font-mono text-[10px] text-text-stone">
          Tip: type your PIN on the keyboard · Backspace to delete
        </p>

        <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[10px] text-text-stone">
          <ShieldCheck size={12} className="text-accent-sage" /> PIN is PBKDF2-hashed · session-only
        </p>
      </motion.div>
    </div>
  );
}

function Key({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className="grid h-14 place-items-center rounded-DEFAULT border border-border-ash bg-background-tertiary font-display text-xl text-text-parchment transition-colors hover:border-accent-primary hover:text-accent-primary active:scale-95"
    >
      {children}
    </button>
  );
}
