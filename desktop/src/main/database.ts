import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

/**
 * SQLite layer for the desktop build. Migrations run in order and are
 * idempotent so upgrading never loses the queue.
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS monitored_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        label TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        auto_upload INTEGER NOT NULL DEFAULT 1,
        delete_after_upload INTEGER NOT NULL DEFAULT 0,
        preserve_structure INTEGER NOT NULL DEFAULT 1,
        allowed_extensions TEXT NOT NULL DEFAULT '',
        ignore_hidden INTEGER NOT NULL DEFAULT 1,
        min_file_size INTEGER NOT NULL DEFAULT 0,
        stability_wait_ms INTEGER NOT NULL DEFAULT 5000,
        recursive INTEGER NOT NULL DEFAULT 1,
        is_medal_preset INTEGER NOT NULL DEFAULT 0,
        last_scan_at TEXT,
        file_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS upload_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_hash TEXT,
        mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        source_folder_id INTEGER,
        source_path TEXT,
        relative_path TEXT,
        destination_folder_id TEXT,
        destination_path TEXT,
        status TEXT NOT NULL DEFAULT 'waiting',
        progress REAL NOT NULL DEFAULT 0,
        bytes_uploaded INTEGER NOT NULL DEFAULT 0,
        speed_bps REAL NOT NULL DEFAULT 0,
        eta_seconds INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 5,
        error_code TEXT,
        error_message TEXT,
        next_attempt_at TEXT,
        drive_file_id TEXT,
        verified_at TEXT,
        deleted_locally INTEGER NOT NULL DEFAULT 0,
        protected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_queue_status ON upload_queue(status);

      CREATE TABLE IF NOT EXISTS uploaded_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_id INTEGER,
        drive_file_id TEXT NOT NULL,
        drive_folder_id TEXT,
        drive_path TEXT,
        file_name TEXT NOT NULL,
        local_path TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_hash TEXT,
        mime_type TEXT,
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
        verified_at TEXT,
        deleted_locally_at TEXT,
        keep_local_until TEXT
      );

      CREATE TABLE IF NOT EXISTS drive_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drive_folder_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        path_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS upload_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_id INTEGER NOT NULL,
        resumable_uri TEXT NOT NULL,
        chunk_size INTEGER NOT NULL DEFAULT 8388608,
        bytes_received INTEGER NOT NULL DEFAULT 0,
        file_size INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL DEFAULT (datetime('now')),
        event_type TEXT NOT NULL,
        file_path TEXT,
        status TEXT,
        error_code TEXT,
        message TEXT NOT NULL,
        meta TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_logs_ts ON activity_logs(ts);

      CREATE TABLE IF NOT EXISTS protected_paths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL DEFAULT 'file',
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS secure_vault (
        key TEXT PRIMARY KEY,
        ciphertext TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];

let dbInstance: Database.Database | null = null;

export function dbPath(): string {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "drivevault.db");
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const database = new Database(dbPath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  const applied = new Set(
    database.prepare("SELECT version FROM schema_migrations").all().map((r) => (r as { version: number }).version),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
    })();
  }
  dbInstance = database;
  return database;
}
