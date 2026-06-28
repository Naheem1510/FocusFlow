# Deploying FocusFlow — Cloudflare free tier (all features)

Everything runs on **Cloudflare's free tier** — $0/month for personal use.

```
┌──────────────────────────────┐    fetch + wss     ┌───────────────────────────┐
│  Frontend (static export)     │ ─────────────────▶ │  Vault relay + accounts    │
│  Cloudflare Pages  (free)     │  NEXT_PUBLIC_WORKER_URL  Cloudflare Worker (free) │
│  Website/focusflow → ./out    │                    │  ../secure-workspace       │
└──────────────────────────────┘                    │  Durable Objects · KV · R2 │
                                                     └───────────────────────────┘
```

- **Frontend** is a fully static export (`output: "export"` → `./out`). No server, no
  API routes — it hosts free on **Cloudflare Pages**.
- **Worker** powers the live Vault chat, groups, offline delivery, accounts/sync and
  recovery. It uses **SQLite-backed Durable Objects** (`new_sqlite_classes`), which
  are included on the **free Workers plan**. It only ever sees ciphertext.

> Free-tier limits (plenty for personal use): Workers 100k req/day · KV 100k reads /
> 1k writes per day · R2 10 GB · Durable Objects included. Exceed them and the only
> upgrade is a flat **$5/mo** Workers Paid — still all on Cloudflare.

---

## Prerequisites

```bash
npm install -g wrangler
wrangler login          # opens the browser to your Cloudflare account
```

---

## 1. Deploy the Vault relay (Cloudflare Worker)

From `Website/secure-workspace`:

```bash
# Create the storage bindings, then paste the printed IDs into wrangler.toml
wrangler kv namespace create WORKSPACE_KV
wrangler kv namespace create WORKSPACE_KV --preview
wrangler r2 bucket create workspace-files
```

Edit **`wrangler.toml`** and replace the two KV placeholders:

```toml
[[kv_namespaces]]
binding = "WORKSPACE_KV"
id = "<id from the create command>"
preview_id = "<preview_id from the --preview command>"
```

(The Durable Object is already set to `new_sqlite_classes` — the free-tier-eligible
type. Leave it as is.) Then deploy:

```bash
wrangler deploy
```

Note the URL it prints, e.g. `https://secure-workspace.<your-subdomain>.workers.dev`.
That's your **worker URL** for the next step.

**Optional — push notifications** (the app works without these):

```bash
npx web-push generate-vapid-keys
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT     # e.g. mailto:you@example.com
```

---

## 2. Build the frontend (static export)

From `Website/focusflow`, build with your worker URL inlined (Next bakes
`NEXT_PUBLIC_*` in at build time):

```bash
# macOS / Linux
NEXT_PUBLIC_WORKER_URL="https://secure-workspace.<your-subdomain>.workers.dev" npm run build
```

```powershell
# Windows PowerShell
$env:NEXT_PUBLIC_WORKER_URL="https://secure-workspace.<your-subdomain>.workers.dev"; npm run build
```

This produces a static site in **`./out`**.

---

## 3. Deploy the frontend (Cloudflare Pages)

```bash
wrangler pages deploy out --project-name focusflow
```

First run creates the project and prints your live URL,
e.g. `https://focusflow.pages.dev`. Done — open it and create your account.

### Alternative: deploy from GitHub (auto-deploy on push)
In the Cloudflare dashboard → **Pages → Create → Connect to Git**, then set:
- **Build command:** `npm run build`
- **Build output directory:** `out`
- **Root directory:** `focusflow`
- **Environment variable:** `NEXT_PUBLIC_WORKER_URL = https://secure-workspace.<your-subdomain>.workers.dev`

---

## 4. (Optional) Hardening & domains

- **Lock CORS:** the worker currently allows any origin (`*`). To restrict it to your
  Pages URL, set the allowed origin in `worker/utils.js` (`buildHeaders`) and redeploy.
- **Custom domain:** add one to the Pages project (Pages → Custom domains) and to the
  Worker (Workers → Triggers → Custom domain). Rebuild the frontend with
  `NEXT_PUBLIC_WORKER_URL` pointing at the worker's custom domain. (~$10/yr for the
  domain; the hosting stays free.)

---

## Local development

```bash
# terminal 1 — worker
cd Website/secure-workspace && wrangler dev --port 8787 --local

# terminal 2 — frontend (config.ts falls back to http://localhost:8787 automatically)
cd Website/focusflow && npm run dev
```

> Tip: don't run `npm run build` while `npm run dev` is running in the same folder —
> they share `.next` and the build will disrupt the dev server.

---

## Re-deploying later

```bash
# worker changes
cd Website/secure-workspace && wrangler deploy

# frontend changes
cd Website/focusflow
NEXT_PUBLIC_WORKER_URL="https://secure-workspace.<your-subdomain>.workers.dev" npm run build
wrangler pages deploy out --project-name focusflow
```
