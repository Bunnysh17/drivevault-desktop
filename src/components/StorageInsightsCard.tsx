"use client";

import { motion } from "framer-motion";
import {
  FileVideo,
  FileImage,
  FileText,
  Archive,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  HardDrive,
  Cloud,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { playSfx } from "@/lib/sound";
import { formatBytes } from "@/lib/format";
import { useAppState } from "./StateProvider";

export function StorageInsightsCard() {
  const { snapshot } = useAppState();
  if (!snapshot) return null;

  const s = snapshot;
  const totalDrive = s.drive.limitBytes || 15 * 1024 * 1024 * 1024;
  const usedDrive = s.drive.usageBytes || 0;
  const freeDrive = Math.max(0, totalDrive - usedDrive);
  const usedPercent = Math.round((usedDrive / totalDrive) * 100);

  const catStats = s.stats?.categories ?? {
    videos: { bytes: 0, count: 0, pct: 60 },
    images: { bytes: 0, count: 0, pct: 25 },
    docs: { bytes: 0, count: 0, pct: 10 },
    others: { bytes: 0, count: 0, pct: 5 },
  };

  const categories = [
    { label: "Videos & Gameplay Clips", bytes: catStats.videos.bytes, count: catStats.videos.count, color: "from-indigo-500 to-violet-500", bg: "bg-indigo-500", icon: FileVideo, pct: catStats.videos.pct },
    { label: "Images & Screenshots", bytes: catStats.images.bytes, count: catStats.images.count, color: "from-emerald-400 to-teal-500", bg: "bg-emerald-400", icon: FileImage, pct: catStats.images.pct },
    { label: "Documents & Data", bytes: catStats.docs.bytes, count: catStats.docs.count, color: "from-sky-400 to-blue-500", bg: "bg-sky-400", icon: FileText, pct: catStats.docs.pct },
    { label: "System Archives & Other", bytes: catStats.others.bytes, count: catStats.others.count, color: "from-amber-400 to-orange-500", bg: "bg-amber-400", icon: Archive, pct: catStats.others.pct },
  ];

  // Storage days remaining estimation
  const avgDailyBackup = Math.max(0.5 * 1024 * 1024 * 1024, s.stats.uploadedTodayBytes || 1.2 * 1024 * 1024 * 1024);
  const daysRemaining = freeDrive > 0 ? Math.max(1, Math.round(freeDrive / avgDailyBackup)) : 0;

  return (
    <div className="glass-card relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-7 shadow-xl space-y-6">
      {/* Background Aura */}
      <div className="pointer-events-none absolute -right-16 -bottom-16 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-400/30 text-indigo-300 shadow-inner">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              AI Storage Projection & File Breakdown
              <span className="rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                Insights
              </span>
            </h3>
            <p className="text-xs text-white/50">Predictive analytics & multi-category storage distribution</p>
          </div>
        </div>

        <Link
          href="/storage"
          onClick={() => playSfx("click")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white transition"
        >
          <span>Deep Cleanup</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Forecast Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-indigo-400/30 bg-gradient-to-r from-indigo-500/[0.12] to-violet-500/[0.06] p-4 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Storage Runway
          </div>
          <div className="text-2xl font-black font-mono text-white">
            ~{daysRemaining} Days
          </div>
          <p className="text-[11px] text-white/50">Space remaining at current backup rate</p>
        </div>

        <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/[0.12] to-teal-500/[0.06] p-4 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
            <Cloud className="h-3.5 w-3.5" /> Free Cloud Quota
          </div>
          <div className="text-2xl font-black font-mono text-emerald-300">
            {formatBytes(freeDrive)}
          </div>
          <p className="text-[11px] text-white/50">{100 - usedPercent}% of total {formatBytes(totalDrive)} available</p>
        </div>

        <div className="rounded-2xl border border-sky-400/30 bg-gradient-to-r from-sky-500/[0.12] to-blue-500/[0.06] p-4 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Auto-Free Space Rule
          </div>
          <div className="text-2xl font-black font-mono text-sky-300">
            {s.settings.deleteAfterUpload ? "Active" : "Standby"}
          </div>
          <p className="text-[11px] text-white/50">Safely deletes local clips after cloud backup</p>
        </div>
      </div>

      {/* Multi-Segment Color Distribution Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-white/70">
          <span>Cloud File Category Breakdown</span>
          <span className="font-mono">{formatBytes(usedDrive)} Total Used ({usedPercent}%)</span>
        </div>

        <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.08] p-0.5 gap-1">
          {categories.map((cat, i) => (
            <motion.div
              key={i}
              initial={{ width: 0 }}
              animate={{ width: `${cat.pct}%` }}
              transition={{ ease: "easeOut", duration: 0.6, delay: i * 0.1 }}
              className={`h-full rounded-full bg-gradient-to-r ${cat.color}`}
              title={`${cat.label}: ${formatBytes(cat.bytes)} (${cat.pct}%)`}
            />
          ))}
        </div>
      </div>

      {/* Category Pills Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {categories.map((cat, i) => {
          const Icon = cat.icon;
          return (
            <div
              key={i}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 space-y-2 hover:bg-white/[0.06] transition"
            >
              <div className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${cat.bg}/20 text-white`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-white/90 truncate">{cat.label}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-black font-mono text-white">{formatBytes(cat.bytes)}</span>
                <span className="text-[11px] font-mono font-bold text-white/50">{cat.pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
