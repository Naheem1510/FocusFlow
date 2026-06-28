/**
 * config.ts — Resolves the Cloudflare Worker base URL for the Vault backend
 * (the secure-workspace project). Configure via NEXT_PUBLIC_WORKER_URL; falls
 * back to the wrangler dev default on localhost.
 */

export function getWorkerHttpUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WORKER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8787"; // wrangler dev default
    }
  }
  return "https://secure-workspace.your-worker.workers.dev";
}

export function getWorkerWsUrl(): string {
  return getWorkerHttpUrl()
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
}
