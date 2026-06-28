# Secure Workspace

A secure, end-to-end encrypted communication platform built as a capstone project
on private communication systems and end-to-end encryption.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (client)                                           │
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │  Dashboard UI   │  │  Collaboration Stream (chat)    │  │
│  │  (CSS-toggled)  │  │  (hidden until room joined)     │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
│                                                             │
│  crypto.js ── Web Crypto API (no external libs)            │
│  storage.js ── IndexedDB (keys + messages, local only)     │
│  socket.js  ── WebSocket client with auto-reconnect        │
└───────────────────────────────┬─────────────────────────────┘
                                │ WSS / HTTPS
┌───────────────────────────────▼─────────────────────────────┐
│  Cloudflare Workers (worker/)                               │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │  HTTP Router     │  │  Durable Object (Room)          │ │
│  │  worker/index.js │  │  worker/room.js                 │ │
│  │                  │  │  — WebSocket relay per room     │ │
│  │  Routes:         │  │  — Never reads ciphertext       │ │
│  │  /api/room/*     │  └──────────────────────────────────┘ │
│  │  /api/invite/*   │                                       │
│  │  /api/push/*     │  ┌──────────────────────────────────┐ │
│  │  /api/upload     │  │  KV Store                       │ │
│  │  /ws/:roomId     │  │  — Room metadata                │ │
│  └──────────────────┘  │  — Invite tokens                │ │
│                        │  — Push subscriptions           │ │
│                        └──────────────────────────────────┘ │
│                        ┌──────────────────────────────────┐ │
│                        │  R2 Bucket                      │ │
│                        │  — Encrypted file/voice blobs   │ │
│                        │  — Auto-deleted after 48h       │ │
│                        └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Three-layer design:**
1. **Encryption layer** — ECDH key exchange + HKDF derivation + AES-GCM-256. All in-browser via Web Crypto API.
2. **Transport layer** — Cloudflare Durable Objects relay encrypted blobs. Server never has access to keys.
3. **UI layer** — Professional dashboard shell with CSS-toggled chat view.

---

## Security model

### What it protects against
- Network-level eavesdropping (WSS + AES-GCM-256)
- Server compromise (zero plaintext on server, keys never leave browser)
- Storage compromise (IndexedDB holds keys; auto-delete enforced)
- Casual observation (dashboard shell, plausible URLs)

### What it does NOT protect against
- Physical device access with the app unlocked
- Malicious browser extensions with DOM read access
- Keyloggers at the OS level
- Compromised browser vendors
- Legal compulsion on the hosting provider (metadata may be available)

### Cryptographic primitives
| Purpose | Algorithm |
|---------|-----------|
| Key exchange | ECDH P-256 |
| Key derivation | HKDF-SHA-256 |
| Encryption | AES-GCM-256 |
| PIN hashing | PBKDF2-SHA-256, 100 000 iterations |
| Fingerprint | SHA-256 of session key, first 6 bytes |
| Token generation | `crypto.getRandomValues` (128-bit) |

---

## Local development setup

### Prerequisites
- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- A Cloudflare account (free tier is sufficient)

### Steps

```bash
# 1. Clone and enter the project
cd secure-workspace

# 2. Copy environment template
cp .env.example .env
# Fill in your Cloudflare credentials

# 3. Start the Worker locally
wrangler dev

# 4. Serve the frontend (any static server)
npx serve frontend -p 5173

# 5. Open http://localhost:5173
```

The `window.__WORKER_URL__` in `index.html` auto-detects `localhost` and points to
`http://localhost:8787` (Wrangler default).

---

## Deployment guide

### Step 1 — Cloudflare KV namespace

```bash
wrangler kv:namespace create WORKSPACE_KV
# Copy the returned ID into wrangler.toml → kv_namespaces[].id
```

### Step 2 — R2 bucket

```bash
wrangler r2 bucket create workspace-files
```

### Step 3 — Deploy the Worker

```bash
wrangler deploy
```

### Step 4 — Deploy the frontend to Cloudflare Pages

```bash
# From the Cloudflare dashboard:
# Pages → Create project → Connect to Git (or upload directly)
# Build output directory: frontend
# No build command needed (vanilla)

# Or via CLI:
wrangler pages deploy frontend --project-name secure-workspace
```

### Step 5 — Update the Worker URL

Edit `frontend/index.html` — replace `secure-workspace.your-worker.workers.dev`
with the actual Worker URL shown after `wrangler deploy`.

### Step 6 — Set Worker secrets

```bash
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT
```

---

## Wrangler CLI command reference

| Command | Purpose |
|---------|---------|
| `wrangler dev` | Start local development server |
| `wrangler deploy` | Deploy Worker to Cloudflare |
| `wrangler pages deploy frontend` | Deploy frontend to Pages |
| `wrangler kv:namespace create NAME` | Create a KV namespace |
| `wrangler r2 bucket create NAME` | Create an R2 bucket |
| `wrangler secret put KEY` | Set a Worker secret |
| `wrangler tail` | Stream live Worker logs |
| `wrangler kv:key list --binding WORKSPACE_KV` | Inspect KV keys |

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | API token with Workers + Pages permissions |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `VAPID_SUBJECT` | `mailto:` URI for VAPID contact |
| `APP_DOMAIN` | Full origin of the Pages deployment |

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

---

## PWA installation

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap the address bar menu → "Add to Home Screen"
3. The app installs as a standalone PWA

### iPhone / iPad (Safari, iOS 16.4+)
1. Open the URL in Safari
2. Tap the Share button → "Add to Home Screen"
3. Confirm the name and tap "Add"

### Windows (Edge / Chrome)
1. Open the URL
2. Click the install icon in the address bar (or browser menu → "Install app")

The PWA name is "Workspace Dashboard" across all platforms.

---

## Capstone notes

### Design decisions
- **Vanilla JS only** — demonstrates mastery of browser APIs without framework abstraction; also minimises dependency surface.
- **Web Crypto API** — all cryptography uses the browser's native, audited implementation. No third-party crypto libraries.
- **Cloudflare free tier** — zero infrastructure cost; Durable Objects provide per-room WebSocket state without a traditional server.
- **IndexedDB for key storage** — private keys never leave the browser; PKCS8 export format for structured persistence.
- **HKDF over raw ECDH** — domain-separates the shared secret to prevent key reuse across sessions.

### Trade-offs
- **No forward secrecy** — session keys persist in IndexedDB. A proper Signal-protocol implementation would rotate keys per message, but that adds significant complexity beyond this project's scope.
- **No multi-device sync** — because private keys never leave the first device, a second device cannot decrypt old messages.
- **Trust-on-first-use** — the fingerprint mechanism allows out-of-band verification but does not enforce it.
- **Cloudflare trust** — Cloudflare sees IP addresses and connection metadata even though it cannot read message content.

### What this project demonstrates
1. Applied cryptography: ECDH, HKDF, AES-GCM, PBKDF2
2. Real-time systems: WebSocket relay via Durable Objects
3. Offline-first PWA: service worker caching strategy
4. Privacy-preserving UX design
5. Secure storage: IndexedDB, localStorage, no server-side credentials
