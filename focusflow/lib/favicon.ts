// Theme-matched favicons, generated as inline SVG (no binary assets).
//
// The mark mirrors the in-app FocusFlow logo: a rounded tile with a bold "F",
// tinted with the site's own accent tokens. Two states:
//   • idle  — terracotta "F" on warm charcoal  (the Surface theme)
//   • alert — teal "F" on deep obsidian + a terracotta badge (the Vault theme)
// Swapping idle→alert when a Vault message arrives is on-theme *and* stays
// camouflaged: it just looks like the brand shifting shade, never "new message".

interface IconSpec {
  bg: string;
  accent: string;
  /** Optional notification badge colour (top-right). */
  dot?: string;
}

function buildIcon({ bg, accent, dot }: IconSpec): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="2" y="2" width="28" height="28" rx="7.5" fill="${bg}"/>
  <rect x="2" y="2" width="28" height="28" rx="7.5" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.5"/>
  <g fill="${accent}">
    <rect x="11" y="8" width="3.6" height="16" rx="1.1"/>
    <rect x="11" y="8" width="11" height="3.6" rx="1.1"/>
    <rect x="11" y="14.6" width="8" height="3.2" rx="1.1"/>
  </g>
  ${dot ? `<circle cx="24.5" cy="7.5" r="4.6" fill="${dot}" stroke="${bg}" stroke-width="1.6"/>` : ""}
</svg>`;
}

const toDataUri = (svg: string) =>
  `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;

// Accent values mirror the tokens in tailwind.config.ts / globals.css.
export const FAVICON_IDLE = toDataUri(
  buildIcon({ bg: "#1e1b18", accent: "#c4654a" }),
);
export const FAVICON_ALERT = toDataUri(
  buildIcon({ bg: "#141210", accent: "#38bec9", dot: "#c4654a" }),
);

/** Point the document's favicon link at the given href (creates it if absent). */
export function setFavicon(href: string): void {
  if (typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = href;
}
