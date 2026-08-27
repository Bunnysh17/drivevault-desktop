"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  Cloud,
  Cog,
  Download,
  Gamepad2,
  HardDrive,
  Link2,
  LogOut,
  Monitor,
  Palette,
  RefreshCw,
  ShieldCheck,
  Upload,
  Check,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAppState } from "@/components/StateProvider";
import { Button, Card, Field, Input, SectionTitle, Select, TextArea, ToggleRow, Avatar, cn, Modal } from "@/components/ui";
import { THEMES } from "@/components/ThemeSelectorModal";
import { fetchDriveFolders } from "@/lib/client-api";
import { formatBytes } from "@/lib/format";
import { playSfx } from "@/lib/sound";
import type { ThemeMode } from "@/lib/types";

export default function SettingsPage() {
  const { snapshot, post, updateSettings } = useAppState();
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (snapshot?.connected) {
      void fetchDriveFolders()
        .then((d) => setFolders(d.folders ?? []))
        .catch(() => undefined);
    }
  }, [snapshot?.connected]);

  if (!snapshot) return <div className="py-24 text-center text-sm text-white/40">Loading settings…</div>;
  const s = snapshot.settings;

  const handleThemeChange = (themeId: ThemeMode) => {
    playSfx("theme");
    // 1. Instant 0ms synchronous DOM update
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-theme", themeId);
      document.documentElement.setAttribute("data-theme", themeId);
      localStorage.setItem("drivevault_theme", themeId);
    }
    // 2. Persist in database and state
    void updateSettings({ theme: themeId });
  };

  const connect = async () => {
    setAuthBusy(true);
    setAuthMessage(null);
    const res = await fetch("/api/auth?action=connect");
    const data = await res.json();
    if (!res.ok) {
      setAuthMessage(data.error ?? "Google OAuth is not configured on this machine.");
      setAuthBusy(false);
      return;
    }
    window.location.href = data.url;
  };

  const disconnect = async () => {
    await post("/api/auth", { revoke: true }, "DELETE");
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Settings & Profile</h1>
        <p className="mt-1 text-sm text-white/50">Personalize your themes, Google Drive sync, gaming mode & storage rules.</p>
      </div>

      {/* ═══════ THEME SELECTOR ═══════ */}
      <Card delay={0.02}>
        <SectionTitle
          title="App Themes & Anime Artwork"
          subtitle="Choose your favorite visual style — click any theme to apply instantly with 0ms delay."
          right={<Palette className="h-4 w-4 text-indigo-400" />}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {THEMES.map((theme) => {
            const isSelected = s.theme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleThemeChange(theme.id)}
                className={cn(
                  "relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 group min-h-[140px]",
                  isSelected
                    ? "border-indigo-400 bg-indigo-500/[0.14] shadow-[0_0_24px_rgba(99,102,241,0.3)] ring-2 ring-indigo-400/60"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/25"
                )}
              >
                {/* Background Artwork Preview if exists */}
                {theme.image ? (
                  <div className="absolute inset-0 z-0 overflow-hidden">
                    <img
                      src={theme.image}
                      alt={theme.name}
                      className="h-full w-full object-cover object-center opacity-25 transition-transform duration-500 group-hover:scale-110 group-hover:opacity-35"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#090d16] via-[#090d16]/75 to-transparent" />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-20 bg-gradient-to-br",
                      theme.gradient
                    )}
                  />
                )}

                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-sm text-white group-hover:text-indigo-200 transition">
                        {theme.name}
                      </span>
                      {theme.tag && (
                        <span className="ml-2 inline-block rounded-full bg-white/10 px-2 py-0.2 text-[9px] font-semibold text-white/70">
                          {theme.tag}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white shadow">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-white/50 leading-relaxed line-clamp-2">{theme.description}</p>
                </div>

                <div className="relative z-10 mt-3 flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shadow-sm"
                      style={{ backgroundColor: theme.accentColor }}
                    />
                    <span className="text-[10px] text-white/40 font-mono capitalize">
                      {theme.category}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-semibold text-indigo-300">
                      Active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ═══════ GOOGLE PROFILE ═══════ */}
      <Card delay={0.06}>
        <SectionTitle
          title="Google Drive Account"
          subtitle="Tokens are encrypted with AES-256-GCM and persisted on your device."
          right={<Cloud className="h-4 w-4 text-white/30" />}
        />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          {snapshot.connected ? (
            <div className="flex items-center gap-3.5">
              <Avatar
                src={snapshot.account?.picture}
                name={snapshot.account?.name || snapshot.account?.email}
                size={52}
              />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-white">{snapshot.account?.name ?? "Google User"}</p>
                  <span className="rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-semibold">
                    Connected
                  </span>
                </div>
                <p className="text-xs text-white/50">{snapshot.account?.email ?? "—"}</p>
                <p className="mt-1 text-[11px] text-white/35">
                  Backup Destination: <strong className="text-white/70">{s.defaultDriveFolderName || "DriveVault (auto-created)"}</strong>
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-white/85">No Google account connected</p>
              <p className="text-xs text-white/45 mt-0.5">{snapshot.authError ?? "Connect your Google account to enable cloud storage."}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {snapshot.connected ? (
              <>
                <Button variant="secondary" onClick={connect} icon={<RefreshCw className="h-4 w-4" />}>
                  Reconnect
                </Button>
                <Button variant="danger" onClick={disconnect} icon={<LogOut className="h-4 w-4" />}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={connect} disabled={authBusy} icon={<Link2 className="h-4 w-4" />}>
                {authBusy ? "Opening Google…" : "Connect Google Drive"}
              </Button>
            )}
          </div>
        </div>

        {authMessage ? (
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
            <p className="font-medium">Google Credentials Notice</p>
            <p className="mt-1 opacity-85">{authMessage}</p>
          </div>
        ) : null}

        {snapshot.connected ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Backup Destination Folder">
              <Select
                value={s.defaultDriveFolderId || ""}
                onChange={async (e) => {
                  const id = e.target.value;
                  if (id === "__create") await post("/api/drive", { folderName: "DriveVault" });
                  else await post("/api/drive", { folderId: id });
                }}
              >
                <option value="">DriveVault (Auto-created in My Drive)</option>
                <option value="__create">Create &quot;DriveVault&quot; Folder Now</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Google Drive Available Storage">
              <div className="rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5 text-sm text-white/70">
                {snapshot.drive.connected
                  ? `${formatBytes(snapshot.drive.remainingBytes)} free of ${formatBytes(snapshot.drive.limitBytes)}`
                  : "Not available"}
              </div>
            </Field>
          </div>
        ) : null}
      </Card>

      {/* ═══════ BACKUP SETTINGS ═══════ */}
      <Card delay={0.1}>
        <SectionTitle title="Backup Rules" right={<HardDrive className="h-4 w-4 text-white/30" />} />
        <div className="grid gap-2">
          <ToggleRow title="Preserve Folder Structure" description="Recreate subfolders from the watched root inside DriveVault." checked={s.preserveStructure} onChange={(v) => void updateSettings({ preserveStructure: v })} />
          <ToggleRow title="Upload Duplicate Files" description="Off = skip files already backed up from the same path/size/content." checked={s.uploadDuplicates} onChange={(v) => void updateSettings({ uploadDuplicates: v })} />
          <ToggleRow title="Ignore Hidden Files" description="Skip files and directories beginning with a dot." checked={s.ignoreHidden} onChange={(v) => void updateSettings({ ignoreHidden: v })} />
          <ToggleRow title="Hash Files Before Upload (SHA-256)" description="Strongest duplicate detection, slower for giant files." checked={s.hashBeforeUpload} onChange={(v) => void updateSettings({ hashBeforeUpload: v })} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Allowed File Extensions" hint="* = All file formats (.txt, .pdf, .docx, .png, .mp4, etc.)">
            <Input placeholder="* (All files)" value={s.allowedExtensions} onChange={(e) => void updateSettings({ allowedExtensions: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min File Size (MB)" hint="0 = Any size (even small KBs)">
              <Input type="number" min={0} step={0.1} value={s.minFileSizeMb} onChange={(e) => void updateSettings({ minFileSizeMb: Number(e.target.value) })} />
            </Field>
            <Field label="Stability Wait (ms)" hint="Stop writing wait time">
              <Input type="number" min={500} step={500} value={s.stabilityDelayMs} onChange={(e) => void updateSettings({ stabilityDelayMs: Number(e.target.value) })} />
            </Field>
          </div>
        </div>
      </Card>

      {/* ═══════ STORAGE SAFETY SWITCHES ═══════ */}
      <Card delay={0.14}>
        <SectionTitle title="Storage Safety" right={<ShieldCheck className="h-4 w-4 text-emerald-400" />} />
        <div className="grid gap-2">
          <ToggleRow
            title="Never Delete Local Files Automatically"
            description="Master safety switch — guarantees no file on your PC will be deleted without your manual tap."
            checked={s.neverDeleteAutomatically}
            onChange={(v) => void updateSettings({ neverDeleteAutomatically: v })}
            badge={<span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">Recommended</span>}
          />
          <ToggleRow title="Delete After Upload" description="Only ever after the file is confirmed & verified in Google Drive." checked={s.deleteAfterUpload} onChange={(v) => void updateSettings({ deleteAfterUpload: v })} />
          <ToggleRow title="Ask Before Deleting" description="Always show confirmation modal before deleting local copies." checked={s.askBeforeDeleting} onChange={(v) => void updateSettings({ askBeforeDeleting: v })} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Keep Local Copy For (Days)" hint="0 = keep forever">
            <Input type="number" min={0} value={s.keepLocalDays} onChange={(e) => void updateSettings({ keepLocalDays: Number(e.target.value) })} />
          </Field>
          <Field label="Storage Alert Threshold (%)">
            <Input type="number" min={50} max={99} value={s.storageThresholdPercent} onChange={(e) => void updateSettings({ storageThresholdPercent: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      {/* ═══════ GAMING MODE ═══════ */}
      <Card delay={0.18}>
        <SectionTitle title="Gaming Mode" subtitle="Zero lag: pauses or reduces bandwidth when your favorite games run." right={<Gamepad2 className="h-4 w-4 text-amber-400" />} />
        <ToggleRow title="Enable Gaming Mode" description="Automatically throttles backup when game processes are detected." checked={s.gamingMode} onChange={(v) => void updateSettings({ gamingMode: v })} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Game Process Names" hint="Comma-separated .exe process names">
            <TextArea rows={3} value={s.gameProcesses} onChange={(e) => void updateSettings({ gameProcesses: e.target.value })} />
          </Field>
          <Field label="Action While Gaming">
            <Select value={s.gamingModeAction} onChange={(e) => void updateSettings({ gamingModeAction: e.target.value as "pause" | "slow" })}>
              <option value="pause">Pause all uploads immediately</option>
              <option value="slow">Reduce to single low-speed stream</option>
            </Select>
          </Field>
        </div>
        {snapshot.engine.gamingDetected ? (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-100">
            Gaming Mode is active right now ({snapshot.engine.matchedGames?.join(", ") ?? "game running"}).
          </p>
        ) : null}
      </Card>

      {/* ═══════ NETWORK & UPLOADER ═══════ */}
      <Card delay={0.22}>
        <SectionTitle title="Network & Upload Engine" right={<Upload className="h-4 w-4 text-white/30" />} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Concurrent Uploads (Parallel Streams)">
            <Input type="number" min={1} max={16} value={s.concurrentUploads} onChange={(e) => void updateSettings({ concurrentUploads: Number(e.target.value) })} />
          </Field>
          <Field label="Speed Limit (KB/s)" hint="0 = unlimited full speed">
            <Input type="number" min={0} value={s.uploadSpeedLimitKbps} onChange={(e) => void updateSettings({ uploadSpeedLimitKbps: Number(e.target.value) })} />
          </Field>
          <Field label="Resumable Chunk Size (MB)">
            <Input type="number" min={1} max={128} value={s.chunkSizeMb} onChange={(e) => void updateSettings({ chunkSizeMb: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      {/* ═══════ DIAGNOSTICS & EXPORT ═══════ */}
      <Card delay={0.26}>
        <SectionTitle title="Diagnostics & Maintenance" right={<Bell className="h-4 w-4 text-white/30" />} />
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={() => {
              window.location.href = "/api/logs?export=1";
            }}
          >
            Export Logs
          </Button>
          <Button variant="secondary" onClick={() => post("/api/engine", { action: "refresh" })}>
            Refresh Watchers
          </Button>
          <Button
            variant="danger"
            onClick={() => setResetOpen(true)}
          >
            Reset Settings
          </Button>
        </div>
      </Card>

      {/* Professional Reset Settings Modal */}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Restore Default Settings?"
        description="This will reset all application preferences, upload rules, and gaming modes to defaults."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await post("/api/settings", undefined, "DELETE");
                setResetOpen(false);
              }}
            >
              Reset to Defaults
            </Button>
          </>
        }
      >
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] p-4 text-xs text-amber-200 leading-relaxed">
          Your bound folders and Google Drive cloud files will <strong>NOT</strong> be deleted. Only settings (themes, concurrency, limits) will be reset.
        </div>
      </Modal>
    </div>
  );
}
