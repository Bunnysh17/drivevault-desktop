export function formatBytes(bytes: number, digits = 1): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "—";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  if (seconds < 1) return "almost done";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const STATUS_STYLE: Record<string, { label: string; className: string; dot: string }> = {
  waiting: { label: "Waiting", className: "bg-slate-500/15 text-slate-300 border-slate-400/20", dot: "bg-slate-400" },
  preparing: { label: "Preparing", className: "bg-sky-500/15 text-sky-300 border-sky-400/20", dot: "bg-sky-400" },
  uploading: { label: "Uploading", className: "bg-indigo-500/15 text-indigo-300 border-indigo-400/20", dot: "bg-indigo-400 animate-pulse" },
  paused: { label: "Paused", className: "bg-amber-500/15 text-amber-300 border-amber-400/20", dot: "bg-amber-400" },
  completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20", dot: "bg-emerald-400" },
  failed: { label: "Failed", className: "bg-rose-500/15 text-rose-300 border-rose-400/20", dot: "bg-rose-400" },
  retrying: { label: "Retrying", className: "bg-orange-500/15 text-orange-300 border-orange-400/20", dot: "bg-orange-400 animate-pulse" },
  deleted_locally: { label: "Deleted locally", className: "bg-teal-500/15 text-teal-300 border-teal-400/20", dot: "bg-teal-400" },
  canceled: { label: "Canceled", className: "bg-zinc-500/15 text-zinc-300 border-zinc-400/20", dot: "bg-zinc-400" },
  skipped: { label: "Skipped", className: "bg-zinc-500/15 text-zinc-400 border-zinc-400/20", dot: "bg-zinc-500" },
};

export function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? { label: status, className: "bg-slate-500/15 text-slate-300 border-slate-400/20", dot: "bg-slate-400" };
}

export function fileBaseName(p: string | null | undefined): string {
  if (!p) return "—";
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function folderOf(p: string | null | undefined): string {
  if (!p) return "—";
  const parts = p.split(/[\\/]/);
  return parts.slice(0, -1).join("\\") || p;
}
