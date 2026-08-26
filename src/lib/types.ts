export type QueueStatus =
  | "waiting"
  | "preparing"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "retrying"
  | "deleted_locally"
  | "canceled"
  | "skipped";

export const QUEUE_STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting",
  preparing: "Preparing",
  uploading: "Uploading",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  retrying: "Retrying",
  deleted_locally: "Deleted locally",
  canceled: "Canceled",
  skipped: "Skipped (duplicate)",
};

export type ThemeMode =
  | "dark"
  | "celestial"
  | "emerald"
  | "butterfly"
  | "firefly"
  | "neon"
  | "ocean"
  | "forest"
  | "light"
  | "system";

export interface AppSettings {
  // General
  startWithWindows: boolean;
  minimizeToTray: boolean;
  launchMinimized: boolean;
  notifications: boolean;
  notifyOnComplete: boolean;
  notifyOnFail: boolean;
  notifyQueueEmpty: boolean;
  notifyStorageLow: boolean;

  // Upload
  concurrentUploads: number;
  uploadSpeedLimitKbps: number; // 0 = unlimited
  chunkSizeMb: number;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffFactor: number;

  // Backup
  defaultDriveFolderId: string;
  defaultDriveFolderName: string;
  preserveStructure: boolean;
  uploadDuplicates: boolean;
  stabilityDelayMs: number;
  allowedExtensions: string;
  ignoreHidden: boolean;
  minFileSizeMb: number;
  hashBeforeUpload: boolean;

  // Storage
  deleteAfterUpload: boolean;
  askBeforeDeleting: boolean;
  keepLocalDays: number; // 0 = forever
  storageThresholdPercent: number;

  // Gaming mode
  gamingMode: boolean;
  gameProcesses: string;
  gamingModeAction: "pause" | "slow";

  // Appearance
  theme: ThemeMode;
  compactMode: boolean;

  // Safety
  neverDeleteAutomatically: boolean;

  // Onboarding
  onboardingComplete: boolean;

  // Persisted Pause State
  enginePaused: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  startWithWindows: false,
  minimizeToTray: true,
  launchMinimized: false,
  notifications: true,
  notifyOnComplete: true,
  notifyOnFail: true,
  notifyQueueEmpty: true,
  notifyStorageLow: true,
  enginePaused: false,

  concurrentUploads: 1,
  uploadSpeedLimitKbps: 0,
  chunkSizeMb: 32,
  maxRetries: 5,
  retryDelayMs: 5000,
  retryBackoffFactor: 2,

  defaultDriveFolderId: "",
  defaultDriveFolderName: "DriveVault",
  preserveStructure: true,
  uploadDuplicates: false,
  stabilityDelayMs: 5000,
  allowedExtensions: "*",
  ignoreHidden: true,
  minFileSizeMb: 0,
  hashBeforeUpload: false,

  deleteAfterUpload: false,
  askBeforeDeleting: true,
  keepLocalDays: 0,
  storageThresholdPercent: 90,

  gamingMode: true,
  gameProcesses: "Minecraft, VALORANT, VALORANT-Win64-Shipping, ffxiv_dx11, GenshinImpact",
  gamingModeAction: "pause",

  theme: "dark",
  compactMode: false,

  neverDeleteAutomatically: false,

  onboardingComplete: false,
};

export interface StorageInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
}

export interface DriveStorageInfo {
  limitBytes: number;
  usageBytes: number;
  driveUsageBytes: number;
  remainingBytes: number;
  connected: boolean;
}

export interface DashboardSnapshot {
  generatedAt: string;
  connected: boolean;
  account: { email: string | null; name: string | null; picture: string | null } | null;
  authError: string | null;
  engine: {
    running: boolean;
    paused: boolean;
    gamingMode: boolean;
    gamingDetected: boolean;
    matchedGames: string[];
    activeUploads: number;
    queuedCount: number;
  };
  local: StorageInfo;
  drive: DriveStorageInfo;
  currentUpload: QueueItemDTO | null;
  stats: {
    filesUploaded: number;
    totalCloudBytes: number;
    uploadedToday: number;
    uploadedTodayBytes: number;
    uploadedWeek: number;
    uploadedWeekBytes: number;
    failed: number;
    spaceFreedBytes: number;
    potentialFreeBytes: number;
    pendingCount: number;
    completedCount: number;
    totalQueueCount: number;
    remainingBytes: number;
    activeSpeedBps: number;
    categories: {
      videos: { bytes: number; count: number; pct: number };
      images: { bytes: number; count: number; pct: number };
      docs: { bytes: number; count: number; pct: number };
      others: { bytes: number; count: number; pct: number };
    };
  };
  queue: QueueItemDTO[];
  folders: FolderDTO[];
  recent: ActivityDTO[];
  settings: AppSettings;
  notifications: ToastDTO[];
}

export interface QueueItemDTO {
  id: number;
  localPath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sourcePath: string | null;
  relativePath: string | null;
  status: string;
  progress: number;
  bytesUploaded: number;
  speedBps: number;
  etaSeconds: number | null;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  driveFileId: string | null;
  deletedLocally: boolean;
  protected: boolean;
  createdAt: string | null;
  completedAt: string | null;
}

export interface FolderDTO {
  id: number;
  path: string;
  label: string | null;
  enabled: boolean;
  autoUpload: boolean;
  deleteAfterUpload: boolean;
  preserveStructure: boolean;
  allowedExtensions: string;
  ignoreHidden: boolean;
  minFileSize: number;
  stabilityWaitMs: number;
  recursive: boolean;
  isMedalPreset: boolean;
  fileCount: number;
  lastScanAt: string | null;
  exists: boolean;
}

export interface ActivityDTO {
  id: number;
  ts: string;
  eventType: string;
  filePath: string | null;
  status: string | null;
  errorCode: string | null;
  message: string;
}

export interface ToastDTO {
  id: string;
  title: string;
  body: string;
  level: "info" | "success" | "warn" | "error";
  createdAt: string;
}

export interface CleanupCandidate {
  queueId: number;
  localPath: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  driveFileId: string;
  verified: boolean;
  protected: boolean;
  safe: boolean;
  reason: string;
  exists: boolean;
  keepLocalUntil: string | null;
}
