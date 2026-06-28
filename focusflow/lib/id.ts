/** Short unique id for client-side records. */
export function uid(prefix = ""): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
