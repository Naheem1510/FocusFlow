import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AccentKey = "terracotta" | "sage" | "ochre" | "rose";

export const ACCENTS: Record<
  AccentKey,
  { label: string; primary: string; hover: string; soft: string }
> = {
  terracotta: { label: "Terracotta", primary: "#c4654a", hover: "#a8503a", soft: "rgba(196,101,74,0.15)" },
  sage: { label: "Sage", primary: "#7a9e7e", hover: "#688a6c", soft: "rgba(122,158,126,0.15)" },
  ochre: { label: "Ochre", primary: "#d4a843", hover: "#bb9234", soft: "rgba(212,168,67,0.15)" },
  rose: { label: "Rose Clay", primary: "#c97b6e", hover: "#b0655a", soft: "rgba(201,123,110,0.15)" },
};

interface SettingsState {
  profileName: string;
  plan: string;
  accent: AccentKey;
  requireVaultPin: boolean;
  /**
   * When ON, the Vault persists a long-term identity key on this device so you
   * can receive messages sent while you were offline. Trade-off: it relaxes the
   * Vault's memory-only "Zero Trace" stance. Default ON; toggle any time.
   */
  receiveOfflineMessages: boolean;
  /** Whether the one-time "offline delivery is on" notice has been dismissed. */
  offlineNoticeAck: boolean;
  setProfileName: (name: string) => void;
  setAccent: (accent: AccentKey) => void;
  setRequireVaultPin: (on: boolean) => void;
  setReceiveOfflineMessages: (on: boolean) => void;
  ackOfflineNotice: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      profileName: "",
      plan: "Pro Plan",
      accent: "terracotta",
      requireVaultPin: false,
      receiveOfflineMessages: true,
      offlineNoticeAck: false,
      setProfileName: (profileName) => set({ profileName: profileName || "there" }),
      setAccent: (accent) => set({ accent }),
      setRequireVaultPin: (requireVaultPin) => set({ requireVaultPin }),
      setReceiveOfflineMessages: (receiveOfflineMessages) => set({ receiveOfflineMessages }),
      ackOfflineNotice: () => set({ offlineNoticeAck: true }),
    }),
    { name: "focusflow-settings" },
  ),
);
