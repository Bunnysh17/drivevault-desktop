const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("drivevault", {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send("app:minimize"),
  maximize: () => ipcRenderer.send("app:maximize"),
  close: () => ipcRenderer.send("app:close"),
  tray: (action) => ipcRenderer.send("app:tray", action),
});
