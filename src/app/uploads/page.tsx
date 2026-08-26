"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudUpload,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
  XCircle,
  FileVideo,
  FileText,
  File,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Zap,
} from "lucide-react";
import { useAppState } from "@/components/StateProvider";
import { Button, Card, EmptyState, Modal, Progress, SectionTitle, cn, Badge } from "@/components/ui";
import { formatBytes, formatDate, formatEta, formatSpeed, statusStyle } from "@/lib/format";
import type { QueueItemDTO } from "@/lib/types";

const FILTERS = ["active", "waiting", "uploading", "paused", "retrying", "failed", "completed", "all"] as const;

export default function UploadsPage() {
  const { snapshot, post, refresh } = useAppState();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("active");
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const items = useMemo(() => {
    const queue = snapshot?.queue ?? [];
    if (filter === "all") return queue;
    if (filter === "active") return queue.filter((q) => ["waiting", "preparing", "uploading", "paused", "retrying"].includes(q.status));
    return queue.filter((q) => q.status === filter);
  }, [snapshot?.queue, filter]);

  if (!snapshot) return <div className="py-24 text-center text-sm text-white/40">Loading queue…</div>;

  const act = async (action: string, ids?: number[]) => {
    const targetIds = ids ?? selected;
    setSelected([]);
    await post("/api/queue", { action, ids: targetIds });
    void refresh();
  };

  const counts = (snapshot.queue ?? []).reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] ?? 0) + 1;
    return acc;
  }, {});

  const activeCount = (counts.waiting ?? 0) + (counts.uploading ?? 0) + (counts.preparing ?? 0) + (counts.paused ?? 0) + (counts.retrying ?? 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Upload Queue</h1>
          <p className="mt-1 text-sm text-white/50">
            Resumable streaming — interrupted uploads auto-resume from the last confirmed chunk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button size="sm" variant="ghost" onClick={() => void refresh()} icon={<RefreshCw className="h-3.5 w-3.5 text-sky-400" />}>
            Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={() => act("pause-all")} icon={<Pause className="h-3.5 w-3.5" />}>
            Pause All
          </Button>
          <Button size="sm" variant="secondary" onClick={() => act("resume-all")} icon={<Play className="h-3.5 w-3.5" />}>
            Resume All
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act("clear-completed")} icon={<Trash2 className="h-3.5 w-3.5" />}>
            Clear Completed
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setConfirmCancelOpen(true)}
            icon={<XCircle className="h-3.5 w-3.5" />}
          >
            Cancel All
          </Button>
        </div>
      </div>

      {/* Mini Summary Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass-card rounded-2xl p-3.5 border border-white/[0.06] bg-white/[0.02]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Active in Queue</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{activeCount}</p>
        </div>
        <div className="glass-card rounded-2xl p-3.5 border border-white/[0.06] bg-white/[0.02]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300/60">Currently Uploading</p>
          <p className="mt-1 text-2xl font-extrabold text-indigo-300">{(counts.uploading ?? 0) + (counts.preparing ?? 0)}</p>
        </div>
        <div className="glass-card rounded-2xl p-3.5 border border-white/[0.06] bg-white/[0.02]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/60">Completed</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-300">{counts.completed ?? 0}</p>
        </div>
        <div className="glass-card rounded-2xl p-3.5 border border-white/[0.06] bg-white/[0.02]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300/60">Failed / Retrying</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-300">{(counts.failed ?? 0) + (counts.retrying ?? 0)}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n =
            f === "all"
              ? snapshot.queue.length
              : f === "active"
                ? activeCount
                : (counts[f] ?? 0);
          const isSelected = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-xl border px-3.5 py-1.5 text-xs font-semibold capitalize transition-all duration-200",
                isSelected
                  ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100 shadow-[0_0_16px_rgba(99,102,241,0.25)]"
                  : "border-white/8 bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/80"
              )}
            >
              {f} <span className="ml-1 text-white/30 font-mono">({n})</span>
            </button>
          );
        })}
      </div>

      {/* Bulk Selection Actions */}
      {selected.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-3.5 shadow-lg"
        >
          <span className="text-xs font-semibold text-indigo-100">{selected.length} items selected</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => act("pause")} icon={<Pause className="h-3.5 w-3.5" />}>
              Pause
            </Button>
            <Button size="sm" variant="secondary" onClick={() => act("resume")} icon={<Play className="h-3.5 w-3.5" />}>
              Resume
            </Button>
            <Button size="sm" variant="secondary" onClick={() => act("retry")} icon={<RotateCcw className="h-3.5 w-3.5" />}>
              Retry
            </Button>
            <Button size="sm" variant="danger" onClick={() => act("cancel")} icon={<X className="h-3.5 w-3.5" />}>
              Cancel
            </Button>
          </div>
        </motion.div>
      ) : null}

      {/* Queue Table */}
      <Card>
        <SectionTitle
          title="Streaming Queue"
          subtitle={`${items.length} file(s) displayed`}
          right={<CloudUpload className="h-4 w-4 text-white/30" />}
        />
        {items.length === 0 ? (
          <EmptyState
            icon={<CloudUpload className="h-6 w-6 text-white/40" />}
            title="Queue is Empty"
            description="Files appear here automatically the moment they finish writing in your bound folders."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-white/35">
                <tr className="border-b border-white/5">
                  <th className="w-8 py-3">
                    <input
                      type="checkbox"
                      className="accent-indigo-500 rounded"
                      checked={selected.length > 0 && selected.length === items.length}
                      onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])}
                    />
                  </th>
                  <th className="py-3 font-semibold">File Details</th>
                  <th className="py-3 font-semibold">Size</th>
                  <th className="py-3 font-semibold">Watched Origin</th>
                  <th className="py-3 font-semibold">Status</th>
                  <th className="py-3 font-semibold w-48">Progress</th>
                  <th className="py-3 font-semibold">Speed / ETA</th>
                  <th className="py-3 font-semibold">Time</th>
                  <th className="py-3 text-right font-semibold">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((item, i) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    index={i}
                    checked={selected.includes(item.id)}
                    onCheck={(v) => setSelected((s) => (v ? [...s, item.id] : s.filter((x) => x !== item.id)))}
                    onPause={() => act("pause", [item.id])}
                    onResume={() => act("resume", [item.id])}
                    onCancel={() => act("cancel", [item.id])}
                    onRetry={() => act("retry", [item.id])}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Professional Centered Confirmation Modal */}
      <Modal
        open={confirmCancelOpen}
        onClose={() => !isCancelling && setConfirmCancelOpen(false)}
        title="Cancel & Clear Queue"
        description="Stop active uploads and clear queued items"
        footer={
          <div className="flex w-full items-center justify-end gap-2.5">
            <Button
              variant="secondary"
              disabled={isCancelling}
              onClick={() => setConfirmCancelOpen(false)}
            >
              Keep Uploading
            </Button>
            <Button
              variant="danger"
              disabled={isCancelling}
              onClick={async () => {
                setIsCancelling(true);
                await act("cancel-all");
                setIsCancelling(false);
                setConfirmCancelOpen(false);
              }}
              icon={<XCircle className="h-4 w-4" />}
            >
              {isCancelling ? "Cancelling..." : "Yes, Cancel All"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3.5 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-rose-200">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold text-rose-100 text-sm">
                Cancel {activeCount} item(s) from the upload stream?
              </p>
              <p className="mt-1 text-rose-200/80">
                Any active upload sessions will be aborted safely without leaving corrupted partial files in Google Drive.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-xs text-white/70 space-y-2">
            <div className="flex items-center justify-between">
              <span>Local PC Files:</span>
              <span className="font-semibold text-emerald-400">100% Safe (Untouched)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Items in Queue:</span>
              <span className="font-mono text-white/90">{activeCount} file(s)</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function QueueRow({
  item,
  index,
  checked,
  onCheck,
  onPause,
  onResume,
  onCancel,
  onRetry,
}: {
  item: QueueItemDTO;
  index: number;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const st = statusStyle(item.status);
  const isUploading = item.status === "uploading" || item.status === "preparing";

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.015, 0.3) }}
      className="group hover:bg-white/[0.02] transition"
    >
      <td className="py-3">
        <input
          type="checkbox"
          className="accent-indigo-500 rounded"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
        />
      </td>
      <td className="max-w-[260px] py-3">
        <div className="flex items-center gap-2">
          <FileVideo className="h-4 w-4 text-indigo-400 shrink-0" />
          <p className="truncate font-semibold text-white/90">{item.fileName}</p>
        </div>
        {item.errorMessage ? (
          <p className="mt-0.5 truncate text-[11px] text-rose-300/90 font-mono">{item.errorMessage}</p>
        ) : null}
        {item.driveFileId ? (
          <a
            href={`https://drive.google.com/file/d/${item.driveFileId}/view`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:underline"
          >
            <span>View in Drive</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : null}
      </td>
      <td className="py-3 text-white/60 font-mono">{formatBytes(item.fileSize)}</td>
      <td className="max-w-[180px] truncate py-3 text-white/40 font-mono text-[11px]" title={item.sourcePath ?? ""}>
        {item.sourcePath ?? "—"}
      </td>
      <td className="py-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", st.className)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
          {st.label}
          {item.retryCount > 0 ? <span className="text-white/40">· #{item.retryCount}</span> : null}
        </span>
      </td>
      <td className="w-48 py-3">
        <div className="space-y-1">
          <Progress value={item.progress} className="h-2" />
          <div className="flex justify-between text-[10px] text-white/40 font-mono">
            <span>{formatBytes(item.bytesUploaded)}</span>
            <span>{Math.round(item.progress)}%</span>
          </div>
        </div>
      </td>
      <td className="py-3 text-white/60 font-mono text-[11px]">
        {isUploading ? (
          <div className="flex items-center gap-1 text-indigo-300 font-semibold">
            <Zap className="h-3 w-3" />
            <span>{formatSpeed(item.speedBps)} · {formatEta(item.etaSeconds)}</span>
          </div>
        ) : (
          "—"
        )}
      </td>
      <td className="py-3 text-white/40">{formatDate(item.createdAt)}</td>
      <td className="py-3 text-right">
        <div className="inline-flex items-center gap-1">
          {isUploading ? (
            <Button size="sm" variant="ghost" onClick={onPause} icon={<Pause className="h-3.5 w-3.5" />} />
          ) : null}
          {item.status === "paused" ? (
            <Button size="sm" variant="ghost" onClick={onResume} icon={<Play className="h-3.5 w-3.5" />} />
          ) : null}
          {item.status === "failed" ? (
            <Button size="sm" variant="ghost" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" />} />
          ) : null}
          {["waiting", "uploading", "preparing", "paused", "retrying"].includes(item.status) ? (
            <Button size="sm" variant="ghost" onClick={onCancel} icon={<X className="h-3.5 w-3.5 text-rose-300/70" />} />
          ) : null}
        </div>
      </td>
    </motion.tr>
  );
}
