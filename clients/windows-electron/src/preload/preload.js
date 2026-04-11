const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  platform: "windows-electron",
});
