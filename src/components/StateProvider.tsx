"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import type { AppSettings, DashboardSnapshot, ThemeMode } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface StateContextValue {
  snapshot: DashboardSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  post: <T = unknown>(url: string, body?: unknown, method?: string) => Promise<ApiResult<T>>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  dismissToast: (id: string) => void;
  lastUpdate: number | null;
}

const StateContext = createContext<StateContextValue | null>(null);

export function useAppState() {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useAppState must be used inside StateProvider");
  return ctx;
}

export function StateProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("DriveVault service is not responding.");
      const data = (await res.json()) as DashboardSnapshot;
      setSnapshot(data);
      setLastUpdate(Date.now());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  const post = useCallback(async <T,>(url: string, body?: unknown, method = "POST"): Promise<ApiResult<T>> => {
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) return { ok: false, error: data?.error ?? `Request failed (${res.status})` };
      await refresh();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }, [refresh]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      setSnapshot((prev) =>
        prev ? { ...prev, settings: { ...prev.settings, ...patch } } : prev,
      );
      const res = await post<{ settings: AppSettings }>("/api/settings", patch, "PUT");
      if (res.data?.settings) {
        setSnapshot((prev) => (prev ? { ...prev, settings: res.data!.settings } : prev));
      }
    },
    [post],
  );

  // Polling: 1s while uploading/queued, 3s when idle
  useEffect(() => {
    void refresh();
    const hasQueue = Boolean(
      (snapshot?.stats?.pendingCount && snapshot.stats.pendingCount > 0) ||
      snapshot?.queue.some((q) => ["uploading", "preparing", "waiting", "retrying"].includes(q.status)) ||
      (snapshot?.engine?.activeUploads && snapshot.engine.activeUploads > 0)
    );
    const id = setInterval(() => void refresh(), hasQueue ? 1000 : 3000);
    return () => clearInterval(id);
  }, [refresh, snapshot?.queue, snapshot?.engine?.activeUploads, snapshot?.stats?.pendingCount]);

  // Theme + compact mode
  useEffect(() => {
    const cachedTheme = typeof window !== "undefined" ? (localStorage.getItem("drivevault_theme") as ThemeMode) : null;
    const theme = snapshot?.settings.theme ?? cachedTheme ?? DEFAULT_SETTINGS.theme;
    const root = document.documentElement;
    const apply = (mode: Exclude<ThemeMode, "system">) => {
      root.classList.toggle("dark", mode !== "light");
      root.dataset.theme = mode;
      root.style.colorScheme = mode === "light" ? "light" : "dark";
      document.body.dataset.theme = mode;
      try {
        localStorage.setItem("drivevault_theme", mode);
      } catch {
        // ignore
      }
    };
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    apply(theme);
  }, [snapshot?.settings.theme]);

  useEffect(() => {
    document.body.dataset.compact = snapshot?.settings.compactMode ? "true" : "false";
  }, [snapshot?.settings.compactMode]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const value = useMemo<StateContextValue>(
    () => ({
      snapshot,
      loading,
      error,
      refresh,
      post,
      updateSettings,
      dismissToast: (id: string) => setDismissed((d) => [...d, id]),
      lastUpdate,
    }),
    [snapshot, loading, error, refresh, post, updateSettings, lastUpdate],
  );

  const visibleToasts = (snapshot?.notifications ?? []).filter((t) => !dismissed.includes(t.id));

  return (
    <StateContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(380px,calc(100vw-2.5rem))] flex-col gap-2.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleToasts.slice(0, 2).map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.92, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: 50, scale: 0.88, filter: "blur(6px)", transition: { duration: 0.28, ease: "easeInOut" } }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
            >
              <Toast toast={toast} onClose={() => setDismissed((d) => [...d, toast.id])} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </StateContext.Provider>
  );
}

function Toast({
  toast,
  onClose,
}: {
  toast: { title: string; body: string; level: string; id: string };
  onClose: () => void;
}) {
  const styles: Record<string, { card: string; icon: ReactNode; bar: string }> = {
    info: {
      card: "border-sky-500/25 bg-[#0b1220]/90 text-sky-100 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_15px_rgba(56,189,248,0.12)]",
      icon: <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />,
      bar: "bg-sky-400",
    },
    success: {
      card: "border-emerald-500/30 bg-[#071714]/90 text-emerald-100 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(16,185,129,0.15)]",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />,
      bar: "bg-emerald-400",
    },
    warn: {
      card: "border-amber-500/30 bg-[#1a1407]/90 text-amber-100 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(245,158,11,0.15)]",
      icon: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />,
      bar: "bg-amber-400",
    },
    error: {
      card: "border-rose-500/30 bg-[#1c0b0e]/90 text-rose-100 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(244,63,94,0.15)]",
      icon: <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />,
      bar: "bg-rose-400",
    },
  };

  const current = styles[toast.level] ?? styles.info;
  const duration = toast.level === "success" ? 3800 : toast.level === "info" ? 4200 : 6000;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = setTimeout(() => onCloseRef.current(), duration);
    return () => clearTimeout(id);
  }, [toast.id, duration]);

  return (
    <div
      className={`pointer-events-auto relative overflow-hidden rounded-2xl border p-3.5 backdrop-blur-2xl transition-all ${current.card}`}
    >
      <div className="flex items-start gap-3">
        {current.icon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-tight">{toast.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed opacity-85 line-clamp-2">{toast.body}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-white/40 transition hover:bg-white/10 hover:text-white shrink-0"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Subtle bottom progress countdown bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
        <motion.div
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: duration / 1000, ease: "linear" }}
          className={`h-full opacity-60 ${current.bar}`}
        />
      </div>
    </div>
  );
}
