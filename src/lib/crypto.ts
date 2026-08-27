import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Secure vault: OAuth tokens are sealed with AES-256-GCM before they ever
 * touch the database. The vault key lives outside of the database in
 * `DRIVEVAULT_VAULT_KEY`, and falls back to a machine-local keyfile for
 * development so nothing is ever stored in plaintext.
 */

function getVaultKeyPath(): string {
  const base = process.env.APPDATA || process.env.USERPROFILE || process.cwd();
  return path.join(base, "DriveVault", "vault.key");
}

function loadVaultKey(): Buffer {
  const fromEnv = process.env.DRIVEVAULT_VAULT_KEY;
  if (fromEnv && fromEnv.length >= 32) {
    return crypto.createHash("sha256").update(fromEnv).digest();
  }
  const legacy = process.env.DRIVEVAULT_VAULT_KEY_UNSAFE;
  if (legacy) {
    return crypto.createHash("sha256").update(legacy).digest();
  }
  try {
    const keyPath = getVaultKeyPath();
    if (fs.existsSync(keyPath)) {
      return Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "hex");
    }
    const key = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
    return key;
  } catch {
    // Last resort for read-only filesystems: derive from a stable machine id.
    return crypto
      .createHash("sha256")
      .update(`${process.env.HOSTNAME ?? "drivevault"}:${process.env.USER ?? "local"}`)
      .digest();
  }
}

export function seal(plain: string): string {
  const key = loadVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function open(sealed: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = sealed.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const key = loadVaultKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
