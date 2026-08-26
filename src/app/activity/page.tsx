"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, ChevronLeft, ChevronRight, Download, Search, FileText, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Button, Card, Input, SectionTitle, cn, Badge } from "@/components/ui";
import { fetchLogsPage } from "@/lib/client-api";
import { formatDate } from "@/lib/format";

type Row = Awaited<ReturnType<typeof fetchLogsPage>>["items"][number];
const PAGE_SIZE = 40;

export default function ActivityPage() {
  const [kind, setKind] = useState<"activity" | "uploaded">("activity");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLogsPage(kind, page, PAGE_SIZE);
      setRows(res.items);
      setTotal(res.total);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kind, page]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = query
    ? rows.filter((r) =>
        JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
      )
    : rows;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">System Activity & Audit Log</h1>
          <p className="mt-1 text-sm text-white/50">Comprehensive audit trail of file syncs, verifications, and disk safety operations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <Input
              className="pl-9 w-64"
              placeholder="Filter by file, status, error code…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={() => {
              window.location.href = "/api/logs?export=1";
            }}
          >
            Export JSON Logs
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["activity", "uploaded"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
            className={cn(
              "rounded-xl border px-4 py-2 text-xs font-semibold capitalize transition-all duration-200",
              kind === k
                ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100 shadow-[0_0_16px_rgba(99,102,241,0.2)]"
                : "border-white/8 bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/80",
            )}
          >
            {k === "activity" ? "System Event Log" : "Completed File Uploads"}
          </button>
        ))}
      </div>

      <Card>
        <SectionTitle
          title={kind === "activity" ? "Live Event Trail" : "Completed Cloud Backups"}
          subtitle={`${total} event record(s) · Page ${page} of ${pages}`}
          right={<Activity className="h-4 w-4 text-white/30" />}
        />
        {loading && rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-white/40">Loading activity…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-white/40">No records found.</div>
        ) : (
          <div className="max-h-[620px] overflow-y-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="sticky top-0 bg-[#090d16]/95 text-[10px] uppercase tracking-wider text-white/35 backdrop-blur z-10">
                <tr className="border-b border-white/5">
                  <th className="py-3 font-semibold">Timestamp</th>
                  {kind === "activity" ? <th className="py-3 font-semibold">Event Type</th> : null}
                  <th className="py-3 font-semibold">Target File</th>
                  <th className="py-3 font-semibold">Status</th>
                  <th className="py-3 font-semibold">Code</th>
                  <th className="py-3 font-semibold">Message / Cloud Path</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((row, i) => (
                  <motion.tr
                    key={row.id ?? i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.008, 0.25) }}
                    className="hover:bg-white/[0.02] transition"
                  >
                    <td className="whitespace-nowrap py-3 text-white/45 font-mono text-[11px]">
                      {formatDate(row.ts ?? row.uploadedAt)}
                    </td>
                    {kind === "activity" ? (
                      <td className="py-3 font-semibold text-white/75">{row.eventType}</td>
                    ) : null}
                    <td className="max-w-[260px] truncate py-3 text-white/90 font-medium" title={row.filePath ?? row.localPath ?? ""}>
                      {row.fileName ?? (row.filePath ? row.filePath.split(/[\\/]/).pop() : "—")}
                    </td>
                    <td className="py-3">
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", statusTone(row.status, row.verifiedAt, row.deletedLocallyAt))}>
                        {row.status ?? (row.deletedLocallyAt ? "deleted_locally" : row.verifiedAt ? "verified" : "uploaded")}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[10px] text-white/40">{row.errorCode ?? "—"}</td>
                    <td className="max-w-[420px] truncate py-3 text-white/60 text-xs" title={row.message ?? row.drivePath ?? ""}>
                      {row.message ?? row.drivePath ?? "—"}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} icon={<ChevronLeft className="h-3.5 w-3.5" />}>
            Previous
          </Button>
          <span className="text-xs font-mono text-white/40">
            Page {page} of {pages}
          </span>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function statusTone(status?: string | null, verifiedAt?: string | null, deletedLocallyAt?: string | null) {
  if (deletedLocallyAt) return "border-teal-400/30 bg-teal-500/15 text-teal-200";
  if (verifiedAt) return "border-emerald-400/30 bg-emerald-500/15 text-emerald-200";
  if (!status) return "border-white/10 bg-white/5 text-white/50";
  if (status === "failed" || status === "error") return "border-rose-400/30 bg-rose-500/15 text-rose-200";
  if (status === "retrying" || status === "warning" || status === "paused") return "border-amber-400/30 bg-amber-500/15 text-amber-200";
  if (status === "completed" || status === "connected" || status === "deleted_locally") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-200";
  return "border-white/10 bg-white/5 text-white/60";
}
