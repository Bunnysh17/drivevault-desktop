"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  Video,
  File,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Zap,
  HardDrive,
  Film,
  Sparkles,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Modal, Button, Badge, Input, Card, cn } from "./ui";
import { formatBytes, formatRelative } from "@/lib/format";

interface FsItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  formattedSize: string;
  modifiedAt: string;
  extension: string;
  isVideo: boolean;
  status?: "uploaded" | "queued" | "ready";
}

interface FsResponse {
  locations: { label: string; path: string }[];
  currentPath: string | null;
  parentPath: string | null;
  itemCount: number;
  fileCount: number;
  videoCount: number;
  totalSizeBytes: number;
  formattedTotalSize: string;
  items: FsItem[];
  error?: string;
}

interface PCExplorerModalProps {
  open: boolean;
  onClose: () => void;
  initialPath?: string;
  onBoundSuccess?: () => void;
}

export function PCExplorerModal({ open, onClose, initialPath, onBoundSuccess }: PCExplorerModalProps) {
  const [data, setData] = useState<FsResponse | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(initialPath || "");
  const [loading, setLoading] = useState(false);
  const [syncingPath, setSyncingPath] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const showToast = (text: string, ok = true) => {
    setToastMsg({ text, ok });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchPath = async (targetPath?: string) => {
    setLoading(true);
    try {
      const url = targetPath ? `/api/fs?path=${encodeURIComponent(targetPath)}` : "/api/fs";
      const res = await fetch(url);
      const json = (await res.json()) as FsResponse;
      setData(json);
      if (json.currentPath) {
        setCurrentPath(json.currentPath);
      }
    } catch {
      showToast("Could not load folder contents.", false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchPath(initialPath || currentPath || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath]);

  const handleBindFolder = async () => {
    if (!currentPath) return;
    setSyncingPath(currentPath);
    try {
      const res = await fetch("/api/fs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bindAndSyncFolder", path: currentPath }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to bind folder");
      showToast(`Bound successfully! ${json.queued} file(s) syncing to Drive.`);
      if (onBoundSuccess) onBoundSuccess();
      void fetchPath(currentPath);
    } catch (err) {
      showToast((err as Error).message, false);
    } finally {
      setSyncingPath(null);
    }
  };

  const handleSyncFile = async (item: FsItem) => {
    setSyncingPath(item.path);
    try {
      const res = await fetch("/api/fs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "syncSingleFile", path: item.path }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to sync file");
      showToast(json.message || `Syncing ${item.name} to Google Drive!`);
      if (onBoundSuccess) onBoundSuccess();
      void fetchPath(currentPath);
    } catch (err) {
      showToast((err as Error).message, false);
    } finally {
      setSyncingPath(null);
    }
  };

  const filteredItems = (data?.items || []).filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const pathParts = currentPath ? currentPath.split(/[\\/]/).filter(Boolean) : [];

  return (
    <Modal open={open} onClose={onClose} title="PC File Explorer & Content Inspector" className="max-w-5xl">
      <div className="space-y-4">
        {/* Toast Notification */}
        <AnimatePresence>
          {toastMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cn(
                "rounded-xl px-4 py-2.5 text-xs font-semibold shadow-lg flex items-center justify-between",
                toastMsg.ok
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30",
              )}
            >
              <span>{toastMsg.text}</span>
              <button onClick={() => setToastMsg(null)} className="text-white/60 hover:text-white ml-3">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Access Locations Bar */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Quick Access Locations</p>
          <div className="flex flex-wrap gap-2">
            {(data?.locations || []).map((loc) => {
              const isSelected = currentPath === loc.path;
              return (
                <button
                  key={loc.path}
                  onClick={() => void fetchPath(loc.path)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    isSelected
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20 ring-1 ring-indigo-400"
                      : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5",
                  )}
                >
                  <HardDrive className="h-3.5 w-3.5 opacity-70" />
                  <span>{loc.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Path Bar & Search */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <div className="flex-1 flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5">
            {data?.parentPath && (
              <button
                onClick={() => void fetchPath(data.parentPath!)}
                className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Go up one folder"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <FolderOpen className="h-4 w-4 text-indigo-400 shrink-0" />
            <input
              type="text"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void fetchPath(currentPath);
              }}
              placeholder="C:\Users\..."
              className="w-full bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none font-mono"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void fetchPath(currentPath)}
              disabled={loading}
              className="text-xs px-2.5 h-7"
            >
              Go
            </Button>
          </div>

          <div className="sm:w-60 relative">
            <Search className="h-3.5 w-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files inside..."
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Current Folder Summary Bar */}
        {data?.currentPath && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
                <Film className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white truncate max-w-md">
                  {data.currentPath}
                </p>
                <p className="text-[11px] text-white/50">
                  {data.fileCount} file(s) ({data.videoCount} video clips) • Total: <span className="text-indigo-300 font-medium">{data.formattedTotalSize}</span>
                </p>
              </div>
            </div>

            <Button
              onClick={handleBindFolder}
              disabled={syncingPath === currentPath}
              icon={<Zap className="h-4 w-4 text-amber-300 fill-amber-300" />}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30"
            >
              {syncingPath === currentPath ? "Binding & Scanning..." : "Bind & Auto-Sync Entire Folder"}
            </Button>
          </div>
        )}

        {/* Files & Folders List */}
        <div className="max-h-[380px] min-h-[220px] overflow-y-auto border border-white/10 rounded-xl bg-black/30 p-2 space-y-1 custom-scrollbar">
          {loading ? (
            <div className="py-20 text-center text-xs text-white/40 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
              <span>Scanning PC directory...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-xs text-white/40">
              {searchQuery ? "No matching files found." : "This folder is empty or contains no accessible files."}
            </div>
          ) : (
            filteredItems.map((item) => {
              if (item.isDir) {
                return (
                  <div
                    key={item.path}
                    onClick={() => void fetchPath(item.path)}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/10 cursor-pointer transition-all border border-transparent hover:border-white/10 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Folder className="h-4 w-4 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-white truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/40 text-xs shrink-0">
                      <span>Folder</span>
                      <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                );
              }

              // File Item
              return (
                <div
                  key={item.path}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.isVideo ? (
                      <div className="h-7 w-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                        <Video className="h-3.5 w-3.5 text-violet-300" />
                      </div>
                    ) : (
                      <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <File className="h-3.5 w-3.5 text-white/40" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate max-w-sm sm:max-w-md">{item.name}</p>
                      <p className="text-[10px] text-white/40">
                        {item.formattedSize} • {formatRelative(item.modifiedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "uploaded" && (
                      <Badge variant="success" className="text-[10px] px-2 py-0.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Synced
                      </Badge>
                    )}
                    {item.status === "queued" && (
                      <Badge variant="warning" className="text-[10px] px-2 py-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> In Queue
                      </Badge>
                    )}
                    {item.status === "ready" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSyncFile(item)}
                        disabled={syncingPath === item.path}
                        icon={<Zap className="h-3 w-3 text-indigo-300" />}
                        className="text-[11px] h-7 px-2.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30"
                      >
                        {syncingPath === item.path ? "Syncing..." : "Sync to Drive"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[11px] text-white/40 pt-2 border-t border-white/5">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Zero-risk read-only inspection. Original files remain untouched.
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
