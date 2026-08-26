import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * DriveVault data model.
 *
 * The desktop (Electron) build uses the exact same logical model through
 * SQLite (see `desktop/src/db/schema.sql`), the hosted build uses Postgres.
 */

export const monitoredFolders = pgTable(
  "monitored_folders",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    label: text("label"),
    enabled: boolean("enabled").notNull().default(true),
    autoUpload: boolean("auto_upload").notNull().default(true),
    deleteAfterUpload: boolean("delete_after_upload").notNull().default(false),
    preserveStructure: boolean("preserve_structure").notNull().default(true),
    allowedExtensions: text("allowed_extensions").notNull().default(""),
    ignoreHidden: boolean("ignore_hidden").notNull().default(true),
    minFileSize: bigint("min_file_size", { mode: "number" }).notNull().default(0),
    stabilityWaitMs: integer("stability_wait_ms").notNull().default(5000),
    recursive: boolean("recursive").notNull().default(true),
    isMedalPreset: boolean("is_medal_preset").notNull().default(false),
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    fileCount: integer("file_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("monitored_folders_path_uq").on(table.path)],
);

export const uploadQueue = pgTable(
  "upload_queue",
  {
    id: serial("id").primaryKey(),
    localPath: text("local_path").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    fileHash: text("file_hash"),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sourceFolderId: integer("source_folder_id"),
    sourcePath: text("source_path"),
    relativePath: text("relative_path"),
    destinationFolderId: text("destination_folder_id"),
    destinationPath: text("destination_path"),
    status: text("status").notNull().default("waiting"),
    progress: real("progress").notNull().default(0),
    bytesUploaded: bigint("bytes_uploaded", { mode: "number" }).notNull().default(0),
    speedBps: real("speed_bps").notNull().default(0),
    etaSeconds: integer("eta_seconds"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(5),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    driveFileId: text("drive_file_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    deletedLocally: boolean("deleted_locally").notNull().default(false),
    protected: boolean("protected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("upload_queue_local_path_uq").on(table.localPath),
    index("upload_queue_status_idx").on(table.status),
  ],
);

export const uploadedFiles = pgTable(
  "uploaded_files",
  {
    id: serial("id").primaryKey(),
    queueId: integer("queue_id"),
    driveFileId: text("drive_file_id").notNull(),
    driveFolderId: text("drive_folder_id"),
    drivePath: text("drive_path"),
    fileName: text("file_name").notNull(),
    localPath: text("local_path").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    fileHash: text("file_hash"),
    mimeType: text("mime_type"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    deletedLocallyAt: timestamp("deleted_locally_at", { withTimezone: true }),
    keepLocalUntil: timestamp("keep_local_until", { withTimezone: true }),
  },
  (table) => [index("uploaded_files_local_path_idx").on(table.localPath)],
);

export const driveFolders = pgTable(
  "drive_folders",
  {
    id: serial("id").primaryKey(),
    driveFolderId: text("drive_folder_id").notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    pathKey: text("path_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("drive_folders_path_key_uq").on(table.pathKey)],
);

export const appSettings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: serial("id").primaryKey(),
    queueId: integer("queue_id").notNull(),
    resumableUri: text("resumable_uri").notNull(),
    chunkSize: integer("chunk_size").notNull().default(8 * 1024 * 1024),
    bytesReceived: bigint("bytes_received", { mode: "number" }).notNull().default(0),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("upload_sessions_queue_idx").on(table.queueId)],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    eventType: text("event_type").notNull(),
    filePath: text("file_path"),
    status: text("status"),
    errorCode: text("error_code"),
    message: text("message").notNull(),
    meta: jsonb("meta"),
  },
  (table) => [index("activity_logs_ts_idx").on(table.ts)],
);

export const protectedPaths = pgTable(
  "protected_paths",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    kind: text("kind").notNull().default("file"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("protected_paths_path_uq").on(table.path)],
);

/** Encrypted OAuth credential store. Values are AES-256-GCM sealed, never plaintext. */
export const secureVault = pgTable("secure_vault", {
  key: text("key").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MonitoredFolder = typeof monitoredFolders.$inferSelect;
export type QueueItem = typeof uploadQueue.$inferSelect;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type ProtectedPath = typeof protectedPaths.$inferSelect;
export type UploadSession = typeof uploadSessions.$inferSelect;
