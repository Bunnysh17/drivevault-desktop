/**
 * Data-safety core. The single most important rule of DriveVault:
 * a local file may only become eligible for automatic deletion AFTER the
 * complete file has been verified to exist in Google Drive.
 */

export interface DeletionCandidateInput {
  localPath: string;
  /** Upload verified in Drive (file fetched back by id and size matched). */
  verified: boolean;
  driveFileId: string | null;
  uploadedAt: string | null;
  exists: boolean;
  protectedPaths: string[];
  /** Global "Never delete local files automatically" kill-switch. */
  neverDeleteAutomatically: boolean;
  /** Auto-delete requested (global setting or per-folder toggle). */
  autoDeleteEnabled: boolean;
  /** Keep a local copy for N days; 0 = forever. */
  keepLocalDays: number;
  now?: Date;
}

export interface DeletionVerdict {
  safe: boolean;
  reason: string;
}

export function normalizeForCompare(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function isPathProtected(filePath: string, protectedPaths: string[]): boolean {
  const target = normalizeForCompare(filePath);
  const targetSegments = target.split("/").filter(Boolean);
  for (const protectedPath of protectedPaths) {
    const p = normalizeForCompare(protectedPath);
    if (!p) continue;
    if (target === p) return true;
    if (target.startsWith(`${p}/`)) return true;
    // A protected entry may also be a single file name (e.g. "clip.mp4").
    const segments = p.split("/").filter(Boolean);
    if (segments.length === 1 && targetSegments[targetSegments.length - 1] === segments[0]) return true;
  }
  return false;
}

export function evaluateDeletion(input: DeletionCandidateInput): DeletionVerdict {
  const now = input.now ?? new Date();

  if (!input.exists) return { safe: false, reason: "File no longer exists on this PC." };
  if (!input.driveFileId) return { safe: false, reason: "No Google Drive file is linked to this file." };
  if (!input.uploadedAt) return { safe: false, reason: "Upload has not finished." };
  if (!input.verified) {
    return { safe: false, reason: "Not safe yet: the upload has not been verified in Google Drive." };
  }
  if (isPathProtected(input.localPath, input.protectedPaths)) {
    return { safe: false, reason: "Protected: this file is marked Protected and will never be deleted automatically." };
  }
  if (input.neverDeleteAutomatically) {
    return { safe: false, reason: "Global safety switch is on: local files are never deleted automatically." };
  }
  if (!input.autoDeleteEnabled) {
    return { safe: false, reason: "Automatic deletion is turned off. You can still delete it manually." };
  }
  if (input.keepLocalDays > 0 && input.uploadedAt) {
    const uploaded = new Date(input.uploadedAt).getTime();
    const days = (now.getTime() - uploaded) / 86_400_000;
    if (days < input.keepLocalDays) {
      const remaining = Math.ceil(input.keepLocalDays - days);
      return { safe: false, reason: `Keep-local period active: ${remaining} day(s) remaining.` };
    }
  }
  return { safe: true, reason: "Verified in Google Drive and eligible for local deletion." };
}
