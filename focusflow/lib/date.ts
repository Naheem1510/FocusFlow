/** Date helpers — all local-time, ISO `YYYY-MM-DD` day keys. */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Mon-first weekday index (0 = Monday … 6 = Sunday). */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** ISO day keys for the Mon–Sun week containing `ref`. */
export function weekDays(ref = new Date()): string[] {
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - mondayIndex(ref));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toISODate(d);
  });
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  return fromISODate(toISODate(new Date(ts))).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
