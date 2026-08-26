/**
 * Shared IPC contract between the Electron main process and the renderer.
 * The renderer never gets Node access: everything goes through these channels
 * and every payload is validated in `validate.ts`.
 */
export const IPC = {
  appState: "app:state",
  authConnect: "auth:connect",
  authDisconnect: "auth:disconnect",
  folderAdd: "folder:add",
  folderRemove: "folder:remove",
  folderUpdate: "folder:update",
  folderTest: "folder:test",
  folderScan: "folder:scan",
  folderDetectMedal: "folder:detect-medal",
  folderPick: "dialog:pick-folder",
  queueAction: "queue:action",
  cleanupList: "cleanup:list",
  cleanupDelete: "cleanup:delete",
  protectedList: "protected:list",
  protectedAdd: "protected:add",
  protectedRemove: "protected:remove",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  driveFolders: "drive:folders",
  driveSetDestination: "drive:set-destination",
  logsList: "logs:list",
  logsExport: "logs:export",
  windowMinimize: "window:minimize",
  windowHide: "window:hide",
  appQuit: "app:quit",
  trayAction: "tray:action",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
