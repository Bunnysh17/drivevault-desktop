"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  FolderSync,
  CloudUpload,
  Cloud,
  HardDrive,
  Activity,
  Cog,
  Search,
  Palette,
  Zap,
  FileUp,
  ShieldCheck,
  RotateCw,
  ArrowRight,
} from "lucide-react";
import { cn } from "./ui";

interface Command {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon: React.ElementType;
  category: string;
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onAction?: (id: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);

  const commands: Command[] = [
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      description: "Overview, storage ring, recent uploads",
      icon: LayoutDashboard,
      category: "Navigate",
      action: () => router.push("/"),
    },
    {
      id: "nav-auto-backup",
      label: "Go to Auto Backup",
      description: "Manage watched folders",
      icon: FolderSync,
      category: "Navigate",
      action: () => router.push("/auto-backup"),
    },
    {
      id: "nav-uploads",
      label: "Go to Uploads Queue",
      description: "View and manage upload queue",
      icon: CloudUpload,
      category: "Navigate",
      action: () => router.push("/uploads"),
    },
    {
      id: "nav-drive",
      label: "Go to Drive Files",
      description: "Browse, download, delete Google Drive files",
      icon: Cloud,
      category: "Navigate",
      action: () => router.push("/drive-files"),
    },
    {
      id: "nav-storage",
      label: "Go to Storage",
      description: "PC and Drive storage analytics",
      icon: HardDrive,
      category: "Navigate",
      action: () => router.push("/storage"),
    },
    {
      id: "nav-activity",
      label: "Go to Activity Log",
      description: "Full activity and event history",
      icon: Activity,
      category: "Navigate",
      action: () => router.push("/activity"),
    },
    {
      id: "nav-settings",
      label: "Go to Settings",
      description: "Themes, Google Drive sync, gaming mode",
      icon: Cog,
      category: "Navigate",
      action: () => router.push("/settings"),
    },
    {
      id: "action-pause",
      label: "Pause All Uploads",
      description: "Pause the upload engine",
      icon: Zap,
      category: "Actions",
      action: () => onAction?.("pause"),
    },
    {
      id: "action-resume",
      label: "Resume All Uploads",
      description: "Resume the upload engine",
      icon: Zap,
      category: "Actions",
      action: () => onAction?.("resume"),
    },
    {
      id: "action-theme",
      label: "Open Theme Gallery",
      description: "Switch anime art wallpaper & theme",
      icon: Palette,
      category: "Actions",
      action: () => onAction?.("theme"),
    },
    {
      id: "action-refresh",
      label: "Refresh App State",
      description: "Re-sync with backend & Drive",
      icon: RotateCw,
      category: "Actions",
      action: () => onAction?.("refresh"),
    },
    {
      id: "action-drive-files",
      label: "Browse & Download Drive Files",
      description: "Multi-select, bulk delete & original-quality download",
      shortcut: "D",
      icon: Cloud,
      category: "Actions",
      action: () => router.push("/drive-files"),
    },
  ];

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description?.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const run = useCallback(
    (cmd: Command) => {
      cmd.action();
      onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) run(cmd);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected, run, onClose]);

  // Group by category
  const categories = Array.from(new Set(filtered.map((c) => c.category)));

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[12vh] z-[10000] w-full max-w-[600px] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/15 bg-[#0c0f1e]/95 shadow-[0_25px_80px_rgba(0,0,0,0.8),0_0_0_1px_rgba(99,102,241,0.15)] backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
              <Search className="h-4 w-4 shrink-0 text-white/40" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands, pages, actions…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
              />
              <kbd className="hidden shrink-0 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/40 sm:block">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-white/35">
                  No commands found for &ldquo;{query}&rdquo;
                </p>
              )}

              {categories.map((cat) => {
                const items = filtered.filter((c) => c.category === cat);
                return (
                  <div key={cat}>
                    <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                      {cat}
                    </p>
                    {items.map((cmd) => {
                      const globalIdx = filtered.indexOf(cmd);
                      const isActive = globalIdx === selected;
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          onMouseEnter={() => setSelected(globalIdx)}
                          onClick={() => run(cmd)}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                            isActive
                              ? "bg-indigo-500/20 text-white"
                              : "text-white/70 hover:bg-white/[0.04]"
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                              isActive
                                ? "border-indigo-400/40 bg-indigo-500/25 text-indigo-300"
                                : "border-white/10 bg-white/[0.04] text-white/40"
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{cmd.label}</p>
                            {cmd.description && (
                              <p className="truncate text-[11px] text-white/40">
                                {cmd.description}
                              </p>
                            )}
                          </div>
                          {isActive && (
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2">
              <div className="flex items-center gap-3 text-[10px] text-white/30">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-white/15 bg-white/[0.05] px-1 font-mono text-[9px]">↑</kbd>
                  <kbd className="rounded border border-white/15 bg-white/[0.05] px-1 font-mono text-[9px]">↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-white/15 bg-white/[0.05] px-1 font-mono text-[9px]">↵</kbd>
                  Select
                </span>
              </div>
              <p className="text-[10px] text-white/25 font-mono">DriveVault CMD</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
