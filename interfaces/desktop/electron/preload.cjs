const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openhwp", {
  getEngineStatus: () => ipcRenderer.invoke("engine:getStatus"),
  pickDocumentPath: () => ipcRenderer.invoke("dialog:pickDocumentPath"),
  pickOutputHwpxPath: (currentDoc) =>
    ipcRenderer.invoke("dialog:pickOutputHwpxPath", currentDoc ?? null),
  pickSessionJsonPath: (currentDoc) =>
    ipcRenderer.invoke("dialog:pickSessionJsonPath", currentDoc ?? null),
  engineInfo: (inputPath) => ipcRenderer.invoke("engine:info", inputPath),
  engineText: (inputPath) => ipcRenderer.invoke("engine:text", inputPath),
  engineConvert: (inputPath, outputPath) =>
    ipcRenderer.invoke("engine:convert", inputPath, outputPath),
  engineWorkbenchExport: (inputPath, outputJsonPath) =>
    ipcRenderer.invoke("engine:workbenchExport", inputPath, outputJsonPath),
  engineWorkbenchApply: (inputPath, sessionJsonPath, outputPath) =>
    ipcRenderer.invoke(
      "engine:workbenchApply",
      inputPath,
      sessionJsonPath,
      outputPath
    )
});
