"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FolderPlus, HardDrive, Link2, ShieldCheck, Sparkles, Trash2, CheckCircle2, Video, Cloud, FolderCheck } from "lucide-react";
import { Button, Card, Field, Input, Modal, Switch, cn, Avatar } from "./ui";
import { useAppState } from "./StateProvider";
import { formatBytes } from "@/lib/format";
import { detectMedalCandidates } from "@/lib/client-api";

const STEPS = ["Connect Google Drive", "Bind Backup Folders", "Destination in Drive", "Safety Defaults", "Complete"];

export function SetupWizard() {
  const { snapshot, post, updateSettings } = useAppState();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [folderInput, setFolderInput] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<{ path: string; exists: boolean; fileCount: number; writable: boolean }[]>([]);
  const [driveFolders, setDriveFolders] = useState<{ id: string; name: string }[]>([]);
  const [destId, setDestId] = useState<string>("");
  const [deleteAfter, setDeleteAfter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (snapshot && !snapshot.settings.onboardingComplete) setOpen(true);
  }, [snapshot]);

  const loadCandidates = useCallback(async () => {
    const res = await detectMedalCandidates();
    setCandidates(res.detected ?? []);
  }, []);

  useEffect(() => {
    if (open && step === 1) void loadCandidates();
    if (open && step === 2 && snapshot?.connected) {
      void fetch("/api/drive")
        .then((r) => r.json())
        .then((d) => setDriveFolders(d.folders ?? []))
        .catch(() => undefined);
    }
  }, [open, step, snapshot?.connected, loadCandidates]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth?action=connect");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Google OAuth is not configured on this machine.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not start Google sign-in.");
      setBusy(false);
    }
  };

  const addFolder = async (pathToAdd?: string) => {
    const target = (pathToAdd || folderInput).trim();
    if (!target) return;
    setError(null);
    const res = await post<{ folder?: { path: string } }>("/api/folders", { path: target, isMedalPreset: false });
    if (!res.ok) {
      setError(res.error ?? "Could not add that folder.");
      return;
    }
    if (!selected.includes(target)) {
      setSelected((s) => [...s, target]);
    }
    setFolderInput("");
  };

  const finish = async () => {
    setBusy(true);
    const res = await post("/api/onboarding", {
      folders: selected,
      deleteAfterUpload: deleteAfter,
      autoUpload: true,
      preserveStructure: true,
      notifications: true,
      gamingMode: true,
      uploadExisting: false,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not finish setup.");
      return;
    }
    await updateSettings({ onboardingComplete: true });
    setDone(true);
    setTimeout(() => setOpen(false), 2000);
  };

  if (done) {
    return (
      <Modal open={open} onClose={() => setOpen(false)} title="🎉 DriveVault is Ready">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="rounded-3xl border border-emerald-400/30 bg-emerald-500/15 p-5 text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.3)]"
          >
            <ShieldCheck className="h-10 w-10" />
          </motion.div>
          <div>
            <h3 className="text-xl font-bold text-white">Your PC is Now Protected</h3>
            <p className="max-w-sm mt-2 text-xs leading-relaxed text-white/50">
              DriveVault is watching your bound folders. New recordings and clips are uploaded automatically with zero gaming lag.
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false);
        void updateSettings({ onboardingComplete: true });
      }}
      title="Welcome to DriveVault"
      description="Let's configure your Google Drive backup in 5 quick steps."
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" size="sm" onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={finish} disabled={busy}>
              {busy ? "Activating Engine…" : "Finish & Protect PC"}
            </Button>
          )}
        </div>
      }
    >
      {/* Steps Indicator */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i <= step ? "bg-gradient-to-r from-indigo-500 to-sky-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "bg-white/10"
              )}
            />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -14 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 text-[10px] font-bold uppercase">
              Step {step + 1} of 5
            </span>
            <h4 className="text-base font-bold text-white">{STEPS[step]}</h4>
          </div>

          {/* STEP 1: Connect Drive */}
          {step === 0 ? (
            <div className="mt-4 space-y-3.5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-start gap-3">
                <Cloud className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-white/60">
                  DriveVault securely authenticates with Google Drive using official OAuth 2.0. Your tokens are AES-256 encrypted on this machine and never shared.
                </div>
              </div>
              {snapshot?.connected ? (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-xs text-emerald-200">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-100">Successfully Connected</p>
                    <p className="text-[11px] opacity-80">{snapshot.account?.email ?? "Google Account"}</p>
                  </div>
                </div>
              ) : (
                <Button variant="primary" onClick={connect} disabled={busy} icon={<Link2 className="h-4 w-4" />} className="w-full">
                  {busy ? "Opening Google Sign-In…" : "Sign In with Google"}
                </Button>
              )}
            </div>
          ) : null}

          {/* STEP 2: Choose Backup Folders */}
          {step === 1 ? (
            <div className="mt-4 space-y-3.5">
              <div className="flex gap-2">
                <Input
                  placeholder="C:\Users\Username\Videos\Medal"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addFolder();
                  }}
                />
                <Button variant="secondary" onClick={() => addFolder()} icon={<FolderPlus className="h-4 w-4" />}>
                  Add
                </Button>
              </div>
              {candidates.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Detected on this PC</p>
                  <div className="space-y-1.5">
                    {candidates.map((c) => (
                      <button
                        key={c.path}
                        onClick={() => void addFolder(c.path)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left text-xs text-white/70 transition hover:bg-white/[0.08]"
                      >
                        <span className="truncate font-mono">{c.path}</span>
                        <span className="ml-3 shrink-0 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 text-[10px] font-semibold">
                          +{c.fileCount} clips
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selected.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60">Currently Bound Folders</p>
                  <div className="space-y-1.5">
                    {selected.map((p) => (
                      <div key={p} className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-100 font-mono">
                        <FolderCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="truncate">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* STEP 3: Choose Drive Destination */}
          {step === 2 ? (
            <div className="mt-4 space-y-3.5">
              <p className="text-xs leading-relaxed text-white/50">
                Select an existing folder in your Google Drive or let DriveVault create a dedicated root directory.
              </p>
              <Button
                variant={destId === "create" ? "success" : "secondary"}
                size="sm"
                onClick={async () => {
                  setDestId("create");
                  await post("/api/drive", { folderName: "DriveVault" });
                }}
                icon={<HardDrive className="h-4 w-4" />}
                className="w-full"
              >
                Create Dedicated &quot;DriveVault&quot; Folder in Drive
              </Button>
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
                {driveFolders.map((f) => (
                  <button
                    key={f.id}
                    onClick={async () => {
                      setDestId(f.id);
                      await post("/api/drive", { folderId: f.id });
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs transition",
                      destId === f.id ? "bg-indigo-500/20 text-indigo-100 border border-indigo-400/30" : "text-white/60 hover:bg-white/[0.05]"
                    )}
                  >
                    <span className="truncate font-medium">{f.name}</span>
                    {destId === f.id ? <Check className="h-4 w-4 text-indigo-400" /> : null}
                  </button>
                ))}
                {driveFolders.length === 0 ? <p className="p-3 text-xs text-white/35">Connect Google Drive to list folders.</p> : null}
              </div>
            </div>
          ) : null}

          {/* STEP 4: Safety & Auto-delete */}
          {step === 3 ? (
            <div className="mt-4 space-y-3.5">
              <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div>
                  <p className="text-sm font-semibold text-white/90">Delete Local Copy After Verified Upload</p>
                  <p className="mt-1 text-xs text-white/45 leading-relaxed">
                    Recommended: Keep <strong className="text-white">OFF</strong> initially. You can review uploaded files anytime before freeing disk space.
                  </p>
                </div>
                <Switch checked={deleteAfter} onChange={setDeleteAfter} label="Delete after upload" />
              </div>
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-xs leading-relaxed text-emerald-100 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Integrity Guarantee:</strong> DriveVault will never delete any local file unless its SHA-256 checksum is 100% matched against Google Drive.</span>
              </div>
            </div>
          ) : null}

          {/* STEP 5: Final Review */}
          {step === 4 ? (
            <div className="mt-4 space-y-3.5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Active Configuration</p>
                {[
                  ["Automatic Live Uploads", "ON"],
                  ["Preserve Folder Structure", "ON"],
                  ["Gaming Mode (Zero Lag)", "ON"],
                  ["Delete Local Copies", deleteAfter ? "ON (Verified only)" : "OFF (Safe mode)"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-white/[0.05] pb-2 text-xs last:border-0 last:pb-0">
                    <span className="text-white/60">{k}</span>
                    <span className={v.startsWith("ON") ? "text-emerald-300 font-semibold" : "text-white/40"}>{v}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-white/45">
                {selected.length} folder(s) configured for automatic background sync.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/15 p-3 text-xs text-rose-200">{error}</p>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
