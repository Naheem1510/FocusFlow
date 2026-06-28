# FocusFlow

A premium "Warm Industrial" productivity suite (the **Surface** layer) that conceals
an in-memory, covert chat layer (the **Vault**). Rebuilt frontend per the FocusFlow
blueprint — Next.js + Tailwind + Zustand + Framer Motion + Lucide.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Design system — "Desert Dusk"

Tokens live in [`tailwind.config.ts`](tailwind.config.ts) and the theme-swap CSS
variables in [`app/globals.css`](app/globals.css).

- **Surface theme**: Warm Charcoal background + Burnt Terracotta accent.
- **Vault theme**: Deep Obsidian background + Electric Teal accent.
- The swap is driven by a single `data-vault` attribute on `<html>`; every
  `accent-primary` / `background-base` class crossfades over 600ms.
- Type: Fraunces (display), DM Sans (UI/body), JetBrains Mono (metadata).

## Entering the Vault (secret activation)

The Vault state is **memory-only** (no `persist`, no URL change) — a refresh always
returns to the Surface. Three ways in:

1. **Logo tap** — click the **F** in the FocusFlow wordmark 5× within 3 seconds
   ([`components/Logo.tsx`](components/Logo.tsx)).
2. **Search incantation** — type `vault` in the dashboard global search and press
   Enter ([`components/layout/GlobalSearch.tsx`](components/layout/GlobalSearch.tsx)).
3. **Shortcut** — `Ctrl/Cmd + Shift + K`.

**Panic exit**: `Esc` performs an instant hard-cut back to the last surface screen.

## Structure

```
app/                     layout (fonts, camouflaged title), globals, page
components/
  Logo.tsx               5-tap secret entry
  layout/                Sidebar, MobileTopBar, GlobalSearch, AppShell
  surface/Dashboard.tsx  productivity camouflage screen
  vault/Vault.tsx        covert chat (channels, burn timers, presence)
store/                   useAppStore (surface/vault), useVaultStore (chat)
hooks/useVaultGestures   Esc panic-exit + Ctrl/Shift/K + data-vault theme swap
```

## The Vault backend (real E2E encryption)

The Vault wires to the **secure-workspace** Cloudflare Worker at
[`../secure-workspace`](../secure-workspace) for genuine end-to-end encryption:
ECDH P-256 key exchange, HKDF-SHA-256, AES-GCM-256, over a Durable Object
WebSocket relay that never sees plaintext. The client logic lives in
[`lib/vault/`](lib/vault/) (`crypto`, `socket`, `connection`, `config`). Keys
and messages are **memory-only** — no IndexedDB, matching Zero Trace.

If no worker is reachable, the Vault falls back to a seed-data **preview** so the
design still renders.

### Run the Vault live
```bash
# terminal 1 — the encrypted relay
cd ../secure-workspace && npx wrangler dev --port 8787 --local

# terminal 2 — the app
cd focusflow && npm run dev
```
In the Vault, click **"Open a live secure room"** → **Create & connect**, then
copy the invite link into a second browser tab. The ECDH handshake completes
automatically and messages are encrypted end-to-end. Configure a deployed worker
with `NEXT_PUBLIC_WORKER_URL` (see `.env.example`).

## Status

Surface layer complete (Dashboard, Notes, Tasks/Kanban, Calendar, Focus,
Habits). Vault complete with live backend integration. See
[PROGRESS.md](PROGRESS.md) for remaining hardening (PIN gate, attachments,
receipts/reactions) and shared bits (New Entry modal, mobile nav, Settings).
