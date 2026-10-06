export function readPercent(read: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((read / total) * 100));
}

export function formatOpened(ts: number, now = Date.now()): string {
  const opened = new Date(ts);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const that = new Date(opened);
  that.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (days <= 0) return "Opened today";
  if (days === 1) return "Opened yesterday";
  if (days < 7) {
    return `Opened ${opened.toLocaleDateString(undefined, { weekday: "long" })}`;
  }
  return `Opened ${opened.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}

export function titleFromFileName(name: string): string {
  const stripped = name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return stripped || "Untitled gathering";
}

export function cleanMeta(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\0/g, "").trim();
  if (!text || /^untitled$/i.test(text)) return "";
  return text;
}
