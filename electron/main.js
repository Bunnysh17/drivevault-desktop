const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const dotenv = require("dotenv");

// Ensure .env variables are loaded in packaged Electron environment
const rootEnvPath = path.resolve(__dirname, "..", ".env");
const resEnvPath = process.resourcesPath ? path.join(process.resourcesPath, ".env") : rootEnvPath;
const resAppEnvPath = process.resourcesPath ? path.join(process.resourcesPath, "app", ".env") : rootEnvPath;
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(resEnvPath)) {
  dotenv.config({ path: resEnvPath });
} else if (fs.existsSync(resAppEnvPath)) {
  dotenv.config({ path: resAppEnvPath });
} else {
  dotenv.config();
}


if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://neondb_owner:npg_3HinZIBNpVh8@ep-autumn-field-az8v0i43.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
}

process.env.NODE_ENV = "production";
process.env.PORT = process.env.PORT || "3000";
process.env.HOSTNAME = "localhost";

let PORT = parseInt(process.env.PORT, 10) || 3000;
let HOST = process.env.HOSTNAME || "localhost";
let APP_URL = `http://${HOST}:${PORT}`;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let internalHttpServer = null;
let serverProcess = null;

try {
  const os = require("os");
  os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
} catch (e) {}

function getProjectDir() {
  // 1. If packaged via electron-builder — standalone is in extraResources
  if (app && app.isPackaged) {
    const standaloneInRes = path.join(process.resourcesPath, "standalone");
    if (fs.existsSync(path.join(standaloneInRes, "server.js"))) {
      return standaloneInRes;
    }
    const resApp = path.join(process.resourcesPath, "app");
    if (fs.existsSync(path.join(resApp, ".next"))) {
      return resApp;
    }
    const appPath = app.getAppPath();
    if (fs.existsSync(path.join(appPath, ".next"))) {
      return appPath;
    }
  }

  // 2. Relative to __dirname (dev mode)
  const appDir = path.resolve(__dirname, "..");
  if (fs.existsSync(path.join(appDir, ".next"))) {
    return appDir;
  }

  // 3. Fallback to process.cwd()
  if (fs.existsSync(path.join(process.cwd(), ".next"))) {
    return process.cwd();
  }

  return appDir;
}

function checkServerReady(url = APP_URL) {
  return new Promise((resolve) => {
    try {
      const targetUrl = url.endsWith("/api/health") ? url : `${url}/api/health`;
      const req = http.get(targetUrl, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(800, () => {
        req.destroy();
        resolve(false);
      });
    } catch (e) {
      resolve(false);
    }
  });
}

async function waitForServerReady(url = APP_URL, maxTries = 35, delayMs = 250) {
  for (let i = 0; i < maxTries; i++) {
    const ready = await checkServerReady(url);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function logDebug(msg, err) {
  const logLine = `[${new Date().toISOString()}] ${msg} ${err ? (err.stack || err.message || err) : ""}\n`;
  try {
    const logPath = path.join(process.env.USERPROFILE || "C:\\Users\\naveen", "drivevault_debug.log");
    fs.appendFileSync(logPath, logLine);
  } catch (e) {}
  console.log(msg, err || "");
}

async function ensureServerRunning() {
  logDebug("[DriveVault] Starting ensureServerRunning...");

  // 1. Check if server is already running on our designated port
  const isReady = await checkServerReady(APP_URL);
  if (isReady) {
    logDebug(`[DriveVault] Server already active on ${APP_URL}`);
    return;
  }

  const projectDir = getProjectDir();
  logDebug("[DriveVault] projectDir resolved to: " + projectDir);
  try {
    process.chdir(projectDir);
  } catch (e) {
    logDebug("[DriveVault] chdir error:", e);
  }

  // 2. Method A: Try Standalone Server if available
  // In packaged mode, projectDir IS the standalone dir (extraResources/standalone/)
  // In dev mode, it's at .next/standalone/server.js
  const standaloneDirectServer = path.join(projectDir, "server.js");
  const standaloneNestedServer = path.join(projectDir, ".next", "standalone", "server.js");
  const standaloneServer = fs.existsSync(standaloneDirectServer) ? standaloneDirectServer : standaloneNestedServer;

  if (fs.existsSync(standaloneServer)) {
    try {
      logDebug("[DriveVault] Launching Next.js standalone server: " + standaloneServer);
      const { spawn } = require("child_process");
      const standaloneDir = path.dirname(standaloneServer);

      const nodeModulesDir = path.join(standaloneDir, "node_modules");
      const envForChild = {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: HOST,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_PATH: nodeModulesDir,
      };
      const envFilePaths = [
        path.join(process.resourcesPath || "", ".env"),
        path.join(standaloneDir, ".env"),
        rootEnvPath
      ];
      for (const ef of envFilePaths) {
        if (fs.existsSync(ef)) {
          try {
            const lines = fs.readFileSync(ef, "utf8").split("\n");
            for (const line of lines) {
              const match = line.match(/^([^#=]+)=(.*)$/);
              if (match) envForChild[match[1].trim()] = match[2].trim();
            }
          } catch (e) {}
          break;
        }
      }

      serverProcess = spawn(
        process.execPath,
        [standaloneServer],
        {
          cwd: standaloneDir,
          env: envForChild,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        }
      );
      serverProcess.stdout?.on("data", (d) => logDebug("[server] " + d.toString().trim()));
      serverProcess.stderr?.on("data", (d) => logDebug("[server:err] " + d.toString().trim()));
      serverProcess.on("error", (err) => logDebug("[DriveVault] server process error:", err));
      serverProcess.on("exit", (code) => logDebug("[DriveVault] server process exited with code: " + code));

      const ready = await waitForServerReady(APP_URL, 40, 350);
      if (ready) {
        logDebug(`[DriveVault] Standalone server active on ${APP_URL}`);
        return;
      } else {
        logDebug("[DriveVault] Standalone server did not become ready in time");
      }
    } catch (err) {
      logDebug("[DriveVault] Standalone server launch failed:", err);
    }
  } else {
    logDebug("[DriveVault] No standalone server found at " + standaloneDirectServer + " or " + standaloneNestedServer);
  }

  // 3. Method B: Built-in in-process Next.js Server
  try {
    const nextPkg = path.join(projectDir, "node_modules", "next");
    logDebug("[DriveVault] Loading next module from: " + nextPkg);
    const next = require(nextPkg);
    logDebug("[DriveVault] Initializing nextApp instance...");
    const nextApp = next({ dev: false, dir: projectDir, hostname: HOST, port: PORT });
    const handle = nextApp.getRequestHandler();

    logDebug("[DriveVault] Calling nextApp.prepare()...");
    await nextApp.prepare();
    logDebug("[DriveVault] nextApp.prepare() completed successfully!");

    internalHttpServer = http.createServer((req, res) => handle(req, res));
    await new Promise((resolve) => internalHttpServer.listen(PORT, HOST, resolve));
    logDebug(`[DriveVault] In-process Next.js server listening on ${APP_URL}`);
    return;
  } catch (err) {
    logDebug("In-process Next server failed, attempting spawn using Electron engine:", err);
  }

  // 4. Method C: Spawn using Next CLI binary
  try {
    const nextBin = path.join(projectDir, "node_modules", "next", "dist", "bin", "next");
    if (fs.existsSync(nextBin)) {
      const { spawn } = require("child_process");
      serverProcess = spawn(
        process.execPath,
        [nextBin, "start", "-p", String(PORT), "-H", HOST],
        {
          cwd: projectDir,
          env: { ...process.env, NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1" },
          stdio: "ignore",
          windowsHide: true,
        }
      );

      const started = await waitForServerReady(APP_URL, 30, 250);
      if (started) {
        logDebug(`[DriveVault] Dedicated Next process started on ${APP_URL}`);
        return;
      }
    }
  } catch (e) {
    logDebug("Spawn fallback error:", e);
  }

  await waitForServerReady(APP_URL, 25, 250);
}

function createMainWindow() {
  const iconFile = path.join(__dirname, "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: "DriveVault — Your PC is protected",
    icon: fs.existsSync(iconFile) ? iconFile : undefined,
    backgroundColor: "#060911",
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  try {
    mainWindow.webContents.session.clearCache();
  } catch (e) {}

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on("did-fail-load", () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(APP_URL);
      }
    }, 600);
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

function createTray() {
  try {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open DriveVault",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: "separator" },
      {
        label: "Pause Uploads",
        click: () => {
          http
            .request(
              `${APP_URL}/api/engine`,
              { method: "POST", headers: { "Content-Type": "application/json" } },
              () => {}
            )
            .end(JSON.stringify({ action: "pause" }));
        },
      },
      {
        label: "Resume Uploads",
        click: () => {
          http
            .request(
              `${APP_URL}/api/engine`,
              { method: "POST", headers: { "Content-Type": "application/json" } },
              () => {}
            )
            .end(JSON.stringify({ action: "resume" }));
        },
      },
      { type: "separator" },
      {
        label: "Quit DriveVault",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    const trayPng = path.join(__dirname, "tray-icon.png");
    const icoIcon = path.join(__dirname, "icon.ico");
    let iconImg = null;

    if (fs.existsSync(trayPng)) {
      iconImg = nativeImage.createFromPath(trayPng);
    } else if (fs.existsSync(icoIcon)) {
      iconImg = nativeImage.createFromPath(icoIcon);
    }

    if (iconImg && !iconImg.isEmpty()) {
      tray = new Tray(iconImg);
      tray.setToolTip("DriveVault — Live Auto-Backup");
      tray.setContextMenu(contextMenu);
      tray.on("double-click", () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    }
  } catch (err) {
    console.error("Tray error (non-fatal):", err);
  }
}

ipcMain.on("app:minimize", () => mainWindow && mainWindow.minimize());
ipcMain.on("app:maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.on("app:close", () => mainWindow && mainWindow.close());

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await ensureServerRunning();
    } catch (err) {
      console.error("Error in ensureServerRunning:", err);
    }
    createMainWindow();
    createTray();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (internalHttpServer) {
      try {
        internalHttpServer.close();
      } catch (e) {}
    }
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch (e) {}
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
