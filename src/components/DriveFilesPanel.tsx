"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ExternalLink,
  FolderOpen,
  RotateCcw,
  Trash2,
  Play,
  Pause,
  FileVideo,
  FileAudio,
  FileImage,
  FileText,
  File,
  Download,
  Search,
  Grid,
  List,
  Maximize2,
  Minimize2,
  X,
  Sparkles,
  Cloud,
  Check,
  CheckSquare,
  Square,
  AlertTriangle,
  Pencil,
  RotateCw,
  Clock,
  Zap,
  HardDriveDownload,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Eye,
  Volume2,
  Home,
  ChevronRight,
  FolderPlus,
} from "lucide-react";
import { useAppState } from "@/components/StateProvider";
import { Button, Card, SectionTitle, cn, Badge, Modal, Input, Field } from "@/components/ui";
import { fetchDriveFiles } from "@/lib/client-api";
import { formatBytes, formatDate, formatRelative, formatSpeed, formatEta } from "@/lib/format";
import { playSfx } from "@/lib/sound";

type DriveFile = Awaited<ReturnType<typeof fetchDriveFiles>>["files"][number];

export type DownloadItem = {
  fileId: string;
  fileName: string;
  mimeType?: string;
  loaded: number;
  total: number;
  speed: number;
  status: "pending" | "downloading" | "paused" | "done" | "error" | "cancelled";
  error?: string;
};

export function DriveFilesPanel() {
  const { snapshot, post } = useAppState();
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveBin, setDriveBin] = useState<DriveFile[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [preview, setPreview] = useState<DriveFile | null>(null);
  const [currentParent, setCurrentParent] = useState("root");
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("grid");
  const [activeTab, setActiveTab] = useState<"files" | "bin" | "downloads">("files");

  const [deleteTarget, setDeleteTarget] = useState<DriveFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // New Folder Creation State
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const refresh = useCallback(async () => {
    const [files, bin] = await Promise.all([fetchDriveFiles(false, currentParent), fetchDriveFiles(true)]);
    setDriveFiles(files.files);
    setDriveBin(bin.files);
  }, [currentParent]);

  const handleCreateFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await post("/api/drive/files", {
        action: "create_folder",
        name: newFolderName.trim(),
        parentId: currentParent === "root" ? undefined : currentParent,
      });
      if (!res.ok) {
        playSfx("delete");
        alert(res.error ?? "Failed to create folder.");
        return;
      }
      playSfx("success");
      setNewFolderOpen(false);
      setNewFolderName("");
      await refresh();
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await refresh();
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  const navigateToFolder = (folderId: string, folderName?: string) => {
    playSfx("tab");
    setCurrentParent(folderId);
    if (folderId === "root") {
      setBreadcrumbs([]);
    } else if (folderName) {
      setBreadcrumbs((prev) => {
        const existsIndex = prev.findIndex((b) => b.id === folderId);
        if (existsIndex >= 0) {
          return prev.slice(0, existsIndex + 1);
        }
        return [...prev, { id: folderId, name: folderName }];
      });
    }
  };

  useEffect(() => {
    if (!snapshot?.connected) return;
    void refresh().catch(() => undefined);
    const id = setInterval(() => void refresh().catch(() => undefined), 15000);
    return () => clearInterval(id);
  }, [snapshot?.connected, refresh]);

  const action = async (file: DriveFile, value: "trash" | "restore" | "delete") => {
    if (value === "delete") {
      setDeleteTarget(file);
      return;
    }
    setWorking(file.id);
    const result = await post("/api/drive/files", { id: file.id, action: value });
    setWorking(null);
    if (!result.ok) alert(result.error ?? "Drive action failed.");
    else await refresh();
  };

  const handleMoveToBin = (file: DriveFile) => {
    void action(file, "trash");
  };

  const handleRestore = (file: DriveFile) => {
    void action(file, "restore");
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setWorking(deleteTarget.id);
    const result = await post("/api/drive/files", { id: deleteTarget.id, action: "delete" });
    setWorking(null);
    setDeleting(false);
    setDeleteTarget(null);
    if (result.ok) await refresh();
  };

  const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const openRename = (file: DriveFile) => {
    setRenameTarget(file);
    setRenameValue(file.name);
  };

  const confirmRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    setWorking(renameTarget.id);
    const result = await post<{ ok: boolean; name: string }>("/api/drive/files", {
      id: renameTarget.id,
      action: "rename",
      name: renameValue.trim(),
    });
    setWorking(null);
    setRenaming(false);
    if (!result.ok) {
      alert(result.error ?? "Failed to rename file.");
    } else {
      setRenameTarget(null);
      await refresh();
    }
  };

  // Multi-Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionTarget, setBulkActionTarget] = useState<"trash" | "restore" | "delete" | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // NON-BLOCKING DOWNLOAD ENGINE (1-by-1 Queue, Clear Waiting, Speed/ETA)
  // ═══════════════════════════════════════════════════════════════════════════
  const [downloadList, setDownloadList] = useState<DownloadItem[]>([]);
  const downloadListRef = useRef<DownloadItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [showBottomDock, setShowBottomDock] = useState(true);

  const activeAbortRef = useRef<AbortController | null>(null);
  const activeAbortMapRef = useRef<Map<string, AbortController>>(new Map());
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const resumeResolveRef = useRef<(() => void) | null>(null);
  const queueRunningRef = useRef(false);

  // Synchronized state updater
  const updateDownloadList = (updater: (prev: DownloadItem[]) => DownloadItem[]) => {
    setDownloadList((prev) => {
      const updated = updater(prev);
      downloadListRef.current = updated;
      return updated;
    });
  };

  const activeList = activeTab === "files" ? driveFiles : driveBin;
  const filteredFiles = searchQuery
    ? activeList.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : activeList;

  const selectedFiles = filteredFiles.filter((f) => selectedIds.includes(f.id));
  const selectedBytes = selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredFiles.map((f) => f.id));
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const confirmBulkAction = async () => {
    if (!bulkActionTarget || selectedIds.length === 0) return;
    setBulkWorking(true);
    const result = await post<{ ok: boolean; count: number }>("/api/drive/files", {
      ids: selectedIds,
      action: bulkActionTarget,
    });
    setBulkWorking(false);
    setBulkActionTarget(null);
    if (!result.ok) {
      alert(result.error ?? `Failed to perform bulk ${bulkActionTarget}.`);
    } else {
      setSelectedIds([]);
      await refresh();
    }
  };

  // Helper to wait while paused
  const checkPauseWait = async () => {
    while (isPausedRef.current && !isCancelledRef.current) {
      await new Promise<void>((resolve) => {
        resumeResolveRef.current = resolve;
        setTimeout(resolve, 200);
      });
    }
  };

  // Execute 1 single file stream with instant pause & abort support
  const executeDownloadStream = async (item: DownloadItem): Promise<boolean> => {
    const controller = new AbortController();
    activeAbortMapRef.current.set(item.fileId, controller);
    activeAbortRef.current = controller;

    updateDownloadList((prev) =>
      prev.map((d) => (d.fileId === item.fileId ? { ...d, status: "downloading", speed: 0, error: undefined } : d))
    );

    let lastBytes = 0;
    let lastTime = Date.now();

    try {
      const url = `/api/drive/files/${item.fileId}?download=1&name=${encodeURIComponent(item.fileName)}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const totalSize = Number(response.headers.get("content-length") || item.total || 0);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Stream unreadable");

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        if (isCancelledRef.current) {
          controller.abort();
          throw new Error("Cancelled");
        }

        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        received += value.length;

        // Calculate speed & ETA
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        let speed = 0;
        if (timeDiff >= 0.3) {
          const bytesDiff = received - lastBytes;
          speed = Math.max(0, bytesDiff / timeDiff);
          setCurrentSpeed(speed);
          lastBytes = received;
          lastTime = now;

          if (speed > 0 && totalSize > received) {
            setEtaSeconds((totalSize - received) / speed);
          }
        }

        updateDownloadList((prev) =>
          prev.map((d) =>
            d.fileId === item.fileId
              ? { ...d, loaded: received, total: totalSize > 0 ? totalSize : received, speed: speed || d.speed }
              : d
          )
        );
      }

      // Assemble blob and trigger browser download
      const blob = new Blob(chunks as unknown as BlobPart[], { type: item.mimeType || "application/octet-stream" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = item.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      updateDownloadList((prev) =>
        prev.map((d) =>
          d.fileId === item.fileId
            ? { ...d, loaded: received, total: totalSize > 0 ? totalSize : received, status: "done", speed: 0 }
            : d
        )
      );
      return true;
    } catch (err: any) {
      const isPaused =
        downloadListRef.current.find((d) => d.fileId === item.fileId)?.status === "paused" ||
        isPausedRef.current ||
        err?.message === "Paused";
      const isAbort = err?.name === "AbortError" || isCancelledRef.current;
      updateDownloadList((prev) =>
        prev.map((d) =>
          d.fileId === item.fileId
            ? {
                ...d,
                status: isPaused ? "paused" : isAbort ? "cancelled" : "error",
                error: isPaused ? "Paused" : isAbort ? "Cancelled" : (err?.message ?? "Failed"),
                speed: 0,
              }
            : d
        )
      );
      return false;
    } finally {
      activeAbortMapRef.current.delete(item.fileId);
      if (activeAbortRef.current === controller) {
        activeAbortRef.current = null;
      }
    }
  };

  // Run sequential 1-by-1 loop
  const processDownloadQueue = async () => {
    if (queueRunningRef.current) return;
    queueRunningRef.current = true;
    setIsDownloading(true);
    isCancelledRef.current = false;

    try {
      while (!isPausedRef.current && !isCancelledRef.current) {
        const currentItems = downloadListRef.current;
        const nextItem = currentItems.find((d) => d.status === "pending");
        if (!nextItem) break;

        await executeDownloadStream(nextItem);
        if (isPausedRef.current || isCancelledRef.current) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      queueRunningRef.current = false;
      const hasRemaining = downloadListRef.current.some(
        (d) => d.status === "pending" || d.status === "downloading"
      );
      setIsDownloading(hasRemaining && !isPausedRef.current);
      setCurrentSpeed(0);
      setEtaSeconds(null);
    }
  };

  // Start download for selected files (1 active, rest waiting) & auto-deselect selection
  const startDownload = (files: DriveFile[]) => {
    const validFiles = files.filter((f) => !f.isFolder);
    if (validFiles.length === 0) return;

    playSfx("success");
    // Deselect all selected files immediately as user requested
    setSelectedIds([]);

    isCancelledRef.current = false;
    isPausedRef.current = false;
    setIsPaused(false);
    setShowBottomDock(true);

    const newItems: DownloadItem[] = validFiles
      .filter((f) => !downloadListRef.current.some((d) => d.fileId === f.id))
      .map((f) => ({
        fileId: f.id,
        fileName: f.name,
        mimeType: f.mimeType,
        loaded: 0,
        total: f.size || 0,
        speed: 0,
        status: "pending" as const,
      }));

    const combined = [...downloadListRef.current, ...newItems];
    downloadListRef.current = combined;
    setDownloadList(combined);

    setTimeout(() => {
      void processDownloadQueue();
    }, 50);
  };

  // Instant Pause: abort active stream immediately & mark as paused
  const pauseDownloads = () => {
    playSfx("pause");
    isPausedRef.current = true;
    setIsPaused(true);
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const updated = downloadListRef.current.map((d) =>
      d.status === "downloading" ? { ...d, status: "paused" as const, speed: 0 } : d
    );
    downloadListRef.current = updated;
    setDownloadList(updated);
  };

  // Instant Resume: flip paused back to pending & restart loop
  const resumeDownloads = () => {
    playSfx("resume");
    isPausedRef.current = false;
    setIsPaused(false);
    isCancelledRef.current = false;

    const updated = downloadListRef.current.map((d) =>
      d.status === "paused" ? { ...d, status: "pending" as const, error: undefined } : d
    );
    downloadListRef.current = updated;
    setDownloadList(updated);

    if (resumeResolveRef.current) {
      resumeResolveRef.current();
      resumeResolveRef.current = null;
    }
    setTimeout(() => {
      void processDownloadQueue();
    }, 50);
  };

  // User requested: Start all waiting files at once simultaneously
  const downloadAllSimultaneously = () => {
    playSfx("success");
    isPausedRef.current = false;
    setIsPaused(false);
    isCancelledRef.current = false;

    const itemsToRun = downloadListRef.current.filter(
      (d) => d.status === "pending" || d.status === "paused"
    );
    if (itemsToRun.length === 0) return;

    setIsDownloading(true);
    itemsToRun.forEach((item) => {
      void executeDownloadStream(item);
    });
  };

  // User requested: Start an individual waiting file immediately
  const startSingleWaitingDownload = (fileId: string) => {
    playSfx("success");
    isPausedRef.current = false;
    setIsPaused(false);
    isCancelledRef.current = false;

    const item = downloadListRef.current.find((d) => d.fileId === fileId);
    if (!item) return;

    setIsDownloading(true);
    void executeDownloadStream(item);
  };

  // Pause single download file
  const pauseSingleDownload = (fileId: string) => {
    playSfx("pause");
    activeAbortMapRef.current.get(fileId)?.abort();
    const updated = downloadListRef.current.map((d) =>
      d.fileId === fileId ? { ...d, status: "paused" as const, speed: 0 } : d
    );
    downloadListRef.current = updated;
    setDownloadList(updated);
  };

  // Resume single download file
  const resumeSingleDownload = (fileId: string) => {
    playSfx("resume");
    isPausedRef.current = false;
    setIsPaused(false);
    isCancelledRef.current = false;
    const item = downloadListRef.current.find((d) => d.fileId === fileId);
    if (!item) return;

    setIsDownloading(true);
    void executeDownloadStream(item);
  };

  // User requested: Remove ALL waiting files from the queue with 1 click
  const clearWaitingDownloads = () => {
    playSfx("delete");
    const updated = downloadListRef.current.filter((d) => d.status !== "pending");
    downloadListRef.current = updated;
    setDownloadList(updated);
  };

  // Cancel / remove single download item
  const removeSingleDownload = (fileId: string) => {
    playSfx("delete");
    activeAbortMapRef.current.get(fileId)?.abort();
    const updated = downloadListRef.current.filter((d) => d.fileId !== fileId);
    downloadListRef.current = updated;
    setDownloadList(updated);
  };

  const cancelAllDownloads = () => {
    playSfx("delete");
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
    activeAbortMapRef.current.forEach((c) => c.abort());
    activeAbortMapRef.current.clear();
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    if (resumeResolveRef.current) {
      resumeResolveRef.current();
      resumeResolveRef.current = null;
    }
    const updated = downloadListRef.current.map((d) =>
      d.status === "pending" || d.status === "downloading" || d.status === "paused"
        ? { ...d, status: "cancelled" as const, speed: 0 }
        : d
    );
    downloadListRef.current = updated;
    setDownloadList(updated);
    setIsDownloading(false);
    setCurrentSpeed(0);
    setEtaSeconds(null);
  };

  const retryDownload = (fileId: string) => {
    isCancelledRef.current = false;
    isPausedRef.current = false;
    setIsPaused(false);
    const updated = downloadListRef.current.map((d) =>
      d.fileId === fileId ? { ...d, loaded: 0, status: "pending" as const, error: undefined } : d
    );
    downloadListRef.current = updated;
    setDownloadList(updated);
    setTimeout(() => {
      void processDownloadQueue();
    }, 50);
  };

  const clearCompletedDownloads = () => {
    const updated = downloadListRef.current.filter(
      (d) => d.status === "downloading" || d.status === "pending" || d.status === "paused"
    );
    downloadListRef.current = updated;
    setDownloadList(updated);
  };

  const activeDownloads = downloadList.filter((d) => d.status === "downloading" || d.status === "paused");
  const activeDownloadItem = activeDownloads[0] || null;
  const pendingDownloads = downloadList.filter((d) => d.status === "pending");
  const completedDownloads = downloadList.filter((d) => d.status === "done");
  const failedDownloads = downloadList.filter((d) => d.status === "error" || d.status === "cancelled");

  const totalDownloadBytes = downloadList.reduce((acc, d) => acc + (d.total || 0), 0);
  const loadedDownloadBytes = downloadList.reduce((acc, d) => acc + (d.loaded || 0), 0);
  const overallDownloadPercent =
    totalDownloadBytes > 0 ? Math.round((loadedDownloadBytes / totalDownloadBytes) * 100) : 0;
  const activeDownloadsCount = downloadList.filter(
    (d) => d.status === "downloading" || d.status === "pending" || d.status === "paused"
  ).length;

  return (
    <div className="space-y-5">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Navigation / Breadcrumbs */}
        <div className="flex items-center gap-2">
          {currentParent !== "root" ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const previous = breadcrumbs[breadcrumbs.length - 2];
                setBreadcrumbs((items) => items.slice(0, -1));
                setCurrentParent(previous?.id ?? "root");
              }}
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>
          ) : null}
          <div className="flex items-center gap-1.5 text-xs text-white/50 bg-white/[0.03] border border-white/[0.06] px-3.5 py-2 rounded-xl">
            <Cloud className="h-3.5 w-3.5 text-indigo-400" />
            <button
              onClick={() => {
                setCurrentParent("root");
                setBreadcrumbs([]);
              }}
              className="hover:text-white transition font-medium"
            >
              My Drive
            </button>
            {breadcrumbs.map((b, i) => (
              <span key={b.id} className="flex items-center gap-1.5">
                <span className="text-white/25">/</span>
                <button
                  onClick={() => {
                    setCurrentParent(b.id);
                    setBreadcrumbs((items) => items.slice(0, i + 1));
                  }}
                  className="hover:text-white transition font-medium text-white/80"
                >
                  {b.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-52 rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30 transition"
            />
          </div>

          <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-lg transition",
                viewMode === "grid" ? "bg-white/15 text-white" : "text-white/40 hover:text-white"
              )}
              title="Grid View"
            >
              <Grid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "p-1.5 rounded-lg transition",
                viewMode === "table" ? "bg-white/15 text-white" : "text-white/40 hover:text-white"
              )}
              title="Table View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
            <button
              onClick={() => setActiveTab("files")}
              className={cn(
                "px-3 py-1 text-xs rounded-lg font-medium transition",
                activeTab === "files" ? "bg-indigo-500/20 text-indigo-200 border border-indigo-400/30" : "text-white/40 hover:text-white"
              )}
            >
              Active Files ({driveFiles.length})
            </button>
            <button
              onClick={() => setActiveTab("bin")}
              className={cn(
                "px-3 py-1 text-xs rounded-lg font-medium transition",
                activeTab === "bin" ? "bg-amber-500/20 text-amber-200 border border-amber-400/30" : "text-white/40 hover:text-white"
              )}
            >
              Bin ({driveBin.length})
            </button>
            <button
              onClick={() => setActiveTab("downloads")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition",
                activeTab === "downloads"
                  ? "bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 shadow-sm"
                  : "text-white/40 hover:text-white"
              )}
            >
              <HardDriveDownload className={cn("h-3.5 w-3.5", isDownloading ? "text-indigo-400 animate-pulse" : "text-white/40")} />
              <span>Downloads</span>
              {downloadList.length > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-mono border",
                  isDownloading
                    ? "bg-indigo-500/40 text-indigo-200 border-indigo-400/50"
                    : "bg-white/10 text-white/60 border-white/10"
                )}>
                  {activeDownloadsCount > 0 ? activeDownloadsCount : downloadList.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => {
              playSfx("click");
              setNewFolderName("");
              setNewFolderOpen(true);
            }}
            title="Create new folder in Google Drive"
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/[0.18] hover:text-white hover:border-emerald-400/50 transition active:scale-95 shadow-sm"
          >
            <FolderPlus className="h-3.5 w-3.5 text-emerald-400" />
            <span>New Folder</span>
          </button>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            title="Refresh Google Drive files"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50"
          >
            <RotateCw className={cn("h-3.5 w-3.5 text-sky-400", isSyncing && "animate-spin")} />
            <span>{isSyncing ? "Syncing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* Main Files Display / Downloads Hub */}
      <Card delay={0.05} className="relative">
        {activeTab === "downloads" ? (
          /* ═══════════════════════════════════════════════════════════════════
             DEDICATED INLINE DOWNLOADS HUB (No blocking overlay)
             ═══════════════════════════════════════════════════════════════════ */
          <div className="space-y-6">
            {/* Header & Overall Stats */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 shadow-lg shadow-indigo-500/10">
                  <HardDriveDownload className={cn("h-6 w-6", isDownloading && "animate-bounce")} />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2.5">
                    Downloads Hub & Queue Manager
                    {isDownloading && (
                      <span className="flex h-2.5 w-2.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs text-white/50">
                    {isDownloading
                      ? `Downloading 1 file actively • ${pendingDownloads.length} waiting in queue • ${completedDownloads.length} completed`
                      : activeDownloadsCount > 0
                      ? `Queue Paused • ${activeDownloadsCount} remaining`
                      : downloadList.length > 0
                      ? `All ${downloadList.length} files finished downloading`
                      : "No active downloads in queue"}
                  </p>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                {isDownloading ? (
                  <button
                    onClick={pauseDownloads}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition shadow-sm"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    <span>Pause Queue</span>
                  </button>
                ) : activeDownloadsCount > 0 ? (
                  <button
                    onClick={resumeDownloads}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 transition shadow-sm"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Resume Queue</span>
                  </button>
                ) : null}

                {/* USER REQUESTED: Start all waiting downloads simultaneously at once */}
                {pendingDownloads.length > 0 && (
                  <button
                    onClick={downloadAllSimultaneously}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 hover:border-emerald-400/50 transition shadow-md"
                    title="Download all waiting files simultaneously at once"
                  >
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Start All At Once ({pendingDownloads.length})</span>
                  </button>
                )}

                {/* USER REQUESTED: Remove all waiting files from queue with 1 click */}
                {pendingDownloads.length > 0 && (
                  <button
                    onClick={clearWaitingDownloads}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 transition shadow-sm"
                    title="Remove all waiting files from queue"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Remove All Waiting ({pendingDownloads.length})</span>
                  </button>
                )}

                {activeDownloadsCount > 0 && (
                  <button
                    onClick={cancelAllDownloads}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-white/70 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-500/30 transition"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>Cancel Everything</span>
                  </button>
                )}

                {downloadList.some((d) => d.status === "done" || d.status === "cancelled" || d.status === "error") && (
                  <button
                    onClick={clearCompletedDownloads}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.08] hover:text-white transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear Finished</span>
                  </button>
                )}

                <button
                  onClick={() => setActiveTab("files")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-3.5 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 transition"
                >
                  <span>Back to Files</span>
                </button>
              </div>
            </div>

            {/* Overall Progress Banner */}
            {downloadList.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between text-xs font-semibold gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white/90">Overall Download Progress</span>
                    <span className="text-indigo-400 font-mono">
                      {overallDownloadPercent}% ({formatBytes(loadedDownloadBytes)} / {formatBytes(totalDownloadBytes)})
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-mono text-white/60">
                    {currentSpeed > 0 && (
                      <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                        <Zap className="h-3.5 w-3.5 text-emerald-400" />
                        {formatSpeed(currentSpeed)}
                      </span>
                    )}
                    {etaSeconds !== null && etaSeconds > 0 && (
                      <span className="flex items-center gap-1.5 text-sky-300 font-semibold">
                        <Clock className="h-3.5 w-3.5 text-sky-400" />
                        ETA: {formatEta(etaSeconds)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-sky-400 shadow-[0_0_15px_rgba(99,102,241,0.6)]"
                    initial={false}
                    animate={{ width: `${overallDownloadPercent}%` }}
                    transition={{ ease: "easeOut", duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* 1. ACTIVE DOWNLOADING FILES SECTION */}
            {activeDownloads.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
                  Currently Downloading & Active ({activeDownloads.length})
                </h3>
                <div className="space-y-3">
                  {activeDownloads.map((item) => {
                    const isItemDownloading = item.status === "downloading";
                    const isItemPaused = item.status === "paused";
                    const percent =
                      item.total > 0 ? Math.round((item.loaded / item.total) * 100) : 0;

                    return (
                      <div
                        key={item.fileId}
                        className="rounded-2xl border border-indigo-400/40 bg-gradient-to-r from-indigo-500/[0.12] to-violet-500/[0.06] p-4 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-400/30 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                              <FileIcon mimeType={item.mimeType || "application/octet-stream"} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white truncate max-w-[480px]" title={item.fileName}>
                                {item.fileName}
                              </p>
                              <div className="mt-0.5 flex items-center gap-3 text-xs text-white/50 font-mono">
                                <span>{formatBytes(item.loaded)} / {formatBytes(item.total)}</span>
                                {isItemPaused ? (
                                  <span className="text-amber-300 font-semibold">• Paused</span>
                                ) : item.speed > 0 ? (
                                  <span className="text-emerald-300 font-semibold">• {formatSpeed(item.speed)}</span>
                                ) : (
                                  <span className="text-indigo-300 font-semibold">• Downloading...</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="rounded-full bg-indigo-500/25 px-2.5 py-1 text-xs font-mono font-bold text-indigo-200 border border-indigo-400/40">
                              {percent}%
                            </span>
                            {isItemDownloading ? (
                              <button
                                onClick={() => pauseSingleDownload(item.fileId)}
                                className="rounded-xl border border-amber-500/30 bg-amber-500/15 p-2 text-amber-200 hover:bg-amber-500/30 transition"
                                title="Pause this file"
                              >
                                <Pause className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => resumeSingleDownload(item.fileId)}
                                className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-2 text-emerald-200 hover:bg-emerald-500/30 transition"
                                title="Resume this file"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => removeSingleDownload(item.fileId)}
                              className="rounded-xl border border-rose-500/30 bg-rose-500/15 p-2 text-rose-200 hover:bg-rose-500/30 transition"
                              title="Cancel this download"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-sky-400"
                            initial={false}
                            animate={{ width: `${percent}%` }}
                            transition={{ ease: "easeOut", duration: 0.3 }}
                            style={{ boxShadow: "0 0 10px rgba(99,102,241,0.5)" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. WAITING / QUEUED FILES SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-2">
                  <span>Waiting in Queue ({pendingDownloads.length})</span>
                </h3>
                {pendingDownloads.length > 0 && (
                  <button
                    onClick={clearWaitingDownloads}
                    className="text-xs text-rose-300 hover:text-rose-200 hover:underline flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear all waiting</span>
                  </button>
                )}
              </div>

              {pendingDownloads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-white/40">
                  No other files waiting in queue.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {pendingDownloads.map((item, idx) => (
                    <div
                      key={item.fileId}
                      className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04] transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[10px] font-mono font-bold text-white/40 border border-white/5">
                          #{idx + 1}
                        </span>
                        <FileIcon mimeType={item.mimeType || "application/octet-stream"} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white/90 truncate max-w-[380px]" title={item.fileName}>
                            {item.fileName}
                          </p>
                          <p className="text-[10px] text-white/40 font-mono">
                            {formatBytes(item.total)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/50 border border-white/10">
                          Waiting
                        </span>
                        <button
                          onClick={() => startSingleWaitingDownload(item.fileId)}
                          className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 transition shadow-sm"
                          title="Download this file right now"
                        >
                          <Play className="h-3 w-3" />
                          <span>Start Now</span>
                        </button>
                        <button
                          onClick={() => removeSingleDownload(item.fileId)}
                          className="flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-xs text-white/40 hover:border-rose-500/30 hover:bg-rose-500/15 hover:text-rose-200 transition"
                          title="Remove from queue"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. COMPLETED DOWNLOADS SECTION */}
            {completedDownloads.length > 0 && (
              <div className="space-y-3 border-t border-white/10 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400/80 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Completed Downloads ({completedDownloads.length})</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {completedDownloads.map((item) => (
                    <div
                      key={item.fileId}
                      className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileIcon mimeType={item.mimeType || "application/octet-stream"} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white/90 truncate max-w-[220px]" title={item.fileName}>
                            {item.fileName}
                          </p>
                          <p className="text-[10px] text-white/40 font-mono">
                            {formatBytes(item.total)} • Downloaded
                          </p>
                        </div>
                      </div>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. FAILED / CANCELLED SECTION */}
            {failedDownloads.length > 0 && (
              <div className="space-y-3 border-t border-white/10 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400/80 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400" />
                  <span>Failed or Cancelled ({failedDownloads.length})</span>
                </h3>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {failedDownloads.map((item) => (
                    <div
                      key={item.fileId}
                      className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-4 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileIcon mimeType={item.mimeType || "application/octet-stream"} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white/90 truncate max-w-[320px]" title={item.fileName}>
                            {item.fileName}
                          </p>
                          <p className="text-[10px] text-rose-300/70 font-mono">
                            {item.error || (item.status === "cancelled" ? "Cancelled by user" : "Failed")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => retryDownload(item.fileId)}
                          className="flex items-center gap-1 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25 transition"
                        >
                          <RotateCw className="h-3 w-3" />
                          <span>Retry</span>
                        </button>
                        <button
                          onClick={() => removeSingleDownload(item.fileId)}
                          className="rounded-lg p-1 text-white/40 hover:bg-rose-500/20 hover:text-rose-300 transition"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════════════
             NORMAL GOOGLE DRIVE FILES LISTING
             ═══════════════════════════════════════════════════════════════════ */
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-white/90">
                  {activeTab === "files" ? "Google Drive Files" : "Drive Bin (Deleted Files)"}
                </h2>
                <p className="mt-0.5 text-xs text-white/45">
                  {snapshot?.connected
                    ? `${filteredFiles.length} item(s) found in current directory`
                    : "Google Drive is not connected."}
                </p>
              </div>

              {filteredFiles.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={toggleSelectAll}
                    icon={
                      selectedIds.length === filteredFiles.length && filteredFiles.length > 0 ? (
                        <CheckSquare className="h-3.5 w-3.5 text-indigo-400" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-white/40" />
                      )
                    }
                    className="text-xs"
                  >
                    {selectedIds.length === filteredFiles.length && filteredFiles.length > 0
                      ? "Deselect All"
                      : `Select All (${filteredFiles.length})`}
                  </Button>
                </div>
              )}
            </div>

            {/* Floating Multi-Selection Action Dock */}
            <AnimatePresence>
              {selectedIds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="sticky top-20 z-30 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-400/30 bg-[#0c1222]/95 p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl ring-1 ring-indigo-500/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                      <CheckSquare className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">
                        {selectedIds.length} file{selectedIds.length > 1 ? "s" : ""} selected
                      </p>
                      <p className="text-[10px] text-indigo-200/60 font-mono">
                        Total: {formatBytes(selectedBytes)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeTab === "files" && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => startDownload(selectedFiles)}
                        icon={<Download className="h-3.5 w-3.5" />}
                        className="text-xs shadow-md"
                      >
                        Download Selected ({selectedFiles.length})
                      </Button>
                    )}

                    {activeTab === "files" ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setBulkActionTarget("trash")}
                        disabled={bulkWorking}
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        className="text-xs"
                      >
                        Move to Bin ({selectedIds.length})
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setBulkActionTarget("restore")}
                          disabled={bulkWorking}
                          icon={<RotateCcw className="h-3.5 w-3.5" />}
                          className="text-xs"
                        >
                          Restore ({selectedIds.length})
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setBulkActionTarget("delete")}
                          disabled={bulkWorking}
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          className="text-xs"
                        >
                          Delete Forever ({selectedIds.length})
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={clearSelection}
                      className="text-xs text-white/40 hover:text-white"
                    >
                      Clear
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Breadcrumb Navigation */}
            {activeTab === "files" && breadcrumbs.length > 0 && (
              <div className="mb-4 flex items-center gap-1.5 overflow-x-auto text-xs text-white/50 border-b border-white/5 pb-2.5">
                <button
                  onClick={() => navigateToFolder("root")}
                  className="flex items-center gap-1 hover:text-white transition"
                >
                  <Home className="h-3.5 w-3.5" />
                  <span>Root</span>
                </button>
                {breadcrumbs.map((crumb, idx) => (
                  <div key={crumb.id} className="flex items-center gap-1.5">
                    <ChevronRight className="h-3.5 w-3.5 text-white/20" />
                    <button
                      onClick={() => navigateToFolder(crumb.id)}
                      className={cn(
                        "hover:text-white transition truncate max-w-[150px]",
                        idx === breadcrumbs.length - 1 && "text-white font-medium"
                      )}
                    >
                      {crumb.name}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                <input
                  type="text"
                  placeholder="Filter files by name…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-4 py-2 text-xs text-white placeholder-white/30 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50 transition"
                />
              </div>
            </div>

            {/* File Content Listing */}
            {filteredFiles.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-white/60">
                  {searchQuery ? "No files matched your search" : "No files in this location"}
                </p>
                <p className="mt-1 text-xs text-white/30">
                  {searchQuery ? "Try searching for a different keyword." : "Your Google Drive files will appear here."}
                </p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredFiles.map((file, i) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    index={i}
                    isBin={activeTab === "bin"}
                    working={working === file.id}
                    selected={selectedIds.includes(file.id)}
                    onToggleSelect={toggleSelect}
                    onAction={action}
                    onPreview={setPreview}
                    onDownload={(f) => startDownload([f])}
                    onRename={openRename}
                    onOpenFolder={(f) => navigateToFolder(f.id, f.name)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider text-[10px]">
                      <th className="pb-3 pl-2 w-8"></th>
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Size</th>
                      <th className="pb-3">Modified</th>
                      <th className="pb-3 text-right pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredFiles.map((file) => {
                      const isSelected = selectedIds.includes(file.id);
                      return (
                        <tr
                          key={file.id}
                          onClick={() => {
                            if (file.isFolder) {
                              navigateToFolder(file.id, file.name);
                            } else {
                              setPreview(file);
                            }
                          }}
                          className={cn(
                            "group cursor-pointer transition hover:bg-white/[0.04]",
                            isSelected && "bg-indigo-500/[0.07]"
                          )}
                        >
                          <td className="py-2.5 pl-2" onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(file.id);
                          }}>
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-indigo-400" />
                            ) : (
                              <Square className="h-4 w-4 text-white/30 group-hover:text-white/60" />
                            )}
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2.5">
                              <FileIcon mimeType={file.mimeType} isFolder={file.isFolder} />
                              <span className="font-medium text-white/90 truncate max-w-[320px]">
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 font-mono text-[11px] text-white/50">
                            {file.isFolder ? "—" : formatBytes(file.size)}
                          </td>
                          <td className="py-2.5 text-white/40 text-[11px]">
                            {formatDate(file.modifiedTime)}
                          </td>
                          <td className="py-2.5 text-right pr-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {!file.isFolder && (
                                <button
                                  onClick={() => startDownload([file])}
                                  className="p-1 text-white/40 hover:text-white transition"
                                  title="Download"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {activeTab === "files" ? (
                                <>
                                  <button
                                    onClick={() => {
                                      setRenameTarget(file);
                                      setRenameValue(file.name);
                                    }}
                                    className="p-1 text-white/40 hover:text-white transition"
                                    title="Rename"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveToBin(file)}
                                    className="p-1 text-white/40 hover:text-rose-300 transition"
                                    title="Move to Bin"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleRestore(file)}
                                    className="p-1 text-white/40 hover:text-indigo-300 transition"
                                    title="Restore"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteTarget(file)}
                                    className="p-1 text-white/40 hover:text-rose-300 transition"
                                    title="Permanently Delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Bulk Action Confirmation Modal */}
      <Modal
        open={Boolean(bulkActionTarget)}
        onClose={() => setBulkActionTarget(null)}
        title={
          bulkActionTarget === "delete"
            ? `Permanently Delete ${selectedIds.length} File(s)?`
            : bulkActionTarget === "trash"
            ? `Move ${selectedIds.length} File(s) to Bin?`
            : `Restore ${selectedIds.length} File(s)?`
        }
        description={
          bulkActionTarget === "delete"
            ? "This will permanently destroy all selected files from your Google Drive bin. This cannot be undone."
            : bulkActionTarget === "trash"
            ? "Selected files will be moved to your Google Drive Bin."
            : "Selected files will be restored back to your active Drive folder."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkActionTarget(null)} disabled={bulkWorking}>
              Cancel
            </Button>
            <Button
              variant={bulkActionTarget === "delete" || bulkActionTarget === "trash" ? "danger" : "primary"}
              onClick={confirmBulkAction}
              disabled={bulkWorking}
              icon={
                bulkActionTarget === "restore" ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )
              }
            >
              {bulkWorking
                ? "Processing..."
                : bulkActionTarget === "delete"
                ? `Permanently Delete (${selectedIds.length})`
                : bulkActionTarget === "trash"
                ? `Move to Bin (${selectedIds.length})`
                : `Restore (${selectedIds.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs space-y-1">
            <p className="font-semibold text-white">
              Total Selection: {selectedIds.length} item(s) • {formatBytes(selectedBytes)}
            </p>
            <div className="divide-y divide-white/5 pt-2">
              {selectedFiles.slice(0, 10).map((f) => (
                <div key={f.id} className="py-1 flex items-center justify-between text-white/60">
                  <span className="truncate max-w-[280px]">{f.name}</span>
                  <span className="font-mono text-[10px] text-white/40">{formatBytes(f.size)}</span>
                </div>
              ))}
              {selectedFiles.length > 10 && (
                <p className="pt-2 text-center text-[11px] text-white/40 italic">
                  + {selectedFiles.length - 10} more files…
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Professional Permanent Delete Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Permanently Delete from Google Drive?"
        description="This action cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmPermanentDelete}
              disabled={deleting}
              icon={<Trash2 className="h-4 w-4" />}
            >
              {deleting ? "Deleting..." : "Permanently Delete"}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] p-4 text-xs text-rose-200 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-rose-300">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>Delete File Forever</span>
              </div>
              <p className="leading-relaxed text-rose-200/80">
                This will permanently delete <strong>{deleteTarget.name}</strong> from your Google Drive bin.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/50 space-y-1 font-mono">
              <p className="text-white truncate">{deleteTarget.name}</p>
              <p className="text-[11px] text-white/40">{formatBytes(deleteTarget.size)} • {deleteTarget.mimeType}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Professional Rename in Google Drive Modal */}
      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename in Google Drive"
        description="Update the file name instantly on Google Drive cloud."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)} disabled={renaming}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={confirmRename}
              disabled={renaming || !renameValue.trim()}
              icon={<Check className="h-4 w-4" />}
            >
              {renaming ? "Renaming in Drive..." : "Save & Rename"}
            </Button>
          </>
        }
      >
        {renameTarget && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirmRename();
            }}
            className="space-y-4"
          >
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.08] p-3 text-xs text-indigo-200 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>
                Renaming here will instantly update the file title on your connected <strong>Google Drive</strong> account.
              </span>
            </div>

            <Field label="File Name" hint="Include the file extension (e.g. .mp4) to keep formatting correct.">
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter new file name..."
                autoFocus
                disabled={renaming}
                className="font-medium"
              />
            </Field>

            <div className="flex items-center justify-between text-[11px] text-white/40 pt-1">
              <span>Size: {formatBytes(renameTarget.size)}</span>
              <span>Type: {renameTarget.mimeType}</span>
            </div>
          </form>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          NON-BLOCKING FLOATING BOTTOM-RIGHT WIDGET (When on Files or Bin tab)
          ZERO BACKDROP OVERLAY — NEVER BLOCKS CLICKS OR VISIBILITY!
          ═══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {activeTab !== "downloads" && downloadList.length > 0 && showBottomDock && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-6 right-6 z-[80] flex flex-col gap-2.5 rounded-2xl border border-indigo-400/40 bg-[#0a0e1c]/95 p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl ring-1 ring-indigo-500/30 max-w-[390px] w-[390px]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                  <HardDriveDownload className={cn("h-4 w-4", isDownloading && "animate-bounce")} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate max-w-[210px]" title={activeDownloadItem?.fileName}>
                    {activeDownloadItem ? activeDownloadItem.fileName : "Downloads finished"}
                  </p>
                  <p className="text-[10px] text-white/50 font-mono">
                    {isPaused
                      ? "Paused"
                      : isDownloading
                      ? `${currentSpeed > 0 ? formatSpeed(currentSpeed) : "Downloading..."} • ${pendingDownloads.length} waiting`
                      : "Finished"}
                  </p>
                </div>
              </div>

              <span className="font-mono text-xs text-indigo-300 font-bold">
                {overallDownloadPercent}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-sky-400"
                initial={false}
                animate={{ width: `${overallDownloadPercent}%` }}
                transition={{ ease: "easeOut", duration: 0.3 }}
              />
            </div>

            {/* Bottom Quick Actions */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10 text-xs">
              <div className="flex items-center gap-1.5">
                {isDownloading ? (
                  <button
                    onClick={pauseDownloads}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25 transition"
                    title="Pause Download"
                  >
                    <Pause className="h-3 w-3" />
                    <span>Pause</span>
                  </button>
                ) : activeDownloadsCount > 0 ? (
                  <button
                    onClick={resumeDownloads}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25 transition"
                    title="Resume Download"
                  >
                    <Play className="h-3 w-3" />
                    <span>Resume</span>
                  </button>
                ) : null}

                {/* USER REQUESTED: Start all waiting downloads simultaneously at once */}
                {pendingDownloads.length > 0 && (
                  <button
                    onClick={downloadAllSimultaneously}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25 transition shadow-sm"
                    title="Start all waiting files simultaneously"
                  >
                    <Zap className="h-3 w-3 text-emerald-400" />
                    <span>Start All</span>
                  </button>
                )}

                {/* USER REQUESTED: Remove all waiting files from queue right here! */}
                {pendingDownloads.length > 0 && (
                  <button
                    onClick={clearWaitingDownloads}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/25 transition shadow-sm"
                    title="Remove all waiting files from queue"
                  >
                    <X className="h-3 w-3" />
                    <span>Remove Waiting ({pendingDownloads.length})</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab("downloads")}
                  className="rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-2 py-1 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/20 transition"
                  title="Open Downloads Hub"
                >
                  Manage
                </button>
                <button
                  onClick={() => setShowBottomDock(false)}
                  className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white transition"
                  title="Hide Widget"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═════════════════════════════════════════════════════════════════════════
          HIGH-END MEDIA THEATER / VIDEO PREVIEWER MODAL
          ═════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {preview ? (
          <MediaTheaterModal
            file={preview}
            onClose={() => setPreview(null)}
            onDownload={(f) => startDownload([f])}
          />
        ) : null}
      </AnimatePresence>

      {/* ═════════════════════════════════════════════════════════════════════════
          NEW FOLDER CREATION MODAL
          ═════════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="Create New Folder in Google Drive"
        description={
          currentParent === "root"
            ? "Creating folder in root My Drive"
            : `Creating folder inside: ${breadcrumbs[breadcrumbs.length - 1]?.name || currentParent}`
        }
      >
        <form onSubmit={handleCreateFolder} className="space-y-4 pt-2">
          <Field label="Folder Name">
            <Input
              placeholder="e.g. Valorant Highlights, Documents 2026…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setNewFolderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={creatingFolder || !newFolderName.trim()}
              icon={<FolderPlus className="h-4 w-4" />}
            >
              {creatingFolder ? "Creating…" : "Create Folder"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEDIA THEATER MODAL (Proper aspect ratio & portrait video support)
   ═══════════════════════════════════════════════════════════════════════════ */
function MediaTheaterModal({
  file,
  onClose,
  onDownload,
}: {
  file: DriveFile;
  onClose: () => void;
  onDownload: (file: DriveFile) => void;
}) {
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPortrait, setIsPortrait] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      if (videoHeight > videoWidth) {
        setIsPortrait(true);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-hidden">
      {/* Dim backdrop with blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-xl"
      />

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "relative z-10 flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#090d16] shadow-[0_25px_70px_rgba(0,0,0,0.9)] max-h-[92vh]",
          isPortrait ? "w-full max-w-lg" : "w-full max-w-5xl"
        )}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <FileIcon mimeType={file.mimeType} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{file.name}</p>
              <div className="flex items-center gap-2 text-[11px] text-white/40">
                <span>{formatBytes(file.size)}</span>
                <span>•</span>
                <span className="uppercase font-mono text-[10px] text-indigo-300">{file.mimeType.split("/").pop()}</span>
                {isPortrait ? (
                  <span className="rounded-full bg-pink-500/20 text-pink-200 border border-pink-500/30 px-2 py-0.2 text-[9px] font-semibold">
                    Portrait 9:16
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {file.webViewLink ? (
              <a
                href={file.webViewLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Drive</span>
              </a>
            ) : null}

            <button
              onClick={() => onDownload(file)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(99,102,241,0.5)] hover:from-indigo-400 hover:to-indigo-500 transition active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/[0.06] p-2 text-white/60 hover:bg-white/15 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Player / Viewer Body */}
        <div className="relative flex flex-1 items-center justify-center bg-black/95 p-2 sm:p-4 overflow-hidden">
          {isVideo ? (
            <div className="relative flex w-full items-center justify-center">
              <video
                ref={videoRef}
                src={`/api/drive/files/${file.id}`}
                controls
                autoPlay
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                className={cn(
                  "rounded-2xl shadow-2xl object-contain bg-black",
                  isPortrait
                    ? "max-h-[72vh] w-auto aspect-[9/16] ring-1 ring-white/10"
                    : "max-h-[72vh] w-full max-w-4xl aspect-video"
                )}
              />
            </div>
          ) : isAudio ? (
            <div className="flex flex-col items-center justify-center gap-6 py-16 px-6 text-center w-full max-w-lg">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-400/30 shadow-[0_0_40px_rgba(99,102,241,0.2)]">
                <FileAudio className="h-10 w-10 text-indigo-300 animate-pulse" />
              </div>
              <div className="w-full space-y-2">
                <p className="text-base font-semibold text-white truncate">{file.name}</p>
                <audio
                  src={`/api/drive/files/${file.id}`}
                  controls
                  autoPlay
                  className="w-full rounded-xl"
                />
              </div>
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center p-2">
              <img
                src={`/api/drive/files/${file.id}`}
                alt={file.name}
                className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={`/api/drive/files/${file.id}`}
              title={file.name}
              className="h-[75vh] w-full rounded-2xl bg-white"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <File className="h-12 w-12 text-white/30" />
              <p className="text-sm font-semibold text-white/70">Preview not supported for this file type.</p>
              <p className="text-xs text-white/40">Use the Download button above to open it locally.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FILE GRID CARD
   ═══════════════════════════════════════════════════════════════════════════ */
function FileCard({
  file,
  index,
  isBin,
  working,
  selected,
  onToggleSelect,
  onAction,
  onPreview,
  onDownload,
  onOpenFolder,
  onRename,
}: {
  file: DriveFile;
  index: number;
  isBin: boolean;
  working: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onAction: (file: DriveFile, action: "trash" | "restore" | "delete") => void;
  onPreview: (file: DriveFile) => void;
  onDownload: (file: DriveFile) => void;
  onOpenFolder: (file: DriveFile) => void;
  onRename: (file: DriveFile) => void;
}) {
  const isVideo = file.mimeType.startsWith("video/");
  const isImage = file.mimeType.startsWith("image/");
  const isFolder = file.isFolder;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      className={cn(
        "glass-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-200",
        selected
          ? "!border-indigo-400/80 !bg-indigo-500/[0.09] shadow-[0_0_25px_rgba(99,102,241,0.25)] ring-1 ring-indigo-400/50"
          : "border-white/[0.08] !bg-white/[0.03] hover:!bg-white/[0.06] hover:border-indigo-400/30"
      )}
    >
      {/* File Type & Selection Checkbox */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(file.id);
              }}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition",
                selected
                  ? "bg-indigo-600 border-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.6)]"
                  : "bg-white/[0.04] border-white/20 text-transparent hover:border-white/40 hover:text-white/30"
              )}
              title={selected ? "Deselect" : "Select file"}
            >
              <Check className="h-3.5 w-3.5 stroke-[3]" />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] border border-white/10 group-hover:scale-105 transition-transform">
              {isFolder ? (
                <FolderOpen className="h-5 w-5 text-sky-400" />
              ) : isVideo ? (
                <FileVideo className="h-5 w-5 text-indigo-400" />
              ) : isImage ? (
                <FileImage className="h-5 w-5 text-emerald-400" />
              ) : (
                <File className="h-5 w-5 text-white/50" />
              )}
            </div>
          </div>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono text-white/40 uppercase">
            {isFolder ? "Folder" : file.mimeType.split("/").pop() || "file"}
          </span>
        </div>

        <div className="mt-3.5">
          {isFolder ? (
            <button
              onClick={() => onOpenFolder(file)}
              className="text-left font-semibold text-sm text-white/95 hover:text-sky-300 transition line-clamp-1"
            >
              {file.name}
            </button>
          ) : (
            <p className="font-semibold text-sm text-white/90 line-clamp-1" title={file.name}>
              {file.name}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
            <span>{isFolder ? "—" : formatBytes(file.size)}</span>
            <span>•</span>
            <span>{formatDate(file.modifiedTime)}</span>
          </div>
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
        {!isFolder && !isBin ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onPreview(file)}
            icon={<Play className="h-3 w-3" />}
            className="text-xs"
          >
            Play
          </Button>
        ) : isFolder ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onOpenFolder(file)}
            icon={<FolderOpen className="h-3 w-3" />}
            className="text-xs"
          >
            Open
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={working}
            onClick={() => onAction(file, "restore")}
            icon={<RotateCcw className="h-3 w-3" />}
            className="text-xs"
          >
            Restore
          </Button>
        )}

        <div className="flex items-center gap-1">
          {!isFolder && !isBin ? (
            <button
              onClick={() => onDownload(file)}
              title={`Download ${file.name} to PC`}
              className="rounded-lg p-1.5 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-100 transition"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {file.webViewLink ? (
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noreferrer"
              title="Open in Drive"
              className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          {!isBin ? (
            <>
              <button
                disabled={working}
                onClick={() => onRename(file)}
                title="Rename in Google Drive"
                className="rounded-lg p-1.5 text-white/30 hover:bg-cyan-500/15 hover:text-cyan-300 transition"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                disabled={working}
                onClick={() => onAction(file, "trash")}
                title="Move to Bin"
                className="rounded-lg p-1.5 text-white/30 hover:bg-rose-500/15 hover:text-rose-300 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              disabled={working}
              onClick={() => onAction(file, "delete")}
              title="Delete Forever"
              className="rounded-lg p-1.5 text-rose-400/60 hover:bg-rose-500/20 hover:text-rose-200 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FileIcon({ mimeType, isFolder }: { mimeType?: string; isFolder?: boolean }) {
  if (isFolder) return <FolderOpen className="h-4 w-4 text-sky-400" />;
  if (!mimeType) return <File className="h-4 w-4 text-white/50" />;
  if (mimeType.startsWith("video/")) return <FileVideo className="h-4 w-4 text-indigo-400" />;
  if (mimeType.startsWith("audio/")) return <FileAudio className="h-4 w-4 text-violet-400" />;
  if (mimeType.startsWith("image/")) return <FileImage className="h-4 w-4 text-emerald-400" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-amber-400" />;
  return <File className="h-4 w-4 text-white/50" />;
}
