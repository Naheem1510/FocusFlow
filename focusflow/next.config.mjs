/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Export a fully static site (./out) — the app is client-only (no API routes,
  // no server rendering; the backend is the separate Cloudflare Worker), so it
  // hosts for free on Cloudflare Pages / any static CDN.
  output: "export",
  // Required for `output: export` since there's no Next image optimization server.
  images: { unoptimized: true },
  // Emit /path/index.html so static hosts serve clean URLs.
  trailingSlash: true,
};

export default nextConfig;
