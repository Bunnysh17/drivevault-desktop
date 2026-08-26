"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Database,
  HardDrive,
  Layers,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  Zap,
  ArrowUpRight,
  FolderSync,
  FolderOpen,
  Eye,
  RefreshCw,
  Sliders,
  Cpu,
  Radio,
  FileVideo,
  FileImage,
  FileText,
} from "lucide-react";
import { useAppState } from "@/components/StateProvider";
import { Button, Card, EmptyState, Progress, RingGauge, SectionTitle, Stat, cn, Badge, AnimatedCounter } from "@/components/ui";
import { formatBytes, formatDate, formatEta, formatSpeed, statusStyle } from "@/lib/format";

import { StorageInsightsCard } from "@/components/StorageInsightsCard";
import { playSfx } from "@/lib/sound";

export default function DashboardPage() {
  const { snapshot, loading, post, refresh } = useAppState();

  if (loading && !snapshot) {
    return (
      <div className="flex h-[65vh] flex-col items-center justify-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-indigo-500/25" />
          <div className="absolute inset-0 rounded-full border border-indigo-400/40 blur-sm" />
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent shadow-[0_0_20px_rgba(99,102,241,0.6)]" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-white/70">Connecting to DriveVault AI Engine…</p>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <EmptyState
        title="DriveVault Service Unavailable"
        description="The desktop backup daemon could not be reached. Restart DriveVault and try again."
      />
    );
  }

  const s = snapshot;
  const localUsedPct = s.local.usedPercent;
  const driveUsedPct = s.drive.limitBytes > 0 ? Math.round((s.drive.usageBytes / s.drive.limitBytes) * 100) : 0;
  const driveUsedPctExact = s.drive.limitBytes > 0 ? (s.drive.usageBytes / s.drive.limitBytes) * 100 : 0;
  const active = s.currentUpload;
  const isUploading = active?.status === "uploading" || active?.status === "preparing";

  return (
    <div className="mx-auto max-w-[1450px] space-y-6">
      {/* ═══════════════════════════════════════════
          1. HOLOGRAPHIC COMMAND HERO
          ═══════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card relative overflow-hidden rounded-3xl p-7 sm:p-9 shadow-2xl border border-white/[0.12]"
      >
        {/* Iridescent background auras */}
        <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-indigo-500/25 blur-3xl animate-pulse" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 right-1/3 h-60 w-60 rounded-full bg-purple-500/15 blur-2xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-3.5 py-1 text-[11px] font-bold tracking-wider uppercase text-indigo-300 shadow-inner">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
              </span>
              DriveVault AI Telemetry Active
            </div>

            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              {s.connected ? (
                <span>
                  Workstation <span className="gradient-text">Fully Protected</span>.
                </span>
              ) : (
                <span>
                  Protect Your <span className="gradient-text">Recordings & Files</span>.
                </span>
              )}
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
              {s.connected
                ? `Actively safeguarding ${s.folders.filter((f) => f.enabled).length} folder(s). New video trims, clips, and photos are instantly mirrored to Google Drive with SHA-256 integrity and Windows Recycle Bin safety.`
                : "Connect your Google account to automatically bind your folders, sync recordings, and safeguard your disk space with zero gaming lag."}
            </p>

            {/* Quick Action Dock */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {!s.connected ? (
                <Link href="/settings">
                  <Button variant="primary" icon={<Cloud className="h-4 w-4" />}>
                    Connect Google Drive
                  </Button>
                </Link>
              ) : (
                <Link href="/drive-files">
                  <Button variant="primary" icon={<Cloud className="h-4 w-4" />}>
                    Browse Drive Vault
                  </Button>
                </Link>
              )}

              <Link href="/auto-backup">
                <Button variant="secondary" icon={<FolderSync className="h-4 w-4 text-indigo-300" />}>
                  Monitored Folders ({s.folders.length})
                </Button>
              </Link>

              <Button
                variant="ghost"
                onClick={() => refresh()}
                icon={<RefreshCw className="h-4 w-4 text-sky-300" />}
              >
                Scan Now
              </Button>
            </div>
          </div>

          {/* Status Indicators & Live Telemetry Pills */}
          <div className="flex flex-col items-start sm:items-end gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldBadge ok={!s.settings.neverDeleteAutomatically} />
              {s.engine.gamingDetected ? (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  Gaming Mode Active
                </span>
              ) : null}
            </div>

            {s.account ? (
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2 text-xs text-white/80 shadow-md backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span>
                  Vault Cloud: <strong className="text-white font-mono">{s.account.email}</strong>
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>

      {/* Auth Error Banner */}
      {s.authError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-5 py-4 text-xs leading-relaxed text-amber-100 shadow-xl backdrop-blur-md">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300 animate-bounce" />
          <div>
            <p className="font-bold text-amber-200">Google Drive Connection Required</p>
            <p className="mt-0.5 opacity-90">{s.authError}</p>
          </div>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════
          2. LIVE STORAGE GAUGES (4 CARDS)
          ═══════════════════════════════════════════ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Local Storage */}
        <Card delay={0.05} className="p-5 hover:border-indigo-400/30 transition-all duration-300">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Local Storage</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">{formatBytes(s.local.freeBytes)}</p>
              <p className="mt-1 text-xs text-white/50">free of {formatBytes(s.local.totalBytes)}</p>
            </div>
            <RingGauge value={localUsedPct} size={64} strokeWidth={5}>
              <span className="text-[11px] font-bold text-white/90">{localUsedPct}%</span>
            </RingGauge>
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <Progress value={localUsedPct} />
            <div className="mt-2 flex items-center justify-between text-[11px] text-white/45">
              <span>{formatBytes(s.local.usedBytes)} used</span>
              <span className="font-semibold text-white/70">{localUsedPct}% occupied</span>
            </div>
          </div>
        </Card>

        {/* Cloud Storage */}
        <Card delay={0.1} className="p-5 hover:border-sky-400/30 transition-all duration-300">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Google Drive Cloud</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                {s.drive.connected ? formatBytes(s.drive.remainingBytes, 1) : "—"}
              </p>
              <p className="mt-1 text-xs text-white/50">
                {s.drive.connected ? `free in Cloud` : "Connect to view storage"}
              </p>
            </div>
            <RingGauge value={driveUsedPct} size={64} strokeWidth={5}>
              <span className="text-[11px] font-bold text-white/90">{driveUsedPct}%</span>
            </RingGauge>
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <Progress value={driveUsedPct} />
            <div className="mt-2 flex items-center justify-between text-[11px] text-white/45">
              <span>{s.drive.connected ? formatBytes(s.drive.usageBytes) : "0 GB"} used</span>
              <span className="font-semibold text-white/70">{driveUsedPctExact.toFixed(1)}% of limit</span>
            </div>
          </div>
        </Card>

        {/* Files Backed Up */}
        <Card delay={0.15} className="p-5 hover:border-emerald-400/30 transition-all duration-300">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Total Uploaded</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                <AnimatedCounter value={s.stats.filesUploaded} />
              </p>
              <p className="mt-1 text-xs text-white/50">{formatBytes(s.stats.totalCloudBytes)} safely backed up</p>
            </div>
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/15 p-2.5 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.25)]">
              <CloudUpload className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-emerald-300/90">
            <span className="inline-flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3 w-3" /> {s.stats.pendingCount > 0 ? `${s.stats.pendingCount} in queue` : "All caught up"}
            </span>
            <span className="font-bold">+{s.stats.uploadedToday} today</span>
          </div>
        </Card>

        {/* Space Cleaned */}
        <Card delay={0.2} className="p-5 hover:border-violet-400/30 transition-all duration-300">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Space Cleaned</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                {formatBytes(s.stats.spaceFreedBytes)}
              </p>
              <p className="mt-1 text-xs text-white/50">{formatBytes(s.stats.potentialFreeBytes)} ready to clean</p>
            </div>
            <div className="rounded-xl border border-violet-400/25 bg-violet-500/15 p-2.5 text-violet-300 shadow-[0_0_12px_rgba(167,139,250,0.25)]">
              <Trash2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-violet-300/90">
            <Link href="/storage" className="hover:underline flex items-center gap-1 font-medium">
              Reclaim space safely <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════
          2.5. AI STORAGE PROJECTION & FILE BREAKDOWN
          ═══════════════════════════════════════════ */}
      <StorageInsightsCard />

      {/* ═══════════════════════════════════════════
          3. LIVE UPLOAD STREAM & MONITORED FOLDERS
          ═══════════════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Live Upload Engine Card */}
        <Card delay={0.25} className="lg:col-span-2" glow={isUploading}>
          <SectionTitle
            title="Live Upload Engine"
            subtitle={
              isUploading
                ? `Streaming to Google Drive · ${s.stats.pendingCount} remaining (${formatBytes(s.stats.remainingBytes)})`
                : s.stats.pendingCount > 0
                  ? `${s.stats.pendingCount} file(s) queued · ${formatBytes(s.stats.remainingBytes)} total`
                  : "Standing by — watching configured folders for new recordings"
            }
            right={
              active ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => post("/api/queue", { action: "pause", ids: [active.id] })}
                    icon={<Pause className="h-3.5 w-3.5" />}
                  >
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => post("/api/queue", { action: "cancel", ids: [active.id] })}
                    icon={<X className="h-3.5 w-3.5" />}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null
            }
          />
          {active ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
                    <p className="truncate text-base font-bold text-white">{active.fileName}</p>
                  </div>
                  <p className="mt-1 text-xs text-white/50">
                    {formatBytes(active.fileSize)} · from <span className="font-mono text-white/70">{active.sourcePath ?? "—"}</span>
                  </p>
                </div>
                <div className="flex items-end gap-5">
                  <div className="text-right">
                    <p className="text-3xl font-black tracking-tight text-white">{Math.round(active.progress)}%</p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-bold text-indigo-300">{formatSpeed(active.speedBps)}</p>
                    <p className="text-[11px] text-white/40">{formatEta(active.etaSeconds)} remaining</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Progress value={active.progress} className="h-3" />
                <div className="flex justify-between text-[11px] font-medium text-white/40">
                  <span>{formatBytes(active.bytesUploaded)} / {formatBytes(active.fileSize)}</span>
                  <span className={cn("capitalize font-semibold", isUploading ? "text-indigo-300" : "text-white/60")}>
                    {statusStyle(active.status).label}
                  </span>
                </div>
              </div>
              {active.errorMessage ? (
                <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                  {active.errorMessage}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 text-emerald-300 shadow-inner">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="text-base font-bold text-white/90">All Watched Folders Are In Sync</p>
              <p className="max-w-md text-xs text-white/50 leading-relaxed">
                Save or record any new file into your watched folders. DriveVault detects it in real-time and uploads in the background.
              </p>
              <Link href="/auto-backup">
                <Button size="sm" variant="secondary" icon={<FolderSync className="h-3.5 w-3.5 text-indigo-300" />}>
                  Manage Watched Folders
                </Button>
              </Link>
            </div>
          )}
        </Card>

        {/* Stats Column */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Stat
            label="Uploaded Today"
            value={`${s.stats.uploadedToday} files`}
            sub={formatBytes(s.stats.uploadedTodayBytes)}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="sky"
            delay={0.25}
          />
          <Stat
            label="This Week"
            value={`${s.stats.uploadedWeek} files`}
            sub={formatBytes(s.stats.uploadedWeekBytes)}
            icon={<Database className="h-4 w-4" />}
            accent="indigo"
            delay={0.3}
          />
          <Stat
            label="Failed / Needs Retry"
            value={String(s.stats.failed)}
            sub="Original files kept 100% safe"
            icon={<AlertTriangle className="h-4 w-4" />}
            accent={s.stats.failed > 0 ? "rose" : "emerald"}
            delay={0.35}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          4. MONITORED FOLDERS QUICK GLANCE
          ═══════════════════════════════════════════ */}
      <Card delay={0.35}>
        <SectionTitle
          title="Active Folder Watchers"
          subtitle="Real-time directory watchers monitoring local disk for new recordings and media"
          right={
            <Link href="/auto-backup">
              <Button size="sm" variant="secondary" icon={<FolderSync className="h-3.5 w-3.5 text-indigo-300" />}>
                Configure All Folders
              </Button>
            </Link>
          }
        />
        {s.folders.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/40">No folders configured yet. Add your first folder above.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.folders.map((folder, i) => (
              <div
                key={folder.id}
                className="group relative flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-all duration-300 hover:border-indigo-400/30 hover:bg-white/[0.06]"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 shrink-0 text-indigo-400" />
                    <p className="truncate text-xs font-bold text-white group-hover:text-indigo-200">
                      {folder.label || folder.path.split(/[\\/]/).filter(Boolean).pop() || folder.path}
                    </p>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-white/40">{folder.path}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-white/50">
                    <span>{folder.fileCount} files</span>
                  </div>
                </div>
                <div className="shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold",
                      folder.enabled
                        ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                        : "border border-white/10 bg-white/5 text-white/40",
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", folder.enabled ? "bg-emerald-400" : "bg-white/30")} />
                    {folder.enabled ? "Active" : "Paused"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ═══════════════════════════════════════════
          5. RECENT ACTIVITY TIMELINE
          ═══════════════════════════════════════════ */}
      <Card delay={0.4}>
        <SectionTitle
          title="Live Activity Stream"
          subtitle="Real-time backup and filesystem events from this workstation"
          right={
            <Link href="/activity">
              <Button size="sm" variant="ghost">
                View Full Log
              </Button>
            </Link>
          }
        />
        {s.recent.length === 0 ? (
          <p className="py-10 text-center text-xs text-white/40">No activity recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {s.recent.slice(0, 7).map((item, i) => {
              const st = statusStyle(item.status ?? item.eventType);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3.5 py-3 transition hover:bg-white/[0.02] px-2 rounded-xl"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full shadow-[0_0_8px]", st.dot)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/85">{item.message}</p>
                    {item.filePath ? (
                      <p className="truncate text-[10px] text-white/40 font-mono mt-0.5">{item.filePath}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-white/45">{formatDate(item.ts)}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function ShieldBadge({ ok }: { ok: boolean }) {
  return (
    <div
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-md backdrop-blur-md",
        ok
          ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.2)]"
          : "border-indigo-400/30 bg-indigo-500/15 text-indigo-200",
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        {ok ? "Recycle Bin Safe Lock: ON" : "Auto-Clean Disabled"}
      </span>
    </div>
  );
}
