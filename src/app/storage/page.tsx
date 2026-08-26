"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, HardDrive, ShieldCheck, Sparkles, Trash2, CheckCircle2, Shield, Lock, FileCheck, Info } from "lucide-react";
import { useAppState } from "@/components/StateProvider";
import { Button, Card, Field, Input, Modal, Progress, RingGauge, SectionTitle, Switch, cn, Badge } from "@/components/ui";
import { fetchCleanup, fetchProtected } from "@/lib/client-api";
import { formatBytes, formatDate } from "@/lib/format";
import { playSfx } from "@/lib/sound";

type Candidate = Awaited<ReturnType<typeof fetchCleanup>>["candidates"][number];

export default function StoragePage() {
  const { snapshot, post, updateSettings } = useAppState();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchCleanup>> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [protOpen, setProtOpen] = useState(false);
  const [protPath, setProtPath] = useState("");
  const [protectedItems, setProtectedItems] = useState<Awaited<ReturnType<typeof fetchProtected>>["items"]>([]);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const [cleanup, prot] = await Promise.all([
      fetchCleanup().catch(() => null),
      fetchProtected().catch(() => ({ items: [] })),
    ]);
    setData(cleanup);
    setProtectedItems(prot.items);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 12000);
    return () => clearInterval(id);
  }, [load]);

  if (!snapshot) return <div className="py-24 text-center text-sm text-white/40">Loading storage info…</div>;

  const local = snapshot.local;
  const candidates = data?.candidates ?? [];
  const safeCandidates = candidates.filter((c) => c.safe);
  const selectedCandidates = candidates.filter((c) => selected.includes(c.localPath));
  const selectedBytes = selectedCandidates.reduce((a, c) => a + c.fileSize, 0);

  const doDelete = async () => {
    playSfx("delete");
    setWorking(true);
    const res = await post<{ deleted: number; freedBytes: number; skipped?: string[] }>("/api/cleanup", {
      all: confirmAll,
      paths: confirmAll ? undefined : selected,
      confirm: true,
    });
    setWorking(false);
    setConfirmOpen(false);
    setSelected([]);
    if (res.ok) playSfx("success");
    await load();
    if (!res.ok) alert(res.error);
    else if ((res.data?.skipped?.length ?? 0) > 0) alert(`Skipped:\n${res.data?.skipped?.join("\n")}`);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Storage & Safe Space Reclaim</h1>
        <p className="mt-1 text-sm text-white/50">
          Free disk space on your PC with zero risk — only files 100% verified in Google Drive are ever eligible for cleanup.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Local Storage Ring Card */}
        <Card delay={0.02} className="lg:col-span-2 p-6">
          <SectionTitle title="Workstation Disk Overview" subtitle="Live PC storage partition analysis" right={<HardDrive className="h-4 w-4 text-white/30" />} />
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <RingGauge value={local.usedPercent} size={92} strokeWidth={7}>
                <div className="text-center">
                  <span className="text-lg font-extrabold text-white">{local.usedPercent}%</span>
                  <p className="text-[9px] uppercase tracking-wider text-white/40">Used</p>
                </div>
              </RingGauge>
              <div>
                <p className="text-3xl font-extrabold tracking-tight text-white">{formatBytes(local.freeBytes)} Free</p>
                <p className="mt-1 text-xs text-white/45">
                  Total partition capacity: <strong className="text-white/70">{formatBytes(local.totalBytes)}</strong> ({formatBytes(local.usedBytes)} currently used)
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-right">
              <p className="text-2xl font-extrabold text-emerald-300">{formatBytes(data?.safeBytes ?? 0)}</p>
              <p className="mt-0.5 text-xs text-emerald-200/70 font-medium">Verified Reclaimable Space</p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-white/[0.06]">
            <Progress value={local.usedPercent} className="h-2.5" />
            <div className="mt-2 flex justify-between text-[11px] text-white/40">
              <span>Warning threshold: {snapshot.settings.storageThresholdPercent}%</span>
              <span>{local.usedPercent}% occupied</span>
            </div>
          </div>
        </Card>

        {/* Safety Switches */}
        <Card delay={0.06} className="p-6 flex flex-col justify-between">
          <SectionTitle title="Zero-Risk Safety Locks" right={<Shield className="h-4 w-4 text-emerald-400" />} />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/90">Never Delete Automatically</p>
                <p className="text-[11px] text-white/40 leading-relaxed">Master lock: prevents all background file deletions.</p>
              </div>
              <Switch
                checked={snapshot.settings.neverDeleteAutomatically}
                onChange={(v) => void updateSettings({ neverDeleteAutomatically: v })}
                label="Never delete automatically"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/90">Delete After Upload</p>
                <p className="text-[11px] text-white/40 leading-relaxed">Only kicks in after cloud verification.</p>
              </div>
              <Switch checked={snapshot.settings.deleteAfterUpload} onChange={(v) => void updateSettings({ deleteAfterUpload: v })} label="Delete after upload" />
            </div>
          </div>
          <p className="mt-3 text-[10px] text-white/35 flex items-center gap-1.5">
            <Info className="h-3 w-3" /> DriveVault never deletes files when only partial uploads finish.
          </p>
        </Card>
      </div>

      {/* Backed-up Files Table */}
      <Card delay={0.1}>
        <SectionTitle
          title="Locally Backed-Up Recordings"
          subtitle={`${candidates.length} verified upload(s) on this device · ${safeCandidates.length} safe to purge`}
          right={
            <div className="flex flex-wrap gap-2.5">
              <Button size="sm" variant="secondary" onClick={() => setProtOpen(true)} icon={<Lock className="h-3.5 w-3.5" />}>
                Protected Files ({protectedItems.length})
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={safeCandidates.length === 0 || snapshot.settings.neverDeleteAutomatically}
                onClick={() => {
                  setConfirmAll(true);
                  setConfirmOpen(true);
                }}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Purge All Safe Files ({formatBytes(data?.safeBytes ?? 0)})
              </Button>
            </div>
          }
        />

        {snapshot.settings.neverDeleteAutomatically ? (
          <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-indigo-400/25 bg-indigo-500/10 p-3.5 text-xs text-indigo-100 shadow-sm">
            <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-300" />
            <span><strong>Safety Lock Active:</strong> &quot;Never delete automatically&quot; is turned ON. To free space, select files manually below or disable the safety toggle.</span>
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/15 p-4">
            <span className="text-xs font-semibold text-rose-100">
              {selected.length} file(s) selected ({formatBytes(selectedBytes)} will be freed)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setConfirmAll(false);
                  setConfirmOpen(true);
                }}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Delete Selected Copies
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear Selection
              </Button>
            </div>
          </div>
        ) : null}

        {candidates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-white/30">
              <FileCheck className="h-8 w-8" />
            </div>
            <p className="text-base font-semibold text-white/80">No Files Eligible for Deletion</p>
            <p className="max-w-md text-xs text-white/45">
              As files upload to Google Drive and pass SHA-256 integrity verification, they will appear here so you can free local disk space with complete confidence.
            </p>
          </div>
        ) : (
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="sticky top-0 bg-[#090d16]/95 text-[10px] uppercase tracking-wider text-white/35 backdrop-blur z-10">
                <tr className="border-b border-white/5">
                  <th className="w-8 py-3" />
                  <th className="py-3 font-semibold">File Name & Local Path</th>
                  <th className="py-3 font-semibold">Size</th>
                  <th className="py-3 font-semibold">Uploaded On</th>
                  <th className="py-3 font-semibold">Drive Status</th>
                  <th className="py-3 font-semibold">Safety Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {candidates.map((c, i) => (
                  <CandidateRow
                    key={c.localPath}
                    c={c}
                    index={i}
                    checked={selected.includes(c.localPath)}
                    onCheck={(v) => setSelected((s) => (v ? [...s, c.localPath] : s.filter((p) => p !== c.localPath)))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Confirmation Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmAll ? "Confirm Bulk Disk Cleanup" : `Delete ${selected.length} Local File(s)?`}
        description="Original recordings remain safely stored in Google Drive. Only local copies on this PC will be removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete} disabled={working}>
              {working ? "Purging Files…" : `Reclaim ${confirmAll ? formatBytes(data?.safeBytes ?? 0) : formatBytes(selectedBytes)}`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {confirmAll ? (
            <p className="text-xs text-white/70 leading-relaxed">
              <strong>{safeCandidates.length}</strong> verified files ({formatBytes(data?.safeBytes ?? 0)}) will be deleted locally from your computer. You can still view or download them from Google Drive anytime.
            </p>
          ) : (
            <div className="max-h-52 space-y-1.5 overflow-y-auto">
              {selectedCandidates.map((c) => (
                <div key={c.localPath} className="flex items-center justify-between rounded-xl bg-white/[0.03] p-2.5 text-xs">
                  <span className="truncate text-white/80 font-medium">{c.fileName}</span>
                  <span className="ml-3 shrink-0 text-white/40 font-mono">{formatBytes(c.fileSize)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Protected Files Modal */}
      <Modal
        open={protOpen}
        onClose={() => setProtOpen(false)}
        title="Protected Paths & Files"
        description="DriveVault will NEVER delete protected items, even after successful cloud verification."
        footer={
          <Button variant="primary" onClick={() => setProtOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="C:\Users\Username\Videos\Medal\important_clip.mp4"
              value={protPath}
              onChange={(e) => setProtPath(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!protPath.trim()}
              onClick={async () => {
                await post("/api/protected", { path: protPath.trim(), kind: "file" });
                setProtPath("");
                await load();
              }}
            >
              Protect
            </Button>
          </div>
          {protectedItems.length === 0 ? (
            <p className="text-xs text-white/40 py-4 text-center">No protected paths added yet.</p>
          ) : (
            <div className="space-y-2">
              {protectedItems.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <span className="truncate text-xs text-white/80 font-mono">{p.path}</span>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    await post(`/api/protected?id=${p.id}`, undefined, "DELETE");
                    await load();
                  }}>
                    Unprotect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function CandidateRow({
  c,
  index,
  checked,
  onCheck,
}: {
  c: Candidate;
  index: number;
  checked: boolean;
  onCheck: (v: boolean) => void;
}) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.01, 0.3) }}
      className="hover:bg-white/[0.02] transition"
    >
      <td className="py-3">
        <input
          type="checkbox"
          className="accent-rose-500 rounded"
          disabled={!c.safe}
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
        />
      </td>
      <td className="max-w-[280px] py-3">
        <p className="truncate font-semibold text-white/90">{c.fileName}</p>
        <p className="truncate font-mono text-[10px] text-white/35">{c.localPath}</p>
      </td>
      <td className="py-3 text-white/60 font-mono">{formatBytes(c.fileSize)}</td>
      <td className="py-3 text-white/45">{formatDate(c.uploadedAt)}</td>
      <td className="py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            c.verified ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" : "border-amber-400/30 bg-amber-500/15 text-amber-200",
          )}
        >
          {c.verified ? "Verified in Drive" : "Pending Verification"}
        </span>
      </td>
      <td className="max-w-[240px] py-3">
        <span className={cn("text-xs font-medium", c.safe ? "text-emerald-300/80" : "text-amber-200/90")}>
          {c.reason}
        </span>
      </td>
    </motion.tr>
  );
}
