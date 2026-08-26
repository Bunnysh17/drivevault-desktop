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
const standaloneNextStatic = path.join(standaloneDir, ".next", "static");
const rootNextStatic = path.join(root, ".next", "static");
const standalonePublic = path.join(standaloneDir, "public");
const rootPublic = path.join(root, "public");
const standaloneEnv = path.join(standaloneDir, ".env");
const rootEnv = path.join(root, ".env");

console.log("[copy-standalone] Copying .next/static to .next/standalone/.next/static...");
copyDirRecursive(rootNextStatic, standaloneNextStatic);

console.log("[copy-standalone] Copying public to .next/standalone/public...");
copyDirRecursive(rootPublic, standalonePublic);

if (fs.existsSync(rootEnv)) {
  console.log("[copy-standalone] Copying .env to .next/standalone/.env...");
  fs.copyFileSync(rootEnv, standaloneEnv);
}

console.log("[copy-standalone] Standalone bundle successfully prepared!");
