/** Duplicate detection used before a file enters the upload queue. */

export interface DedupeCandidate {
  localPath: string;
  size: number;
  mtimeMs: number;
  hash?: string | null;
}

export interface DedupeRecord {
  id: number;
  localPath: string;
  fileSize: number;
  fileHash?: string | null;
  mtimeMs?: number | null;
  driveFileId?: string | null;
  deletedLocally?: boolean;
  status?: string;
}

export interface DedupeVerdict {
  duplicate: boolean;
  reason: string;
  matchedId?: number;
  matchedDriveFileId?: string | null;
}

function norm(p: string) {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function findDuplicate(
  candidate: DedupeCandidate,
  records: DedupeRecord[],
  opts: { allowDuplicates?: boolean } = {},
): DedupeVerdict {
  if (opts.allowDuplicates) return { duplicate: false, reason: "Duplicate uploads are enabled in settings." };

  const path = norm(candidate.localPath);

  // 1) Same path, same size, same mtime => the exact same file.
  const exact = records.find(
    (r) =>
      norm(r.localPath) === path &&
      r.fileSize === candidate.size &&
      (r.mtimeMs === undefined || r.mtimeMs === null || Math.abs(r.mtimeMs - candidate.mtimeMs) < 1500),
  );
  if (exact) {
    return {
      duplicate: true,
      reason: "This exact file was already backed up from the same location.",
      matchedId: exact.id,
      matchedDriveFileId: exact.driveFileId ?? null,
    };
  }

  // 2) Same content hash => moved/renamed copy already backed up.
  if (candidate.hash) {
    const byHash = records.find((r) => r.fileHash && r.fileHash === candidate.hash && r.fileSize === candidate.size);
    if (byHash) {
      return {
        duplicate: true,
        reason: "Identical content was already backed up (hash match).",
        matchedId: byHash.id,
        matchedDriveFileId: byHash.driveFileId ?? null,
      };
    }
  }

  // 3) Same path + same size but modified => re-upload as a new version.
  const samePath = records.find((r) => norm(r.localPath) === path && r.fileSize === candidate.size);
  if (samePath) {
    return { duplicate: false, reason: "File changed since the last backup — uploading a new version." };
  }

  return { duplicate: false, reason: "No previous backup found." };
}

/** Exponential backoff with jitter, capped. */
export function backoffDelay(attempt: number, baseMs: number, factor = 2, capMs = 15 * 60_000): number {
  const exp = Math.min(capMs, baseMs * Math.pow(factor, Math.max(0, attempt - 1)));
  const jitter = Math.round(exp * 0.15 * Math.random());
  return Math.min(capMs, Math.round(exp + jitter));
}
