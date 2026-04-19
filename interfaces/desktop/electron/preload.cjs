const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openhwp", {
  getEngineStatus: () => ipcRenderer.invoke("engine:getStatus"),
  openDocument: () => ipcRenderer.invoke("document:open"),
  openDocumentPath: (filePath) => ipcRenderer.invoke("document:openPath", filePath),
  getRecentDocuments: () => ipcRenderer.invoke("document:getRecent"),
  saveDocument: (documentState) => ipcRenderer.invoke("document:save", documentState),
  saveDocumentAs: (documentState) => ipcRenderer.invoke("document:saveAs", documentState)
});
