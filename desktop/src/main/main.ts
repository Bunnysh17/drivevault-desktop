import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, dialog, shell, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { IPC } from "./ipc";
import { getDb } from "./database";
import { startEngine, stopEngine, engineCommand, getSnapshot } from "./engine";

/**
 * DriveVault main process.
 * Security posture: contextIsolation on, nodeIntegration off, sandbox on,
 * all filesystem/network/credential work happens here — never in the renderer.
 */

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let allowClose = false;

const DEV_RENDERER = process.env.DRIVEVAULT_RENDERER_URL ?? "http://localhost:3000";

function readSettingBool(key: string, fallback: boolean): boolean {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined;
    if (!row) return fallback;
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    return typeof parsed[key] === "boolean" ? (parsed[key] as boolean) : fallback;
  } catch {
    return fallback;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: !readSettingBool("launchMinimized", false),
    backgroundColor: "#05070d",
    title: "DriveVault",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  const rendererPath = path.join(__dirname, "..", "renderer", "index.html");
  if (fs.existsSync(rendererPath)) {
    void mainWindow.loadFile(rendererPath);
  } else {
    void mainWindow.loadURL(DEV_RENDERER);
  }

  mainWindow.on("close", (event) => {
    if (!allowClose && readSettingBool("minimizeToTray", true)) {
      event.preventDefault();
      mainWindow?.hide();
      notify("DriveVault is still running", "Backups continue in the background.");
      return;
    }
    void stopEngine();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

export function notify(title: string, body: string) {
  if (!readSettingBool("notifications", true)) return;
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "..", "build", "tray.png");
  const image = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(image.isEmpty() ? nativeImage.createFromDataURL(TRAY_FALLBACK) : image);
  tray.setToolTip("DriveVault — PC backup");
  refreshTrayMenu();
  tray.on("double-click", () => showWindow());
}

function refreshTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: "Open DriveVault", click: () => showWindow() },
    { type: "separator" },
    { label: "Pause uploads", click: () => void engineCommand("pause") },
    { label: "Resume uploads", click: () => void engineCommand("resume") },
    {
      label: "Upload queue",
      click: () => {
        showWindow();
        mainWindow?.webContents.send("navigate", "/uploads");
      },
    },
    {
      label: "Settings",
      click: () => {
        showWindow();
        mainWindow?.webContents.send("navigate", "/settings");
      },
    },
    { type: "separator" },
    {
      label: "Exit",
      click: () => {
        allowClose = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function showWindow() {
  if (!mainWindow) createWindow();
  mainWindow?.show();
  mainWindow?.focus();
}

const TRAY_FALLBACK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJ0lEQVR42mNkYPhfz0BLwEhrC0atGjVq1KhRo0aNGjVq1KhR4y0sAF2hCwH1Jv0uAAAAAElFTkSuQmCC";

function registerIpc() {
  const handle = <T>(channel: string, handler: (payload?: T) => unknown) => {
    ipcMain.handle(channel, async (_event, payload: T) => {
      try {
        return { ok: true, data: await handler(payload) };
      } catch (err) {
        // Human-readable errors only — never a raw stack trace to the UI.
        return { ok: false, error: (err as Error).message?.slice(0, 300) ?? "Unexpected error." };
      }
    });
  };

  handle(IPC.appState, () => getSnapshot());
  handle(IPC.authConnect, () => engineCommand("auth:connect"));
  handle(IPC.authDisconnect, () => engineCommand("auth:disconnect"));
  handle<{ path: string; isMedalPreset?: boolean }>(IPC.folderAdd, (p) => engineCommand("folder:add", p));
  handle<number>(IPC.folderRemove, (id) => engineCommand("folder:remove", { id }));
  handle(IPC.folderUpdate, (p) => engineCommand("folder:update", p));
  handle<number>(IPC.folderTest, (id) => engineCommand("folder:test", { id }));
  handle<number>(IPC.folderScan, (id) => engineCommand("folder:scan", { id }));
  handle(IPC.folderDetectMedal, () => engineCommand("folder:detect-medal"));
  handle(IPC.folderPick, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });
  handle(IPC.queueAction, (p) => engineCommand("queue:action", p));
  handle(IPC.cleanupList, () => engineCommand("cleanup:list"));
  handle(IPC.cleanupDelete, (p) => engineCommand("cleanup:delete", p));
  handle(IPC.protectedList, () => engineCommand("protected:list"));
  handle(IPC.protectedAdd, (p) => engineCommand("protected:add", p));
  handle<number>(IPC.protectedRemove, (id) => engineCommand("protected:remove", { id }));
  handle(IPC.settingsGet, () => engineCommand("settings:get"));
  handle(IPC.settingsUpdate, (patch) => engineCommand("settings:update", patch));
  handle(IPC.driveFolders, () => engineCommand("drive:folders"));
  handle(IPC.driveSetDestination, (p) => engineCommand("drive:set-destination", p));
  handle(IPC.logsList, (p) => engineCommand("logs:list", p));
  handle(IPC.logsExport, async () => {
    const file = await dialog.showSaveDialog(mainWindow!, { defaultPath: "drivevault-logs.tsv" });
    if (file.canceled || !file.filePath) return null;
    const content = (await engineCommand("logs:export")) as string;
    fs.writeFileSync(file.filePath, content);
    shell.showItemInFolder(file.filePath);
    return file.filePath;
  });

  ipcMain.on(IPC.windowMinimize, () => mainWindow?.minimize());
  ipcMain.on(IPC.windowHide, () => mainWindow?.hide());
  ipcMain.on(IPC.appQuit, () => {
    allowClose = true;
    app.quit();
  });
}

app.on("ready", () => {
  getDb();
  registerIpc();
  createWindow();
  createTray();
  void startEngine({
    onNotify: notify,
    onStateChanged: () => {
      mainWindow?.webContents.send("state:changed");
      refreshTrayMenu();
    },
    rendererUrl: DEV_RENDERER,
  });

  // Auto launch with Windows.
  app.setLoginItemSettings({
    openAtLogin: readSettingBool("startWithWindows", false),
    args: ["--startup"],
  });
});

app.on("window-all-closed", (event: Event) => {
  if (process.platform === "win32") event.preventDefault();
});

app.on("before-quit", () => {
  allowClose = true;
  void stopEngine();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

export { mainWindow };
