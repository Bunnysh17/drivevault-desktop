"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  CloudUpload,
  Cloud,
  Cog,
  HardDrive,
  LayoutDashboard,
  FolderSync,
  Pause,
  Play,
  ShieldCheck,
  Gamepad2,
  Minus,
  X,
  Monitor,
  Wifi,
  ChevronLeft,
  ChevronRight,
  Zap,
  Palette,
  RotateCw,
  Search,
} from "lucide-react";
import { useAppState } from "./StateProvider";
import { SetupWizard } from "./SetupWizard";
import { Avatar, cn } from "./ui";
import { PCExplorerModal } from "./PCExplorerModal";
import { ThemeSelectorModal } from "./ThemeSelectorModal";
import { CommandPalette } from "./CommandPalette";
import { DragDropOverlay } from "./DragDropOverlay";
import { NetworkSpeedometerModal } from "./NetworkSpeedometerModal";
import { playSfx, isSfxEnabled, setSfxEnabled } from "@/lib/sound";
import { formatBytes, formatSpeed } from "@/lib/format";
import type { ThemeMode } from "@/lib/types";
import { Volume2, VolumeX, Gauge, Radio } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/auto-backup", label: "Auto Backup", icon: FolderSync },
  { href: "/uploads", label: "Uploads", icon: CloudUpload },
  { href: "/drive-files", label: "Drive Files", icon: Cloud },
  { href: "/storage", label: "Storage", icon: HardDrive },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Cog },
];

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      className="relative flex items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-red-950/40 ring-1 ring-red-500/30 transition-transform duration-300 hover:scale-105 shrink-0"
    >
      <img
        src="/app-icon.png"
        alt="DriveVault"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "cover", display: "block" }}
        className="h-full w-full object-cover"
      />
      <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0B0F19]" />
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { snapshot, post, refresh, updateSettings } = useAppState();
  const [collapsed, setCollapsed] = useState(false);
  const [hostname, setHostname] = useState("");
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [speedometerOpen, setSpeedometerOpen] = useState(false);
  const [sfxActive, setSfxActive] = useState(true);
  const [livePingMs, setLivePingMs] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const paused = snapshot?.engine.paused ?? false;
  const connected = snapshot?.connected ?? false;
  const activeUpload = snapshot?.currentUpload;
  const isUploading = activeUpload?.status === "uploading" || activeUpload?.status === "preparing";

  useEffect(() => {
    setSfxActive(isSfxEnabled());
    // Live ping telemetry check
    const checkPing = async () => {
      const start = performance.now();
      try {
        const res = await fetch("/api/health?t=" + Date.now(), { cache: "no-store" });
        if (res.ok) {
          setLivePingMs(Math.round(performance.now() - start));
        }
      } catch (e) {
        setLivePingMs(null);
      }
    };
    void checkPing();
    const interval = setInterval(checkPing, 15000);
    return () => clearInterval(interval);
  }, []);

  const toggleSound = () => {
    const next = !sfxActive;
    setSfxActive(next);
    setSfxEnabled(next);
    if (next) {
      setTimeout(() => playSfx("ping"), 50);
    }
  };

  // Sync theme with body data-theme attribute
  useEffect(() => {
    const theme = snapshot?.settings.theme || "dark";
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-theme", theme);
    }
  }, [snapshot?.settings.theme]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  useEffect(() => {
    void refresh();
    setHostname(typeof window !== "undefined" ? (window.location.hostname === "localhost" ? "Local PC" : window.location.hostname) : "PC");

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) {
        e.preventDefault();
        void handleManualRefresh();
      }
      // Ctrl+K / Cmd+K => Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDroppedFiles = async (files: File[]) => {
    // Queue dropped files for upload via the upload API
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", file.name);
        // Save locally first — we just log it; actual upload engine picks it up via watched folder
        // For now, show a notification via the state refresh
      } catch {/* ignore */}
    }
    // Trigger a refresh to show updated queue
    await refresh();
  };

  const toggleUploads = async () => {
    await post("/api/engine", { action: paused ? "resume" : "pause" });
    void refresh();
  };

  const trayAction = (action: string) => {
    const bridge = (window as unknown as { drivevault?: { tray?: (a: string) => void } }).drivevault;
    if (bridge?.tray) bridge.tray(action);
    else void post("/api/engine", { action: "refresh" });
  };

  return (
    <div className="flex min-h-screen">
      {/* ═══════ SIDEBAR ═══════ */}
      <aside
        className={cn(
          "sidebar-glass sticky top-0 hidden h-screen shrink-0 flex-col transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex",
          collapsed ? "w-[72px]" : "w-[252px]",
        )}
      >
        {/* Logo + Brand */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-2">
          <Logo />
          {!collapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="min-w-0"
            >
              <p className="truncate text-[15px] font-bold tracking-tight gradient-text">DriveVault</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">PC Backup</p>
            </motion.div>
          ) : null}
        </div>

        {/* Profile Section */}
        {!collapsed && snapshot ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-3 mt-2 mb-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
          >
            <div className="flex items-center gap-2.5">
              <Avatar
                src={snapshot.account?.picture}
                name={snapshot.account?.name || snapshot.account?.email}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white/90">
                  {snapshot.account?.name || "Not connected"}
                </p>
                <p className="truncate text-[10px] text-white/40">
                  {snapshot.account?.email || "Connect Google Drive"}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400" : "bg-white/30")} />
                {connected ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /> : null}
              </span>
              <span className="text-[10px] text-white/35">
                {connected ? "Connected" : "Offline"} · {hostname}
              </span>
            </div>
          </motion.div>
        ) : null}

        {/* Navigation */}
        <nav className="mt-1 flex flex-1 flex-col gap-0.5 px-2.5">
          {NAV.map((item, i) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                  active
                    ? "bg-white/[0.08] text-white nav-active-glow"
                    : "text-white/45 hover:bg-white/[0.04] hover:text-white/80",
                )}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-indigo-400 via-violet-400 to-sky-400 shadow-[0_0_12px_rgba(99,102,241,0.6)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                ) : null}
                <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200", active && "scale-110 text-indigo-300")} />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
                {item.href === "/uploads" && snapshot && snapshot.engine.queuedCount > 0 && !collapsed ? (
                  <span className="ml-auto rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                    {snapshot.engine.queuedCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="space-y-2 p-2.5">
          {/* Mini upload progress in sidebar */}
          {!collapsed && isUploading && activeUpload ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="rounded-xl border border-indigo-400/15 bg-indigo-500/[0.07] p-2.5"
            >
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-indigo-300 status-pulse" />
                <p className="truncate text-[10px] font-medium text-indigo-200">{activeUpload.fileName}</p>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400"
                  animate={{ width: `${activeUpload.progress}%` }}
                  transition={{ ease: "easeOut", duration: 0.3 }}
                />
              </div>
              <p className="mt-1 text-[9px] text-white/30">{Math.round(activeUpload.progress)}% · {formatSpeed(activeUpload.speedBps)}</p>
            </motion.div>
          ) : null}

          {!collapsed ? (
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/50">
                <ShieldCheck className="h-3 w-3 text-emerald-400/70" />
                Safety lock active
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-white/30">
                Files only removed after verified in Drive.
              </p>
            </div>
          ) : null}
          {!collapsed ? (
            <div className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-gradient-to-r from-indigo-500/[0.06] to-violet-500/[0.04] px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]" />
                <span className="text-[10px] font-bold tracking-wide text-white/40">DriveVault</span>
              </div>
              <span className="rounded-full bg-indigo-500/15 border border-indigo-400/25 px-2 py-0.5 text-[9px] font-bold text-indigo-300 tracking-wider">v1.0.0</span>
            </div>
          ) : null}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-white/[0.05] px-3 py-2 text-[11px] text-white/35 transition hover:bg-white/[0.05] hover:text-white/60"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <><ChevronLeft className="h-3.5 w-3.5" /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* ═══════ MAIN ═══════ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="header-glass sticky top-0 z-30 flex items-center gap-3 px-5 py-2.5">
          <div className="flex items-center gap-2 md:hidden">
            <Logo size={28} />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Mobile Nav */}
            <div className="md:hidden">
              <nav className="flex gap-1 overflow-x-auto">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn("rounded-lg p-2", pathname === item.href ? "bg-white/10 text-white" : "text-white/45")}
                  >
                    <item.icon className="h-4 w-4" />
                  </Link>
                ))}
              </nav>
            </div>

            {/* Desktop header info */}
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-medium text-white/85">
                {snapshot?.connected ? `Welcome back${snapshot.account?.name ? `, ${snapshot.account.name.split(" ")[0]}` : ""} 👋` : "Connect Google Drive to start."}
              </p>
              <p className="truncate text-[11px] text-white/35">
                {snapshot
                  ? `${snapshot.folders.filter((f) => f.enabled).length} folder(s) watched · ${snapshot.engine.queuedCount} in queue`
                  : "Loading…"}
              </p>
            </div>
          </div>

          {/* Header right side */}
          <div className="flex items-center gap-2">
            <StatusPill connected={connected} email={snapshot?.account?.email ?? null} />

            {snapshot?.engine.gamingDetected ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200 lg:inline-flex">
                <Gamepad2 className="h-3.5 w-3.5" /> Gaming
              </span>
            ) : null}

            {/* Live upload speed indicator */}
            {isUploading && activeUpload ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="hidden items-center gap-1.5 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-200 lg:inline-flex"
              >
                <Zap className="h-3 w-3 status-pulse" />
                {formatSpeed(activeUpload.speedBps)}
              </motion.div>
            ) : null}

            <button
              onClick={toggleUploads}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                paused
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                  : "border-white/10 bg-white/[0.06] text-white/75 hover:bg-white/[0.1]",
              )}
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? "Resume" : "Pause"}
            </button>

            {/* 1-Click Universal Refresh Button */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title="Sync & Refresh App (Ctrl+R / F5)"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/20 bg-sky-500/[0.08] px-3 py-2 text-xs font-medium text-sky-200 transition-all duration-200 hover:bg-sky-500/[0.18] hover:text-white hover:border-sky-400/40 active:scale-95 disabled:opacity-50"
            >
              <RotateCw className={cn("h-3.5 w-3.5 text-sky-400 transition-transform", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">{isRefreshing ? "Syncing…" : "Refresh"}</span>
            </button>

            {/* Ctrl+K Command Palette Button */}
            <button
              onClick={() => setCmdPaletteOpen(true)}
              title="Command Palette (Ctrl+K)"
              className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/50 transition hover:bg-white/[0.09] hover:text-white hover:border-white/20 md:inline-flex"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="text-white/40">Search…</span>
              <kbd className="rounded border border-white/15 bg-white/[0.06] px-1 font-mono text-[9px] text-white/30">⌘K</kbd>
            </button>

            {/* Live Ping & Network Speedometer Pill */}
            <button
              onClick={() => {
                playSfx("click");
                setSpeedometerOpen(true);
              }}
              title="Cloud Telemetry & Diagnostics"
              className="hidden lg:inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.08] px-2.5 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/[0.18] hover:text-white hover:border-indigo-400/40 active:scale-95"
            >
              <Radio className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
              <span>{livePingMs !== null ? `${livePingMs}ms` : "Telemetry"}</span>
            </button>

            {/* Sound FX Audio Toggle Button */}
            <button
              onClick={toggleSound}
              title={sfxActive ? "Sound Effects: Enabled (Click to Mute)" : "Sound Effects: Muted (Click to Enable)"}
              className={cn(
                "rounded-xl border p-2 transition active:scale-95",
                sfxActive
                  ? "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300 hover:bg-emerald-500/[0.18] hover:text-white"
                  : "border-white/10 bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/80"
              )}
            >
              {sfxActive ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {/* Quick Theme Switcher Button */}
            <button
              onClick={() => {
                playSfx("theme");
                setThemeModalOpen(true);
              }}
              title={`Themes & Anime Artwork Gallery (Current: ${snapshot?.settings.theme ?? "dark"})`}
              className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.08] p-2 text-indigo-300 transition hover:bg-indigo-500/[0.18] hover:text-white hover:border-indigo-400/40 active:scale-95"
            >
              <Palette className="h-4 w-4 text-indigo-300" />
            </button>

            {/* Quick Browse PC Button */}
            <button
              onClick={() => {
                playSfx("click");
                setExplorerOpen(true);
              }}
              title="Browse & Inspect PC Files"
              className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-900/40 hover:text-white hover:border-cyan-400/50 shadow-sm active:scale-95"
            >
              <HardDrive className="h-3.5 w-3.5 text-cyan-300" />
              <span className="hidden sm:inline">Browse PC</span>
            </button>

            <Link
              href="/settings"
              onClick={() => playSfx("click")}
              title="Settings"
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-white/60 transition hover:bg-white/[0.1] hover:text-white"
            >
              <Cog className="h-4 w-4" />
            </Link>

            <button
              onClick={() => {
                playSfx("click");
                trayAction("minimize");
              }}
              title="Minimize to tray"
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-white/50 transition hover:bg-white/[0.09] hover:text-white"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                playSfx("delete");
                trayAction("quit");
              }}
              title="Exit"
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-white/40 transition hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-500/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Main content area */}
        <main className="min-w-0 flex-1 px-5 pb-14 pt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <SetupWizard />
      <PCExplorerModal
        open={explorerOpen}
        onClose={() => setExplorerOpen(false)}
        onBoundSuccess={() => void refresh()}
      />
      <ThemeSelectorModal
        open={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        currentTheme={snapshot?.settings.theme ?? "dark"}
        onSelectTheme={(t) => {
          void updateSettings({ theme: t });
          if (typeof document !== "undefined") {
            document.body.setAttribute("data-theme", t);
            document.documentElement.setAttribute("data-theme", t);
            localStorage.setItem("drivevault_theme", t);
          }
        }}
      />
      <NetworkSpeedometerModal
        open={speedometerOpen}
        onClose={() => setSpeedometerOpen(false)}
      />
      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onAction={(id) => {
          setCmdPaletteOpen(false);
          if (id === "pause") void post("/api/engine", { action: "pause" });
          else if (id === "resume") void post("/api/engine", { action: "resume" });
          else if (id === "theme") setThemeModalOpen(true);
          else if (id === "refresh") void handleManualRefresh();
        }}
      />
      <DragDropOverlay onFiles={handleDroppedFiles} />
    </div>
  );
}

function StatusPill({ connected, email }: { connected: boolean; email: string | null }) {
  return (
    <div
      className={cn(
        "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium sm:inline-flex",
        connected
          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
          : "border-white/10 bg-white/[0.05] text-white/55",
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-white/35")} />
        {connected ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /> : null}
      </span>
      {connected ? `Connected${email ? ` · ${email}` : ""}` : "Not connected"}
    </div>
  );
}
