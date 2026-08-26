import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./ipc";

/**
 * Secure bridge: the renderer runs with contextIsolation + sandbox enabled and
 * nodeIntegration disabled. Only these explicitly typed channels are exposed,
 * and no token or credential ever crosses this boundary.
 */
const api = {
  state: () => ipcRenderer.invoke(IPC.appState),
  auth: {
    connect: () => ipcRenderer.invoke(IPC.authConnect),
    disconnect: () => ipcRenderer.invoke(IPC.authDisconnect),
  },
  folders: {
    list: () => ipcRenderer.invoke(IPC.appState),
    add: (payload: { path: string; isMedalPreset?: boolean }) => ipcRenderer.invoke(IPC.folderAdd, payload),
    remove: (id: number) => ipcRenderer.invoke(IPC.folderRemove, id),
    update: (id: number, changes: Record<string, unknown>) => ipcRenderer.invoke(IPC.folderUpdate, { id, changes }),
    test: (id: number) => ipcRenderer.invoke(IPC.folderTest, id),
    scan: (id: number) => ipcRenderer.invoke(IPC.folderScan, id),
    detectMedal: () => ipcRenderer.invoke(IPC.folderDetectMedal),
    pickFolder: () => ipcRenderer.invoke(IPC.folderPick),
  },
  queue: {
    action: (action: string, ids?: number[]) => ipcRenderer.invoke(IPC.queueAction, { action, ids }),
  },
  cleanup: {
    list: () => ipcRenderer.invoke(IPC.cleanupList),
    remove: (payload: { paths?: string[]; all?: boolean; confirm: boolean }) =>
      ipcRenderer.invoke(IPC.cleanupDelete, payload),
  },
  protectedFiles: {
    list: () => ipcRenderer.invoke(IPC.protectedList),
    add: (payload: { path: string; kind?: string }) => ipcRenderer.invoke(IPC.protectedAdd, payload),
    remove: (id: number) => ipcRenderer.invoke(IPC.protectedRemove, id),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  },
  drive: {
    folders: () => ipcRenderer.invoke(IPC.driveFolders),
    setDestination: (payload: { folderId?: string; folderName?: string }) =>
      ipcRenderer.invoke(IPC.driveSetDestination, payload),
  },
  logs: {
    list: (page: number, kind: string) => ipcRenderer.invoke(IPC.logsList, { page, kind }),
    export: () => ipcRenderer.invoke(IPC.logsExport),
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    hideToTray: () => ipcRenderer.send(IPC.windowHide),
  },
  app: {
    quit: () => ipcRenderer.send(IPC.appQuit),
    onTrayAction: (handler: (action: string) => void) => {
      const listener = (_event: unknown, action: string) => handler(action);
      ipcRenderer.on(IPC.trayAction, listener);
      return () => ipcRenderer.removeListener(IPC.trayAction, listener);
    },
    onStateChanged: (handler: () => void) => {
      const listener = () => handler();
      ipcRenderer.on("state:changed", listener);
      return () => ipcRenderer.removeListener("state:changed", listener);
    },
  },
};

contextBridge.exposeInMainWorld("drivevault", api);

export type DriveVaultApi = typeof api;
