# FocusFlow — Build Progress

Living log of what's built and what's next. Update this at the end of each work
session. Newest status at top.

**Last updated:** 2026-06-27

---

## Current status

**Project complete.** Every Surface screen does real CRUD against persistent
localStorage stores; Settings, Support, mobile nav, and theming are in; and the
Vault runs live ECDH/AES-GCM encrypted rooms (with reactions, delivery state,
and an optional PIN lock) over the secure-workspace Cloudflare Worker. Production
build compiles clean; dev server renders 200.

**Vault is real-only + asynchronous (2026-06-27 session):** the fake "preview"
demo is gone — every participant, message, fingerprint and presence value comes
from an actual connection. Contacts can be **saved** (reusable non-expiring
invites) so you reconnect without re-sharing a link. Messages now survive being
offline via a **Durable-Object store-and-forward mailbox** + **persistent
identity keys** (IndexedDB) — and a **background connection** delivers them while
you're on the normal productivity screens, not only inside the Vault. A
theme-matched favicon recolours on new Vault messages; the PIN pad accepts
keyboard input. The async layer is opt-in via Settings → "Receive messages sent
while you were offline" (default ON, with an in-Vault notice). The Vault is now
**multi-room**: every saved contact connects in the background with its own
thread + unread badge, so any of them can reach you at once. Offline messages use
**X3DH one-time prekeys** for forward secrecy. Worker mailbox, full offline crypto
path, and X3DH key-agreement all verified end-to-end with Node tests.

**Encrypted cloud sync (zero-knowledge):** optional account in Settings encrypts
all surface data (AES-GCM) in the browser with a passphrase-derived key
(PBKDF2→HKDF), storing only ciphertext on the worker (`/api/sync/*` + KV). The
server can neither read the data nor reproduce the auth token. Validated
end-to-end against `wrangler dev`: register → encrypted pull/decrypt → wrong
passphrase rejected (401) → push/update → duplicate register blocked (409).
See `lib/sync/*`, `store/useAccountStore.ts`, `worker/sync.js`.

Surface data persists across refresh via `zustand/persist`; the Vault stays
memory-only (Zero Trace). A client hydration gate in AppShell prevents SSR
mismatch from the persisted stores.

Verified against `wrangler dev` (port 8787): room create → invite resolve →
join → two-client WebSocket relay all return 200 / relay correctly.

**Run the Vault for real:**
1. `cd ../secure-workspace && npx wrangler dev --port 8787 --local`
2. `cd ../focusflow && npm run dev` → open the Vault → "Open a live secure room"
3. Copy the invite link into a second tab to complete the encrypted handshake.

**Stack:** Next.js 14 (App Router) · Tailwind v3 · Zustand · Framer Motion · Lucide
**Location:** `Website/focusflow`
**Run:** `npm run dev` → http://localhost:3000

---

## ✅ Done

### Async + real-only Vault (2026-06-27 session)
- [x] **Removed the fake "preview" layer** — no seed channels/members/messages.
      Every name, message, fingerprint and presence value is from a live
      connection. Empty "no room yet" state replaces the fabricated chat.
- [x] **Real participant identity** — each peer announces their display name on
      the existing `public_key` handshake (relay passes the whole envelope
      through); messages, typing and the members panel show real names +
      per-peer verification fingerprints (`onPeer`/`PeerIdentity`)
- [x] **Saved contacts** (`store/useContactsStore.ts`, persisted) — friendly name
      → reusable, **non-expiring invite** (fixed a worker bug where `'never'`
      fell through to 7d via `??` vs `in`). Reconnect from the lobby / sidebar
      without re-sharing a link; rename/remove; "Save as contact" in room panel
- [x] **Reconnect re-keying fix** — `handlePeerPublicKey` always adopts the
      latest shared key (was pinned to the first peer), so a rejoining contact's
      messages decrypt both ways instead of one-directionally
- [x] **Worker-unreachable timeout** — `fetchWithTimeout` (8s) so a down/stuck
      relay fails fast instead of spinning "Create a secure room" forever
- [x] **Offline delivery (store-and-forward):** `Room` Durable Object buffers
      content envelopes as opaque ciphertext in DO storage (`mbx:<id>`), flushes
      unacked ones to a peer on (re)connect, deletes on `ack`, sweeps at a 7d TTL
      via a DO alarm. Verified with a Node WebSocket protocol test.
- [x] **Persistent identity keys** (`lib/vault/identity.ts`) — ECDH identity
      keypair in IndexedDB + stable userId, so a contact's shared secret is
      stable across reconnects and offline messages decrypt later. Ephemeral
      fallback when the setting is off. Contacts cache the peer's identity pubkey
      so you can encrypt to (and decrypt from) them while they're offline.
      Full offline crypto path verified E2E with Node (real Web Crypto + worker).
- [x] **Background connection** (`hooks/useVaultBackgroundConnection.ts`) —
      reconnects to your most-recent contact on app load so messages arrive (and
      the favicon alerts) while you're on the normal productivity screens
- [x] **Settings toggle** "Receive messages sent while you were offline" (default
      ON) + one-time in-Vault notice; turning it off wipes the persisted identity
      (restores Zero Trace). "Delivered while you were away" divider in the stream.
- [x] **Favicon alert** (`lib/favicon.ts`, `hooks/useVaultFavicon.ts`) —
      generated theme-matched "F" mark recolours terracotta→teal + badge on a new
      Vault message, reverts when you return. Static `app/icon.svg` default.
- [x] **Keyboard PIN entry** (`PinGate`) — type digits / Backspace, not just taps

### Foundation
- [x] Next.js + TypeScript scaffold, Tailwind v3, fonts (Fraunces / DM Sans / JetBrains Mono)
- [x] "Desert Dusk" design tokens (`tailwind.config.ts`)
- [x] Theme-swap engine — single `data-vault` attr on `<html>` drives 600ms
      Terracotta→Teal / Charcoal→Obsidian crossfade via CSS variables (`globals.css`)
- [x] Print protection (`@media print` hides vault) + camouflaged page title

### State & gestures
- [x] `useAppStore` — surface/vault state, memory-only (no persist)
- [x] `useVaultStore` — channels, members, messages, burn arming (seed data)
- [x] `useVaultGestures` — Esc panic-exit, Ctrl/Cmd+Shift+K toggle, theme reflect

### Surface layer
- [x] App shell: desktop Sidebar (animated active indicator), MobileTopBar
- [x] Logo with 5-tap secret entry
- [x] GlobalSearch with "vault" incantation entry
- [x] **Dashboard** — greeting, Focus-for-Today tasks, recent notes,
      mini-calendar, habit streak, Focus-Hours chart (staggered entrance)
- [x] **Notes** — live editor (auto-saving title/body), create/delete, add/remove
      tags, folder assignment + filtering, search (`useNotesStore`, persisted)
- [x] **Tasks / Kanban** — persistent drag between columns, create/edit/delete via
      modal (title, project, priority, due, progress) (`useTasksStore`, persisted)
- [x] **Calendar** — real current month + navigation, add/edit/delete events keyed
      by date, agenda side panel (`useCalendarStore`, persisted)
- [x] **Focus** — Pomodoro countdown + SVG ring; completed sessions logged to
      `useFocusStore` (persisted), surfaced on the Dashboard chart
- [x] **Habits** — add/delete habits, real-date Mon–Sun toggle, computed trailing
      streaks, completion stats (`useHabitsStore`, persisted)
- [x] **Dashboard** — wired to live store data: today's tasks (complete inline),
      recent notes (click to open), current-month mini-calendar with event dots,
      top habit streak, real weekly focus-hours chart
- [x] **New Entry** sidebar button → quick-create menu (Note / Task / Event / Habit)
- [x] **Settings** — editable profile name (feeds greeting + sidebar), 4 accent
      themes (re-tints surface, Vault stays teal), Vault-PIN toggle, data
      export/erase (`useSettingsStore`, persisted)
- [x] **Support** — quick links, keyboard-shortcut reference, collapsible FAQ
- [x] **Mobile nav drawer** — hamburger + slide-out sidebar (shared `SidebarContent`)
- [x] Persistence layer: `zustand/persist` stores + `useHydrated` SSR gate

### Vault layer
- [x] Full-screen takeover: secure top bar, channel/DM sidebar, message stream,
      composer, member-presence panel
- [x] Ephemeral "burn" messages with live countdown + auto-delete
- [x] **Live backend integration** (Track B):
  - `lib/vault/crypto.ts` — ECDH P-256, HKDF-SHA-256, AES-GCM-256, fingerprint
  - `lib/vault/socket.ts` — reconnecting WebSocket client, heartbeat, typed events
  - `lib/vault/connection.ts` — room create/join (REST) + key-exchange choreography
  - `lib/vault/config.ts` — worker URL (NEXT_PUBLIC_WORKER_URL / localhost default)
  - Lobby (create / join via invite link), live connection badge, real presence,
    typing indicator, session fingerprint for verification, copyable invite link
  - Keys & messages are **memory-only** (no IndexedDB) — matches Zero Trace
  - Auto-join when arriving via `?vault=<token>` invite link
  - Message **reactions** (broadcast over the relay) + sent/delivered indicator
  - Optional **PIN lock** (`PinGate`, PBKDF2-hashed, session-only) — Settings toggle

---

### UI refinement pass
- [x] Softer radii throughout — bumped the Tailwind radius scale; cards/bubbles
      now `rounded-xl`, modals `rounded-2xl` (less rectangular, more tactile)
- [x] Warm, diffuse elevation — replaced hard black `shadow-2xl` with soft custom
      box-shadows
- [x] Smooth screen-to-screen transitions (`AnimatePresence mode="wait"` keyed on
      active screen) + shared easing/variants in `lib/motion.ts`
- [x] Accessibility/polish: accent `:focus-visible` rings, `prefers-reduced-motion`
      honoured in both CSS and framer (`<MotionConfig reducedMotion="user">`)

### Encrypted cloud sync (zero-knowledge, opt-in)
- [x] Worker endpoints `worker/sync.js` (`/api/sync/salt|register|pull|push`, KV-backed)
- [x] Client `lib/sync/{crypto,api,snapshot}.ts` + `store/useAccountStore.ts`
      (PBKDF2→HKDF keys, AES-GCM snapshot, debounced push, pull-on-unlock)
- [x] `SyncSettings` UI in Settings: set up / unlock / status / sync-now / sign out
- [x] Keys & passphrase never persist or leave the device; server stores only ciphertext

### Rich-text Notes editor
- [x] Replaced the plain `<textarea>` with a `contentEditable` rich editor
      (`RichTextEditor.tsx`) storing HTML in `note.body`
- [x] Formatting toolbar: bold/italic/underline/strikethrough, H1/H2, quote,
      bullet/numbered lists, highlight, text colour, clear formatting
- [x] Per-note **font family** (DM Sans / Fraunces / JetBrains Mono) and **text
      size** (Small/Normal/Large/Huge), persisted on the note (`font`/`size`)
- [x] `.rte` styles in globals.css; `htmlToText` helper strips tags for list /
      Dashboard previews + search

### Nested notes (Notion-style hierarchy)
- [x] `Note.parentId` on every note; `createNote(folder, parentId)` nests under a parent
- [x] `deleteNote` cascades to all descendants; `moveNote` re-parents with cycle protection
- [x] `descendantIds()` + `notePath()` helpers (path powers breadcrumbs — and future graph view)
- [x] Recursive `NoteTree` sidebar: expand/collapse chevrons, hover `+` to add a sub-note at any depth
- [x] In-editor breadcrumb trail + "Sub-notes" section to add/open nested pages
- [x] Foundation for the planned **graph view** of how notes connect (parent→child edges)

### Notes graph view (Obsidian-style)
- [x] `NotesGraph.tsx` — force-directed graph on `<canvas>`, no d3/graph dependency
      (custom physics: pairwise repulsion + link springs + center gravity, cooling alpha)
- [x] Nodes = notes, edges = parent→child links; node radius scales with degree
- [x] Pan (drag background), zoom (scroll, cursor-anchored), drag nodes, hover-to-
      highlight neighbours, click-to-open (jumps back to list with the note active)
- [x] Auto-fit on first settle, zoom in/out + fit-to-view controls, accent-tinted
      active node + glow; labels fade in with zoom
- [x] Respects `prefers-reduced-motion` (settles synchronously, no animation) and
      auto-stops the rAF loop when idle to save CPU
- [x] List ⇄ Graph toggle in the Notes header (`ViewToggle`)
- [x] Edge model is hierarchy-only for now; ready for cross-note links later

### Global focus timer + floating mini-widget
- [x] Lifted the Pomodoro into a global `useTimerStore` with an app-wide ticker
      (interval lives in AppShell), so it keeps counting across screen navigation
- [x] `FocusMiniTimer` — floating picture-in-picture pill (top-right) showing the
      live countdown + progress ring + pause/resume; click to jump to Focus.
      Hidden on the Focus screen itself and inside the Vault (camouflage).

### Bug fixes
- [x] **Navigation went blank** (clicking Habits/Calendar/Focus etc. showed
      nothing): the `AnimatePresence mode="wait"` screen transition could stall —
      especially under `prefers-reduced-motion` — and never mount the incoming
      screen. Replaced with a plain keyed `motion.div` fade-in (can't get stuck).
- [x] **Build/runtime crash**: a `confirm` state var in `SyncSettings` shadowed
      `window.confirm()` ("String has no call signatures") — renamed to `confirmPass`
- [x] Updated stale copy (Support FAQ + Settings) that claimed data was local-only
- [x] Snappier screen transitions (0.18s) so navigation no longer feels laggy

### Deployment (hybrid: Cloud Run frontend + Cloudflare relay)
- [x] `next.config` `output: "standalone"` + multi-stage `Dockerfile` + `.dockerignore`
- [x] `NEXT_PUBLIC_WORKER_URL` wired as a Docker build arg (Next inlines it)
- [x] `DEPLOY.md` — full guide: `gcloud run deploy --source .`, worker `wrangler deploy`,
      env wiring, optional CORS lock + custom domain
- [x] Backend confirmed deploy-ready for hybrid: CORS already `*`, relay sees only ciphertext

---

## 🔨 Optional future enhancements

Core product is complete. These are advanced extras, deliberately deferred:

- [ ] Encrypted file/voice attachments (worker has `/api/upload` + R2; the
      composer paperclip is currently a stub). Largest remaining piece — needs
      `encryptFile` → upload → `file_meta` envelope → peer download + decrypt.
- [x] **Multi-room Vault** — the store now holds many `RoomSession`s at once
      (`store/useVaultStore.ts`); all saved contacts connect in the background,
      each with its own messages + unread badge, switchable from the sidebar.
- [x] **X3DH / one-time prekeys** — forward-secret offline messages.
      `worker/prekeys.js` distributes published bundles; `lib/vault/x3dh.ts` +
      `lib/vault/prekeys.ts` generate/consume one-time prekeys and derive a
      fresh per-message key. Verified E2E with Node (`x3dh-e2e`). NOTE: reduced
      X3DH — no *signed* prekey; auth still rests on the invite link + verifiable
      fingerprint. (Genuine first-contact-while-offline is still bounded by the
      invite model: a sender only learns a peer's identity after one live join.)
- [ ] Sync conflict resolution (currently last-write-wins; remote wins on unlock)
- [ ] Deploy the worker + set `NEXT_PUBLIC_WORKER_URL` for a hosted Vault

---

## Reference

- Design guides: `DESIGN.md`, `focusflow_frontend_implementation_blueprint.md` (project root)
- Stitch source designs: `C:\Users\nahee\Downloads\stitch_covert_task_messenger`
- Backend: `Website/secure-workspace` (working E2E messenger)
