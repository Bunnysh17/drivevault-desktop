"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FolderOpen,
  FolderSearch,
  Gamepad2,
  Layers,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  CheckCircle2,
  Link,
  Zap,
  FolderCheck,
  Eye,
  HardDrive,
  AlertTriangle,
  Pause,
  Play,
  FolderX,
} from "lucide-react";
import { useAppState } from "@/components/StateProvider";
import { Button, Card, Field, Input, Modal, SectionTitle, Switch, ToggleRow, cn, Badge } from "@/components/ui";
import { PCExplorerModal } from "@/components/PCExplorerModal";
import { detectMedalCandidates } from "@/lib/client-api";
import { formatBytes, formatRelative } from "@/lib/format";
import { playSfx } from "@/lib/sound";
import type { FolderDTO } from "@/lib/types";

export default function AutoBackupPage() {
  const { snapshot, post, refresh } = useAppState();
  const [addOpen, setAddOpen] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [label, setLabel] = useState("");
  const [candidates, setCandidates] = useState<{ path: string; fileCount: number }[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<FolderDTO | null>(null);

  // PC File & Folder Inspector Modal State
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [inspectPath, setInspectPath] = useState<string>("");

  // Professional Unbind Modal State
  const [unbindTarget, setUnbindTarget] = useState<FolderDTO | null>(null);
  const [unbindAllOpen, setUnbindAllOpen] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  useEffect(() => {
    void detectMedalCandidates().then((r) => setCandidates(r.detected));
  }, []);

  if (!snapshot) return <div className="py-24 text-center text-sm text-white/40">Loading folders…</div>;
  const folders = snapshot.folders;
  const isPaused = Boolean(snapshot.engine.paused);

  const notify = (text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const addFolder = async (path: string, isMedal = false) => {
    playSfx("click");
    const res = await post("/api/folders", { path, label: label || undefined, isMedalPreset: isMedal });
    if (!res.ok) {
      playSfx("delete");
      notify(res.error ?? "Could not add folder.", false);
      return;
    }
    playSfx("success");
    notify(`Successfully bound & watching: ${path}`);
    setAddOpen(false);
    setNewPath("");
    setLabel("");
    void refresh();
  };

  const testFolder = async (folder: FolderDTO) => {
    playSfx("ping");
    setBusy(folder.id);
    const res = await post<{ ok: boolean; message: string; fileCount: number }>("/api/folders", {
      id: folder.id,
      action: "test",
    });
    setBusy(null);
    playSfx(res.data?.ok ? "success" : "delete");
    notify(res.data?.message ?? res.error ?? "Test completed.", Boolean(res.data?.ok));
  };

  const uploadExisting = async (folder: FolderDTO) => {
    playSfx("click");
    setBusy(folder.id);
    const res = await post<{ message: string }>("/api/folders", { id: folder.id, action: "scan" });
    setBusy(null);
    notify(res.data?.message ?? res.error ?? "Scanning folder for files & starting backup…");
    void refresh();
  };

  const syncAllFolders = async () => {
    playSfx("click");
    notify("Scanning and starting backup for all watched folders…");
    for (const folder of folders) {
      await post("/api/folders", { id: folder.id, action: "scan" });
    }
    void refresh();
  };

  const toggleEnginePause = async () => {
    playSfx("tab");
    if (isPaused) {
      await post("/api/queue", { action: "resume-all" });
      notify("Backup resumed for all folders.");
    } else {
      await post("/api/queue", { action: "pause-all" });
      notify("Backup paused.");
    }
    void refresh();
  };

  const confirmUnbind = async () => {
    if (!unbindTarget) return;
    playSfx("delete");
    setUnbinding(true);
    const res = await post(`/api/folders?id=${unbindTarget.id}`, undefined, "DELETE");
    setUnbinding(false);
    notify(res.ok ? `Unbound ${unbindTarget.path}` : res.error ?? "Could not remove folder.", res.ok);
    setUnbindTarget(null);
    void refresh();
  };

  const confirmUnbindAll = async () => {
    playSfx("delete");
    setUnbinding(true);
    const res = await post("/api/folders?all=1", undefined, "DELETE");
    setUnbinding(false);
    setUnbindAllOpen(false);
    notify(res.ok ? "All folders have been unbound." : res.error ?? "Could not unbind all folders.", res.ok);
    void refresh();
  };

  const patchFolder = async (folder: FolderDTO, changes: Record<string, unknown>) => {
    playSfx("tab");
    await post("/api/folders", { id: folder.id, action: "update", changes }, "PATCH");
    void refresh();
  };

  const openInspector = (path: string) => {
    playSfx("click");
    setInspectPath(path);
    setExplorerOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Auto Backup & Folder Binding</h1>
          <p className="mt-1 text-sm text-white/50">
            DriveVault hooks directly into the Windows filesystem event pipeline. New files are detected instantly without high CPU usage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {folders.length > 0 && (
            <>
              <Button
                variant="success"
                onClick={syncAllFolders}
                icon={<Zap className="h-4 w-4 text-emerald-300" />}
              >
                Start Backup (Sync All)
              </Button>
              <Button
                variant="secondary"
                onClick={toggleEnginePause}
                icon={isPaused ? <Play className="h-4 w-4 text-emerald-300" /> : <Pause className="h-4 w-4 text-amber-300" />}
              >
                {isPaused ? "Resume Backup" : "Pause Backup"}
              </Button>
              <Button
                variant="danger"
                onClick={() => setUnbindAllOpen(true)}
                icon={<FolderX className="h-4 w-4" />}
              >
                Unbind All
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            onClick={() => openInspector("C:\\Users\\naveen\\Videos\\Medal")}
            icon={<HardDrive className="h-4 w-4 text-cyan-300" />}
            className="border-cyan-500/30 bg-cyan-950/20 text-cyan-200 hover:bg-cyan-900/30"
          >
            Inspect PC Files
          </Button>
          <Button variant="primary" onClick={() => setAddOpen(true)} icon={<Plus className="h-4 w-4" />}>
            Bind New Folder
          </Button>
        </div>
      </div>

      {/* Medal Recording Preset Detection */}
      <Card delay={0.02}>
        <SectionTitle
          title="Medal & Clip Folders Auto-Detection"
          subtitle="One-click inspection & binding for gaming clip libraries"
          right={<Video className="h-4 w-4 text-indigo-400" />}
        />
        {candidates.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] px-5 py-6 text-xs text-white/45">
            No default Medal clip directories found in common locations. Click <strong className="text-white">&quot;Bind New Folder&quot;</strong> or <strong className="text-white">&quot;Browse & Inspect PC Files&quot;</strong> to choose your gaming folder.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {candidates.map((c) => (
              <div
                key={c.path}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-indigo-400/30 hover:bg-white/[0.05]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-indigo-400 shrink-0" />
                    <p className="truncate text-xs font-semibold text-white/90">{c.path}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-white/40">{c.fileCount} existing recording(s) found</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openInspector(c.path)}
                    icon={<Eye className="h-3.5 w-3.5 text-cyan-300" />}
                    className="text-xs text-cyan-200 hover:bg-cyan-500/10"
                  >
                    View Files
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => addFolder(c.path, true)}
                    icon={<FolderCheck className="h-3.5 w-3.5 text-indigo-300" />}
                  >
                    Bind Folder
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 text-xs leading-relaxed text-emerald-100 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-200">Writing Stability Guarantee:</span> DriveVault monitors file size writes continuously and waits until clip recording stops before beginning the upload stream, ensuring no incomplete video files are ever sent.
          </div>
        </div>
      </Card>

      {/* Bound Folders List */}
      {folders.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-white/40 shadow-inner">
              <FolderSearch className="h-8 w-8" />
            </div>
            <p className="text-base font-semibold text-white/80">No Folders Bound Yet</p>
            <p className="max-w-md text-xs leading-relaxed text-white/45">
              Bind any folder containing your clips, screenshots, or work files. DriveVault will watch it 24/7 in the background.
            </p>
            <div className="flex gap-2.5 mt-2">
              <Button variant="secondary" onClick={() => openInspector("")} icon={<HardDrive className="h-4 w-4 text-cyan-300" />}>
                Browse PC Files
              </Button>
              <Button variant="primary" onClick={() => setAddOpen(true)} icon={<Plus className="h-4 w-4" />}>
                Bind Folder Now
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {folders.map((folder, i) => (
              <motion.div
                key={folder.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className={cn(!folder.exists && "ring-1 ring-amber-400/20")}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-400">
                          <FolderOpen className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white/95">{folder.label || folder.path}</p>
                            {folder.enabled && folder.autoUpload ? (
                              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-semibold">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Live Watching
                              </span>
                            ) : (
                              <span className="rounded-full bg-white/10 text-white/50 border border-white/10 px-2 py-0.5 text-[10px]">
                                Paused
                              </span>
                            )}
                            {folder.isMedalPreset ? (
                              <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                                Medal Preset
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 break-all font-mono text-[11px] text-white/45">{folder.path}</p>
                        </div>
                      </div>
                      <p className="mt-2.5 text-xs text-white/40 flex items-center gap-2">
                        <span><strong>{folder.fileCount}</strong> matching file(s)</span>
                        <span>•</span>
                        <span>Last scan: {formatRelative(folder.lastScanAt)}</span>
                        <span>•</span>
                        <span>Stability delay: {Math.round(folder.stabilityWaitMs / 1000)}s</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openInspector(folder.path)}
                        icon={<Eye className="h-3.5 w-3.5 text-cyan-300" />}
                        className="bg-cyan-500/10 border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/20"
                      >
                        Inspect Files
                      </Button>
                      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-1.5">
                        <span className="text-xs text-white/60">Auto-Upload</span>
                        <Switch
                          checked={folder.enabled && folder.autoUpload}
                          onChange={(v) => patchFolder(folder, { enabled: v, autoUpload: v })}
                          label="Auto upload"
                        />
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => testFolder(folder)} disabled={busy === folder.id} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                        Test
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(folder)} icon={<Layers className="h-3.5 w-3.5" />}>
                        Rules
                      </Button>
                      <Button size="sm" variant="success" onClick={() => uploadExisting(folder)} icon={<PlayCircle className="h-3.5 w-3.5" />}>
                        Start Backup
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setUnbindTarget(folder)} icon={<Trash2 className="h-3.5 w-3.5" />}>
                        Unbind
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2.5 sm:grid-cols-3 pt-3 border-t border-white/[0.06]">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">File Types</p>
                      <p className="mt-0.5 truncate text-xs text-white/80 font-mono">
                        {!folder.allowedExtensions || folder.allowedExtensions === "*" || folder.allowedExtensions.includes("*")
                          ? "* (All files: .txt, .pdf, .docx, .png, .mp4, etc.)"
                          : folder.allowedExtensions}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Min Size Filter</p>
                      <p className="mt-0.5 text-xs text-white/80">
                        {folder.minFileSize > 0 ? formatBytes(folder.minFileSize) : "No minimum (all KBs)"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Post-Upload Cleanup</p>
                      <p className={cn("mt-0.5 text-xs font-semibold", folder.deleteAfterUpload ? "text-amber-200" : "text-emerald-200")}>
                        {folder.deleteAfterUpload ? "ON (Verified files only)" : "OFF (Keep local copy)"}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Folder Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Bind a Local Folder"
        description="DriveVault only monitors the paths you specify."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => addFolder(newPath)} disabled={!newPath.trim()}>
              Bind Folder
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Choose from PC:</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAddOpen(false);
                openInspector("");
              }}
              icon={<HardDrive className="h-3.5 w-3.5 text-cyan-300" />}
              className="text-xs"
            >
              Browse PC Drives & Folders
            </Button>
          </div>

          <Field label="Folder Full Path" hint="E.g. C:\Users\Username\Videos\Medal">
            <Input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="C:\Users\Username\Videos\Medal"
              autoFocus
            />
          </Field>
          <Field label="Folder Display Label (Optional)">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="E.g. Medal Valorant Clips" />
          </Field>
          {candidates.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Suggested on this PC</p>
              <div className="space-y-1.5">
                {candidates.map((c) => (
                  <button
                    key={c.path}
                    onClick={() => setNewPath(c.path)}
                    className="w-full truncate rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-xs text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    {c.path}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Per-Folder Settings Modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Rules for ${editing.label || editing.path}` : "Folder Rules"}
        description="Configuration applies to this specific bound folder only."
        footer={
          <Button variant="primary" onClick={() => setEditing(null)}>
            Done
          </Button>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <ToggleRow
              title="Auto-Upload"
              description="Automatically queue new files when they finish writing."
              checked={editing.autoUpload}
              onChange={(v) => {
                setEditing({ ...editing, autoUpload: v });
                void patchFolder(editing, { autoUpload: v });
              }}
            />
            <ToggleRow
              title="Delete Local File After Verified Upload"
              description="Safely removes local file after confirming Drive hash."
              checked={editing.deleteAfterUpload}
              onChange={(v) => {
                setEditing({ ...editing, deleteAfterUpload: v });
                void patchFolder(editing, { deleteAfterUpload: v });
              }}
            />
            <ToggleRow
              title="Preserve Folder Structure"
              description="Replicate subfolders inside the Google Drive folder."
              checked={editing.preserveStructure}
              onChange={(v) => {
                setEditing({ ...editing, preserveStructure: v });
                void patchFolder(editing, { preserveStructure: v });
              }}
            />
            <ToggleRow
              title="Include Subfolders Recursively"
              description="Watch all nested sub-directories."
              checked={editing.recursive}
              onChange={(v) => {
                setEditing({ ...editing, recursive: v });
                void patchFolder(editing, { recursive: v });
              }}
            />
            <Field label="Allowed Extensions" hint="* = All file types (.txt, .pdf, .docx, .png, .mp4, etc.)">
              <Input
                placeholder="* (All file types)"
                defaultValue={editing.allowedExtensions || "*"}
                onBlur={(e) => void patchFolder(editing, { allowedExtensions: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min Size (MB)" hint="0 = Any size (even small KBs)">
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  defaultValue={editing.minFileSize ? (editing.minFileSize / 1048576).toFixed(1) : 0}
                  onBlur={(e) => void patchFolder(editing, { minFileSizeMb: Number(e.target.value) })}
                />
              </Field>
              <Field label="Stability Wait (ms)">
                <Input
                  type="number"
                  min={500}
                  step={500}
                  defaultValue={editing.stabilityWaitMs}
                  onBlur={(e) => void patchFolder(editing, { stabilityWaitMs: Number(e.target.value) })}
                />
              </Field>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Professional Unbind Confirmation Modal */}
      <Modal
        open={Boolean(unbindTarget)}
        onClose={() => setUnbindTarget(null)}
        title="Unbind & Stop Watching Folder?"
        description="DriveVault will disconnect from this folder's file events."
        footer={
          <>
            <Button variant="ghost" onClick={() => setUnbindTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmUnbind}
              disabled={unbinding}
              icon={<Trash2 className="h-4 w-4" />}
            >
              {unbinding ? "Unbinding..." : "Yes, Unbind Folder"}
            </Button>
          </>
        }
      >
        {unbindTarget && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] p-4 text-xs text-rose-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-rose-300">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>Stop Watching This Directory</span>
              </div>
              <p className="leading-relaxed text-rose-200/80">
                DriveVault will immediately detach Windows filesystem event hooks. Any new recordings or files added to this folder will no longer be auto-synced to Google Drive.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Folder Details</p>
              <p className="font-mono text-xs text-white break-all">{unbindTarget.path}</p>
              <div className="flex items-center gap-3 pt-1 text-xs text-white/50">
                <span><strong>{unbindTarget.fileCount}</strong> file(s) tracked</span>
                <span>•</span>
                <span>Label: {unbindTarget.label || "(None)"}</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-xs text-emerald-300 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Your local PC files will NOT be deleted.</strong> Only the folder watcher configuration is removed.
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Unbind All Folders Modal */}
      <Modal
        open={unbindAllOpen}
        onClose={() => setUnbindAllOpen(false)}
        title="Unbind All Watched Folders"
        description="Are you sure you want to remove all monitored folder bindings?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUnbindAllOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmUnbindAll}
              disabled={unbinding}
              icon={<Trash2 className="h-4 w-4" />}
            >
              {unbinding ? "Unbinding All..." : "Yes, Unbind All Folders"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] p-4 text-xs text-rose-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-rose-300">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>Stop Watching All {folders.length} Folders</span>
            </div>
            <p className="leading-relaxed text-rose-200/80">
              DriveVault will stop monitoring all configured folders. Future files added to these folders will not be automatically uploaded.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-xs text-emerald-300 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Your local files on your PC will NOT be deleted.</strong> Only the folder links in DriveVault are cleared.
            </span>
          </div>
        </div>
      </Modal>

      {/* PC File & Folder Inspector Modal */}
      <PCExplorerModal
        open={explorerOpen}
        onClose={() => setExplorerOpen(false)}
        initialPath={inspectPath}
        onBoundSuccess={() => void refresh()}
      />

      {/* Floating Notification Toast */}
      {toast ? (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-2xl border px-5 py-3 text-xs shadow-2xl backdrop-blur-xl font-medium",
            toast.ok ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-100" : "border-rose-400/30 bg-rose-500/20 text-rose-100",
          )}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
