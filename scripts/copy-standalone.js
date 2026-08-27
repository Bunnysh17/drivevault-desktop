const fs = require("fs");
const path = require("path");

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

// 1. Copy .next/static → .next/standalone/.next/static
const standaloneNextStatic = path.join(standaloneDir, ".next", "static");
const rootNextStatic = path.join(root, ".next", "static");
console.log("[copy-standalone] Copying .next/static to .next/standalone/.next/static...");
copyDirRecursive(rootNextStatic, standaloneNextStatic);

// 2. Copy public → .next/standalone/public
const standalonePublic = path.join(standaloneDir, "public");
const rootPublic = path.join(root, "public");
console.log("[copy-standalone] Copying public to .next/standalone/public...");
copyDirRecursive(rootPublic, standalonePublic);

// 3. Copy .env → .next/standalone/.env
const standaloneEnv = path.join(standaloneDir, ".env");
const rootEnv = path.join(root, ".env");
if (fs.existsSync(rootEnv)) {
  console.log("[copy-standalone] Copying .env to .next/standalone/.env...");
  fs.copyFileSync(rootEnv, standaloneEnv);
}

// 4. Ensure critical node_modules that are serverExternalPackages are in standalone
const criticalPackages = [
  "pg", "pg-pool", "pg-types", "pg-protocol", "pg-connection-string",
  "pgpass", "pg-int8", "postgres-array", "postgres-bytea", "postgres-date",
  "postgres-interval", "postgres-range", "obuf", "packet-reader",
  "drizzle-orm", "chokidar", "googleapis", "google-auth-library",
  "dotenv",
];

const standaloneNodeModules = path.join(standaloneDir, "node_modules");
const rootNodeModules = path.join(root, "node_modules");

let copiedCount = 0;
for (const pkg of criticalPackages) {
  const src = path.join(rootNodeModules, pkg);
  const dest = path.join(standaloneNodeModules, pkg);
  if (fs.existsSync(src) && !fs.existsSync(dest)) {
    console.log(`[copy-standalone] Copying missing package: ${pkg}`);
    copyDirRecursive(src, dest);
    copiedCount++;
  }
}

if (copiedCount > 0) {
  console.log(`[copy-standalone] Copied ${copiedCount} missing packages to standalone/node_modules`);
} else {
  console.log("[copy-standalone] All critical packages already present in standalone");
}

// 5. Verify standalone has server.js
const serverJs = path.join(standaloneDir, "server.js");
if (fs.existsSync(serverJs)) {
  console.log("[copy-standalone] ✓ server.js found in standalone");
} else {
  console.error("[copy-standalone] ✗ WARNING: server.js NOT found in standalone!");
}

console.log("[copy-standalone] Standalone bundle successfully prepared!");
